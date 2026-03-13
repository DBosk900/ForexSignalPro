import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

interface MarketSentiment {
  label: "Risk-On" | "Risk-Off" | "Neutro";
  score: number;
  summary: string;
  details: string[];
  trend: "rialzista" | "ribassista" | "laterale";
  generatedAt?: number;
}

export default function MarketSentimentBanner() {
  const { colors } = useTheme();

  const { data, isLoading, refetch, isFetching } = useQuery<MarketSentiment>({
    queryKey: ["/api/market-sentiment"],
    staleTime: 25 * 60000,
    refetchInterval: 30 * 60000,
  });

  const labelColor = data?.label === "Risk-On" ? "#00D4AA" : data?.label === "Risk-Off" ? "#FF4D6A" : "#FFB347";
  const labelBg = data?.label === "Risk-On" ? "rgba(0,212,170,0.12)" : data?.label === "Risk-Off" ? "rgba(255,77,106,0.12)" : "rgba(255,179,71,0.12)";
  const labelBorder = data?.label === "Risk-On" ? "rgba(0,212,170,0.3)" : data?.label === "Risk-Off" ? "rgba(255,77,106,0.3)" : "rgba(255,179,71,0.3)";
  const trendIcon = data?.trend === "rialzista" ? "trending-up" : data?.trend === "ribassista" ? "trending-down" : "remove";
  const score = data?.score ?? 0;
  const scorePct = ((score + 100) / 200) * 100;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Analisi sentiment in corso...</Text>
      </View>
    );
  }

  if (!data) return null;

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View style={[styles.container, { backgroundColor: colors.backgroundCard, borderColor: labelBorder }]}>
        <View style={styles.header}>
          <View style={styles.labelRow}>
            <View style={[styles.labelBadge, { backgroundColor: labelBg, borderColor: labelBorder }]}>
              <View style={[styles.dot, { backgroundColor: labelColor }]} />
              <Text style={[styles.labelText, { color: labelColor }]}>{data.label}</Text>
            </View>
            <Ionicons name={trendIcon as any} size={16} color={labelColor} />
          </View>
          <Pressable onPress={() => refetch()} hitSlop={8} disabled={isFetching}>
            <Ionicons name="refresh-outline" size={15} color={isFetching ? colors.accent : colors.textMuted} />
          </Pressable>
        </View>

        <Text style={[styles.summary, { color: colors.text }]}>{data.summary}</Text>

        <View style={styles.scoreRow}>
          <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Fear</Text>
          <View style={[styles.scoreBar, { backgroundColor: colors.backgroundElevated }]}>
            <View style={[styles.scoreBarFill, { width: `${scorePct}%` as any, backgroundColor: labelColor }]} />
            <View style={[styles.scoreMarker, { left: `${scorePct}%` as any, backgroundColor: labelColor }]} />
          </View>
          <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>Greed</Text>
        </View>
        <Text style={[styles.scoreValue, { color: labelColor }]}>Score: {score > 0 ? "+" : ""}{score}</Text>

        {data.details.length > 0 && (
          <View style={styles.details}>
            {data.details.map((d, i) => (
              <View key={i} style={styles.detailRow}>
                <View style={[styles.detailDot, { backgroundColor: labelColor }]} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>{d}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Aggiornato ogni 30 min · Basato su segnali AI attivi
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  labelBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  labelText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  summary: { fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  scoreLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", width: 32 },
  scoreBar: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" as const, position: "relative" as const },
  scoreBarFill: { height: "100%", borderRadius: 3 },
  scoreMarker: { position: "absolute" as const, top: -2, width: 10, height: 10, borderRadius: 5, marginLeft: -5 },
  scoreValue: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" as const },
  details: { gap: 4 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 6 },
  detailText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  footer: { fontSize: 10, fontFamily: "Inter_400Regular" },
  loadingText: { fontSize: 12, fontFamily: "Inter_400Regular", marginLeft: 8 },
});
