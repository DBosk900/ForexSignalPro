import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

interface SentimentItem {
  pair: string;
  score: number;
  action: string;
  confidence: number;
}

function getColor(score: number): string {
  if (score >= 60) return "#00D4AA";
  if (score >= 25) return "#4ADE80";
  if (score >= 10) return "#86EFAC";
  if (score > -10) return "#FBBF24";
  if (score > -25) return "#FB923C";
  if (score > -60) return "#F87171";
  return "#EF4444";
}

function getLabel(score: number): string {
  if (score >= 60) return "Forte Rialzo";
  if (score >= 25) return "Rialzista";
  if (score >= 10) return "Legg. Rialzo";
  if (score > -10) return "Neutrale";
  if (score > -25) return "Legg. Ribasso";
  if (score > -60) return "Ribassista";
  return "Forte Ribasso";
}

export default function SentimentHeatmap() {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<SentimentItem[]>({
    queryKey: ["/api/sentiment"],
    staleTime: 120000,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={[styles.iconWrap, { backgroundColor: "#FF634720" }]}>
            <Ionicons name="grid-outline" size={16} color="#FF6347" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Mappa Sentimento</Text>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!data || data.length === 0) return null;

  const bullish = data.filter(s => s.score > 10).length;
  const bearish = data.filter(s => s.score < -10).length;
  const neutral = data.length - bullish - bearish;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(300)}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        <View style={[styles.container, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: "#FF634720" }]}>
              <Ionicons name="grid-outline" size={16} color="#FF6347" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Mappa Sentimento</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                {bullish} rialzisti / {neutral} neutri / {bearish} ribassisti
              </Text>
            </View>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
            />
          </View>

          {expanded && (
            <View style={styles.grid}>
              {data.map((item) => {
                const bg = getColor(item.score);
                return (
                  <View
                    key={item.pair}
                    style={[styles.tile, { backgroundColor: bg + "20", borderColor: bg + "40" }]}
                  >
                    <Text style={[styles.tilePair, { color: colors.text }]}>
                      {item.pair.replace("/", "")}
                    </Text>
                    <Text style={[styles.tileScore, { color: bg }]}>
                      {item.score > 0 ? "+" : ""}{item.score}
                    </Text>
                    <Text style={[styles.tileLabel, { color: colors.textMuted }]}>
                      {getLabel(item.score)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {!expanded && (
            <View style={styles.miniBar}>
              {data.map((item) => (
                <View
                  key={item.pair}
                  style={[styles.miniTick, { backgroundColor: getColor(item.score) }]}
                />
              ))}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  },
  tile: {
    width: "30.5%",
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    alignItems: "center",
  },
  tilePair: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  tileScore: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  tileLabel: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  miniBar: {
    flexDirection: "row",
    gap: 3,
    marginTop: 10,
    height: 4,
  },
  miniTick: {
    flex: 1,
    borderRadius: 2,
    height: 4,
  },
});
