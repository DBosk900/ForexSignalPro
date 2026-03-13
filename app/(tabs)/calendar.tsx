import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
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
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { getApiUrl } from "@/lib/query-client";
import { CalendarSkeleton } from "@/components/SkeletonLoader";

interface SignalAtRisk {
  pair: string;
  action: string;
  confidence: number;
  strength: number;
}

interface CalendarEvent {
  id: string;
  date: string;
  time: string;
  event: string;
  country: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  currencies: string[];
  forecast?: string;
  previous?: string;
  actual?: string;
  riskWarning: string;
  affectedPairs: string[];
  signalsAtRisk?: SignalAtRisk[];
}

function useCalendarImpactConfig() {
  const { colors: C } = useTheme();
  return {
    HIGH: { color: C.sell, bg: C.sellBg, border: C.sellBorder, label: "ALTO", icon: "warning" as const },
    MEDIUM: { color: C.hold, bg: C.holdBg, border: C.holdBorder, label: "MEDIO", icon: "alert-circle" as const },
    LOW: { color: C.textSecondary, bg: C.backgroundElevated, border: C.border, label: "BASSO", icon: "information-circle" as const },
  };
}

const COUNTRY_FLAGS: Record<string, string> = {
  USA: "US", EUR: "EU", GBP: "GB", JPY: "JP", CHF: "CH",
  AUD: "AU", CAD: "CA", NZD: "NZ", CNY: "CN",
};

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const eventDate = new Date(d);
  eventDate.setHours(0, 0, 0, 0);

  if (eventDate.getTime() === today.getTime()) {
    return "Oggi";
  }
  if (eventDate.getTime() === tomorrow.getTime()) {
    return "Domani";
  }
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

function EventCard({ item, index }: { item: CalendarEvent; index: number }) {
  const { colors: themeColors } = useTheme();
  const IMPACT_CONFIG = useCalendarImpactConfig();
  const impact = IMPACT_CONFIG[item.impact];
  const [expanded, setExpanded] = useState(false);
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isToday = () => {
    const today = new Date().toISOString().split("T")[0];
    return item.date === today;
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()} style={animStyle}>
      <Pressable
        onPress={() => {
          setExpanded(!expanded);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        onPressIn={() => { scale.value = withSpring(0.98); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        style={[
          styles.card,
          {
            backgroundColor: themeColors.backgroundCard,
            borderColor: item.impact === "HIGH" && isToday() ? themeColors.sellBorder : themeColors.border,
            borderLeftWidth: 3,
            borderLeftColor: impact.color,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.timeColumn}>
            <View style={[styles.timeBadge, { backgroundColor: themeColors.backgroundElevated }]}>
              <Ionicons name="time-outline" size={11} color={themeColors.textSecondary} />
              <Text style={[styles.timeText, { color: themeColors.text }]}>{item.time}</Text>
            </View>
            <Text style={[styles.countryText, { color: themeColors.textMuted }]}>{item.country}</Text>
          </View>

          <View style={styles.eventContent}>
            <Text style={[styles.eventTitle, { color: themeColors.text }]} numberOfLines={2}>
              {item.event}
            </Text>
            <View style={styles.currencyTags}>
              {item.currencies.map((c) => (
                <View key={c} style={[styles.currencyTag, { backgroundColor: themeColors.backgroundElevated }]}>
                  <Text style={[styles.currencyTagText, { color: themeColors.accent }]}>{c}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.impactColumn}>
            <View style={[styles.impactBadge, { backgroundColor: impact.bg, borderColor: impact.border }]}>
              <Ionicons name={impact.icon} size={12} color={impact.color} />
              <Text style={[styles.impactLabel, { color: impact.color }]}>{impact.label}</Text>
            </View>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={themeColors.textMuted}
            />
          </View>
        </View>

        {(item.forecast || item.previous || item.actual) && (
          <View style={styles.forecastRow}>
            {item.forecast && (
              <View style={styles.forecastItem}>
                <Text style={[styles.forecastLabel, { color: themeColors.textMuted }]}>Previsione</Text>
                <Text style={[styles.forecastValue, { color: themeColors.accent }]}>{item.forecast}</Text>
              </View>
            )}
            {item.previous && (
              <View style={styles.forecastItem}>
                <Text style={[styles.forecastLabel, { color: themeColors.textMuted }]}>Precedente</Text>
                <Text style={[styles.forecastValue, { color: themeColors.textSecondary }]}>{item.previous}</Text>
              </View>
            )}
            {item.actual && (
              <View style={styles.forecastItem}>
                <Text style={[styles.forecastLabel, { color: themeColors.textMuted }]}>Effettivo</Text>
                <Text style={[styles.forecastValue, { color: themeColors.buy }]}>{item.actual}</Text>
              </View>
            )}
          </View>
        )}

        {expanded && (
          <View style={styles.expandedContent}>
            {item.riskWarning.length > 0 && (
              <View style={[styles.warningBox, { backgroundColor: themeColors.sellBg, borderColor: themeColors.sellBorder }]}>
                <Ionicons name="shield-outline" size={14} color={themeColors.sell} />
                <Text style={[styles.warningText, { color: themeColors.sell }]}>
                  {item.riskWarning}
                </Text>
              </View>
            )}

            {item.signalsAtRisk && item.signalsAtRisk.length > 0 && (
              <View style={styles.affectedSection}>
                <Text style={[styles.affectedTitle, { color: themeColors.sell }]}>
                  {item.signalsAtRisk.length} segnali attivi a rischio:
                </Text>
                <View style={styles.affectedPairs}>
                  {item.signalsAtRisk.map((s) => {
                    const sColor = s.action === "BUY" ? themeColors.buy : s.action === "SELL" ? themeColors.sell : themeColors.hold;
                    return (
                      <View key={s.pair} style={[styles.pairChip, { backgroundColor: sColor + "15", borderColor: sColor + "30" }]}>
                        <Ionicons name={s.action === "BUY" ? "arrow-up" : s.action === "SELL" ? "arrow-down" : "remove"} size={10} color={sColor} />
                        <Text style={[styles.pairChipText, { color: sColor }]}>{s.pair}</Text>
                        <Text style={[styles.pairChipText, { color: themeColors.textMuted, fontSize: 9 }]}>{s.confidence}%</Text>
                      </View>
                    );
                  })}
                </View>
                <View style={[styles.closeTip, { backgroundColor: themeColors.sellBg, borderColor: themeColors.sellBorder }]}>
                  <Ionicons name="hand-left-outline" size={12} color={themeColors.sell} />
                  <Text style={[styles.closeTipText, { color: themeColors.sell }]}>
                    Consigliamo di chiudere queste posizioni prima dell'evento
                  </Text>
                </View>
              </View>
            )}

            {item.affectedPairs.length > 0 && (!item.signalsAtRisk || item.signalsAtRisk.length === 0) && (
              <View style={styles.affectedSection}>
                <Text style={[styles.affectedTitle, { color: themeColors.textMuted }]}>Coppie interessate:</Text>
                <View style={styles.affectedPairs}>
                  {item.affectedPairs.map((pair) => (
                    <View key={pair} style={[styles.pairChip, { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border }]}>
                      <Ionicons name="alert-circle" size={10} color={themeColors.hold} />
                      <Text style={[styles.pairChipText, { color: themeColors.text }]}>{pair}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function CalendarScreen() {
  const { colors: themeColors } = useTheme();
  const IMPACT_CONFIG = useCalendarImpactConfig();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;
  const [selectedImpact, setSelectedImpact] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { favorites } = useFavorites();

  const { data: calendar = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar", "signals=true"],
    queryFn: async () => {
      const url = new URL("/api/calendar?signals=true", getApiUrl());
      const res = await fetch(url.toString());
      return res.json();
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
    setIsRefreshing(false);
  }, [queryClient]);

  const preFiltered = onlyFavorites && favorites.length > 0
    ? calendar.filter(e => e.currencies.some(c => favorites.some(f => f.includes(c))))
    : calendar;

  const filteredEvents = selectedImpact === "ALL"
    ? preFiltered
    : preFiltered.filter((e) => e.impact === selectedImpact);

  const totalSignalsAtRisk = calendar.reduce(
    (sum, e) => sum + (e.signalsAtRisk?.length ?? 0), 0
  );

  const sections = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((e) => {
      if (!grouped[e.date]) grouped[e.date] = [];
      grouped[e.date].push(e);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        title: formatDateHeader(date),
        date,
        data: data.sort((a, b) => a.time.localeCompare(b.time)),
      }));
  }, [filteredEvents]);

  const highCount = calendar.filter((e) => e.impact === "HIGH").length;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={styles.headerTitle}>Calendario Economico</Text>
        <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
          Prossimi 7 giorni
          {highCount > 0 && (
            <Text style={{ color: themeColors.sell }}> - {highCount} eventi ad alto impatto</Text>
          )}
          {totalSignalsAtRisk > 0 && (
            <Text style={{ color: themeColors.sell }}>{"\n"}{totalSignalsAtRisk} segnali attivi a rischio</Text>
          )}
        </Text>

        <View style={styles.filterRow}>
          {favorites.length > 0 && (
            <Pressable
              onPress={() => { setOnlyFavorites(!onlyFavorites); Haptics.selectionAsync(); }}
              style={[
                styles.filterBtn,
                {
                  backgroundColor: onlyFavorites ? themeColors.holdBg : "transparent",
                  borderColor: onlyFavorites ? themeColors.holdBorder : "transparent",
                },
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name={onlyFavorites ? "star" : "star-outline"} size={10} color={onlyFavorites ? themeColors.hold : themeColors.textSecondary} />
                <Text style={[styles.filterText, { color: onlyFavorites ? themeColors.hold : themeColors.textSecondary, fontFamily: onlyFavorites ? "Inter_600SemiBold" : "Inter_400Regular" }]}>
                  Pref.
                </Text>
              </View>
            </Pressable>
          )}
          {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((f) => {
            const isActive = selectedImpact === f;
            const config = f !== "ALL" ? IMPACT_CONFIG[f] : null;
            return (
              <Pressable
                key={f}
                onPress={() => { setSelectedImpact(f); Haptics.selectionAsync(); }}
                style={[
                  styles.filterBtn,
                  {
                    backgroundColor: isActive
                      ? config ? config.bg : themeColors.backgroundElevated
                      : "transparent",
                    borderColor: isActive
                      ? config ? config.border : themeColors.border
                      : "transparent",
                  },
                ]}
              >
                <Text style={[
                  styles.filterText,
                  {
                    color: isActive
                      ? config ? config.color : themeColors.accent
                      : themeColors.textSecondary,
                    fontFamily: isActive ? "Inter_600SemiBold" : "Inter_400Regular",
                  },
                ]}>
                  {f === "ALL" ? "Tutti" : config?.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading ? (
        <View style={{ paddingTop: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => <CalendarSkeleton key={i} />)}
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={56} color={themeColors.textMuted} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Nessun evento</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
            {calendar.length === 0
              ? "Il calendario si carica automaticamente con i segnali"
              : "Nessun evento con il filtro selezionato"}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => <EventCard item={item} index={index} />}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: themeColors.background }]}>
              <View style={[styles.sectionDot, { backgroundColor: themeColors.accent }]} />
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{section.title}</Text>
              <Text style={[styles.sectionCount, { color: themeColors.textMuted }]}>{section.data.length} eventi</Text>
            </View>
          )}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={themeColors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={true}
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
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
  },
  list: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    flex: 1,
    textTransform: "capitalize" as const,
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: "row",
    gap: 12,
  },
  timeColumn: {
    alignItems: "center",
    gap: 4,
    minWidth: 52,
  },
  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  countryText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  eventContent: {
    flex: 1,
    gap: 6,
  },
  eventTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
  },
  currencyTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  currencyTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currencyTagText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  impactColumn: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  impactBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  impactLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  forecastRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingLeft: 64,
  },
  forecastItem: {
    gap: 2,
  },
  forecastLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  forecastValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  expandedContent: {
    marginTop: 12,
    gap: 10,
    paddingLeft: 64,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  affectedSection: {
    gap: 6,
  },
  affectedTitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  affectedPairs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pairChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  pairChipText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  closeTip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  closeTipText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    lineHeight: 16,
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
});
