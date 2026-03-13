import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  PanResponder,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, {
  Polyline,
  Line,
  Rect,
  Text as SvgText,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Polygon,
  Circle,
} from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

interface Signal {
  id: string;
  pair: string;
  base: string;
  quote: string;
  action: "BUY" | "SELL" | "HOLD";
  entryPrice: number;
  confidence: number;
  change24h: number;
  stopLoss?: number;
  takeProfit?: number;
  timeframe?: string;
  summary?: string;
  strength?: number;
  market?: "forex" | "commodities";
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

type MarketType = "forex" | "commodities";

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

const CURRENCY_DESCRIPTIONS: Record<string, string> = {
  "EUR/USD": "La coppia valutaria pi\u00f9 scambiata al mondo. Rappresenta il tasso di cambio tra Euro e Dollaro americano.",
  "GBP/USD": "Conosciuta come 'Cable'. Riflette la forza relativa dell'economia britannica rispetto a quella americana.",
  "USD/JPY": "Indicatore chiave del sentiment di rischio globale. Lo Yen \u00e8 considerato un bene rifugio.",
  "USD/CHF": "Il Franco Svizzero \u00e8 storicamente una valuta rifugio. Questa coppia \u00e8 sensibile alla geopolitica europea.",
  "AUD/USD": "Legata alle materie prime e al commercio con la Cina. Sensibile ai dati economici asiatici.",
  "NZD/USD": "Influenzata dal settore lattiero-caseario neozelandese e dal sentiment risk-on/risk-off.",
  "EUR/GBP": "Riflette la dinamica economica tra Eurozona e Regno Unito, influenzata dalla Brexit.",
  "EUR/JPY": "Cross importante che combina la sensibilit\u00e0 all'economia europea e al rischio globale.",
  "GBP/JPY": "Conosciuta come 'The Dragon', \u00e8 una delle coppie pi\u00f9 volatili nel forex.",
  "USD/CAD": "Fortemente influenzata dal prezzo del petrolio. Il Canada \u00e8 uno dei maggiori esportatori di greggio.",
  "XAU/USD": "L'oro \u00e8 il bene rifugio per eccellenza. Il suo prezzo sale in periodi di incertezza e inflazione.",
  "XAG/USD": "L'argento ha sia uso industriale che come riserva di valore. Pi\u00f9 volatile dell'oro.",
  "WTI/USD": "Il petrolio West Texas Intermediate \u00e8 il benchmark per il greggio nordamericano.",
  "BRENT/USD": "Il Brent \u00e8 il benchmark internazionale per il petrolio, usato per determinare i prezzi globali.",
  "NG/USD": "Il gas naturale \u00e8 molto volatile, influenzato da clima, stoccaggi e domanda energetica.",
  "XCU/USD": "Il rame \u00e8 un indicatore della salute economica globale. Noto come 'Dr. Copper'.",
  "XPT/USD": "Il platino ha forti applicazioni industriali, specialmente nel settore automobilistico.",
};

function PairChart({
  data,
  high,
  low,
  open,
  currentPrice,
  isUp,
}: {
  data: number[];
  high: number;
  low: number;
  open: number;
  currentPrice: number;
  isUp: boolean;
}) {
  const { colors: C } = useTheme();
  const chartWidth = 340;
  const chartHeight = 200;
  const paddingLeft = 70;
  const paddingRight = 12;
  const paddingTop = 14;
  const paddingBottom = 14;
  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const lineColor = isUp ? C.buy : C.sell;

  const [touchIndex, setTouchIndex] = useState<number | null>(null);
  const chartRef = useRef<View>(null);

  const values = React.useMemo(() => {
    if (data && data.length >= 2) return data;
    const base = currentPrice;
    const spread = (high - low) || base * 0.005;
    const pts: number[] = [];
    let val = open || base - spread * 0.3;
    for (let i = 0; i < 30; i++) {
      val += (Math.random() - 0.48) * spread * 0.08;
      val = Math.max(low, Math.min(high, val));
      pts.push(val);
    }
    pts[pts.length - 1] = currentPrice;
    return pts;
  }, [data, high, low, open, currentPrice]);

  const allPrices = [high, low, open, currentPrice, ...values];
  const dataMin = Math.min(...allPrices);
  const dataMax = Math.max(...allPrices);
  const priceRange = dataMax - dataMin || 1;
  const rangeMin = dataMin - priceRange * 0.08;
  const rangeMax = dataMax + priceRange * 0.08;
  const totalRange = rangeMax - rangeMin;

  const toY = (price: number) => paddingTop + (1 - (price - rangeMin) / totalRange) * plotHeight;
  const toX = (i: number) => paddingLeft + (i / (values.length - 1)) * plotWidth;

  const getIndexFromX = useCallback(
    (pageX: number, layoutX: number) => {
      const x = pageX - layoutX - paddingLeft;
      const idx = Math.round((x / plotWidth) * (values.length - 1));
      return Math.max(0, Math.min(values.length - 1, idx));
    },
    [values.length, plotWidth, paddingLeft]
  );

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
      onPanResponderRelease: () => setTouchIndex(null),
      onPanResponderTerminate: () => setTouchIndex(null),
    })
  ).current;

  const pointsStr = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");

  const formatPrice = (p: number) => {
    if (p >= 100) return p.toFixed(2);
    if (p >= 10) return p.toFixed(3);
    return p.toFixed(5);
  };

  const openY = toY(open);
  const highY = toY(high);
  const lowY = toY(low);
  const currentY = toY(currentPrice);

  const areaPoints = `${toX(0)},${toY(values[0])} ${pointsStr} ${toX(values.length - 1)},${paddingTop + plotHeight} ${toX(0)},${paddingTop + plotHeight}`;

  const touchVal = touchIndex !== null ? values[touchIndex] : undefined;
  const crosshairX = touchIndex !== null ? toX(touchIndex) : 0;
  const crosshairY = touchVal != null ? toY(touchVal) : 0;
  const labelWidth = 78;
  const labelX = touchIndex !== null ? Math.max(2, Math.min(chartWidth - labelWidth - 2, crosshairX - labelWidth / 2)) : 0;
  const labelAbove = crosshairY > paddingTop + 24;
  const labelY = labelAbove ? crosshairY - 26 : crosshairY + 10;

  return (
    <View style={{ alignItems: "center" }} ref={chartRef} {...panResponder.panHandlers}>
      <Svg width={chartWidth} height={chartHeight}>
        <Defs>
          <SvgLinearGradient id="pairAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.18" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        <Polygon points={areaPoints} fill="url(#pairAreaGrad)" />

        <Line x1={paddingLeft} y1={highY} x2={chartWidth - paddingRight} y2={highY} stroke={C.buy} strokeWidth="1" strokeDasharray="4,3" opacity={0.5} />
        <Line x1={paddingLeft} y1={lowY} x2={chartWidth - paddingRight} y2={lowY} stroke={C.sell} strokeWidth="1" strokeDasharray="4,3" opacity={0.5} />
        <Line x1={paddingLeft} y1={openY} x2={chartWidth - paddingRight} y2={openY} stroke={C.textMuted} strokeWidth="1" strokeDasharray="4,3" opacity={0.4} />

        <Rect x={2} y={highY - 9} width={64} height={18} rx={4} fill={C.buy + "25"} />
        <SvgText x={6} y={highY + 4} fontSize="9" fontWeight="600" fill={C.buy}>
          {"H " + formatPrice(high)}
        </SvgText>

        <Rect x={2} y={lowY - 9} width={64} height={18} rx={4} fill={C.sell + "25"} />
        <SvgText x={6} y={lowY + 4} fontSize="9" fontWeight="600" fill={C.sell}>
          {"L " + formatPrice(low)}
        </SvgText>

        <Rect x={2} y={openY - 9} width={64} height={18} rx={4} fill={C.textMuted + "25"} />
        <SvgText x={6} y={openY + 4} fontSize="9" fontWeight="600" fill={C.textMuted}>
          {"O " + formatPrice(open)}
        </SvgText>

        <Polyline points={pointsStr} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        <Circle cx={toX(values.length - 1)} cy={currentY} r={4} fill={lineColor} stroke={C.backgroundCard} strokeWidth="2" />

        {touchIndex !== null && touchVal != null && (
          <>
            <Line x1={crosshairX} y1={paddingTop} x2={crosshairX} y2={paddingTop + plotHeight} stroke={C.text} strokeWidth="1" strokeDasharray="3,2" opacity={0.6} />
            <Circle cx={crosshairX} cy={crosshairY} r={4} fill={lineColor} stroke={C.text} strokeWidth="1.5" opacity={0.9} />
            <Rect x={labelX} y={labelY} width={labelWidth} height={20} rx={6} fill={C.backgroundCard} stroke={C.border} strokeWidth="1" opacity={0.95} />
            <SvgText x={labelX + labelWidth / 2} y={labelY + 14} fontSize="11" fontWeight="700" fill={C.text} textAnchor="middle">
              {formatPrice(touchVal)}
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

export default function PairDetailScreen() {
  const { colors: C } = useTheme();
  const params = useLocalSearchParams<{ pair: string; data: string }>();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const pairName = params.pair || "";

  let passedSignal: Signal | null = null;
  let passedQuote: TVQuote | null = null;
  let passedMarket: MarketType = "forex";
  try {
    if (params.data) {
      const parsed = JSON.parse(params.data as string);
      passedSignal = parsed.signal || null;
      passedQuote = parsed.quote || null;
      passedMarket = parsed.market || "forex";
    }
  } catch {}

  const signal = passedSignal;
  const market = passedMarket;

  const pairKey = signal ? `${signal.base}-${signal.quote}` : "";
  const { data: ratesResponse } = useQuery<{ pair: string; rates: number[] }>({
    queryKey: ["/api/rates", pairKey],
    enabled: !!signal,
    staleTime: 300000,
  });

  const { data: tvQuotes = [] } = useQuery<TVQuote[]>({
    queryKey: [`/api/quotes?market=${market}`],
    refetchInterval: 5000,
  });

  const liveQuote = React.useMemo(() => {
    const fromApi = tvQuotes.find((q) => q.pair === pairName);
    return fromApi || passedQuote;
  }, [tvQuotes, pairName, passedQuote]);

  const { data: signals = [] } = useQuery<any[]>({
    queryKey: [market === "forex" ? "/api/signals" : "/api/commodities/signals"],
  });

  const relatedSignal = React.useMemo(() => {
    return signals.find((s: any) => s.pair === pairName);
  }, [signals, pairName]);

  if (!signal && !liveQuote) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
        <Text style={[styles.errorText, { color: C.textSecondary }]}>Coppia non trovata</Text>
      </View>
    );
  }

  const price = liveQuote?.price ?? signal?.entryPrice ?? 0;
  const change = liveQuote?.change ?? signal?.change24h ?? 0;
  const changeAbs = liveQuote?.changeAbs ?? 0;
  const high = liveQuote?.high ?? price * 1.002;
  const low = liveQuote?.low ?? price * 0.998;
  const open = liveQuote?.open ?? price;
  const isUp = change >= 0;
  const changeColor = isUp ? C.buy : C.sell;

  const displayName = market === "commodities"
    ? COMMODITY_NAMES[pairName] || pairName
    : FOREX_NAMES[pairName] || pairName;

  const description = CURRENCY_DESCRIPTIONS[pairName] || "";

  const priceDecimals = price > 100 ? 2 : price > 10 ? 2 : price > 1 ? 4 : 5;

  const formatPrice = (p: number) => {
    if (p >= 100) return p.toFixed(2);
    if (p >= 10) return p.toFixed(3);
    return p.toFixed(5);
  };

  const spread = high - low;
  const spreadPct = open > 0 ? ((spread / open) * 100).toFixed(3) : "0.000";

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 30 }} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[isUp ? "rgba(0,200,150,0.10)" : "rgba(255,77,106,0.10)", C.background]}
          style={styles.heroSection}
        >
          <Animated.View entering={FadeInDown.springify()} style={styles.heroContent}>
            <View style={styles.pairRow}>
              <View>
                <Text style={[styles.pairText, { color: C.text }]}>{pairName}</Text>
                <Text style={[styles.pairSubtext, { color: C.textSecondary }]}>{displayName}</Text>
              </View>
              <View style={[styles.changeBadge, { backgroundColor: changeColor + "15" }]}>
                <Ionicons name={isUp ? "arrow-up" : "arrow-down"} size={14} color={changeColor} />
                <Text style={[styles.changeBadgeText, { color: changeColor }]}>
                  {isUp ? "+" : ""}{change.toFixed(2)}%
                </Text>
              </View>
            </View>

            <View style={styles.priceRow}>
              <Text style={[styles.currentPrice, { color: C.text }]}>
                {price.toFixed(priceDecimals)}
              </Text>
              {changeAbs !== 0 && (
                <Text style={[styles.priceAbsChange, { color: changeColor }]}>
                  {isUp ? "+" : ""}{changeAbs.toFixed(priceDecimals)}
                </Text>
              )}
            </View>

            <View style={styles.chartContainer}>
              <PairChart
                data={ratesResponse?.rates || []}
                high={high}
                low={low}
                open={open}
                currentPrice={price}
                isUp={isUp}
              />
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={styles.content}>
          <SectionCard title="DATI DI GIORNATA" entering={FadeInDown.delay(80).springify()}>
            <View style={styles.hlocGrid}>
              <View style={[styles.hlocItem, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
                <Text style={[styles.hlocLabel, { color: C.textMuted }]}>Apertura</Text>
                <Text style={[styles.hlocValue, { color: C.text }]}>{formatPrice(open)}</Text>
              </View>
              <View style={[styles.hlocItem, { backgroundColor: C.buyBg, borderColor: C.buyBorder }]}>
                <Text style={[styles.hlocLabel, { color: C.buy }]}>Massimo</Text>
                <Text style={[styles.hlocValue, { color: C.buy }]}>{formatPrice(high)}</Text>
              </View>
              <View style={[styles.hlocItem, { backgroundColor: C.sellBg, borderColor: C.sellBorder }]}>
                <Text style={[styles.hlocLabel, { color: C.sell }]}>Minimo</Text>
                <Text style={[styles.hlocValue, { color: C.sell }]}>{formatPrice(low)}</Text>
              </View>
              <View style={[styles.hlocItem, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
                <Text style={[styles.hlocLabel, { color: C.textMuted }]}>Attuale</Text>
                <Text style={[styles.hlocValue, { color: changeColor }]}>{formatPrice(price)}</Text>
              </View>
            </View>
          </SectionCard>

          <SectionCard title="STATISTICHE" entering={FadeInDown.delay(140).springify()}>
            <InfoRow label="Variazione 24h" value={`${isUp ? "+" : ""}${change.toFixed(2)}%`} valueColor={changeColor} />
            <InfoRow label="Range giornaliero" value={`${formatPrice(low)} - ${formatPrice(high)}`} />
            <InfoRow label="Spread" value={`${formatPrice(spread)} (${spreadPct}%)`} />
            {signal?.confidence != null && (
              <InfoRow label="Confidenza AI" value={`${signal.confidence}%`} valueColor={C.accent} />
            )}
          </SectionCard>

          {description.length > 0 && (
            <SectionCard title="INFORMAZIONI" entering={FadeInDown.delay(200).springify()}>
              <Text style={[styles.descriptionText, { color: C.textSecondary }]}>{description}</Text>
            </SectionCard>
          )}

          {relatedSignal && (
            <Animated.View entering={FadeInDown.delay(260).springify()}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push({
                    pathname: "/signal/[id]",
                    params: {
                      id: relatedSignal.id,
                      data: JSON.stringify(relatedSignal),
                    },
                  });
                }}
                style={[styles.signalLink, { backgroundColor: C.accent }]}
              >
                <Ionicons name="pulse-outline" size={18} color={C.background} />
                <Text style={[styles.signalLinkText, { color: C.background }]}>
                  Vedi segnale {relatedSignal.action} per {pairName}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={C.background} />
              </Pressable>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(320).springify()} style={[styles.disclaimerBox, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={C.textMuted} />
            <Text style={[styles.disclaimerText, { color: C.textMuted }]}>
              Dati forniti da TradingView. Le quotazioni possono avere un ritardo. Il trading comporta rischi significativi.
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroSection: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  heroContent: { gap: 12 },
  pairRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  pairText: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  pairSubtext: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  changeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  changeBadgeText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  currentPrice: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  priceAbsChange: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  chartContainer: { alignItems: "center", paddingVertical: 8 },
  content: { paddingHorizontal: 16, gap: 12 },
  sectionCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 4 },
  hlocGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  hlocItem: { width: "47%" as any, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: "center", gap: 4, flexGrow: 1 },
  hlocLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  hlocValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)" },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  descriptionText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  signalLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  signalLinkText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  disclaimerBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  disclaimerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  errorText: { fontSize: 16, fontFamily: "Inter_400Regular", marginTop: 12 },
});
