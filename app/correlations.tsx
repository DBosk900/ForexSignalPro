import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  withRepeat,
  withTiming,
  useSharedValue,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";

interface CorrelationEntry {
  pair1: string;
  pair2: string;
  correlation: number;
}

interface CorrelationData {
  pairs: string[];
  matrix: CorrelationEntry[];
  dataPoints: Record<string, number>;
}

function getCorrelationColor(value: number): string {
  const abs = Math.abs(value);
  if (value >= 0) {
    if (abs >= 0.8) return "#00D4AA";
    if (abs >= 0.5) return "#4ADE80";
    if (abs >= 0.3) return "#86EFAC";
    return "#1A2540";
  } else {
    if (abs >= 0.8) return "#FF4D6A";
    if (abs >= 0.5) return "#FB7185";
    if (abs >= 0.3) return "#FDA4AF";
    return "#1A2540";
  }
}

function getCorrelationOpacity(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 0.8) return 0.9;
  if (abs >= 0.5) return 0.6;
  if (abs >= 0.3) return 0.35;
  return 0.15;
}

function PulsingCell({ children, strong, style }: { children: React.ReactNode; strong: boolean; style: any }) {
  const pulse = useSharedValue(1);
  React.useEffect(() => {
    if (strong) {
      pulse.value = withRepeat(
        withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [strong]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: strong ? pulse.value : 1 }],
  }));
  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

function CorrelationCell({
  value,
  pair1,
  pair2,
  onPress,
  size,
}: {
  value: number | null;
  pair1: string;
  pair2: string;
  onPress: () => void;
  size: number;
}) {
  const isDiagonal = pair1 === pair2;
  const { colors: C } = useTheme();

  if (isDiagonal) {
    return (
      <View style={[cellStyles.cell, { width: size, height: size, backgroundColor: C.accent + "20" }]}>
        <Text style={[cellStyles.cellText, { color: C.accent, fontSize: 8 }]}>1.00</Text>
      </View>
    );
  }

  if (value === null) {
    return (
      <View style={[cellStyles.cell, { width: size, height: size, backgroundColor: C.backgroundElevated }]}>
        <Text style={[cellStyles.cellText, { color: C.textMuted, fontSize: 7 }]}>--</Text>
      </View>
    );
  }

  const strong = Math.abs(value) >= 0.8;
  const color = getCorrelationColor(value);
  const opacity = getCorrelationOpacity(value);

  return (
    <PulsingCell strong={strong} style={[cellStyles.cell, { width: size, height: size, backgroundColor: color + Math.round(opacity * 255).toString(16).padStart(2, "0") }]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <Text style={[cellStyles.cellText, { color: strong ? "#FFF" : C.textSecondary, fontSize: size > 38 ? 9 : 7, fontFamily: strong ? "Inter_700Bold" : "Inter_500Medium" }]}>
          {value >= 0 ? "+" : ""}{value.toFixed(2)}
        </Text>
      </Pressable>
    </PulsingCell>
  );
}

const cellStyles = StyleSheet.create({
  cell: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "rgba(30,45,69,0.5)",
  },
  cellText: {
    fontFamily: "Inter_600SemiBold",
  },
});

export default function CorrelationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const [selectedPair, setSelectedPair] = useState<{ pair1: string; pair2: string; correlation: number } | null>(null);

  const { data, isLoading, refetch } = useQuery<CorrelationData>({
    queryKey: ["/api/correlations"],
    refetchInterval: 30000,
  });

  const pairs = data?.pairs ?? [];
  const matrix = data?.matrix ?? [];

  const corrMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of matrix) {
      map[`${entry.pair1}|${entry.pair2}`] = entry.correlation;
      map[`${entry.pair2}|${entry.pair1}`] = entry.correlation;
    }
    return map;
  }, [matrix]);

  const getCorrelation = (p1: string, p2: string): number | null => {
    if (p1 === p2) return 1;
    return corrMap[`${p1}|${p2}`] ?? null;
  };

  const strongCorrelations = useMemo(() => {
    return matrix.filter(e => Math.abs(e.correlation) >= 0.7).slice(0, 10);
  }, [matrix]);

  const cellSize = pairs.length > 0 ? Math.max(32, Math.min(44, Math.floor((Platform.OS === "web" ? 360 : 340) / pairs.length))) : 40;
  const labelWidth = 52;

  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: C.background }]}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={[styles.loadingText, { color: C.textSecondary }]}>Caricamento correlazioni...</Text>
      </View>
    );
  }

  if (pairs.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: C.background }]}>
        <Ionicons name="git-network-outline" size={48} color={C.textMuted} />
        <Text style={[styles.emptyTitle, { color: C.text }]}>Dati insufficienti</Text>
        <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
          Servono almeno 5 punti prezzo per calcolare le correlazioni. I dati si accumulano automaticamente dal monitoraggio prezzi.
        </Text>
        <Pressable
          onPress={() => { refetch(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
          style={[styles.retryBtn, { backgroundColor: C.accent + "15", borderColor: C.accent + "30" }]}
        >
          <Ionicons name="refresh" size={16} color={C.accent} />
          <Text style={[styles.retryText, { color: C.accent }]}>Ricarica</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)} style={[styles.infoCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle" size={16} color={C.accent} />
            <Text style={[styles.infoText, { color: C.textSecondary }]}>
              Matrice basata sugli ultimi {Math.max(...Object.values(data?.dataPoints ?? { x: 0 }))} punti prezzo raccolti in tempo reale
            </Text>
          </View>
        </Animated.View>

        <View style={[styles.legendCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
          <Text style={[styles.legendTitle, { color: C.text }]}>Legenda</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#FF4D6A" }]} />
              <Text style={[styles.legendLabel, { color: C.textSecondary }]}>Neg. forte</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#FDA4AF" }]} />
              <Text style={[styles.legendLabel, { color: C.textSecondary }]}>Neg. debole</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: C.backgroundElevated }]} />
              <Text style={[styles.legendLabel, { color: C.textSecondary }]}>Neutro</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#86EFAC" }]} />
              <Text style={[styles.legendLabel, { color: C.textSecondary }]}>Pos. debole</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#00D4AA" }]} />
              <Text style={[styles.legendLabel, { color: C.textSecondary }]}>Pos. forte</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: C.text }]}>Matrice Correlazioni</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.matrixContainer}>
            <View style={styles.matrixRow}>
              <View style={{ width: labelWidth }} />
              {pairs.map((pair) => (
                <View key={`h-${pair}`} style={[styles.headerCell, { width: cellSize }]}>
                  <Text style={[styles.headerText, { color: C.textMuted, fontSize: pairs.length > 12 ? 6 : 7 }]} numberOfLines={1}>
                    {pair.replace("/USD", "").replace("USD/", "")}
                  </Text>
                </View>
              ))}
            </View>
            {pairs.map((rowPair) => (
              <View key={`r-${rowPair}`} style={styles.matrixRow}>
                <View style={[styles.rowLabel, { width: labelWidth }]}>
                  <Text style={[styles.rowLabelText, { color: C.textSecondary, fontSize: pairs.length > 12 ? 7 : 8 }]} numberOfLines={1}>
                    {rowPair.replace("/USD", "").replace("USD/", "")}
                  </Text>
                </View>
                {pairs.map((colPair) => (
                  <CorrelationCell
                    key={`${rowPair}-${colPair}`}
                    value={getCorrelation(rowPair, colPair)}
                    pair1={rowPair}
                    pair2={colPair}
                    size={cellSize}
                    onPress={() => {
                      if (rowPair !== colPair) {
                        const corr = getCorrelation(rowPair, colPair);
                        if (corr !== null) {
                          setSelectedPair({ pair1: rowPair, pair2: colPair, correlation: corr });
                        }
                      }
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>

        {strongCorrelations.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: C.text, marginTop: 24 }]}>Correlazioni Forti</Text>
            {strongCorrelations.map((entry, idx) => {
              const color = getCorrelationColor(entry.correlation);
              const isPositive = entry.correlation >= 0;
              return (
                <Animated.View key={`${entry.pair1}-${entry.pair2}`} entering={FadeIn.delay(idx * 50)}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedPair(entry);
                    }}
                    style={[styles.strongCard, { backgroundColor: C.backgroundCard, borderColor: color + "40" }]}
                  >
                    <View style={styles.strongCardLeft}>
                      <View style={[styles.corrIcon, { backgroundColor: color + "20" }]}>
                        <Ionicons
                          name={isPositive ? "arrow-up" : "arrow-down"}
                          size={16}
                          color={color}
                        />
                      </View>
                      <View>
                        <Text style={[styles.strongPairs, { color: C.text }]}>
                          {entry.pair1} + {entry.pair2}
                        </Text>
                        <Text style={[styles.strongLabel, { color: C.textMuted }]}>
                          {isPositive ? "Correlazione positiva" : "Correlazione negativa"}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.corrBadge, { backgroundColor: color + "20", borderColor: color + "40" }]}>
                      <Text style={[styles.corrBadgeText, { color }]}>
                        {entry.correlation >= 0 ? "+" : ""}{entry.correlation.toFixed(2)}
                      </Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal
        visible={selectedPair !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPair(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedPair(null)}
        >
          <View style={[styles.modalCard, { backgroundColor: C.backgroundCard, borderColor: C.border }]}>
            {selectedPair && (() => {
              const color = getCorrelationColor(selectedPair.correlation);
              const isPositive = selectedPair.correlation >= 0;
              const abs = Math.abs(selectedPair.correlation);
              let strengthLabel = "debole";
              if (abs >= 0.9) strengthLabel = "molto forte";
              else if (abs >= 0.8) strengthLabel = "forte";
              else if (abs >= 0.6) strengthLabel = "moderata";
              return (
                <>
                  <View style={[styles.modalIcon, { backgroundColor: color + "20" }]}>
                    <Ionicons name={isPositive ? "trending-up" : "trending-down"} size={32} color={color} />
                  </View>
                  <Text style={[styles.modalPairs, { color: C.text }]}>
                    {selectedPair.pair1} + {selectedPair.pair2}
                  </Text>
                  <Text style={[styles.modalCorr, { color }]}>
                    {selectedPair.correlation >= 0 ? "+" : ""}{selectedPair.correlation.toFixed(4)} correlazione
                  </Text>
                  <Text style={[styles.modalDesc, { color: C.textSecondary }]}>
                    Correlazione {isPositive ? "positiva" : "negativa"} {strengthLabel}.{" "}
                    {isPositive
                      ? "Queste coppie tendono a muoversi nella stessa direzione."
                      : "Queste coppie tendono a muoversi in direzioni opposte."}
                  </Text>
                  {abs >= 0.8 && (
                    <View style={[styles.modalWarning, { backgroundColor: "#FFB34715", borderColor: "#FFB34730" }]}>
                      <Ionicons name="warning" size={14} color="#FFB347" />
                      <Text style={[styles.modalWarningText, { color: "#FFB347" }]}>
                        Attenzione: evita posizioni nella stessa direzione su coppie fortemente correlate per ridurre il rischio.
                      </Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => setSelectedPair(null)}
                    style={[styles.modalClose, { backgroundColor: C.backgroundElevated }]}
                  >
                    <Ionicons name="close" size={20} color={C.text} />
                  </Pressable>
                </>
              );
            })()}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  retryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  legendCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  legendTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 10,
  },
  matrixContainer: {
    paddingHorizontal: 16,
  },
  matrixRow: {
    flexDirection: "row",
  },
  headerCell: {
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 4,
    height: 28,
  },
  headerText: {
    fontFamily: "Inter_600SemiBold",
    transform: [{ rotate: "-45deg" }],
  },
  rowLabel: {
    justifyContent: "center",
    paddingRight: 4,
  },
  rowLabelText: {
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
  },
  strongCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  strongCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  corrIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  strongPairs: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  strongLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  corrBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  corrBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  modalPairs: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    marginBottom: 6,
  },
  modalCorr: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    marginBottom: 12,
  },
  modalDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 14,
  },
  modalWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalWarningText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
});
