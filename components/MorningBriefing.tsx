import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

export default function MorningBriefing() {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<{ briefing: string; generatedAt: number }>({
    queryKey: ["/api/briefing"],
    staleTime: 4 * 3600000,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="newspaper-outline" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>Briefing del Giorno</Text>
          </View>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (!data?.briefing) return null;

  const lines = data.briefing.split("\n").filter(l => l.trim());
  const headline = lines[0] || "Briefing";
  const points = lines.length > 1
    ? lines.slice(1).join(" ").split("|").map(p => p.trim()).filter(Boolean)
    : data.briefing.split("|").slice(1).map(p => p.trim()).filter(Boolean);

  const dateStr = new Date(data.generatedAt).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(200)}>
      <Pressable onPress={() => setExpanded(!expanded)}>
        <LinearGradient
          colors={[colors.accent + "08", colors.accent + "03"]}
          style={[styles.container, { borderColor: colors.accent + "25" }]}
        >
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: colors.accent + "18" }]}>
              <Ionicons name="newspaper-outline" size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={expanded ? 0 : 1}>
                {headline}
              </Text>
              <Text style={[styles.time, { color: colors.textMuted }]}>
                Aggiornato alle {dateStr}
              </Text>
            </View>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textMuted}
            />
          </View>

          {expanded && points.length > 0 && (
            <View style={styles.pointsList}>
              {points.map((point, i) => (
                <View key={i} style={styles.pointRow}>
                  <View style={[styles.bullet, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.pointText, { color: colors.textSecondary }]}>{point}</Text>
                </View>
              ))}
            </View>
          )}
        </LinearGradient>
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
  time: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  pointsList: {
    marginTop: 12,
    gap: 8,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingLeft: 4,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
  },
  pointText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
});
