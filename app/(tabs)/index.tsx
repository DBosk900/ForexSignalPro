import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  ScrollView,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Swipeable from "react-native-gesture-handler/Swipeable";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useTheme } from "@/contexts/ThemeContext";
import Sparkline from "@/components/Sparkline";
import CountdownBanner from "@/components/CountdownBanner";
import MarketSessions from "@/components/MarketSessions";
import NotificationBanner from "@/components/NotificationBanner";
import PortfolioWidget from "@/components/PortfolioWidget";
import { SignalSkeleton } from "@/components/SkeletonLoader";
import MorningBriefing from "@/components/MorningBriefing";
import SentimentHeatmap from "@/components/SentimentHeatmap";
import MarketSentimentBanner from "@/components/MarketSentimentBanner";
import RiskExposureDashboard from "@/components/RiskExposureDashboard";
import LiveTicker from "@/components/LiveTicker";
import { shareSignal } from "@/lib/shareSignal";
import { getDashboardConfig, DashboardSection, getDefaultSections } from "@/lib/dashboardConfig";

type MarketType = "forex" | "commodities";

function timeAgo(timestamp: string): { label: string; minutes: number } {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return { label: "Adesso", minutes: 0 };
  if (mins < 60) return { label: `${mins} min fa`, minutes: mins };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { label: `${hrs}h ${mins % 60}m fa`, minutes: mins };
  const days = Math.floor(hrs / 24);
  return { label: `${days}g fa`, minutes: mins };
}

function getSignalFreshness(minutes: number): { color: string; label: string } {
  if (minutes <= 30) return { color: "#00D4AA", label: "Fresco" };
  if (minutes <= 120) return { color: "#FFB347", label: "Recente" };
  if (minutes <= 360) return { color: "#FF8C42", label: "Datato" };
  return { color: "#FF4D6A", label: "Scaduto" };
}

interface Timeframes {
  h1: "BUY" | "SELL" | "HOLD";
  h4: "BUY" | "SELL" | "HOLD";
  d1: "BUY" | "SELL" | "HOLD";
}

interface Confluence {
  score: number;
  h1: number;
  h4: number;
  d1: number;
  aligned: boolean;
}

interface Signal {
  id: string;
  pair: string;
  base: string;
  quote: string;
  action: "BUY" | "SELL" | "HOLD";
  strength: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp1: number;
  tp2: number;
  tp3: number;
  currentSL: number;
  tpHit: number;
  timeframe: string;
  confidence: number;
  summary: string;
  timestamp: string;
  change24h: number;
  rsi?: number;
  macd?: number;
  ema20?: number;
  ema50?: number;
  market?: MarketType;
  timeframes?: Timeframes;
  confluence?: Confluence;
  newsWarning?: string;
  closedAt?: string;
  closedOutcome?: string;
  closedPrice?: number;
  closedPips?: number;
}

interface Stats {
  totalSignals: number;
  closedSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPips: number;
  totalPips: number;
  bestPair: { pair: string; winRate: number } | null;
}

type SortMode = "default" | "confidence" | "strength" | "pair" | "change";

const SORT_OPTIONS: { key: SortMode; label: string; icon: string }[] = [
  { key: "default", label: "Predefinito", icon: "swap-vertical" },
  { key: "confidence", label: "Conf.", icon: "shield-checkmark" },
  { key: "strength", label: "Forza", icon: "fitness" },
  { key: "pair", label: "A-Z", icon: "text" },
  { key: "change", label: "24h", icon: "trending-up" },
];

const COMMODITY_ICONS: Record<string, string> = {
  "XAU/USD": "diamond-outline",
  "XAG/USD": "diamond",
  "WTI/USD": "water-outline",
  "BRENT/USD": "water",
  "NG/USD": "flame-outline",
  "XCU/USD": "cube-outline",
  "XPT/USD": "star-outline",
};

function PulsingDot() {
  const scale = useSharedValue(1);
  React.useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value > 1.2 ? 0.5 : 1,
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

const PerformanceBar = React.memo(function PerformanceBar({ stats }: { stats: Stats }) {
  const { colors: C } = useTheme();
  if (stats.closedSignals === 0) return null;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/history");
      }}
      style={[styles.perfBar, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
    >
      <View style={styles.perfStats}>
        <View style={styles.perfItem}>
          <Text style={[styles.perfValue, { color: C.accent }]}>{stats.winRate}%</Text>
          <Text style={[styles.perfLabel, { color: C.textMuted }]}>Win Rate</Text>
        </View>
        <View style={[styles.perfDivider, { backgroundColor: C.border }]} />
        <View style={styles.perfItem}>
          <Text style={[styles.perfValue, { color: stats.totalPips >= 0 ? C.buy : C.sell }]}>
            {stats.totalPips >= 0 ? "+" : ""}{stats.totalPips}
          </Text>
          <Text style={[styles.perfLabel, { color: C.textMuted }]}>Pips Totali</Text>
        </View>
        <View style={[styles.perfDivider, { backgroundColor: C.border }]} />
        <View style={styles.perfItem}>
          <Text style={[styles.perfValue, { color: C.accent }]}>{stats.closedSignals}</Text>
          <Text style={[styles.perfLabel, { color: C.textMuted }]}>Segnali</Text>
        </View>
        {stats.bestPair && (
          <>
            <View style={[styles.perfDivider, { backgroundColor: C.border }]} />
            <View style={styles.perfItem}>
              <Text style={[styles.perfValue, { color: C.accent, fontSize: 12 }]}>{stats.bestPair.pair}</Text>
              <Text style={[styles.perfLabel, { color: C.textMuted }]}>Migliore</Text>
            </View>
          </>
        )}
      </View>
      <View style={[styles.perfFooter, { backgroundColor: C.backgroundElevated }]}>
        <Ionicons name="time-outline" size={11} color={C.textMuted} />
        <Text style={[styles.perfFooterText, { color: C.textMuted }]}>Vedi storico completo</Text>
        <Ionicons name="chevron-forward" size={11} color={C.textMuted} />
      </View>
    </Pressable>
  );
});

const TimeframeBadges = React.memo(function TimeframeBadges({ timeframes, action, confluence }: { timeframes?: Timeframes; action: string; confluence?: Confluence }) {
  const { colors: TC } = useTheme();
  if (!timeframes) return null;
  const tfs = [
    { label: "H1", dir: timeframes.h1 },
    { label: "H4", dir: timeframes.h4 },
    { label: "D1", dir: timeframes.d1 },
  ];

  const cfLabel = confluence?.aligned ? "3/3" : confluence?.score !== undefined ? `${confluence.score}/3` : "";
  const cfColor = confluence?.aligned ? TC.buy : (confluence?.score ?? 0) >= 1 ? "#FBBF24" : TC.sell;

  return (
    <View style={styles.tfBadges}>
      {tfs.map(tf => {
        const color = tf.dir === "BUY" ? TC.buy : tf.dir === "SELL" ? TC.sell : TC.hold;
        const icon = tf.dir === "BUY" ? "arrow-up" : tf.dir === "SELL" ? "arrow-down" : "remove";
        return (
          <View key={tf.label} style={[styles.tfBadge, { backgroundColor: color + "15" }]}>
            <Text style={[styles.tfBadgeLabel, { color: TC.textMuted }]}>{tf.label}</Text>
            <Ionicons name={icon as any} size={10} color={color} />
          </View>
        );
      })}
      {cfLabel !== "" && (
        <View style={[styles.tfBadge, { backgroundColor: cfColor + "15", marginLeft: 2 }]}>
          <Ionicons name="git-merge-outline" size={10} color={cfColor} />
          <Text style={[styles.tfBadgeLabel, { color: cfColor, marginLeft: 2 }]}>{cfLabel}</Text>
        </View>
      )}
    </View>
  );
});

const SignalCard = React.memo(function SignalCard({ signal, index, ratesData, market, livePrice, compareSignal, onCompare }: { signal: Signal; index: number; ratesData?: number[]; market: MarketType; livePrice?: { price: number; change: number }; compareSignal?: Signal | null; onCompare?: (s: Signal) => void }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { colors: C } = useTheme();
  const swipeRef = useRef<Swipeable>(null);
  const isBuy = signal.action === "BUY";
  const isSell = signal.action === "SELL";
  const actionColor = isBuy ? C.buy : isSell ? C.sell : C.hold;
  const actionBg = isBuy ? C.buyBg : isSell ? C.sellBg : C.holdBg;
  const actionBorder = isBuy ? C.buyBorder : isSell ? C.sellBorder : C.holdBorder;
  const actionIcon = isBuy ? "arrow-up" : isSell ? "arrow-down" : "remove";
  const fav = isFavorite(signal.pair);

  const commodityIcon = market === "commodities" ? COMMODITY_ICONS[signal.pair] : null;

  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const ep = signal.entryPrice ?? 0;
  const priceDecimals = ep > 100 ? 2 : ep > 10 ? 2 : 4;

  const livePnl = React.useMemo(() => {
    if (!livePrice || signal.action === "HOLD" || ep === 0) return null;
    const diff = signal.action === "BUY" ? livePrice.price - ep : ep - livePrice.price;
    const pipMul = signal.pair.includes("JPY") ? 100 : signal.pair.includes("XAU") || signal.pair.includes("XPT") ? 10 : signal.pair.includes("XAG") || signal.pair.includes("WTI") || signal.pair.includes("BRENT") ? 100 : signal.pair.includes("NG/") ? 1000 : signal.pair.includes("XCU") ? 10000 : 10000;
    const pips = Math.round(diff * pipMul * 10) / 10;
    const slDist = Math.abs(ep - signal.stopLoss) * pipMul;
    const tp3Dist = Math.abs(signal.tp3 - ep) * pipMul;
    const totalRange = slDist + tp3Dist;
    const progress = totalRange > 0 ? Math.max(-1, Math.min(1, (pips + slDist) / totalRange * 2 - 1)) : 0;
    return { pips, isPositive: pips >= 0, progress };
  }, [livePrice, signal.action, ep, signal.stopLoss, signal.tp3, signal.pair]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      `${signal.pair} — ${signal.action}`,
      `${signal.confidence}% conf. | ${signal.strength}% forza | ${signal.timeframe}`,
      [
        { text: "Vedi Dettaglio", onPress: () => router.push({ pathname: "/signal/[id]", params: { id: signal.id, data: JSON.stringify(signal) } }) },
        { text: "Condividi", onPress: () => shareSignal(signal) },
        { text: "Calcolatore Rischio", onPress: () => router.push({ pathname: "/calculator", params: { signalData: JSON.stringify(signal) } }) },
        { text: "Simula Trade", onPress: () => router.push({ pathname: "/simulator", params: { signalData: JSON.stringify(signal) } }) },
        { text: fav ? "Rimuovi preferito" : "Aggiungi preferito", onPress: () => toggleFavorite(signal.pair) },
        { text: "Annulla", style: "cancel" },
      ]
    );
  }, [signal, fav]);

  const renderLeftActions = useCallback(() => (
    <View style={swipeStyles.leftAction}>
      <Ionicons name={fav ? "star" : "star-outline"} size={22} color="#FFF" />
      <Text style={swipeStyles.actionText}>{fav ? "Rimuovi" : "Preferito"}</Text>
    </View>
  ), [fav]);

  const renderRightActions = useCallback(() => (
    <View style={swipeStyles.rightAction}>
      <Ionicons name="share-outline" size={22} color="#FFF" />
      <Text style={swipeStyles.actionText}>Condividi</Text>
    </View>
  ), []);

  const handleSwipeOpen = useCallback((direction: "left" | "right") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (direction === "left") {
      toggleFavorite(signal.pair);
    } else {
      shareSignal(signal);
    }
    setTimeout(() => swipeRef.current?.close(), 300);
  }, [signal, toggleFavorite]);

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={80}
      rightThreshold={80}
    >
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={animStyle}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: "/signal/[id]", params: { id: signal.id, data: JSON.stringify(signal) } });
        }}
        onPressIn={() => { pressScale.value = withSpring(0.97); }}
        onPressOut={() => { pressScale.value = withSpring(1); }}
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={[styles.card, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
      >
        <View style={styles.cardTop}>
          <View style={styles.pairInfo}>
            <View style={styles.flagRow}>
              {commodityIcon && (
                <Ionicons name={commodityIcon as any} size={16} color={C.accent} style={{ marginRight: -2 }} />
              )}
              <Text style={[styles.pairText, { color: C.text }]}>{signal.pair}</Text>
              <Sparkline
                action={signal.action}
                strength={signal.strength}
                seed={signal.pair}
                width={60}
                height={24}
                data={ratesData}
              />
              <View style={[styles.timeframeBadge, { backgroundColor: C.backgroundElevated }]}>
                <Text style={[styles.timeframeText, { color: C.textSecondary }]}>{signal.timeframe}</Text>
              </View>
            </View>
            <View style={styles.cardSubRow}>
              <Text style={[styles.changeText, { color: (signal.change24h ?? 0) >= 0 ? C.buy : C.sell }]}>
                {(signal.change24h ?? 0) >= 0 ? "+" : ""}{(signal.change24h ?? 0).toFixed(2)}%
              </Text>
              <TimeframeBadges timeframes={signal.timeframes} action={signal.action} confluence={signal.confluence} />
            </View>
          </View>

          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <View style={[styles.actionBadge, { backgroundColor: actionBg, borderColor: actionBorder }]}>
              <Ionicons name={actionIcon as any} size={14} color={actionColor} />
              <Text style={[styles.actionText, { color: actionColor }]}>{signal.action}</Text>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                toggleFavorite(signal.pair);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              hitSlop={10}
            >
              <Ionicons name={fav ? "star" : "star-outline"} size={18} color={fav ? C.hold : C.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.strengthRow}>
          <Text style={[styles.strengthLabel, { color: C.textMuted }]}>Forza segnale</Text>
          <Text style={[styles.strengthValue, { color: actionColor }]}>{signal.strength}%</Text>
        </View>
        <View style={[styles.strengthBar, { backgroundColor: C.backgroundElevated }]}>
          <View style={[styles.strengthFill, { width: `${signal.strength}%` as any, backgroundColor: actionColor }]} />
        </View>

        {signal.action === "HOLD" && signal.timeframes && (() => {
          const tfs = [
            { label: "H1", dir: signal.timeframes!.h1 },
            { label: "H4", dir: signal.timeframes!.h4 },
            { label: "D1", dir: signal.timeframes!.d1 },
          ];
          const aligned = tfs.filter(t => t.dir === "BUY" || t.dir === "SELL");
          const holdTfs = tfs.filter(t => t.dir !== "BUY" && t.dir !== "SELL");
          const score = signal.confluence?.score ?? aligned.length;
          let blockText = `Confluenza parziale (${score}/3) - stiamo monitorando`;
          const diverging = aligned.length >= 2 && new Set(aligned.map(a => a.dir)).size > 1;
          if (diverging) {
            blockText = "Timeframe non allineati - segnale sospeso";
          } else if (holdTfs.length > 0 && aligned.length === 1) {
            blockText = `Confluenza parziale (${score}/3) - stiamo monitorando`;
          } else if (holdTfs.length > 0) {
            const missing = holdTfs.map(t => t.label).join(", ");
            blockText = `${missing} neutro - attendiamo conferma direzionale`;
          }
          return (
            <View style={[styles.holdMonitorCard, { backgroundColor: C.backgroundElevated, borderColor: "#FFB347" + "30" }]}>
              <View style={styles.holdMonitorHeader}>
                <Ionicons name="eye-outline" size={14} color="#FFB347" />
                <Text style={[styles.holdMonitorTitle, { color: "#FFB347" }]}>In attesa di confluenza</Text>
              </View>
              <View style={styles.holdTfRow}>
                {tfs.map(tf => {
                  const isAligned = tf.dir === "BUY" || tf.dir === "SELL";
                  const tfColor = tf.dir === "BUY" ? C.buy : tf.dir === "SELL" ? C.sell : C.textMuted;
                  const tfIcon = tf.dir === "BUY" ? "arrow-up" : tf.dir === "SELL" ? "arrow-down" : "remove";
                  return (
                    <View key={tf.label} style={[styles.holdTfItem, { backgroundColor: isAligned ? tfColor + "12" : C.background }]}>
                      <Text style={[styles.holdTfLabel, { color: C.textSecondary }]}>{tf.label}</Text>
                      <Ionicons name={isAligned ? "checkmark-circle" : "close-circle-outline"} size={12} color={isAligned ? tfColor : C.textMuted} />
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                        <Ionicons name={tfIcon as any} size={10} color={tfColor} />
                        <Text style={[styles.holdTfDir, { color: tfColor }]}>{tf.dir}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={styles.holdScoreRow}>
                <View style={[styles.holdScoreBar, { backgroundColor: C.background }]}>
                  <View style={[styles.holdScoreFill, { width: `${(score / 3) * 100}%` as any, backgroundColor: "#FFB347" }]} />
                </View>
                <Text style={[styles.holdScoreLabel, { color: C.textMuted }]}>{score}/3</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                <Ionicons name="information-circle-outline" size={12} color={C.textMuted} />
                <Text style={[styles.holdBlockText, { color: C.textSecondary }]}>{blockText}</Text>
              </View>
            </View>
          );
        })()}

        {signal.newsWarning && (
          <View style={[styles.newsWarningBanner, { backgroundColor: "#FF8C00" + "18", borderColor: "#FF8C00" + "40" }]}>
            <Ionicons name="warning-outline" size={13} color="#FF8C00" />
            <Text style={[styles.newsWarningText, { color: "#FF8C00" }]} numberOfLines={1}>
              {signal.newsWarning}
            </Text>
          </View>
        )}

        {livePrice && (
          <View style={[styles.livePriceRow, { backgroundColor: C.accent + "08", borderColor: C.accent + "20" }]}>
            <Text style={[styles.livePriceLabel, { color: C.textMuted }]}>Prezzo live</Text>
            <Text style={[styles.livePriceValue, { color: C.text }]}>{livePrice.price.toFixed(priceDecimals)}</Text>
            <View style={[styles.livePriceChange, { backgroundColor: livePrice.change >= 0 ? C.buy + "15" : C.sell + "15" }]}>
              <Ionicons name={livePrice.change >= 0 ? "arrow-up" : "arrow-down"} size={9} color={livePrice.change >= 0 ? C.buy : C.sell} />
              <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: livePrice.change >= 0 ? C.buy : C.sell }}>
                {livePrice.change >= 0 ? "+" : ""}{livePrice.change.toFixed(2)}%
              </Text>
            </View>
          </View>
        )}
        {livePnl && (
          <View style={[styles.pnlRow, { backgroundColor: livePnl.isPositive ? C.buy + "08" : C.sell + "08", borderColor: livePnl.isPositive ? C.buy + "25" : C.sell + "25" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name={livePnl.isPositive ? "trending-up" : "trending-down"} size={14} color={livePnl.isPositive ? C.buy : C.sell} />
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: C.textMuted }}>P&L Live</Text>
            </View>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: livePnl.isPositive ? C.buy : C.sell, letterSpacing: -0.3 }}>
              {livePnl.isPositive ? "+" : ""}{livePnl.pips.toFixed(1)} pip
            </Text>
            <View style={{ flex: 1, maxWidth: 80 }}>
              <View style={[styles.pnlBar, { backgroundColor: C.backgroundElevated }]}>
                <View style={[styles.pnlBarCenter, { backgroundColor: C.textMuted + "30" }]} />
                <View style={[styles.pnlBarFill, {
                  backgroundColor: livePnl.isPositive ? C.buy : C.sell,
                  width: `${Math.abs(livePnl.progress) * 50}%` as any,
                  left: livePnl.isPositive ? "50%" : `${50 - Math.abs(livePnl.progress) * 50}%` as any,
                }]} />
              </View>
            </View>
          </View>
        )}
        <View style={[styles.priceRow, { backgroundColor: C.backgroundElevated }]}>
          <View style={styles.priceItem}>
            <Text style={[styles.priceLabel, { color: C.textMuted }]}>Entrata</Text>
            <Text style={[styles.priceValue, { color: C.text }]}>{signal.entryPrice.toFixed(priceDecimals)}</Text>
          </View>
          {signal.action !== "HOLD" && signal.stopLoss > 0 && (
            <>
              <View style={[styles.priceDivider, { backgroundColor: C.border }]} />
              <View style={styles.priceItem}>
                <Text style={[styles.priceLabel, { color: signal.currentSL !== signal.stopLoss ? "#FFB347" : C.textMuted }]}>
                  {signal.currentSL !== signal.stopLoss ? "SL Trail" : "SL"}
                </Text>
                <Text style={[styles.priceValue, { color: C.sell }]}>{(signal.currentSL ?? signal.stopLoss).toFixed(priceDecimals)}</Text>
              </View>
            </>
          )}
        </View>
        {signal.action !== "HOLD" && signal.tp1 != null && (
          <View style={[styles.tpRow, { backgroundColor: C.backgroundElevated, marginTop: 2 }]}>
            {[
              { label: "TP1", value: signal.tp1, level: 1 },
              { label: "TP2", value: signal.tp2, level: 2 },
              { label: "TP3", value: signal.tp3, level: 3 },
            ].map((tp, i) => (
              <React.Fragment key={tp.label}>
                {i > 0 && <View style={[styles.priceDivider, { backgroundColor: C.border }]} />}
                <View style={styles.priceItem}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Text style={[styles.priceLabel, { color: (signal.tpHit ?? 0) >= tp.level ? "#00D4AA" : C.textMuted }]}>{tp.label}</Text>
                    {(signal.tpHit ?? 0) >= tp.level && <Ionicons name="checkmark-circle" size={10} color="#00D4AA" />}
                  </View>
                  <Text style={[styles.priceValue, { color: (signal.tpHit ?? 0) >= tp.level ? "#00D4AA" : C.buy, fontSize: 11 }]}>
                    {(tp.value ?? signal.takeProfit).toFixed(priceDecimals)}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={styles.cardBottom}>
          <Text style={[styles.summaryText, { color: C.textSecondary }]} numberOfLines={2}>{signal.summary}</Text>
          <View style={styles.cardFooter}>
            <View style={styles.confidenceRow}>
              <Ionicons name="shield-checkmark" size={12} color={C.accent} />
              <Text style={[styles.confidenceText, { color: C.accent }]}>{signal.confidence}% conf.</Text>
            </View>
            {(() => {
              const ta = timeAgo(signal.timestamp);
              const fresh = getSignalFreshness(ta.minutes);
              return (
                <View style={styles.timeAgoRow}>
                  <Ionicons name="time-outline" size={11} color={fresh.color} />
                  <Text style={[styles.timeAgoText, { color: fresh.color }]}>{ta.label}</Text>
                  <View style={[styles.freshDot, { backgroundColor: fresh.color }]} />
                </View>
              );
            })()}
          </View>
          {onCompare && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onCompare(signal);
              }}
              style={[styles.compareBtn, {
                backgroundColor: compareSignal?.id === signal.id ? "#818CF820" : C.backgroundElevated,
                borderColor: compareSignal?.id === signal.id ? "#818CF850" : C.border,
              }]}
            >
              <Ionicons
                name={compareSignal?.id === signal.id ? "checkmark-circle" : "git-compare"}
                size={13}
                color={compareSignal?.id === signal.id ? "#818CF8" : C.textMuted}
              />
              <Text style={[styles.compareBtnText, {
                color: compareSignal?.id === signal.id ? "#818CF8" : C.textMuted,
              }]}>
                {compareSignal?.id === signal.id ? "Selezionato" : compareSignal ? "Confronta" : "Confronta"}
              </Text>
            </Pressable>
          )}
          {signal.action !== "HOLD" && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/simulator", params: { signalData: JSON.stringify(signal) } });
              }}
              style={[styles.simulaBtn, { backgroundColor: C.accent + "12", borderColor: C.accent + "30" }]}
            >
              <Ionicons name="wallet-outline" size={13} color={C.accent} />
              <Text style={[styles.simulaBtnText, { color: C.accent }]}>Simula</Text>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Animated.View>
    </Swipeable>
  );
});

const swipeStyles = StyleSheet.create({
  leftAction: {
    backgroundColor: "#00D4AA",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 16,
    marginBottom: 12,
    gap: 4,
  },
  rightAction: {
    backgroundColor: "#818CF8",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 16,
    marginBottom: 12,
    gap: 4,
  },
  actionText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});

interface DailyStats {
  total: number;
  tp1: number;
  tp2: number;
  tp3: number;
  sl: number;
  wins: number;
  totalPips: number;
  winRate: number;
}

const DailySummary = React.memo(function DailySummary({ market }: { market: MarketType }) {
  const { colors: C } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const dailyUrl = `/api/stats/daily?market=${market}`;
  const { data: daily } = useQuery<DailyStats>({
    queryKey: [dailyUrl],
    refetchInterval: 30000,
  });

  if (!daily || daily.total === 0) return null;

  return (
    <View style={[styles.dailyCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
      <Pressable
        onPress={() => {
          setExpanded(!expanded);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        style={styles.dailyHeader}
      >
        <View style={styles.dailyTitleRow}>
          <Ionicons name="today-outline" size={14} color={C.accent} />
          <Text style={[styles.dailyTitle, { color: C.text }]}>Riepilogo Giornaliero</Text>
        </View>
        <View style={styles.dailyTitleRow}>
          <Text style={[styles.dailyPipsQuick, { color: daily.totalPips >= 0 ? C.buy : C.sell }]}>
            {daily.totalPips >= 0 ? "+" : ""}{daily.totalPips}p
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.textMuted} />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.dailyContent}>
          <View style={styles.dailyRow}>
            <View style={[styles.dailyItem, { backgroundColor: C.backgroundElevated }]}>
              <Text style={[styles.dailyItemValue, { color: C.accent }]}>{daily.winRate}%</Text>
              <Text style={[styles.dailyItemLabel, { color: C.textMuted }]}>Win Rate</Text>
            </View>
            <View style={[styles.dailyItem, { backgroundColor: C.backgroundElevated }]}>
              <Text style={[styles.dailyItemValue, { color: daily.totalPips >= 0 ? C.buy : C.sell }]}>
                {daily.totalPips >= 0 ? "+" : ""}{daily.totalPips}
              </Text>
              <Text style={[styles.dailyItemLabel, { color: C.textMuted }]}>Pips</Text>
            </View>
            <View style={[styles.dailyItem, { backgroundColor: C.backgroundElevated }]}>
              <Text style={[styles.dailyItemValue, { color: C.text }]}>{daily.total}</Text>
              <Text style={[styles.dailyItemLabel, { color: C.textMuted }]}>Chiusi</Text>
            </View>
          </View>
          <View style={styles.dailyTpRow}>
            {daily.tp3 > 0 && (
              <View style={[styles.dailyTpChip, { backgroundColor: "#FFD70015", borderColor: "#FFD70030" }]}>
                <View style={[styles.dailyTpDot, { backgroundColor: "#FFD700" }]} />
                <Text style={[styles.dailyTpText, { color: "#FFD700" }]}>TP3 x{daily.tp3}</Text>
              </View>
            )}
            {daily.tp2 > 0 && (
              <View style={[styles.dailyTpChip, { backgroundColor: C.buy + "15", borderColor: C.buy + "30" }]}>
                <View style={[styles.dailyTpDot, { backgroundColor: C.buy }]} />
                <Text style={[styles.dailyTpText, { color: C.buy }]}>TP2 x{daily.tp2}</Text>
              </View>
            )}
            {daily.tp1 > 0 && (
              <View style={[styles.dailyTpChip, { backgroundColor: "#81C78415", borderColor: "#81C78430" }]}>
                <View style={[styles.dailyTpDot, { backgroundColor: "#81C784" }]} />
                <Text style={[styles.dailyTpText, { color: "#81C784" }]}>TP1 x{daily.tp1}</Text>
              </View>
            )}
            {daily.sl > 0 && (
              <View style={[styles.dailyTpChip, { backgroundColor: C.sell + "15", borderColor: C.sell + "30" }]}>
                <View style={[styles.dailyTpDot, { backgroundColor: C.sell }]} />
                <Text style={[styles.dailyTpText, { color: C.sell }]}>SL x{daily.sl}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
});

const SIGNAL_CARD_HEIGHT = 380;

export default function SignalsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { favorites } = useFavorites();
  const { colors: themeColors, mode: themeMode } = useTheme();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showConfirmGenerate, setShowConfirmGenerate] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL" | "HOLD" | "FAV">("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [autoLoaded, setAutoLoaded] = useState(false);
  const [market, setMarket] = useState<MarketType>("forex");
  const [minConfidence, setMinConfidence] = useState<number>(0);
  const [timeframeFilter, setTimeframeFilter] = useState<"ALL" | "H1" | "H4" | "D1">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [compareSignal, setCompareSignal] = useState<Signal | null>(null);
  const [dashConfig, setDashConfig] = useState<DashboardSection[]>(getDefaultSections());

  useFocusEffect(
    useCallback(() => {
      getDashboardConfig().then(setDashConfig);
    }, [])
  );

  const signalsEndpoint = market === "commodities" ? "/api/commodities/signals" : "/api/signals";

  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: signals = [], isLoading } = useQuery<Signal[]>({
    queryKey: [signalsEndpoint],
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/commodities/signals"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/rates/batch"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/status"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/stats/daily"] }),
    ]);
    setIsRefreshing(false);
  }, [queryClient]);

  const { data: status } = useQuery<{ signals: number; commoditySignals: number; isGenerating: boolean; lastGenerated: string | null }>({
    queryKey: ["/api/status"],
    refetchInterval: isGenerating || signals.length === 0 ? 3000 : 15000,
  });

  const statsUrl = `/api/stats?market=${market}`;
  const { data: stats } = useQuery<Stats>({
    queryKey: [statsUrl],
  });

  const batchRatesUrl = market === "commodities" ? "/api/rates/batch?market=commodities" : "/api/rates/batch";
  const { data: batchRates } = useQuery<Record<string, number[]>>({
    queryKey: [batchRatesUrl],
    enabled: signals.length > 0,
    staleTime: 300000,
  });

  const quotesUrl = `/api/quotes?market=${market}`;
  const { data: tvQuotes = [] } = useQuery<{ pair: string; price: number; change: number; high: number; low: number; open: number }[]>({
    queryKey: [quotesUrl],
    refetchInterval: 5000,
  });
  const tvMap = React.useMemo(() => {
    const m: Record<string, { price: number; change: number }> = {};
    for (const q of tvQuotes) m[q.pair] = { price: q.price, change: q.change };
    return m;
  }, [tvQuotes]);

  const { data: marketStatus } = useQuery<{ isOpen: boolean; isClosed: boolean; isNightSession: boolean; activeSessions: string[]; nextOpen: string }>({
    queryKey: ["/api/market-status"],
    refetchInterval: 60000,
  });

  React.useEffect(() => {
    if (status?.isGenerating) {
      setIsGenerating(true);
    } else if (isGenerating && status && !status.isGenerating) {
      setIsGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commodities/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rates/batch"] });
      if (status.signals > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [status?.isGenerating, status?.signals]);

  React.useEffect(() => {
    if (!autoLoaded && signals.length === 0 && !isGenerating && status && !status.isGenerating && !status.lastGenerated && !marketStatus?.isClosed && !marketStatus?.isNightSession) {
      setAutoLoaded(true);
      setIsGenerating(true);
      apiRequest("POST", "/api/signals/generate").catch(() => { setIsGenerating(false); });
    }
  }, [signals.length, autoLoaded, status, marketStatus?.isClosed, marketStatus?.isNightSession]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const res = await apiRequest("POST", "/api/signals/generate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/commodities/signals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rates/batch"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsGenerating(false);
    },
    onError: () => {
      setIsGenerating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const filtered = React.useMemo(() => {
    let result = filter === "FAV"
      ? signals.filter(s => favorites.includes(s.pair))
      : filter === "ALL" ? [...signals] : signals.filter(s => s.action === filter);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      result = result.filter(s => s.pair.toUpperCase().includes(q));
    }

    if (minConfidence > 0) {
      result = result.filter(s => s.confidence >= minConfidence);
    }

    if (timeframeFilter !== "ALL") {
      result = result.filter(s => s.timeframe === timeframeFilter);
    }

    switch (sortMode) {
      case "confidence":
        result.sort((a, b) => b.confidence - a.confidence);
        break;
      case "strength":
        result.sort((a, b) => b.strength - a.strength);
        break;
      case "pair":
        result.sort((a, b) => a.pair.localeCompare(b.pair));
        break;
      case "change":
        result.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
        break;
    }
    return result;
  }, [signals, filter, sortMode, favorites, minConfidence, timeframeFilter, searchQuery]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;
  const buyCount = React.useMemo(() => signals.filter(s => s.action === "BUY").length, [signals]);
  const sellCount = React.useMemo(() => signals.filter(s => s.action === "SELL").length, [signals]);

  const FILTERS = ["ALL", "BUY", "SELL", "HOLD", "FAV"] as const;
  const CONFIDENCE_PRESETS = [0, 65, 70, 75, 80] as const;

  const handleCompare = useCallback((signal: Signal) => {
    if (!compareSignal) {
      setCompareSignal(signal);
    } else if (compareSignal.id === signal.id) {
      setCompareSignal(null);
    } else {
      router.push({
        pathname: "/compare",
        params: {
          signal1: JSON.stringify(compareSignal),
          signal2: JSON.stringify(signal),
        },
      });
      setCompareSignal(null);
    }
  }, [compareSignal]);

  const keyExtractor = useCallback((item: Signal) => item.id, []);
  const getSignalItemLayout = useCallback((_data: any, index: number) => ({
    length: SIGNAL_CARD_HEIGHT,
    offset: SIGNAL_CARD_HEIGHT * index,
    index,
  }), []);

  const renderHeader = () => (
    <View>
      {marketStatus?.isClosed && (
        <View style={[styles.marketClosedBanner, { backgroundColor: themeColors.sell + "12", borderColor: themeColors.sell + "30" }]}>
          <Ionicons name="moon-outline" size={16} color={themeColors.sell} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.marketClosedTitle, { color: themeColors.sell }]}>Mercato chiuso</Text>
            <Text style={[styles.marketClosedSub, { color: themeColors.textSecondary }]}>
              Il mercato forex riapre domenica alle 23:00 CET. I segnali non sono eseguibili durante il weekend.
            </Text>
          </View>
        </View>
      )}
      {!marketStatus?.isClosed && marketStatus?.isNightSession && (
        <View style={[styles.marketClosedBanner, { backgroundColor: "#818CF815", borderColor: "#818CF830" }]}>
          <Ionicons name="moon-outline" size={16} color="#818CF8" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.marketClosedTitle, { color: "#818CF8" }]}>Fascia notturna</Text>
            <Text style={[styles.marketClosedSub, { color: themeColors.textSecondary }]}>
              Generazione segnali sospesa (23:59-08:00 CET). I segnali attivi continuano ad essere monitorati.
            </Text>
          </View>
        </View>
      )}
      <MarketSessions />
      <CountdownBanner />

      <LiveTicker signals={signals} quotes={tvQuotes} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickNav}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/scalping"); }}
          style={[styles.quickNavBtn, { backgroundColor: "#FBBF2415", borderColor: "#FBBF2430" }]}
        >
          <Ionicons name="diamond" size={16} color="#FBBF24" />
          <Text style={[styles.quickNavText, { color: "#FBBF24" }]}>Scalping</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/sniper"); }}
          style={[styles.quickNavBtn, { backgroundColor: "#FF6B3515", borderColor: "#FF6B3530" }]}
        >
          <Ionicons name="locate" size={16} color="#FF6B35" />
          <Text style={[styles.quickNavText, { color: "#FF6B35" }]}>Sniper</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/coach"); }}
          style={[styles.quickNavBtn, { backgroundColor: themeColors.accent + "12", borderColor: themeColors.accent + "30" }]}
        >
          <Ionicons name="sparkles" size={16} color={themeColors.accent} />
          <Text style={[styles.quickNavText, { color: themeColors.accent }]}>Coach IA</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/strength"); }}
          style={[styles.quickNavBtn, { backgroundColor: "#818CF815", borderColor: "#818CF830" }]}
        >
          <Ionicons name="bar-chart" size={16} color="#818CF8" />
          <Text style={[styles.quickNavText, { color: "#818CF8" }]}>Forza Valute</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/achievements"); }}
          style={[styles.quickNavBtn, { backgroundColor: "#FBBF2415", borderColor: "#FBBF2430" }]}
        >
          <Ionicons name="trophy" size={16} color="#FBBF24" />
          <Text style={[styles.quickNavText, { color: "#FBBF24" }]}>Traguardi</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/correlations"); }}
          style={[styles.quickNavBtn, { backgroundColor: "#F472B615", borderColor: "#F472B630" }]}
        >
          <Ionicons name="git-network" size={16} color="#F472B6" />
          <Text style={[styles.quickNavText, { color: "#F472B6" }]}>Correlazioni</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/volatility"); }}
          style={[styles.quickNavBtn, { backgroundColor: "#EF444415", borderColor: "#EF444430" }]}
        >
          <Ionicons name="pulse" size={16} color="#EF4444" />
          <Text style={[styles.quickNavText, { color: "#EF4444" }]}>Volatilita</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/simulator"); }}
          style={[styles.quickNavBtn, { backgroundColor: themeColors.accent + "12", borderColor: themeColors.accent + "30" }]}
        >
          <Ionicons name="wallet" size={16} color={themeColors.accent} />
          <Text style={[styles.quickNavText, { color: themeColors.accent }]}>Simulatore</Text>
        </Pressable>
      </ScrollView>

      {dashConfig.filter(s => s.visible).map(section => {
        switch (section.key) {
          case "morning": return <MorningBriefing key={section.key} />;
          case "heatmap": return <SentimentHeatmap key={section.key} />;
          case "sentiment": return <MarketSentimentBanner key={section.key} />;
          case "portfolio": return <PortfolioWidget key={section.key} signals={signals} />;
          case "risk": return <RiskExposureDashboard key={section.key} signals={signals} livePrices={tvQuotes} />;
          case "performance": return stats ? <PerformanceBar key={section.key} stats={stats} /> : null;
          case "daily": return <DailySummary key={section.key} market={market} />;
          default: return null;
        }
      })}
      {signals.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
        >
          {SORT_OPTIONS.map((opt) => {
            const isActive = sortMode === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setSortMode(opt.key);
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: isActive ? themeColors.accent + "20" : "transparent",
                    borderColor: isActive ? themeColors.accent + "40" : "transparent",
                  },
                ]}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={11}
                  color={isActive ? themeColors.accent : themeColors.textMuted}
                />
                <Text
                  style={[
                    styles.sortText,
                    {
                      color: isActive ? themeColors.accent : themeColors.textMuted,
                      fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {signals.length > 0 && (
        <View style={[styles.searchBar, { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border }]}>
          <Ionicons name="search" size={16} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Cerca coppia..."
            placeholderTextColor={themeColors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="characters"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
            </Pressable>
          )}
        </View>
      )}
      {signals.length > 0 && (
        <View style={styles.confidenceFilterRow}>
          <View style={styles.confidenceFilterLabel}>
            <Ionicons name="shield-checkmark" size={12} color={themeColors.accent} />
            <Text style={[styles.confidenceFilterLabelText, { color: themeColors.textMuted }]}>Min. Conf.</Text>
          </View>
          {CONFIDENCE_PRESETS.map((preset) => {
            const isActive = minConfidence === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => {
                  setMinConfidence(preset);
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.confidenceChip,
                  {
                    backgroundColor: isActive ? themeColors.accent + "20" : "transparent",
                    borderColor: isActive ? themeColors.accent + "40" : themeColors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.confidenceChipText,
                    {
                      color: isActive ? themeColors.accent : themeColors.textSecondary,
                      fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {preset === 0 ? "Tutti" : `${preset}%`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {signals.length > 0 && (
        <View style={styles.confidenceFilterRow}>
          <View style={styles.confidenceFilterLabel}>
            <Ionicons name="time-outline" size={12} color={themeColors.accent} />
            <Text style={[styles.confidenceFilterLabelText, { color: themeColors.textMuted }]}>Timeframe</Text>
          </View>
          {(["ALL", "H1", "H4", "D1"] as const).map((tf) => {
            const isActive = timeframeFilter === tf;
            return (
              <Pressable
                key={tf}
                onPress={() => {
                  setTimeframeFilter(tf);
                  Haptics.selectionAsync();
                }}
                style={[
                  styles.confidenceChip,
                  {
                    backgroundColor: isActive ? themeColors.accent + "20" : "transparent",
                    borderColor: isActive ? themeColors.accent + "40" : themeColors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.confidenceChipText,
                    {
                      color: isActive ? themeColors.accent : themeColors.textSecondary,
                      fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {tf === "ALL" ? "Tutti" : tf}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderSkeleton = () => (
    <View style={{ paddingTop: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <SignalSkeleton key={i} />
      ))}
    </View>
  );

  const marketLabel = market === "forex" ? "Segnali Forex" : "Materie Prime";
  const signalCount = market === "forex" ? (status?.signals ?? signals.length) : (status?.commoditySignals ?? signals.length);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <NotificationBanner />
      <LinearGradient
        colors={[themeColors.gradientStart, themeColors.background]}
        style={[styles.header, { paddingTop: topInset + 16 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: themeColors.text }]}>{marketLabel}</Text>
            <View style={styles.liveRow}>
              <PulsingDot />
              <Text style={[styles.liveText, { color: themeColors.textSecondary }]}>
                {signals.length > 0 ? `${signals.length} segnali attivi` : "Nessun segnale"}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              style={[styles.generateBtn, { backgroundColor: (isGenerating || marketStatus?.isClosed || marketStatus?.isNightSession) ? themeColors.backgroundElevated : themeColors.accent }]}
              onPress={() => {
                if (marketStatus?.isClosed || marketStatus?.isNightSession) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  return;
                }
                if (!isGenerating) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowConfirmGenerate(true);
                }
              }}
              disabled={isGenerating || !!marketStatus?.isClosed || !!marketStatus?.isNightSession}
            >
              {isGenerating ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <ActivityIndicator size="small" color={themeColors.accent} />
                  <Text style={[styles.generateBtnText, { color: themeColors.accent }]}>AI...</Text>
                </View>
              ) : marketStatus?.isClosed ? (
                <>
                  <Ionicons name="moon-outline" size={16} color={themeColors.textMuted} />
                  <Text style={[styles.generateBtnText, { color: themeColors.textMuted }]}>Chiuso</Text>
                </>
              ) : marketStatus?.isNightSession ? (
                <>
                  <Ionicons name="moon-outline" size={16} color="#818CF8" />
                  <Text style={[styles.generateBtnText, { color: "#818CF8" }]}>Notturno</Text>
                </>
              ) : (
                <>
                  <Ionicons name="flash" size={16} color={themeColors.background} />
                  <Text style={[styles.generateBtnText, { color: themeColors.background }]}>Genera</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <View style={[styles.marketToggle, { backgroundColor: themeColors.backgroundElevated }]}>
          <Pressable
            onPress={() => { setMarket("forex"); Haptics.selectionAsync(); }}
            style={[styles.marketBtn, market === "forex" && styles.marketBtnActive]}
          >
            <Ionicons name="cash-outline" size={14} color={market === "forex" ? themeColors.accent : themeColors.textMuted} />
            <Text style={[styles.marketBtnText, { color: market === "forex" ? themeColors.accent : themeColors.textMuted }]}>Forex</Text>
          </Pressable>
          <Pressable
            onPress={() => { setMarket("commodities"); Haptics.selectionAsync(); }}
            style={[styles.marketBtn, market === "commodities" && styles.marketBtnActive]}
          >
            <Ionicons name="diamond-outline" size={14} color={market === "commodities" ? themeColors.accent : themeColors.textMuted} />
            <Text style={[styles.marketBtnText, { color: market === "commodities" ? themeColors.accent : themeColors.textMuted }]}>Materie Prime</Text>
          </Pressable>
        </View>

        {signals.length > 0 && (
          <View style={styles.statsRow}>
            <View style={[styles.statItem, { backgroundColor: themeColors.buyBg, borderColor: themeColors.buyBorder }]}>
              <Text style={[styles.statValue, { color: themeColors.buy }]}>{buyCount}</Text>
              <Text style={[styles.statLabel, { color: themeColors.buy }]}>BUY</Text>
            </View>
            <View style={[styles.statItem, { backgroundColor: themeColors.sellBg, borderColor: themeColors.sellBorder }]}>
              <Text style={[styles.statValue, { color: themeColors.sell }]}>{sellCount}</Text>
              <Text style={[styles.statLabel, { color: themeColors.sell }]}>SELL</Text>
            </View>
            <View style={[styles.statItem, { backgroundColor: themeColors.holdBg, borderColor: themeColors.holdBorder }]}>
              <Text style={[styles.statValue, { color: themeColors.hold }]}>{signals.length - buyCount - sellCount}</Text>
              <Text style={[styles.statLabel, { color: themeColors.hold }]}>HOLD</Text>
            </View>
          </View>
        )}

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const isActive = filter === f;
            const fColor = f === "BUY" ? themeColors.buy : f === "SELL" ? themeColors.sell : f === "HOLD" ? themeColors.hold : f === "FAV" ? themeColors.hold : themeColors.accent;
            const fBg = f === "BUY" ? themeColors.buyBg : f === "SELL" ? themeColors.sellBg : f === "HOLD" ? themeColors.holdBg : f === "FAV" ? themeColors.holdBg : themeColors.backgroundElevated;
            const fBorder = f === "BUY" ? themeColors.buyBorder : f === "SELL" ? themeColors.sellBorder : f === "HOLD" ? themeColors.holdBorder : f === "FAV" ? themeColors.holdBorder : themeColors.border;
            return (
              <Pressable
                key={f}
                onPress={() => { setFilter(f); Haptics.selectionAsync(); }}
                style={[styles.filterBtn, { backgroundColor: isActive ? fBg : "transparent", borderColor: isActive ? fBorder : "transparent" }]}
              >
                {f === "FAV" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Ionicons name="star" size={10} color={isActive ? fColor : themeColors.textSecondary} />
                    <Text style={[styles.filterText, { color: isActive ? fColor : themeColors.textSecondary, fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                      {favorites.length}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.filterText, { color: isActive ? fColor : themeColors.textSecondary, fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                    {f}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      {compareSignal && (
        <View style={[styles.compareBanner, { backgroundColor: "#818CF815", borderColor: "#818CF830" }]}>
          <Ionicons name="git-compare" size={14} color="#818CF8" />
          <Text style={[styles.compareBannerText, { color: "#818CF8" }]} numberOfLines={1}>
            {compareSignal.pair} selezionato - scegli il secondo segnale
          </Text>
          <Pressable
            onPress={() => { setCompareSignal(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color="#818CF8" />
          </Pressable>
        </View>
      )}

      {isLoading || (isGenerating && signals.length === 0) ? (
        isGenerating ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={themeColors.accent} />
            <Text style={[styles.loadingText, { color: themeColors.text }]}>
              Analisi AI in corso...
            </Text>
            <Text style={[styles.loadingSubtext, { color: themeColors.textSecondary }]}>
              L'AI sta analizzando i mercati e generando segnali per forex e materie prime
            </Text>
          </View>
        ) : (
          renderSkeleton()
        )
      ) : filtered.length === 0 && signals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: marketStatus?.isClosed ? themeColors.sell + "15" : themeColors.accent + "15" }]}>
            <Ionicons name={marketStatus?.isClosed ? "moon-outline" : "flash-outline"} size={36} color={marketStatus?.isClosed ? themeColors.sell : themeColors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
            {marketStatus?.isClosed ? "Mercato chiuso" : "Nessun segnale"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
            {marketStatus?.isClosed
              ? "Il mercato forex e materie prime e' chiuso durante il weekend. I segnali verranno generati automaticamente alla riapertura domenica alle 00:00 CET (1h dopo l'apertura per evitare volatilita')."
              : "Tocca il pulsante \"Genera\" in alto per analizzare i mercati con l'intelligenza artificiale"}
          </Text>
          {!marketStatus?.isClosed && (
            <View style={styles.emptyHintRow}>
              <Ionicons name="arrow-down-outline" size={14} color={themeColors.textMuted} />
              <Text style={[styles.emptyHintText, { color: themeColors.textMuted }]}>
                Scorri verso il basso per aggiornare
              </Text>
            </View>
          )}
        </View>
      ) : filtered.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          {renderHeader()}
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: (filter === "FAV" ? themeColors.hold : filter === "ALL" ? "#FFB347" : themeColors.accent) + "15" }]}>
              <Ionicons
                name={filter === "FAV" ? "star-outline" : filter === "ALL" ? "pulse-outline" : "filter-outline"}
                size={36}
                color={filter === "FAV" ? themeColors.hold : filter === "ALL" ? "#FFB347" : themeColors.accent}
              />
            </View>
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
              {filter === "FAV" ? "Nessun preferito"
                : filter === "ALL" ? "Mercato in consolidamento"
                : filter === "BUY" ? "Nessun segnale BUY attivo ora"
                : filter === "SELL" ? "Nessun segnale SELL attivo ora"
                : timeframeFilter !== "ALL" ? `Nessun segnale ${timeframeFilter}`
                : `Nessun segnale ${filter}`}
            </Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              {filter === "FAV"
                ? "Tocca la stella su un segnale per aggiungerlo ai preferiti"
                : filter === "ALL"
                  ? "I segnali arrivano quando il mercato si muove. Nel frattempo, esplora gli strumenti disponibili."
                  : "Prova a cambiare filtro o genera nuovi segnali"}
            </Text>
            {filter !== "FAV" && (
              <View style={styles.emptyCtaRow}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/calendar");
                  }}
                  style={[styles.emptyCtaBtn, { backgroundColor: themeColors.accent + "10", borderColor: themeColors.accent + "30" }]}
                >
                  <Ionicons name="calendar-outline" size={20} color={themeColors.accent} />
                  <Text style={[styles.emptyCtaText, { color: themeColors.accent }]}>Calendario</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/alerts");
                  }}
                  style={[styles.emptyCtaBtn, { backgroundColor: "#818CF8" + "10", borderColor: "#818CF8" + "30" }]}
                >
                  <Ionicons name="notifications-outline" size={20} color="#818CF8" />
                  <Text style={[styles.emptyCtaText, { color: "#818CF8" }]}>Alert Prezzi</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/scalping");
                  }}
                  style={[styles.emptyCtaBtn, { backgroundColor: "#FBBF24" + "10", borderColor: "#FBBF24" + "30" }]}
                >
                  <Ionicons name="diamond" size={20} color="#FBBF24" />
                  <Text style={[styles.emptyCtaText, { color: "#FBBF24" }]}>Scalping</Text>
                </Pressable>
              </View>
            )}
            <Text style={[styles.emptyMotivText, { color: themeColors.textMuted }]}>
              {filter === "FAV"
                ? ""
                : "Imposta un alert per non perdere il prossimo segnale."}
            </Text>
            <Pressable
              onPress={() => {
                setFilter("ALL");
                setTimeframeFilter("ALL");
                setMinConfidence(0);
                setSearchQuery("");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[styles.resetFilterBtn, { backgroundColor: themeColors.accent + "20", borderColor: themeColors.accent + "40" }]}
            >
              <Ionicons name="refresh" size={14} color={themeColors.accent} />
              <Text style={[styles.resetFilterText, { color: themeColors.accent }]}>Resetta tutti i filtri</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderHeader}
          renderItem={({ item, index }) => (
            <SignalCard
              signal={item}
              index={index}
              ratesData={batchRates?.[`${item.base}-${item.quote}`]}
              market={market}
              livePrice={tvMap[item.pair]}
              compareSignal={compareSignal}
              onCompare={handleCompare}
            />
          )}
          getItemLayout={getSignalItemLayout}
          windowSize={7}
          maxToRenderPerBatch={5}
          initialNumToRender={5}
          removeClippedSubviews={Platform.OS !== "web"}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 100 }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={themeColors.accent} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      <Modal
        visible={showConfirmGenerate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmGenerate(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: 40 }}
          onPress={() => setShowConfirmGenerate(false)}
        >
          <Pressable
            style={{ backgroundColor: themeColors.backgroundCard, borderRadius: 16, padding: 24, width: "100%", maxWidth: 320, borderWidth: 1, borderColor: themeColors.border }}
            onPress={() => {}}
          >
            <Ionicons name="warning-outline" size={32} color="#FFB347" style={{ alignSelf: "center", marginBottom: 12 }} />
            <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: themeColors.text, textAlign: "center", marginBottom: 8 }}>
              Genera Nuovi Segnali
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: themeColors.textMuted, textAlign: "center", marginBottom: 20, lineHeight: 18 }}>
              I segnali attivi verranno sostituiti con nuovi segnali AI. Vuoi continuare?
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => setShowConfirmGenerate(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: themeColors.border, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: themeColors.textMuted }}>Annulla</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowConfirmGenerate(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  generateMutation.mutate();
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: themeColors.accent, alignItems: "center" }}
              >
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#0A0E1A" }}>Genera</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: Colors.dark.text, letterSpacing: -0.5 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.dark.buy },
  liveText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  generateBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, minWidth: 44, minHeight: 44, justifyContent: "center" },
  generateBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  marketToggle: { flexDirection: "row", gap: 8, marginBottom: 14, backgroundColor: Colors.dark.backgroundElevated, borderRadius: 12, padding: 3 },
  marketBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10 },
  marketBtnActive: { backgroundColor: Colors.dark.accent + "15" },
  marketBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  statValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  filterText: { fontSize: 12 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  sortRow: { paddingHorizontal: 20, paddingVertical: 8, gap: 6 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  sortText: { fontSize: 11 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  pairInfo: { flex: 1 },
  flagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardSubRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pairText: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.dark.text, letterSpacing: 0.5 },
  timeframeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timeframeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  changeText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  tfBadges: { flexDirection: "row", gap: 4 },
  tfBadge: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  tfBadgeLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold" },
  actionBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  actionText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  strengthRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  strengthLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  strengthValue: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  strengthBar: { height: 4, borderRadius: 2, marginBottom: 14, overflow: "hidden" },
  strengthFill: { height: "100%", borderRadius: 2 },
  newsWarningBanner: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, marginBottom: 10 },
  newsWarningText: { fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: Colors.dark.backgroundElevated, borderRadius: 10 },
  tpRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  priceItem: { flex: 1, alignItems: "center" },
  priceDivider: { width: 1, backgroundColor: Colors.dark.border },
  priceLabel: { fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 3 },
  priceValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cardBottom: { gap: 8 },
  summaryText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  confidenceText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  timeAgoRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  timeAgoText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  freshDot: { width: 6, height: 6, borderRadius: 3 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  loadingSubtext: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" as const, paddingHorizontal: 40, lineHeight: 20 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyHintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, opacity: 0.7 },
  emptyHintText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  perfBar: { marginHorizontal: 20, marginBottom: 10, backgroundColor: Colors.dark.backgroundCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.dark.border, overflow: "hidden" },
  perfStats: { flexDirection: "row", padding: 12, gap: 8 },
  perfItem: { flex: 1, alignItems: "center", gap: 2 },
  perfValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.dark.accent },
  perfLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted },
  perfDivider: { width: 1, alignSelf: "stretch" as const },
  perfFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6, backgroundColor: Colors.dark.backgroundElevated },
  perfFooterText: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted },
  confidenceFilterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 6, gap: 6 },
  confidenceFilterLabel: { flexDirection: "row", alignItems: "center", gap: 3, marginRight: 4 },
  confidenceFilterLabelText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted },
  confidenceChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
  confidenceChipText: { fontSize: 11 },
  resetFilterBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  resetFilterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pnlRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginTop: 4 },
  pnlBar: { height: 6, borderRadius: 3, overflow: "hidden" as const, position: "relative" as const },
  pnlBarCenter: { position: "absolute" as const, left: "49.5%" as any, width: 1, top: 0, bottom: 0 },
  pnlBarFill: { position: "absolute" as const, top: 0, bottom: 0, borderRadius: 3 },
  livePriceRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginTop: 6 },
  livePriceLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  livePriceValue: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  livePriceChange: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  marketClosedBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginHorizontal: 20, marginBottom: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  marketClosedTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  marketClosedSub: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16, marginTop: 2 },
  quickNav: { flexDirection: "row", gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  quickNavBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  quickNavText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dailyCard: { marginHorizontal: 20, marginBottom: 12, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  dailyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  dailyTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dailyTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  dailyPipsQuick: { fontSize: 12, fontFamily: "Inter_700Bold" },
  dailyContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  dailyRow: { flexDirection: "row", gap: 8 },
  dailyItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, gap: 2 },
  dailyItemValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  dailyItemLabel: { fontSize: 9, fontFamily: "Inter_500Medium", textTransform: "uppercase" as const, letterSpacing: 0.3 },
  dailyTpRow: { flexDirection: "row", flexWrap: "wrap" as const, gap: 6 },
  dailyTpChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  dailyTpDot: { width: 6, height: 6, borderRadius: 3 },
  dailyTpText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  compareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 8, borderWidth: 1, marginTop: 8 },
  compareBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  compareBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  compareBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  simulaBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" as const, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, marginTop: 6 },
  simulaBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  holdMonitorCard: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 10, gap: 8 },
  holdMonitorHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  holdMonitorTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  holdTfRow: { flexDirection: "row", gap: 6 },
  holdTfItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8, gap: 3 },
  holdTfLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  holdTfDir: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  holdScoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  holdScoreBar: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" as const },
  holdScoreFill: { height: "100%", borderRadius: 2 },
  holdScoreLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  holdBlockText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  emptyCtaRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  emptyCtaBtn: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  emptyCtaIcon: {},
  emptyCtaText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyMotivText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" as const, lineHeight: 18, marginTop: 4 },
});
