import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";

interface TickerSignal {
  pair: string;
  action: "BUY" | "SELL" | "HOLD";
  entryPrice: number;
}

interface TickerQuote {
  pair: string;
  price: number;
  change: number;
}

function getPipMul(pair: string): number {
  const p = pair.toUpperCase();
  if (p.includes("JPY")) return 100;
  if (p.includes("XAU") || p.includes("XPT")) return 10;
  if (p.includes("XAG") || p.includes("WTI") || p.includes("BRENT")) return 100;
  if (p.includes("NG/")) return 1000;
  if (p.includes("XCU")) return 10000;
  return 10000;
}

interface TickerItem {
  pair: string;
  action: "BUY" | "SELL" | "HOLD";
  price: number | null;
  pips: number;
  change: number;
}

const TickerItemView = React.memo(function TickerItemView({ item, C }: { item: TickerItem; C: any }) {
  const isPositive = item.pips >= 0;
  const dec = item.price && item.price > 100 ? 2 : 4;
  const actionColor = item.action === "BUY" ? C.buy : C.sell;
  return (
    <View style={st.tickerItem}>
      <Ionicons
        name={item.action === "BUY" ? "arrow-up" : "arrow-down"}
        size={10}
        color={actionColor}
      />
      <Text style={[st.tickerPair, { color: C.text }]}>{item.pair}</Text>
      {item.price != null && (
        <Text style={[st.tickerPrice, { color: C.textSecondary }]}>{item.price.toFixed(dec)}</Text>
      )}
      <View style={[st.tickerPnl, { backgroundColor: isPositive ? C.buy + "15" : C.sell + "15" }]}>
        <Ionicons
          name={isPositive ? "caret-up" : "caret-down"}
          size={8}
          color={isPositive ? C.buy : C.sell}
        />
        <Text style={[st.tickerPnlText, { color: isPositive ? C.buy : C.sell }]}>
          {isPositive ? "+" : ""}{item.pips.toFixed(1)}p
        </Text>
      </View>
      <View style={[st.tickerSep, { backgroundColor: C.border }]} />
    </View>
  );
});

export default React.memo(function LiveTicker({
  signals,
  quotes,
}: {
  signals: TickerSignal[];
  quotes?: TickerQuote[];
}) {
  const { colors: C } = useTheme();
  const translateX = useSharedValue(0);
  const [singleWidth, setSingleWidth] = useState(0);
  const itemCount = signals.filter(s => s.action !== "HOLD").length;

  const items: TickerItem[] = React.useMemo(() => {
    return signals
      .filter(s => s.action !== "HOLD")
      .map(s => {
        const q = quotes?.find(qq => qq.pair === s.pair);
        const pipMul = getPipMul(s.pair);
        const diff = q
          ? s.action === "BUY"
            ? q.price - s.entryPrice
            : s.entryPrice - q.price
          : 0;
        const pips = Math.round(diff * pipMul * 10) / 10;
        return {
          pair: s.pair,
          action: s.action,
          price: q?.price ?? null,
          pips,
          change: q?.change ?? 0,
        };
      });
  }, [signals, quotes]);

  useEffect(() => {
    setSingleWidth(0);
  }, [itemCount]);

  useEffect(() => {
    if (singleWidth > 0) {
      translateX.value = 0;
      translateX.value = withRepeat(
        withTiming(-singleWidth, {
          duration: singleWidth * 28,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    }
  }, [singleWidth]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (items.length === 0) return null;

  return (
    <View style={[st.container, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
      <View style={st.label}>
        <View style={[st.liveDot, { backgroundColor: C.buy }]} />
        <Text style={[st.liveText, { color: C.textMuted }]}>LIVE</Text>
      </View>
      <View style={st.overflow}>
        <Animated.View style={[st.track, animStyle]}>
          <View
            style={st.track}
            onLayout={(e) => {
              if (singleWidth === 0) setSingleWidth(e.nativeEvent.layout.width);
            }}
          >
            {items.map((item, i) => (
              <TickerItemView key={`a-${i}`} item={item} C={C} />
            ))}
          </View>
          <View style={st.track}>
            {items.map((item, i) => (
              <TickerItemView key={`b-${i}`} item={item} C={C} />
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
});

const st = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    height: 34,
    overflow: "hidden",
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.06)",
    height: "100%",
    justifyContent: "center",
  },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  overflow: { flex: 1, overflow: "hidden", height: "100%" },
  track: { flexDirection: "row", alignItems: "center", height: "100%" },
  tickerItem: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: "100%" },
  tickerPair: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  tickerPrice: { fontSize: 10, fontFamily: "Inter_500Medium" },
  tickerPnl: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  tickerPnlText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  tickerSep: { width: 1, height: 14, marginLeft: 4, opacity: 0.4 },
});
