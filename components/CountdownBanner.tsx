import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
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

function getEventDate(event: CalendarEvent): Date {
  const [hours, minutes] = event.time.split(":").map(Number);
  const d = new Date(event.date + "T00:00:00Z");
  d.setUTCHours(hours || 0, minutes || 0, 0, 0);
  return d;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "ORA";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export default function CountdownBanner() {
  const { colors: C } = useTheme();
  const [now, setNow] = useState(Date.now());

  const { data: calendar = [] } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar", "signals=true"],
    queryFn: async () => {
      const { getApiUrl } = await import("@/lib/query-client");
      const url = new URL("/api/calendar?signals=true", getApiUrl());
      const res = await fetch(url.toString());
      return res.json();
    },
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const nextHighEvent = useMemo(() => {
    return calendar
      .filter((e) => e.impact === "HIGH")
      .map((e) => ({ ...e, eventDate: getEventDate(e) }))
      .filter((e) => e.eventDate.getTime() > now)
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime())[0] ?? null;
  }, [calendar, now]);

  if (!nextHighEvent) return null;

  const msRemaining = nextHighEvent.eventDate.getTime() - now;
  const isUrgent = msRemaining < 3600000;
  const riskCount = nextHighEvent.signalsAtRisk?.length ?? 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isUrgent ? C.sellBg : C.holdBg,
          borderColor: isUrgent ? C.sellBorder : C.holdBorder,
        },
      ]}
    >
      <View style={styles.left}>
        <Ionicons
          name={isUrgent ? "warning" : "time-outline"}
          size={16}
          color={isUrgent ? C.sell : C.hold}
        />
        <View style={styles.info}>
          <Text style={[styles.eventName, { color: isUrgent ? C.sell : C.hold }]} numberOfLines={1}>
            {nextHighEvent.event}
          </Text>
          <Text style={[styles.detail, { color: C.textMuted }]}>
            {riskCount > 0 ? `${riskCount} segnali a rischio` : nextHighEvent.time + " UTC"}
          </Text>
        </View>
      </View>
      <View style={[styles.countdown, { backgroundColor: isUrgent ? "rgba(255,77,106,0.2)" : "rgba(255,179,71,0.2)" }]}>
        <Text style={[styles.countdownText, { color: isUrgent ? C.sell : C.hold }]}>
          {formatCountdown(msRemaining)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  eventName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  detail: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.dark.textMuted,
  },
  countdown: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  countdownText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
});
