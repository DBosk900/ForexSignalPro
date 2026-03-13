import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Svg, { Polygon, Line, Circle, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

interface Signal {
  id: string;
  pair: string;
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
  timeframes?: {
    h1: "BUY" | "SELL" | "HOLD";
    h4: "BUY" | "SELL" | "HOLD";
    d1: "BUY" | "SELL" | "HOLD";
  };
}

function calcRiskReward(s: Signal): number {
  const risk = Math.abs(s.entryPrice - s.stopLoss);
  if (risk === 0) return 0;
  const reward = Math.abs(s.tp3 - s.entryPrice);
  return parseFloat((reward / risk).toFixed(2));
}

function countTfAlignment(s: Signal): number {
  if (!s.timeframes) return 0;
  const dir = s.action;
  let count = 0;
  if (s.timeframes.h1 === dir) count++;
  if (s.timeframes.h4 === dir) count++;
  if (s.timeframes.d1 === dir) count++;
  return count;
}

function calcPriceDistance(s: Signal): number {
  if (s.entryPrice === 0) return 0;
  const tp3dist = Math.abs(s.tp3 - s.entryPrice) / s.entryPrice * 100;
  return parseFloat(tp3dist.toFixed(2));
}

interface Scores {
  confidence: number;
  strength: number;
  rr: number;
  tfAlignment: number;
  priceDistance: number;
  total: number;
}

function calcScores(s: Signal): Scores {
  const rr = calcRiskReward(s);
  const tfAlignment = countTfAlignment(s);
  const priceDistance = calcPriceDistance(s);

  const confNorm = s.confidence / 100;
  const strNorm = s.strength / 100;
  const rrNorm = Math.min(rr / 5, 1);
  const tfNorm = tfAlignment / 3;
  const pdNorm = Math.min(priceDistance / 3, 1);

  const total = confNorm * 0.30 + strNorm * 0.25 + rrNorm * 0.20 + tfNorm * 0.15 + pdNorm * 0.10;

  return {
    confidence: confNorm,
    strength: strNorm,
    rr: rrNorm,
    tfAlignment: tfNorm,
    priceDistance: pdNorm,
    total,
  };
}

function RadarChart({ scores1, scores2, colors }: { scores1: Scores; scores2: Scores; colors: any }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;
  const axes = [
    { key: "confidence", label: "Conf." },
    { key: "strength", label: "Forza" },
    { key: "rr", label: "R:R" },
    { key: "tfAlignment", label: "TF" },
    { key: "priceDistance", label: "Dist." },
  ] as const;

  const angleStep = (2 * Math.PI) / axes.length;
  const startAngle = -Math.PI / 2;

  function getPoint(value: number, i: number): [number, number] {
    const angle = startAngle + i * angleStep;
    const r = value * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const points1 = axes.map((a, i) => getPoint(scores1[a.key], i));
  const points2 = axes.map((a, i) => getPoint(scores2[a.key], i));

  const polygon1 = points1.map(p => p.join(",")).join(" ");
  const polygon2 = points2.map(p => p.join(",")).join(" ");

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((level) => {
        const pts = axes.map((_, i) => getPoint(level, i));
        return (
          <Polygon
            key={level}
            points={pts.map(p => p.join(",")).join(" ")}
            fill="none"
            stroke={colors.border}
            strokeWidth={0.5}
          />
        );
      })}

      {axes.map((_, i) => {
        const [ex, ey] = getPoint(1, i);
        return (
          <Line key={i} x1={cx} y1={cy} x2={ex} y2={ey} stroke={colors.border} strokeWidth={0.5} />
        );
      })}

      <Polygon points={polygon1} fill="#00D4AA30" stroke="#00D4AA" strokeWidth={2} />
      <Polygon points={polygon2} fill="#818CF830" stroke="#818CF8" strokeWidth={2} />

      {points1.map(([px, py], i) => (
        <Circle key={`c1-${i}`} cx={px} cy={py} r={3} fill="#00D4AA" />
      ))}
      {points2.map(([px, py], i) => (
        <Circle key={`c2-${i}`} cx={px} cy={py} r={3} fill="#818CF8" />
      ))}

      {axes.map((a, i) => {
        const [lx, ly] = getPoint(1.22, i);
        return (
          <SvgText
            key={`label-${i}`}
            x={lx}
            y={ly}
            fill={colors.textSecondary}
            fontSize={10}
            fontFamily="Inter_500Medium"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {a.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

function MetricRow({ label, val1, val2, format, colors, higherIsBetter = true }: {
  label: string;
  val1: number;
  val2: number;
  format?: (v: number) => string;
  colors: any;
  higherIsBetter?: boolean;
}) {
  const fmt = format || ((v: number) => v.toString());
  const better1 = higherIsBetter ? val1 > val2 : val1 < val2;
  const better2 = higherIsBetter ? val2 > val1 : val2 < val1;
  const equal = val1 === val2;
  const maxVal = Math.max(val1, val2, 0.01);
  const bar1 = val1 / maxVal;
  const bar2 = val2 / maxVal;

  return (
    <View style={s.metricRow}>
      <Text style={[s.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={s.metricBars}>
        <View style={s.metricBarLeft}>
          <Text style={[s.metricVal, { color: better1 && !equal ? "#00D4AA" : colors.text }]}>{fmt(val1)}</Text>
          <View style={s.barContainerLeft}>
            <View
              style={[s.barFillLeft, {
                width: `${bar1 * 100}%` as any,
                backgroundColor: better1 && !equal ? "#00D4AA" : colors.border,
              }]}
            />
          </View>
        </View>
        <View style={[s.metricDivider, { backgroundColor: colors.border }]} />
        <View style={s.metricBarRight}>
          <View style={s.barContainerRight}>
            <View
              style={[s.barFillRight, {
                width: `${bar2 * 100}%` as any,
                backgroundColor: better2 && !equal ? "#818CF8" : colors.border,
              }]}
            />
          </View>
          <Text style={[s.metricVal, { color: better2 && !equal ? "#818CF8" : colors.text }]}>{fmt(val2)}</Text>
        </View>
      </View>
    </View>
  );
}

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const params = useLocalSearchParams<{ signal1: string; signal2: string }>();

  const signal1: Signal | null = useMemo(() => {
    try { return JSON.parse(params.signal1 || ""); } catch { return null; }
  }, [params.signal1]);

  const signal2: Signal | null = useMemo(() => {
    try { return JSON.parse(params.signal2 || ""); } catch { return null; }
  }, [params.signal2]);

  if (!signal1 || !signal2) {
    return (
      <View style={[s.container, { backgroundColor: C.background }]}>
        <View style={s.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
          <Text style={[s.errorText, { color: C.text }]}>Dati segnali non disponibili</Text>
          <Pressable onPress={() => router.back()} style={[s.backBtn, { backgroundColor: C.accent + "20" }]}>
            <Ionicons name="arrow-back" size={16} color={C.accent} />
            <Text style={[s.backBtnText, { color: C.accent }]}>Torna indietro</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const scores1 = calcScores(signal1);
  const scores2 = calcScores(signal2);
  const rr1 = calcRiskReward(signal1);
  const rr2 = calcRiskReward(signal2);
  const tf1 = countTfAlignment(signal1);
  const tf2 = countTfAlignment(signal2);

  const winner = scores1.total > scores2.total ? 1 : scores1.total < scores2.total ? 2 : 0;
  const winnerSignal = winner === 1 ? signal1 : winner === 2 ? signal2 : null;
  const scoreDiff = Math.abs(scores1.total - scores2.total);
  const verdictStrength = scoreDiff > 0.15 ? "Netto" : scoreDiff > 0.05 ? "Leggero" : "Marginale";

  const ep1 = signal1.entryPrice ?? 0;
  const ep2 = signal2.entryPrice ?? 0;
  const pd1 = ep1 > 100 ? 2 : ep1 > 10 ? 2 : 4;
  const pd2 = ep2 > 100 ? 2 : ep2 > 10 ? 2 : 4;

  const actionColor1 = signal1.action === "BUY" ? C.buy : signal1.action === "SELL" ? C.sell : C.hold;
  const actionColor2 = signal2.action === "BUY" ? C.buy : signal2.action === "SELL" ? C.sell : C.hold;

  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[s.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerPairs}>
          <View style={[s.pairCard, { backgroundColor: C.backgroundCard, borderColor: "#00D4AA40" }]}>
            <View style={[s.pairBadge, { backgroundColor: actionColor1 + "15" }]}>
              <Ionicons
                name={signal1.action === "BUY" ? "arrow-up" : signal1.action === "SELL" ? "arrow-down" : "remove"}
                size={12}
                color={actionColor1}
              />
              <Text style={[s.pairBadgeText, { color: actionColor1 }]}>{signal1.action}</Text>
            </View>
            <Text style={[s.pairName, { color: C.text }]}>{signal1.pair}</Text>
            <Text style={[s.pairTimeframe, { color: C.textMuted }]}>{signal1.timeframe}</Text>
            {winner === 1 && (
              <View style={[s.winnerTag, { backgroundColor: "#00D4AA20" }]}>
                <Ionicons name="trophy" size={10} color="#00D4AA" />
              </View>
            )}
          </View>

          <View style={[s.vsCircle, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
            <Text style={[s.vsText, { color: C.textMuted }]}>VS</Text>
          </View>

          <View style={[s.pairCard, { backgroundColor: C.backgroundCard, borderColor: "#818CF840" }]}>
            <View style={[s.pairBadge, { backgroundColor: actionColor2 + "15" }]}>
              <Ionicons
                name={signal2.action === "BUY" ? "arrow-up" : signal2.action === "SELL" ? "arrow-down" : "remove"}
                size={12}
                color={actionColor2}
              />
              <Text style={[s.pairBadgeText, { color: actionColor2 }]}>{signal2.action}</Text>
            </View>
            <Text style={[s.pairName, { color: C.text }]}>{signal2.pair}</Text>
            <Text style={[s.pairTimeframe, { color: C.textMuted }]}>{signal2.timeframe}</Text>
            {winner === 2 && (
              <View style={[s.winnerTag, { backgroundColor: "#818CF820" }]}>
                <Ionicons name="trophy" size={10} color="#818CF8" />
              </View>
            )}
          </View>
        </View>

        <View style={[s.legendRow]}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#00D4AA" }]} />
            <Text style={[s.legendText, { color: C.textSecondary }]}>{signal1.pair}</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: "#818CF8" }]} />
            <Text style={[s.legendText, { color: C.textSecondary }]}>{signal2.pair}</Text>
          </View>
        </View>

        <View style={[s.radarCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
          <Text style={[s.sectionTitle, { color: C.text }]}>Radar Confronto</Text>
          <View style={s.radarCenter}>
            <RadarChart scores1={scores1} scores2={scores2} colors={C} />
          </View>
        </View>

        <View style={[s.metricsCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
          <Text style={[s.sectionTitle, { color: C.text }]}>Metriche a Confronto</Text>

          <MetricRow label="Confidenza" val1={signal1.confidence} val2={signal2.confidence} format={v => `${v}%`} colors={C} />
          <MetricRow label="Forza" val1={signal1.strength} val2={signal2.strength} format={v => `${v}%`} colors={C} />
          <MetricRow label="Risk:Reward" val1={rr1} val2={rr2} format={v => `1:${v}`} colors={C} />
          <MetricRow label="TF Allineati" val1={tf1} val2={tf2} format={v => `${v}/3`} colors={C} />
          <MetricRow label="Var. 24h" val1={Math.abs(signal1.change24h ?? 0)} val2={Math.abs(signal2.change24h ?? 0)} format={v => `${v.toFixed(2)}%`} colors={C} />
        </View>

        <View style={[s.pricesCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
          <Text style={[s.sectionTitle, { color: C.text }]}>Livelli di Prezzo</Text>

          <View style={s.priceCompareRow}>
            <Text style={[s.priceCompareLabel, { color: C.textMuted }]}>Entrata</Text>
            <Text style={[s.priceCompareVal, { color: "#00D4AA" }]}>{signal1.entryPrice.toFixed(pd1)}</Text>
            <Text style={[s.priceCompareVal, { color: "#818CF8" }]}>{signal2.entryPrice.toFixed(pd2)}</Text>
          </View>
          <View style={s.priceCompareRow}>
            <Text style={[s.priceCompareLabel, { color: C.textMuted }]}>Stop Loss</Text>
            <Text style={[s.priceCompareVal, { color: "#00D4AA" }]}>{(signal1.currentSL ?? signal1.stopLoss).toFixed(pd1)}</Text>
            <Text style={[s.priceCompareVal, { color: "#818CF8" }]}>{(signal2.currentSL ?? signal2.stopLoss).toFixed(pd2)}</Text>
          </View>
          <View style={s.priceCompareRow}>
            <Text style={[s.priceCompareLabel, { color: C.textMuted }]}>TP1</Text>
            <Text style={[s.priceCompareVal, { color: "#00D4AA" }]}>{(signal1.tp1 ?? signal1.takeProfit).toFixed(pd1)}</Text>
            <Text style={[s.priceCompareVal, { color: "#818CF8" }]}>{(signal2.tp1 ?? signal2.takeProfit).toFixed(pd2)}</Text>
          </View>
          <View style={s.priceCompareRow}>
            <Text style={[s.priceCompareLabel, { color: C.textMuted }]}>TP2</Text>
            <Text style={[s.priceCompareVal, { color: "#00D4AA" }]}>{(signal1.tp2 ?? signal1.takeProfit).toFixed(pd1)}</Text>
            <Text style={[s.priceCompareVal, { color: "#818CF8" }]}>{(signal2.tp2 ?? signal2.takeProfit).toFixed(pd2)}</Text>
          </View>
          <View style={s.priceCompareRow}>
            <Text style={[s.priceCompareLabel, { color: C.textMuted }]}>TP3</Text>
            <Text style={[s.priceCompareVal, { color: "#00D4AA" }]}>{(signal1.tp3 ?? signal1.takeProfit).toFixed(pd1)}</Text>
            <Text style={[s.priceCompareVal, { color: "#818CF8" }]}>{(signal2.tp3 ?? signal2.takeProfit).toFixed(pd2)}</Text>
          </View>
        </View>

        <View style={[s.verdictCard, {
          backgroundColor: C.backgroundCard,
          borderColor: winner === 1 ? "#00D4AA40" : winner === 2 ? "#818CF840" : C.border,
        }]}>
          <View style={s.verdictHeader}>
            <Ionicons name="ribbon" size={20} color={winner === 1 ? "#00D4AA" : winner === 2 ? "#818CF8" : C.textMuted} />
            <Text style={[s.verdictTitle, { color: C.text }]}>Verdetto</Text>
          </View>

          {winnerSignal ? (
            <>
              <View style={[s.verdictWinnerRow, {
                backgroundColor: (winner === 1 ? "#00D4AA" : "#818CF8") + "12",
              }]}>
                <Ionicons name="trophy" size={18} color={winner === 1 ? "#00D4AA" : "#818CF8"} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.verdictWinner, { color: winner === 1 ? "#00D4AA" : "#818CF8" }]}>
                    {winnerSignal.pair} {winnerSignal.action}
                  </Text>
                  <Text style={[s.verdictSub, { color: C.textSecondary }]}>
                    Vantaggio {verdictStrength.toLowerCase()} - Score {(Math.max(scores1.total, scores2.total) * 100).toFixed(0)} vs {(Math.min(scores1.total, scores2.total) * 100).toFixed(0)}
                  </Text>
                </View>
              </View>

              <View style={s.verdictDetails}>
                {scores1.confidence !== scores2.confidence && (
                  <View style={s.verdictPoint}>
                    <Ionicons name="shield-checkmark" size={12} color={C.accent} />
                    <Text style={[s.verdictPointText, { color: C.textSecondary }]}>
                      Confidenza: {signal1.confidence > signal2.confidence ? signal1.pair : signal2.pair} ({Math.max(signal1.confidence, signal2.confidence)}% vs {Math.min(signal1.confidence, signal2.confidence)}%)
                    </Text>
                  </View>
                )}
                {rr1 !== rr2 && (
                  <View style={s.verdictPoint}>
                    <Ionicons name="swap-horizontal" size={12} color={C.accent} />
                    <Text style={[s.verdictPointText, { color: C.textSecondary }]}>
                      R:R migliore: {rr1 > rr2 ? signal1.pair : signal2.pair} (1:{Math.max(rr1, rr2)} vs 1:{Math.min(rr1, rr2)})
                    </Text>
                  </View>
                )}
                {tf1 !== tf2 && (
                  <View style={s.verdictPoint}>
                    <Ionicons name="layers" size={12} color={C.accent} />
                    <Text style={[s.verdictPointText, { color: C.textSecondary }]}>
                      Convergenza TF: {tf1 > tf2 ? signal1.pair : signal2.pair} ({Math.max(tf1, tf2)}/3 vs {Math.min(tf1, tf2)}/3)
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : (
            <View style={[s.verdictWinnerRow, { backgroundColor: C.hold + "12" }]}>
              <Ionicons name="swap-horizontal" size={18} color={C.hold} />
              <Text style={[s.verdictWinner, { color: C.hold }]}>Pareggio</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  errorContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  errorText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12 },
  backBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  headerPairs: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  pairCard: { flex: 1, alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  pairBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pairBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  pairName: { fontSize: 17, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  pairTimeframe: { fontSize: 11, fontFamily: "Inter_500Medium" },
  winnerTag: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  vsCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  vsText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 20, marginBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  radarCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12, alignItems: "center" },
  radarCenter: { alignItems: "center", marginTop: 8 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 8 },
  metricsCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  metricRow: { marginBottom: 14 },
  metricLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 6, textAlign: "center" },
  metricBars: { flexDirection: "row", alignItems: "center" },
  metricBarLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  metricBarRight: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  metricVal: { fontSize: 12, fontFamily: "Inter_700Bold", width: 44, textAlign: "center" },
  barContainerLeft: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden", flexDirection: "row", justifyContent: "flex-end" },
  barFillLeft: { height: "100%", borderRadius: 3 },
  barContainerRight: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" },
  barFillRight: { height: "100%", borderRadius: 3 },
  metricDivider: { width: 1, height: 20, marginHorizontal: 6 },
  pricesCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  priceCompareRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0 },
  priceCompareLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  priceCompareVal: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  verdictCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, marginBottom: 12 },
  verdictHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  verdictTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  verdictWinnerRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, marginBottom: 10 },
  verdictWinner: { fontSize: 16, fontFamily: "Inter_700Bold" },
  verdictSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  verdictDetails: { gap: 8 },
  verdictPoint: { flexDirection: "row", alignItems: "center", gap: 6 },
  verdictPointText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
});
