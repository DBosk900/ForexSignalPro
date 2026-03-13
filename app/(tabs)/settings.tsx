import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/contexts/ThemeContext";
import { setupNotifications, registerBackgroundFetch, unregisterBackgroundFetch, NOTIF_CATEGORIES } from "@/lib/notifications";
import { getApiUrl } from "@/lib/query-client";
import { getDashboardConfig, saveDashboardConfig, getDefaultSections, DashboardSection } from "@/lib/dashboardConfig";

const NOTIF_KEY = "notifications_enabled";

function NotificationRow() {
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIF_KEY).then((val) => {
      setEnabled(val !== "false");
    });
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await AsyncStorage.setItem(NOTIF_KEY, next ? "true" : "false");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== "web") {
      if (next) {
        const granted = await setupNotifications();
        if (granted) await registerBackgroundFetch();
      } else {
        await unregisterBackgroundFetch();
      }
    }
  };

  return (
    <View style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: "rgba(255,77,106,0.12)" }]}>
        <Ionicons name="notifications" size={20} color={colors.sell} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>Notifiche Push</Text>
        <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
          Segnali forti ed eventi ad alto impatto
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ false: colors.border, true: colors.accent + "60" }}
        thumbColor={enabled ? colors.accent : colors.textMuted}
      />
    </View>
  );
}

function NotifCategoryRow({ storageKey, icon, label, description }: { storageKey: string; icon: string; label: string; description: string }) {
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((val) => {
      setEnabled(val !== "false");
    });
  }, [storageKey]);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await AsyncStorage.setItem(storageKey, next ? "true" : "false");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.subRow, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
      <Ionicons name={icon as any} size={16} color={colors.textSecondary} />
      <View style={styles.rowInfo}>
        <Text style={[styles.subRowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.subRowDesc, { color: colors.textMuted }]}>{description}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={toggle}
        trackColor={{ false: colors.border, true: colors.accent + "60" }}
        thumbColor={enabled ? colors.accent : colors.textMuted}
        style={{ transform: [{ scale: 0.85 }] }}
      />
    </View>
  );
}

function ThemeRow() {
  const { mode, toggleTheme, isAutoTheme, setAutoTheme, colors } = useTheme();
  return (
    <View>
      <View style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
        <View style={[styles.rowIcon, { backgroundColor: "rgba(99,102,241,0.15)" }]}>
          <Ionicons name="phone-portrait-outline" size={20} color="#818CF8" />
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Tema Automatico</Text>
          <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
            Segue il tema di sistema iOS/Android
          </Text>
        </View>
        <Switch
          value={isAutoTheme}
          onValueChange={(val) => {
            setAutoTheme(val);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          trackColor={{ false: colors.border, true: colors.accent + "60" }}
          thumbColor={isAutoTheme ? colors.accent : colors.textMuted}
        />
      </View>
      {!isAutoTheme && (
        <Pressable
          onPress={() => {
            toggleTheme();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: mode === "dark" ? "rgba(99,102,241,0.15)" : "rgba(255,179,71,0.15)" }]}>
            <Ionicons name={mode === "dark" ? "moon" : "sunny"} size={20} color={mode === "dark" ? "#818CF8" : "#FFB347"} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Tema Manuale</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              {mode === "dark" ? "Scuro" : "Chiaro"} — tocca per cambiare
            </Text>
          </View>
          <View style={[styles.toggle, { backgroundColor: mode === "dark" ? colors.accent : colors.textMuted }]}>
            <View style={[styles.toggleKnob, { alignSelf: mode === "dark" ? "flex-end" as const : "flex-start" as const }]} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function ExportRow() {
  const { colors } = useTheme();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = new URL("/api/history", getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Errore nel recupero dello storico");
      const data: any[] = await res.json();

      const header = "Data,Coppia,Azione,Esito,Pip,Confidenza,Timeframe\n";
      const rows = data.map((s: any) => {
        const date = new Date(s.createdAt || s.timestamp).toLocaleDateString("it-IT");
        const outcome = s.outcome === "hit_sl" ? "Stop Loss" : s.outcome?.replace("hit_tp", "TP") ?? "In corso";
        return `${date},${s.pair},${s.action},${outcome},${s.pipResult ?? 0},${s.confidence ?? ""}%,${s.timeframe ?? ""}`;
      }).join("\n");

      const csv = header + rows;

      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "segnali_storico.csv";
        a.click();
      } else {
        const fileName = `${FileSystem.documentDirectory}segnali_storico_${Date.now()}.csv`;
        await FileSystem.writeAsStringAsync(fileName, csv, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileName, { mimeType: "text/csv", dialogTitle: "Esporta Storico Segnali" });
        } else {
          Alert.alert("Condivisione non disponibile", "La condivisione non è supportata su questo dispositivo.");
        }
      }
    } catch (err: any) {
      Alert.alert("Errore", "Impossibile esportare lo storico: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Pressable
      onPress={handleExport}
      style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: "rgba(0,212,170,0.12)" }]}>
        <Ionicons name={exporting ? "hourglass-outline" : "download-outline"} size={20} color={colors.accent} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>Esporta Storico</Text>
        <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
          {exporting ? "Preparazione file CSV..." : "Scarica tutti i segnali in CSV"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}


function DashboardPersonalizer() {
  const { colors } = useTheme();
  const [sections, setSections] = useState<DashboardSection[]>(getDefaultSections());

  useEffect(() => {
    getDashboardConfig().then(setSections);
  }, []);

  const toggleSection = (key: string) => {
    const updated = sections.map(s => s.key === key ? { ...s, visible: !s.visible } : s);
    setSections(updated);
    saveDashboardConfig(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const updated = [...sections];
    [updated[index], updated[swapIdx]] = [updated[swapIdx], updated[index]];
    setSections(updated);
    saveDashboardConfig(updated);
    Haptics.selectionAsync();
  };

  const resetDefaults = () => {
    const defaults = getDefaultSections();
    setSections(defaults);
    saveDashboardConfig(defaults);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View>
      {sections.map((s, i) => (
        <View
          key={s.key}
          style={[styles.subRow, { backgroundColor: colors.backgroundCard, borderColor: colors.border, opacity: s.visible ? 1 : 0.5 }]}
        >
          <Ionicons name={s.icon as any} size={16} color={s.visible ? colors.accent : colors.textMuted} />
          <View style={styles.rowInfo}>
            <Text style={[styles.subRowLabel, { color: colors.text }]}>{s.label}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Pressable onPress={() => moveSection(i, "up")} hitSlop={6} disabled={i === 0}>
              <Ionicons name="chevron-up" size={16} color={i === 0 ? colors.border : colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => moveSection(i, "down")} hitSlop={6} disabled={i === sections.length - 1}>
              <Ionicons name="chevron-down" size={16} color={i === sections.length - 1 ? colors.border : colors.textMuted} />
            </Pressable>
            <Switch
              value={s.visible}
              onValueChange={() => toggleSection(s.key)}
              trackColor={{ false: colors.border, true: colors.accent + "60" }}
              thumbColor={s.visible ? colors.accent : colors.textMuted}
              style={{ transform: [{ scale: 0.75 }] }}
            />
          </View>
        </View>
      ))}
      <Pressable
        onPress={resetDefaults}
        style={[styles.subRow, { backgroundColor: colors.backgroundCard, borderColor: colors.border, justifyContent: "center" }]}
      >
        <Ionicons name="refresh" size={14} color={colors.textMuted} />
        <Text style={[styles.subRowDesc, { color: colors.textMuted }]}>Ripristina ordine predefinito</Text>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const handleResetOnboarding = () => {
    Alert.alert("Reset Onboarding", "Vuoi rivedere la schermata di benvenuto al prossimo avvio?", [
      { text: "Annulla", style: "cancel" },
      {
        text: "Reset",
        onPress: () => {
          AsyncStorage.removeItem("onboarding_completed");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Impostazioni</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>ASPETTO</Text>
        </View>
        <ThemeRow />

        <View style={styles.sectionHeader}>
          <Ionicons name="notifications-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>NOTIFICHE</Text>
        </View>
        <NotificationRow />
        <NotifCategoryRow
          storageKey={NOTIF_CATEGORIES.signals}
          icon="trending-up"
          label="Segnali di Trading"
          description="Nuovi segnali con confidenza >80% e esiti TP/SL"
        />
        <NotifCategoryRow
          storageKey={NOTIF_CATEGORIES.calendar}
          icon="calendar-outline"
          label="Eventi Economici"
          description="Eventi ad alto impatto entro 30 minuti"
        />
        <NotifCategoryRow
          storageKey={NOTIF_CATEGORIES.prices}
          icon="pulse-outline"
          label="Avvisi Prezzo"
          description="Prezzo vicino al Take Profit o Stop Loss"
        />

        <View style={styles.sectionHeader}>
          <Ionicons name="options-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>PERSONALIZZA DASHBOARD</Text>
        </View>
        <DashboardPersonalizer />

        <View style={styles.sectionHeader}>
          <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DATI E EXPORT</Text>
        </View>
        <ExportRow />

        <View style={styles.sectionHeader}>
          <Ionicons name="apps-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>STRUMENTI</Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/calendar");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(255,77,106,0.12)" }]}>
            <Ionicons name="calendar" size={20} color={colors.sell} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Calendario Economico</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Eventi macro e impatto sui segnali
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/history");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(0,212,170,0.12)" }]}>
            <Ionicons name="time" size={20} color={colors.accent} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Storico Segnali</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Performance e segnali passati
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/coach");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(0,212,170,0.12)" }]}>
            <Ionicons name="sparkles" size={20} color={colors.accent} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Coach IA di Trading</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Chiedi analisi e consigli all'IA
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/strength");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(129,140,248,0.15)" }]}>
            <Ionicons name="bar-chart" size={20} color="#818CF8" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Forza Valute</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Forza relativa delle 8 valute principali
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/achievements");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
            <Ionicons name="trophy" size={20} color="#FBBF24" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Traguardi</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Badge, livelli e progressi
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/journal");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(129,140,248,0.15)" }]}>
            <Ionicons name="book" size={20} color="#818CF8" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Diario di Trading IA</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Analisi pattern, punti deboli e suggerimenti
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/simulator");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(0,212,170,0.12)" }]}>
            <Ionicons name="wallet" size={20} color={colors.accent} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Simulatore</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Paper trading con bilancio virtuale
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/report");
          }}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
            <Ionicons name="stats-chart" size={20} color="#FBBF24" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Report Performance</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Pagella settimanale e mensile con IA
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>APP</Text>
        </View>
        <Pressable
          onPress={handleResetOnboarding}
          style={[styles.row, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}
        >
          <View style={[styles.rowIcon, { backgroundColor: "rgba(99,102,241,0.15)" }]}>
            <Ionicons name="refresh" size={20} color="#818CF8" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Rivedi Onboarding</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              Mostra la schermata di benvenuto
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>

        <View style={styles.versionContainer}>
          <Ionicons name="analytics" size={24} color={colors.textMuted} />
          <Text style={[styles.versionTitle, { color: colors.textMuted }]}>Trading Signals</Text>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>v1.0.0</Text>
          <Text style={[styles.versionSub, { color: colors.textMuted }]}>
            Powered by AI (GPT-4o-mini)
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  content: { paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 20, marginBottom: 10, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowInfo: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowValue: { fontSize: 12, fontFamily: "Inter_400Regular" },
  toggle: { width: 48, height: 26, borderRadius: 13, padding: 3, justifyContent: "center" },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFFFFF" },
  versionContainer: { alignItems: "center", marginTop: 40, gap: 4 },
  versionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 8 },
  versionText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  versionSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 6,
    marginLeft: 20,
  },
  subRowLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  subRowDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
