import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import Animated, {
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";

interface PairStat {
  pair: string;
  pips: number;
  wins: number;
  losses: number;
}

interface PeriodStats {
  signalsCount: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPips: number;
  tp3Count: number;
  tp2Count: number;
  tp1Count: number;
  bestPair: PairStat | null;
  worstPair: PairStat | null;
}

interface ReportData {
  period: string;
  periodLabel: string;
  current: PeriodStats;
  previous: PeriodStats;
  delta: {
    winRate: number;
    totalPips: number;
    signalsCount: number;
  };
  grade: string;
  gradeColor: string;
  aiInsights: string;
  generatedAt: number;
}

function DeltaBadge({ value, suffix }: { value: number; suffix?: string }) {
  const { colors } = useTheme();
  const isPositive = value > 0;
  const isZero = value === 0;
  const color = isZero ? colors.textMuted : isPositive ? colors.buy : colors.sell;
  const icon = isZero ? "remove" : isPositive ? "arrow-up" : "arrow-down";
  return (
    <View style={[styles.deltaBadge, { backgroundColor: color + "18" }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.deltaText, { color }]}>
        {isPositive ? "+" : ""}{value}{suffix || ""}
      </Text>
    </View>
  );
}

function GradeCard({ grade, gradeColor, current }: { grade: string; gradeColor: string; current: PeriodStats }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(100).duration(500)}
      style={[styles.gradeCard, { backgroundColor: gradeColor + "12", borderColor: gradeColor + "40" }]}
    >
      <View style={[styles.gradeCircle, { borderColor: gradeColor, shadowColor: gradeColor }]}>
        <Text style={[styles.gradeText, { color: gradeColor }]}>{grade}</Text>
      </View>
      <Text style={[styles.gradeLabel, { color: colors.textSecondary }]}>Pagella</Text>
      <View style={styles.gradeStats}>
        <View style={styles.gradeStat}>
          <Text style={[styles.gradeStatValue, { color: colors.text }]}>{current.winRate}%</Text>
          <Text style={[styles.gradeStatLabel, { color: colors.textMuted }]}>Win Rate</Text>
        </View>
        <View style={[styles.gradeDivider, { backgroundColor: colors.border }]} />
        <View style={styles.gradeStat}>
          <Text style={[styles.gradeStatValue, { color: current.totalPips >= 0 ? colors.buy : colors.sell }]}>
            {current.totalPips >= 0 ? "+" : ""}{current.totalPips}
          </Text>
          <Text style={[styles.gradeStatLabel, { color: colors.textMuted }]}>Pips</Text>
        </View>
        <View style={[styles.gradeDivider, { backgroundColor: colors.border }]} />
        <View style={styles.gradeStat}>
          <Text style={[styles.gradeStatValue, { color: colors.text }]}>{current.signalsCount}</Text>
          <Text style={[styles.gradeStatLabel, { color: colors.textMuted }]}>Segnali</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function StatComparisonCard({
  label,
  icon,
  currentValue,
  delta,
  suffix,
  index,
}: {
  label: string;
  icon: string;
  currentValue: string;
  delta: number;
  suffix?: string;
  index: number;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(200 + index * 80).duration(400)}
      style={[styles.statCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
    >
      <View style={styles.statCardHeader}>
        <View style={[styles.statIconWrap, { backgroundColor: colors.accent + "15" }]}>
          <Ionicons name={icon as any} size={16} color={colors.accent} />
        </View>
        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
        <DeltaBadge value={delta} suffix={suffix} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{currentValue}</Text>
    </Animated.View>
  );
}

function PairCard({ pair, type, index }: { pair: PairStat; type: "best" | "worst"; index: number }) {
  const { colors } = useTheme();
  const isBest = type === "best";
  const cardColor = isBest ? colors.buy : colors.sell;
  return (
    <Animated.View
      entering={FadeInDown.delay(500 + index * 80).duration(400)}
      style={[styles.pairCard, { backgroundColor: cardColor + "10", borderColor: cardColor + "30" }]}
    >
      <View style={styles.pairCardHeader}>
        <Ionicons name={isBest ? "trending-up" : "trending-down"} size={18} color={cardColor} />
        <Text style={[styles.pairCardTitle, { color: colors.textSecondary }]}>
          {isBest ? "Miglior Coppia" : "Peggior Coppia"}
        </Text>
      </View>
      <Text style={[styles.pairName, { color: colors.text }]}>{pair.pair}</Text>
      <View style={styles.pairStats}>
        <Text style={[styles.pairPips, { color: pair.pips >= 0 ? colors.buy : colors.sell }]}>
          {pair.pips >= 0 ? "+" : ""}{pair.pips} pips
        </Text>
        <Text style={[styles.pairWL, { color: colors.textMuted }]}>
          {pair.wins}W / {pair.losses}L
        </Text>
      </View>
    </Animated.View>
  );
}

function BreakdownCard({ current, index }: { current: PeriodStats; index: number }) {
  const { colors } = useTheme();
  const total = current.tp3Count + current.tp2Count + current.tp1Count + current.losses;
  const getWidth = (count: number) => total > 0 ? Math.max(count / total * 100, 4) : 25;

  return (
    <Animated.View
      entering={FadeInDown.delay(400 + index * 80).duration(400)}
      style={[styles.breakdownCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
    >
      <Text style={[styles.breakdownTitle, { color: colors.text }]}>Distribuzione Esiti</Text>
      <View style={styles.breakdownBar}>
        {current.tp3Count > 0 && (
          <View style={[styles.barSegment, { width: `${getWidth(current.tp3Count)}%`, backgroundColor: colors.buy }]} />
        )}
        {current.tp2Count > 0 && (
          <View style={[styles.barSegment, { width: `${getWidth(current.tp2Count)}%`, backgroundColor: "#00B8A0" }]} />
        )}
        {current.tp1Count > 0 && (
          <View style={[styles.barSegment, { width: `${getWidth(current.tp1Count)}%`, backgroundColor: colors.hold }]} />
        )}
        {current.losses > 0 && (
          <View style={[styles.barSegment, { width: `${getWidth(current.losses)}%`, backgroundColor: colors.sell }]} />
        )}
      </View>
      <View style={styles.breakdownLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.buy }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>TP3: {current.tp3Count}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#00B8A0" }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>TP2: {current.tp2Count}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.hold }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>TP1: {current.tp1Count}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.sell }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>SL: {current.losses}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function InsightsCard({ insights, index }: { insights: string; index: number }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const lines = insights.split("\n").filter(l => l.trim());
  const preview = lines.slice(0, 2).join("\n");
  const full = lines.join("\n");

  return (
    <Animated.View
      entering={FadeInDown.delay(600 + index * 80).duration(400)}
      style={[styles.insightsCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
    >
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={styles.insightsHeader}
      >
        <View style={[styles.insightsIconWrap, { backgroundColor: "rgba(129,140,248,0.15)" }]}>
          <Ionicons name="sparkles" size={16} color="#818CF8" />
        </View>
        <Text style={[styles.insightsTitle, { color: colors.text }]}>Analisi IA</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
      <Text style={[styles.insightsText, { color: colors.textSecondary }]}>
        {expanded ? full : preview}
      </Text>
      {!expanded && lines.length > 2 && (
        <Text style={[styles.readMore, { color: colors.accent }]}>Tocca per espandere</Text>
      )}
    </Animated.View>
  );
}

export default function ReportScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading, isError } = useQuery<ReportData>({
    queryKey: [`/api/report?period=${period}`],
    staleTime: 120000,
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View
        entering={FadeInUp.duration(400)}
        style={[styles.periodToggle, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
      >
        <Pressable
          onPress={() => setPeriod("weekly")}
          style={[
            styles.periodBtn,
            period === "weekly" && { backgroundColor: colors.accent + "20" },
          ]}
        >
          <Text
            style={[
              styles.periodBtnText,
              { color: period === "weekly" ? colors.accent : colors.textMuted },
            ]}
          >
            Settimana
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setPeriod("monthly")}
          style={[
            styles.periodBtn,
            period === "monthly" && { backgroundColor: colors.accent + "20" },
          ]}
        >
          <Text
            style={[
              styles.periodBtnText,
              { color: period === "monthly" ? colors.accent : colors.textMuted },
            ]}
          >
            Mese
          </Text>
        </Pressable>
      </Animated.View>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Generazione report...
          </Text>
        </View>
      )}

      {isError && (
        <View style={styles.loadingContainer}>
          <Ionicons name="warning-outline" size={40} color={colors.sell} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Errore nel caricamento del report
          </Text>
        </View>
      )}

      {data && !isLoading && (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <GradeCard
            grade={data.grade}
            gradeColor={data.gradeColor}
            current={data.current}
          />

          <StatComparisonCard
            label="Win Rate"
            icon="trophy-outline"
            currentValue={`${data.current.winRate}%`}
            delta={data.delta.winRate}
            suffix="%"
            index={0}
          />
          <StatComparisonCard
            label="Pips Totali"
            icon="trending-up-outline"
            currentValue={`${data.current.totalPips >= 0 ? "+" : ""}${data.current.totalPips}`}
            delta={data.delta.totalPips}
            index={1}
          />
          <StatComparisonCard
            label="Segnali Chiusi"
            icon="pulse-outline"
            currentValue={`${data.current.signalsCount}`}
            delta={data.delta.signalsCount}
            index={2}
          />

          <BreakdownCard current={data.current} index={3} />

          {data.current.bestPair && data.current.worstPair && (
            <View style={styles.pairRow}>
              <PairCard pair={data.current.bestPair} type="best" index={0} />
              <PairCard pair={data.current.worstPair} type="worst" index={1} />
            </View>
          )}

          {data.aiInsights && (
            <InsightsCard insights={data.aiInsights} index={4} />
          )}

          <Text style={[styles.generatedAt, { color: colors.textMuted }]}>
            Generato: {new Date(data.generatedAt).toLocaleString("it-IT")}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  periodToggle: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  periodBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  gradeCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  gradeCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  gradeText: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
  },
  gradeLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 16,
  },
  gradeStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  gradeStat: {
    alignItems: "center",
    gap: 2,
  },
  gradeStatValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  gradeStatLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  gradeDivider: {
    width: 1,
    height: 28,
  },
  statCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  statCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  statIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginLeft: 36,
  },
  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  deltaText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  breakdownCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  breakdownTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  breakdownBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    gap: 2,
    marginBottom: 12,
  },
  barSegment: {
    borderRadius: 5,
  },
  breakdownLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  pairRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  pairCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  pairCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  pairCardTitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  pairName: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  pairStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pairPips: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  pairWL: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  insightsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  insightsIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  insightsTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  insightsText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  readMore: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
  },
  generatedAt: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
});
