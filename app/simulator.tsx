import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

const STORAGE_KEY_BALANCE = "sim_balance";
const STORAGE_KEY_OPEN = "sim_open_trades";
const STORAGE_KEY_CLOSED = "sim_closed_trades";
const INITIAL_BALANCE = 10000;

interface SimTrade {
  id: string;
  pair: string;
  action: "BUY" | "SELL";
  lotSize: number;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  openedAt: string;
  signalId?: string;
}

interface ClosedTrade extends SimTrade {
  exitPrice: number;
  pnl: number;
  closedAt: string;
  reason: "manual" | "tp1" | "tp2" | "tp3" | "sl";
}

type TabMode = "dashboard" | "open" | "history";

const LOT_OPTIONS = [0.01, 0.05, 0.1, 0.2, 0.5, 1.0];

function getPipValue(pair: string): number {
  if (pair.includes("JPY")) return 0.01;
  if (pair.startsWith("XAU")) return 0.1;
  if (pair.startsWith("XAG")) return 0.01;
  if (pair.startsWith("WTI") || pair.startsWith("BRENT")) return 0.01;
  return 0.0001;
}

function calcPips(pair: string, entryPrice: number, exitPrice: number, action: "BUY" | "SELL"): number {
  const pipVal = getPipValue(pair);
  const diff = action === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return Math.round(diff / pipVal);
}

function calcPnl(pair: string, entryPrice: number, currentPrice: number, action: "BUY" | "SELL", lotSize: number): number {
  const pips = calcPips(pair, entryPrice, currentPrice, action);
  const pipMoney = pair.includes("JPY") ? 1000 : pair.startsWith("XAU") ? 10 : pair.startsWith("XAG") ? 50 : pair.startsWith("WTI") || pair.startsWith("BRENT") ? 10 : 10;
  return parseFloat((pips * pipMoney * lotSize).toFixed(2));
}

function OpenTradeCard({ trade, livePrice, onClose, colors }: { trade: SimTrade; livePrice?: number; onClose: (trade: SimTrade, price: number) => void; colors: any }) {
  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const currentPrice = livePrice ?? trade.entryPrice;
  const pnl = calcPnl(trade.pair, trade.entryPrice, currentPrice, trade.action, trade.lotSize);
  const pips = calcPips(trade.pair, trade.entryPrice, currentPrice, trade.action);
  const isPositive = pnl >= 0;
  const priceDecimals = trade.entryPrice > 100 ? 2 : trade.entryPrice > 10 ? 2 : 4;

  return (
    <Animated.View entering={FadeInDown.springify()} style={animStyle}>
      <Pressable
        onPressIn={() => { pressScale.value = withSpring(0.97); }}
        onPressOut={() => { pressScale.value = withSpring(1); }}
        style={[styles.tradeCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
      >
        <View style={styles.tradeHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.actionDot, { backgroundColor: trade.action === "BUY" ? colors.buy : colors.sell }]} />
            <Text style={[styles.tradePair, { color: colors.text }]}>{trade.pair}</Text>
            <View style={[styles.actionMini, { backgroundColor: trade.action === "BUY" ? colors.buy + "15" : colors.sell + "15" }]}>
              <Text style={[styles.actionMiniText, { color: trade.action === "BUY" ? colors.buy : colors.sell }]}>{trade.action}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onClose(trade, currentPrice);
            }}
            style={[styles.closeBtn, { backgroundColor: colors.sell + "15", borderColor: colors.sell + "30" }]}
          >
            <Ionicons name="close" size={14} color={colors.sell} />
          </Pressable>
        </View>

        <View style={styles.tradeDetails}>
          <View style={styles.tradeDetailItem}>
            <Text style={[styles.tradeDetailLabel, { color: colors.textMuted }]}>Lotto</Text>
            <Text style={[styles.tradeDetailValue, { color: colors.textSecondary }]}>{trade.lotSize}</Text>
          </View>
          <View style={styles.tradeDetailItem}>
            <Text style={[styles.tradeDetailLabel, { color: colors.textMuted }]}>Entrata</Text>
            <Text style={[styles.tradeDetailValue, { color: colors.textSecondary }]}>{trade.entryPrice.toFixed(priceDecimals)}</Text>
          </View>
          <View style={styles.tradeDetailItem}>
            <Text style={[styles.tradeDetailLabel, { color: colors.textMuted }]}>Attuale</Text>
            <Text style={[styles.tradeDetailValue, { color: colors.text }]}>{currentPrice.toFixed(priceDecimals)}</Text>
          </View>
        </View>

        <View style={[styles.pnlRow, { backgroundColor: isPositive ? colors.buy + "10" : colors.sell + "10", borderColor: isPositive ? colors.buy + "25" : colors.sell + "25" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name={isPositive ? "trending-up" : "trending-down"} size={16} color={isPositive ? colors.buy : colors.sell} />
            <Text style={[styles.pnlText, { color: isPositive ? colors.buy : colors.sell }]}>
              {isPositive ? "+" : ""}{pnl.toFixed(2)} EUR
            </Text>
          </View>
          <Text style={[styles.pipsText, { color: isPositive ? colors.buy : colors.sell }]}>
            {isPositive ? "+" : ""}{pips} pips
          </Text>
        </View>

        <View style={styles.tpSlRow}>
          <View style={[styles.tpSlChip, { backgroundColor: colors.sell + "10" }]}>
            <Text style={[styles.tpSlLabel, { color: colors.sell }]}>SL {trade.stopLoss.toFixed(priceDecimals)}</Text>
          </View>
          <View style={[styles.tpSlChip, { backgroundColor: colors.buy + "10" }]}>
            <Text style={[styles.tpSlLabel, { color: colors.buy }]}>TP1 {trade.tp1.toFixed(priceDecimals)}</Text>
          </View>
          <View style={[styles.tpSlChip, { backgroundColor: colors.buy + "10" }]}>
            <Text style={[styles.tpSlLabel, { color: colors.buy }]}>TP2 {trade.tp2.toFixed(priceDecimals)}</Text>
          </View>
          <View style={[styles.tpSlChip, { backgroundColor: colors.buy + "10" }]}>
            <Text style={[styles.tpSlLabel, { color: colors.buy }]}>TP3 {trade.tp3.toFixed(priceDecimals)}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ClosedTradeCard({ trade, colors }: { trade: ClosedTrade; colors: any }) {
  const isPositive = trade.pnl >= 0;
  const priceDecimals = trade.entryPrice > 100 ? 2 : trade.entryPrice > 10 ? 2 : 4;
  const reasonLabel = trade.reason === "manual" ? "Manuale" : trade.reason.toUpperCase();

  return (
    <View style={[styles.closedCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
      <View style={styles.closedHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[styles.actionDot, { backgroundColor: trade.action === "BUY" ? colors.buy : colors.sell }]} />
          <Text style={[styles.closedPair, { color: colors.text }]}>{trade.pair}</Text>
          <View style={[styles.reasonChip, { backgroundColor: isPositive ? colors.buy + "15" : colors.sell + "15" }]}>
            <Text style={[styles.reasonText, { color: isPositive ? colors.buy : colors.sell }]}>{reasonLabel}</Text>
          </View>
        </View>
        <Text style={[styles.closedPnl, { color: isPositive ? colors.buy : colors.sell }]}>
          {isPositive ? "+" : ""}{trade.pnl.toFixed(2)}
        </Text>
      </View>
      <View style={styles.closedDetails}>
        <Text style={[styles.closedDetailText, { color: colors.textMuted }]}>
          {trade.entryPrice.toFixed(priceDecimals)} {"->"} {trade.exitPrice.toFixed(priceDecimals)} | Lotto: {trade.lotSize}
        </Text>
        <Text style={[styles.closedDate, { color: colors.textMuted }]}>
          {new Date(trade.closedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

export default function SimulatorScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ signalData?: string }>();

  const [balance, setBalance] = useState(INITIAL_BALANCE);
  const [openTrades, setOpenTrades] = useState<SimTrade[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [tab, setTab] = useState<TabMode>("dashboard");
  const [showNewTrade, setShowNewTrade] = useState(false);
  const [selectedLot, setSelectedLot] = useState(0.1);
  const [pendingSignal, setPendingSignal] = useState<any>(null);

  const { data: forexQuotes = [] } = useQuery<{ pair: string; price: number; change: number }[]>({
    queryKey: ["/api/quotes?market=forex"],
    refetchInterval: 10000,
  });
  const { data: commodityQuotes = [] } = useQuery<{ pair: string; price: number; change: number }[]>({
    queryKey: ["/api/quotes?market=commodities"],
    refetchInterval: 10000,
  });

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of forexQuotes) m[q.pair] = q.price;
    for (const q of commodityQuotes) m[q.pair] = q.price;
    return m;
  }, [forexQuotes, commodityQuotes]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (params.signalData) {
      try {
        const signal = JSON.parse(params.signalData);
        setPendingSignal(signal);
        setShowNewTrade(true);
      } catch {}
    }
  }, [params.signalData]);

  useEffect(() => {
    if (openTrades.length === 0) return;
    const toClose: { trade: SimTrade; price: number; reason: "tp1" | "tp2" | "tp3" | "sl" }[] = [];

    for (const trade of openTrades) {
      const lp = priceMap[trade.pair];
      if (!lp) continue;

      if (trade.action === "BUY") {
        if (lp <= trade.stopLoss) toClose.push({ trade, price: trade.stopLoss, reason: "sl" });
        else if (lp >= trade.tp3) toClose.push({ trade, price: trade.tp3, reason: "tp3" });
        else if (lp >= trade.tp2) toClose.push({ trade, price: trade.tp2, reason: "tp2" });
        else if (lp >= trade.tp1) toClose.push({ trade, price: trade.tp1, reason: "tp1" });
      } else {
        if (lp >= trade.stopLoss) toClose.push({ trade, price: trade.stopLoss, reason: "sl" });
        else if (lp <= trade.tp3) toClose.push({ trade, price: trade.tp3, reason: "tp3" });
        else if (lp <= trade.tp2) toClose.push({ trade, price: trade.tp2, reason: "tp2" });
        else if (lp <= trade.tp1) toClose.push({ trade, price: trade.tp1, reason: "tp1" });
      }
    }

    if (toClose.length > 0) {
      for (const { trade, price, reason } of toClose) {
        closeTrade(trade, price, reason);
      }
    }
  }, [priceMap, openTrades]);

  const loadData = async () => {
    try {
      const [b, o, c] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_BALANCE),
        AsyncStorage.getItem(STORAGE_KEY_OPEN),
        AsyncStorage.getItem(STORAGE_KEY_CLOSED),
      ]);
      if (b) setBalance(parseFloat(b));
      if (o) setOpenTrades(JSON.parse(o));
      if (c) setClosedTrades(JSON.parse(c));
    } catch {}
  };

  const saveBalance = async (val: number) => {
    setBalance(val);
    await AsyncStorage.setItem(STORAGE_KEY_BALANCE, val.toString());
  };

  const saveOpenTrades = async (trades: SimTrade[]) => {
    setOpenTrades(trades);
    await AsyncStorage.setItem(STORAGE_KEY_OPEN, JSON.stringify(trades));
  };

  const saveClosedTrades = async (trades: ClosedTrade[]) => {
    setClosedTrades(trades);
    await AsyncStorage.setItem(STORAGE_KEY_CLOSED, JSON.stringify(trades));
  };

  const openNewTrade = async (signal: any) => {
    const currentPrice = priceMap[signal.pair] || signal.entryPrice;
    const newTrade: SimTrade = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      pair: signal.pair,
      action: signal.action,
      lotSize: selectedLot,
      entryPrice: currentPrice,
      stopLoss: signal.stopLoss ?? signal.currentSL,
      tp1: signal.tp1 ?? signal.takeProfit,
      tp2: signal.tp2 ?? signal.takeProfit,
      tp3: signal.tp3 ?? signal.takeProfit,
      openedAt: new Date().toISOString(),
      signalId: signal.id,
    };
    const updatedOpen = [...openTrades, newTrade];
    await saveOpenTrades(updatedOpen);
    setShowNewTrade(false);
    setPendingSignal(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const closeTrade = async (trade: SimTrade, exitPrice: number, reason: "manual" | "tp1" | "tp2" | "tp3" | "sl" = "manual") => {
    const pnl = calcPnl(trade.pair, trade.entryPrice, exitPrice, trade.action, trade.lotSize);
    const closed: ClosedTrade = {
      ...trade,
      exitPrice,
      pnl,
      closedAt: new Date().toISOString(),
      reason,
    };

    const newBalance = balance + pnl;
    const newOpen = openTrades.filter(t => t.id !== trade.id);
    const newClosed = [closed, ...closedTrades];

    await Promise.all([
      saveBalance(newBalance),
      saveOpenTrades(newOpen),
      saveClosedTrades(newClosed),
    ]);

    if (pnl >= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleCloseTrade = (trade: SimTrade, currentPrice: number) => {
    const pnl = calcPnl(trade.pair, trade.entryPrice, currentPrice, trade.action, trade.lotSize);
    Alert.alert(
      "Chiudi posizione",
      `${trade.pair} ${trade.action}\nP&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} EUR\n\nConfermi la chiusura?`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Chiudi", style: "destructive", onPress: () => closeTrade(trade, currentPrice, "manual") },
      ]
    );
  };

  const handleReset = () => {
    Alert.alert(
      "Reset simulatore",
      "Vuoi azzerare tutto? Bilancio tornera a 10.000 EUR e tutti i trade verranno cancellati.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await Promise.all([
              saveBalance(INITIAL_BALANCE),
              saveOpenTrades([]),
              saveClosedTrades([]),
            ]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  };

  const totalOpenPnl = useMemo(() => {
    return openTrades.reduce((sum, t) => {
      const lp = priceMap[t.pair] || t.entryPrice;
      return sum + calcPnl(t.pair, t.entryPrice, lp, t.action, t.lotSize);
    }, 0);
  }, [openTrades, priceMap]);

  const equity = balance + totalOpenPnl;

  const closedStats = useMemo(() => {
    if (closedTrades.length === 0) return { total: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0 };
    const wins = closedTrades.filter(t => t.pnl >= 0).length;
    const totalPnl = closedTrades.reduce((s, t) => s + t.pnl, 0);
    return {
      total: closedTrades.length,
      wins,
      losses: closedTrades.length - wins,
      winRate: Math.round((wins / closedTrades.length) * 100),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
    };
  }, [closedTrades]);

  const equityCurve = useMemo(() => {
    if (closedTrades.length === 0) return [INITIAL_BALANCE];
    const sorted = [...closedTrades].reverse();
    const curve = [INITIAL_BALANCE];
    let running = INITIAL_BALANCE;
    for (const t of sorted) {
      running += t.pnl;
      curve.push(parseFloat(running.toFixed(2)));
    }
    return curve;
  }, [closedTrades]);

  const { data: signals = [] } = useQuery<any[]>({
    queryKey: ["/api/signals"],
    refetchInterval: 30000,
  });
  const { data: commoditySignals = [] } = useQuery<any[]>({
    queryKey: ["/api/commodities/signals"],
    refetchInterval: 30000,
  });
  const allSignals = useMemo(() => [...signals, ...commoditySignals].filter(s => s.action !== "HOLD"), [signals, commoditySignals]);

  const topInset = Platform.OS === "web" ? 0 : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 40 }}
      >
        <View style={[styles.balanceCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <View style={styles.balanceTop}>
            <View>
              <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Bilancio virtuale</Text>
              <Text style={[styles.balanceValue, { color: colors.text }]}>
                {balance.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
              </Text>
            </View>
            <Pressable onPress={handleReset} hitSlop={10}>
              <Ionicons name="refresh" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.equityRow}>
            <View style={styles.equityItem}>
              <Text style={[styles.equityLabel, { color: colors.textMuted }]}>Equity</Text>
              <Text style={[styles.equityValue, { color: equity >= INITIAL_BALANCE ? colors.buy : colors.sell }]}>
                {equity.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[styles.equityDivider, { backgroundColor: colors.border }]} />
            <View style={styles.equityItem}>
              <Text style={[styles.equityLabel, { color: colors.textMuted }]}>P&L Aperto</Text>
              <Text style={[styles.equityValue, { color: totalOpenPnl >= 0 ? colors.buy : colors.sell }]}>
                {totalOpenPnl >= 0 ? "+" : ""}{totalOpenPnl.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.equityDivider, { backgroundColor: colors.border }]} />
            <View style={styles.equityItem}>
              <Text style={[styles.equityLabel, { color: colors.textMuted }]}>Posizioni</Text>
              <Text style={[styles.equityValue, { color: colors.accent }]}>{openTrades.length}</Text>
            </View>
          </View>
        </View>

        {closedTrades.length > 0 && (
          <View style={[styles.statsCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <Text style={[styles.statsTitle, { color: colors.text }]}>Riepilogo</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.backgroundElevated }]}>
                <Text style={[styles.statBoxValue, { color: closedStats.winRate >= 50 ? colors.buy : colors.sell }]}>{closedStats.winRate}%</Text>
                <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>Win Rate</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.backgroundElevated }]}>
                <Text style={[styles.statBoxValue, { color: closedStats.totalPnl >= 0 ? colors.buy : colors.sell }]}>
                  {closedStats.totalPnl >= 0 ? "+" : ""}{closedStats.totalPnl.toFixed(0)}
                </Text>
                <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>P&L Totale</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.backgroundElevated }]}>
                <Text style={[styles.statBoxValue, { color: colors.buy }]}>{closedStats.wins}</Text>
                <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>Vinte</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.backgroundElevated }]}>
                <Text style={[styles.statBoxValue, { color: colors.sell }]}>{closedStats.losses}</Text>
                <Text style={[styles.statBoxLabel, { color: colors.textMuted }]}>Perse</Text>
              </View>
            </View>

            {equityCurve.length > 2 && (
              <View style={styles.curveContainer}>
                <Text style={[styles.curveTitle, { color: colors.textMuted }]}>Curva Equity</Text>
                <View style={[styles.curveChart, { backgroundColor: colors.backgroundElevated }]}>
                  {(() => {
                    const min = Math.min(...equityCurve);
                    const max = Math.max(...equityCurve);
                    const range = max - min || 1;
                    const w = 100 / (equityCurve.length - 1);
                    const points = equityCurve.map((v, i) => ({
                      x: i * w,
                      y: 100 - ((v - min) / range) * 80 - 10,
                    }));
                    const last = equityCurve[equityCurve.length - 1];
                    const lineColor = last >= INITIAL_BALANCE ? colors.buy : colors.sell;
                    return (
                      <View style={{ flex: 1, height: 80, flexDirection: "row", alignItems: "flex-end" }}>
                        {equityCurve.map((v, i) => {
                          const height = Math.max(4, ((v - min) / range) * 60 + 10);
                          const barColor = v >= INITIAL_BALANCE ? colors.buy + "60" : colors.sell + "60";
                          return (
                            <View
                              key={i}
                              style={{
                                flex: 1,
                                height,
                                backgroundColor: barColor,
                                marginHorizontal: 1,
                                borderRadius: 2,
                              }}
                            />
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="swap-vertical" size={14} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Posizioni aperte ({openTrades.length})
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setPendingSignal(null);
              setShowNewTrade(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="add" size={18} color={colors.background} />
          </Pressable>
        </View>

        {openTrades.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <Ionicons name="analytics-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Nessuna posizione aperta
            </Text>
            <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
              Tocca + per simulare un trade dai segnali attivi
            </Text>
          </View>
        ) : (
          openTrades.map(trade => (
            <OpenTradeCard
              key={trade.id}
              trade={trade}
              livePrice={priceMap[trade.pair]}
              onClose={handleCloseTrade}
              colors={colors}
            />
          ))
        )}

        {closedTrades.length > 0 && (
          <>
            <View style={[styles.sectionHeaderRow, { marginTop: 20 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Storico ({closedTrades.length})
                </Text>
              </View>
            </View>
            {closedTrades.slice(0, 20).map(trade => (
              <ClosedTradeCard key={trade.id} trade={trade} colors={colors} />
            ))}
          </>
        )}
      </ScrollView>

      <Modal
        visible={showNewTrade}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNewTrade(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Nuovo Trade Simulato</Text>
              <Pressable onPress={() => { setShowNewTrade(false); setPendingSignal(null); }} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.lotLabel, { color: colors.textMuted }]}>Dimensione lotto</Text>
            <View style={styles.lotRow}>
              {LOT_OPTIONS.map(lot => (
                <Pressable
                  key={lot}
                  onPress={() => { setSelectedLot(lot); Haptics.selectionAsync(); }}
                  style={[
                    styles.lotChip,
                    {
                      backgroundColor: selectedLot === lot ? colors.accent + "20" : colors.backgroundElevated,
                      borderColor: selectedLot === lot ? colors.accent + "50" : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.lotChipText, { color: selectedLot === lot ? colors.accent : colors.textSecondary }]}>
                    {lot}
                  </Text>
                </Pressable>
              ))}
            </View>

            {pendingSignal && (
              <View style={[styles.previewCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.actionDot, { backgroundColor: pendingSignal.action === "BUY" ? colors.buy : colors.sell }]} />
                    <Text style={[styles.previewPair, { color: colors.text }]}>{pendingSignal.pair}</Text>
                    <Text style={[styles.previewAction, { color: pendingSignal.action === "BUY" ? colors.buy : colors.sell }]}>{pendingSignal.action}</Text>
                  </View>
                  <Text style={[styles.previewConf, { color: colors.accent }]}>{pendingSignal.confidence}%</Text>
                </View>
                <Pressable
                  onPress={() => openNewTrade(pendingSignal)}
                  style={[styles.enterBtn, { backgroundColor: pendingSignal.action === "BUY" ? colors.buy : colors.sell }]}
                >
                  <Ionicons name="flash" size={16} color="#FFFFFF" />
                  <Text style={styles.enterBtnText}>Entra con {selectedLot} lotti</Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.signalListLabel, { color: colors.textMuted }]}>Segnali attivi</Text>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {allSignals.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>Nessun segnale attivo</Text>
                </View>
              ) : (
                allSignals.map(signal => {
                  const lp = priceMap[signal.pair];
                  const priceDecimals = (signal.entryPrice ?? 0) > 100 ? 2 : (signal.entryPrice ?? 0) > 10 ? 2 : 4;
                  return (
                    <Pressable
                      key={signal.id}
                      onPress={() => {
                        setPendingSignal(signal);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={[
                        styles.signalRow,
                        {
                          backgroundColor: pendingSignal?.id === signal.id ? colors.accent + "10" : colors.backgroundCard,
                          borderColor: pendingSignal?.id === signal.id ? colors.accent + "30" : colors.border,
                        },
                      ]}
                    >
                      <View style={[styles.actionDot, { backgroundColor: signal.action === "BUY" ? colors.buy : colors.sell }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.signalRowPair, { color: colors.text }]}>{signal.pair}</Text>
                        <Text style={[styles.signalRowDetail, { color: colors.textMuted }]}>
                          {signal.action} | {lp ? lp.toFixed(priceDecimals) : signal.entryPrice?.toFixed(priceDecimals)} | Conf. {signal.confidence}%
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => openNewTrade(signal)}
                        style={[styles.quickEnterBtn, { backgroundColor: signal.action === "BUY" ? colors.buy + "15" : colors.sell + "15" }]}
                      >
                        <Ionicons name="flash" size={14} color={signal.action === "BUY" ? colors.buy : colors.sell} />
                      </Pressable>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  balanceCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  balanceTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  balanceLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  balanceValue: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  equityRow: { flexDirection: "row", alignItems: "center" },
  equityItem: { flex: 1, alignItems: "center", gap: 2 },
  equityLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase" as const, letterSpacing: 0.5 },
  equityValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  equityDivider: { width: 1, height: 30, marginHorizontal: 4 },
  statsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  statsTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap" as const, gap: 8 },
  statBox: { flex: 1, minWidth: "45%" as any, alignItems: "center", paddingVertical: 12, borderRadius: 10, gap: 2 },
  statBoxValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statBoxLabel: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase" as const },
  curveContainer: { marginTop: 12 },
  curveTitle: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 8 },
  curveChart: { height: 80, borderRadius: 10, padding: 8, overflow: "hidden" },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: {
    marginHorizontal: 16,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  emptyText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" as const },
  tradeCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  tradeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  actionDot: { width: 8, height: 8, borderRadius: 4 },
  tradePair: { fontSize: 16, fontFamily: "Inter_700Bold" },
  actionMini: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  actionMiniText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tradeDetails: { flexDirection: "row", gap: 12, marginBottom: 10 },
  tradeDetailItem: { gap: 2 },
  tradeDetailLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  tradeDetailValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pnlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  pnlText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  pipsText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tpSlRow: { flexDirection: "row", flexWrap: "wrap" as const, gap: 6 },
  tpSlChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tpSlLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  closedCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  closedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  closedPair: { fontSize: 14, fontFamily: "Inter_700Bold" },
  reasonChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  reasonText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  closedPnl: { fontSize: 15, fontFamily: "Inter_700Bold" },
  closedDetails: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  closedDetailText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  closedDate: { fontSize: 10, fontFamily: "Inter_400Regular" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  lotLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  lotRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" as const },
  lotChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  lotChipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  previewCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  previewPair: { fontSize: 16, fontFamily: "Inter_700Bold" },
  previewAction: { fontSize: 12, fontFamily: "Inter_700Bold" },
  previewConf: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  enterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  enterBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  signalListLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  signalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  signalRowPair: { fontSize: 14, fontFamily: "Inter_700Bold" },
  signalRowDetail: { fontSize: 11, fontFamily: "Inter_400Regular" },
  quickEnterBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
