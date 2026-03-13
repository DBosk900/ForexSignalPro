import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

interface Signal {
  id: string;
  pair: string;
  action: "BUY" | "SELL" | "HOLD";
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidence: number;
  strength: number;
  tpHit: number;
  currentSL: number;
}

interface LivePrice {
  pair: string;
  price: number;
  change: number;
}

const CORRELATIONS: Record<string, string[]> = {
  "EUR/USD": ["GBP/USD", "AUD/USD"],
  "GBP/USD": ["EUR/USD", "AUD/USD"],
  "AUD/USD": ["EUR/USD", "GBP/USD", "NZD/USD"],
  "NZD/USD": ["AUD/USD"],
  "USD/JPY": ["USD/CHF"],
  "USD/CHF": ["USD/JPY"],
  "USD/CAD": ["WTI/USD", "BRENT/USD"],
  "EUR/GBP": ["EUR/USD", "GBP/USD"],
  "GBP/JPY": ["GBP/USD", "USD/JPY"],
  "EUR/JPY": ["EUR/USD", "USD/JPY"],
  "XAU/USD": ["XAG/USD"],
  "XAG/USD": ["XAU/USD"],
  "WTI/USD": ["BRENT/USD", "USD/CAD"],
  "BRENT/USD": ["WTI/USD", "USD/CAD"],
};

function getPipMul(pair: string): number {
  const p = pair.toUpperCase();
  if (p.includes("JPY")) return 100;
  if (p.includes("XAU") || p.includes("XPT")) return 10;
  if (p.includes("XAG") || p.includes("WTI") || p.includes("BRENT")) return 100;
  if (p.includes("NG/")) return 1000;
  if (p.includes("XCU")) return 10000;
  return 10000;
}

function RiskGauge({ value, max, color, label, C }: { value: number; max: number; color: string; label: string; C: any }) {
  const size = 70;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dashOffset = circ * (1 - pct * 0.75);

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={C.backgroundElevated} strokeWidth={stroke}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <SvgText x={size / 2} y={size / 2 + 1} textAnchor="middle" fontSize={14} fontWeight="700" fill={color}>
          {Math.round(value)}
        </SvgText>
        <SvgText x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize={8} fill={C.textMuted}>
          /{max}
        </SvgText>
      </Svg>
      <Text style={{ fontSize: 9, fontFamily: "Inter_500Medium", color: C.textMuted, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

export default function RiskExposureDashboard({ signals, livePrices }: { signals: Signal[]; livePrices?: LivePrice[] }) {
  const { colors: C } = useTheme();

  const activeSignals = signals.filter(s => s.action !== "HOLD");
  if (activeSignals.length === 0) return null;

  const priceMap = React.useMemo(() => {
    const m: Record<string, number> = {};
    if (livePrices) livePrices.forEach(lp => { m[lp.pair] = lp.price; });
    return m;
  }, [livePrices]);

  const metrics = React.useMemo(() => {
    let totalRiskPips = 0;
    let totalPotentialPips = 0;
    let totalLivePnlPips = 0;
    let inProfit = 0;
    let inLoss = 0;
    const currencyExposure: Record<string, { buy: number; sell: number }> = {};
    const correlationWarnings: string[] = [];
    const pairsInTrade = new Set(activeSignals.map(s => s.pair));

    for (const s of activeSignals) {
      const pipMul = getPipMul(s.pair);
      const riskPips = Math.abs(s.entryPrice - (s.currentSL ?? s.stopLoss)) * pipMul;
      const potentialPips = Math.abs(s.tp3 - s.entryPrice) * pipMul;
      totalRiskPips += riskPips;
      totalPotentialPips += potentialPips;

      const price = priceMap[s.pair];
      if (price) {
        const diff = s.action === "BUY" ? price - s.entryPrice : s.entryPrice - price;
        const livePips = diff * pipMul;
        totalLivePnlPips += livePips;
        if (livePips >= 0) inProfit++;
        else inLoss++;
      }

      const parts = s.pair.split("/");
      if (parts.length === 2) {
        const [base, quote] = parts;
        if (!currencyExposure[base]) currencyExposure[base] = { buy: 0, sell: 0 };
        if (!currencyExposure[quote]) currencyExposure[quote] = { buy: 0, sell: 0 };
        if (s.action === "BUY") {
          currencyExposure[base].buy++;
          currencyExposure[quote].sell++;
        } else {
          currencyExposure[base].sell++;
          currencyExposure[quote].buy++;
        }
      }

      const corr = CORRELATIONS[s.pair];
      if (corr) {
        for (const cp of corr) {
          if (pairsInTrade.has(cp)) {
            const other = activeSignals.find(x => x.pair === cp);
            if (other && other.action === s.action) {
              const w = `${s.pair} + ${cp} (${s.action})`;
              if (!correlationWarnings.includes(w) && !correlationWarnings.includes(`${cp} + ${s.pair} (${s.action})`)) {
                correlationWarnings.push(w);
              }
            }
          }
        }
      }
    }

    const overexposedCurrencies = Object.entries(currencyExposure)
      .filter(([, v]) => v.buy + v.sell >= 3)
      .map(([k, v]) => ({ currency: k, total: v.buy + v.sell, buy: v.buy, sell: v.sell }));

    const rr = totalRiskPips > 0 ? totalPotentialPips / totalRiskPips : 0;
    const avgConf = activeSignals.reduce((a, s) => a + s.confidence, 0) / activeSignals.length;
    const riskScore = Math.min(100, Math.round(
      (activeSignals.length / 10) * 30 +
      (correlationWarnings.length > 0 ? 20 : 0) +
      (overexposedCurrencies.length > 0 ? 15 : 0) +
      ((100 - avgConf) / 100) * 35
    ));

    return {
      totalRiskPips: Math.round(totalRiskPips),
      totalPotentialPips: Math.round(totalPotentialPips),
      totalLivePnlPips: Math.round(totalLivePnlPips * 10) / 10,
      inProfit, inLoss,
      rr: Math.round(rr * 10) / 10,
      correlationWarnings,
      overexposedCurrencies,
      riskScore,
      positionCount: activeSignals.length,
    };
  }, [activeSignals, priceMap]);

  const riskColor = metrics.riskScore <= 30 ? C.buy : metrics.riskScore <= 60 ? "#FFB347" : C.sell;

  return (
    <Animated.View entering={FadeInDown.delay(80).springify()} style={[st.container, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
      <View style={st.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="shield-half-outline" size={16} color={C.accent} />
          <Text style={[st.title, { color: C.text }]}>Risk Exposure</Text>
        </View>
        <View style={[st.riskBadge, { backgroundColor: riskColor + "15", borderColor: riskColor + "30" }]}>
          <View style={[st.riskDot, { backgroundColor: riskColor }]} />
          <Text style={[st.riskBadgeText, { color: riskColor }]}>
            {metrics.riskScore <= 30 ? "Basso" : metrics.riskScore <= 60 ? "Medio" : "Alto"}
          </Text>
        </View>
      </View>

      <View style={st.gaugeRow}>
        <RiskGauge value={metrics.riskScore} max={100} color={riskColor} label="Rischio" C={C} />
        <RiskGauge value={metrics.positionCount} max={10} color={C.accent} label="Posizioni" C={C} />
        <RiskGauge value={metrics.rr} max={5} color={metrics.rr >= 2 ? C.buy : "#FFB347"} label="R:R medio" C={C} />
      </View>

      <View style={[st.metricsRow, { borderTopColor: C.border }]}>
        <View style={st.metricItem}>
          <Text style={[st.metricValue, { color: C.sell }]}>{metrics.totalRiskPips}</Text>
          <Text style={[st.metricLabel, { color: C.textMuted }]}>Pip a rischio</Text>
        </View>
        <View style={[st.metricDivider, { backgroundColor: C.border }]} />
        <View style={st.metricItem}>
          <Text style={[st.metricValue, { color: C.buy }]}>{metrics.totalPotentialPips}</Text>
          <Text style={[st.metricLabel, { color: C.textMuted }]}>Pip potenziali</Text>
        </View>
        <View style={[st.metricDivider, { backgroundColor: C.border }]} />
        <View style={st.metricItem}>
          <Text style={[st.metricValue, { color: metrics.totalLivePnlPips >= 0 ? C.buy : C.sell }]}>
            {metrics.totalLivePnlPips >= 0 ? "+" : ""}{metrics.totalLivePnlPips}
          </Text>
          <Text style={[st.metricLabel, { color: C.textMuted }]}>P&L live</Text>
        </View>
      </View>

      {metrics.inProfit + metrics.inLoss > 0 && (
        <View style={[st.profitBar, { backgroundColor: C.backgroundElevated }]}>
          <View style={[st.profitFill, { width: `${(metrics.inProfit / (metrics.inProfit + metrics.inLoss)) * 100}%` as any, backgroundColor: C.buy }]} />
          <View style={st.profitLabels}>
            <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.buy }}>{metrics.inProfit} in profitto</Text>
            <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.sell }}>{metrics.inLoss} in perdita</Text>
          </View>
        </View>
      )}

      {metrics.correlationWarnings.length > 0 && (
        <View style={[st.warningBox, { backgroundColor: "#FFB34710", borderColor: "#FFB34730" }]}>
          <Ionicons name="warning-outline" size={14} color="#FFB347" />
          <View style={{ flex: 1 }}>
            <Text style={[st.warningTitle, { color: "#FFB347" }]}>Correlazione rilevata</Text>
            {metrics.correlationWarnings.map((w, i) => (
              <Text key={i} style={[st.warningText, { color: C.textSecondary }]}>{w}</Text>
            ))}
          </View>
        </View>
      )}

      {metrics.overexposedCurrencies.length > 0 && (
        <View style={[st.warningBox, { backgroundColor: C.sell + "08", borderColor: C.sell + "25" }]}>
          <Ionicons name="alert-circle-outline" size={14} color={C.sell} />
          <View style={{ flex: 1 }}>
            <Text style={[st.warningTitle, { color: C.sell }]}>Sovraesposizione</Text>
            {metrics.overexposedCurrencies.map((c, i) => (
              <Text key={i} style={[st.warningText, { color: C.textSecondary }]}>
                {c.currency}: {c.total} posizioni ({c.buy} long, {c.sell} short)
              </Text>
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: { marginHorizontal: 20, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 14, fontFamily: "Inter_700Bold" },
  riskBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  riskDot: { width: 6, height: 6, borderRadius: 3 },
  riskBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  gaugeRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start" },
  metricsRow: { flexDirection: "row", borderTopWidth: 1, paddingTop: 10 },
  metricItem: { flex: 1, alignItems: "center", gap: 2 },
  metricValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  metricLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  metricDivider: { width: 1, alignSelf: "stretch" as const },
  profitBar: { height: 20, borderRadius: 10, overflow: "hidden" as const, position: "relative" as const },
  profitFill: { position: "absolute" as const, left: 0, top: 0, bottom: 0, borderRadius: 10 },
  profitLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, height: 20, alignItems: "center" },
  warningBox: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: "flex-start" },
  warningTitle: { fontSize: 11, fontFamily: "Inter_700Bold", marginBottom: 2 },
  warningText: { fontSize: 10, fontFamily: "Inter_400Regular", lineHeight: 15 },
});
