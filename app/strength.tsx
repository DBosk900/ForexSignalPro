import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

interface StrengthItem {
  currency: string;
  strength: number;
}

const FLAGS: Record<string, string> = {
  EUR: "EU",
  USD: "US",
  GBP: "GB",
  JPY: "JP",
  AUD: "AU",
  NZD: "NZ",
  CAD: "CA",
  CHF: "CH",
};

const CURRENCY_NAMES: Record<string, string> = {
  EUR: "Euro",
  USD: "Dollaro USA",
  GBP: "Sterlina",
  JPY: "Yen",
  AUD: "Dollaro Aus.",
  NZD: "Dollaro NZ",
  CAD: "Dollaro Can.",
  CHF: "Franco Sv.",
};

function getBarColor(strength: number, max: number): string {
  if (max === 0) return "#FBBF24";
  const ratio = strength / max;
  if (ratio > 0.5) return "#00D4AA";
  if (ratio > 0) return "#4ADE80";
  if (ratio > -0.5) return "#FB923C";
  return "#EF4444";
}

export default function StrengthScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const { data, isLoading, refetch, isRefetching } = useQuery<StrengthItem[]>({
    queryKey: ["/api/strength"],
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const maxStrength = data ? Math.max(...data.map(d => d.strength), 1) : 100;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={[styles.infoCard, { backgroundColor: colors.accent + "08", borderColor: colors.accent + "20" }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            La forza relativa viene calcolata dai segnali TradingView Recommend.All multi-timeframe (H1 20%, H4 50%, D1 30%) su tutte le coppie forex. Una valuta forte tende a salire rispetto alle altre.
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          data?.map((item, index) => {
            const barWidth = item.strength / maxStrength * 100;
            const isStrong = item.strength >= 50;
            const barColor = isStrong ? "#00D4AA" : item.strength >= 30 ? "#FBBF24" : "#EF4444";

            return (
              <Animated.View
                key={item.currency}
                entering={FadeInDown.duration(300).delay(index * 60)}
                style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
              >
                <View style={styles.currencyInfo}>
                  <Text style={[styles.rank, { color: colors.textMuted }]}>#{index + 1}</Text>
                  <View style={[styles.flagCircle, { backgroundColor: barColor + "15" }]}>
                    <Text style={styles.flagText}>{item.currency}</Text>
                  </View>
                  <View>
                    <Text style={[styles.currencyCode, { color: colors.text }]}>{item.currency}</Text>
                    <Text style={[styles.currencyName, { color: colors.textMuted }]}>
                      {CURRENCY_NAMES[item.currency] || item.currency}
                    </Text>
                  </View>
                </View>

                <View style={styles.barSection}>
                  <View style={[styles.barTrack, { backgroundColor: colors.backgroundElevated }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.max(barWidth, 5)}%`,
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthValue, { color: barColor }]}>
                    {item.strength.toFixed(1)}
                  </Text>
                </View>

                <View style={styles.badge}>
                  <Ionicons
                    name={isStrong ? "arrow-up" : "arrow-down"}
                    size={12}
                    color={barColor}
                  />
                </View>
              </Animated.View>
            );
          })
        )}

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#00D4AA" }]} />
            <Text style={[styles.legendText, { color: colors.textMuted }]}>Forte</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
            <Text style={[styles.legendText, { color: colors.textMuted }]}>Debole</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  infoCard: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 17,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  currencyInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: 120,
  },
  rank: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    width: 22,
  },
  flagCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  flagText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  currencyCode: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  currencyName: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  barSection: {
    flex: 1,
    gap: 4,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
  strengthValue: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  badge: {
    width: 24,
    alignItems: "center",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
