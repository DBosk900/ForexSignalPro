import AsyncStorage from "@react-native-async-storage/async-storage";

const DASHBOARD_CONFIG_KEY = "dashboard_sections_config";

export interface DashboardSection {
  key: string;
  label: string;
  icon: string;
  visible: boolean;
}

const DEFAULT_SECTIONS: DashboardSection[] = [
  { key: "morning", label: "Morning Briefing", icon: "sunny-outline", visible: true },
  { key: "heatmap", label: "Heatmap Sentiment", icon: "grid-outline", visible: true },
  { key: "sentiment", label: "Market Sentiment", icon: "pulse-outline", visible: true },
  { key: "portfolio", label: "Portafoglio", icon: "pie-chart-outline", visible: true },
  { key: "risk", label: "Risk Dashboard", icon: "shield-half-outline", visible: true },
  { key: "performance", label: "Performance", icon: "stats-chart-outline", visible: true },
  { key: "daily", label: "Riepilogo Giornaliero", icon: "today-outline", visible: true },
];

export function getDefaultSections(): DashboardSection[] {
  return DEFAULT_SECTIONS.map(s => ({ ...s }));
}

export async function getDashboardConfig(): Promise<DashboardSection[]> {
  try {
    const raw = await AsyncStorage.getItem(DASHBOARD_CONFIG_KEY);
    if (raw) {
      const saved: DashboardSection[] = JSON.parse(raw);
      const savedKeys = new Set(saved.map(s => s.key));
      const merged = [...saved];
      for (const def of DEFAULT_SECTIONS) {
        if (!savedKeys.has(def.key)) merged.push({ ...def });
      }
      return merged;
    }
  } catch {}
  return getDefaultSections();
}

export async function saveDashboardConfig(config: DashboardSection[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DASHBOARD_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}
