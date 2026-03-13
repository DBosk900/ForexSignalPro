import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

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

interface Signal {
  id: string;
  pair: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  timestamp: string;
}

function useImpactConfig() {
  const { colors: C } = useTheme();
  return {
    HIGH: { color: C.sell, bg: C.sellBg, border: C.sellBorder, label: "ALTO", icon: "warning" as const, description: "Impatto significativo sui mercati" },
    MEDIUM: { color: C.hold, bg: C.holdBg, border: C.holdBorder, label: "MEDIO", icon: "alert-circle" as const, description: "Impatto moderato sui mercati" },
    LOW: { color: C.textSecondary, bg: C.backgroundElevated, border: C.border, label: "BASSO", icon: "information-circle" as const, description: "Impatto limitato sui mercati" },
  };
}

const CURRENCY_INFO: Record<string, { name: string; flag: string }> = {
  USD: { name: "Dollaro USA", flag: "logo-usd" },
  EUR: { name: "Euro", flag: "cash-outline" },
  GBP: { name: "Sterlina", flag: "cash-outline" },
  JPY: { name: "Yen Giapponese", flag: "cash-outline" },
  CHF: { name: "Franco Svizzero", flag: "cash-outline" },
  AUD: { name: "Dollaro Australiano", flag: "cash-outline" },
  CAD: { name: "Dollaro Canadese", flag: "cash-outline" },
  NZD: { name: "Dollaro Neozelandese", flag: "cash-outline" },
  XAU: { name: "Oro", flag: "diamond-outline" },
  XAG: { name: "Argento", flag: "diamond-outline" },
  OIL: { name: "Petrolio", flag: "flame-outline" },
  XAUUSD: { name: "Oro/Dollaro", flag: "diamond-outline" },
  XAGUSD: { name: "Argento/Dollaro", flag: "diamond-outline" },
};

export default function NewsDetailScreen() {
  const { colors: C } = useTheme();
  const { data: rawData } = useLocalSearchParams<{ id: string; data: string }>();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const impactConfig = useImpactConfig();

  let newsItem: NewsItem | null = null;
  try {
    if (rawData) newsItem = JSON.parse(rawData as string);
  } catch {}

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
    staleTime: 60000,
  });

  if (!newsItem) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="alert-circle-outline" size={48} color={C.textMuted} />
        <Text style={[styles.errorText, { color: C.textSecondary }]}>Notizia non trovata</Text>
      </View>
    );
  }

  const impact = impactConfig[newsItem.impact];

  const relatedSignals = signals.filter((s) => {
    return newsItem!.currencies.some(
      (c) => s.pair.includes(c)
    );
  });

  const formatFullDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("it-IT", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (h > 23) return `${Math.floor(h / 24)}g fa`;
    if (h > 0) return `${h}h fa`;
    return `${m}m fa`;
  };

  const getImpactAnalysis = (impact: "HIGH" | "MEDIUM" | "LOW", currencies: string[]) => {
    const currencyList = currencies.join(", ");
    switch (impact) {
      case "HIGH":
        return `Questa notizia potrebbe causare movimenti significativi sulle coppie che includono ${currencyList}. Si consiglia cautela nelle operazioni aperte e di monitorare attentamente i livelli di supporto e resistenza.`;
      case "MEDIUM":
        return `Impatto moderato previsto sulle valute ${currencyList}. Possibili oscillazioni di breve termine. Verificare i segnali attivi prima di aprire nuove posizioni.`;
      case "LOW":
        return `Impatto limitato previsto su ${currencyList}. La notizia potrebbe contribuire al sentiment generale del mercato senza causare movimenti immediati significativi.`;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset + 30 }} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[
            newsItem.impact === "HIGH"
              ? "rgba(255,77,106,0.12)"
              : newsItem.impact === "MEDIUM"
              ? "rgba(255,179,71,0.12)"
              : "rgba(138,153,187,0.08)",
            C.background,
          ]}
          style={styles.heroSection}
        >
          <Animated.View entering={FadeInDown.springify()} style={styles.heroContent}>
            <View style={styles.topMeta}>
              <View style={[styles.impactBadgeLarge, { backgroundColor: impact.bg, borderColor: impact.border }]}>
                <Ionicons name={impact.icon} size={14} color={impact.color} />
                <Text style={[styles.impactBadgeText, { color: impact.color }]}>
                  IMPATTO {impact.label}
                </Text>
              </View>
              <Text style={[styles.timeAgoText, { color: C.textMuted }]}>{timeAgo(newsItem.timestamp)}</Text>
            </View>

            <Text style={[styles.heroTitle, { color: C.text }]}>{newsItem.title}</Text>

            <View style={styles.sourceRow}>
              <Ionicons name="newspaper-outline" size={14} color={C.textSecondary} />
              <Text style={[styles.sourceText, { color: C.textSecondary }]}>{newsItem.source}</Text>
              <View style={[styles.dot, { backgroundColor: C.textMuted }]} />
              <Ionicons name="time-outline" size={13} color={C.textMuted} />
              <Text style={[styles.dateText, { color: C.textMuted }]}>{formatFullDate(newsItem.timestamp)}</Text>
            </View>
          </Animated.View>
        </LinearGradient>

        <View style={styles.content}>
          <Animated.View
            entering={FadeInDown.delay(80).springify()}
            style={[styles.sectionCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
          >
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>SOMMARIO</Text>
            <Text style={[styles.summaryText, { color: C.text }]}>{newsItem.summary}</Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(140).springify()}
            style={[styles.sectionCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
          >
            <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>VALUTE INTERESSATE</Text>
            <View style={styles.currenciesList}>
              {newsItem.currencies.map((currency) => {
                const info = CURRENCY_INFO[currency];
                return (
                  <View
                    key={currency}
                    style={[styles.currencyItem, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}
                  >
                    <View style={[styles.currencyIconCircle, { backgroundColor: C.accent + "15" }]}>
                      <Ionicons
                        name={(info?.flag as any) || "cash-outline"}
                        size={18}
                        color={C.accent}
                      />
                    </View>
                    <View style={styles.currencyInfo}>
                      <Text style={[styles.currencyCode, { color: C.text }]}>{currency}</Text>
                      <Text style={[styles.currencyName, { color: C.textMuted }]}>
                        {info?.name || currency}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={[styles.sectionCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
          >
            <View style={styles.impactAnalysisHeader}>
              <Ionicons name={impact.icon} size={18} color={impact.color} />
              <Text style={[styles.sectionTitle, { color: C.textSecondary, marginBottom: 0 }]}>
                POSSIBILE IMPATTO
              </Text>
            </View>
            <View style={[styles.impactAnalysisBox, { backgroundColor: impact.bg, borderColor: impact.border }]}>
              <Text style={[styles.impactAnalysisText, { color: C.text }]}>
                {getImpactAnalysis(newsItem.impact, newsItem.currencies)}
              </Text>
            </View>
            <Text style={[styles.impactDescription, { color: C.textSecondary }]}>
              {impact.description}
            </Text>
          </Animated.View>

          {relatedSignals.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(260).springify()}
              style={[styles.sectionCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
            >
              <Text style={[styles.sectionTitle, { color: C.textSecondary }]}>SEGNALI CORRELATI</Text>
              {relatedSignals.map((signal) => {
                const actionColor =
                  signal.action === "BUY" ? C.buy : signal.action === "SELL" ? C.sell : C.hold;
                const actionBg =
                  signal.action === "BUY" ? C.buyBg : signal.action === "SELL" ? C.sellBg : C.holdBg;
                const actionBorder =
                  signal.action === "BUY"
                    ? C.buyBorder
                    : signal.action === "SELL"
                    ? C.sellBorder
                    : C.holdBorder;
                return (
                  <Pressable
                    key={signal.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: "/signal/[id]",
                        params: { id: signal.id, data: JSON.stringify(signal) },
                      });
                    }}
                    style={[styles.signalItem, { backgroundColor: C.backgroundElevated, borderColor: C.border }]}
                  >
                    <View style={styles.signalItemLeft}>
                      <Text style={[styles.signalPair, { color: C.text }]}>{signal.pair}</Text>
                      <Text style={[styles.signalConfidence, { color: C.textMuted }]}>
                        Confidenza: {signal.confidence}%
                      </Text>
                    </View>
                    <View style={[styles.signalActionBadge, { backgroundColor: actionBg, borderColor: actionBorder }]}>
                      <Text style={[styles.signalActionText, { color: actionColor }]}>{signal.action}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                  </Pressable>
                );
              })}
            </Animated.View>
          )}

          {newsItem.url && (
            <Animated.View entering={FadeInDown.delay(320).springify()}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (newsItem?.url) Linking.openURL(newsItem.url);
                }}
                style={[styles.externalLink, { backgroundColor: C.accent + "12", borderColor: C.accent + "30" }]}
              >
                <Ionicons name="open-outline" size={18} color={C.accent} />
                <Text style={[styles.externalLinkText, { color: C.accent }]}>Leggi articolo completo</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginTop: 12,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  heroContent: {},
  topMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  impactBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  impactBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  timeAgoText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  sourceText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  dateText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  content: {
    paddingHorizontal: 16,
    gap: 12,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
  },
  currenciesList: {
    gap: 8,
  },
  currencyItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  currencyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyInfo: {
    flex: 1,
  },
  currencyCode: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  currencyName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  impactAnalysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  impactAnalysisBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  impactAnalysisText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  impactDescription: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  signalItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  signalItemLeft: {
    flex: 1,
  },
  signalPair: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  signalConfidence: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  signalActionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  signalActionText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  externalLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  externalLinkText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
