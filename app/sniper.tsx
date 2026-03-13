import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

interface Timeframes {
  h1: "BUY" | "SELL" | "HOLD";
  h4: "BUY" | "SELL" | "HOLD";
  d1: "BUY" | "SELL" | "HOLD";
}

interface Signal {
  id: string;
  pair: string;
  base: string;
  quote: string;
  action: "BUY" | "SELL" | "HOLD";
  strength: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp1: number;
  tp2: number;
  tp3: number;
  currentSL: number;
  tpHit: number;
  timeframe: string;
  confidence: number;
  summary: string;
  timestamp: string;
  change24h: number;
  market?: "forex" | "commodities";
  timeframes?: Timeframes;
}

const SNIPER_ACCENT = "#FF6B35";
const SNIPER_BG = "#0A0E1A";
const EXPIRY_MS = 3 * 60 * 60 * 1000;

function isAligned(tf?: Timeframes): boolean {
  if (!tf) return false;
  return tf.h1 === tf.h4 && tf.h4 === tf.d1 && tf.h1 !== "HOLD";
}

function getCountdown(timestamp: string): { text: string; percent: number; expired: boolean } {
  const created = new Date(timestamp).getTime();
  const now = Date.now();
  const elapsed = now - created;
  const remaining = EXPIRY_MS - elapsed;
  if (remaining <= 0) return { text: "Scaduto", percent: 0, expired: true };
  const mins = Math.floor(remaining / 60000);
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  const text = hrs > 0 ? `${hrs}h ${m}m` : `${m}m`;
  const percent = Math.max(0, Math.min(100, (remaining / EXPIRY_MS) * 100));
  return { text, percent, expired: false };
}

function CrosshairIcon({ size = 48, color = SNIPER_ACCENT }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size * 0.65, height: size * 0.65, borderRadius: size * 0.325, borderWidth: 2, borderColor: color }} />
      <View style={{ position: "absolute", width: 2, height: size, backgroundColor: color }} />
      <View style={{ position: "absolute", width: size, height: 2, backgroundColor: color }} />
      <View style={{ position: "absolute", width: size * 0.15, height: size * 0.15, borderRadius: size * 0.075, backgroundColor: color }} />
    </View>
  );
}

function PulsingCrosshair() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);
  React.useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.15, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View style={animStyle}>
      <CrosshairIcon size={72} color={SNIPER_ACCENT} />
    </Animated.View>
  );
}

function SniperCard({ signal, index }: { signal: Signal; index: number }) {
  const { colors: C } = useTheme();
  const isBuy = signal.action === "BUY";
  const actionColor = isBuy ? C.buy : C.sell;
  const countdown = getCountdown(signal.timestamp);

  const borderPulse = useSharedValue(0);
  React.useEffect(() => {
    borderPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const cardAnimStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(255, 107, 53, ${0.3 + borderPulse.value * 0.5})`,
    shadowOpacity: 0.15 + borderPulse.value * 0.2,
  }));

  const pressScale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const ep = signal.entryPrice ?? 0;
  const priceDecimals = ep > 100 ? 2 : ep > 10 ? 2 : 4;

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()} style={pressStyle}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push({ pathname: "/signal/[id]", params: { id: signal.id, data: JSON.stringify(signal) } });
        }}
        onPressIn={() => { pressScale.value = withSpring(0.97); }}
        onPressOut={() => { pressScale.value = withSpring(1); }}
      >
        <Animated.View style={[styles.sniperCard, { backgroundColor: C.backgroundCard, shadowColor: SNIPER_ACCENT }, cardAnimStyle]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardPairRow}>
              <CrosshairIcon size={20} color={SNIPER_ACCENT} />
              <Text style={[styles.pairText, { color: C.text }]}>{signal.pair}</Text>
              <View style={[styles.marketBadge, { backgroundColor: signal.market === "commodities" ? "#FFB34715" : "#818CF815" }]}>
                <Text style={[styles.marketBadgeText, { color: signal.market === "commodities" ? "#FFB347" : "#818CF8" }]}>
                  {signal.market === "commodities" ? "COMMODITY" : "FOREX"}
                </Text>
              </View>
            </View>
            <View style={[styles.actionBadge, { backgroundColor: actionColor + "20", borderColor: actionColor + "50" }]}>
              <Ionicons name={isBuy ? "arrow-up" : "arrow-down"} size={16} color={actionColor} />
              <Text style={[styles.actionText, { color: actionColor }]}>{signal.action}</Text>
            </View>
          </View>

          <View style={styles.confidenceSection}>
            <View style={[styles.confidenceCircle, { borderColor: SNIPER_ACCENT }]}>
              <Text style={[styles.confidenceValue, { color: SNIPER_ACCENT }]}>{signal.confidence}</Text>
              <Text style={[styles.confidenceUnit, { color: SNIPER_ACCENT }]}>%</Text>
            </View>
            <View style={styles.confidenceInfo}>
              <Text style={[styles.confidenceLabel, { color: C.textSecondary }]}>Confidenza</Text>
              <View style={[styles.strengthBarOuter, { backgroundColor: C.backgroundElevated }]}>
                <View style={[styles.strengthBarInner, { width: `${signal.strength}%` as any, backgroundColor: SNIPER_ACCENT }]} />
              </View>
              <Text style={[styles.strengthText, { color: C.textMuted }]}>Forza: {signal.strength}%</Text>
            </View>
          </View>

          <View style={styles.convergenceRow}>
            <Text style={[styles.convergenceTitle, { color: C.textSecondary }]}>Convergenza Timeframe</Text>
            <View style={styles.tfRow}>
              {(["h1", "h4", "d1"] as const).map((tf) => {
                const dir = signal.timeframes?.[tf] ?? "HOLD";
                const tfColor = dir === "BUY" ? C.buy : dir === "SELL" ? C.sell : C.hold;
                return (
                  <View key={tf} style={[styles.tfChip, { backgroundColor: tfColor + "15", borderColor: tfColor + "40" }]}>
                    <Text style={[styles.tfLabel, { color: C.textMuted }]}>{tf.toUpperCase()}</Text>
                    <Ionicons
                      name={dir === "BUY" ? "arrow-up" : dir === "SELL" ? "arrow-down" : "remove"}
                      size={12}
                      color={tfColor}
                    />
                    <Text style={[styles.tfDir, { color: tfColor }]}>{dir}</Text>
                  </View>
                );
              })}
              <View style={[styles.alignedBadge, { backgroundColor: SNIPER_ACCENT + "20", borderColor: SNIPER_ACCENT + "40" }]}>
                <Ionicons name="checkmark-done" size={12} color={SNIPER_ACCENT} />
                <Text style={[styles.alignedText, { color: SNIPER_ACCENT }]}>Allineati</Text>
              </View>
            </View>
          </View>

          <View style={[styles.priceGrid, { backgroundColor: C.backgroundElevated }]}>
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: C.textMuted }]}>Entrata</Text>
              <Text style={[styles.priceCellValue, { color: C.text }]}>{signal.entryPrice.toFixed(priceDecimals)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: C.border }]} />
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: C.textMuted }]}>SL</Text>
              <Text style={[styles.priceCellValue, { color: C.sell }]}>{(signal.currentSL ?? signal.stopLoss).toFixed(priceDecimals)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: C.border }]} />
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: C.textMuted }]}>TP1</Text>
              <Text style={[styles.priceCellValue, { color: C.buy }]}>{signal.tp1.toFixed(priceDecimals)}</Text>
            </View>
            <View style={[styles.priceDivider, { backgroundColor: C.border }]} />
            <View style={styles.priceCell}>
              <Text style={[styles.priceCellLabel, { color: C.textMuted }]}>TP3</Text>
              <Text style={[styles.priceCellValue, { color: C.buy }]}>{signal.tp3.toFixed(priceDecimals)}</Text>
            </View>
          </View>

          <View style={[styles.countdownRow, { backgroundColor: countdown.expired ? C.sell + "10" : SNIPER_ACCENT + "08", borderColor: countdown.expired ? C.sell + "30" : SNIPER_ACCENT + "20" }]}>
            <Ionicons name="timer-outline" size={14} color={countdown.expired ? C.sell : SNIPER_ACCENT} />
            <Text style={[styles.countdownLabel, { color: C.textSecondary }]}>Tempo per entrare</Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.countdownValue, { color: countdown.expired ? C.sell : SNIPER_ACCENT }]}>{countdown.text}</Text>
            <View style={[styles.countdownBar, { backgroundColor: C.backgroundElevated }]}>
              <View style={[styles.countdownFill, { width: `${countdown.percent}%` as any, backgroundColor: countdown.expired ? C.sell : SNIPER_ACCENT }]} />
            </View>
          </View>

          <Text style={[styles.summaryText, { color: C.textSecondary }]} numberOfLines={2}>{signal.summary}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function SniperScreen() {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const { data: forexSignals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
    refetchInterval: 15000,
  });

  const { data: commoditySignals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/commodities/signals"],
    refetchInterval: 15000,
  });

  const sniperSignals = useMemo(() => {
    const all = [
      ...forexSignals.map(s => ({ ...s, market: "forex" as const })),
      ...commoditySignals.map(s => ({ ...s, market: "commodities" as const })),
    ];
    return all.filter(s => {
      if (s.action === "HOLD") return false;
      if (s.confidence < 85) return false;
      if (s.strength < 80) return false;
      if (!isAligned(s.timeframes)) return false;
      const elapsed = Date.now() - new Date(s.timestamp).getTime();
      if (elapsed > EXPIRY_MS) return false;
      return true;
    }).sort((a, b) => b.confidence - a.confidence);
  }, [forexSignals, commoditySignals]);

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/commodities/signals"] }),
    ]);
    setIsRefreshing(false);
  }, [queryClient]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={styles.headerTitleRow}>
        <View>
          <Text style={[styles.headerTitle, { color: C.text }]}>Modalita Sniper</Text>
          <Text style={[styles.headerSubtitle, { color: C.textSecondary }]}>Solo segnali ad alta precisione</Text>
        </View>
        <View style={[styles.sniperBadge, { backgroundColor: SNIPER_ACCENT + "15", borderColor: SNIPER_ACCENT + "40" }]}>
          <CrosshairIcon size={16} color={SNIPER_ACCENT} />
          <Text style={[styles.sniperCount, { color: SNIPER_ACCENT }]}>{sniperSignals.length}</Text>
        </View>
      </View>

      <View style={[styles.criteriaCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
        <Text style={[styles.criteriaTitle, { color: C.textSecondary }]}>Criteri Sniper</Text>
        <View style={styles.criteriaRow}>
          <View style={[styles.criteriaItem, { backgroundColor: C.backgroundElevated }]}>
            <Ionicons name="shield-checkmark" size={14} color={SNIPER_ACCENT} />
            <Text style={[styles.criteriaValue, { color: C.text }]}>85%+</Text>
            <Text style={[styles.criteriaLabel, { color: C.textMuted }]}>Confidenza</Text>
          </View>
          <View style={[styles.criteriaItem, { backgroundColor: C.backgroundElevated }]}>
            <Ionicons name="fitness" size={14} color={SNIPER_ACCENT} />
            <Text style={[styles.criteriaValue, { color: C.text }]}>80%+</Text>
            <Text style={[styles.criteriaLabel, { color: C.textMuted }]}>Forza</Text>
          </View>
          <View style={[styles.criteriaItem, { backgroundColor: C.backgroundElevated }]}>
            <Ionicons name="git-merge" size={14} color={SNIPER_ACCENT} />
            <Text style={[styles.criteriaValue, { color: C.text }]}>3/3</Text>
            <Text style={[styles.criteriaLabel, { color: C.textMuted }]}>TF Allineati</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {sniperSignals.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <PulsingCrosshair />
              <Text style={[styles.emptyTitle, { color: C.text }]}>Nessun segnale sniper al momento</Text>
              <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
                I segnali sniper richiedono confidenza 85%+, forza 80%+ e tutti i timeframe allineati. Controlla piu tardi.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={SNIPER_ACCENT} />
          }
          contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset + 40 }}
        />
      ) : (
        <FlatList
          data={sniperSignals}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          renderItem={({ item, index }) => <SniperCard signal={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 40 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={SNIPER_ACCENT} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerSection: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },
  headerTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sniperBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
  sniperCount: { fontSize: 16, fontFamily: "Inter_700Bold" },
  criteriaCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  criteriaTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  criteriaRow: { flexDirection: "row", gap: 8 },
  criteriaItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, gap: 4 },
  criteriaValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  criteriaLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  sniperCard: { borderRadius: 16, borderWidth: 2, padding: 16, marginBottom: 14, marginTop: 10, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  cardPairRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pairText: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  marketBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  marketBadgeText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  actionBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  actionText: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  confidenceSection: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 14 },
  confidenceCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  confidenceValue: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: -2 },
  confidenceUnit: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginTop: -4 },
  confidenceInfo: { flex: 1, gap: 6 },
  confidenceLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  strengthBarOuter: { height: 6, borderRadius: 3, overflow: "hidden" },
  strengthBarInner: { height: "100%", borderRadius: 3 },
  strengthText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  convergenceRow: { marginBottom: 14, gap: 8 },
  convergenceTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  tfRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tfChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  tfLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  tfDir: { fontSize: 10, fontFamily: "Inter_700Bold" },
  alignedBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  alignedText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  priceGrid: { flexDirection: "row", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, marginBottom: 12 },
  priceCell: { flex: 1, alignItems: "center", gap: 2 },
  priceDivider: { width: 1, alignSelf: "stretch" as const },
  priceCellLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  priceCellValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 10, flexWrap: "wrap" },
  countdownLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  countdownValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  countdownBar: { width: "100%", height: 4, borderRadius: 2, marginTop: 4, overflow: "hidden" },
  countdownFill: { height: "100%", borderRadius: 2 },
  summaryText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 16, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
