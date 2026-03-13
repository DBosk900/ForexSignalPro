import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ entry?: string; sl?: string; pair?: string }>();
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("2");
  const [entry, setEntry] = useState(params.entry ?? "1.0845");
  const [sl, setSl] = useState(params.sl ?? "1.0790");

  const pairName = params.pair ?? "EUR/USD";
  const isJpy = pairName.includes("JPY");
  const isLargePrice = parseFloat(entry) > 100;

  const calc = useMemo(() => {
    const bal = parseFloat(balance) || 0;
    const risk = parseFloat(riskPct) || 0;
    const entryP = parseFloat(entry) || 0;
    const slP = parseFloat(sl) || 0;

    if (bal <= 0 || risk <= 0 || entryP <= 0 || slP <= 0 || entryP === slP) {
      return null;
    }

    const riskAmount = bal * (risk / 100);
    const slDistance = Math.abs(entryP - slP);

    let pipValue: number;
    let pipSize: number;
    let slPips: number;

    if (isLargePrice) {
      pipSize = isJpy ? 0.01 : (entryP > 500 ? 1.0 : 0.1);
      slPips = slDistance / pipSize;
      pipValue = 10;
    } else {
      pipSize = isJpy ? 0.01 : 0.0001;
      slPips = slDistance / pipSize;
      pipValue = isJpy ? (1000 / entryP) : 10;
    }

    if (slPips <= 0) return null;

    const lots = riskAmount / (slPips * pipValue);
    const units = lots * 100000;

    return {
      riskAmount: riskAmount.toFixed(2),
      slPips: slPips.toFixed(1),
      lots: lots.toFixed(3),
      microLots: (lots * 100).toFixed(1),
      units: Math.round(units).toLocaleString(),
      pipValue: pipValue.toFixed(2),
      rr: slDistance > 0 ? "1:" + (slDistance / slDistance).toFixed(1) : "N/A",
    };
  }, [balance, riskPct, entry, sl, isJpy, isLargePrice]);

  const presets = [1, 2, 3, 5];

  return (
    <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomInset + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Animated.View entering={FadeInDown.springify()} style={styles.pairHeader}>
            <Ionicons name="calculator-outline" size={24} color={Colors.dark.accent} />
            <Text style={styles.pairTitle}>{pairName}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).springify()} style={[styles.card, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.border }]}>
            <Text style={styles.cardTitle}>PARAMETRI CONTO</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Capitale ($)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.dark.backgroundElevated, color: Colors.dark.text, borderColor: Colors.dark.border }]}
                value={balance}
                onChangeText={setBalance}
                keyboardType="numeric"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Rischio (%)</Text>
              <View style={styles.riskRow}>
                {presets.map(p => (
                  <Pressable
                    key={p}
                    onPress={() => setRiskPct(String(p))}
                    style={[
                      styles.presetBtn,
                      {
                        backgroundColor: riskPct === String(p) ? Colors.dark.accent + "20" : Colors.dark.backgroundElevated,
                        borderColor: riskPct === String(p) ? Colors.dark.accent : Colors.dark.border,
                      },
                    ]}
                  >
                    <Text style={[styles.presetText, { color: riskPct === String(p) ? Colors.dark.accent : Colors.dark.textSecondary }]}>
                      {p}%
                    </Text>
                  </Pressable>
                ))}
                <TextInput
                  style={[styles.inputSmall, { backgroundColor: Colors.dark.backgroundElevated, color: Colors.dark.text, borderColor: Colors.dark.border }]}
                  value={riskPct}
                  onChangeText={setRiskPct}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify()} style={[styles.card, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.border }]}>
            <Text style={styles.cardTitle}>PREZZI</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Entry Price</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.dark.backgroundElevated, color: Colors.dark.text, borderColor: Colors.dark.border }]}
                value={entry}
                onChangeText={setEntry}
                keyboardType="numeric"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Stop Loss</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.dark.backgroundElevated, color: Colors.dark.sell, borderColor: Colors.dark.sellBorder }]}
                value={sl}
                onChangeText={setSl}
                keyboardType="numeric"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>
          </Animated.View>

          {calc ? (
            <Animated.View entering={FadeInDown.delay(180).springify()} style={[styles.resultsCard, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.accent + "40" }]}>
              <Text style={[styles.cardTitle, { color: Colors.dark.accent }]}>RISULTATO</Text>

              <View style={styles.resultRow}>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Rischio ($)</Text>
                  <Text style={[styles.resultValue, { color: Colors.dark.sell }]}>${calc.riskAmount}</Text>
                </View>
                <View style={styles.resultDivider} />
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Distanza SL</Text>
                  <Text style={[styles.resultValue, { color: Colors.dark.text }]}>{calc.slPips} pip</Text>
                </View>
              </View>

              <View style={styles.mainResult}>
                <Text style={styles.mainResultLabel}>Position Size</Text>
                <Text style={styles.mainResultValue}>{calc.lots}</Text>
                <Text style={styles.mainResultUnit}>Lotti standard</Text>
              </View>

              <View style={styles.resultRow}>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Micro Lotti</Text>
                  <Text style={[styles.resultValue, { color: Colors.dark.textSecondary }]}>{calc.microLots}</Text>
                </View>
                <View style={styles.resultDivider} />
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Unita'</Text>
                  <Text style={[styles.resultValue, { color: Colors.dark.textSecondary }]}>{calc.units}</Text>
                </View>
                <View style={styles.resultDivider} />
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Pip Value</Text>
                  <Text style={[styles.resultValue, { color: Colors.dark.textSecondary }]}>${calc.pipValue}</Text>
                </View>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(180).springify()} style={[styles.card, { backgroundColor: Colors.dark.backgroundCard, borderColor: Colors.dark.border, alignItems: "center" as const, paddingVertical: 24 }]}>
              <Ionicons name="warning-outline" size={32} color={Colors.dark.textMuted} />
              <Text style={[styles.resultLabel, { marginTop: 8 }]}>Inserisci valori validi per calcolare</Text>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(240).springify()} style={[styles.disclaimer, { backgroundColor: Colors.dark.backgroundElevated, borderColor: Colors.dark.border }]}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.dark.textMuted} />
            <Text style={styles.disclaimerText}>
              Il calcolo assume un lotto standard = 100.000 unita'. Verifica i requisiti del tuo broker.
            </Text>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  pairHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  pairTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.dark.text },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  cardTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5, color: Colors.dark.textSecondary, marginBottom: 2 },
  inputRow: { gap: 6 },
  inputLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  inputSmall: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, fontFamily: "Inter_600SemiBold", width: 54, textAlign: "center" as const },
  riskRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  presetBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  presetText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  resultsCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 16 },
  resultRow: { flexDirection: "row", alignItems: "center" },
  resultItem: { flex: 1, alignItems: "center", gap: 4 },
  resultDivider: { width: 1, height: 30, backgroundColor: Colors.dark.border },
  resultLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted },
  resultValue: { fontSize: 15, fontFamily: "Inter_700Bold" },
  mainResult: { alignItems: "center", paddingVertical: 12, backgroundColor: Colors.dark.accent + "10", borderRadius: 12, gap: 2 },
  mainResultLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.dark.textMuted },
  mainResultValue: { fontSize: 36, fontFamily: "Inter_700Bold", color: Colors.dark.accent },
  mainResultUnit: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.dark.textSecondary },
  disclaimer: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1 },
  disclaimerText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.dark.textMuted, lineHeight: 16 },
});
