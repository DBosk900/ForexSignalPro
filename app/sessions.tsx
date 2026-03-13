import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  withSequence,
  FadeInDown,
} from "react-native-reanimated";
import Svg, { Path, Circle, Ellipse, G, Rect } from "react-native-svg";
import { useTheme } from "@/contexts/ThemeContext";

interface SessionData {
  name: string;
  open: boolean;
  openUTC: number;
  closeUTC: number;
  timezone: string;
  localTime: string;
  volatilePairs: string[];
}

interface MarketStatus {
  isOpen: boolean;
  isClosed: boolean;
  isNightSession: boolean;
  activeSessions: string[];
  sessions: SessionData[];
  nextOpen: string;
}

const SESSION_COLORS: Record<string, { active: string; dim: string }> = {
  Sydney: { active: "#00E5FF", dim: "#0D3B4A" },
  Tokyo: { active: "#FF6B9D", dim: "#4A1A2E" },
  Londra: { active: "#FFD700", dim: "#4A3D0D" },
  "New York": { active: "#00D4AA", dim: "#0D4A3B" },
};

const SESSION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Sydney: "sunny-outline",
  Tokyo: "flower-outline",
  Londra: "business-outline",
  "New York": "trending-up-outline",
};

function PulsingDot({ color, active }: { color: string; active: boolean }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 1200, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [active]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!active) return null;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
        },
        pulseStyle,
      ]}
    />
  );
}

function WorldMapSVG({ sessions }: { sessions: SessionData[] }) {
  const { colors: C } = useTheme();

  const sessionMap: Record<string, SessionData> = {};
  for (const s of sessions) {
    sessionMap[s.name] = s;
  }

  const regions: {
    name: string;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
  }[] = [
    { name: "Sydney", cx: 310, cy: 135, rx: 22, ry: 18 },
    { name: "Tokyo", cx: 290, cy: 75, rx: 20, ry: 16 },
    { name: "Londra", cx: 160, cy: 60, rx: 18, ry: 14 },
    { name: "New York", cx: 80, cy: 70, rx: 22, ry: 16 },
  ];

  return (
    <View style={mapStyles.container}>
      <Svg width="100%" height="100%" viewBox="0 0 360 180">
        <Rect x="0" y="0" width="360" height="180" fill="transparent" />

        <Path
          d="M45,25 L55,20 L65,22 L80,18 L95,20 L105,25 L110,35 L115,50 L118,65 L120,80 L115,95 L110,105 L105,115 L95,125 L85,130 L75,128 L65,130 L55,135 L45,140 L35,135 L30,125 L25,110 L28,95 L32,80 L35,65 L38,50 L42,35 Z"
          fill={C.backgroundElevated}
          opacity={0.4}
          stroke={C.border}
          strokeWidth={0.5}
        />

        <Path
          d="M140,15 L155,10 L170,12 L185,8 L195,15 L200,25 L195,35 L190,45 L185,55 L175,65 L165,70 L155,72 L148,70 L142,65 L138,55 L135,45 L137,30 Z"
          fill={C.backgroundElevated}
          opacity={0.4}
          stroke={C.border}
          strokeWidth={0.5}
        />

        <Path
          d="M150,70 L160,72 L175,68 L190,72 L200,80 L210,90 L215,100 L210,110 L200,120 L190,130 L180,135 L170,140 L160,145 L150,148 L140,145 L135,138 L138,125 L145,110 L148,95 L147,80 Z"
          fill={C.backgroundElevated}
          opacity={0.4}
          stroke={C.border}
          strokeWidth={0.5}
        />

        <Path
          d="M230,40 L245,35 L260,38 L275,42 L290,45 L300,55 L305,70 L300,85 L290,95 L275,100 L260,98 L250,90 L242,80 L238,65 L235,50 Z"
          fill={C.backgroundElevated}
          opacity={0.4}
          stroke={C.border}
          strokeWidth={0.5}
        />

        <Path
          d="M290,105 L300,100 L315,105 L325,115 L330,130 L325,140 L315,148 L300,150 L290,145 L285,135 L287,120 Z"
          fill={C.backgroundElevated}
          opacity={0.4}
          stroke={C.border}
          strokeWidth={0.5}
        />

        {regions.map((r) => {
          const session = sessionMap[r.name];
          const active = session?.open ?? false;
          const color = SESSION_COLORS[r.name] || { active: "#00D4AA", dim: "#1A2540" };
          return (
            <G key={r.name}>
              {active && (
                <Ellipse
                  cx={r.cx}
                  cy={r.cy}
                  rx={r.rx + 8}
                  ry={r.ry + 6}
                  fill={color.active}
                  opacity={0.08}
                />
              )}
              <Ellipse
                cx={r.cx}
                cy={r.cy}
                rx={r.rx}
                ry={r.ry}
                fill={active ? color.active : color.dim}
                opacity={active ? 0.25 : 0.15}
                stroke={active ? color.active : color.dim}
                strokeWidth={active ? 1.5 : 0.5}
              />
              <Circle
                cx={r.cx}
                cy={r.cy}
                r={3}
                fill={active ? color.active : C.textMuted}
              />
            </G>
          );
        })}
      </Svg>

      {regions.map((r) => {
        const session = sessionMap[r.name];
        const active = session?.open ?? false;
        const color = SESSION_COLORS[r.name] || { active: "#00D4AA", dim: "#1A2540" };
        const leftPct = (r.cx / 360) * 100;
        const topPct = (r.cy / 180) * 100;
        return (
          <View
            key={`dot-${r.name}`}
            style={{
              position: "absolute",
              left: `${leftPct}%` as any,
              top: `${topPct}%` as any,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: -6,
              marginTop: -6,
            }}
          >
            <PulsingDot color={color.active} active={active} />
          </View>
        );
      })}
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 2,
    position: "relative",
  },
});

function SessionCard({
  session,
  index,
}: {
  session: SessionData;
  index: number;
}) {
  const { colors: C } = useTheme();
  const color = SESSION_COLORS[session.name] || { active: "#00D4AA", dim: "#1A2540" };
  const icon = SESSION_ICONS[session.name] || "globe-outline";

  const borderGlow = useSharedValue(0.3);

  useEffect(() => {
    if (session.open) {
      borderGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [session.open]);

  const glowStyle = useAnimatedStyle(() => ({
    borderColor: session.open
      ? color.active
      : C.border,
    borderWidth: session.open ? 1.5 : 1,
    opacity: session.open ? 0.6 + borderGlow.value * 0.4 : 1,
  }));

  const openH = session.openUTC;
  const closeH = session.closeUTC;
  const openStr = `${openH.toString().padStart(2, "0")}:00`;
  const closeStr = `${closeH.toString().padStart(2, "0")}:00`;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100).duration(400)}
      style={[
        cardStyles.card,
        { backgroundColor: C.backgroundCard },
        glowStyle,
      ]}
    >
      <View style={cardStyles.topRow}>
        <View style={[cardStyles.iconWrap, { backgroundColor: session.open ? color.active + "20" : C.backgroundElevated }]}>
          <Ionicons name={icon} size={20} color={session.open ? color.active : C.textMuted} />
        </View>
        <View style={cardStyles.nameCol}>
          <Text style={[cardStyles.sessionName, { color: session.open ? color.active : C.textSecondary }]}>
            {session.name}
          </Text>
          <Text style={[cardStyles.timezone, { color: C.textMuted }]}>
            {session.timezone.split("/")[1]?.replace("_", " ") || session.timezone}
          </Text>
        </View>
        <View style={cardStyles.timeCol}>
          <Text style={[cardStyles.localTime, { color: session.open ? C.text : C.textSecondary }]}>
            {session.localTime}
          </Text>
          <View style={[cardStyles.statusBadge, { backgroundColor: session.open ? color.active + "20" : C.backgroundElevated }]}>
            <View style={[cardStyles.statusDot, { backgroundColor: session.open ? color.active : C.textMuted }]} />
            <Text style={[cardStyles.statusText, { color: session.open ? color.active : C.textMuted }]}>
              {session.open ? "Aperta" : "Chiusa"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[cardStyles.scheduleRow, { borderTopColor: C.border }]}>
        <Ionicons name="time-outline" size={12} color={C.textMuted} />
        <Text style={[cardStyles.scheduleText, { color: C.textSecondary }]}>
          {openStr} - {closeStr} UTC
        </Text>
      </View>

      {session.open && session.volatilePairs.length > 0 && (
        <View style={cardStyles.pairsRow}>
          <Ionicons name="flash-outline" size={12} color={color.active} />
          <Text style={[cardStyles.pairsLabel, { color: color.active }]}>Coppie volatili:</Text>
          <View style={cardStyles.pairChips}>
            {session.volatilePairs.map((pair) => (
              <View key={pair} style={[cardStyles.pairChip, { backgroundColor: color.active + "15", borderColor: color.active + "30" }]}>
                <Text style={[cardStyles.pairText, { color: color.active }]}>{pair}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  nameCol: {
    flex: 1,
    gap: 2,
  },
  sessionName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  timezone: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  timeCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  localTime: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  scheduleText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  pairsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  pairsLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  pairChips: {
    flexDirection: "row",
    gap: 4,
    flexWrap: "wrap",
    flex: 1,
  },
  pairChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  pairText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});

function TimelineBar({ sessions }: { sessions: SessionData[] }) {
  const { colors: C } = useTheme();
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const currentProgress = (utcHour + utcMin / 60) / 24;

  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <Animated.View
      entering={FadeInDown.delay(500).duration(400)}
      style={[timelineStyles.container, { backgroundColor: C.backgroundCard, borderColor: C.border }]}
    >
      <View style={timelineStyles.header}>
        <Ionicons name="calendar-outline" size={13} color={C.textMuted} />
        <Text style={[timelineStyles.title, { color: C.textSecondary }]}>Timeline 24h (UTC)</Text>
      </View>

      <View style={timelineStyles.bars}>
        {sessions.map((session) => {
          const color = SESSION_COLORS[session.name] || { active: "#00D4AA", dim: "#1A2540" };
          const openH = session.openUTC;
          const closeH = session.closeUTC;

          let left: number;
          let width: number;

          if (closeH > openH) {
            left = (openH / 24) * 100;
            width = ((closeH - openH) / 24) * 100;
          } else {
            left = (openH / 24) * 100;
            width = ((24 - openH + closeH) / 24) * 100;
          }

          return (
            <View key={session.name} style={timelineStyles.barRow}>
              <Text style={[timelineStyles.barLabel, { color: C.textMuted }]}>
                {session.name.substring(0, 3).toUpperCase()}
              </Text>
              <View style={[timelineStyles.barTrack, { backgroundColor: C.backgroundElevated }]}>
                {closeH > openH ? (
                  <View
                    style={[
                      timelineStyles.barFill,
                      {
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: session.open ? color.active : color.dim,
                        opacity: session.open ? 0.7 : 0.3,
                      },
                    ]}
                  />
                ) : (
                  <>
                    <View
                      style={[
                        timelineStyles.barFill,
                        {
                          left: `${left}%`,
                          width: `${((24 - openH) / 24) * 100}%`,
                          backgroundColor: session.open ? color.active : color.dim,
                          opacity: session.open ? 0.7 : 0.3,
                        },
                      ]}
                    />
                    <View
                      style={[
                        timelineStyles.barFill,
                        {
                          left: "0%",
                          width: `${(closeH / 24) * 100}%`,
                          backgroundColor: session.open ? color.active : color.dim,
                          opacity: session.open ? 0.7 : 0.3,
                        },
                      ]}
                    />
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={timelineStyles.hourRow}>
        <View style={{ width: 36 }} />
        <View style={timelineStyles.hourTrack}>
          {hourLabels.map((h) => (
            <Text
              key={h}
              style={[
                timelineStyles.hourLabel,
                { color: C.textMuted, left: `${(h / 24) * 100}%` },
              ]}
            >
              {h.toString().padStart(2, "0")}
            </Text>
          ))}
          <View
            style={[
              timelineStyles.nowLine,
              { left: `${currentProgress * 100}%`, backgroundColor: "#FF4D6A" },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const timelineStyles = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  bars: {
    gap: 6,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 16,
  },
  barLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    width: 28,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    position: "relative",
    overflow: "hidden",
  },
  barFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 5,
  },
  hourRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  hourTrack: {
    flex: 1,
    height: 16,
    position: "relative",
  },
  hourLabel: {
    position: "absolute",
    fontSize: 8,
    fontFamily: "Inter_500Medium",
    top: 0,
  },
  nowLine: {
    position: "absolute",
    top: -10,
    width: 2,
    height: 80,
    borderRadius: 1,
    opacity: 0.7,
  },
});

export default function SessionsScreen() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: marketStatus } = useQuery<MarketStatus>({
    queryKey: ["/api/market-status"],
    refetchInterval: 30000,
  });

  const sessions = marketStatus?.sessions ?? [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.mapCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
        <View style={styles.mapHeader}>
          <Ionicons name="globe" size={16} color={C.accent} />
          <Text style={[styles.mapTitle, { color: C.text }]}>Mappa Sessioni</Text>
          <Text style={[styles.liveLabel, { color: C.accent }]}>LIVE</Text>
        </View>
        <WorldMapSVG sessions={sessions} />
        <View style={styles.legendRow}>
          {sessions.map((s) => {
            const color = SESSION_COLORS[s.name] || { active: "#00D4AA", dim: "#1A2540" };
            return (
              <View key={s.name} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.open ? color.active : color.dim }]} />
                <Text style={[styles.legendText, { color: s.open ? C.text : C.textMuted }]}>
                  {s.name}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.cardsSection}>
        {sessions.map((session, index) => (
          <SessionCard key={session.name} session={session} index={index} />
        ))}
      </View>

      {sessions.length > 0 && <TimelineBar sessions={sessions} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  mapCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  mapHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  liveLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  cardsSection: {
    gap: 12,
  },
});
