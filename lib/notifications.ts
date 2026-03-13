import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import Constants from "expo-constants";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";

const NOTIF_KEY = "notifications_enabled";
const NOTIF_SIGNALS_KEY = "notif_signals_enabled";
const NOTIF_CALENDAR_KEY = "notif_calendar_enabled";
const NOTIF_PRICES_KEY = "notif_prices_enabled";

const SIGNAL_CHANNEL_ID = "trading-signals";
const CALENDAR_CHANNEL_ID = "calendar-events";
const PRICE_CHANNEL_ID = "price-alerts";

const STORAGE_SIGNAL_IDS = "notif_last_signal_ids";
const STORAGE_CALENDAR_IDS = "notif_last_calendar_ids";
const STORAGE_OUTCOME_IDS = "notif_last_outcome_ids";
const STORAGE_PROXIMITY_IDS = "notif_last_proximity_ids";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let lastSignalIds: Set<string> = new Set();
let lastCalendarNotified: Set<string> = new Set();
let lastOutcomeNotified: Set<string> = new Set();
let lastProximityNotified: Set<string> = new Set();
let trackingSetsLoaded = false;

async function loadTrackingSets() {
  if (trackingSetsLoaded) return;
  try {
    const [signalRaw, calendarRaw, outcomeRaw, proximityRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_SIGNAL_IDS),
      AsyncStorage.getItem(STORAGE_CALENDAR_IDS),
      AsyncStorage.getItem(STORAGE_OUTCOME_IDS),
      AsyncStorage.getItem(STORAGE_PROXIMITY_IDS),
    ]);
    if (signalRaw) lastSignalIds = new Set(JSON.parse(signalRaw));
    if (calendarRaw) lastCalendarNotified = new Set(JSON.parse(calendarRaw));
    if (outcomeRaw) lastOutcomeNotified = new Set(JSON.parse(outcomeRaw));
    if (proximityRaw) lastProximityNotified = new Set(JSON.parse(proximityRaw));
    trackingSetsLoaded = true;
  } catch {
    trackingSetsLoaded = true;
  }
}

async function persistTrackingSets() {
  try {
    const maxSize = 200;
    const trimSet = (s: Set<string>) => {
      if (s.size <= maxSize) return s;
      const arr = Array.from(s);
      return new Set(arr.slice(arr.length - maxSize));
    };
    lastSignalIds = trimSet(lastSignalIds);
    lastCalendarNotified = trimSet(lastCalendarNotified);
    lastOutcomeNotified = trimSet(lastOutcomeNotified);
    lastProximityNotified = trimSet(lastProximityNotified);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_SIGNAL_IDS, JSON.stringify(Array.from(lastSignalIds))),
      AsyncStorage.setItem(STORAGE_CALENDAR_IDS, JSON.stringify(Array.from(lastCalendarNotified))),
      AsyncStorage.setItem(STORAGE_OUTCOME_IDS, JSON.stringify(Array.from(lastOutcomeNotified))),
      AsyncStorage.setItem(STORAGE_PROXIMITY_IDS, JSON.stringify(Array.from(lastProximityNotified))),
    ]);
  } catch {
  }
}

async function registerPushToken() {
  try {
    const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
    const fallbackProjectId = Constants.easConfig?.projectId;
    const projectId = (easProjectId && typeof easProjectId === "string" && easProjectId.length > 0)
      ? easProjectId
      : (fallbackProjectId && typeof fallbackProjectId === "string" && fallbackProjectId.length > 0)
      ? fallbackProjectId
      : null;

    if (!projectId) {
      console.log("Push token: nessun EAS projectId configurato. Background fetch attivo come alternativa (Android).");
      return;
    }

    const tokenObj = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenObj.data;
    if (token) {
      await apiRequest("POST", "/api/push-token", { token });
      console.log("Push token registrato:", token.substring(0, 20) + "...");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("projectId") || msg.includes("not configured")) {
      console.log("Push token: EAS non configurato in questo ambiente. Background fetch attivo come alternativa.");
    } else {
      console.log("Push token registrazione fallita:", msg);
    }
  }
}

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(SIGNAL_CHANNEL_ID, {
      name: "Segnali di Trading",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      bypassDnd: true,
    });
    await Notifications.setNotificationChannelAsync(CALENDAR_CHANNEL_ID, {
      name: "Eventi Economici",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(PRICE_CHANNEL_ID, {
      name: "Avvisi Prezzo",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
    });
  }

  await loadTrackingSets();
  await registerPushToken();
  await registerBackgroundFetch();

  return true;
}

interface Signal {
  id: string;
  pair: string;
  action: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  strength: number;
}

interface CalendarEvent {
  id: string;
  event: string;
  time: string;
  impact: string;
  currencies: string[];
}

interface HistoryItem {
  id: string;
  pair: string;
  action: string;
  outcome: string;
  pipResult: number;
  createdAt: string;
}

interface TVQuote {
  pair: string;
  price: number;
  change: number;
}

export async function sendSignalNotification(signal: Signal) {
  const actionLabel = signal.action === "BUY" ? "ACQUISTA" : signal.action === "SELL" ? "VENDI" : "MANTIENI";
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${actionLabel} ${signal.pair}`,
      body: `Confidenza ${signal.confidence}% · Prezzo ${signal.entryPrice}`,
      data: { type: "signal", signalId: signal.id, pair: signal.pair },
      sound: "default",
      ...(Platform.OS === "android" && { channelId: SIGNAL_CHANNEL_ID }),
    },
    trigger: null,
  });
}

export async function sendCalendarNotification(event: CalendarEvent) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Evento ad alto impatto`,
      body: `${event.event} · ${event.time} UTC · ${event.currencies.join(", ")}`,
      data: { type: "calendar", eventId: event.id },
      sound: "default",
      ...(Platform.OS === "android" && { channelId: CALENDAR_CHANNEL_ID }),
    },
    trigger: null,
  });
}

async function sendOutcomeNotification(item: HistoryItem) {
  const winOutcomes = ["hit_tp", "hit_tp3", "hit_tp2_then_sl", "hit_tp1_then_sl"];
  const isWin = winOutcomes.includes(item.outcome);
  const tpLabel = item.outcome === "hit_tp3" ? "TP3 Completo" : item.outcome === "hit_tp2_then_sl" ? "TP2 Raggiunto" : item.outcome === "hit_tp1_then_sl" ? "TP1 Raggiunto" : isWin ? "TP Raggiunto" : "SL Colpito";
  const title = isWin ? `${tpLabel} ${item.pair}` : `SL Colpito ${item.pair}`;
  const pipsText = item.pipResult >= 0 ? `+${item.pipResult}` : `${item.pipResult}`;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: `${item.action} ${item.pair} · ${pipsText} pip${isWin ? " di profitto" : ""}`,
      data: { type: "outcome", pair: item.pair },
      sound: "default",
      ...(Platform.OS === "android" && { channelId: PRICE_CHANNEL_ID }),
    },
    trigger: null,
  });
}

async function sendProximityNotification(signal: Signal, livePrice: number, target: "TP" | "SL") {
  const targetLabel = target === "TP" ? "Take Profit" : "Stop Loss";
  const targetPrice = target === "TP" ? signal.takeProfit : signal.stopLoss;
  const pipDiff = Math.abs(livePrice - targetPrice);
  const isMajor = signal.pair.includes("JPY");
  const pips = isMajor ? pipDiff * 100 : pipDiff * 10000;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${signal.pair} vicino al ${targetLabel}`,
      body: `Prezzo attuale ${livePrice.toFixed(isMajor ? 3 : 5)} · ${Math.round(pips)} pip dal ${targetLabel}`,
      data: { type: "proximity", pair: signal.pair, signalId: signal.id },
      sound: "default",
      ...(Platform.OS === "android" && { channelId: PRICE_CHANNEL_ID }),
    },
    trigger: null,
  });
}

async function areNotificationsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_KEY);
    return val !== "false";
  } catch {
    return true;
  }
}

async function isCategoryEnabled(key: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(key);
    return val !== "false";
  } catch {
    return true;
  }
}

export async function checkForNewSignals() {
  try {
    if (!(await areNotificationsEnabled())) return;
    if (!(await isCategoryEnabled(NOTIF_SIGNALS_KEY))) return;

    await loadTrackingSets();

    const baseUrl = getApiUrl();
    const signalsUrl = new URL("/api/signals", baseUrl).toString();
    const response = await fetch(signalsUrl);
    if (!response.ok) return;
    const signals: Signal[] = await response.json();

    const highConfidence = signals.filter((s) => s.confidence >= 80);

    for (const signal of highConfidence) {
      if (!lastSignalIds.has(signal.id)) {
        await sendSignalNotification(signal);
      }
    }

    lastSignalIds = new Set(signals.map((s) => s.id));
    await persistTrackingSets();
  } catch (err) {
    console.error("Signal check error:", err);
  }
}

export async function checkForCalendarEvents() {
  try {
    if (!(await areNotificationsEnabled())) return;
    if (!(await isCategoryEnabled(NOTIF_CALENDAR_KEY))) return;

    await loadTrackingSets();

    const baseUrl = getApiUrl();
    const calendarUrl = new URL("/api/calendar", baseUrl).toString();
    const response = await fetch(calendarUrl);
    if (!response.ok) return;
    const events: CalendarEvent[] = await response.json();

    const now = new Date();
    const highImpact = events.filter((e) => e.impact === "HIGH");

    for (const event of highImpact) {
      const [hours, minutes] = event.time.split(":").map(Number);
      const eventTime = new Date();
      eventTime.setUTCHours(hours, minutes, 0, 0);

      const diffMinutes = (eventTime.getTime() - now.getTime()) / 60000;

      if (diffMinutes > 0 && diffMinutes <= 30 && !lastCalendarNotified.has(event.id)) {
        await sendCalendarNotification(event);
        lastCalendarNotified.add(event.id);
      }
    }

    await persistTrackingSets();
  } catch (err) {
    console.error("Calendar check error:", err);
  }
}

export async function checkForOutcomes() {
  try {
    if (!(await areNotificationsEnabled())) return;
    if (!(await isCategoryEnabled(NOTIF_SIGNALS_KEY))) return;

    await loadTrackingSets();

    const baseUrl = getApiUrl();
    const historyUrl = new URL("/api/history", baseUrl).toString();
    const response = await fetch(historyUrl);
    if (!response.ok) return;
    const history: HistoryItem[] = await response.json();

    const winOutcomes = ["hit_tp", "hit_tp3", "hit_tp2_then_sl", "hit_tp1_then_sl"];
    const recent = history.filter((h) => {
      const age = Date.now() - new Date(h.createdAt).getTime();
      return age < 3600000 && (winOutcomes.includes(h.outcome) || h.outcome === "hit_sl");
    });

    for (const item of recent) {
      if (!lastOutcomeNotified.has(item.id)) {
        await sendOutcomeNotification(item);
        lastOutcomeNotified.add(item.id);
      }
    }

    await persistTrackingSets();
  } catch (err) {
    console.error("Outcome check error:", err);
  }
}

export async function checkForPriceProximity() {
  try {
    if (!(await areNotificationsEnabled())) return;
    if (!(await isCategoryEnabled(NOTIF_PRICES_KEY))) return;

    await loadTrackingSets();

    const baseUrl = getApiUrl();
    const [signalsRes, quotesRes] = await Promise.all([
      fetch(new URL("/api/signals", baseUrl).toString()),
      fetch(new URL("/api/quotes?market=forex", baseUrl).toString()),
    ]);
    if (!signalsRes.ok || !quotesRes.ok) return;

    const signals: Signal[] = await signalsRes.json();
    const quotes: TVQuote[] = await quotesRes.json();

    const quoteMap: Record<string, number> = {};
    for (const q of quotes) quoteMap[q.pair] = q.price;

    for (const signal of signals) {
      if (signal.action === "HOLD") continue;
      const livePrice = quoteMap[signal.pair];
      if (!livePrice) continue;

      const tpDistance = Math.abs(signal.takeProfit - signal.entryPrice);
      const slDistance = Math.abs(signal.stopLoss - signal.entryPrice);
      const priceToTp = Math.abs(livePrice - signal.takeProfit);
      const priceToSl = Math.abs(livePrice - signal.stopLoss);

      const tpProximityKey = `tp-${signal.id}`;
      const slProximityKey = `sl-${signal.id}`;

      if (priceToTp < tpDistance * 0.3 && !lastProximityNotified.has(tpProximityKey)) {
        await sendProximityNotification(signal, livePrice, "TP");
        lastProximityNotified.add(tpProximityKey);
      }

      if (priceToSl < slDistance * 0.3 && !lastProximityNotified.has(slProximityKey)) {
        await sendProximityNotification(signal, livePrice, "SL");
        lastProximityNotified.add(slProximityKey);
      }
    }

    await persistTrackingSets();
  } catch (err) {
    console.error("Price proximity check error:", err);
  }
}

export async function initializeSignalTracking() {
  try {
    await loadTrackingSets();
    const baseUrl = getApiUrl();
    const signalsUrl = new URL("/api/signals", baseUrl).toString();
    const response = await fetch(signalsUrl);
    if (!response.ok) return;
    const signals: Signal[] = await response.json();
    lastSignalIds = new Set(signals.map((s) => s.id));
    await persistTrackingSets();
  } catch {
  }
}

const BACKGROUND_FETCH_TASK = "background-notification-check";

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    await loadTrackingSets();
    await checkNotificationsNow();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundFetch() {
  if (Platform.OS === "web") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    }
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    const status = await BackgroundFetch.getStatusAsync();
    const statusLabel = status === BackgroundFetch.BackgroundFetchStatus.Available
      ? "disponibile"
      : status === BackgroundFetch.BackgroundFetchStatus.Restricted
      ? "limitato"
      : "disattivato";
    console.log(`Background fetch registrato (stato: ${statusLabel}, intervallo minimo: 60s)`);
  } catch (err) {
    console.log("Background fetch registrazione fallita:", err instanceof Error ? err.message : String(err));
  }
}

export async function unregisterBackgroundFetch() {
  if (Platform.OS === "web") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    }
  } catch {
  }
}

export async function checkNotificationsNow() {
  try {
    await checkForNewSignals();
    await checkForCalendarEvents();
    await checkForOutcomes();
    await checkForPriceProximity();
  } catch {
  }
}

export const NOTIF_CATEGORIES = {
  signals: NOTIF_SIGNALS_KEY,
  calendar: NOTIF_CALENDAR_KEY,
  prices: NOTIF_PRICES_KEY,
} as const;
