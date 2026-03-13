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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

interface Pattern {
  title: string;
  description: string;
  type: "positive" | "neutral";
}

interface Weakness {
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
}

interface Tip {
  title: string;
  description: string;
}

interface JournalData {
  patterns: Pattern[];
  weaknesses: Weakness[];
  tips: Tip[];
  stats: {
    totalSignals: number;
    winRate: number;
    totalPips: number;
    closed?: number;
    wins?: number;
    losses?: number;
    bestPair: string;
    worstPair: string;
  };
  generatedAt: number;
  insufficient?: boolean;
}

function ShimmerBar() {
  const shimmer = useSharedValue(0);
  React.useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + shimmer.value * 0.4,
  }));

  return (
    <Animated.View style={[{ height: 12, borderRadius: 6, backgroundColor: "#1E2D45", marginBottom: 10 }, style]} />
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  const { colors } = useTheme();
  return (
    <View style={[s.statCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
      <View style={[s.statIconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[s.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[s.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function ExpandableCard({
  title,
  description,
  icon,
  iconColor,
  badgeColor,
  badgeText,
  index,
}: {
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  badgeColor?: string;
  badgeText?: string;
  index: number;
}) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <Pressable
        onPress={() => {
          setExpanded(!expanded);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={[s.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
      >
        <View style={s.cardHeader}>
          <View style={[s.cardIconWrap, { backgroundColor: iconColor + "18" }]}>
            <Ionicons name={icon as any} size={18} color={iconColor} />
          </View>
          <View style={s.cardTitleWrap}>
            <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={expanded ? undefined : 1}>{title}</Text>
            {badgeText && badgeColor && (
              <View style={[s.badge, { backgroundColor: badgeColor + "20" }]}>
                <Text style={[s.badgeText, { color: badgeColor }]}>{badgeText}</Text>
              </View>
            )}
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textMuted}
          />
        </View>
        {expanded && (
          <Text style={[s.cardDesc, { color: colors.textSecondary }]}>{description}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function JournalScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const { data, isLoading, error } = useQuery<JournalData>({
    queryKey: ["/api/journal"],
    staleTime: 3600000,
  });

  const severityColor = (sev: string) => {
    switch (sev) {
      case "high": return "#FF4D6A";
      case "medium": return "#FFB347";
      case "low": return "#00D4AA";
      default: return colors.textMuted;
    }
  };

  const severityLabel = (sev: string) => {
    switch (sev) {
      case "high": return "Alto";
      case "medium": return "Medio";
      case "low": return "Basso";
      default: return sev;
    }
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topInset + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.text }]}>Diario di Trading IA</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[s.loadingText, { color: colors.textSecondary }]}>Analisi in corso...</Text>
          <View style={{ width: "80%", marginTop: 20 }}>
            <ShimmerBar />
            <ShimmerBar />
            <ShimmerBar />
          </View>
        </View>
      ) : error ? (
        <View style={s.loadingWrap}>
          <Ionicons name="warning-outline" size={48} color={colors.sell} />
          <Text style={[s.loadingText, { color: colors.textSecondary, marginTop: 12 }]}>
            Errore nel caricamento del diario
          </Text>
        </View>
      ) : data?.insufficient ? (
        <View style={s.loadingWrap}>
          <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>Dati insufficienti</Text>
          <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>
            Servono almeno 3 segnali nello storico per generare il diario di trading.
          </Text>
        </View>
      ) : data ? (
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: bottomInset + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.statsRow}>
            <StatCard
              label="Win Rate"
              value={`${data.stats.winRate}%`}
              color={data.stats.winRate >= 60 ? "#00D4AA" : data.stats.winRate >= 40 ? "#FFB347" : "#FF4D6A"}
              icon="trending-up"
            />
            <StatCard
              label="Pips Totali"
              value={`${data.stats.totalPips >= 0 ? "+" : ""}${data.stats.totalPips}`}
              color={data.stats.totalPips >= 0 ? "#00D4AA" : "#FF4D6A"}
              icon="pulse"
            />
          </View>
          <View style={s.statsRow}>
            <StatCard
              label="Miglior Coppia"
              value={data.stats.bestPair}
              color="#00D4AA"
              icon="star"
            />
            <StatCard
              label="Peggior Coppia"
              value={data.stats.worstPair}
              color="#FF4D6A"
              icon="alert-circle"
            />
          </View>

          {data.stats.closed !== undefined && (
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <View style={[s.summaryBar, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                <View style={s.summaryItem}>
                  <Text style={[s.summaryNum, { color: colors.text }]}>{data.stats.totalSignals}</Text>
                  <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Totali</Text>
                </View>
                <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryNum, { color: "#00D4AA" }]}>{data.stats.wins}</Text>
                  <Text style={[s.summaryLabel, { color: colors.textMuted }]}>TP</Text>
                </View>
                <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryNum, { color: "#FF4D6A" }]}>{data.stats.losses}</Text>
                  <Text style={[s.summaryLabel, { color: colors.textMuted }]}>SL</Text>
                </View>
                <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={s.summaryItem}>
                  <Text style={[s.summaryNum, { color: colors.text }]}>{data.stats.closed}</Text>
                  <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Chiusi</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {data.patterns.length > 0 && (
            <>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: "#00D4AA" }]} />
                <Text style={[s.sectionTitle, { color: colors.textMuted }]}>PATTERN</Text>
              </View>
              {data.patterns.map((p, i) => (
                <ExpandableCard
                  key={`pattern-${i}`}
                  title={p.title}
                  description={p.description}
                  icon={p.type === "positive" ? "checkmark-circle" : "information-circle"}
                  iconColor={p.type === "positive" ? "#00D4AA" : "#818CF8"}
                  index={i}
                />
              ))}
            </>
          )}

          {data.weaknesses.length > 0 && (
            <>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: "#FF4D6A" }]} />
                <Text style={[s.sectionTitle, { color: colors.textMuted }]}>PUNTI DEBOLI</Text>
              </View>
              {data.weaknesses.map((w, i) => (
                <ExpandableCard
                  key={`weak-${i}`}
                  title={w.title}
                  description={w.description}
                  icon="warning"
                  iconColor={severityColor(w.severity)}
                  badgeColor={severityColor(w.severity)}
                  badgeText={severityLabel(w.severity)}
                  index={i}
                />
              ))}
            </>
          )}

          {data.tips.length > 0 && (
            <>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: "#818CF8" }]} />
                <Text style={[s.sectionTitle, { color: colors.textMuted }]}>SUGGERIMENTI</Text>
              </View>
              {data.tips.map((t, i) => (
                <ExpandableCard
                  key={`tip-${i}`}
                  title={t.title}
                  description={t.description}
                  icon="bulb"
                  iconColor="#FFB347"
                  index={i}
                />
              ))}
            </>
          )}

          <View style={s.footer}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[s.footerText, { color: colors.textMuted }]}>
              Generato {new Date(data.generatedAt).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  loadingText: { fontSize: 15, fontFamily: "Inter_500Medium", marginTop: 16 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 16, textAlign: "center" as const },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" as const, marginTop: 8, lineHeight: 20 },
  content: { paddingHorizontal: 16 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  summaryBar: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 6,
    justifyContent: "space-around",
  },
  summaryItem: { alignItems: "center", gap: 2 },
  summaryNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: "80%" as any, alignSelf: "center" as const },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 22,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitleWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  cardDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 10, paddingLeft: 44 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 24, marginBottom: 20 },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
