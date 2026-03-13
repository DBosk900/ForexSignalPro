import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

interface Session {
  name: string;
  icon: string;
  openHour: number;
  closeHour: number;
  crossesMidnight: boolean;
}

const SESSIONS: Session[] = [
  { name: "Sydney", icon: "SYD", openHour: 22, closeHour: 7, crossesMidnight: true },
  { name: "Tokyo", icon: "TKY", openHour: 0, closeHour: 9, crossesMidnight: false },
  { name: "Londra", icon: "LDN", openHour: 8, closeHour: 17, crossesMidnight: false },
  { name: "New York", icon: "NYC", openHour: 13, closeHour: 22, crossesMidnight: false },
];

function isSessionActive(session: Session, hour: number): boolean {
  if (session.crossesMidnight) {
    return hour >= session.openHour || hour < session.closeHour;
  }
  return hour >= session.openHour && hour < session.closeHour;
}

export default function MarketSessions() {
  const { colors: C } = useTheme();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const utcHour = now.getUTCHours();

  return (
    <Pressable style={styles.container} onPress={() => router.push("/sessions")}>
      <View style={styles.header}>
        <Ionicons name="globe-outline" size={12} color={C.textMuted} />
        <Text style={[styles.headerText, { color: C.textMuted }]}>Sessioni di Mercato</Text>
        <Text style={[styles.utcTime, { color: C.textSecondary }]}>{now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC</Text>
        <Ionicons name="chevron-forward" size={12} color={C.textMuted} style={{ marginLeft: 4 }} />
      </View>
      <View style={styles.sessions}>
        {SESSIONS.map((session) => {
          const active = isSessionActive(session, utcHour);
          return (
            <View
              key={session.name}
              style={[
                styles.sessionChip,
                {
                  backgroundColor: active ? C.buyBg : C.backgroundElevated,
                  borderColor: active ? C.buyBorder : C.border,
                },
              ]}
            >
              <Text style={[styles.flag, { color: C.textSecondary }]}>{session.icon}</Text>
              <Text
                style={[
                  styles.sessionName,
                  { color: active ? C.buy : C.textMuted },
                ]}
              >
                {session.name}
              </Text>
              {active && <View style={[styles.activeDot, { backgroundColor: C.buy }]} />}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.dark.textMuted,
    flex: 1,
  },
  utcTime: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.dark.textSecondary,
  },
  sessions: {
    flexDirection: "row",
    gap: 6,
  },
  sessionChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  flag: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    color: Colors.dark.textSecondary,
  },
  sessionName: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.buy,
  },
});
