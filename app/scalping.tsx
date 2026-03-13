import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";
import { apiRequest } from "@/lib/query-client";

const SCALP_ACCENT = "#FBBF24";
const SCALP_BG_ACCENT = "#FBBF2415";

interface ScalpingSignal {
  id: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  currentSL: number;
  tp1: number;
  tp2: number;
  confidence: number;
  timeframe: "M1" | "M5";
  summary: string;
  status: "active" | "hit_tp1" | "hit_tp2" | "hit_sl" | "hit_tp1_then_sl" | "expired";
  pipResult: number;
  beActive: boolean;
  expiresAt: string;
  createdAt: string;
  closedAt: string | null;
}

interface ScalpingStats {
  total: number;
  active: number;
  closed: number;
  wins: number;
  winRate: number;
  totalPips: number;
  avgPips: number;
}

interface RadarData {
  price: number;
  updatedAt: string;
  m1: { ema9: number; ema21: number; rsi: number; atr: number; dir: "BUY" | "SELL" | "HOLD" };
  m5: { ema9: number; ema21: number; rsi: number; atr: number; dir: "BUY" | "SELL" | "HOLD" };
  blockReason: string;
  nextCheckIn: number;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

function getCountdown(expiresAt: string, createdAt: string): { text: string; percent: number; expired: boolean; urgent: boolean; warning: boolean } {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return { text: "Scaduto", percent: 0, expired: true, urgent: false, warning: false };
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const text = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  const totalDuration = new Date(expiresAt).getTime() - new Date(createdAt).getTime();
  const percent = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
  return { text, percent, expired: false, urgent: remaining <= 5 * 60000, warning: remaining > 5 * 60000 && remaining <= 15 * 60000 };
}

function PulsingGoldDot() {
  const scale = useSharedValue(1);
  React.useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.6, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SCALP_ACCENT,
    transform: [{ scale: scale.value }],
    opacity: scale.value > 1.3 ? 0.5 : 1,
  }));
  return <Animated.View style={style} />;
}

function ScalpingCard({ signal, index, livePrice }: { signal: ScalpingSignal; index: number; livePrice?: number }) {
  const { colors: C } = useTheme();
  const isBuy = signal.action === "BUY";
  const actionColor = isBuy ? C.buy : C.sell;
  const countdown = getCountdown(signal.expiresAt, signal.createdAt);
  const isActive = signal.status === "active" || signal.status === "hit_tp1";

  const borderPulse = useSharedValue(0);
  React.useEffect(() => {
    if (!isActive) return;
    borderPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [isActive]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    borderColor: isActive
      ? `rgba(251, 191, 36, ${0.3 + borderPulse.value * 0.5})`
      : C.border,
  }));

  const pressScale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const livePnl = useMemo(() => {
    if (!livePrice || !isActive) return null;
    const diff = isBuy ? livePrice - signal.entryPrice : signal.entryPrice - livePrice;
    const pips = parseFloat((diff / 0.1).toFixed(1));
    return { pips, isPositive: pips >= 0 };
  }, [livePrice, signal.entryPrice, signal.action, isActive]);

  const statusConfig = useMemo(() => {
    switch (signal.status) {
      case "active": return { label: "ATTIVO", color: SCALP_ACCENT, icon: "radio-button-on" as const };
      case "hit_tp1": return { label: "TP1 OK", color: C.buy, icon: "checkmark-circle" as const };
      case "hit_tp2": return { label: "TP2 OK", color: C.buy, icon: "checkmark-done-circle" as const };
      case "hit_tp1_then_sl": return { label: "TP1+BE", color: C.buy, icon: "checkmark-circle" as const };
      case "hit_sl": return { label: "SL", color: C.sell, icon: "close-circle" as const };
      case "expired": return { label: "SCADUTO", color: C.textMuted, icon: "time" as const };
      default: return { label: signal.status, color: C.textMuted, icon: "help-circle" as const };
    }
  }, [signal.status, C]);

  const [, forceUpdate] = React.useState(0);
  React.useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  const currentCountdown = isActive ? getCountdown(signal.expiresAt) : countdown;

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).springify()} style={pressStyle}>
      <Pressable
        onPressIn={() => { pressScale.value = withSpring(0.97); }}
        onPressOut={() => { pressScale.value = withSpring(1); }}
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      >
        <Animated.View style={[styles.card, { backgroundColor: C.backgroundCard }, cardAnimStyle]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardPairRow}>
              <Ionicons name="diamond-outline" size={18} color={SCALP_ACCENT} />
              <Text style={[styles.pairText, { color: C.text }]}>XAU/USD</Text>
              <View style={[styles.tfBadge, { backgroundColor: SCALP_BG_ACCENT }]}>
                <Text style={[styles.tfText, { color: SCALP_ACCENT }]}>{signal.timeframe}</Text>
              </View>
              {signal.beActive && (
                <View style={[styles.beBadge, { backgroundColor: C.buy + "15" }]}>
                  <Text style={[styles.beText, { color: C.buy }]}>BE</Text>
                </View>
              )}
            </View>
            <View style={[styles.actionBadge, { backgroundColor: actionColor + "20", borderColor: actionColor + "50" }]}>
              <Ionicons name={isBuy ? "arrow-up" : "arrow-down"} size={16} color={actionColor} />
              <Text style={[styles.actionText, { color: actionColor }]}>{signal.action}</Text>
            </View>
          </View>

          <View style={styles.confRow}>
            <View style={[styles.confCircle, { borderColor: SCALP_ACCENT }]}>
              <Text style={[styles.confValue, { color: SCALP_ACCENT }]}>{signal.confidence}</Text>
              <Text style={[styles.confUnit, { color: SCALP_ACCENT }]}>%</Text>
            </View>
            <View style={styles.confInfo}>
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + "15" }]}>
                <Ionicons name={statusConfig.icon} size={12} color={statusConfig.color} />
                <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
              </View>
              {livePnl && (
                <View style={[styles.pnlBadge, { backgroundColor: livePnl.isPositive ? C.buy + "12" : C.sell + "12" }]}>
                  <Ionicons name={livePnl.isPositive ? "trending-up" : "trending-down"} size={12} color={livePnl.isPositive ? C.buy : C.sell} />
                  <Text style={[styles.pnlText, { color: livePnl.isPositive ? C.buy : C.sell }]}>
                    {livePnl.isPositive ? "+" : ""}{livePnl.pips} pip
                  </Text>
                </View>
              )}
              {!isActive && signal.pipResult !== 0 && (
                <View style={[styles.pnlBadge, { backgroundColor: signal.pipResult >= 0 ? C.buy + "12" : C.sell + "12" }]}>
                  <Text style={[styles.pnlText, { color: signal.pipResult >= 0 ? C.buy : C.sell }]}>
                    {signal.pipResult >= 0 ? "+" : ""}{signal.pipResult} pip
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.priceGrid, { backgroundColor: C.backgroundElevated }]}>
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: C.textMuted }]}>Entry</Text>
              <Text style={[styles.priceCellValue, { color: C.text }]}>{signal.entryPrice.toFixed(2)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: C.border }]} />
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: signal.beActive ? "#FFB347" : C.textMuted }]}>
                {signal.beActive ? "SL (BE)" : "SL"}
              </Text>
              <Text style={[styles.priceCellValue, { color: C.sell }]}>{signal.currentSL.toFixed(2)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: C.border }]} />
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: signal.status === "hit_tp1" || signal.status === "hit_tp2" ? C.buy : C.textMuted }]}>TP1</Text>
              <Text style={[styles.priceCellValue, { color: C.buy }]}>{signal.tp1.toFixed(2)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: C.border }]} />
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: signal.status === "hit_tp2" ? C.buy : C.textMuted }]}>TP2</Text>
              <Text style={[styles.priceCellValue, { color: C.buy }]}>{signal.tp2.toFixed(2)}</Text>
            </View>
          </View>

          {livePrice && isActive && (
            <View style={[styles.livePriceRow, { backgroundColor: C.accent + "08", borderColor: C.accent + "20" }]}>
              <Text style={[styles.livePriceLabel, { color: C.textMuted }]}>Prezzo live</Text>
              <Text style={[styles.livePriceValue, { color: C.text }]}>${livePrice.toFixed(2)}</Text>
            </View>
          )}

          {isActive && (() => {
            const timerColor = currentCountdown.urgent ? C.sell : currentCountdown.warning ? "#FFB347" : SCALP_ACCENT;
            const timerBg = currentCountdown.urgent ? C.sell + "10" : currentCountdown.warning ? "#FFB34715" : SCALP_BG_ACCENT;
            const timerBorder = currentCountdown.urgent ? C.sell + "30" : currentCountdown.warning ? "#FFB34730" : SCALP_ACCENT + "20";
            return (
              <View style={[styles.countdownRow, { backgroundColor: timerBg, borderColor: timerBorder }]}>
                <Ionicons name="timer-outline" size={14} color={timerColor} />
                <Text style={[styles.countdownLabel, { color: C.textSecondary }]}>Scadenza</Text>
                <View style={{ flex: 1 }} />
                <Text style={[styles.countdownValue, { color: timerColor }]}>
                  {currentCountdown.text}
                </Text>
                <View style={[styles.countdownBar, { backgroundColor: C.backgroundElevated }]}>
                  <View style={[styles.countdownFill, {
                    width: `${currentCountdown.percent}%` as any,
                    backgroundColor: timerColor,
                  }]} />
                </View>
              </View>
            );
          })()}

          <View style={styles.timestampRow}>
            <Ionicons name="time-outline" size={11} color={C.textMuted} />
            <Text style={[styles.timestampText, { color: C.textMuted }]}>
              {formatDateTime(signal.createdAt)}
            </Text>
            {signal.closedAt && !isActive && (
              <>
                <Text style={[styles.timestampText, { color: C.textMuted }]}>{" \u2192 "}</Text>
                <Text style={[styles.timestampText, { color: C.textMuted }]}>
                  {formatDateTime(signal.closedAt)}
                </Text>
              </>
            )}
          </View>

          <Text style={[styles.summaryText, { color: C.textSecondary }]} numberOfLines={2}>{signal.summary}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function RadarPanel({ radar, xauPrice }: { radar: RadarData; xauPrice?: number }) {
  const { colors: C } = useTheme();
  const [countdown, setCountdown] = React.useState(radar.nextCheckIn);

  React.useEffect(() => {
    setCountdown(radar.nextCheckIn);
    const iv = setInterval(() => setCountdown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(iv);
  }, [radar.nextCheckIn]);

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;
  const countdownText = `${mins}:${String(secs).padStart(2, "0")}`;

  const renderTfRow = (label: string, tf: RadarData["m1"]) => {
    const emaBull = tf.ema9 > tf.ema21;
    const dirColor = tf.dir === "BUY" ? C.buy : tf.dir === "SELL" ? C.sell : C.textMuted;
    const rsiColor = tf.rsi > 70 ? C.sell : tf.rsi < 30 ? C.sell : tf.rsi > 55 ? C.buy : tf.rsi < 45 ? C.sell : C.textMuted;
    const rsiPercent = Math.min(100, Math.max(0, tf.rsi));
    return (
      <View style={radarStyles.tfRow}>
        <Text style={[radarStyles.tfLabel, { color: SCALP_ACCENT }]}>{label}</Text>
        <View style={radarStyles.tfIndicators}>
          <View style={radarStyles.emaSection}>
            <Text style={[radarStyles.emaText, { color: C.textSecondary }]}>
              {emaBull ? "EMA9 > EMA21" : "EMA9 < EMA21"}
            </Text>
            <Ionicons name={emaBull ? "arrow-up" : "arrow-down"} size={12} color={emaBull ? C.buy : C.sell} />
          </View>
          <View style={radarStyles.rsiSection}>
            <Text style={[radarStyles.rsiLabel, { color: C.textSecondary }]}>RSI</Text>
            <View style={[radarStyles.rsiBar, { backgroundColor: C.background }]}>
              <View style={[radarStyles.rsiFill, { width: `${rsiPercent}%` as any, backgroundColor: rsiColor }]} />
            </View>
            <Text style={[radarStyles.rsiValue, { color: rsiColor }]}>{tf.rsi.toFixed(0)}</Text>
          </View>
          <View style={[radarStyles.dirBadge, { backgroundColor: dirColor + "15" }]}>
            <Text style={[radarStyles.dirText, { color: dirColor }]}>{tf.dir}</Text>
          </View>
        </View>
      </View>
    );
  };

  const atrOk = radar.m5.atr > 0.5;
  const atrPercent = Math.min(100, (radar.m5.atr / 3) * 100);
  const blockColor = radar.blockReason.includes("arrivo") ? C.buy : radar.blockReason.includes("divergenza") || radar.blockReason.includes("rischioso") ? C.sell : "#FFB347";

  return (
    <View style={[radarStyles.container, { backgroundColor: C.backgroundCard, borderColor: SCALP_ACCENT + "30" }]}>
      <View style={radarStyles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="radio-outline" size={16} color={SCALP_ACCENT} />
          <Text style={[radarStyles.title, { color: SCALP_ACCENT }]}>RADAR XAU/USD</Text>
        </View>
        <Text style={[radarStyles.price, { color: C.text }]}>
          ${(xauPrice ?? radar.price).toFixed(2)}
        </Text>
      </View>

      {renderTfRow("M1", radar.m1)}
      {renderTfRow("M5", radar.m5)}

      <View style={radarStyles.atrRow}>
        <Text style={[radarStyles.atrLabel, { color: C.textSecondary }]}>ATR</Text>
        <View style={[radarStyles.atrBar, { backgroundColor: C.background }]}>
          <View style={[radarStyles.atrFill, { width: `${atrPercent}%` as any, backgroundColor: atrOk ? C.buy : C.textMuted }]} />
        </View>
        <Text style={[radarStyles.atrValue, { color: atrOk ? C.buy : C.textMuted }]}>{radar.m5.atr.toFixed(2)}</Text>
        <View style={[radarStyles.atrStatus, { backgroundColor: (atrOk ? C.buy : C.textMuted) + "15" }]}>
          <Text style={[radarStyles.atrStatusText, { color: atrOk ? C.buy : C.textMuted }]}>{atrOk ? "OK" : "Basso"}</Text>
        </View>
      </View>

      <View style={[radarStyles.statusRow, { backgroundColor: blockColor + "10", borderColor: blockColor + "25" }]}>
        <Ionicons name="information-circle-outline" size={14} color={blockColor} />
        <Text style={[radarStyles.statusText, { color: blockColor }]}>{radar.blockReason}</Text>
      </View>

      <View style={radarStyles.countdownRow}>
        <Ionicons name="timer-outline" size={13} color={C.textMuted} />
        <Text style={[radarStyles.countdownLabel, { color: C.textMuted }]}>Prossima verifica:</Text>
        <Text style={[radarStyles.countdownValue, { color: SCALP_ACCENT }]}>{countdownText}</Text>
      </View>
    </View>
  );
}

const radarStyles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10, marginTop: 8 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  price: { fontSize: 18, fontFamily: "Inter_700Bold" },
  tfRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  tfLabel: { fontSize: 12, fontFamily: "Inter_700Bold", width: 24 },
  tfIndicators: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  emaSection: { flexDirection: "row", alignItems: "center", gap: 3 },
  emaText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  rsiSection: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  rsiLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  rsiBar: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" as const },
  rsiFill: { height: "100%", borderRadius: 2 },
  rsiValue: { fontSize: 11, fontFamily: "Inter_600SemiBold", width: 22, textAlign: "right" as const },
  dirBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  dirText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  atrRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  atrLabel: { fontSize: 11, fontFamily: "Inter_500Medium", width: 28 },
  atrBar: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" as const },
  atrFill: { height: "100%", borderRadius: 2 },
  atrValue: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  atrStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  atrStatusText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  statusText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "center" },
  countdownLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  countdownValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
});

export default function ScalpingScreen() {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [tab, setTab] = React.useState<"active" | "history">("active");

  const { data: activeSignals = [], isLoading: loadingActive } = useQuery<ScalpingSignal[]>({
    queryKey: ["/api/scalping/signals"],
    refetchInterval: 1000,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery<ScalpingSignal[]>({
    queryKey: ["/api/scalping/history"],
    refetchInterval: 5000,
    staleTime: 0,
  });

  const prevActiveIds = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const currentIds = new Set(activeSignals.map((s) => s.id));
    const hadSignals = prevActiveIds.current.size > 0;
    const signalClosed = hadSignals && [...prevActiveIds.current].some((id) => !currentIds.has(id));
    if (signalClosed) {
      queryClient.invalidateQueries({ queryKey: ["/api/scalping/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scalping/stats"] });
    }
    prevActiveIds.current = currentIds;
  }, [activeSignals, queryClient]);

  const { data: stats } = useQuery<ScalpingStats>({
    queryKey: ["/api/scalping/stats"],
    refetchInterval: 30000,
  });

  const { data: xauQuotes = [] } = useQuery<{ pair: string; price: number; change: number }[]>({
    queryKey: ["/api/quotes?market=commodities"],
    refetchInterval: 15000,
  });

  const xauPrice = useMemo(() => {
    const q = xauQuotes.find((q: any) => q.pair === "XAU/USD");
    return q?.price;
  }, [xauQuotes]);

  const { data: radarData } = useQuery<RadarData | null>({
    queryKey: ["/api/scalping/radar"],
    refetchInterval: 30000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scalping/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scalping/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scalping/stats"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/scalping/signals"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/scalping/history"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/scalping/stats"] }),
    ]);
    setIsRefreshing(false);
  }, [queryClient]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const displayData = tab === "active" ? activeSignals : history;

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={styles.headerTitleRow}>
        <View>
          <Text style={[styles.headerTitle, { color: C.text }]}>Scalping XAU/USD</Text>
          <Text style={[styles.headerSubtitle, { color: C.textSecondary }]}>Segnali rapidi M1/M5 sull'Oro</Text>
        </View>
        <View style={[styles.goldBadge, { backgroundColor: SCALP_BG_ACCENT, borderColor: SCALP_ACCENT + "40" }]}>
          <Ionicons name="diamond" size={14} color={SCALP_ACCENT} />
          <Text style={[styles.goldCount, { color: SCALP_ACCENT }]}>{activeSignals.filter(s => s.status === "active" || s.status === "hit_tp1").length}</Text>
        </View>
      </View>

      {xauPrice && (
        <View style={[styles.liveBar, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
          <PulsingGoldDot />
          <View style={[styles.liveBadge, { backgroundColor: C.buy + "20" }]}>
            <Text style={[styles.liveBadgeText, { color: C.buy }]}>LIVE</Text>
          </View>
          <Text style={[styles.liveBarLabel, { color: C.textMuted }]}>XAU/USD</Text>
          <Text style={[styles.liveBarPrice, { color: C.text }]}>${xauPrice.toFixed(2)}</Text>
        </View>
      )}

      {stats && stats.closed > 0 && (
        <View style={[styles.statsCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
          <View style={styles.statsRow}>
            <View style={styles.statsItem}>
              <Text style={[styles.statsValue, { color: SCALP_ACCENT }]}>{stats.winRate}%</Text>
              <Text style={[styles.statsLabel, { color: C.textMuted }]}>Win Rate</Text>
            </View>
            <View style={[styles.statsDivider, { backgroundColor: C.border }]} />
            <View style={styles.statsItem}>
              <Text style={[styles.statsValue, { color: stats.totalPips >= 0 ? C.buy : C.sell }]}>
                {stats.totalPips >= 0 ? "+" : ""}{stats.totalPips}
              </Text>
              <Text style={[styles.statsLabel, { color: C.textMuted }]}>Pips</Text>
            </View>
            <View style={[styles.statsDivider, { backgroundColor: C.border }]} />
            <View style={styles.statsItem}>
              <Text style={[styles.statsValue, { color: C.text }]}>{stats.closed}</Text>
              <Text style={[styles.statsLabel, { color: C.textMuted }]}>Chiusi</Text>
            </View>
            <View style={[styles.statsDivider, { backgroundColor: C.border }]} />
            <View style={styles.statsItem}>
              <Text style={[styles.statsValue, { color: C.text }]}>{stats.avgPips}</Text>
              <Text style={[styles.statsLabel, { color: C.textMuted }]}>Media</Text>
            </View>
          </View>
        </View>
      )}

      <View style={[styles.criteriaCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
        <Text style={[styles.criteriaTitle, { color: C.textSecondary }]}>Parametri Scalping</Text>
        <View style={styles.criteriaRow}>
          <View style={[styles.criteriaItem, { backgroundColor: C.backgroundElevated }]}>
            <Ionicons name="shield-checkmark" size={14} color={SCALP_ACCENT} />
            <Text style={[styles.criteriaValue, { color: C.text }]}>82%+</Text>
            <Text style={[styles.criteriaLabel, { color: C.textMuted }]}>Min. Conf.</Text>
          </View>
          <View style={[styles.criteriaItem, { backgroundColor: C.backgroundElevated }]}>
            <Ionicons name="timer" size={14} color={SCALP_ACCENT} />
            <Text style={[styles.criteriaValue, { color: C.text }]}>20-35m</Text>
            <Text style={[styles.criteriaLabel, { color: C.textMuted }]}>Scadenza</Text>
          </View>
          <View style={[styles.criteriaItem, { backgroundColor: C.backgroundElevated }]}>
            <Ionicons name="layers" size={14} color={SCALP_ACCENT} />
            <Text style={[styles.criteriaValue, { color: C.text }]}>Max 3</Text>
            <Text style={[styles.criteriaLabel, { color: C.textMuted }]}>Attivi</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          onPress={() => { setTab("active"); Haptics.selectionAsync(); }}
          style={[styles.tabBtn, tab === "active" && { backgroundColor: SCALP_BG_ACCENT, borderColor: SCALP_ACCENT + "40" }]}
        >
          <Text style={[styles.tabText, { color: tab === "active" ? SCALP_ACCENT : C.textMuted }]}>Attivi ({activeSignals.filter(s => s.status === "active" || s.status === "hit_tp1").length})</Text>
        </Pressable>
        <Pressable
          onPress={() => { setTab("history"); Haptics.selectionAsync(); }}
          style={[styles.tabBtn, tab === "history" && { backgroundColor: SCALP_BG_ACCENT, borderColor: SCALP_ACCENT + "40" }]}
        >
          <Text style={[styles.tabText, { color: tab === "history" ? SCALP_ACCENT : C.textMuted }]}>Storico</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            generateMutation.mutate();
          }}
          disabled={generateMutation.isPending}
          style={[styles.generateBtn, { backgroundColor: SCALP_ACCENT + "20", borderColor: SCALP_ACCENT + "50", opacity: generateMutation.isPending ? 0.6 : 1 }]}
        >
          {generateMutation.isPending ? (
            <ActivityIndicator size="small" color={SCALP_ACCENT} />
          ) : (
            <>
              <Ionicons name="flash" size={14} color={SCALP_ACCENT} />
              <Text style={[styles.generateText, { color: SCALP_ACCENT }]}>Genera</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={displayData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        renderItem={({ item, index }) => (
          <ScalpingCard signal={item} index={index} livePrice={xauPrice} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {(loadingActive || loadingHistory) ? (
              <ActivityIndicator size="large" color={SCALP_ACCENT} />
            ) : (
              <>
                {tab === "active" && radarData ? (
                  <>
                    <RadarPanel radar={radarData} xauPrice={xauPrice} />
                    <Text style={[styles.emptySubtitle, { color: C.textSecondary, marginTop: 8 }]}>
                      I segnali scalping XAU/USD vengono generati automaticamente ogni 5 minuti durante le sessioni attive.
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="diamond-outline" size={48} color={SCALP_ACCENT} />
                    <Text style={[styles.emptyTitle, { color: C.text }]}>
                      {tab === "active" ? "Nessun segnale scalping attivo" : "Nessuno storico disponibile"}
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
                      {tab === "active"
                        ? "I segnali scalping XAU/USD vengono generati automaticamente ogni 5 minuti durante le sessioni attive."
                        : "I segnali chiusi appariranno qui."}
                    </Text>
                  </>
                )}
              </>
            )}
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 40 }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={SCALP_ACCENT} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerSection: { paddingTop: 16, gap: 12 },
  headerTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  goldBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  goldCount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  liveBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  liveBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  liveBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  liveBarLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  liveBarPrice: { fontSize: 18, fontFamily: "Inter_700Bold", marginLeft: "auto" },
  statsCard: { borderRadius: 12, borderWidth: 1, padding: 12 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statsItem: { flex: 1, alignItems: "center", gap: 2 },
  statsValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statsLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  statsDivider: { width: 1, height: 28, alignSelf: "center" },
  criteriaCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  criteriaTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  criteriaRow: { flexDirection: "row", gap: 8 },
  criteriaItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, gap: 4 },
  criteriaValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  criteriaLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  tabRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "transparent" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  generateBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  generateText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  card: { borderRadius: 16, borderWidth: 2, padding: 16, marginBottom: 12, marginTop: 8 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardPairRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pairText: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tfBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tfText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  beBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  beText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  actionBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  actionText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  confRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  confCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  confValue: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: -2 },
  confUnit: { fontSize: 9, fontFamily: "Inter_600SemiBold", marginTop: -4 },
  confInfo: { flex: 1, gap: 6 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  pnlBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
  pnlText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  priceGrid: { flexDirection: "row", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, marginBottom: 10 },
  priceCell: { flex: 1, alignItems: "center", gap: 2 },
  priceDivider: { width: 1, alignSelf: "stretch" as const },
  priceCellLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  priceCellValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  livePriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  livePriceLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  livePriceValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 10, flexWrap: "wrap" },
  countdownLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  countdownValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  countdownBar: { width: "100%", height: 4, borderRadius: 2, marginTop: 4, overflow: "hidden" },
  countdownFill: { height: "100%", borderRadius: 2 },
  timestampRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  timestampText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  summaryText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 14, paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
