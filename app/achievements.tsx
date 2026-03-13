import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";
import * as Clipboard from "expo-clipboard";
import Svg, { Circle } from "react-native-svg";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  current: number;
  unlocked: boolean;
  category: string;
  points: number;
}

interface AchievementsData {
  achievements: Achievement[];
  summary: {
    unlockedCount: number;
    total: number;
    level: number;
    levelName: string;
    points: number;
    levelProgress: number;
    nextThreshold: number;
    currentThreshold: number;
  };
  nextAchievement: Achievement | null;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  base: { label: "Fondamenta", color: "#818CF8", icon: "layers" },
  profit: { label: "Profitti", color: "#00D4AA", icon: "trending-up" },
  streak: { label: "Serie", color: "#FF6347", icon: "flame" },
  accuracy: { label: "Precisione", color: "#FBBF24", icon: "locate" },
  diversity: { label: "Diversita'", color: "#38BDF8", icon: "globe" },
  pips: { label: "Pips", color: "#A78BFA", icon: "wallet" },
  dedication: { label: "Dedizione", color: "#FB923C", icon: "fitness" },
  specialist: { label: "Specialista", color: "#F472B6", icon: "ribbon" },
  elite: { label: "Elite", color: "#E879F9", icon: "shield-checkmark" },
  daily: { label: "Giornaliero", color: "#00D4AA", icon: "today" },
};

const LEVEL_COLORS = ["#9CA3AF", "#818CF8", "#00D4AA", "#FBBF24", "#FF6347", "#E879F9"];

function ProgressRing({ progress, size, strokeWidth, color }: { progress: number; size: number; strokeWidth: number; color: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color + "20"}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ShimmerCard({ children, unlocked, color }: { children: React.ReactNode; unlocked: boolean; color: string }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (unlocked) {
      shimmer.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }
  }, [unlocked]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: color,
    shadowOpacity: interpolate(shimmer.value, [0, 1], [0, 0.4]),
    shadowRadius: interpolate(shimmer.value, [0, 1], [0, 12]),
    shadowOffset: { width: 0, height: 0 },
    elevation: interpolate(shimmer.value, [0, 1], [0, 8]),
  }));

  if (!unlocked) return <>{children}</>;

  return (
    <Animated.View style={glowStyle}>
      {children}
    </Animated.View>
  );
}

function AchievementCard({ achievement, index, catColor }: { achievement: Achievement; index: number; catColor: string }) {
  const { colors } = useTheme();
  const progress = achievement.target > 0
    ? Math.min(achievement.current / achievement.target, 1)
    : 0;

  const handleShare = useCallback(async () => {
    const text = achievement.unlocked
      ? `Ho sbloccato "${achievement.name}" - ${achievement.description} (+${achievement.points} punti)`
      : `Sto lavorando su "${achievement.name}" - ${achievement.current}/${achievement.target}`;
    await Clipboard.setStringAsync(text);
  }, [achievement]);

  return (
    <ShimmerCard unlocked={achievement.unlocked} color={catColor}>
      <Animated.View
        entering={FadeInDown.duration(300).delay(index * 40)}
        style={[
          styles.achievementCard,
          {
            backgroundColor: colors.backgroundCard,
            borderColor: achievement.unlocked ? catColor + "50" : colors.border,
            opacity: achievement.unlocked ? 1 : 0.65,
          },
        ]}
      >
        <View style={[
          styles.achievementIcon,
          {
            backgroundColor: achievement.unlocked ? catColor + "20" : colors.backgroundElevated,
          },
        ]}>
          <Ionicons
            name={(achievement.icon || "star") as any}
            size={22}
            color={achievement.unlocked ? catColor : colors.textMuted}
          />
          {achievement.unlocked && (
            <View style={[styles.checkBadge, { backgroundColor: catColor }]}>
              <Ionicons name="checkmark" size={8} color="#FFF" />
            </View>
          )}
        </View>

        <View style={styles.achievementInfo}>
          <View style={styles.achievementHeader}>
            <Text style={[styles.achievementName, { color: colors.text }]} numberOfLines={1}>
              {achievement.name}
            </Text>
            <Text style={[styles.pointsLabel, { color: achievement.unlocked ? catColor : colors.textMuted }]}>
              +{achievement.points}
            </Text>
          </View>
          <Text style={[styles.achievementDesc, { color: colors.textMuted }]} numberOfLines={2}>
            {achievement.description}
          </Text>

          {!achievement.unlocked && (
            <View style={styles.progressRow}>
              <View style={[styles.miniTrack, { backgroundColor: colors.backgroundElevated }]}>
                <View
                  style={[
                    styles.miniFill,
                    { backgroundColor: catColor, width: `${progress * 100}%` },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, { color: colors.textMuted }]}>
                {achievement.current}/{achievement.target}
              </Text>
            </View>
          )}
        </View>

        <Pressable onPress={handleShare} hitSlop={8}>
          <Ionicons
            name={achievement.unlocked ? "share-outline" : "lock-closed"}
            size={16}
            color={colors.textMuted}
          />
        </Pressable>
      </Animated.View>
    </ShimmerCard>
  );
}

export default function AchievementsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const { data, isLoading, refetch, isRefetching } = useQuery<AchievementsData>({
    queryKey: ["/api/achievements"],
    staleTime: 60000,
  });

  const summary = data?.summary;
  const achievements = data?.achievements || [];
  const nextAchievement = data?.nextAchievement;
  const levelColor = summary ? LEVEL_COLORS[Math.min(summary.level - 1, LEVEL_COLORS.length - 1)] : colors.textMuted;

  const categories = [...new Set(achievements.map(a => a.category))];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.accent}
          />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <LinearGradient
              colors={[levelColor + "18", levelColor + "08", "transparent"]}
              style={[styles.levelCard, { borderColor: levelColor + "30" }]}
            >
              <View style={styles.ringContainer}>
                <ProgressRing
                  progress={summary?.levelProgress || 0}
                  size={100}
                  strokeWidth={6}
                  color={levelColor}
                />
                <View style={styles.ringCenter}>
                  <Ionicons name="trophy" size={28} color={levelColor} />
                  <Text style={[styles.levelNumber, { color: levelColor }]}>
                    {summary?.level || 1}
                  </Text>
                </View>
              </View>

              <Text style={[styles.levelName, { color: levelColor }]}>
                {summary?.levelName || "Principiante"}
              </Text>

              <View style={styles.levelStats}>
                <View style={styles.levelStat}>
                  <Text style={[styles.levelStatValue, { color: colors.accent }]}>
                    {summary?.points || 0}
                  </Text>
                  <Text style={[styles.levelStatLabel, { color: colors.textMuted }]}>Punti</Text>
                </View>
                <View style={[styles.levelDivider, { backgroundColor: colors.border }]} />
                <View style={styles.levelStat}>
                  <Text style={[styles.levelStatValue, { color: colors.accent }]}>
                    {summary?.unlockedCount || 0}/{summary?.total || 0}
                  </Text>
                  <Text style={[styles.levelStatLabel, { color: colors.textMuted }]}>Sbloccati</Text>
                </View>
                <View style={[styles.levelDivider, { backgroundColor: colors.border }]} />
                <View style={styles.levelStat}>
                  <Text style={[styles.levelStatValue, { color: colors.accent }]}>
                    {summary?.nextThreshold || 0}
                  </Text>
                  <Text style={[styles.levelStatLabel, { color: colors.textMuted }]}>Prossimo Lv</Text>
                </View>
              </View>
            </LinearGradient>

            {nextAchievement && (
              <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                <LinearGradient
                  colors={[
                    (CATEGORY_CONFIG[nextAchievement.category]?.color || colors.accent) + "15",
                    "transparent",
                  ]}
                  style={[styles.nextCard, { borderColor: (CATEGORY_CONFIG[nextAchievement.category]?.color || colors.accent) + "40" }]}
                >
                  <View style={styles.nextHeader}>
                    <Ionicons name="navigate" size={14} color={CATEGORY_CONFIG[nextAchievement.category]?.color || colors.accent} />
                    <Text style={[styles.nextLabel, { color: colors.textMuted }]}>
                      PROSSIMO TRAGUARDO
                    </Text>
                  </View>
                  <View style={styles.nextContent}>
                    <View style={[styles.nextIcon, { backgroundColor: (CATEGORY_CONFIG[nextAchievement.category]?.color || colors.accent) + "20" }]}>
                      <Ionicons
                        name={(nextAchievement.icon || "star") as any}
                        size={20}
                        color={CATEGORY_CONFIG[nextAchievement.category]?.color || colors.accent}
                      />
                    </View>
                    <View style={styles.nextInfo}>
                      <Text style={[styles.nextName, { color: colors.text }]}>
                        {nextAchievement.name}
                      </Text>
                      <View style={styles.nextProgress}>
                        <View style={[styles.nextTrack, { backgroundColor: colors.backgroundElevated }]}>
                          <View
                            style={[
                              styles.nextFill,
                              {
                                backgroundColor: CATEGORY_CONFIG[nextAchievement.category]?.color || colors.accent,
                                width: `${(nextAchievement.current / Math.max(nextAchievement.target, 1)) * 100}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.nextProgressText, { color: CATEGORY_CONFIG[nextAchievement.category]?.color || colors.accent }]}>
                          {nextAchievement.current}/{nextAchievement.target}
                        </Text>
                      </View>
                    </View>
                  </View>
                </LinearGradient>
              </Animated.View>
            )}

            {categories.map(cat => {
              const catInfo = CATEGORY_CONFIG[cat] || { label: cat, color: colors.accent, icon: "star" as any };
              const catAchievements = achievements.filter(a => a.category === cat);
              const catUnlocked = catAchievements.filter(a => a.unlocked).length;

              return (
                <View key={cat} style={styles.categorySection}>
                  <View style={styles.catHeader}>
                    <View style={[styles.catIconWrap, { backgroundColor: catInfo.color + "15" }]}>
                      <Ionicons name={catInfo.icon as any} size={14} color={catInfo.color} />
                    </View>
                    <Text style={[styles.catTitle, { color: colors.textMuted }]}>
                      {catInfo.label.toUpperCase()}
                    </Text>
                    <Text style={[styles.catCount, { color: catInfo.color }]}>
                      {catUnlocked}/{catAchievements.length}
                    </Text>
                  </View>

                  {catAchievements.map((achievement, index) => (
                    <AchievementCard
                      key={achievement.id}
                      achievement={achievement}
                      index={index}
                      catColor={catInfo.color}
                    />
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  levelCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center" as const,
    marginBottom: 16,
  },
  ringContainer: {
    width: 100,
    height: 100,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 12,
  },
  ringCenter: {
    position: "absolute" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  levelNumber: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    marginTop: -2,
  },
  levelName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  levelStats: {
    flexDirection: "row" as const,
    gap: 20,
    marginTop: 16,
    alignItems: "center" as const,
  },
  levelStat: {
    alignItems: "center" as const,
  },
  levelStatValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  levelStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  levelDivider: {
    width: 1,
    height: 24,
  },
  nextCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  nextHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 12,
  },
  nextLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  nextContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  nextIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  nextInfo: {
    flex: 1,
  },
  nextName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  nextProgress: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  nextTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  nextFill: {
    height: "100%" as const,
    borderRadius: 3,
  },
  nextProgressText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    width: 36,
    textAlign: "right" as const,
  },
  categorySection: {
    marginBottom: 8,
  },
  catHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  catIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  catTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
    flex: 1,
  },
  catCount: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  achievementCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  achievementIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkBadge: {
    position: "absolute" as const,
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  achievementInfo: {
    flex: 1,
    gap: 2,
  },
  achievementHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  achievementName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  pointsLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    marginLeft: 6,
  },
  achievementDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  progressRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 6,
  },
  miniTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden" as const,
  },
  miniFill: {
    height: "100%" as const,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    width: 40,
    textAlign: "right" as const,
  },
});
