import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  Easing,
  FadeInDown,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

interface VolatilityPair {
  pair: string;
  price: number;
  volatilityPct: number;
  level: string;
  trend: "up" | "down" | "stable";
  stdDev: number;
  range: number;
}

interface VolatilityData {
  pairs: VolatilityPair[];
  summary: {
    bassa: number;
    media: number;
    alta: number;
    estrema: number;
  };
}

const LEVEL_COLORS: Record<string, string> = {
  Bassa: "#00C896",
  Media: "#FBBF24",
  Alta: "#F97316",
  Estrema: "#EF4444",
};

const LEVEL_MAX: Record<string, number> = {
  Bassa: 25,
  Media: 50,
  Alta: 75,
  Estrema: 100,
};

function PulsingGlow({ color }: { color: string }) {
  const opacity = useSharedValue(0.3);
  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: -2,
          left: -2,
          right: -2,
          bottom: -2,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

function VolatilityItem({ item, index }: { item: VolatilityPair; index: number }) {
  const { colors: C } = useTheme();
  const levelColor = LEVEL_COLORS[item.level] || C.textMuted;
  const barWidth = LEVEL_MAX[item.level] || 50;
  const isExtrema = item.level === "Estrema";
  const priceDecimals = item.price > 100 ? 2 : item.price > 10 ? 2 : item.price > 1 ? 4 : 5;

  const trendIcon = item.trend === "up" ? "arrow-up" : item.trend === "down" ? "arrow-down" : "remove";
  const trendColor = item.trend === "up" ? "#EF4444" : item.trend === "down" ? "#00C896" : C.textMuted;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <View style={[styles.card, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
        {isExtrema && <PulsingGlow color={levelColor} />}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.pairRow}>
              <Text style={[styles.pairText, { color: C.text }]}>{item.pair}</Text>
              <View style={[styles.levelBadge, { backgroundColor: levelColor + "18", borderColor: levelColor + "40" }]}>
                <Text style={[styles.levelText, { color: levelColor }]}>{item.level}</Text>
              </View>
            </View>
            <Text style={[styles.priceText, { color: C.textSecondary }]}>
              {item.price.toFixed(priceDecimals)}
            </Text>
          </View>
          <View style={styles.rightSection}>
            <Text style={[styles.volValue, { color: levelColor }]}>
              {item.volatilityPct.toFixed(3)}%
            </Text>
            <View style={styles.trendRow}>
              <Ionicons name={trendIcon as any} size={12} color={trendColor} />
              <Text style={[styles.trendText, { color: trendColor }]}>
                {item.trend === "up" ? "In aumento" : item.trend === "down" ? "In calo" : "Stabile"}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.barTrack, { backgroundColor: C.backgroundElevated }]}>
          <View
            style={[
              styles.barFill,
              {
                width: `${barWidth}%` as any,
                backgroundColor: levelColor,
              },
            ]}
          />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>Range</Text>
            <Text style={[styles.statValue, { color: C.textSecondary }]}>{item.range.toFixed(3)}%</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: C.textMuted }]}>Std Dev</Text>
            <Text style={[styles.statValue, { color: C.textSecondary }]}>{item.stdDev.toFixed(5)}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default function VolatilityScreen() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading } = useQuery<VolatilityData>({
    queryKey: ["/api/volatility"],
    refetchInterval: 15000,
  });

  const pairs = data?.pairs ?? [];
  const summary = data?.summary ?? { bassa: 0, media: 0, alta: 0, estrema: 0 };

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={[styles.summaryCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
        <Text style={[styles.summaryTitle, { color: C.text }]}>Panoramica Volatilita</Text>
        <View style={styles.summaryGrid}>
          {([
            { label: "Bassa", count: summary.bassa, color: LEVEL_COLORS.Bassa },
            { label: "Media", count: summary.media, color: LEVEL_COLORS.Media },
            { label: "Alta", count: summary.alta, color: LEVEL_COLORS.Alta },
            { label: "Estrema", count: summary.estrema, color: LEVEL_COLORS.Estrema },
          ] as const).map((item) => (
            <View key={item.label} style={[styles.summaryItem, { backgroundColor: item.color + "10", borderColor: item.color + "25" }]}>
              <View style={[styles.summaryDot, { backgroundColor: item.color }]} />
              <Text style={[styles.summaryCount, { color: item.color }]}>{item.count}</Text>
              <Text style={[styles.summaryLabel, { color: C.textSecondary }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
      {pairs.length === 0 && !isLoading && (
        <View style={styles.emptyState}>
          <Ionicons name="pulse-outline" size={40} color={C.textMuted} />
          <Text style={[styles.emptyTitle, { color: C.text }]}>Dati in raccolta</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            I dati di volatilita vengono raccolti durante il monitoraggio dei prezzi. Attendi qualche minuto per i primi risultati.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={pairs}
        keyExtractor={(item) => item.pair}
        renderItem={({ item, index }) => <VolatilityItem item={item} index={index} />}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ paddingBottom: bottomInset + 20, paddingHorizontal: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/volatility"] })}
            tintColor={C.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
  },
  summaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  summaryCount: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  summaryLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    overflow: "hidden",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  pairRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pairText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  levelText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priceText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
  },
  rightSection: {
    alignItems: "flex-end",
    gap: 4,
  },
  volValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  trendText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 10,
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  statValue: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
