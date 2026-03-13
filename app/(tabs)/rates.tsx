import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Svg, { Polyline, Polygon, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  interpolateColor,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";
import { getApiUrl } from "@/lib/query-client";

type MarketType = "forex" | "commodities";

interface Signal {
  id: string;
  pair: string;
  base: string;
  quote: string;
  action: "BUY" | "SELL" | "HOLD";
  entryPrice: number;
  confidence: number;
  change24h: number;
}

interface TVQuote {
  pair: string;
  price: number;
  change: number;
  changeAbs: number;
  high: number;
  low: number;
  open: number;
}

const COMMODITY_NAMES: Record<string, string> = {
  "XAU/USD": "Oro",
  "XAG/USD": "Argento",
  "WTI/USD": "Petrolio WTI",
  "BRENT/USD": "Brent",
  "NG/USD": "Gas Naturale",
  "XCU/USD": "Rame",
  "XPT/USD": "Platino",
};

const FOREX_NAMES: Record<string, string> = {
  "EUR/USD": "Euro / Dollaro USA",
  "GBP/USD": "Sterlina / Dollaro USA",
  "USD/JPY": "Dollaro USA / Yen",
  "USD/CHF": "Dollaro USA / Franco Svizzero",
  "AUD/USD": "Dollaro Australiano / USD",
  "NZD/USD": "Dollaro Neozelandese / USD",
  "EUR/GBP": "Euro / Sterlina",
  "EUR/JPY": "Euro / Yen",
  "GBP/JPY": "Sterlina / Yen",
  "USD/CAD": "Dollaro USA / Canadese",
};

const COMMODITY_ICONS: Record<string, string> = {
  "XAU/USD": "diamond",
  "XAG/USD": "diamond-outline",
  "WTI/USD": "water",
  "BRENT/USD": "water-outline",
  "NG/USD": "flame",
  "XCU/USD": "cube",
  "XPT/USD": "prism",
};

const MiniChart = React.memo(function MiniChart({ data, color, width = 100, height = 36, pair = "default" }: { data: number[]; color: string; width?: number; height?: number; pair?: string }) {
  if (!data || data.length < 2) return null;
  const padding = 2;
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;
  const gradId = `mini-${pair}`;

  const coords = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - minVal) / range) * (height - padding * 2);
    return { x, y };
  });

  const linePoints = coords.map(c => `${c.x},${c.y}`).join(" ");
  const areaPoints = [
    ...coords.map(c => `${c.x},${c.y}`),
    `${coords[coords.length - 1].x},${height}`,
    `${coords[0].x},${height}`,
  ].join(" ");

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.3" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </SvgGradient>
        </Defs>
        <Polygon points={areaPoints} fill={`url(#${gradId})`} />
        <Polyline points={linePoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
});

const RATE_CARD_HEIGHT = 76;

const RateCard = React.memo(function RateCard({ signal, ratesData, index, market, quote }: { signal: Signal; ratesData?: number[]; index: number; market: MarketType; quote?: TVQuote }) {
  const { colors } = useTheme();
  const livePrice = quote?.price ?? signal.entryPrice;
  const liveChange = quote?.change ?? signal.change24h;
  const isUp = liveChange >= 0;
  const changeColor = isUp ? colors.buy : colors.sell;
  const priceDecimals = livePrice > 100 ? 2 : livePrice > 10 ? 2 : livePrice > 1 ? 4 : 5;
  const displayName = market === "commodities" ? (COMMODITY_NAMES[signal.pair] || signal.pair) : (FOREX_NAMES[signal.pair] || `${signal.base} / ${signal.quote}`);
  const iconName = market === "commodities" ? (COMMODITY_ICONS[signal.pair] || "analytics") : "swap-horizontal";

  const prevPriceRef = useRef(livePrice);
  const flashProgress = useSharedValue(0);
  const flashDirection = useSharedValue(0);

  useEffect(() => {
    const prev = prevPriceRef.current;
    if (prev !== livePrice && prev !== 0) {
      flashDirection.value = livePrice > prev ? 1 : -1;
      flashProgress.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 600 })
      );
    }
    prevPriceRef.current = livePrice;
  }, [livePrice]);

  const flashStyle = useAnimatedStyle(() => {
    const greenColor = "#00C853";
    const redColor = "#FF1744";
    const transparent = "transparent";
    const flashColor = flashDirection.value >= 0 ? greenColor : redColor;
    const bgColor = interpolateColor(
      flashProgress.value,
      [0, 1],
      [transparent, flashColor + "30"]
    );
    return {
      backgroundColor: bgColor,
      borderRadius: 6,
      paddingHorizontal: 4,
      paddingVertical: 1,
    };
  });

  const priceColorStyle = useAnimatedStyle(() => {
    const greenColor = "#00C853";
    const redColor = "#FF1744";
    const normalColor = colors.text;
    const flashColor = flashDirection.value >= 0 ? greenColor : redColor;
    const textColor = interpolateColor(
      flashProgress.value,
      [0, 1],
      [normalColor, flashColor]
    );
    return { color: textColor };
  });

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/pair/[pair]",
      params: {
        pair: signal.pair,
        data: JSON.stringify({ signal, quote, market }),
      },
    });
  }, [signal, quote, market]);

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <Pressable onPress={handlePress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}>
        <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <View style={styles.cardLeft}>
            <View style={[styles.pairIcon, { backgroundColor: colors.accent + "15" }]}>
              <Ionicons name={iconName as any} size={18} color={colors.accent} />
            </View>
            <View>
              <Text style={[styles.pairName, { color: colors.text }]}>{signal.pair}</Text>
              <Text style={[styles.pairSub, { color: colors.textSecondary }]}>{displayName}</Text>
            </View>
          </View>

          <View style={styles.cardCenter}>
            <MiniChart
              data={ratesData || []}
              color={isUp ? colors.buy : colors.sell}
              width={90}
              height={32}
              pair={signal.pair}
            />
          </View>

          <View style={styles.cardRight}>
            <Animated.View style={flashStyle}>
              <Animated.Text style={[styles.priceText, priceColorStyle]}>
                {livePrice.toFixed(priceDecimals)}
              </Animated.Text>
            </Animated.View>
            <View style={[styles.changeBadge, { backgroundColor: changeColor + "15" }]}>
              <Ionicons name={isUp ? "arrow-up" : "arrow-down"} size={10} color={changeColor} />
              <Text style={[styles.changeText, { color: changeColor }]}>
                {isUp ? "+" : ""}{liveChange.toFixed(2)}%
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

export default function RatesScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;
  const [market, setMarket] = useState<MarketType>("forex");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const signalUrl = market === "forex" ? "/api/signals" : "/api/commodities/signals";
  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: [signalUrl],
  });

  const { data: ratesData = {} } = useQuery<Record<string, number[]>>({
    queryKey: [`/api/rates/batch?market=${market}`],
  });

  const { data: tvQuotes = [] } = useQuery<TVQuote[]>({
    queryKey: [`/api/quotes?market=${market}`],
    refetchInterval: 5000,
  });

  const { data: marketStatus } = useQuery<{ isOpen: boolean; isClosed: boolean; activeSessions: string[] }>({
    queryKey: ["/api/market-status"],
    refetchInterval: 60000,
  });

  const quotesMap = React.useMemo(() => {
    const map: Record<string, TVQuote> = {};
    for (const q of tvQuotes) {
      map[q.pair] = q;
    }
    return map;
  }, [tvQuotes]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return typeof k === "string" && (k.includes("/api/signals") || k.includes("/api/rates") || k.includes("/api/commodities") || k.includes("/api/quotes"));
      },
    });
    setIsRefreshing(false);
  }, [queryClient]);

  const sorted = React.useMemo(() => {
    const signalMap: Record<string, Signal> = {};
    for (const s of signals) signalMap[s.pair] = s;

    const allPairs = market === "commodities"
      ? Object.keys(COMMODITY_NAMES)
      : Object.keys(FOREX_NAMES);

    let result: Signal[] = allPairs.map(pair => {
      if (signalMap[pair]) return signalMap[pair];
      const q = quotesMap[pair];
      return {
        id: pair,
        pair,
        base: pair.split("/")[0],
        quote: pair.split("/")[1] || "USD",
        action: "HOLD" as const,
        entryPrice: q?.price ?? 0,
        stopLoss: 0,
        takeProfit: 0,
        tp1: 0,
        tp2: 0,
        tp3: 0,
        currentSL: 0,
        tpHit: 0,
        confidence: 0,
        strength: 0,
        change24h: q?.change ?? 0,
        timeframe: "",
        summary: "",
        analysis: "",
        timestamp: "",
        riskReward: 0,
        pipTarget: 0,
        newsFactors: [],
        rsi: 0,
        macd: 0,
        ema20: 0,
        ema50: 0,
        market: market as any,
        timeframes: { H1: "NEUTRAL", H4: "NEUTRAL", D1: "NEUTRAL" },
      };
    });

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      result = result.filter(s => {
        const displayName = market === "commodities" ? COMMODITY_NAMES[s.pair] || s.pair : s.pair;
        return s.pair.toUpperCase().includes(q) || displayName.toUpperCase().includes(q);
      });
    }
    return result.sort((a, b) => {
      const changeA = quotesMap[a.pair]?.change ?? a.change24h;
      const changeB = quotesMap[b.pair]?.change ?? b.change24h;
      return Math.abs(changeB) - Math.abs(changeA);
    });
  }, [signals, quotesMap, searchQuery, market]);

  const rateKeyExtractor = useCallback((item: Signal) => item.id, []);
  const getRateItemLayout = useCallback((_data: any, index: number) => ({
    length: RATE_CARD_HEIGHT,
    offset: RATE_CARD_HEIGHT * index,
    index,
  }), []);

  const renderHeader = () => (
    <View>
      {marketStatus?.isClosed && (
        <View style={[styles.marketClosedBanner, { backgroundColor: colors.sell + "12", borderColor: colors.sell + "30" }]}>
          <Ionicons name="moon-outline" size={16} color={colors.sell} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.sell }}>Mercato chiuso</Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.textSecondary, lineHeight: 16, marginTop: 2 }}>
              Le quotazioni si aggiorneranno alla riapertura del mercato domenica alle 00:00 CET.
            </Text>
          </View>
        </View>
      )}
      <View style={[styles.marketToggle, { backgroundColor: colors.backgroundElevated }]}>
        <Pressable
          onPress={() => { setMarket("forex"); Haptics.selectionAsync(); }}
          style={[styles.marketBtn, market === "forex" && { backgroundColor: colors.accent + "20" }]}
        >
          <Ionicons name="cash-outline" size={14} color={market === "forex" ? colors.accent : colors.textMuted} />
          <Text style={[styles.marketBtnText, { color: market === "forex" ? colors.accent : colors.textMuted }]}>Forex</Text>
        </Pressable>
        <Pressable
          onPress={() => { setMarket("commodities"); Haptics.selectionAsync(); }}
          style={[styles.marketBtn, market === "commodities" && { backgroundColor: colors.accent + "20" }]}
        >
          <Ionicons name="diamond-outline" size={14} color={market === "commodities" ? colors.accent : colors.textMuted} />
          <Text style={[styles.marketBtnText, { color: market === "commodities" ? colors.accent : colors.textMuted }]}>Materie Prime</Text>
        </Pressable>
      </View>

      <View style={[styles.summaryRow, { borderColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.buy }]}>
            {sorted.filter(s => (quotesMap[s.pair]?.change ?? s.change24h) > 0).length}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>In rialzo</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.sell }]}>
            {sorted.filter(s => (quotesMap[s.pair]?.change ?? s.change24h) < 0).length}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>In ribasso</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {sorted.length}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Totale</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.accent + "18", colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.header, { paddingTop: topInset + 16 }]}
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Mercati</Text>
        <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
          Quotazioni live da TradingView
        </Text>
        <View style={[styles.searchBar, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Cerca coppia..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="characters"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.accent + "15" }]}>
            <Ionicons name="bar-chart-outline" size={36} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessuna quotazione</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Genera dei segnali dalla schermata Segnali per vedere le quotazioni in tempo reale
          </Text>
          <View style={styles.emptyHintRow}>
            <Ionicons name="arrow-down-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.emptyHintText, { color: colors.textMuted }]}>
              Scorri verso il basso per aggiornare
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={rateKeyExtractor}
          ListHeaderComponent={renderHeader}
          renderItem={({ item, index }) => (
            <RateCard
              signal={item}
              ratesData={ratesData[`${item.base}-${item.quote}`]}
              index={index}
              market={market}
              quote={quotesMap[item.pair]}
            />
          )}
          getItemLayout={getRateItemLayout}
          windowSize={7}
          maxToRenderPerBatch={8}
          initialNumToRender={8}
          removeClippedSubviews={true}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  list: { paddingHorizontal: 16 },
  marketToggle: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 8,
  },
  marketBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  marketBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  summaryDivider: { width: 1, height: 30 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  pairIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pairName: { fontSize: 14, fontFamily: "Inter_700Bold" },
  pairSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardCenter: { marginHorizontal: 8 },
  cardRight: { alignItems: "flex-end", gap: 4 },
  priceText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  changeBadge: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  changeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyHintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, opacity: 0.7 },
  emptyHintText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  marketClosedBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginHorizontal: 20, marginBottom: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
});
