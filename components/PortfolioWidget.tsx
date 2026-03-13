import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

interface Signal {
  id: string;
  pair: string;
  action: "BUY" | "SELL" | "HOLD";
  entryPrice: number;
  strength: number;
  confidence: number;
}

function simulatePnL(signal: Signal): number {
  const seed = signal.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const drift = ((seed % 200) - 100) / 10000;
  const pnl = signal.entryPrice * drift;
  return signal.action === "BUY" ? pnl : -pnl;
}

export default function PortfolioWidget({ signals }: { signals: Signal[] }) {
  const { colors: C } = useTheme();
  const [expanded, setExpanded] = useState(false);

  if (signals.length === 0) return null;

  const positions = signals.map(s => ({
    pair: s.pair,
    action: s.action,
    pnl: simulatePnL(s),
    entry: s.entryPrice,
  }));

  const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
  const winners = positions.filter(p => p.pnl > 0).length;
  const losers = positions.filter(p => p.pnl < 0).length;

  const maxAbsPnl = Math.max(...positions.map(p => Math.abs(p.pnl)), 0.0001);

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={[styles.container, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="pie-chart-outline" size={16} color={C.accent} />
            <Text style={[styles.title, { color: C.text }]}>Portafoglio</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.totalPnl, { color: totalPnL >= 0 ? C.buy : C.sell }]}>
              {totalPnL >= 0 ? "+" : ""}{totalPnL.toFixed(4)}
            </Text>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={C.textMuted}
            />
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: C.accent }]}>{signals.length}</Text>
            <Text style={[styles.summaryLabel, { color: C.textMuted }]}>Aperte</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: C.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: C.buy }]}>{winners}</Text>
            <Text style={[styles.summaryLabel, { color: C.textMuted }]}>Profitto</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: C.border }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: C.sell }]}>{losers}</Text>
            <Text style={[styles.summaryLabel, { color: C.textMuted }]}>Perdita</Text>
          </View>
        </View>

        {expanded && (
          <View style={[styles.bars, { borderTopColor: C.border }]}>
            {positions.map((p, i) => {
              const width = Math.max(8, (Math.abs(p.pnl) / maxAbsPnl) * 100);
              const isProfit = p.pnl >= 0;
              return (
                <View key={i} style={styles.barRow}>
                  <Text style={[styles.barPair, { color: C.textSecondary }]}>{p.pair}</Text>
                  <View style={[styles.barTrack, { backgroundColor: C.backgroundElevated }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${width}%` as any,
                          backgroundColor: isProfit ? C.buy : C.sell,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barValue, { color: isProfit ? C.buy : C.sell }]}>
                    {isProfit ? "+" : ""}{p.pnl.toFixed(4)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 20, marginBottom: 10, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, paddingBottom: 8 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.dark.text },
  totalPnl: { fontSize: 14, fontFamily: "Inter_700Bold" },
  summary: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 10 },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.dark.accent },
  summaryLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted },
  summaryDivider: { width: 1, alignSelf: "stretch" as const },
  bars: { borderTopWidth: 1, borderTopColor: Colors.dark.border, paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barPair: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.dark.textSecondary, width: 56 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.dark.backgroundElevated, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  barValue: { fontSize: 10, fontFamily: "Inter_600SemiBold", width: 60, textAlign: "right" as const },
});
