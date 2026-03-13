import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Dimensions,
} from "react-native";
import * as Speech from "expo-speech";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Polyline, Line, Rect, Text as SvgText, Defs, LinearGradient as SvgLinearGradient, Stop, Polygon, Circle } from "react-native-svg";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import TechRadarChart from "@/components/TechRadarChart";

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
  analysis: string;
  timestamp: string;
  change24h: number;
  riskReward: number;
  pipTarget: number;
  newsFactors: string[];
  rsi?: number;
  macd?: number;
  ema20?: number;
  ema50?: number;
  market?: "forex" | "commodities";
  timeframes?: Timeframes;
  confluence?: Confluence;
  chartPattern?: string;
  newsWarning?: string;
}

function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

function getPipMultiplier(pair: string): number {
  const p = pair.toUpperCase();
  if (p.includes("JPY")) return 100;
  if (p.includes("XAU")) return 10;
  if (p.includes("XAG")) return 100;
  if (p.includes("WTI") || p.includes("BRENT")) return 100;
  if (p.includes("XPT")) return 10;
  if (p.includes("XCU")) return 10000;
  if (p.includes("NG")) return 1000;
  return 10000;
}

function formatPips(pips: number): string {
  const abs = Math.abs(pips);
  if (abs >= 100) return pips.toFixed(0);
  if (abs >= 10) return pips.toFixed(1);
  return pips.toFixed(1);
}

const screenWidth = Dimensions.get("window").width;

function DetailChart({ 
  action, strength, seed, data, entryPrice, stopLoss, takeProfit, livePrice, pair 
}: { 
  action: "BUY" | "SELL" | "HOLD";
  strength: number; 
  seed: string; 
  data?: number[]; 
  entryPrice: number; 
  stopLoss: number; 
  takeProfit: number; 
  livePrice?: number;
  pair?: string;
}) {
  const { colors: C } = useTheme();
  const chartWidth = screenWidth - 32;
  const chartHeight = 220;
  const paddingLeft = 8;
  const paddingRight = 76;
  const paddingTop = 18;
  const paddingBottom = 18;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const lineColor = action === "BUY" ? C.buy : action === "SELL" ? C.sell : C.hold;

  const [touchIndex, setTouchIndex] = useState<number | null>(null);
  const chartRef = useRef<View>(null);

  const values = React.useMemo(() => {
    if (data && data.length >= 2) return data;
    const rng = seededRandom(seed + action);
    const vals: number[] = [];
    let val = 50;
    const trend = action === "BUY" ? 0.3 : action === "SELL" ? -0.3 : 0;
    const volatility = (100 - strength) / 100 * 3 + 0.5;
    for (let i = 0; i < 30; i++) {
      val += trend + (rng() - 0.5) * volatility;
      val = Math.max(10, Math.min(90, val));
      vals.push(val);
    }
    return vals;
  }, [data, seed, action, strength]);

  const allPrices = [entryPrice, ...values];
  if (stopLoss > 0) allPrices.push(stopLoss);
  if (takeProfit > 0) allPrices.push(takeProfit);
  if (livePrice != null) allPrices.push(livePrice);
  const dataMin = Math.min(...allPrices);
  const dataMax = Math.max(...allPrices);
  const priceRange = dataMax - dataMin || 1;
  const rangeMin = dataMin - priceRange * 0.1;
  const rangeMax = dataMax + priceRange * 0.1;
  const totalRange = rangeMax - rangeMin;

  const toY = (price: number) => paddingTop + (1 - (price - rangeMin) / totalRange) * plotHeight;
  const toX = (i: number) => paddingLeft + (i / (values.length - 1)) * plotWidth;

  const getIndexFromX = useCallback((pageX: number, layoutX: number) => {
    const x = pageX - layoutX - paddingLeft;
    const idx = Math.round((x / plotWidth) * (values.length - 1));
    return Math.max(0, Math.min(values.length - 1, idx));
  }, [values.length, plotWidth, paddingLeft]);

  const layoutXRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        chartRef.current?.measure((_x, _y, _w, _h, pageX) => {
          layoutXRef.current = pageX;
          const idx = getIndexFromX(evt.nativeEvent.pageX, pageX);
          setTouchIndex(idx);
        });
      },
      onPanResponderMove: (evt) => {
        const idx = getIndexFromX(evt.nativeEvent.pageX, layoutXRef.current);
        setTouchIndex(idx);
      },
      onPanResponderRelease: () => {
        setTouchIndex(null);
      },
      onPanResponderTerminate: () => {
        setTouchIndex(null);
      },
    })
  ).current;

  const pointsStr = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");

  const entryY = toY(entryPrice);
  const slY = toY(stopLoss);
  const tpY = toY(takeProfit);
  const livePriceY = livePrice != null ? toY(livePrice) : null;

  const formatPrice = (p: number | undefined) => {
    if (p == null) return "--";
    return p >= 100 ? p.toFixed(2) : p.toFixed(p >= 10 ? 3 : 5);
  };

  const areaPoints = `${toX(0)},${toY(values[0])} ${pointsStr} ${toX(values.length - 1)},${paddingTop + plotHeight} ${toX(0)},${paddingTop + plotHeight}`;

  const touchVal = touchIndex !== null ? values[touchIndex] : undefined;
  const crosshairX = touchIndex !== null ? toX(touchIndex) : 0;
  const crosshairY = touchVal != null ? toY(touchVal) : 0;
  const crosshairPrice = touchVal;
  const labelWidth = 72;
  const labelX = touchIndex !== null ? Math.max(2, Math.min(chartWidth - labelWidth - 2, crosshairX - labelWidth / 2)) : 0;
  const labelAbove = crosshairY > paddingTop + 24;
  const labelY = labelAbove ? crosshairY - 26 : crosshairY + 10;

  const rightLabelX = chartWidth - paddingRight + 4;
  const rightLabelW = paddingRight - 8;

  const clampLabelY = (y: number, height: number) => Math.max(paddingTop, Math.min(paddingTop + plotHeight - height, y - height / 2));

  return (
    <View style={{ width: chartWidth, alignSelf: "center" }} ref={chartRef} {...panResponder.panHandlers}>
      <Svg width={chartWidth} height={chartHeight}>
        <Defs>
          <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.30" />
            <Stop offset="0.5" stopColor={lineColor} stopOpacity="0.12" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0.02" />
          </SvgLinearGradient>
        </Defs>

        <Polygon points={areaPoints} fill="url(#areaGrad)" />

        <Line x1={paddingLeft} y1={entryY} x2={chartWidth - paddingRight} y2={entryY} stroke={C.accent} strokeWidth="1" strokeDasharray="6,3" opacity={0.7} />
        {stopLoss > 0 && <Line x1={paddingLeft} y1={slY} x2={chartWidth - paddingRight} y2={slY} stroke={C.sell} strokeWidth="1" strokeDasharray="4,3" opacity={0.7} />}
        {takeProfit > 0 && <Line x1={paddingLeft} y1={tpY} x2={chartWidth - paddingRight} y2={tpY} stroke={C.buy} strokeWidth="1" strokeDasharray="4,3" opacity={0.7} />}

        {livePrice != null && livePriceY != null && (
          <Line x1={paddingLeft} y1={livePriceY} x2={chartWidth - paddingRight} y2={livePriceY} stroke="#FFD700" strokeWidth="1.5" strokeDasharray="2,2" opacity={0.9} />
        )}

        <Rect x={rightLabelX} y={clampLabelY(entryY, 20)} width={rightLabelW} height={20} rx={4} fill={C.accent + "20"} stroke={C.accent + "50"} strokeWidth="0.5" />
        <SvgText x={rightLabelX + rightLabelW / 2} y={clampLabelY(entryY, 20) + 13} fontSize="8.5" fontWeight="700" fill={C.accent} textAnchor="middle">
          {formatPrice(entryPrice)}
        </SvgText>

        {stopLoss > 0 && (
          <>
            <Rect x={rightLabelX} y={clampLabelY(slY, 20)} width={rightLabelW} height={20} rx={4} fill={C.sell + "20"} stroke={C.sell + "50"} strokeWidth="0.5" />
            <SvgText x={rightLabelX + rightLabelW / 2} y={clampLabelY(slY, 20) + 13} fontSize="8.5" fontWeight="700" fill={C.sell} textAnchor="middle">
              {formatPrice(stopLoss)}
            </SvgText>
          </>
        )}

        {takeProfit > 0 && (
          <>
            <Rect x={rightLabelX} y={clampLabelY(tpY, 20)} width={rightLabelW} height={20} rx={4} fill={C.buy + "20"} stroke={C.buy + "50"} strokeWidth="0.5" />
            <SvgText x={rightLabelX + rightLabelW / 2} y={clampLabelY(tpY, 20) + 13} fontSize="8.5" fontWeight="700" fill={C.buy} textAnchor="middle">
              {formatPrice(takeProfit)}
            </SvgText>
          </>
        )}

        {livePrice != null && livePriceY != null && (
          <>
            <Rect x={rightLabelX} y={clampLabelY(livePriceY, 20)} width={rightLabelW} height={20} rx={4} fill="#FFD700" stroke="#FFD700" strokeWidth="0.5" opacity={0.25} />
            <SvgText x={rightLabelX + rightLabelW / 2} y={clampLabelY(livePriceY, 20) + 13} fontSize="8.5" fontWeight="700" fill="#FFD700" textAnchor="middle">
              {formatPrice(livePrice)}
            </SvgText>
          </>
        )}

        <Polyline points={pointsStr} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {livePrice != null && livePriceY != null && (
          <>
            <Circle cx={toX(values.length - 1)} cy={livePriceY} r={5} fill="#FFD700" opacity={0.3} />
            <Circle cx={toX(values.length - 1)} cy={livePriceY} r={3} fill="#FFD700" stroke={C.backgroundCard} strokeWidth="1" />
          </>
        )}

        {touchIndex !== null && touchVal != null && (
          <>
            <Line x1={crosshairX} y1={paddingTop} x2={crosshairX} y2={paddingTop + plotHeight} stroke={C.text} strokeWidth="1" strokeDasharray="3,2" opacity={0.6} />
            <Circle cx={crosshairX} cy={crosshairY} r={4} fill={lineColor} stroke={C.text} strokeWidth="1.5" opacity={0.9} />
            <Rect x={labelX} y={labelY} width={labelWidth} height={20} rx={6} fill={C.backgroundCard} stroke={C.border} strokeWidth="1" opacity={0.95} />
            <SvgText x={labelX + labelWidth / 2} y={labelY + 14} fontSize="11" fontWeight="700" fill={C.text} textAnchor="middle">
              {formatPrice(crosshairPrice)}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const { colors: C } = useTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: C.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? C.text }]}>{value}</Text>
    </View>
  );
}

function SectionCard({ title, children, entering }: { title: string; children: React.ReactNode; entering?: any }) {
  const { colors: C } = useTheme();
  const Wrapper = entering ? Animated.View : View;
  return (
    <Wrapper entering={entering} style={[styles.sectionCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
      <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>{title}</Text>
      {children}
    </Wrapper>
  );
}

function IndicatorGauge({ label, value, min, max, zones }: {
  label: string;
  value: number;
  min: number;
  max: number;
  zones: { from: number; to: number; color: string; label: string }[];
}) {
  const { colors: C } = useTheme();
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const activeZone = zones.find(z => value >= z.from && value <= z.to);

  return (
    <View style={styles.gaugeContainer}>
      <View style={styles.gaugeHeader}>
        <Text style={styles.gaugeLabel}>{label}</Text>
        <Text style={[styles.gaugeValue, { color: activeZone?.color ?? C.text }]}>
          {typeof value === "number" ? value.toFixed(value > 10 ? 2 : 4) : value}
        </Text>
      </View>
      <View style={styles.gaugeTrack}>
        {zones.map((zone, i) => {
          const width = ((zone.to - zone.from) / (max - min)) * 100;
          const left = ((zone.from - min) / (max - min)) * 100;
          return (
            <View
              key={i}
              style={[styles.gaugeZone, { left: `${left}%` as any, width: `${width}%` as any, backgroundColor: zone.color + "25" }]}
            />
          );
        })}
        <View style={[styles.gaugePointer, { left: `${pct}%` as any, backgroundColor: activeZone?.color ?? C.accent }]} />
      </View>
      <View style={styles.gaugeLabels}>
        {zones.map((zone, i) => (
          <Text key={i} style={[styles.gaugeZoneLabel, { color: zone.color + "80" }]}>{zone.label}</Text>
        ))}
      </View>
    </View>
  );
}

export default function SignalDetailScreen() {
  const { colors: C } = useTheme();
  const { data } = useLocalSearchParams<{ id: string; data: string }>();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  let signal: Signal | null = null;
  try { if (data) signal = JSON.parse(data as string); } catch {}

  const pairKey = signal ? `${signal.base}-${signal.quote}` : "";
  const { data: ratesResponse } = useQuery<{ pair: string; rates: number[] }>({
    queryKey: ["/api/rates", pairKey],
    enabled: !!signal,
    staleTime: 300000,
  });

  interface TVQuote {
    pair: string;
    price: number;
    change: number;
    changeAbs: number;
    high: number;
    low: number;
    open: number;
  }

  const { data: quotesData } = useQuery<TVQuote[]>({
    queryKey: ["/api/quotes"],
    enabled: !!signal,
    staleTime: 5000,
    refetchInterval: 5000,
  });

  const liveQuote = React.useMemo(() => {
    if (!quotesData || !signal) return null;
    return quotesData.find(q => q.pair === signal.pair) ?? null;
  }, [quotesData, signal]);

  interface PairStats {
    pair: string;
    totalSignals: number;
    closedSignals: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
    totalPips: number;
    avgPips: number;
  }

  const encodedPair = signal ? encodeURIComponent(signal.pair) : "";
  const { data: pairStats } = useQuery<PairStats>({
    queryKey: ["/api/stats", encodedPair],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL(`/api/stats/${encodeURIComponent(encodedPair)}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!signal && !!signal.pair,
    staleTime: 60000,
  });

  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSpeech = useCallback(async () => {
    if (Platform.OS === "web" || !signal) return;
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      await Speech.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      const text = `${signal.pair}. Segnale ${signal.action}. Confidenza ${signal.confidence} percento. ${signal.summary}. ${signal.analysis}`;
      Speech.speak(text, {
        language: "it-IT",
        pitch: 1.0,
        rate: 0.95,
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  }, [signal]);

  if (!signal) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
        <Text style={[styles.errorText, { color: C.textSecondary }]}>Segnale non trovato</Text>
      </View>
    );
  }

  const isBuy = signal.action === "BUY";
  const isSell = signal.action === "SELL";
  const actionColor = isBuy ? C.buy : isSell ? C.sell : C.hold;
  const actionBg = isBuy ? C.buyBg : isSell ? C.sellBg : C.holdBg;
  const actionBorder = isBuy ? C.buyBorder : isSell ? C.sellBorder : C.holdBorder;
  const actionIcon = isBuy ? "arrow-up-circle" : isSell ? "arrow-down-circle" : "pause-circle";

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };

  const getTimeAgo = (ts: string) => {
    const now = Date.now();
    const then = new Date(ts).getTime();
    const mins = Math.floor((now - then) / 60000);
    if (mins < 1) return { label: "Adesso", minutes: 0 };
    if (mins < 60) return { label: `${mins} min fa`, minutes: mins };
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { label: `${hrs}h ${mins % 60}m fa`, minutes: mins };
    const days = Math.floor(hrs / 24);
    return { label: `${days}g fa`, minutes: mins };
  };

  const getFreshness = (mins: number) => {
    if (mins <= 30) return { color: "#00D4AA", label: "Fresco - Puoi ancora entrare", icon: "checkmark-circle" as const };
    if (mins <= 120) return { color: "#FFB347", label: "Recente - Verifica il prezzo attuale", icon: "alert-circle" as const };
    if (mins <= 360) return { color: "#FF8C42", label: "Datato - Attenzione, il prezzo potrebbe essere cambiato", icon: "warning" as const };
    return { color: "#FF4D6A", label: "Scaduto - Meglio non entrare", icon: "close-circle" as const };
  };

  const ta = getTimeAgo(signal.timestamp);
  const freshness = getFreshness(ta.minutes);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 30 }} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[isBuy ? "rgba(0,200,150,0.12)" : isSell ? "rgba(255,77,106,0.12)" : "rgba(255,179,71,0.12)", C.background]}
          style={styles.heroSection}
        >
          <Animated.View entering={FadeInDown.springify()} style={styles.heroContent}>
            <View style={styles.pairRow}>
              <Text style={styles.pairText}>{signal.pair}</Text>
              <View style={[styles.actionBadge, { backgroundColor: actionBg, borderColor: actionBorder }]}>
                <Ionicons name={actionIcon as any} size={18} color={actionColor} />
                <Text style={[styles.actionBadgeText, { color: actionColor }]}>{signal.action}</Text>
              </View>
            </View>

            <View style={styles.chartContainer}>
              <DetailChart
                action={signal.action}
                strength={signal.strength}
                seed={signal.pair + "detail"}
                data={ratesResponse?.rates}
                entryPrice={signal.entryPrice}
                stopLoss={signal.action === "HOLD" ? 0 : signal.stopLoss}
                takeProfit={signal.action === "HOLD" ? 0 : signal.takeProfit}
                livePrice={liveQuote?.price}
                pair={signal.pair}
              />
            </View>

            {liveQuote && (
              <View style={[styles.livePriceSection, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
                <View style={styles.livePriceHeader}>
                  <View style={[styles.liveDot, { backgroundColor: "#FFD700" }]} />
                  <Text style={[styles.livePriceLabel, { color: C.textMuted }]}>Prezzo Live</Text>
                  <Text style={[styles.livePriceValue, { color: "#FFD700" }]}>
                    {liveQuote.price >= 100 ? liveQuote.price.toFixed(2) : liveQuote.price.toFixed(liveQuote.price >= 10 ? 3 : 5)}
                  </Text>
                </View>
                <View style={styles.pipDistanceRow}>
                  {(() => {
                    const mult = getPipMultiplier(signal.pair);
                    const distEntry = (liveQuote.price - signal.entryPrice) * mult;
                    const distSL = signal.action !== "HOLD" && signal.stopLoss > 0 ? (liveQuote.price - signal.stopLoss) * mult : null;
                    const distTP = signal.action !== "HOLD" && signal.takeProfit > 0 ? (liveQuote.price - signal.takeProfit) * mult : null;
                    return (
                      <>
                        <View style={[styles.pipDistanceItem, { backgroundColor: C.accent + "12" }]}>
                          <Text style={[styles.pipDistanceItemLabel, { color: C.accent }]}>da Entry</Text>
                          <Text style={[styles.pipDistanceItemValue, { color: C.accent }]}>
                            {distEntry >= 0 ? "+" : ""}{formatPips(distEntry)} pip
                          </Text>
                        </View>
                        {distSL !== null && (
                          <View style={[styles.pipDistanceItem, { backgroundColor: C.sell + "12" }]}>
                            <Text style={[styles.pipDistanceItemLabel, { color: C.sell }]}>da SL</Text>
                            <Text style={[styles.pipDistanceItemValue, { color: C.sell }]}>
                              {distSL >= 0 ? "+" : ""}{formatPips(distSL)} pip
                            </Text>
                          </View>
                        )}
                        {distTP !== null && (
                          <View style={[styles.pipDistanceItem, { backgroundColor: C.buy + "12" }]}>
                            <Text style={[styles.pipDistanceItemLabel, { color: C.buy }]}>da TP</Text>
                            <Text style={[styles.pipDistanceItemValue, { color: C.buy }]}>
                              {distTP >= 0 ? "+" : ""}{formatPips(distTP)} pip
                            </Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>
              </View>
            )}

            <View style={[styles.freshnessBanner, { backgroundColor: freshness.color + "18", borderColor: freshness.color + "40" }]}>
              <View style={styles.freshnessTop}>
                <Ionicons name={freshness.icon} size={16} color={freshness.color} />
                <Text style={[styles.freshnessTime, { color: freshness.color }]}>
                  Uscito {ta.label} alle {formatTime(signal.timestamp)}
                </Text>
                <View style={[styles.freshDotDetail, { backgroundColor: freshness.color }]} />
              </View>
              <Text style={[styles.freshnessHint, { color: freshness.color + "CC" }]}>{freshness.label}</Text>
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.metaBadge, { backgroundColor: C.backgroundElevated }]}>
                <Ionicons name="time-outline" size={12} color={C.textSecondary} />
                <Text style={[styles.metaText, { color: C.textSecondary }]}>{signal.timeframe}</Text>
              </View>
              <View style={[styles.metaBadge, { backgroundColor: C.backgroundElevated }]}>
                <Ionicons name="calendar-outline" size={12} color={C.textSecondary} />
                <Text style={[styles.metaText, { color: C.textSecondary }]}>{formatDate(signal.timestamp)}</Text>
              </View>
            </View>

            <View style={styles.confidenceContainer}>
              <View style={styles.confidenceHeader}>
                <Text style={[styles.confidenceLabel, { color: C.textMuted }]}>Confidenza AI</Text>
                <Text style={[styles.confidenceValue, { color: actionColor }]}>{signal.confidence}%</Text>
              </View>
              <View style={[styles.bar, { backgroundColor: C.backgroundElevated }]}>
                <View style={[styles.barFill, { width: `${signal.confidence}%` as any, backgroundColor: actionColor }]} />
              </View>
            </View>

            <View style={styles.strengthContainer}>
              <View style={styles.confidenceHeader}>
                <Text style={[styles.confidenceLabel, { color: C.textMuted }]}>Forza segnale</Text>
                <Text style={[styles.confidenceValue, { color: C.accent }]}>{signal.strength}%</Text>
              </View>
              <View style={[styles.bar, { backgroundColor: C.backgroundElevated }]}>
                <View style={[styles.barFill, { width: `${signal.strength}%` as any, backgroundColor: C.accent }]} />
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={styles.content}>
          {signal.newsWarning && (
            <Animated.View entering={FadeInDown.delay(80).springify()} style={[styles.newsWarningBanner, { backgroundColor: "#FF8C00" + "18", borderColor: "#FF8C00" + "40" }]}>
              <Ionicons name="warning-outline" size={16} color="#FF8C00" />
              <Text style={styles.newsWarningText}>{signal.newsWarning}</Text>
            </Animated.View>
          )}

          <SectionCard title="PREZZI CHIAVE" entering={FadeInDown.delay(100).springify()}>
            <View style={styles.priceGrid}>
              <View style={[styles.priceGridItem, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
                <Text style={[styles.priceGridLabel, { color: C.textMuted }]}>Prezzo Entrata</Text>
                <Text style={[styles.priceGridValue, { color: C.text }]}>{signal.entryPrice.toFixed(5)}</Text>
              </View>
              {signal.action !== "HOLD" && signal.stopLoss > 0 && (
                <View style={[styles.priceGridItem, { backgroundColor: C.sellBg, borderColor: C.sellBorder }]}>
                  <Text style={[styles.priceGridLabel, { color: (signal.currentSL ?? signal.stopLoss) !== signal.stopLoss ? "#FFB347" : C.sell }]}>
                    {(signal.currentSL ?? signal.stopLoss) !== signal.stopLoss ? "SL Trailing" : "Stop Loss"}
                  </Text>
                  <Text style={[styles.priceGridValue, { color: C.sell }]}>{(signal.currentSL ?? signal.stopLoss).toFixed(5)}</Text>
                  {(signal.currentSL ?? signal.stopLoss) !== signal.stopLoss && (
                    <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: C.textMuted, marginTop: 2 }}>
                      Originale: {signal.stopLoss.toFixed(5)}
                    </Text>
                  )}
                </View>
              )}
            </View>
            {signal.action !== "HOLD" && signal.tp1 != null && <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.textMuted, marginBottom: 8 }}>LIVELLI TAKE PROFIT</Text>
              {[
                { label: "TP1", value: signal.tp1 ?? signal.takeProfit, level: 1, desc: "Conservativo" },
                { label: "TP2", value: signal.tp2 ?? signal.takeProfit, level: 2, desc: "Medio" },
                { label: "TP3", value: signal.tp3 ?? signal.takeProfit, level: 3, desc: "Aggressivo" },
              ].map((tp) => {
                const hit = (signal.tpHit ?? 0) >= tp.level;
                const totalDist = Math.abs(tp.value - signal.entryPrice);
                const pipMul = getPipMultiplier(signal.pair);
                const pipsToTp = Math.round(totalDist * pipMul);
                return (
                  <View key={tp.label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
                    <View style={{ width: 36, alignItems: "center" }}>
                      <Ionicons name={hit ? "checkmark-circle" : "ellipse-outline"} size={18} color={hit ? "#00D4AA" : C.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: hit ? "#00D4AA" : C.text }}>{tp.label} - {tp.desc}</Text>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: hit ? "#00D4AA" : C.buy }}>{tp.value.toFixed(5)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: C.textMuted }}>{pipsToTp} pips</Text>
                        <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: hit ? "#00D4AA" : C.textMuted }}>{hit ? "RAGGIUNTO" : "In attesa"}</Text>
                      </View>
                      <View style={{ height: 3, borderRadius: 1.5, backgroundColor: C.border, marginTop: 4 }}>
                        <View style={{ height: "100%", borderRadius: 1.5, backgroundColor: hit ? "#00D4AA" : C.accent + "40", width: hit ? "100%" : "0%" }} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>}
          </SectionCard>

          <SectionCard title="RADAR TECNICO" entering={FadeInDown.delay(130).springify()}>
            <TechRadarChart
              rsi={signal.rsi}
              macd={signal.macd}
              ema20={signal.ema20}
              ema50={signal.ema50}
              confidence={signal.confidence}
              strength={signal.strength}
              action={signal.action}
            />
          </SectionCard>

          <SectionCard title="INDICATORI TECNICI" entering={FadeInDown.delay(140).springify()}>
            {signal.rsi != null && (
              <IndicatorGauge
                label="RSI (14)"
                value={parseFloat(signal.rsi.toFixed(1))}
                min={0}
                max={100}
                zones={[
                  { from: 0, to: 30, color: C.sell, label: "Ipervenduto" },
                  { from: 30, to: 70, color: C.hold, label: "Neutro" },
                  { from: 70, to: 100, color: C.buy, label: "Ipercomprato" },
                ]}
              />
            )}
            {signal.macd != null && (
              <InfoRow
                label="MACD"
                value={signal.macd.toFixed(5)}
                valueColor={signal.macd >= 0 ? C.buy : C.sell}
              />
            )}
            {signal.ema20 != null && signal.ema50 != null && (
              <>
                <InfoRow label="EMA 20" value={signal.ema20.toFixed(5)} valueColor={C.accent} />
                <InfoRow label="EMA 50" value={signal.ema50.toFixed(5)} valueColor={C.textSecondary} />
                <InfoRow
                  label="EMA Crossover"
                  value={signal.ema20 > signal.ema50 ? "Rialzista ↑" : "Ribassista ↓"}
                  valueColor={signal.ema20 > signal.ema50 ? C.buy : C.sell}
                />
              </>
            )}
          </SectionCard>

          <SectionCard title="STATISTICHE" entering={FadeInDown.delay(180).springify()}>
            <InfoRow label="Variazione 24h" value={`${signal.change24h >= 0 ? "+" : ""}${signal.change24h.toFixed(2)}%`} valueColor={signal.change24h >= 0 ? C.buy : C.sell} />
            <InfoRow label="Rischio/Rendimento" value={`1:${signal.riskReward?.toFixed(1) ?? "2.0"}`} valueColor={C.accent} />
            <InfoRow label="Target (pip)" value={`${signal.pipTarget ?? 50} pip`} valueColor={C.text} />
            <InfoRow label="Timeframe" value={signal.timeframe} />
          </SectionCard>

          {pairStats && pairStats.totalSignals > 0 && (
            <SectionCard title={`STORICO ${signal.pair}`} entering={FadeInDown.delay(190).springify()}>
              <View style={styles.pairStatsHeader}>
                <View style={styles.pairStatsWinRate}>
                  <Text style={[styles.pairStatsWinRateValue, { color: pairStats.winRate >= 50 ? C.buy : C.sell }]}>
                    {pairStats.winRate}%
                  </Text>
                  <Text style={[styles.pairStatsWinRateLabel, { color: C.textMuted }]}>Win Rate</Text>
                </View>
                <View style={[styles.pairStatsWinBar, { backgroundColor: C.backgroundElevated }]}>
                  <View style={[styles.pairStatsWinBarFill, { width: `${pairStats.winRate}%` as any, backgroundColor: pairStats.winRate >= 50 ? C.buy : C.sell }]} />
                </View>
              </View>
              <View style={styles.pairStatsGrid}>
                <View style={[styles.pairStatItem, { backgroundColor: C.buyBg, borderColor: C.buyBorder }]}>
                  <Text style={[styles.pairStatValue, { color: C.buy }]}>{pairStats.wins}</Text>
                  <Text style={[styles.pairStatLabel, { color: C.buy }]}>TP</Text>
                </View>
                <View style={[styles.pairStatItem, { backgroundColor: C.sellBg, borderColor: C.sellBorder }]}>
                  <Text style={[styles.pairStatValue, { color: C.sell }]}>{pairStats.losses}</Text>
                  <Text style={[styles.pairStatLabel, { color: C.sell }]}>SL</Text>
                </View>
                <View style={[styles.pairStatItem, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
                  <Text style={[styles.pairStatValue, { color: C.textSecondary }]}>{pairStats.pending}</Text>
                  <Text style={[styles.pairStatLabel, { color: C.textMuted }]}>In Attesa</Text>
                </View>
              </View>
              <InfoRow label="Segnali totali" value={`${pairStats.totalSignals}`} />
              <InfoRow label={`${signal.pair}: TP su segnali chiusi`} value={`${pairStats.wins} su ${pairStats.closedSignals}`} valueColor={C.accent} />
              <InfoRow label="Pip totali" value={`${pairStats.totalPips >= 0 ? "+" : ""}${pairStats.totalPips}`} valueColor={pairStats.totalPips >= 0 ? C.buy : C.sell} />
              <InfoRow label="Pip medi" value={`${pairStats.avgPips >= 0 ? "+" : ""}${pairStats.avgPips}`} valueColor={pairStats.avgPips >= 0 ? C.buy : C.sell} />
            </SectionCard>
          )}

          {signal.timeframes && (
            <SectionCard title="MULTI-TIMEFRAME" entering={FadeInDown.delay(200).springify()}>
              <View style={styles.tfRow}>
                {(["h1", "h4", "d1"] as const).map(tf => {
                  const dir = signal.timeframes![tf];
                  const tfColor = dir === "BUY" ? C.buy : dir === "SELL" ? C.sell : C.hold;
                  const tfIcon = dir === "BUY" ? "arrow-up" : dir === "SELL" ? "arrow-down" : "remove";
                  const tfLabel = tf.toUpperCase();
                  const aligned = dir === signal.action;
                  return (
                    <View key={tf} style={[styles.tfItem, { backgroundColor: tfColor + "15", borderColor: tfColor + "30" }]}>
                      <Text style={[styles.tfLabel, { color: C.textSecondary }]}>{tfLabel}</Text>
                      <Ionicons name={tfIcon as any} size={20} color={tfColor} />
                      <Text style={[styles.tfAction, { color: tfColor }]}>{dir}</Text>
                      {aligned && (
                        <View style={[styles.tfAligned, { backgroundColor: C.accent + "20" }]}>
                          <Ionicons name="checkmark" size={10} color={C.accent} />
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              {(() => {
                const cf = signal.confluence;
                const score = cf?.score ?? 0;
                const isAligned = cf?.aligned ?? false;
                const convergence = isAligned ? "Forte" : score >= 1 ? "Parziale" : "Divergenza";
                const convColor = isAligned ? C.buy : score >= 1 ? "#FBBF24" : C.sell;
                return (
                  <View>
                    <InfoRow label="Confluenza" value={`${convergence} (${score}/3)`} valueColor={convColor} />
                    {cf && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                        {([["H1", cf.h1], ["H4", cf.h4], ["D1", cf.d1]] as [string, number][]).map(([label, val]) => (
                          <Text key={label} style={{ fontSize: 11, color: val > 0.2 ? C.buy : val < -0.2 ? C.sell : C.textMuted }}>
                            {label}: {val > 0 ? "+" : ""}{val.toFixed(2)}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })()}
            </SectionCard>
          )}

          <Animated.View entering={FadeInDown.delay(220).springify()}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push({
                  pathname: "/calculator",
                  params: {
                    entry: signal.entryPrice.toString(),
                    sl: signal.stopLoss.toString(),
                    pair: signal.pair,
                  },
                });
              }}
              style={styles.calcButton}
            >
              <Ionicons name="calculator-outline" size={18} color={C.background} />
              <Text style={styles.calcButtonText}>Calcolatore Rischio</Text>
            </Pressable>
          </Animated.View>

          {(signal.summary || signal.analysis) && Platform.OS !== "web" && (
            <Animated.View entering={FadeInDown.delay(215).springify()}>
              <Pressable
                onPress={handleSpeech}
                style={[styles.audioBtn, { backgroundColor: isSpeaking ? C.accent + "20" : C.backgroundCard, borderColor: isSpeaking ? C.accent : C.border }]}
              >
                <Ionicons name={isSpeaking ? "stop-circle" : "volume-high-outline"} size={18} color={isSpeaking ? C.accent : C.textSecondary} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: isSpeaking ? C.accent : C.textSecondary }}>
                  {isSpeaking ? "Interrompi lettura" : "Ascolta analisi"}
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {signal.summary && (
            <SectionCard title="SINTESI AI" entering={FadeInDown.delay(220).springify()}>
              <Text style={[styles.analysisText, { color: C.textSecondary }]}>{signal.summary}</Text>
            </SectionCard>
          )}

          {signal.analysis && (
            <SectionCard title="ANALISI COMPLETA" entering={FadeInDown.delay(260).springify()}>
              <Text style={[styles.analysisText, { color: C.textSecondary }]}>{signal.analysis}</Text>
            </SectionCard>
          )}

          {signal.chartPattern && signal.chartPattern !== "Nessun pattern chiaro" && (
            <SectionCard title="PATTERN TECNICO" entering={FadeInDown.delay(280).springify()}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.accent + "20", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="analytics-outline" size={20} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: C.text }}>{signal.chartPattern}</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: C.textMuted, marginTop: 2 }}>Pattern identificato dall'AI sull'analisi grafica corrente</Text>
                </View>
              </View>
            </SectionCard>
          )}

          {signal.newsFactors && signal.newsFactors.length > 0 && (
            <SectionCard title="FATTORI DI NOTIZIE" entering={FadeInDown.delay(300).springify()}>
              {signal.newsFactors.map((factor, i) => (
                <View key={i} style={styles.newsFactorRow}>
                  <View style={[styles.newsDot, { backgroundColor: C.accent }]} />
                  <Text style={[styles.newsFactorText, { color: C.textSecondary }]}>{factor}</Text>
                </View>
              ))}
            </SectionCard>
          )}

          <Animated.View entering={FadeInDown.delay(340).springify()} style={[styles.disclaimerBox, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={C.textMuted} />
            <Text style={[styles.disclaimerText, { color: C.textMuted }]}>
              I segnali AI sono solo a scopo informativo. Il trading forex comporta rischi significativi.
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  heroContent: { gap: 16 },
  pairRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pairText: { fontSize: 34, fontFamily: "Inter_700Bold", color: Colors.dark.text, letterSpacing: -1 },
  chartContainer: { alignItems: "center", paddingVertical: 4 },
  livePriceSection: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  livePriceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  livePriceLabel: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  livePriceValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  pipDistanceRow: { flexDirection: "row", gap: 8 },
  pipDistanceItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, gap: 2 },
  pipDistanceItemLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  pipDistanceItemValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
  actionBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  actionBadgeText: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  freshnessBanner: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 4, marginBottom: 4 },
  freshnessTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  freshnessTime: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  freshnessHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginLeft: 22 },
  freshDotDetail: { width: 8, height: 8, borderRadius: 4 },
  metaRow: { flexDirection: "row", gap: 8 },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  confidenceContainer: { gap: 6 },
  strengthContainer: { gap: 6 },
  confidenceHeader: { flexDirection: "row", justifyContent: "space-between" },
  confidenceLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  confidenceValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  content: { paddingHorizontal: 16, gap: 12 },
  newsWarningBanner: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, marginBottom: 4 },
  newsWarningText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#FF8C00", flex: 1 },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 4 },
  priceGrid: { flexDirection: "row", gap: 10 },
  priceGridItem: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 4 },
  priceGridLabel: { fontSize: 10, fontFamily: "Inter_500Medium" },
  priceGridValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.dark.border },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  analysisText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  newsFactorRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  newsDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  newsFactorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  audioBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1 },
  disclaimerBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  disclaimerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular", marginTop: 12 },
  gaugeContainer: { gap: 4, paddingVertical: 6 },
  gaugeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  gaugeLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted },
  gaugeValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  gaugeTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.dark.backgroundElevated, overflow: "hidden", position: "relative" as const },
  gaugeZone: { position: "absolute" as const, top: 0, bottom: 0, borderRadius: 4 },
  gaugePointer: { position: "absolute" as const, top: -1, width: 4, height: 10, borderRadius: 2 },
  gaugeLabels: { flexDirection: "row", justifyContent: "space-between" },
  gaugeZoneLabel: { fontSize: 9, fontFamily: "Inter_400Regular" },
  tfRow: { flexDirection: "row", gap: 10 },
  tfItem: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  tfLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tfAction: { fontSize: 12, fontFamily: "Inter_700Bold" },
  tfAligned: { position: "absolute" as const, top: 4, right: 4, borderRadius: 8, width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  calcButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.dark.accent, paddingVertical: 14, borderRadius: 14 },
  calcButtonText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.dark.background },
  pairStatsHeader: { gap: 8, marginBottom: 4 },
  pairStatsWinRate: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  pairStatsWinRateValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  pairStatsWinRateLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  pairStatsWinBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  pairStatsWinBarFill: { height: "100%", borderRadius: 3 },
  pairStatsGrid: { flexDirection: "row", gap: 10, marginTop: 4 },
  pairStatItem: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  pairStatValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  pairStatLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
