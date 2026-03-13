import React, { useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Platform, Pressable, Dimensions, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Polyline, Defs, LinearGradient, Stop, Line, Text as SvgText, Polygon, Circle } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { router } from "expo-router";

interface HistoryItem {
  id: string;
  pair: string;
  action: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tpLevel: number | null;
  confidence: number;
  strength: number;
  timeframe: string;
  summary: string | null;
  rsi: number | null;
  macd: number | null;
  outcome: string;
  pipResult: number | null;
  createdAt: string;
  closedAt: string | null;
}

interface Stats {
  totalSignals: number;
  closedSignals: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgPips: number;
  totalPips: number;
  tp3Full: number;
  tp2Partial: number;
  tp1Partial: number;
  bestPair: { pair: string; winRate: number } | null;
}

interface TimelineBreakdown {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPips: number;
  tp3Count: number;
  tp2Count: number;
  tp1Count: number;
  slCount: number;
}

interface EquityCurvePoint {
  date: string;
  pips: number;
  tpLevel: number;
  outcome: string;
}

interface TimelineData {
  equityCurve: EquityCurvePoint[];
  weekly: TimelineBreakdown;
  monthly: TimelineBreakdown;
  allTime: TimelineBreakdown;
}

interface PairStats {
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  totalPips: number;
  pipsHistory: number[];
}

interface PairBreakdownItem {
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  totalPips: number;
  buyCount: number;
  sellCount: number;
  buyWins: number;
  sellWins: number;
}

interface ScalpingStatsData {
  total: number;
  wins: number;
  winRate: number;
  totalPips: number;
  avgPips: number;
  tp1Pct: number;
  tp2Pct: number;
  slPct: number;
  expiredPct: number;
  tp1Count: number;
  tp2Count: number;
  slCount: number;
  expiredCount: number;
}

interface PerformanceData {
  empty: boolean;
  totalTrades?: number;
  winRate?: number;
  profitFactor?: number;
  totalPips?: number;
  avgRR?: number;
  wins?: number;
  losses?: number;
  tp3?: number;
  tp2?: number;
  tp1?: number;
  equityCurve?: { date: string; pips: number; outcome: string }[];
  pairBreakdown?: Record<string, PairBreakdownItem>;
  scalpingStats?: ScalpingStatsData | null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1);
  return d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
}

function MiniSparkline({ data, color, width = 60, height = 24 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const range = mx - mn || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = (1 - (v - mn) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const TP_COLORS = {
  tp3: "#FFB800",
  tp2: "#22C55E",
  tp1: "#86EFAC",
  sl: "#EF4444",
};

function getMarkerColor(point: EquityCurvePoint): string | null {
  if (point.outcome === "hit_tp3" || point.outcome === "hit_tp") return TP_COLORS.tp3;
  if (point.outcome === "hit_tp2_then_sl") return TP_COLORS.tp2;
  if (point.outcome === "hit_tp1_then_sl") return TP_COLORS.tp1;
  if (point.outcome === "hit_sl") return TP_COLORS.sl;
  return null;
}

function getMarkerSize(point: EquityCurvePoint): number {
  if (point.outcome === "hit_tp3" || point.outcome === "hit_tp") return 4.5;
  if (point.outcome === "hit_tp2_then_sl") return 3.5;
  if (point.outcome === "hit_tp1_then_sl") return 3;
  if (point.outcome === "hit_sl") return 3.5;
  return 2;
}

function EquityCurveChart({ data, themeColors }: { data: EquityCurvePoint[]; themeColors: any }) {
  const screenWidth = Dimensions.get("window").width - 64;
  const chartHeight = 180;
  const paddingLeft = 40;
  const paddingRight = 12;
  const paddingTop = 12;
  const paddingBottom = 24;
  const chartW = screenWidth - paddingLeft - paddingRight;
  const chartH = chartHeight - paddingTop - paddingBottom;

  const { pointsStr, fillStr, isPositive, gridLines, markers } = useMemo(() => {
    if (data.length < 2) return { pointsStr: "", fillStr: "", isPositive: true, gridLines: [], markers: [] };

    const values = data.map(d => d.pips);
    const mn = Math.min(0, ...values);
    const mx = Math.max(0, ...values);
    const range = mx - mn || 1;

    const pts = values.map((v, i) => {
      const x = paddingLeft + (i / (values.length - 1)) * chartW;
      const y = paddingTop + (1 - (v - mn) / range) * chartH;
      return { x, y };
    });

    const lineStr = pts.map(p => `${p.x},${p.y}`).join(" ");
    const lastPt = pts[pts.length - 1];
    const firstPt = pts[0];
    const fillPoly = pts.map(p => `${p.x},${p.y}`).join(" ") +
      ` ${lastPt.x},${paddingTop + chartH} ${firstPt.x},${paddingTop + chartH}`;

    const step = range / 4;
    const lines: { y: number; label: string }[] = [];
    for (let i = 0; i <= 4; i++) {
      const val = mn + step * i;
      const y = paddingTop + (1 - (val - mn) / range) * chartH;
      lines.push({ y, label: val >= 0 ? `+${val.toFixed(0)}` : val.toFixed(0) });
    }

    const markerPts = data.map((d, i) => {
      const color = getMarkerColor(d);
      if (!color) return null;
      return { x: pts[i].x, y: pts[i].y, color, size: getMarkerSize(d) };
    }).filter(Boolean) as { x: number; y: number; color: string; size: number }[];

    return { pointsStr: lineStr, fillStr: fillPoly, isPositive: values[values.length - 1] >= 0, gridLines: lines, markers: markerPts };
  }, [data, chartW, chartH]);

  if (data.length < 2) {
    return (
      <View style={[styles.chartEmpty, { backgroundColor: themeColors.backgroundElevated }]}>
        <Ionicons name="analytics-outline" size={28} color={themeColors.textMuted} />
        <Text style={[styles.chartEmptyText, { color: themeColors.textMuted }]}>Dati insufficienti per il grafico</Text>
      </View>
    );
  }

  const lineColor = isPositive ? themeColors.buy : themeColors.sell;

  return (
    <View>
      <View style={{ width: screenWidth, height: chartHeight }}>
        <Svg width={screenWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity="0.25" />
              <Stop offset="1" stopColor={lineColor} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          {gridLines.map((gl, i) => (
            <React.Fragment key={i}>
              <Line x1={paddingLeft} y1={gl.y} x2={screenWidth - paddingRight} y2={gl.y} stroke={themeColors.border} strokeWidth="0.5" strokeDasharray="4,3" />
              <SvgText x={paddingLeft - 4} y={gl.y + 3} fontSize="9" fill={themeColors.textMuted} textAnchor="end" fontFamily="Inter_500Medium">{gl.label}</SvgText>
            </React.Fragment>
          ))}
          <Polygon points={fillStr} fill="url(#equityFill)" />
          <Polyline points={pointsStr} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {markers.map((m, i) => (
            <Circle key={i} cx={m.x} cy={m.y} r={m.size} fill={m.color} stroke={themeColors.backgroundCard} strokeWidth="1.5" />
          ))}
        </Svg>
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TP_COLORS.tp3 }]} />
          <Text style={[styles.legendText, { color: themeColors.textMuted }]}>TP3</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TP_COLORS.tp2 }]} />
          <Text style={[styles.legendText, { color: themeColors.textMuted }]}>TP2</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TP_COLORS.tp1 }]} />
          <Text style={[styles.legendText, { color: themeColors.textMuted }]}>TP1</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: TP_COLORS.sl }]} />
          <Text style={[styles.legendText, { color: themeColors.textMuted }]}>SL</Text>
        </View>
      </View>
    </View>
  );
}

function BreakdownCard({ label, data, themeColors, isActive, onPress }: { label: string; data: TimelineBreakdown; themeColors: any; isActive: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.breakdownCard, { backgroundColor: isActive ? themeColors.accent + "15" : themeColors.backgroundElevated, borderColor: isActive ? themeColors.accent + "40" : themeColors.border }]}>
      <Text style={[styles.breakdownLabel, { color: isActive ? themeColors.accent : themeColors.textSecondary }]}>{label}</Text>
      <Text style={[styles.breakdownWinRate, { color: themeColors.text }]}>{data.winRate}%</Text>
      <Text style={[styles.breakdownSub, { color: themeColors.textMuted }]}>{data.wins}W / {data.losses}L</Text>
      <Text style={[styles.breakdownPips, { color: data.totalPips >= 0 ? themeColors.buy : themeColors.sell }]}>
        {data.totalPips >= 0 ? "+" : ""}{data.totalPips} pips
      </Text>
    </Pressable>
  );
}

function FilterChip({ label, isActive, onPress, themeColors, color }: { label: string; isActive: boolean; onPress: () => void; themeColors: any; color?: string }) {
  const activeColor = color || themeColors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: isActive ? activeColor + "18" : themeColors.backgroundElevated,
          borderColor: isActive ? activeColor + "50" : themeColors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          { color: isActive ? activeColor : themeColors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PairStatsCard({ pair, stats, themeColors }: { pair: string; stats: PairStats; themeColors: any }) {
  const isPositive = stats.totalPips >= 0;
  const sparkColor = isPositive ? themeColors.buy : themeColors.sell;

  return (
    <View style={[styles.pairStatsCard, { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border }]}>
      <View style={styles.pairStatsTop}>
        <Text style={[styles.pairStatsName, { color: themeColors.text }]}>{pair}</Text>
        <MiniSparkline data={stats.pipsHistory} color={sparkColor} width={50} height={20} />
      </View>
      <View style={styles.pairStatsBottom}>
        <Text style={[styles.pairStatsWR, { color: themeColors.accent }]}>{stats.winRate}%</Text>
        <Text style={[styles.pairStatsPips, { color: isPositive ? themeColors.buy : themeColors.sell }]}>
          {isPositive ? "+" : ""}{stats.totalPips}p
        </Text>
      </View>
      <View style={[styles.pairStatsBar, { backgroundColor: themeColors.border }]}>
        <View style={[styles.pairStatsBarFill, { width: `${stats.winRate}%` as any, backgroundColor: themeColors.buy }]} />
      </View>
      <Text style={[styles.pairStatsRecord, { color: themeColors.textMuted }]}>{stats.wins}W {stats.losses}L</Text>
    </View>
  );
}

const HistoryCard = React.memo(function HistoryCard({ item, index }: { item: HistoryItem; index: number }) {
  const { colors: themeColors } = useTheme();
  const isWin = item.outcome === "hit_tp" || item.outcome === "hit_tp3" || item.outcome === "hit_tp2_then_sl" || item.outcome === "hit_tp1_then_sl";
  const isLoss = item.outcome === "hit_sl";
  const isPending = item.outcome === "pending";
  const outcomeColor = isWin ? themeColors.buy : isLoss ? themeColors.sell : themeColors.hold;
  const outcomeIcon = isWin ? "checkmark-circle" : isLoss ? "close-circle" : "time";
  const tpLevel = item.tpLevel ?? 0;
  const outcomeLabel = item.outcome === "hit_tp3" || item.outcome === "hit_tp"
    ? "TP3 Completo"
    : item.outcome === "hit_tp2_then_sl"
    ? "TP2 + Trail"
    : item.outcome === "hit_tp1_then_sl"
    ? "TP1 + B.E."
    : isLoss ? "SL Colpito" : "In Corso";
  const actionColor = item.action === "BUY" ? themeColors.buy : item.action === "SELL" ? themeColors.sell : themeColors.hold;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 30).springify()}>
      <View style={[styles.card, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardLeft}>
            <Text style={[styles.pairText, { color: themeColors.text }]}>{item.pair}</Text>
            <View style={[styles.actionChip, { backgroundColor: actionColor + "20", borderColor: actionColor + "40" }]}>
              <Text style={[styles.actionChipText, { color: actionColor }]}>{item.action}</Text>
            </View>
            <Text style={[styles.timeframeText, { color: themeColors.textMuted }]}>{item.timeframe}</Text>
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.outcomeBadge, { backgroundColor: outcomeColor + "15", borderColor: outcomeColor + "30" }]}>
              <Ionicons name={outcomeIcon as any} size={13} color={outcomeColor} />
              <Text style={[styles.outcomeText, { color: outcomeColor }]}>{outcomeLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.priceGrid}>
          <View style={[styles.priceCell, { backgroundColor: themeColors.backgroundElevated }]}>
            <Text style={[styles.priceCellLabel, { color: themeColors.textMuted }]}>Entry</Text>
            <Text style={[styles.priceCellValue, { color: themeColors.text }]}>{item.entryPrice.toFixed(4)}</Text>
          </View>
          <View style={[styles.priceCell, { backgroundColor: themeColors.backgroundElevated }]}>
            <Text style={[styles.priceCellLabel, { color: themeColors.textMuted }]}>SL</Text>
            <Text style={[styles.priceCellValue, { color: themeColors.sell }]}>{item.stopLoss.toFixed(4)}</Text>
          </View>
          <View style={[styles.priceCell, { backgroundColor: themeColors.backgroundElevated }]}>
            <Text style={[styles.priceCellLabel, { color: themeColors.textMuted }]}>TP</Text>
            <Text style={[styles.priceCellValue, { color: themeColors.buy }]}>{item.takeProfit.toFixed(4)}</Text>
          </View>
          {!isPending && (
            <View style={[styles.priceCell, { backgroundColor: themeColors.backgroundElevated }]}>
              <Text style={[styles.priceCellLabel, { color: themeColors.textMuted }]}>Pips</Text>
              <Text style={[styles.priceCellValue, { color: outcomeColor }]}>
                {(item.pipResult ?? 0) >= 0 ? "+" : ""}{(item.pipResult ?? 0).toFixed(1)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.dateText, { color: themeColors.textMuted }]}>{formatDate(item.createdAt)}</Text>
          <View style={styles.cardFooterRight}>
            {!isPending && (
              <Pressable
                onPress={() => router.push({ pathname: "/replay", params: { id: item.id } })}
                style={[styles.replayBtn, { backgroundColor: themeColors.accent + "12", borderColor: themeColors.accent + "30" }]}
              >
                <Ionicons name="play" size={11} color={themeColors.accent} />
                <Text style={[styles.replayBtnText, { color: themeColors.accent }]}>Replay</Text>
              </Pressable>
            )}
            <Text style={[styles.confidenceText, { color: themeColors.accent }]}>{item.confidence}% conf.</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

export default function HistoryScreen() {
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const [activeBreakdown, setActiveBreakdown] = useState<"weekly" | "monthly" | "allTime">("monthly");
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [selectedTpLevel, setSelectedTpLevel] = useState<number | null>(null);
  const [showPairStats, setShowPairStats] = useState(false);
  const [activeTab, setActiveTab] = useState<"forex" | "scalping">("forex");

  const { data: history = [] } = useQuery<HistoryItem[]>({ queryKey: ["/api/history"] });
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: timeline } = useQuery<TimelineData>({ queryKey: ["/api/stats/timeline"] });
  const { data: pairStatsData } = useQuery<Record<string, PairStats>>({ queryKey: ["/api/stats/pairs"] });
  const { data: performance } = useQuery<PerformanceData>({ queryKey: ["/api/performance"] });

  const uniquePairs = useMemo(() => {
    const pairs = [...new Set(history.map(h => h.pair))];
    return pairs.sort();
  }, [history]);

  const uniqueMonths = useMemo(() => {
    const months = [...new Set(history.map(h => getMonthKey(h.createdAt)))];
    return months.sort().reverse();
  }, [history]);

  const filteredHistory = useMemo(() => {
    let filtered = history;
    if (selectedPair) {
      filtered = filtered.filter(h => h.pair === selectedPair);
    }
    if (selectedMonth) {
      filtered = filtered.filter(h => getMonthKey(h.createdAt) === selectedMonth);
    }
    if (selectedOutcome) {
      if (selectedOutcome === "hit_tp") {
        filtered = filtered.filter(h => h.outcome === "hit_tp" || h.outcome === "hit_tp3" || h.outcome === "hit_tp2_then_sl" || h.outcome === "hit_tp1_then_sl");
      } else {
        filtered = filtered.filter(h => h.outcome === selectedOutcome);
      }
    }
    if (selectedTpLevel !== null) {
      filtered = filtered.filter(h => (h.tpLevel ?? 0) >= selectedTpLevel);
    }
    return filtered;
  }, [history, selectedPair, selectedMonth, selectedOutcome, selectedTpLevel]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedPair) count++;
    if (selectedMonth) count++;
    if (selectedOutcome) count++;
    if (selectedTpLevel !== null) count++;
    return count;
  }, [selectedPair, selectedMonth, selectedOutcome, selectedTpLevel]);

  const clearFilters = useCallback(() => {
    setSelectedPair(null);
    setSelectedMonth(null);
    setSelectedOutcome(null);
    setSelectedTpLevel(null);
  }, []);

  const sortedPairStats = useMemo(() => {
    if (!pairStatsData) return [];
    return Object.entries(pairStatsData)
      .filter(([, s]) => s.total > 0)
      .sort(([, a], [, b]) => b.totalPips - a.totalPips);
  }, [pairStatsData]);

  const renderScalpingContent = useCallback(() => {
    const scalp = performance?.scalpingStats ?? null;
    if (!scalp) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="flash-outline" size={48} color={themeColors.textMuted} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Nessun trade scalping chiuso</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
            I risultati XAU/USD scalping appariranno qui man mano che i segnali vengono chiusi.
          </Text>
        </View>
      );
    }
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={[styles.statsCard, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
          <Text style={[styles.chartTitle, { color: themeColors.text, marginBottom: 4 }]}>XAU/USD Scalping</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: themeColors.accent }]}>{scalp.winRate}%</Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Win Rate</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: scalp.totalPips >= 0 ? themeColors.buy : themeColors.sell }]}>
                {scalp.totalPips >= 0 ? "+" : ""}{scalp.totalPips}
              </Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Pips Totali</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: themeColors.text }]}>{scalp.avgPips}</Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Pip Medi</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: themeColors.text }]}>{scalp.total}</Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Totale</Text>
            </View>
          </View>
          <View style={[styles.winBar, { backgroundColor: themeColors.backgroundElevated, marginTop: 8 }]}>
            <View style={[styles.winFill, { width: `${scalp.winRate}%` as any, backgroundColor: themeColors.buy }]} />
          </View>
          <View style={styles.tpBreakdownRow}>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: TP_COLORS.tp1 }]} />
              <Text style={[styles.tpBreakdownValue, { color: TP_COLORS.tp1 }]}>{scalp.tp1Count}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>TP1 ({scalp.tp1Pct}%)</Text>
            </View>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: TP_COLORS.tp2 }]} />
              <Text style={[styles.tpBreakdownValue, { color: TP_COLORS.tp2 }]}>{scalp.tp2Count}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>TP2 ({scalp.tp2Pct}%)</Text>
            </View>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: TP_COLORS.sl }]} />
              <Text style={[styles.tpBreakdownValue, { color: TP_COLORS.sl }]}>{scalp.slCount}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>SL ({scalp.slPct}%)</Text>
            </View>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: themeColors.textMuted }]} />
              <Text style={[styles.tpBreakdownValue, { color: themeColors.textMuted }]}>{scalp.expiredCount}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>Scaduti ({scalp.expiredPct}%)</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }, [performance, themeColors]);

  const renderHeader = useCallback(() => {
    const hasPerf = performance && !performance.empty;
    const isEmpty = !stats || stats.closedSignals === 0;

    return (
      <View>
        <View style={styles.tabSelector}>
          <Pressable
            onPress={() => setActiveTab("forex")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "forex" ? themeColors.accent + "18" : themeColors.backgroundElevated, borderColor: activeTab === "forex" ? themeColors.accent + "50" : themeColors.border }]}
          >
            <Ionicons name="trending-up" size={14} color={activeTab === "forex" ? themeColors.accent : themeColors.textMuted} />
            <Text style={[styles.tabBtnText, { color: activeTab === "forex" ? themeColors.accent : themeColors.textSecondary }]}>Forex / Commodity</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("scalping")}
            style={[styles.tabBtn, { backgroundColor: activeTab === "scalping" ? "#FFB800" + "18" : themeColors.backgroundElevated, borderColor: activeTab === "scalping" ? "#FFB800" + "50" : themeColors.border }]}
          >
            <Ionicons name="flash" size={14} color={activeTab === "scalping" ? "#FFB800" : themeColors.textMuted} />
            <Text style={[styles.tabBtnText, { color: activeTab === "scalping" ? "#FFB800" : themeColors.textSecondary }]}>Scalping XAU</Text>
          </Pressable>
        </View>

        {activeTab === "scalping" ? renderScalpingContent() : isEmpty ? (
          <View style={styles.emptyInlineContainer}>
            <Ionicons name="analytics-outline" size={40} color={themeColors.textMuted} />
            <Text style={[styles.emptyTitle, { color: themeColors.text, fontSize: 16 }]}>Nessun trade chiuso ancora</Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary, fontSize: 13 }]}>
              I risultati appariranno qui man mano che i segnali vengono chiusi.
            </Text>
          </View>
        ) : (
          <>
        {hasPerf && (
          <View style={[styles.globalStatsCard, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.chartTitle, { color: themeColors.text, marginBottom: 8 }]}>STATISTICHE GLOBALI</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statsCell}>
                <Text style={[styles.statsBigValue, { color: themeColors.accent }]}>{performance!.winRate}%</Text>
                <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Win Rate</Text>
              </View>
              <View style={styles.statsCell}>
                <Text style={[styles.statsBigValue, { color: (performance!.profitFactor ?? 0) >= 1 ? themeColors.buy : themeColors.sell }]}>
                  {performance!.profitFactor?.toFixed(2) ?? "0"}
                </Text>
                <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Profit Factor</Text>
              </View>
              <View style={styles.statsCell}>
                <Text style={[styles.statsBigValue, { color: (performance!.totalPips ?? 0) >= 0 ? themeColors.buy : themeColors.sell }]}>
                  {(performance!.totalPips ?? 0) >= 0 ? "+" : ""}{performance!.totalPips}
                </Text>
                <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Pips Totali</Text>
              </View>
              <View style={styles.statsCell}>
                <Text style={[styles.statsBigValue, { color: themeColors.text }]}>{performance!.avgRR?.toFixed(1) ?? "0"}</Text>
                <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>R:R Medio</Text>
              </View>
            </View>
          </View>
        )}

        <View style={[styles.chartSection, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
          <View style={styles.chartTitleRow}>
            <Text style={[styles.chartTitle, { color: themeColors.text }]}>Curva di Equity</Text>
            {timeline && timeline.equityCurve.length > 0 && (
              <Text style={[styles.chartTotalPips, { color: (timeline.allTime.totalPips ?? 0) >= 0 ? themeColors.buy : themeColors.sell }]}>
                {(timeline.allTime.totalPips ?? 0) >= 0 ? "+" : ""}{timeline.allTime.totalPips ?? 0} pips
              </Text>
            )}
          </View>
          {timeline ? (
            <EquityCurveChart data={timeline.equityCurve} themeColors={themeColors} />
          ) : (
            <View style={[styles.chartEmpty, { backgroundColor: themeColors.backgroundElevated }]}>
              <Text style={[styles.chartEmptyText, { color: themeColors.textMuted }]}>Caricamento...</Text>
            </View>
          )}
        </View>

        {timeline && (
          <View style={styles.breakdownRow}>
            <BreakdownCard label="7 Giorni" data={timeline.weekly} themeColors={themeColors} isActive={activeBreakdown === "weekly"} onPress={() => setActiveBreakdown("weekly")} />
            <BreakdownCard label="30 Giorni" data={timeline.monthly} themeColors={themeColors} isActive={activeBreakdown === "monthly"} onPress={() => setActiveBreakdown("monthly")} />
            <BreakdownCard label="Totale" data={timeline.allTime} themeColors={themeColors} isActive={activeBreakdown === "allTime"} onPress={() => setActiveBreakdown("allTime")} />
          </View>
        )}

        <View style={[styles.statsCard, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
          <View style={styles.statsGrid}>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: themeColors.accent }]}>{stats!.winRate}%</Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Win Rate</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: stats!.totalPips >= 0 ? themeColors.buy : themeColors.sell }]}>
                {stats!.totalPips >= 0 ? "+" : ""}{stats!.totalPips}
              </Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Pips Totali</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: themeColors.buy }]}>{stats!.wins}</Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Vittorie</Text>
            </View>
            <View style={styles.statsCell}>
              <Text style={[styles.statsBigValue, { color: themeColors.sell }]}>{stats!.losses}</Text>
              <Text style={[styles.statsSmallLabel, { color: themeColors.textMuted }]}>Perdite</Text>
            </View>
          </View>
          <View style={[styles.winBar, { backgroundColor: themeColors.backgroundElevated }]}>
            <View style={[styles.winFill, { width: `${stats!.winRate}%` as any, backgroundColor: themeColors.buy }]} />
          </View>
          <View style={styles.tpBreakdownRow}>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: TP_COLORS.tp3 }]} />
              <Text style={[styles.tpBreakdownValue, { color: TP_COLORS.tp3 }]}>{stats!.tp3Full ?? 0}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>TP3</Text>
            </View>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: TP_COLORS.tp2 }]} />
              <Text style={[styles.tpBreakdownValue, { color: TP_COLORS.tp2 }]}>{stats!.tp2Partial ?? 0}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>TP2</Text>
            </View>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: TP_COLORS.tp1 }]} />
              <Text style={[styles.tpBreakdownValue, { color: TP_COLORS.tp1 }]}>{stats!.tp1Partial ?? 0}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>TP1</Text>
            </View>
            <View style={styles.tpBreakdownItem}>
              <View style={[styles.tpBreakdownDot, { backgroundColor: TP_COLORS.sl }]} />
              <Text style={[styles.tpBreakdownValue, { color: TP_COLORS.sl }]}>{stats!.losses}</Text>
              <Text style={[styles.tpBreakdownLabel, { color: themeColors.textMuted }]}>SL</Text>
            </View>
          </View>
          {stats!.bestPair && (
            <View style={styles.bestPairRow}>
              <Ionicons name="trophy" size={12} color={themeColors.hold} />
              <Text style={[styles.bestPairText, { color: themeColors.textSecondary }]}>
                Miglior coppia: <Text style={{ color: themeColors.accent }}>{stats!.bestPair.pair}</Text> ({stats!.bestPair.winRate}% win rate)
              </Text>
            </View>
          )}
        </View>

        {sortedPairStats.length > 0 && (
          <View style={[styles.pairStatsSection, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Pressable onPress={() => setShowPairStats(!showPairStats)} style={styles.pairStatsTitleRow}>
              <Text style={[styles.chartTitle, { color: themeColors.text }]}>Performance per Coppia</Text>
              <Ionicons name={showPairStats ? "chevron-up" : "chevron-down"} size={18} color={themeColors.textMuted} />
            </Pressable>
            {showPairStats && (
              <View style={styles.pairStatsGrid}>
                {sortedPairStats.map(([pair, pStats]) => (
                  <PairStatsCard key={pair} pair={pair} stats={pStats} themeColors={themeColors} />
                ))}
              </View>
            )}
          </View>
        )}

        {hasPerf && performance!.pairBreakdown && Object.keys(performance!.pairBreakdown).length > 0 && (
          <View style={[styles.pairStatsSection, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}>
            <Text style={[styles.chartTitle, { color: themeColors.text, marginBottom: 10 }]}>Distribuzione BUY / SELL</Text>
            {Object.entries(performance!.pairBreakdown!).filter(([pair]) => !selectedPair || pair === selectedPair).sort(([, a], [, b]) => b.total - a.total).map(([pair, pb]) => (
              <View key={pair} style={[styles.buySellRow, { borderColor: themeColors.border }]}>
                <Text style={[styles.buySellPair, { color: themeColors.text }]}>{pair}</Text>
                <View style={styles.buySellBarContainer}>
                  <View style={[styles.buySellBar, { backgroundColor: themeColors.backgroundElevated }]}>
                    {pb.buyCount + pb.sellCount > 0 && (
                      <>
                        <View style={[styles.buySellFill, { width: `${(pb.buyCount / (pb.buyCount + pb.sellCount)) * 100}%` as any, backgroundColor: themeColors.buy }]} />
                      </>
                    )}
                  </View>
                  <View style={styles.buySellLabels}>
                    <Text style={[styles.buySellLabel, { color: themeColors.buy }]}>B:{pb.buyCount} ({pb.buyCount > 0 ? Math.round((pb.buyWins / pb.buyCount) * 100) : 0}%)</Text>
                    <Text style={[styles.buySellLabel, { color: themeColors.sell }]}>S:{pb.sellCount} ({pb.sellCount > 0 ? Math.round((pb.sellWins / pb.sellCount) * 100) : 0}%)</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        </>
        )}

        {activeTab === "forex" && (
        <>
        <View style={styles.filtersSection}>
          <View style={styles.filtersTitleRow}>
            <Text style={[styles.filtersTitle, { color: themeColors.text }]}>Filtri</Text>
            {activeFilterCount > 0 && (
              <Pressable onPress={clearFilters} style={[styles.clearFiltersBtn, { backgroundColor: themeColors.sell + "15" }]}>
                <Ionicons name="close" size={12} color={themeColors.sell} />
                <Text style={[styles.clearFiltersText, { color: themeColors.sell }]}>Resetta ({activeFilterCount})</Text>
              </Pressable>
            )}
          </View>

          <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Esito</Text>
          <View style={styles.filterRow}>
            <FilterChip label="Tutti" isActive={selectedOutcome === null} onPress={() => setSelectedOutcome(null)} themeColors={themeColors} />
            <FilterChip label="Vincenti" isActive={selectedOutcome === "hit_tp"} onPress={() => setSelectedOutcome(selectedOutcome === "hit_tp" ? null : "hit_tp")} themeColors={themeColors} color={themeColors.buy} />
            <FilterChip label="SL Colpito" isActive={selectedOutcome === "hit_sl"} onPress={() => setSelectedOutcome(selectedOutcome === "hit_sl" ? null : "hit_sl")} themeColors={themeColors} color={themeColors.sell} />
            <FilterChip label="In Corso" isActive={selectedOutcome === "pending"} onPress={() => setSelectedOutcome(selectedOutcome === "pending" ? null : "pending")} themeColors={themeColors} color={themeColors.hold} />
          </View>

          <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Livello TP</Text>
          <View style={styles.filterRow}>
            <FilterChip label="Tutti" isActive={selectedTpLevel === null} onPress={() => setSelectedTpLevel(null)} themeColors={themeColors} />
            <FilterChip label="TP1+" isActive={selectedTpLevel === 1} onPress={() => setSelectedTpLevel(selectedTpLevel === 1 ? null : 1)} themeColors={themeColors} color="#81C784" />
            <FilterChip label="TP2+" isActive={selectedTpLevel === 2} onPress={() => setSelectedTpLevel(selectedTpLevel === 2 ? null : 2)} themeColors={themeColors} color="#4CAF50" />
            <FilterChip label="TP3" isActive={selectedTpLevel === 3} onPress={() => setSelectedTpLevel(selectedTpLevel === 3 ? null : 3)} themeColors={themeColors} color="#FFD700" />
          </View>

          <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Coppia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
            <FilterChip label="Tutte" isActive={selectedPair === null} onPress={() => setSelectedPair(null)} themeColors={themeColors} />
            {uniquePairs.map(pair => (
              <FilterChip key={pair} label={pair} isActive={selectedPair === pair} onPress={() => setSelectedPair(selectedPair === pair ? null : pair)} themeColors={themeColors} />
            ))}
          </ScrollView>

          <Text style={[styles.filterLabel, { color: themeColors.textMuted }]}>Mese</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
            <FilterChip label="Tutti" isActive={selectedMonth === null} onPress={() => setSelectedMonth(null)} themeColors={themeColors} />
            {uniqueMonths.map(m => (
              <FilterChip key={m} label={getMonthLabel(m)} isActive={selectedMonth === m} onPress={() => setSelectedMonth(selectedMonth === m ? null : m)} themeColors={themeColors} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.resultsRow}>
          <Text style={[styles.resultsCount, { color: themeColors.textSecondary }]}>
            {filteredHistory.length} segnali
          </Text>
        </View>
        </>
        )}
      </View>
    );
  }, [stats, timeline, themeColors, activeBreakdown, selectedPair, selectedMonth, selectedOutcome, selectedTpLevel, uniquePairs, uniqueMonths, activeFilterCount, clearFilters, showPairStats, sortedPairStats, filteredHistory.length, activeTab, performance, renderScalpingContent]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <FlatList
        data={activeTab === "forex" ? filteredHistory : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        renderItem={({ item, index }) => <HistoryCard item={item} index={index} />}
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 20 }]}
        showsVerticalScrollIndicator={false}
        windowSize={7}
        maxToRenderPerBatch={10}
        ListEmptyComponent={
          activeTab === "forex" && activeFilterCount > 0 ? (
            <View style={styles.emptyFilterContainer}>
              <Ionicons name="filter-outline" size={36} color={themeColors.textMuted} />
              <Text style={[styles.emptyFilterText, { color: themeColors.textSecondary }]}>Nessun segnale corrisponde ai filtri selezionati</Text>
              <Pressable onPress={clearFilters} style={[styles.clearAllBtn, { backgroundColor: themeColors.accent + "15" }]}>
                <Text style={[styles.clearAllBtnText, { color: themeColors.accent }]}>Resetta filtri</Text>
              </Pressable>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  tabSelector: { flexDirection: "row" as const, gap: 8, marginBottom: 14 },
  tabBtn: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  tabBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  globalStatsCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12, gap: 8 },
  emptyInlineContainer: { alignItems: "center" as const, paddingVertical: 40, gap: 10 },
  buySellRow: { flexDirection: "row" as const, alignItems: "center" as const, paddingVertical: 8, borderBottomWidth: 0.5 },
  buySellPair: { width: 70, fontSize: 11, fontFamily: "Inter_700Bold" },
  buySellBarContainer: { flex: 1, gap: 3 },
  buySellBar: { height: 6, borderRadius: 3, overflow: "hidden" as const, flexDirection: "row" as const },
  buySellFill: { height: "100%" as any, borderRadius: 3 },
  buySellLabels: { flexDirection: "row" as const, justifyContent: "space-between" as const },
  buySellLabel: { fontSize: 9, fontFamily: "Inter_500Medium" },
  chartSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    overflow: "hidden",
  },
  chartTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  chartTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  chartTotalPips: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  chartEmpty: {
    height: 100,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  chartEmptyText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  breakdownRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  breakdownCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    gap: 2,
  },
  breakdownLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  breakdownWinRate: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  breakdownSub: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  breakdownPips: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  statsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  statsGrid: { flexDirection: "row", justifyContent: "space-between" },
  statsCell: { alignItems: "center", gap: 2 },
  statsBigValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statsSmallLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  winBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  winFill: { height: "100%", borderRadius: 3 },
  tpBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tpBreakdownItem: {
    alignItems: "center",
    gap: 2,
  },
  tpBreakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  tpBreakdownValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  tpBreakdownLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  bestPairRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bestPairText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  pairStatsSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  pairStatsTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pairStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  pairStatsCard: {
    width: "47%" as any,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  pairStatsTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pairStatsName: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  pairStatsBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pairStatsWR: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  pairStatsPips: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  pairStatsBar: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  pairStatsBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  pairStatsRecord: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
  },
  filtersSection: {
    marginBottom: 12,
  },
  filtersSectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingVertical: 20,
  },
  filtersTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  filtersTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  clearFiltersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  clearFiltersText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  filterLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 8,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterScroll: {
    marginBottom: 2,
  },
  filterScrollContent: {
    gap: 6,
    paddingRight: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  resultsRow: {
    marginBottom: 8,
  },
  resultsCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardRight: {},
  pairText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  actionChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  actionChipText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  timeframeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  outcomeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  outcomeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  priceGrid: { flexDirection: "row", gap: 8, marginBottom: 10 },
  priceCell: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 6, borderRadius: 6 },
  priceCellLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  priceCellValue: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardFooterRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  replayBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  replayBtnText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  dateText: { fontSize: 10, fontFamily: "Inter_400Regular" },
  confidenceText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyFilterContainer: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyFilterText: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center" },
  clearAllBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, marginTop: 4 },
  clearAllBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
