import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, useAnimatedStyle, withSpring, useSharedValue } from "react-native-reanimated";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { NewsSkeleton } from "@/components/SkeletonLoader";

interface NewsItem {
  id: string;
  title: string;
  source: string;
  summary: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  currencies: string[];
  timestamp: string;
  url?: string;
}

function useImpactConfig() {
  const { colors: C } = useTheme();
  return {
    HIGH: { color: C.sell, bg: C.sellBg, border: C.sellBorder, label: "ALTO" },
    MEDIUM: { color: C.hold, bg: C.holdBg, border: C.holdBorder, label: "MEDIO" },
    LOW: { color: C.textSecondary, bg: C.backgroundElevated, border: C.border, label: "BASSO" },
  };
}

function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const { colors: themeColors } = useTheme();
  const impactConfig = useImpactConfig();
  const impact = impactConfig[item.impact];
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (h > 23) return `${Math.floor(h / 24)}g fa`;
    if (h > 0) return `${h}h fa`;
    return `${m}m fa`;
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={animStyle}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.98); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: "/news/[id]",
            params: { id: item.id, data: JSON.stringify(item) },
          });
        }}
        style={[styles.card, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.sourceRow}>
            <View style={[styles.impactDot, { backgroundColor: impact.color }]} />
            <Text style={[styles.sourceText, { color: themeColors.textSecondary }]}>{item.source}</Text>
            <Text style={[styles.timeText, { color: themeColors.textMuted }]}>{timeAgo(item.timestamp)}</Text>
          </View>
          <View style={[styles.impactBadge, { backgroundColor: impact.bg, borderColor: impact.border }]}>
            <Text style={[styles.impactText, { color: impact.color }]}>{impact.label}</Text>
          </View>
        </View>

        <Text style={[styles.titleText, { color: themeColors.text }]} numberOfLines={3}>
          {item.title}
        </Text>

        <Text style={[styles.summaryText, { color: themeColors.textSecondary }]} numberOfLines={2}>
          {item.summary}
        </Text>

        <View style={styles.currencyRow}>
          {item.currencies.map((c) => (
            <View key={c} style={[styles.currencyBadge, { backgroundColor: themeColors.backgroundElevated }]}>
              <Text style={[styles.currencyText, { color: themeColors.accent }]}>{c}</Text>
            </View>
          ))}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const queryClient = useQueryClient();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;
  const [marketFilter, setMarketFilter] = React.useState<"all" | "forex" | "commodities">("all");
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const newsUrl = marketFilter === "all" ? "/api/news" : `/api/news?market=${marketFilter}`;
  const { data: news = [], isLoading } = useQuery<NewsItem[]>({
    queryKey: [newsUrl],
  });

  const handleRefresh = React.useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/news");
      },
    });
    setIsRefreshing(false);
  }, [queryClient]);

  const filterOptions = [
    { key: "all" as const, label: "Tutte" },
    { key: "forex" as const, label: "Forex" },
    { key: "commodities" as const, label: "Commodities" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Notizie Mercati</Text>
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
              Aggiornamenti economici in tempo reale
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/calendar");
            }}
            style={[styles.calendarBtn, { backgroundColor: themeColors.backgroundCard, borderColor: themeColors.border }]}
          >
            <Ionicons name="calendar" size={18} color={themeColors.sell} />
          </Pressable>
        </View>
        <View style={styles.marketFilterRow}>
          {filterOptions.map(opt => {
            const active = marketFilter === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => { setMarketFilter(opt.key); Haptics.selectionAsync(); }}
                style={[styles.marketFilterBtn, { backgroundColor: active ? themeColors.accent + "15" : "transparent", borderColor: active ? themeColors.accent + "40" : "transparent" }]}
              >
                <Text style={[styles.marketFilterText, { color: active ? themeColors.accent : themeColors.textMuted, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2, 3].map((i) => <NewsSkeleton key={i} />)}
        </View>
      ) : news.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.accent + "15" }]}>
            <Ionicons name="newspaper-outline" size={36} color={themeColors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Nessuna notizia</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
            Genera dei segnali dalla schermata Segnali per ricevere le notizie correlate ai mercati
          </Text>
          <View style={styles.emptyHintRow}>
            <Ionicons name="arrow-down-outline" size={14} color={themeColors.textMuted} />
            <Text style={[styles.emptyHintText, { color: themeColors.textMuted }]}>
              Scorri verso il basso per aggiornare
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={news}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <NewsCard item={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={themeColors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  calendarBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.text,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  marketFilterRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  marketFilterBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  marketFilterText: { fontSize: 12 },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  impactDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sourceText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  timeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  impactText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  titleText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 21,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 12,
  },
  currencyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  currencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  currencyText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  emptyHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    opacity: 0.7,
  },
  emptyHintText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
