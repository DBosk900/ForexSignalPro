import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeIn, withRepeat, withSequence } from "react-native-reanimated";
import Svg, { Polyline, Line, Text as SvgText, Defs, LinearGradient, Stop, Polygon, Circle, Rect } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

interface ReplayData {
  id: string;
  pair: string;
  action: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  closePrice: number;
  outcome: string;
  pipResult: number;
  confidence: number;
  strength: number;
  timeframe: string;
  createdAt: string;
  closedAt: string | null;
  pricePath: number[];
}

const SPEEDS = [1, 2, 5];

function getOutcomeLabel(outcome: string): string {
  if (outcome === "hit_tp3" || outcome === "hit_tp") return "TP3 Completo";
  if (outcome === "hit_tp2_then_sl") return "TP2 + Trail";
  if (outcome === "hit_tp1_then_sl") return "TP1 + B.E.";
  if (outcome === "hit_sl") return "SL Colpito";
  return "In Corso";
}

function isWinOutcome(outcome: string): boolean {
  return outcome === "hit_tp3" || outcome === "hit_tp" || outcome === "hit_tp2_then_sl" || outcome === "hit_tp1_then_sl";
}

export default function ReplayScreen() {
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: replay, isLoading, isError, refetch } = useQuery<ReplayData>({
    queryKey: ["/api/history", id, "replay"],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL(`/api/history/${id}/replay`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch replay");
      return res.json();
    },
    enabled: !!id,
    retry: 1,
  });

  const [visiblePoints, setVisiblePoints] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const startPlayback = useCallback(() => {
    if (!replay) return;
    if (isComplete) {
      setVisiblePoints(1);
      setIsComplete(false);
    }
    setIsPlaying(true);
  }, [replay, isComplete]);

  const pausePlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const resetPlayback = useCallback(() => {
    setIsPlaying(false);
    setVisiblePoints(1);
    setIsComplete(false);
  }, []);

  useEffect(() => {
    if (!isPlaying || !replay) return;

    const totalPoints = replay.pricePath.length;
    const speed = SPEEDS[speedIndex];
    const interval = Math.max(16, 50 / speed);

    timerRef.current = setInterval(() => {
      setVisiblePoints(prev => {
        if (prev >= totalPoints) {
          setIsPlaying(false);
          setIsComplete(true);
          if (timerRef.current) clearInterval(timerRef.current);
          return totalPoints;
        }
        return prev + 1;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, replay, speedIndex]);

  useEffect(() => {
    if (replay && !isPlaying && visiblePoints === 1) {
      const timeout = setTimeout(() => startPlayback(), 500);
      return () => clearTimeout(timeout);
    }
  }, [replay]);

  const cycleSpeed = useCallback(() => {
    setSpeedIndex(prev => (prev + 1) % SPEEDS.length);
  }, []);

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={themeColors.sell} />
          <Text style={[styles.loadingText, { color: themeColors.text, marginTop: 12, fontSize: 16 }]}>Segnale non trovato</Text>
          <Text style={[styles.loadingText, { color: themeColors.textSecondary, marginTop: 4 }]}>Impossibile caricare il replay per questo segnale.</Text>
          <Pressable
            onPress={() => refetch()}
            style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: themeColors.accent, borderRadius: 8 }}
          >
            <Text style={{ color: "#0A0E1A", fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Riprova</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading || !replay) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <Animated.View style={pulseStyle}>
            <Ionicons name="play-circle-outline" size={48} color={themeColors.accent} />
          </Animated.View>
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Caricamento replay...</Text>
        </View>
      </View>
    );
  }

  const isWin = isWinOutcome(replay.outcome);
  const pathColor = isWin ? themeColors.buy : themeColors.sell;
  const screenWidth = Dimensions.get("window").width - 32;
  const chartHeight = 300;
  const paddingLeft = 55;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 30;
  const chartW = screenWidth - paddingLeft - paddingRight;
  const chartH = chartHeight - paddingTop - paddingBottom;

  const visibleData = replay.pricePath.slice(0, visiblePoints);
  const allPrices = [...replay.pricePath, replay.sl, replay.tp1, replay.tp2, replay.tp3, replay.entry];
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceRange = maxPrice - minPrice || 1;

  const toY = (price: number) => paddingTop + (1 - (price - minPrice) / priceRange) * chartH;
  const toX = (index: number) => paddingLeft + (index / (replay.pricePath.length - 1)) * chartW;

  const pointsStr = visibleData.map((p, i) => `${toX(i)},${toY(p)}`).join(" ");
  const lastPoint = visibleData[visibleData.length - 1];
  const lastX = toX(visibleData.length - 1);
  const lastY = toY(lastPoint);
  const firstX = toX(0);
  const fillStr = pointsStr + ` ${lastX},${paddingTop + chartH} ${firstX},${paddingTop + chartH}`;

  const entryY = toY(replay.entry);
  const slY = toY(replay.sl);
  const tp1Y = toY(replay.tp1);
  const tp2Y = toY(replay.tp2);
  const tp3Y = toY(replay.tp3);

  const progress = visiblePoints / replay.pricePath.length;
  const decimals = replay.entry > 100 ? 2 : replay.entry > 10 ? 2 : replay.pair.includes("JPY") ? 3 : 4;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.pairText, { color: themeColors.text }]}>{replay.pair}</Text>
            <View style={styles.headerSubRow}>
              <View style={[styles.actionBadge, { backgroundColor: (replay.action === "BUY" ? themeColors.buy : themeColors.sell) + "20" }]}>
                <Text style={[styles.actionText, { color: replay.action === "BUY" ? themeColors.buy : themeColors.sell }]}>{replay.action}</Text>
              </View>
              <Text style={[styles.timeframeText, { color: themeColors.textMuted }]}>{replay.timeframe}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.outcomeBadge, { backgroundColor: (isWin ? themeColors.buy : themeColors.sell) + "15", borderColor: (isWin ? themeColors.buy : themeColors.sell) + "30" }]}>
              <Ionicons name={isWin ? "checkmark-circle" : "close-circle"} size={14} color={isWin ? themeColors.buy : themeColors.sell} />
              <Text style={[styles.outcomeText, { color: isWin ? themeColors.buy : themeColors.sell }]}>{getOutcomeLabel(replay.outcome)}</Text>
            </View>
            <Text style={[styles.pipsText, { color: isWin ? themeColors.buy : themeColors.sell }]}>
              {replay.pipResult >= 0 ? "+" : ""}{replay.pipResult.toFixed(1)} pips
            </Text>
          </View>
        </View>

        <View style={[styles.chartContainer, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
          <Svg width={screenWidth} height={chartHeight}>
            <Defs>
              <LinearGradient id="replayFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={pathColor} stopOpacity="0.2" />
                <Stop offset="1" stopColor={pathColor} stopOpacity="0.01" />
              </LinearGradient>
            </Defs>

            <Line x1={paddingLeft} y1={slY} x2={screenWidth - paddingRight} y2={slY} stroke={themeColors.sell} strokeWidth="1" strokeDasharray="6,4" strokeOpacity={0.7} />
            <Rect x={paddingLeft} y={slY - 1} width={screenWidth - paddingLeft - paddingRight} height={2} fill={themeColors.sell} fillOpacity={0.08} />
            <SvgText x={paddingLeft - 4} y={slY + 3} fontSize="9" fill={themeColors.sell} textAnchor="end" fontFamily="Inter_500Medium">SL</SvgText>
            <SvgText x={screenWidth - paddingRight + 2} y={slY + 3} fontSize="8" fill={themeColors.sell} textAnchor="start" fontFamily="Inter_400Regular">{replay.sl.toFixed(decimals)}</SvgText>

            <Line x1={paddingLeft} y1={entryY} x2={screenWidth - paddingRight} y2={entryY} stroke={themeColors.textMuted} strokeWidth="1" strokeDasharray="4,4" strokeOpacity={0.5} />
            <SvgText x={paddingLeft - 4} y={entryY + 3} fontSize="9" fill={themeColors.textMuted} textAnchor="end" fontFamily="Inter_500Medium">Entry</SvgText>

            <Line x1={paddingLeft} y1={tp1Y} x2={screenWidth - paddingRight} y2={tp1Y} stroke="#86EFAC" strokeWidth="1" strokeDasharray="6,4" strokeOpacity={0.6} />
            <SvgText x={paddingLeft - 4} y={tp1Y + 3} fontSize="9" fill="#86EFAC" textAnchor="end" fontFamily="Inter_500Medium">TP1</SvgText>

            <Line x1={paddingLeft} y1={tp2Y} x2={screenWidth - paddingRight} y2={tp2Y} stroke="#22C55E" strokeWidth="1" strokeDasharray="6,4" strokeOpacity={0.6} />
            <SvgText x={paddingLeft - 4} y={tp2Y + 3} fontSize="9" fill="#22C55E" textAnchor="end" fontFamily="Inter_500Medium">TP2</SvgText>

            <Line x1={paddingLeft} y1={tp3Y} x2={screenWidth - paddingRight} y2={tp3Y} stroke="#FFB800" strokeWidth="1" strokeDasharray="6,4" strokeOpacity={0.6} />
            <SvgText x={paddingLeft - 4} y={tp3Y + 3} fontSize="9" fill="#FFB800" textAnchor="end" fontFamily="Inter_500Medium">TP3</SvgText>

            {visibleData.length > 1 && (
              <>
                <Polygon points={fillStr} fill="url(#replayFill)" />
                <Polyline points={pointsStr} fill="none" stroke={pathColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}

            <Circle cx={toX(0)} cy={toY(replay.entry)} r={4} fill={themeColors.accent} stroke={themeColors.backgroundCard} strokeWidth="2" />

            {visibleData.length > 1 && (
              <Circle cx={lastX} cy={lastY} r={5} fill={pathColor} stroke={themeColors.backgroundCard} strokeWidth="2" />
            )}

            {isComplete && (
              <Circle cx={toX(replay.pricePath.length - 1)} cy={toY(replay.closePrice)} r={6} fill={isWin ? themeColors.buy : themeColors.sell} stroke="#FFFFFF" strokeWidth="2" />
            )}
          </Svg>
        </View>

        <View style={[styles.progressBarContainer, { backgroundColor: themeColors.backgroundElevated }]}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` as any, backgroundColor: pathColor }]} />
        </View>

        <View style={styles.livePrice}>
          <Text style={[styles.livePriceLabel, { color: themeColors.textMuted }]}>Prezzo attuale</Text>
          <Text style={[styles.livePriceValue, { color: themeColors.text }]}>{lastPoint.toFixed(decimals)}</Text>
        </View>

        <View style={styles.controlsRow}>
          <Pressable onPress={resetPlayback} style={[styles.controlBtn, { backgroundColor: themeColors.backgroundElevated }]}>
            <Ionicons name="refresh" size={22} color={themeColors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={isPlaying ? pausePlayback : startPlayback}
            style={[styles.playBtn, { backgroundColor: themeColors.accent + "20", borderColor: themeColors.accent + "40" }]}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={28} color={themeColors.accent} />
          </Pressable>

          <Pressable onPress={cycleSpeed} style={[styles.speedBtn, { backgroundColor: themeColors.backgroundElevated }]}>
            <Text style={[styles.speedText, { color: themeColors.accent }]}>{SPEEDS[speedIndex]}x</Text>
          </Pressable>
        </View>

        <View style={styles.levelsGrid}>
          <View style={[styles.levelCell, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.levelLabel, { color: themeColors.textMuted }]}>Entry</Text>
            <Text style={[styles.levelValue, { color: themeColors.text }]}>{replay.entry.toFixed(decimals)}</Text>
          </View>
          <View style={[styles.levelCell, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.levelLabel, { color: themeColors.sell }]}>SL</Text>
            <Text style={[styles.levelValue, { color: themeColors.sell }]}>{replay.sl.toFixed(decimals)}</Text>
          </View>
          <View style={[styles.levelCell, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.levelLabel, { color: "#86EFAC" }]}>TP1</Text>
            <Text style={[styles.levelValue, { color: "#86EFAC" }]}>{replay.tp1.toFixed(decimals)}</Text>
          </View>
          <View style={[styles.levelCell, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.levelLabel, { color: "#22C55E" }]}>TP2</Text>
            <Text style={[styles.levelValue, { color: "#22C55E" }]}>{replay.tp2.toFixed(decimals)}</Text>
          </View>
          <View style={[styles.levelCell, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.levelLabel, { color: "#FFB800" }]}>TP3</Text>
            <Text style={[styles.levelValue, { color: "#FFB800" }]}>{replay.tp3.toFixed(decimals)}</Text>
          </View>
          <View style={[styles.levelCell, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.levelLabel, { color: themeColors.textMuted }]}>Conf.</Text>
            <Text style={[styles.levelValue, { color: themeColors.accent }]}>{replay.confidence}%</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  headerRight: { alignItems: "flex-end", gap: 4 },
  pairText: { fontSize: 22, fontFamily: "Inter_700Bold" },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  timeframeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  outcomeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  outcomeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pipsText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  chartContainer: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 8 },
  progressBarContainer: { height: 3, borderRadius: 2, overflow: "hidden", marginBottom: 12 },
  progressBar: { height: "100%", borderRadius: 2 },
  livePrice: { alignItems: "center", marginBottom: 16 },
  livePriceLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  livePriceValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  controlsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 24, marginBottom: 20 },
  controlBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", borderWidth: 1.5 },
  speedBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  speedText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  levelsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  levelCell: { width: "31%" as any, borderRadius: 10, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center", gap: 2 },
  levelLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  levelValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
