import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

interface CalendarEvent {
  id: string;
  date: string;
  time: string;
  event: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  signalsAtRisk?: { pair: string; action: string }[];
}

interface Signal {
  id: string;
  pair: string;
  action: string;
  confidence: number;
  strength: number;
}

interface AlertData {
  id: string;
  type: string;
  title: string;
  message: string;
  pair?: string;
  action?: string;
  timestamp: string;
  read: boolean;
}

interface NotificationItem {
  id: string;
  type: "event" | "signal" | "outcome";
  title: string;
  subtitle: string;
  color: string;
  icon: string;
  iconBg: string;
}

export default function NotificationBanner() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(false);
  const [currentNotif, setCurrentNotif] = useState<NotificationItem | null>(null);
  const translateY = useSharedValue(-120);
  const seenSignals = useRef<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);

  const { data: calendar = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar", "signals=true", "notification"],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL("/api/calendar?signals=true", getApiUrl());
      const res = await fetch(url.toString());
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
  });

  const { data: commoditySignals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/commodities/signals"],
  });

  const { data: alerts = [] } = useQuery<AlertData[]>({
    queryKey: ["/api/alerts"],
    refetchInterval: 15000,
  });

  const seenOutcomes = useRef<Set<string>>(new Set());

  const getNotifications = useCallback((): NotificationItem[] => {
    const notifs: NotificationItem[] = [];
    const now = Date.now();

    const outcomeAlerts = alerts.filter(a => a.type === "outcome" && !a.read && !seenOutcomes.current.has(a.id));
    outcomeAlerts.forEach(a => {
      const isWin = a.title.includes("TP");
      notifs.push({
        id: `outcome_${a.id}`,
        type: "outcome",
        title: a.title,
        subtitle: a.message,
        color: isWin ? C.buy : C.sell,
        icon: isWin ? "checkmark-circle" : "close-circle",
        iconBg: isWin ? C.buyBg : C.sellBg,
      });
    });

    calendar
      .filter((e) => e.impact === "HIGH")
      .forEach((e) => {
        const [hours, minutes] = e.time.split(":").map(Number);
        const d = new Date(e.date + "T00:00:00Z");
        d.setUTCHours(hours || 0, minutes || 0, 0, 0);
        const diff = d.getTime() - now;
        if (diff > 0 && diff < 1800000) {
          const minsLeft = Math.round(diff / 60000);
          const riskCount = e.signalsAtRisk?.length ?? 0;
          notifs.push({
            id: `event_${e.id}`,
            type: "event",
            title: `Evento ad alto impatto tra ${minsLeft} min!`,
            subtitle: e.event + (riskCount > 0 ? ` - ${riskCount} segnali a rischio` : ""),
            color: C.sell,
            icon: "warning",
            iconBg: C.sellBg,
          });
        }
      });

    [...signals, ...commoditySignals]
      .filter((s) => s.confidence >= 80 && s.action !== "HOLD" && !seenSignals.current.has(s.id))
      .forEach((s) => {
        notifs.push({
          id: `signal_${s.id}`,
          type: "signal",
          title: `Segnale forte: ${s.action} ${s.pair}`,
          subtitle: `Confidenza ${s.confidence}% - Forza ${s.strength}%`,
          color: s.action === "BUY" ? C.buy : C.sell,
          icon: s.action === "BUY" ? "arrow-up-circle" : "arrow-down-circle",
          iconBg: s.action === "BUY" ? C.buyBg : C.sellBg,
        });
        seenSignals.current.add(s.id);
      });

    return notifs;
  }, [calendar, signals, commoditySignals, alerts, C]);

  const notifications = getNotifications();
  const activeNotif = notifications.find((n) => !dismissed.has(n.id));

  useEffect(() => {
    const count = notifications.filter((n) => !dismissed.has(n.id)).length;
    setUnreadCount(count);
  }, [notifications, dismissed]);

  const markCurrentSeen = useCallback(() => {
    if (currentNotif) {
      setDismissed((prev) => new Set(prev).add(currentNotif.id));
      if (currentNotif.type === "outcome") {
        const rawId = currentNotif.id.replace("outcome_", "");
        seenOutcomes.current.add(rawId);
      }
    }
  }, [currentNotif]);

  useEffect(() => {
    if (activeNotif && activeNotif.id !== currentNotif?.id) {
      setCurrentNotif(activeNotif);
      setVisible(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      translateY.value = withSpring(0, { damping: 15, stiffness: 120 });

      const timer = setTimeout(() => {
        translateY.value = withTiming(-120, { duration: 300 }, () => {
          runOnJS(markCurrentSeen)();
          runOnJS(setVisible)(false);
        });
      }, 8000);

      return () => clearTimeout(timer);
    }
  }, [activeNotif?.id]);

  const dismiss = () => {
    markCurrentSeen();
    translateY.value = withTiming(-120, { duration: 300 }, () => {
      runOnJS(setVisible)(false);
      runOnJS(setCurrentNotif)(null);
    });
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible || !currentNotif) return null;

  return (
    <Animated.View style={[styles.container, { top: topInset + 4 }, animStyle]}>
      <View style={[styles.banner, { backgroundColor: C.backgroundCard, borderColor: currentNotif.color + "40" }]}>
        <View style={[styles.iconWrap, { backgroundColor: currentNotif.iconBg }]}>
          <Ionicons name={currentNotif.icon as any} size={20} color={currentNotif.color} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, { color: currentNotif.color }]} numberOfLines={1}>
            {currentNotif.title}
          </Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]} numberOfLines={1}>
            {currentNotif.subtitle}
          </Text>
        </View>
        {unreadCount > 1 && (
          <View style={[styles.countBadge, { backgroundColor: currentNotif.color }]}>
            <Text style={styles.countText}>{unreadCount}</Text>
          </View>
        )}
        <Pressable onPress={dismiss} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={C.textMuted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(20, 28, 46, 0.95)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textSecondary,
  },
  closeBtn: {
    padding: 4,
  },
  countBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
