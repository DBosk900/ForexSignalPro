import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  Pressable,
  Platform,
  Modal,
  TextInput,
  FlatList,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useFavorites } from "@/contexts/FavoritesContext";
import { apiRequest } from "@/lib/query-client";
import { AlertSkeleton } from "@/components/SkeletonLoader";

interface AlertItem {
  id: string;
  type: "signal" | "news" | "market" | "outcome";
  title: string;
  message: string;
  pair?: string;
  action?: "BUY" | "SELL" | "HOLD";
  timestamp: string;
  read: boolean;
}

interface PriceAlertItem {
  id: string;
  pair: string;
  targetPrice: number;
  direction: string;
  note: string | null;
  triggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

const ALL_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD",
  "EUR/GBP", "EUR/JPY", "GBP/JPY", "AUD/JPY", "EUR/AUD", "EUR/NZD", "EUR/CAD",
  "GBP/AUD", "GBP/NZD", "GBP/CAD", "AUD/NZD", "AUD/CAD", "NZD/CAD",
  "CHF/JPY", "CAD/JPY", "NZD/JPY",
  "XAU/USD", "XAG/USD", "WTI/USD", "BRENT/USD", "NG/USD", "XCU/USD", "XPT/USD",
];

function useAlertIcons() {
  const { colors: C } = useTheme();
  return {
    signal_BUY: { name: "arrow-up-circle", color: C.buy, bg: C.buyBg },
    signal_SELL: { name: "arrow-down-circle", color: C.sell, bg: C.sellBg },
    signal_HOLD: { name: "pause-circle", color: C.hold, bg: C.holdBg },
    news: { name: "newspaper", color: C.accent, bg: "rgba(0, 212, 170, 0.1)" },
    market: { name: "warning", color: C.sell, bg: C.sellBg },
    outcome: { name: "flag", color: "#FFB347", bg: "rgba(255, 179, 71, 0.1)" },
  };
}

function useSectionConfig() {
  const { colors: C } = useTheme();
  return {
    outcome: { title: "Risultati", icon: "flag", color: "#FFB347" },
    market: { title: "Calendario", icon: "calendar", color: C.sell },
    signal: { title: "Segnali", icon: "trending-up", color: C.accent },
    news: { title: "Notizie", icon: "newspaper", color: C.hold },
  };
}

function AlertCard({ item, index }: { item: AlertItem; index: number }) {
  const { colors: themeColors } = useTheme();
  const ALERT_ICONS = useAlertIcons();
  const { isFavorite } = useFavorites();
  const key = item.type === "signal" && item.action ? `signal_${item.action}` : item.type;
  const iconConfig = ALERT_ICONS[key] || ALERT_ICONS.market;
  const isPriority = item.pair ? isFavorite(item.pair) : false;

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (h > 23) return `${Math.floor(h / 24)}g fa`;
    if (h > 0) return `${h}h fa`;
    if (m > 0) return `${m}m fa`;
    return "Adesso";
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <View style={[
        styles.card,
        {
          backgroundColor: item.read ? themeColors.backgroundCard : themeColors.backgroundElevated,
          borderColor: isPriority && !item.read ? themeColors.holdBorder : item.read ? themeColors.border : themeColors.borderLight,
          borderLeftWidth: isPriority ? 3 : 1,
          borderLeftColor: isPriority ? themeColors.hold : undefined,
        },
      ]}>
        {!item.read && <View style={[styles.unreadDot, { backgroundColor: isPriority ? themeColors.hold : themeColors.accent }]} />}
        <View style={[styles.iconContainer, { backgroundColor: iconConfig.bg }]}>
          <Ionicons name={iconConfig.name as any} size={22} color={iconConfig.color} />
        </View>
        <View style={styles.content}>
          <View style={styles.cardHeader}>
            <Text style={[styles.titleText, { color: themeColors.text }]} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.timeText, { color: themeColors.textMuted }]}>{timeAgo(item.timestamp)}</Text>
          </View>
          <Text style={[styles.messageText, { color: themeColors.textSecondary }]} numberOfLines={2}>{item.message}</Text>
          <View style={styles.cardFooterRow}>
            {item.pair && (
              <View style={[styles.pairBadge, { backgroundColor: themeColors.backgroundElevated }]}>
                <Text style={[styles.pairText, { color: themeColors.accent }]}>{item.pair}</Text>
              </View>
            )}
            {isPriority && (
              <View style={[styles.pairBadge, { backgroundColor: themeColors.holdBg }]}>
                <Ionicons name="star" size={9} color={themeColors.hold} />
                <Text style={[styles.pairText, { color: themeColors.hold }]}>Preferita</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function PriceAlertCard({ item, onDelete }: { item: PriceAlertItem; onDelete: (id: string) => void }) {
  const { colors: C } = useTheme();
  const isAbove = item.direction === "above";

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (h > 23) return `${Math.floor(h / 24)}g fa`;
    if (h > 0) return `${h}h fa`;
    if (m > 0) return `${m}m fa`;
    return "Adesso";
  };

  return (
    <View style={[
      styles.card,
      {
        backgroundColor: item.triggered ? C.backgroundCard : C.backgroundElevated,
        borderColor: item.triggered ? C.buyBorder : C.borderLight,
      },
    ]}>
      <View style={[styles.iconContainer, { backgroundColor: isAbove ? C.buyBg : C.sellBg }]}>
        <Ionicons
          name={isAbove ? "arrow-up" : "arrow-down"}
          size={20}
          color={isAbove ? C.buy : C.sell}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.cardHeader}>
          <Text style={[styles.titleText, { color: C.text }]}>{item.pair}</Text>
          {item.triggered ? (
            <View style={[styles.pairBadge, { backgroundColor: C.buyBg }]}>
              <Ionicons name="checkmark-circle" size={10} color={C.buy} />
              <Text style={[styles.pairText, { color: C.buy }]}>Scattato</Text>
            </View>
          ) : (
            <View style={[styles.pairBadge, { backgroundColor: C.holdBg }]}>
              <Ionicons name="time" size={10} color={C.hold} />
              <Text style={[styles.pairText, { color: C.hold }]}>Attivo</Text>
            </View>
          )}
        </View>
        <Text style={[styles.messageText, { color: C.textSecondary }]}>
          {isAbove ? "Sopra" : "Sotto"} {item.targetPrice}
          {item.note ? ` - ${item.note}` : ""}
        </Text>
        <View style={styles.cardFooterRow}>
          <Text style={[styles.timeText, { color: C.textMuted }]}>
            {item.triggered && item.triggeredAt
              ? `Scattato ${timeAgo(item.triggeredAt)}`
              : `Creato ${timeAgo(item.createdAt)}`}
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDelete(item.id);
            }}
            hitSlop={12}
          >
            <Ionicons name="trash-outline" size={16} color={C.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}



export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { colors: themeColors } = useTheme();
  const SECTION_CONFIG = useSectionConfig();
  const queryClient = useQueryClient();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [newAlertPair, setNewAlertPair] = useState("EUR/USD");
  const [newAlertPrice, setNewAlertPrice] = useState("");
  const [newAlertDirection, setNewAlertDirection] = useState<"above" | "below">("above");
  const [newAlertNote, setNewAlertNote] = useState("");
  const [activeTab, setActiveTab] = useState<"alerts" | "price">("alerts");

  const { data: alerts = [], isLoading } = useQuery<AlertItem[]>({
    queryKey: ["/api/alerts"],
    refetchInterval: 15000,
  });

  const { data: priceAlertsList = [], isLoading: priceAlertsLoading } = useQuery<PriceAlertItem[]>({
    queryKey: ["/api/price-alerts"],
    refetchInterval: 20000,
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/price-alerts"] }),
    ]);
    setIsRefreshing(false);
  }, [queryClient]);

  const readAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/alerts/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const createPriceAlertMutation = useMutation({
    mutationFn: async (data: { pair: string; targetPrice: string; direction: string; note: string }) => {
      return await apiRequest("POST", "/api/price-alerts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-alerts"] });
      setShowCreateModal(false);
      setNewAlertPrice("");
      setNewAlertNote("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const deletePriceAlertMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/price-alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-alerts"] });
    },
  });

  const handleCreateAlert = useCallback(() => {
    const price = parseFloat(newAlertPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert("Errore", "Inserisci un prezzo valido");
      return;
    }
    createPriceAlertMutation.mutate({
      pair: newAlertPair,
      targetPrice: newAlertPrice,
      direction: newAlertDirection,
      note: newAlertNote,
    });
  }, [newAlertPair, newAlertPrice, newAlertDirection, newAlertNote]);

  const handleDeleteAlert = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deletePriceAlertMutation.mutate(id);
  }, []);

  const unreadCount = alerts.filter((a) => !a.read).length;
  const activePriceAlerts = priceAlertsList.filter(a => !a.triggered);
  const triggeredPriceAlerts = priceAlertsList.filter(a => a.triggered);

  const sections = useMemo(() => {
    const groups: Record<string, AlertItem[]> = { outcome: [], market: [], signal: [], news: [] };
    alerts.forEach(a => {
      if (!groups[a.type]) groups[a.type] = [];
      groups[a.type].push(a);
    });
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([type, data]) => ({
        type,
        ...(SECTION_CONFIG[type] ?? { title: type, icon: "alert", color: themeColors.textSecondary }),
        data: data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      }));
  }, [alerts]);

  const renderPriceAlertsTab = () => {
    if (priceAlertsLoading) {
      return (
        <View style={{ paddingTop: 8, paddingHorizontal: 16 }}>
          {[0, 1, 2].map((i) => <AlertSkeleton key={i} />)}
        </View>
      );
    }

    if (priceAlertsList.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.accent + "15" }]}>
            <Ionicons name="notifications-outline" size={36} color={themeColors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Nessun avviso prezzo</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
            Crea un avviso per essere notificato quando il prezzo raggiunge il tuo target
          </Text>
          <Pressable
            onPress={() => { setShowCreateModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            style={[styles.createBtn, { backgroundColor: themeColors.accent }]}
          >
            <Ionicons name="add" size={18} color={themeColors.background} />
            <Text style={[styles.createBtnText, { color: themeColors.background }]}>Crea avviso</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <FlatList
        data={[
          ...(activePriceAlerts.length > 0 ? [{ type: "header" as const, title: "Attivi", count: activePriceAlerts.length }] : []),
          ...activePriceAlerts.map(a => ({ type: "item" as const, data: a })),
          ...(triggeredPriceAlerts.length > 0 ? [{ type: "header" as const, title: "Scattati", count: triggeredPriceAlerts.length }] : []),
          ...triggeredPriceAlerts.map(a => ({ type: "item" as const, data: a })),
        ]}
        keyExtractor={(item, index) => item.type === "header" ? `header-${item.title}` : `item-${(item as any).data.id}`}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={[styles.sectionHeader, { backgroundColor: themeColors.background }]}>
                <View style={[styles.sectionIcon, { backgroundColor: (item.title === "Attivi" ? themeColors.hold : themeColors.buy) + "20" }]}>
                  <Ionicons name={item.title === "Attivi" ? "time" : "checkmark-circle"} size={12} color={item.title === "Attivi" ? themeColors.hold : themeColors.buy} />
                </View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{item.title}</Text>
                <Text style={[styles.sectionCount, { color: themeColors.textMuted }]}>{item.count}</Text>
              </View>
            );
          }
          return <PriceAlertCard item={(item as any).data} onDelete={handleDeleteAlert} />;
        }}
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 100 }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={themeColors.accent} />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Alert</Text>
            {activeTab === "alerts" && unreadCount > 0 && (
              <Text style={[styles.headerSubtitle, { color: themeColors.accent }]}>{unreadCount} nuovi alert</Text>
            )}
            {activeTab === "price" && activePriceAlerts.length > 0 && (
              <Text style={[styles.headerSubtitle, { color: themeColors.hold }]}>{activePriceAlerts.length} avvisi attivi</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {activeTab === "alerts" && unreadCount > 0 && (
              <Pressable
                onPress={() => { readAllMutation.mutate(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={[styles.readAllBtn, { backgroundColor: themeColors.backgroundElevated }]}
              >
                <Ionicons name="checkmark-done" size={14} color={themeColors.accent} />
                <Text style={styles.readAllText}>Segna tutti</Text>
              </Pressable>
            )}
            {activeTab === "alerts" && unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: themeColors.accent }]}>
                <Text style={[styles.badgeText, { color: themeColors.background }]}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.tabBar, { backgroundColor: themeColors.backgroundElevated }]}>
          <Pressable
            style={[styles.tab, activeTab === "alerts" && { backgroundColor: themeColors.accent + "20" }]}
            onPress={() => setActiveTab("alerts")}
          >
            <Ionicons name="notifications" size={14} color={activeTab === "alerts" ? themeColors.accent : themeColors.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === "alerts" ? themeColors.accent : themeColors.textMuted }]}>Notifiche</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === "price" && { backgroundColor: themeColors.accent + "20" }]}
            onPress={() => setActiveTab("price")}
          >
            <Ionicons name="pulse" size={14} color={activeTab === "price" ? themeColors.accent : themeColors.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === "price" ? themeColors.accent : themeColors.textMuted }]}>Avvisi Prezzo</Text>
            {activePriceAlerts.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: themeColors.hold }]}>
                <Text style={[styles.tabBadgeText, { color: themeColors.background }]}>{activePriceAlerts.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {activeTab === "alerts" ? (
        isLoading ? (
          <View style={{ paddingTop: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => <AlertSkeleton key={i} />)}
          </View>
        ) : alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: themeColors.accent + "15" }]}>
              <Ionicons name="notifications-outline" size={36} color={themeColors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>Nessun alert</Text>
            <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
              Gli alert appariranno automaticamente quando vengono generati nuovi segnali di trading
            </Text>
            <View style={styles.emptyHintRow}>
              <Ionicons name="flash-outline" size={14} color={themeColors.textMuted} />
              <Text style={[styles.emptyHintText, { color: themeColors.textMuted }]}>
                Vai su Segnali e tocca "Genera"
              </Text>
            </View>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => <AlertCard item={item} index={index} />}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: themeColors.background }]}>
                <View style={[styles.sectionIcon, { backgroundColor: section.color + "20" }]}>
                  <Ionicons name={section.icon as any} size={12} color={section.color} />
                </View>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{section.title}</Text>
                <Text style={[styles.sectionCount, { color: themeColors.textMuted }]}>{section.data.length}</Text>
              </View>
            )}
            contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 100 }]}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={themeColors.accent} />
            }
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={true}
          />
        )
      ) : (
        renderPriceAlertsTab()
      )}

      {activeTab === "price" && (
        <Pressable
          style={[styles.fab, { backgroundColor: themeColors.accent }]}
          onPress={() => {
            setShowCreateModal(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <Ionicons name="add" size={28} color={themeColors.background} />
        </Pressable>
      )}

      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (showPairSelector) {
            setShowPairSelector(false);
          } else {
            setShowCreateModal(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: themeColors.backgroundCard, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle}>
              <View style={[styles.handleBar, { backgroundColor: themeColors.textMuted }]} />
            </View>

            {showPairSelector ? (
              <>
                <View style={styles.modalHeader}>
                  <Pressable onPress={() => setShowPairSelector(false)} hitSlop={12} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={22} color={themeColors.textSecondary} />
                    <Text style={[styles.backBtnText, { color: themeColors.textSecondary }]}>Indietro</Text>
                  </Pressable>
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>Coppia</Text>
                  <View style={{ width: 80 }} />
                </View>
                <FlatList
                  data={ALL_PAIRS}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[
                        styles.pairOption,
                        { borderBottomColor: themeColors.border },
                        newAlertPair === item && { backgroundColor: themeColors.accent + "15" },
                      ]}
                      onPress={() => {
                        setNewAlertPair(item);
                        setShowPairSelector(false);
                      }}
                    >
                      <Text style={[styles.pairOptionText, { color: newAlertPair === item ? themeColors.accent : themeColors.text }]}>{item}</Text>
                      {newAlertPair === item && <Ionicons name="checkmark" size={20} color={themeColors.accent} />}
                    </Pressable>
                  )}
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: 420 }}
                />
              </>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>Nuovo avviso prezzo</Text>
                  <Pressable
                    onPress={() => {
                      setShowCreateModal(false);
                      setShowPairSelector(false);
                      setNewAlertPrice("");
                      setNewAlertNote("");
                    }}
                    hitSlop={12}
                  >
                    <Ionicons name="close" size={24} color={themeColors.textSecondary} />
                  </Pressable>
                </View>

                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Coppia</Text>
                <Pressable
                  style={[styles.pairPickerBtn, { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border }]}
                  onPress={() => setShowPairSelector(true)}
                >
                  <Text style={[styles.pairPickerText, { color: themeColors.text }]}>{newAlertPair}</Text>
                  <Ionicons name="chevron-down" size={18} color={themeColors.textMuted} />
                </Pressable>

                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Direzione</Text>
                <View style={styles.directionRow}>
                  <Pressable
                    style={[
                      styles.directionBtn,
                      { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border },
                      newAlertDirection === "above" && { backgroundColor: themeColors.buyBg, borderColor: themeColors.buy },
                    ]}
                    onPress={() => setNewAlertDirection("above")}
                  >
                    <Ionicons name="arrow-up" size={16} color={newAlertDirection === "above" ? themeColors.buy : themeColors.textMuted} />
                    <Text style={[styles.directionText, { color: newAlertDirection === "above" ? themeColors.buy : themeColors.textSecondary }]}>Sopra</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.directionBtn,
                      { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border },
                      newAlertDirection === "below" && { backgroundColor: themeColors.sellBg, borderColor: themeColors.sell },
                    ]}
                    onPress={() => setNewAlertDirection("below")}
                  >
                    <Ionicons name="arrow-down" size={16} color={newAlertDirection === "below" ? themeColors.sell : themeColors.textMuted} />
                    <Text style={[styles.directionText, { color: newAlertDirection === "below" ? themeColors.sell : themeColors.textSecondary }]}>Sotto</Text>
                  </Pressable>
                </View>

                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Prezzo target</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="es. 1.0850"
                  placeholderTextColor={themeColors.textMuted}
                  keyboardType="decimal-pad"
                  value={newAlertPrice}
                  onChangeText={setNewAlertPrice}
                />

                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Nota (opzionale)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.backgroundElevated, borderColor: themeColors.border, color: themeColors.text }]}
                  placeholder="es. Livello di supporto"
                  placeholderTextColor={themeColors.textMuted}
                  value={newAlertNote}
                  onChangeText={setNewAlertNote}
                  maxLength={100}
                />

                <Pressable
                  style={[styles.submitBtn, { backgroundColor: themeColors.accent, opacity: createPriceAlertMutation.isPending ? 0.6 : 1 }]}
                  onPress={handleCreateAlert}
                  disabled={createPriceAlertMutation.isPending}
                >
                  <Ionicons name="checkmark" size={20} color={themeColors.background} />
                  <Text style={[styles.submitBtnText, { color: themeColors.background }]}>
                    {createPriceAlertMutation.isPending ? "Creazione..." : "Crea avviso"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: Colors.dark.text, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 4 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  readAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  readAllText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.accent },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  tabBar: { flexDirection: "row", borderRadius: 12, padding: 3, marginTop: 12 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10 },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", flex: 1 },
  sectionCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    gap: 12,
    position: "relative",
  },
  unreadDot: { position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: 4 },
  iconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  content: { flex: 1 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, gap: 8 },
  titleText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 0 },
  messageText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 8 },
  cardFooterRow: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "space-between" },
  pairBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  pairText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyHintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, opacity: 0.7 },
  emptyHintText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "85%",
  },
  modalHandle: { alignItems: "center", paddingVertical: 8 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginTop: 12, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  pairPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pairPickerText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  directionRow: { flexDirection: "row", gap: 10 },
  directionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  directionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  submitBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  createBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, width: 80 },
  backBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  pairOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pairOptionText: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
