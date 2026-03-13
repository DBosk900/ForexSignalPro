import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { generateForexSignalsWithAI, generateCommoditySignalsWithAI, buildCalendarFromReal, generateFallbackCalendar, processRealNews, generateScalpingSignal, openai } from "./openai";
import type { Signal, NewsItem, AlertItem, CalendarEvent, MarketType, ScalpingSignalData } from "./openai";
import { db } from "./db";
import { signalHistory, activeSignals, priceAlerts, pushTokensTable, scalpingSignals } from "../shared/schema";
import { desc, sql, eq } from "drizzle-orm";
import { fetchAllQuotes, fetchForexQuotes, fetchCommodityQuotes, fetchXAUScalpingData, fetchForexIndicators, fetchCommodityIndicators, fetchRealCalendar, fetchFinancialNewsRSS, type TVQuote } from "./tradingview";
import Expo, { type ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo();
const pushTokens: Set<string> = new Set();

async function loadPushTokensFromDb() {
  try {
    const rows = await db.select({ token: pushTokensTable.token }).from(pushTokensTable);
    for (const row of rows) {
      if (Expo.isExpoPushToken(row.token)) {
        pushTokens.add(row.token);
      }
    }
    if (pushTokens.size > 0) {
      console.log(`Caricati ${pushTokens.size} push token dal database`);
    }
  } catch (err: any) {
    console.error("Errore caricamento push token:", err.message);
  }
}

async function savePushTokenToDb(token: string) {
  try {
    await db.insert(pushTokensTable)
      .values({ token })
      .onConflictDoUpdate({
        target: pushTokensTable.token,
        set: { lastUsed: new Date() },
      });
  } catch (err: any) {
    console.error("Errore salvataggio push token:", err.message);
  }
}

async function removePushTokenFromDb(token: string) {
  try {
    await db.delete(pushTokensTable).where(eq(pushTokensTable.token, token));
  } catch {}
}

async function sendPushNotifications(title: string, body: string, data?: Record<string, any>) {
  if (pushTokens.size === 0) return;

  const messages: ExpoPushMessage[] = [];
  for (const token of pushTokens) {
    if (!Expo.isExpoPushToken(token)) {
      pushTokens.delete(token);
      removePushTokenFromDb(token);
      continue;
    }
    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data: data || {},
      priority: "high",
      channelId: data?.channelId || "trading-signals",
      badge: 1,
      _contentAvailable: true,
    } as any);
  }

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === "error") {
          if (ticket.details?.error === "DeviceNotRegistered") {
            const token = (chunk[i] as any).to;
            pushTokens.delete(token);
            removePushTokenFromDb(token);
          }
        }
      }
    } catch (err: any) {
      console.error("Push notification error:", err.message);
    }
  }
}

let cachedSignals: Signal[] = [];
let cachedNews: NewsItem[] = [];
let cachedAlerts: AlertItem[] = [];
let cachedCalendar: CalendarEvent[] = [];
let cachedCommoditySignals: Signal[] = [];
let cachedCommodityNews: NewsItem[] = [];
let calendarLastRefreshed = 0;
let newsLastRefreshed = 0;
const CALENDAR_ROUTE_TTL = 30 * 60 * 1000;
const NEWS_ROUTE_TTL = 15 * 60 * 1000;
let lastGenerated: Date | null = null;
let isGenerating = false;
let cachedBriefing: { text: string; generatedAt: number } | null = null;
const BRIEFING_TTL = 4 * 3600000;
let cachedJournal: { data: any; generatedAt: number } | null = null;
const JOURNAL_TTL = 3600000;
let cachedMarketSentiment: { data: any; generatedAt: number } | null = null;
const MARKET_SENTIMENT_TTL = 30 * 60000;
const chatRateLimit: Map<string, number[]> = new Map();
const CHAT_RATE_LIMIT = 20;
const CHAT_RATE_WINDOW = 60000;

let cachedScalpingSignals: ScalpingSignalData[] = [];
let isGeneratingScalping = false;
const MAX_ACTIVE_SCALPING = 3;
const SCALPING_GENERATION_INTERVAL = 5 * 60000;
const SCALPING_PIP_VALUE = 0.1;
const scalpingExpiryNotified: Set<string> = new Set();

interface ScalpingRadarData {
  price: number;
  updatedAt: string;
  m1: { ema9: number; ema21: number; rsi: number; atr: number; dir: "BUY" | "SELL" | "HOLD" };
  m5: { ema9: number; ema21: number; rsi: number; atr: number; dir: "BUY" | "SELL" | "HOLD" };
  blockReason: string;
  nextCheckIn: number;
}
let cachedScalpingRadar: ScalpingRadarData | null = null;
let lastScalpingCheckTime = 0;

function getTfDir(ind: { ema9: number; ema21: number; rsi: number }): "BUY" | "SELL" | "HOLD" {
  let buy = 0, sell = 0;
  if (ind.ema9 > ind.ema21) buy++; else sell++;
  if (ind.rsi >= 45 && ind.rsi <= 68) buy++; else if (ind.rsi >= 32 && ind.rsi <= 55) sell++;
  return buy > sell ? "BUY" : sell > buy ? "SELL" : "HOLD";
}

function computeBlockReason(scalpData: { price: number; m1: { ema9: number; ema21: number; rsi: number; atr: number }; m5: { ema9: number; ema21: number; rsi: number; atr: number } }): string {
  const nowUtc = new Date().getUTCHours();
  const isLondon = nowUtc >= 8 && nowUtc < 16;
  const isNY = nowUtc >= 13 && nowUtc < 21;
  if (!isLondon && !isNY) return `Sessione chiusa (${String(nowUtc).padStart(2, "0")}:00 UTC)`;
  if (scalpData.m5.atr <= 0.5) return `ATR basso (${scalpData.m5.atr.toFixed(2)}) - mercato piatto`;
  const m1Dir = getTfDir(scalpData.m1);
  const m5Dir = getTfDir(scalpData.m5);
  if (m1Dir !== "HOLD" && m5Dir !== "HOLD" && m1Dir !== m5Dir) return `M1 ${m1Dir} vs M5 ${m5Dir} - divergenza`;
  if (m1Dir === "HOLD" || m5Dir === "HOLD") return `Confluenza parziale - stiamo monitorando`;
  if (m5Dir === "BUY" && scalpData.m5.rsi > 72) return `RSI overbought (${scalpData.m5.rsi.toFixed(0)}) - BUY rischioso`;
  if (m5Dir === "SELL" && scalpData.m5.rsi < 28) return `RSI oversold (${scalpData.m5.rsi.toFixed(0)}) - SELL rischioso`;
  return "Confluenza rilevata - segnale in arrivo";
}

async function refreshScalpingRadar() {
  lastScalpingCheckTime = Date.now();
  try {
    const scalpData = await fetchXAUScalpingData();
    if (!scalpData || scalpData.price <= 0) {
      if (!cachedScalpingRadar) {
        cachedScalpingRadar = {
          price: 0, updatedAt: new Date().toISOString(),
          m1: { ema9: 0, ema21: 0, rsi: 50, atr: 0, dir: "HOLD" },
          m5: { ema9: 0, ema21: 0, rsi: 50, atr: 0, dir: "HOLD" },
          blockReason: "Dati indicatori non disponibili", nextCheckIn: 300,
        };
      }
      return null;
    }
    cachedScalpingRadar = {
      price: scalpData.price,
      updatedAt: new Date().toISOString(),
      m1: { ema9: scalpData.m1.ema9, ema21: scalpData.m1.ema21, rsi: scalpData.m1.rsi, atr: scalpData.m1.atr, dir: getTfDir(scalpData.m1) },
      m5: { ema9: scalpData.m5.ema9, ema21: scalpData.m5.ema21, rsi: scalpData.m5.rsi, atr: scalpData.m5.atr, dir: getTfDir(scalpData.m5) },
      blockReason: computeBlockReason(scalpData),
      nextCheckIn: Math.max(0, Math.round(SCALPING_GENERATION_INTERVAL / 1000)),
    };
    return scalpData;
  } catch (err: any) {
    console.error("[SCALPING RADAR] Errore aggiornamento:", err.message);
    return null;
  }
}

async function generateAndAddScalpingSignal() {
  const scalpData = await refreshScalpingRadar();

  if (isMarketClosed()) {
    if (cachedScalpingRadar) cachedScalpingRadar.blockReason = `Mercato chiuso`;
    return;
  }
  if (isGeneratingScalping) return;
  const activeCount = cachedScalpingSignals.filter(s => s.status === "active" || s.status === "hit_tp1").length;
  if (activeCount >= MAX_ACTIVE_SCALPING) {
    if (cachedScalpingRadar) cachedScalpingRadar.blockReason = `${activeCount} segnali attivi (max ${MAX_ACTIVE_SCALPING})`;
    return;
  }
  if (!scalpData) return;

  isGeneratingScalping = true;
  try {
    console.log(`[SCALPING] Dati reali: price=$${scalpData.price.toFixed(2)} | M1 EMA9=${scalpData.m1.ema9.toFixed(2)} EMA21=${scalpData.m1.ema21.toFixed(2)} RSI=${scalpData.m1.rsi.toFixed(0)} ATR=${scalpData.m1.atr.toFixed(3)} | M5 EMA9=${scalpData.m5.ema9.toFixed(2)} EMA21=${scalpData.m5.ema21.toFixed(2)} RSI=${scalpData.m5.rsi.toFixed(0)}`);

    const signal = await generateScalpingSignal(scalpData);
    if (!signal) return;

    if (cachedScalpingRadar) cachedScalpingRadar.blockReason = "Segnale generato";
    cachedScalpingSignals.push(signal);
    console.log(`[SCALPING] Nuovo segnale: ${signal.action} @ ${signal.entryPrice} | SL: ${signal.stopLoss} | TP1: ${signal.tp1} | TP2: ${signal.tp2} | ${signal.timeframe} | Conf: ${signal.confidence}%`);

    try {
      await db.insert(scalpingSignals).values({
        id: signal.id,
        action: signal.action,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        currentSL: signal.currentSL,
        tp1: signal.tp1,
        tp2: signal.tp2,
        confidence: signal.confidence,
        timeframe: signal.timeframe,
        summary: signal.summary,
        status: signal.status,
        pipResult: 0,
        beActive: false,
        expiresAt: new Date(signal.expiresAt),
        closedAt: null,
      });
    } catch (err: any) {
      console.error("Errore salvataggio scalping signal:", err.message);
    }

    sendPushNotifications(
      `Scalping ${signal.action} XAU/USD`,
      `Entry: $${signal.entryPrice} | SL: $${signal.stopLoss} | TP1: $${signal.tp1} | ${signal.timeframe} | ${signal.confidence}%`,
      { type: "scalping", signalId: signal.id, channelId: "scalping-signals" }
    );
  } catch (err: any) {
    console.error("Errore generazione scalping:", err.message);
  } finally {
    isGeneratingScalping = false;
  }
}

async function checkScalpingOutcomes() {
  if (cachedScalpingSignals.length === 0) return;

  try {
    const quotes = await fetchCommodityQuotes(["XAU/USD"]);
    const xauQuote = quotes.find(q => q.pair === "XAU/USD");
    if (!xauQuote || xauQuote.price <= 0) return;

    const price = xauQuote.price;
    const now = new Date();
    const toRemove: string[] = [];

    for (const s of cachedScalpingSignals) {
      if (s.status !== "active" && s.status !== "hit_tp1") continue;

      if (now >= new Date(s.expiresAt)) {
        const pipResult = s.action === "BUY"
          ? parseFloat(((price - s.entryPrice) / SCALPING_PIP_VALUE).toFixed(1))
          : parseFloat(((s.entryPrice - price) / SCALPING_PIP_VALUE).toFixed(1));
        s.status = "expired";
        s.pipResult = pipResult;
        s.closedAt = now.toISOString();
        toRemove.push(s.id);
        console.log(`[SCALPING] Scaduto: ${s.action} @ ${s.entryPrice} | Risultato: ${pipResult} pips`);

        sendPushNotifications(
          `Scalping scaduto XAU/USD`,
          `${s.action} @ $${s.entryPrice} scaduto. Risultato: ${pipResult >= 0 ? "+" : ""}${pipResult} pips`,
          { type: "scalping-outcome", signalId: s.id }
        );

        try {
          await db.update(scalpingSignals).set({ status: "expired", pipResult, closedAt: now }).where(eq(scalpingSignals.id, s.id));
        } catch {}
        continue;
      }

      const remainingMs = new Date(s.expiresAt).getTime() - now.getTime();
      if (remainingMs > 0 && remainingMs <= 5 * 60000 && !scalpingExpiryNotified.has(s.id)) {
        scalpingExpiryNotified.add(s.id);
        sendPushNotifications(
          `Scalping XAU/USD scade tra 5 min`,
          `${s.action} @ $${s.entryPrice} | Prezzo attuale: $${price.toFixed(2)}`,
          { type: "scalping-expiry", signalId: s.id }
        );
      }

      if (s.status === "active") {
        const tp1Hit = s.action === "BUY" ? price >= s.tp1 : price <= s.tp1;
        if (tp1Hit) {
          s.status = "hit_tp1";
          s.beActive = true;
          s.currentSL = s.entryPrice;
          console.log(`[SCALPING TP1] ${s.action} @ ${s.entryPrice} | TP1 raggiunto a $${price.toFixed(2)} | SL spostato a break-even`);

          sendPushNotifications(
            `TP1 raggiunto - Scalping XAU/USD`,
            `${s.action} @ $${s.entryPrice} | TP1 a $${s.tp1} | SL spostato a break-even`,
            { type: "scalping-tp1", signalId: s.id }
          );

          try {
            await db.update(scalpingSignals).set({ status: "hit_tp1", beActive: true, currentSL: s.entryPrice }).where(eq(scalpingSignals.id, s.id));
          } catch {}
        }
      }

      if (s.status === "hit_tp1") {
        const tp2Hit = s.action === "BUY" ? price >= s.tp2 : price <= s.tp2;
        if (tp2Hit) {
          const pipResult = parseFloat((Math.abs(s.tp2 - s.entryPrice) / SCALPING_PIP_VALUE).toFixed(1));
          s.status = "hit_tp2";
          s.pipResult = pipResult;
          s.closedAt = now.toISOString();
          toRemove.push(s.id);
          console.log(`[SCALPING TP2] ${s.action} @ ${s.entryPrice} | TP2 completo! +${pipResult} pips`);

          sendPushNotifications(
            `TP2 completo - Scalping XAU/USD`,
            `${s.action} @ $${s.entryPrice} | +${pipResult} pips!`,
            { type: "scalping-tp2", signalId: s.id }
          );

          try {
            await db.update(scalpingSignals).set({ status: "hit_tp2", pipResult, closedAt: now }).where(eq(scalpingSignals.id, s.id));
          } catch {}
          continue;
        }
      }

      const slHit = s.action === "BUY" ? price <= s.currentSL : price >= s.currentSL;
      if (slHit) {
        const pipResult = s.action === "BUY"
          ? parseFloat(((s.currentSL - s.entryPrice) / SCALPING_PIP_VALUE).toFixed(1))
          : parseFloat(((s.entryPrice - s.currentSL) / SCALPING_PIP_VALUE).toFixed(1));
        const wasTP1 = s.beActive || s.status === "hit_tp1";
        const finalStatus = wasTP1 ? "hit_tp1_then_sl" : "hit_sl";
        s.status = finalStatus;
        s.pipResult = pipResult;
        s.closedAt = now.toISOString();
        toRemove.push(s.id);

        if (wasTP1) {
          console.log(`[SCALPING BE] ${s.action} @ ${s.entryPrice} | TP1 preso, poi BE a $${s.currentSL} | ${pipResult >= 0 ? "+" : ""}${pipResult} pips`);
          sendPushNotifications(
            `Break-even - Scalping XAU/USD`,
            `${s.action} @ $${s.entryPrice} | TP1 preso, chiuso in BE: ${pipResult >= 0 ? "+" : ""}${pipResult} pips`,
            { type: "scalping-be", signalId: s.id }
          );
        } else {
          console.log(`[SCALPING SL] ${s.action} @ ${s.entryPrice} | SL a $${s.currentSL} | ${pipResult >= 0 ? "+" : ""}${pipResult} pips`);
          sendPushNotifications(
            `SL colpito - Scalping XAU/USD`,
            `${s.action} @ $${s.entryPrice} | Risultato: ${pipResult >= 0 ? "+" : ""}${pipResult} pips`,
            { type: "scalping-sl", signalId: s.id }
          );
        }

        try {
          await db.update(scalpingSignals).set({ status: finalStatus, pipResult, closedAt: now }).where(eq(scalpingSignals.id, s.id));
        } catch {}
      }
    }

    if (toRemove.length > 0) {
      cachedScalpingSignals = cachedScalpingSignals.filter(s => !toRemove.includes(s.id));
    }
  } catch (err: any) {
    console.error("Errore controllo scalping:", err.message);
  }
}

const ratesCache: Record<string, { data: number[]; fetchedAt: number }> = {};
const RATES_TTL = 300000;

const calendarPushNotified: Set<string> = new Set();

async function checkCalendarUpcomingEvents() {
  if (!cachedCalendar || cachedCalendar.length === 0) return;
  const now = new Date();
  const highImpact = cachedCalendar.filter((e: CalendarEvent) => e.impact === "HIGH" || e.impact === "MEDIUM");
  for (const event of highImpact) {
    if (!event.time || !event.id) continue;
    const [hours, minutes] = event.time.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) continue;
    const eventTime = new Date();
    eventTime.setUTCHours(hours, minutes, 0, 0);
    const diffMinutes = (eventTime.getTime() - now.getTime()) / 60000;
    const key15 = `15m-${event.id}-${eventTime.toDateString()}`;
    const key30 = `30m-${event.id}-${eventTime.toDateString()}`;
    if (diffMinutes > 13 && diffMinutes <= 17 && !calendarPushNotified.has(key15)) {
      calendarPushNotified.add(key15);
      const impactLabel = event.impact === "HIGH" ? "alto impatto" : "medio impatto";
      sendPushNotifications(
        `Evento ${impactLabel} tra 15 min`,
        `${event.event} · ${event.time} UTC · ${event.currencies?.join(", ") ?? ""}`,
        { type: "calendar", eventId: event.id, channelId: "calendar-events" }
      );
    }
    if (diffMinutes > 28 && diffMinutes <= 32 && !calendarPushNotified.has(key30)) {
      calendarPushNotified.add(key30);
      const impactLabel = event.impact === "HIGH" ? "alto impatto" : "medio impatto";
      sendPushNotifications(
        `Evento ${impactLabel} tra 30 min`,
        `${event.event} · ${event.time} UTC · ${event.currencies?.join(", ") ?? ""}`,
        { type: "calendar", eventId: event.id, channelId: "calendar-events" }
      );
    }
  }
}

const NEWS_GUARD_WINDOW_MINUTES = 30;

function parseEventDateTime(event: CalendarEvent): Date | null {
  if (!event.time) return null;
  const [hours, minutes] = event.time.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;

  if (event.date) {
    const dateParts = event.date.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateParts) {
      const eventTime = new Date(Date.UTC(
        parseInt(dateParts[1]),
        parseInt(dateParts[2]) - 1,
        parseInt(dateParts[3]),
        hours, minutes, 0, 0
      ));
      return eventTime;
    }
  }

  const today = new Date();
  const eventTime = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    hours, minutes, 0, 0
  ));
  return eventTime;
}

function isNewsBlocked(pair: string, calendar: CalendarEvent[]): { blocked: boolean; event?: string; eventTime?: string; minutesTo?: number } {
  if (!calendar || calendar.length === 0) return { blocked: false };

  const [base, quote] = pair.split("/");
  const pairCurrencies = new Set([base, quote]);
  const now = new Date();

  const highEvents = calendar.filter(e => e.impact === "HIGH");

  for (const event of highEvents) {
    const eventCurrencies = event.currencies || [];
    const affects = eventCurrencies.some(c => pairCurrencies.has(c));
    if (!affects) continue;

    const eventTime = parseEventDateTime(event);
    if (!eventTime) continue;

    const diffMinutes = (eventTime.getTime() - now.getTime()) / 60000;

    if (diffMinutes >= -NEWS_GUARD_WINDOW_MINUTES && diffMinutes <= NEWS_GUARD_WINDOW_MINUTES) {
      const hh = eventTime.getUTCHours().toString().padStart(2, "0");
      const mm = eventTime.getUTCMinutes().toString().padStart(2, "0");
      return {
        blocked: true,
        event: event.event,
        eventTime: `${hh}:${mm} UTC`,
        minutesTo: Math.round(diffMinutes),
      };
    }
  }

  return { blocked: false };
}

function getNewsWarning(pair: string, calendar: CalendarEvent[]): string | undefined {
  const result = isNewsBlocked(pair, calendar);
  if (!result.blocked || !result.event) return undefined;

  const timeStr = result.eventTime ? ` (${result.eventTime})` : "";
  const mins = result.minutesTo ?? 0;
  if (mins > 0) {
    return `${result.event}${timeStr} tra ${mins} min — gestisci il rischio`;
  } else if (mins === 0) {
    return `${result.event}${timeStr} in corso — alta volatilita`;
  } else {
    return `${result.event}${timeStr} ${Math.abs(mins)} min fa — volatilita elevata`;
  }
}

const PRICE_HISTORY_SIZE = 30;
const priceHistoryBuffer: Record<string, number[]> = {};

function recordPriceHistory(quotes: TVQuote[]) {
  for (const q of quotes) {
    if (q.price <= 0) continue;
    if (!priceHistoryBuffer[q.pair]) priceHistoryBuffer[q.pair] = [];
    const buf = priceHistoryBuffer[q.pair];
    if (buf.length === 0 || buf[buf.length - 1] !== q.price) {
      buf.push(q.price);
      if (buf.length > PRICE_HISTORY_SIZE) buf.shift();
    }
  }
}

function computeCorrelation(a: number[], b: number[]): number | null {
  const len = Math.min(a.length, b.length);
  if (len < 5) return null;
  const aa = a.slice(-len);
  const bb = b.slice(-len);
  const meanA = aa.reduce((s, v) => s + v, 0) / len;
  const meanB = bb.reduce((s, v) => s + v, 0) / len;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < len; i++) {
    const da = aa[i] - meanA;
    const db = bb[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return null;
  return parseFloat((num / den).toFixed(4));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

let isPersisting = false;
let isChecking = false;

async function persistActiveSignals() {
  if (isPersisting) return;
  isPersisting = true;
  try {
    const allSignals = [
      ...cachedSignals.map(s => ({ ...s, _market: "forex" as const })),
      ...cachedCommoditySignals.map(s => ({ ...s, _market: "commodities" as const })),
    ];
    await db.transaction(async (tx) => {
      await tx.delete(activeSignals).where(sql`1=1`);
      for (const s of allSignals) {
        const { _market, ...signalData } = s;
        await tx.insert(activeSignals).values({
          id: s.id,
          pair: s.pair,
          market: _market,
          signalData: JSON.stringify(signalData),
        });
      }
    });
  } catch (err: any) {
    console.error("Error persisting active signals:", err.message);
  } finally {
    isPersisting = false;
  }
}

function validateSignal(data: any): data is Signal {
  return data && typeof data.id === "string" && typeof data.pair === "string"
    && typeof data.entryPrice === "number" && typeof data.stopLoss === "number"
    && typeof data.action === "string" && typeof data.timestamp === "string"
    && typeof data.tp1 === "number" && typeof data.tp2 === "number" && typeof data.tp3 === "number";
}

async function restoreActiveSignals(): Promise<{ forex: Signal[]; commodities: Signal[] }> {
  const result = { forex: [] as Signal[], commodities: [] as Signal[] };
  try {
    const rows = await db.select().from(activeSignals);
    const expired: Signal[] = [];
    for (const row of rows) {
      try {
        const signal = JSON.parse(row.signalData);
        if (!validateSignal(signal)) {
          console.warn(`Invalid signal data for ${row.pair}, skipping`);
          continue;
        }
        const age = Date.now() - new Date(signal.timestamp).getTime();
        if (age > 3 * 3600000) {
          expired.push(signal);
          continue;
        }
        if (row.market === "forex") result.forex.push(signal);
        else result.commodities.push(signal);
      } catch (e: any) {
        console.warn(`Failed to parse signal ${row.id}: ${e.message}`);
      }
    }

    if (expired.length > 0) {
      for (const s of expired) {
        try {
          await db.insert(signalHistory).values({
            pair: s.pair, action: s.action, entryPrice: s.entryPrice,
            stopLoss: s.stopLoss, takeProfit: s.takeProfit,
            tp1: s.tp1, tp2: s.tp2, tp3: s.tp3, tpLevel: s.tpHit ?? 0,
            confidence: s.confidence, strength: s.strength,
            timeframe: s.timeframe, summary: s.summary,
            rsi: s.rsi, macd: s.macd,
            outcome: "expired", pipResult: 0, closedAt: new Date(),
          });
        } catch {}
      }
      console.log(`Archived ${expired.length} expired signals from DB restore`);
    }

    await db.delete(activeSignals).where(sql`1=1`);
    console.log(`Restored ${result.forex.length} forex + ${result.commodities.length} commodity active signals from DB`);
  } catch (err: any) {
    console.error("Error restoring active signals:", err.message);
  }
  return result;
}

async function retroactiveCheck(signals: Signal[]): Promise<Signal[]> {
  if (signals.length === 0) return signals;
  try {
    const [fxQuotes, cmdQuotes] = await Promise.all([
      fetchForexQuotes(),
      fetchCommodityQuotes(),
    ]);
    const tvMap: Record<string, TVQuote> = {};
    for (const q of [...fxQuotes, ...cmdQuotes]) tvMap[q.pair] = q;

    const stillActive: Signal[] = [];
    for (const s of signals) {
      if (s.action === "HOLD") {
        const ageMs = Date.now() - new Date(s.timestamp).getTime();
        if (ageMs < 3 * 60 * 60 * 1000) stillActive.push(s);
        continue;
      }
      const tv = tvMap[s.pair];
      if (!tv || tv.price <= 0) { stillActive.push(s); continue; }

      const result = await processSignalCheck(s, tv.price);
      if (result === "closed") {
        console.log(`[RETROACTIVE] ${s.pair} closed during server downtime`);
      } else {
        stillActive.push(s);
      }
    }
    return stillActive;
  } catch (err: any) {
    console.error("Error in retroactive check:", err.message);
    return signals;
  }
}

function isMarketClosed(): boolean {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  return utcDay === 6 || (utcDay === 5 && utcHour >= 22) || (utcDay === 0 && utcHour < 23);
}

function getCETTime(): { hour: number; minute: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
  return { hour, minute };
}

function getCETHour(): number {
  return getCETTime().hour;
}

function isNightSession(): boolean {
  const { hour, minute } = getCETTime();
  // Fascia notturna: dalle 23:59 alle 08:00 (CET/CEST)
  const afterMidnightCutoff = hour === 23 && minute >= 59;
  const beforeMorningCutoff = hour < 8;
  return afterMidnightCutoff || beforeMorningCutoff;
}

async function archiveSignals(signals: Signal[]) {
  if (signals.length === 0) return;
  try {
    for (const s of signals) {
      await db.insert(signalHistory).values({
        pair: s.pair,
        action: s.action,
        entryPrice: s.entryPrice,
        stopLoss: s.stopLoss,
        takeProfit: s.takeProfit,
        tp1: s.tp1,
        tp2: s.tp2,
        tp3: s.tp3,
        tpLevel: 0,
        confidence: s.confidence,
        strength: s.strength,
        timeframe: s.timeframe,
        summary: s.summary,
        rsi: s.rsi,
        macd: s.macd,
        outcome: "pending",
        pipResult: 0,
        closedAt: null,
      });
    }
    console.log(`Archived ${signals.length} signals as pending`);
  } catch (err: any) {
    console.error("Error archiving signals:", err.message);
  }
}

function getPipValue(pair: string, price: number): number {
  if (pair === "XAU/USD" || pair === "XPT/USD") return 0.1;
  if (pair === "XAG/USD") return 0.01;
  if (pair === "WTI/USD" || pair === "BRENT/USD") return 0.01;
  if (pair === "NG/USD") return 0.001;
  if (pair === "XCU/USD") return 0.0001;
  if (pair.includes("JPY")) return 0.01;
  return 0.0001;
}

function calculatePipResult(signal: Signal, closePrice: number): number {
  const pip = getPipValue(signal.pair, signal.entryPrice);
  const diff = signal.action === "BUY"
    ? closePrice - signal.entryPrice
    : signal.entryPrice - closePrice;
  return parseFloat((diff / pip).toFixed(1));
}

function checkTpHit(s: Signal, livePrice: number): number {
  if (s.action === "BUY") {
    if (livePrice >= s.tp3) return 3;
    if (livePrice >= s.tp2) return 2;
    if (livePrice >= s.tp1) return 1;
  } else if (s.action === "SELL") {
    if (livePrice <= s.tp3) return 3;
    if (livePrice <= s.tp2) return 2;
    if (livePrice <= s.tp1) return 1;
  }
  return 0;
}

function checkSlHit(s: Signal, livePrice: number): boolean {
  if (s.action === "BUY") return livePrice <= s.currentSL;
  if (s.action === "SELL") return livePrice >= s.currentSL;
  return false;
}

function getTrailingDistance(s: Signal): number {
  const pip = getPipValue(s.pair, s.entryPrice);
  const tp1Dist = Math.abs(s.tp1 - s.entryPrice);
  return tp1Dist * 0.8;
}

function updateTrailingStop(s: Signal, livePrice: number): void {
  if (s.tpHit < 1) return;
  const trailDist = getTrailingDistance(s);

  if (s.action === "BUY") {
    const newSL = livePrice - trailDist;
    if (newSL > s.currentSL) {
      s.currentSL = parseFloat(newSL.toFixed(s.pair.includes("JPY") ? 3 : s.entryPrice > 100 ? 2 : s.entryPrice > 10 ? 2 : 4));
    }
  } else if (s.action === "SELL") {
    const newSL = livePrice + trailDist;
    if (newSL < s.currentSL) {
      s.currentSL = parseFloat(newSL.toFixed(s.pair.includes("JPY") ? 3 : s.entryPrice > 100 ? 2 : s.entryPrice > 10 ? 2 : 4));
    }
  }
}

function createOutcomeAlert(s: Signal, outcome: string, pipResult: number, tpLevel: number) {
  const pipsStr = `${pipResult >= 0 ? "+" : ""}${pipResult.toFixed(1)} pips`;
  let title: string;
  let message: string;

  switch (outcome) {
    case "hit_tp3":
      title = `TP3 completo su ${s.pair}`;
      message = `${s.action} ${s.pair} ha raggiunto tutti i target. Risultato: ${pipsStr}`;
      break;
    case "hit_tp2_then_sl":
      title = `TP2 raggiunto su ${s.pair}`;
      message = `${s.action} ${s.pair} ha colpito TP2 poi trailing SL a TP1. Risultato: ${pipsStr}`;
      break;
    case "hit_tp1_then_sl":
      title = `TP1 raggiunto su ${s.pair}`;
      message = `${s.action} ${s.pair} ha colpito TP1 poi SL a break-even. Risultato: ${pipsStr}`;
      break;
    case "hit_sl":
      title = `SL colpito su ${s.pair}`;
      message = `${s.action} ${s.pair} ha colpito lo stop loss. Risultato: ${pipsStr}`;
      break;
    default:
      return;
  }

  sendPushNotifications(title, message, { type: "outcome", pair: s.pair, outcome });

  const isCommodity = s.pair.startsWith("X") || ["WTI/USD", "BRENT/USD", "NG/USD"].includes(s.pair);
  cachedAlerts.unshift({
    id: uid(),
    type: "outcome",
    title,
    message,
    pair: s.pair,
    action: s.action,
    timestamp: new Date().toISOString(),
    read: false,
    market: isCommodity ? "commodities" : "forex",
  });

  if (cachedAlerts.length > 100) {
    cachedAlerts = cachedAlerts.slice(0, 100);
  }
}

async function saveSignalOutcome(s: Signal, outcome: string, livePrice: number, tpLevel: number) {
  const pipResult = calculatePipResult(s, livePrice);
  console.log(`[OUTCOME] ${s.pair} ${s.action} → ${outcome} (TP level: ${tpLevel}) | Entry: ${s.entryPrice} Close: ${livePrice} | ${pipResult > 0 ? "+" : ""}${pipResult} pips`);

  createOutcomeAlert(s, outcome, pipResult, tpLevel);

  try {
    await db.insert(signalHistory).values({
      pair: s.pair,
      action: s.action,
      entryPrice: s.entryPrice,
      stopLoss: s.stopLoss,
      takeProfit: s.takeProfit,
      tp1: s.tp1,
      tp2: s.tp2,
      tp3: s.tp3,
      tpLevel,
      confidence: s.confidence,
      strength: s.strength,
      timeframe: s.timeframe,
      summary: s.summary,
      rsi: s.rsi,
      macd: s.macd,
      outcome,
      pipResult,
      closedAt: new Date(),
    });
  } catch (err: any) {
    console.error(`Error saving outcome for ${s.pair}:`, err.message);
  }
}

async function processSignalCheck(s: Signal, livePrice: number): Promise<string | null> {
  const currentTpHit = checkTpHit(s, livePrice);
  let tpJustHit = false;

  if (currentTpHit > s.tpHit) {
    tpJustHit = true;

    if (currentTpHit >= 1 && s.tpHit < 1) {
      s.currentSL = s.entryPrice;
      console.log(`[TP1 HIT] ${s.pair} — SL moved to break-even: ${s.currentSL}`);
    }
    if (currentTpHit >= 2 && s.tpHit < 2) {
      s.currentSL = s.tp1;
      console.log(`[TP2 HIT] ${s.pair} — SL moved to TP1: ${s.currentSL}`);
    }
    s.tpHit = currentTpHit;

    if (currentTpHit === 3) {
      await saveSignalOutcome(s, "hit_tp3", livePrice, 3);
      return "closed";
    }
  }

  if (!tpJustHit) {
    updateTrailingStop(s, livePrice);
  }

  if (checkSlHit(s, livePrice)) {
    const tpLevel = s.tpHit;
    let outcome: string;
    if (tpLevel >= 2) outcome = "hit_tp2_then_sl";
    else if (tpLevel >= 1) outcome = "hit_tp1_then_sl";
    else outcome = "hit_sl";

    const closePrice = tpLevel >= 1 ? s.currentSL : livePrice;
    await saveSignalOutcome(s, outcome, closePrice, tpLevel);
    return "closed";
  }

  return null;
}

async function checkSignalOutcomes() {
  if (isMarketClosed()) return;
  if (isChecking) return;
  isChecking = true;
  try { await _doCheckSignalOutcomes(); } finally { isChecking = false; }
}

async function _doCheckSignalOutcomes() {

  try {
    const [fxQuotes, cmdQuotes] = await Promise.all([
      fetchForexQuotes(),
      fetchCommodityQuotes(),
    ]);
    const allQuotes = [...fxQuotes, ...cmdQuotes];
    recordPriceHistory(allQuotes);
    const tvMap: Record<string, TVQuote> = {};
    for (const q of allQuotes) tvMap[q.pair] = q;

    await checkPriceAlerts(tvMap);

    const allActive = [...cachedSignals, ...cachedCommoditySignals];
    if (allActive.length === 0) return;

    const closedForex: Signal[] = [];
    const closedCommodity: Signal[] = [];
    const HOLD_EXPIRY_MS = 3 * 60 * 60 * 1000;

    for (const s of cachedSignals) {
      if (s.action === "HOLD") {
        const ageMs = Date.now() - new Date(s.timestamp).getTime();
        if (ageMs >= HOLD_EXPIRY_MS) { closedForex.push(s); console.log(`[HOLD EXPIRED] ${s.pair} forex (age: ${Math.round(ageMs / 60000)}min)`); }
        continue;
      }
      const tv = tvMap[s.pair];
      if (!tv || tv.price <= 0) continue;
      const result = await processSignalCheck(s, tv.price);
      if (result === "closed") closedForex.push(s);
    }

    for (const s of cachedCommoditySignals) {
      if (s.action === "HOLD") {
        const ageMs = Date.now() - new Date(s.timestamp).getTime();
        if (ageMs >= HOLD_EXPIRY_MS) { closedCommodity.push(s); console.log(`[HOLD EXPIRED] ${s.pair} commodity (age: ${Math.round(ageMs / 60000)}min)`); }
        continue;
      }
      const tv = tvMap[s.pair];
      if (!tv || tv.price <= 0) continue;
      const result = await processSignalCheck(s, tv.price);
      if (result === "closed") closedCommodity.push(s);
    }

    if (closedForex.length > 0) {
      cachedSignals = cachedSignals.filter(s => !closedForex.includes(s));
      console.log(`Removed ${closedForex.length} closed forex signals, ${cachedSignals.length} remaining`);
    }
    if (closedCommodity.length > 0) {
      cachedCommoditySignals = cachedCommoditySignals.filter(s => !closedCommodity.includes(s));
      console.log(`Removed ${closedCommodity.length} closed commodity signals, ${cachedCommoditySignals.length} remaining`);
    }
    if (closedForex.length > 0 || closedCommodity.length > 0) {
      await persistActiveSignals();
    }
  } catch (err: any) {
    console.error("Error checking signal outcomes:", err.message);
  }
}

async function checkPriceAlerts(tvMap: Record<string, TVQuote>) {
  try {
    const alerts = await db.select().from(priceAlerts).where(eq(priceAlerts.triggered, false));
    if (alerts.length === 0) return;

    for (const alert of alerts) {
      const tv = tvMap[alert.pair];
      if (!tv || tv.price <= 0) continue;

      let triggered = false;
      if (alert.direction === "above" && tv.price >= alert.targetPrice) triggered = true;
      if (alert.direction === "below" && tv.price <= alert.targetPrice) triggered = true;

      if (triggered) {
        await db.update(priceAlerts).set({ triggered: true, triggeredAt: new Date() }).where(eq(priceAlerts.id, alert.id));

        const dirLabel = alert.direction === "above" ? "sopra" : "sotto";
        const title = `Avviso Prezzo: ${alert.pair}`;
        const body = `${alert.pair} ha raggiunto ${tv.price.toFixed(alert.pair.includes("JPY") ? 3 : alert.targetPrice > 100 ? 2 : 5)} (target ${dirLabel} ${alert.targetPrice})${alert.note ? ` - ${alert.note}` : ""}`;

        sendPushNotifications(title, body, { type: "price_alert", pair: alert.pair, channelId: "price-alerts" });

        cachedAlerts.unshift({
          id: uid(),
          type: "market",
          title,
          message: body,
          pair: alert.pair,
          timestamp: new Date().toISOString(),
          read: false,
        });

        console.log(`[PRICE ALERT] ${alert.pair} triggered: price ${tv.price} ${alert.direction} ${alert.targetPrice}`);
      }
    }
  } catch (err: any) {
    console.error("Error checking price alerts:", err.message);
  }
}

async function doGenerate() {
  if (isGenerating) return;

  if (isMarketClosed()) {
    console.log("Mercato chiuso, generazione segnali sospesa");
    return;
  }

  if (isNightSession()) {
    console.log("Fascia notturna (23:59-08:00 CET), generazione segnali sospesa — monitoraggio attivo");
    return;
  }

  isGenerating = true;
  try {
    console.log("Generating forex + commodity signals with AI...");

    const STALE_HOURS = 3;
    const staleThreshold = Date.now() - STALE_HOURS * 3600000;
    const staleSignals = [...cachedSignals, ...cachedCommoditySignals].filter(
      s => new Date(s.timestamp).getTime() < staleThreshold
    );
    if (staleSignals.length > 0) {
      for (const s of staleSignals) {
        try {
          await db.insert(signalHistory).values({
            pair: s.pair,
            action: s.action,
            entryPrice: s.entryPrice,
            stopLoss: s.stopLoss,
            takeProfit: s.takeProfit,
            tp1: s.tp1,
            tp2: s.tp2,
            tp3: s.tp3,
            tpLevel: s.tpHit ?? 0,
            confidence: s.confidence,
            strength: s.strength,
            timeframe: s.timeframe,
            summary: s.summary,
            rsi: s.rsi,
            macd: s.macd,
            outcome: "expired",
            pipResult: 0,
            closedAt: new Date(),
          });
        } catch (err: any) {
          console.error(`Error archiving expired signal ${s.pair}:`, err.message);
        }
      }
      console.log(`Archived ${staleSignals.length} expired signals (>${STALE_HOURS}h old)`);
      cachedSignals = cachedSignals.filter(s => new Date(s.timestamp).getTime() >= staleThreshold);
      cachedCommoditySignals = cachedCommoditySignals.filter(s => new Date(s.timestamp).getTime() >= staleThreshold);
    }

    const [forexIndicators, commodityIndicators, forexQuotesRaw, commodityQuotesRaw] = await Promise.all([
      fetchForexIndicators(),
      fetchCommodityIndicators(),
      fetchForexQuotes(),
      fetchCommodityQuotes(),
    ]);
    const forexLiveQuotes = new Map<string, number>();
    for (const q of forexQuotesRaw) if (q.price > 0) forexLiveQuotes.set(q.pair, q.price);
    const commodityLiveQuotes = new Map<string, number>();
    for (const q of commodityQuotesRaw) if (q.price > 0) commodityLiveQuotes.set(q.pair, q.price);
    console.log(`Fetched real indicators: ${forexIndicators.size} forex, ${commodityIndicators.size} commodity | live quote fallback: ${forexLiveQuotes.size} forex, ${commodityLiveQuotes.size} commodity`);

    const [rawCalendarEvents, rawRSSNews] = await Promise.all([
      fetchRealCalendar(),
      fetchFinancialNewsRSS(),
    ]);
    console.log(`Real data fetched: ${rawCalendarEvents.length} calendar events, ${rawRSSNews.length} RSS headlines`);

    const [forexRealNews, commodityRealNews, calendarFromReal] = await Promise.all([
      processRealNews(rawRSSNews, "forex"),
      processRealNews(rawRSSNews, "commodities"),
      buildCalendarFromReal(rawCalendarEvents),
    ]);
    let calendar = calendarFromReal;
    if (calendar.length === 0 && rawCalendarEvents.length === 0) {
      console.log("[CALENDAR] ForexFactory empty in doGenerate, using AI fallback");
      calendar = await generateFallbackCalendar();
    }
    console.log(`Processed real news: ${forexRealNews.length} forex, ${commodityRealNews.length} commodity | Calendar: ${calendar.length} events`);

    const [forexResult, commodityResult] = await Promise.all([
      generateForexSignalsWithAI(forexIndicators, forexLiveQuotes, forexRealNews),
      generateCommoditySignalsWithAI(commodityIndicators, commodityLiveQuotes, commodityRealNews),
    ]);

    const existingForexPairs = new Set(cachedSignals.map(s => s.pair));
    const existingCmdPairs = new Set(cachedCommoditySignals.map(s => s.pair));
    let newForex = forexResult.signals.filter(s => !existingForexPairs.has(s.pair));
    let newCommodity = commodityResult.signals.filter(s => !existingCmdPairs.has(s.pair));

    const blockedByNews: string[] = [];
    newForex = newForex.filter(s => {
      if (s.action === "HOLD") return true;
      const guard = isNewsBlocked(s.pair, calendar);
      if (guard.blocked) {
        blockedByNews.push(`${s.pair} (${guard.event})`);
        console.log(`[NEWS GUARD] BLOCCATO ${s.pair} ${s.action} per news: ${guard.event} (${guard.minutesTo! > 0 ? "tra" : "fa"} ${Math.abs(guard.minutesTo!)} min)`);
        return false;
      }
      return true;
    });
    newCommodity = newCommodity.filter(s => {
      if (s.action === "HOLD") return true;
      const guard = isNewsBlocked(s.pair, calendar);
      if (guard.blocked) {
        blockedByNews.push(`${s.pair} (${guard.event})`);
        console.log(`[NEWS GUARD] BLOCCATO ${s.pair} ${s.action} per news: ${guard.event} (${guard.minutesTo! > 0 ? "tra" : "fa"} ${Math.abs(guard.minutesTo!)} min)`);
        return false;
      }
      return true;
    });
    if (blockedByNews.length > 0) {
      console.log(`[NEWS GUARD] Bloccati ${blockedByNews.length} segnali: ${blockedByNews.join(", ")}`);
    }

    for (const s of cachedSignals) {
      s.newsWarning = getNewsWarning(s.pair, calendar);
    }
    for (const s of cachedCommoditySignals) {
      s.newsWarning = getNewsWarning(s.pair, calendar);
    }

    for (const s of newForex) {
      s.newsWarning = getNewsWarning(s.pair, calendar);
    }
    for (const s of newCommodity) {
      s.newsWarning = getNewsWarning(s.pair, calendar);
    }
    cachedSignals = [...cachedSignals, ...newForex];
    cachedCommoditySignals = [...cachedCommoditySignals, ...newCommodity];
    cachedNews = forexResult.news;
    cachedCommodityNews = commodityResult.news;
    cachedCalendar = calendar;
    calendarLastRefreshed = Date.now();
    newsLastRefreshed = Date.now();
    console.log(`Kept ${existingForexPairs.size} active forex + ${existingCmdPairs.size} active commodity signals, added ${newForex.length} new forex + ${newCommodity.length} new commodity signals`);

    const totalNew = newForex.length + newCommodity.length;
    if (totalNew > 0) {
      const highConf = [...newForex, ...newCommodity].filter(s => s.confidence >= 75);
      if (highConf.length > 0) {
        const pairs = highConf.slice(0, 5).map(s => `${s.action} ${s.pair}`).join(", ");
        sendPushNotifications(
          `${totalNew} nuovi segnali disponibili`,
          pairs,
          { type: "new_signals", count: totalNew }
        );
      } else {
        const pairs = [...newForex, ...newCommodity].slice(0, 5).map(s => `${s.action} ${s.pair}`).join(", ");
        sendPushNotifications(
          `${totalNew} nuovi segnali disponibili`,
          pairs,
          { type: "new_signals", count: totalNew }
        );
      }
    }

    try {
      const [fxQuotes, cmdQuotes] = await Promise.all([
        fetchForexQuotes(),
        fetchCommodityQuotes(),
      ]);
      const tvMap: Record<string, TVQuote> = {};
      for (const q of [...fxQuotes, ...cmdQuotes]) tvMap[q.pair] = q;

      const syncSignalPrice = (s: Signal, tv: TVQuote) => {
        const dec = s.pair.includes("JPY") ? 3 : tv.price > 100 ? 2 : tv.price > 10 ? 2 : 5;
        const oldEntry = s.entryPrice;
        const entryDiff = tv.price - oldEntry;
        s.entryPrice = parseFloat(tv.price.toFixed(dec));
        if (s.action === "HOLD") return;
        s.stopLoss = parseFloat((s.stopLoss + entryDiff).toFixed(dec));
        s.takeProfit = parseFloat((s.takeProfit + entryDiff).toFixed(dec));
        s.tp1 = parseFloat((s.tp1 + entryDiff).toFixed(dec));
        s.tp2 = parseFloat((s.tp2 + entryDiff).toFixed(dec));
        s.tp3 = parseFloat((s.tp3 + entryDiff).toFixed(dec));
        s.currentSL = parseFloat((s.currentSL + entryDiff).toFixed(dec));
      };
      for (const s of cachedSignals) {
        const tv = tvMap[s.pair];
        if (tv && tv.price > 0) syncSignalPrice(s, tv);
      }
      for (const s of cachedCommoditySignals) {
        const tv = tvMap[s.pair];
        if (tv && tv.price > 0) syncSignalPrice(s, tv);
      }
      console.log("Synced signal prices with TradingView live data");
    } catch (err: any) {
      console.error("Could not sync prices with TradingView:", err.message);
    }

    const allAlerts = [...forexResult.alerts, ...commodityResult.alerts];
    cachedAlerts = [...cachedAlerts.filter(a => a.read), ...allAlerts];

    const allSignals = [...cachedSignals, ...cachedCommoditySignals];
    const highEvents = calendar.filter(e => e.impact === "HIGH");
    highEvents.forEach(e => {
      const riskSignals = allSignals.filter(s =>
        e.affectedPairs.includes(s.pair)
      );
      cachedAlerts.push({
        id: uid(),
        type: "market",
        title: `Evento ad alto rischio: ${e.event}`,
        message: `${e.date} alle ${e.time} - ${riskSignals.length > 0 ? `${riskSignals.length} segnali a rischio! ` : ""}${e.riskWarning}`,
        timestamp: new Date().toISOString(),
        read: false,
      });
    });

    lastGenerated = new Date();
    console.log(`Generated ${forexResult.signals.length} forex signals, ${commodityResult.signals.length} commodity signals, ${calendar.length} calendar events, ${cachedAlerts.length} alerts`);

    await persistActiveSignals();
  } catch (error: any) {
    console.error("Error generating signals:", error.message);
  } finally {
    isGenerating = false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  await loadPushTokensFromDb();

  app.get("/api/signals", (_req, res) => {
    res.json(cachedSignals);
  });

  app.get("/api/commodities/signals", (_req, res) => {
    res.json(cachedCommoditySignals);
  });

  app.get("/api/market-status", (_req, res) => {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();
    const isClosed = isMarketClosed();

    let nextOpen = "";
    if (isClosed) {
      const next = new Date(now);
      if (utcDay === 5) {
        next.setUTCDate(next.getUTCDate() + 2);
      } else if (utcDay === 6) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      next.setUTCHours(23, 0, 0, 0);
      nextOpen = next.toISOString();
    }

    const sessions = [
      {
        name: "Sydney",
        open: utcHour >= 22 || utcHour < 7,
        openUTC: 22,
        closeUTC: 7,
        timezone: "Australia/Sydney",
        volatilePairs: ["AUD/USD", "NZD/USD", "AUD/JPY", "AUD/NZD"],
      },
      {
        name: "Tokyo",
        open: utcHour >= 0 && utcHour < 9,
        openUTC: 0,
        closeUTC: 9,
        timezone: "Asia/Tokyo",
        volatilePairs: ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY"],
      },
      {
        name: "Londra",
        open: utcHour >= 8 && utcHour < 17,
        openUTC: 8,
        closeUTC: 17,
        timezone: "Europe/London",
        volatilePairs: ["EUR/USD", "GBP/USD", "EUR/GBP", "USD/CHF"],
      },
      {
        name: "New York",
        open: utcHour >= 13 && utcHour < 22,
        openUTC: 13,
        closeUTC: 22,
        timezone: "America/New_York",
        volatilePairs: ["EUR/USD", "USD/CAD", "GBP/USD", "XAU/USD"],
      },
    ];

    const nightSession = isNightSession();

    const sessionDetails = sessions.map(s => {
      let localTime = "";
      try {
        localTime = now.toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: s.timezone,
          hourCycle: "h23",
        });
      } catch { localTime = "--:--"; }
      return {
        name: s.name,
        open: s.open,
        openUTC: s.openUTC,
        closeUTC: s.closeUTC,
        timezone: s.timezone,
        localTime,
        volatilePairs: s.volatilePairs,
      };
    });

    res.json({
      isOpen: !isClosed,
      isClosed,
      isNightSession: nightSession,
      activeSessions: isClosed ? [] : sessions.filter(s => s.open).map(s => s.name),
      sessions: sessionDetails,
      nextOpen,
    });
  });

  app.post("/api/push-token", async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ success: false, message: "Token mancante" });
    }
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ success: false, message: "Token non valido" });
    }
    pushTokens.add(token);
    await savePushTokenToDb(token);
    console.log(`Push token registrato e salvato nel DB (${pushTokens.size} dispositivi totali)`);
    res.json({ success: true });
  });

  app.get("/api/news", async (req, res) => {
    try {
      const newsStale = (cachedNews.length === 0 && cachedCommodityNews.length === 0) || (Date.now() - newsLastRefreshed > NEWS_ROUTE_TTL);
      if (newsStale) {
        const rawRSS = await fetchFinancialNewsRSS();
        if (rawRSS.length > 0) {
          const [forexNews, cmdNews] = await Promise.all([
            processRealNews(rawRSS, "forex"),
            processRealNews(rawRSS, "commodities"),
          ]);
          cachedNews = forexNews;
          cachedCommodityNews = cmdNews;
          newsLastRefreshed = Date.now();
          console.log(`[NEWS] Refreshed: loaded ${forexNews.length} forex + ${cmdNews.length} commodity real news`);
        }
      }
      const market = req.query.market as string | undefined;
      if (market === "commodities") {
        return res.json(cachedCommodityNews);
      }
      if (market === "forex") {
        return res.json(cachedNews);
      }
      res.json([...cachedNews, ...cachedCommodityNews]);
    } catch (err: any) {
      console.error("News error:", err.message);
      res.json([...cachedNews, ...cachedCommodityNews]);
    }
  });

  app.get("/api/commodities/news", (_req, res) => {
    res.json(cachedCommodityNews);
  });

  app.get("/api/alerts", (req, res) => {
    const market = req.query.market as string | undefined;
    if (market) {
      return res.json(cachedAlerts.filter(a => !a.market || a.market === market));
    }
    res.json(cachedAlerts);
  });

  app.get("/api/calendar", async (req, res) => {
    try {
      const calendarStale = cachedCalendar.length === 0 || (Date.now() - calendarLastRefreshed > CALENDAR_ROUTE_TTL);
      if (calendarStale) {
        const rawEvents = await fetchRealCalendar();
        if (rawEvents.length > 0) {
          cachedCalendar = await buildCalendarFromReal(rawEvents);
          calendarLastRefreshed = Date.now();
          console.log(`[CALENDAR] Refreshed: loaded ${cachedCalendar.length} real events from ForexFactory`);
        } else if (cachedCalendar.length === 0) {
          console.log("[CALENDAR] ForexFactory unavailable, using AI fallback");
          cachedCalendar = await generateFallbackCalendar();
          calendarLastRefreshed = Date.now();
          console.log(`[CALENDAR] AI fallback: generated ${cachedCalendar.length} events`);
        }
      }
      const withSignals = req.query.signals === "true";
      const allSignals = [...cachedSignals, ...cachedCommoditySignals];
      if (withSignals && allSignals.length > 0) {
        const enriched = cachedCalendar.map(event => ({
          ...event,
          signalsAtRisk: allSignals
            .filter(s => event.affectedPairs.includes(s.pair))
            .map(s => ({
              pair: s.pair,
              action: s.action,
              confidence: s.confidence,
              strength: s.strength,
              market: s.market,
            })),
        }));
        return res.json(enriched);
      }
      res.json(cachedCalendar);
    } catch (err: any) {
      console.error("Calendar error:", err.message);
      res.json(cachedCalendar);
    }
  });

  app.get("/api/history/:id/replay", async (req, res) => {
    try {
      const { id } = req.params;
      const rows = await db.select().from(signalHistory).where(eq(signalHistory.id, id)).limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Segnale non trovato" });
      }
      const signal = rows[0];
      const entry = signal.entryPrice;
      const sl = signal.stopLoss;
      const tp1 = signal.tp1 ?? signal.takeProfit;
      const tp2 = signal.tp2 ?? signal.takeProfit;
      const tp3 = signal.tp3 ?? signal.takeProfit;
      const outcome = signal.outcome;
      const isBuy = signal.action === "BUY";

      let closePrice: number;
      if (outcome === "hit_tp3" || outcome === "hit_tp") {
        closePrice = tp3;
      } else if (outcome === "hit_tp2_then_sl") {
        closePrice = tp1;
      } else if (outcome === "hit_tp1_then_sl") {
        closePrice = entry;
      } else if (outcome === "hit_sl") {
        closePrice = sl;
      } else {
        closePrice = entry;
      }

      const totalPoints = 80;
      const pricePath: number[] = [];
      const range = Math.abs(tp3 - sl);
      const volatility = range * 0.012;

      type Waypoint = { pos: number; t: number };

      function buildPath(waypoints: Waypoint[], n: number, vol: number): number[] {
        const path: number[] = [];
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          let seg = waypoints.length - 2;
          for (let j = 0; j < waypoints.length - 1; j++) {
            if (t <= waypoints[j + 1].t) { seg = j; break; }
          }
          const s = waypoints[seg];
          const e = waypoints[seg + 1];
          const localT = (t - s.t) / (e.t - s.t);
          const eased = localT * localT * (3 - 2 * localT);
          const target = s.pos + (e.pos - s.pos) * eased;
          const noise = (Math.random() - 0.5) * vol;
          path.push(parseFloat((target + noise).toFixed(5)));
        }
        return path;
      }

      let waypoints: Waypoint[];

      if (outcome === "hit_tp3" || outcome === "hit_tp") {
        waypoints = [
          { pos: entry, t: 0 },
          { pos: tp1, t: 0.25 },
          { pos: isBuy ? tp1 - (tp2 - tp1) * 0.2 : tp1 + (tp1 - tp2) * 0.2, t: 0.35 },
          { pos: tp2, t: 0.60 },
          { pos: isBuy ? tp2 - (tp3 - tp2) * 0.15 : tp2 + (tp2 - tp3) * 0.15, t: 0.70 },
          { pos: tp3, t: 1.0 },
        ];
      } else if (outcome === "hit_tp2_then_sl") {
        waypoints = [
          { pos: entry, t: 0 },
          { pos: tp1, t: 0.28 },
          { pos: isBuy ? tp1 - (tp2 - tp1) * 0.15 : tp1 + (tp1 - tp2) * 0.15, t: 0.38 },
          { pos: tp2, t: 0.62 },
          { pos: tp1, t: 1.0 },
        ];
      } else if (outcome === "hit_tp1_then_sl") {
        waypoints = [
          { pos: entry, t: 0 },
          { pos: tp1, t: 0.42 },
          { pos: isBuy ? tp1 + (tp2 - tp1) * 0.15 : tp1 - (tp1 - tp2) * 0.15, t: 0.52 },
          { pos: entry, t: 1.0 },
        ];
      } else {
        const partial = isBuy
          ? entry + (tp1 - entry) * 0.3
          : entry - (entry - tp1) * 0.3;
        waypoints = [
          { pos: entry, t: 0 },
          { pos: partial, t: 0.28 },
          { pos: entry, t: 0.50 },
          { pos: sl, t: 1.0 },
        ];
      }

      const built = buildPath(waypoints, totalPoints, volatility);
      pricePath.push(...built);
      pricePath[0] = entry;
      pricePath[pricePath.length - 1] = closePrice;

      res.json({
        id: signal.id,
        pair: signal.pair,
        action: signal.action,
        entry,
        sl,
        tp1,
        tp2,
        tp3,
        closePrice,
        outcome,
        pipResult: signal.pipResult ?? 0,
        confidence: signal.confidence,
        strength: signal.strength,
        timeframe: signal.timeframe,
        createdAt: signal.createdAt.toISOString(),
        closedAt: signal.closedAt?.toISOString() ?? null,
        pricePath,
      });
    } catch (err: any) {
      console.error("Error fetching replay data:", err.message);
      res.status(500).json({ error: "Errore interno" });
    }
  });

  app.get("/api/history", async (req, res) => {
    try {
      const history = await db.select().from(signalHistory)
        .orderBy(desc(signalHistory.createdAt))
        .limit(200);
      const market = req.query.market as string | undefined;
      if (market === "commodities") {
        return res.json(history.filter(h => h.pair.startsWith("X") || ["WTI/USD", "BRENT/USD", "NG/USD"].includes(h.pair)));
      }
      if (market === "forex") {
        return res.json(history.filter(h => !h.pair.startsWith("X") && !["WTI/USD", "BRENT/USD", "NG/USD"].includes(h.pair)));
      }
      res.json(history);
    } catch (err: any) {
      console.error("Error fetching history:", err.message);
      res.json([]);
    }
  });

  app.get("/api/stats", async (req, res) => {
    try {
      const all = await db.select().from(signalHistory);
      const market = req.query.market as string | undefined;
      const isCommodity = (pair: string) => pair.startsWith("X") || ["WTI/USD", "BRENT/USD", "NG/USD"].includes(pair);
      const filtered = market === "commodities" ? all.filter(s => isCommodity(s.pair)) :
                       market === "forex" ? all.filter(s => !isCommodity(s.pair)) : all;

      const isWin = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
      const isLoss = (o: string) => o === "hit_sl";
      const isClosed = (o: string) => isWin(o) || isLoss(o);

      const closed = filtered.filter(s => isClosed(s.outcome));
      const wins = closed.filter(s => isWin(s.outcome));
      const losses = closed.filter(s => isLoss(s.outcome));
      const expired = filtered.filter(s => s.outcome === "expired").length;
      const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
      const avgPips = closed.length > 0
        ? parseFloat((closed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0) / closed.length).toFixed(1))
        : 0;
      const totalPips = parseFloat(closed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));

      const tp3Full = closed.filter(s => s.outcome === "hit_tp3" || s.outcome === "hit_tp").length;
      const tp2Partial = closed.filter(s => s.outcome === "hit_tp2_then_sl").length;
      const tp1Partial = closed.filter(s => s.outcome === "hit_tp1_then_sl").length;

      const pairStats: Record<string, { wins: number; total: number }> = {};
      closed.forEach(s => {
        if (!pairStats[s.pair]) pairStats[s.pair] = { wins: 0, total: 0 };
        pairStats[s.pair].total++;
        if (isWin(s.outcome)) pairStats[s.pair].wins++;
      });
      const bestPair = Object.entries(pairStats)
        .sort(([, a], [, b]) => (b.wins / b.total) - (a.wins / a.total))[0];

      res.json({
        totalSignals: filtered.length,
        closedSignals: closed.length,
        wins: wins.length,
        losses: losses.length,
        pending: filtered.filter(s => s.outcome === "pending").length,
        winRate,
        avgPips,
        totalPips,
        tp3Full,
        tp2Partial,
        tp1Partial,
        bestPair: bestPair ? { pair: bestPair[0], winRate: Math.round((bestPair[1].wins / bestPair[1].total) * 100) } : null,
      });
    } catch (err: any) {
      console.error("Error fetching stats:", err.message);
      res.json({ totalSignals: 0, closedSignals: 0, wins: 0, losses: 0, pending: 0, winRate: 0, avgPips: 0, totalPips: 0, bestPair: null });
    }
  });

  app.get("/api/stats/timeline", async (_req, res) => {
    try {
      const all = await db.select().from(signalHistory).orderBy(signalHistory.createdAt);
      const isClosedOutcome = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl" || o === "hit_sl";
      const closed = all.filter(s => isClosedOutcome(s.outcome) && s.closedAt);

      let cumulative = 0;
      const equityCurve: { date: string; pips: number; tpLevel: number; outcome: string }[] = [];
      for (const s of closed) {
        cumulative += s.pipResult ?? 0;
        equityCurve.push({
          date: (s.closedAt ?? s.createdAt).toISOString(),
          pips: parseFloat(cumulative.toFixed(1)),
          tpLevel: s.tpLevel ?? 0,
          outcome: s.outcome,
        });
      }

      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      const weekClosed = closed.filter(s => new Date(s.closedAt ?? s.createdAt) >= weekAgo);
      const monthClosed = closed.filter(s => new Date(s.closedAt ?? s.createdAt) >= monthAgo);

      const calcBreakdown = (items: typeof closed) => {
        const isW = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
        const wins = items.filter(s => isW(s.outcome)).length;
        const losses = items.filter(s => s.outcome === "hit_sl").length;
        const total = items.length;
        const totalPips = parseFloat(items.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));
        const tp3Count = items.filter(s => s.outcome === "hit_tp3" || s.outcome === "hit_tp").length;
        const tp2Count = items.filter(s => s.outcome === "hit_tp2_then_sl").length;
        const tp1Count = items.filter(s => s.outcome === "hit_tp1_then_sl").length;
        const slCount = losses;
        return {
          total,
          wins,
          losses,
          winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
          totalPips,
          tp3Count,
          tp2Count,
          tp1Count,
          slCount,
        };
      };

      res.json({
        equityCurve,
        weekly: calcBreakdown(weekClosed),
        monthly: calcBreakdown(monthClosed),
        allTime: calcBreakdown(closed),
      });
    } catch (err: any) {
      console.error("Error fetching stats timeline:", err.message);
      res.json({
        equityCurve: [],
        weekly: { total: 0, wins: 0, losses: 0, winRate: 0, totalPips: 0 },
        monthly: { total: 0, wins: 0, losses: 0, winRate: 0, totalPips: 0 },
        allTime: { total: 0, wins: 0, losses: 0, winRate: 0, totalPips: 0 },
      });
    }
  });

  app.get("/api/stats/pairs", async (_req, res) => {
    try {
      const all = await db.select().from(signalHistory);
      const pairMap: Record<string, typeof all> = {};
      for (const s of all) {
        if (!pairMap[s.pair]) pairMap[s.pair] = [];
        pairMap[s.pair].push(s);
      }

      const result: Record<string, { wins: number; losses: number; total: number; winRate: number; totalPips: number; pipsHistory: number[] }> = {};
      for (const [pair, items] of Object.entries(pairMap)) {
        const isWinO = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
        const isClosedO = (o: string) => isWinO(o) || o === "hit_sl";
        const closed = items.filter(s => isClosedO(s.outcome));
        const wins = closed.filter(s => isWinO(s.outcome)).length;
        const losses = closed.filter(s => s.outcome === "hit_sl").length;
        const totalPips = parseFloat(closed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));

        const sorted = closed.sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
        let cum = 0;
        const pipsHistory = sorted.map(s => {
          cum += s.pipResult ?? 0;
          return parseFloat(cum.toFixed(1));
        });

        result[pair] = {
          wins,
          losses,
          total: closed.length,
          winRate: closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0,
          totalPips,
          pipsHistory,
        };
      }
      res.json(result);
    } catch (err: any) {
      console.error("Error fetching pair stats:", err.message);
      res.json({});
    }
  });

  app.get("/api/performance", async (_req, res) => {
    try {
      let scalpingStats = null;
      try {
        const scalpAll = await db.select().from(scalpingSignals);
        const scalpClosed = scalpAll.filter(s => s.status === "hit_tp2" || s.status === "hit_sl" || s.status === "expired");
        if (scalpClosed.length > 0) {
          const scalpTP2 = scalpClosed.filter(s => s.status === "hit_tp2").length;
          const scalpTP1Only = scalpClosed.filter(s => s.beActive && s.status !== "hit_tp2").length;
          const scalpSL = scalpClosed.filter(s => s.status === "hit_sl").length;
          const scalpExpired = scalpClosed.filter(s => s.status === "expired").length;
          const scalpWinCount = scalpTP2 + scalpTP1Only;
          const scalpTotalPips = parseFloat(scalpClosed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));
          const scalpAvgPips = parseFloat((scalpTotalPips / scalpClosed.length).toFixed(1));
          scalpingStats = {
            total: scalpClosed.length,
            wins: scalpWinCount,
            winRate: Math.round((scalpWinCount / scalpClosed.length) * 100),
            totalPips: scalpTotalPips,
            avgPips: scalpAvgPips,
            tp1Pct: Math.round((scalpTP1Only / scalpClosed.length) * 100),
            tp2Pct: Math.round((scalpTP2 / scalpClosed.length) * 100),
            slPct: Math.round((scalpSL / scalpClosed.length) * 100),
            expiredPct: Math.round((scalpExpired / scalpClosed.length) * 100),
            tp1Count: scalpTP1Only,
            tp2Count: scalpTP2,
            slCount: scalpSL,
            expiredCount: scalpExpired,
          };
        }
      } catch (e) {}

      const all = await db.select().from(signalHistory).orderBy(signalHistory.createdAt);
      const isWin = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
      const isClosed = (o: string) => isWin(o) || o === "hit_sl";
      const closed = all.filter(s => isClosed(s.outcome));

      if (closed.length === 0) {
        return res.json({ empty: true, scalpingStats: scalpingStats || null });
      }

      const wins = closed.filter(s => isWin(s.outcome));
      const losses = closed.filter(s => s.outcome === "hit_sl");
      const winRate = Math.round((wins.length / closed.length) * 100);
      const totalPips = parseFloat(closed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));
      const winPips = parseFloat(wins.reduce((sum, s) => sum + Math.abs(s.pipResult ?? 0), 0).toFixed(1));
      const lossPips = parseFloat(losses.reduce((sum, s) => sum + Math.abs(s.pipResult ?? 0), 0).toFixed(1));
      const profitFactor = lossPips > 0 ? parseFloat((winPips / lossPips).toFixed(2)) : winPips > 0 ? 99.9 : 0;

      const rrValues = closed.map(s => {
        const entry = s.entryPrice;
        const sl = s.stopLoss;
        const pipMultiplier = s.pair.includes("JPY") ? 100 : 10000;
        const riskPips = Math.abs(entry - sl) * pipMultiplier;
        if (riskPips === 0) return 0;
        const resultPips = s.pipResult ?? 0;
        return parseFloat((resultPips / riskPips).toFixed(2));
      });
      const avgRR = rrValues.length > 0 ? parseFloat((rrValues.reduce((a, b) => a + b, 0) / rrValues.length).toFixed(2)) : 0;

      const closedSorted = [...closed].sort((a, b) =>
        new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime()
      );
      let cumPips = 0;
      const equityCurve = closedSorted.map(s => {
        cumPips += s.pipResult ?? 0;
        return {
          date: (s.closedAt ?? s.createdAt).toISOString(),
          pips: parseFloat(cumPips.toFixed(1)),
          outcome: s.outcome,
        };
      });

      const pairBreakdown: Record<string, { wins: number; losses: number; total: number; winRate: number; totalPips: number; buyCount: number; sellCount: number; buyWins: number; sellWins: number }> = {};
      for (const s of closed) {
        if (!pairBreakdown[s.pair]) pairBreakdown[s.pair] = { wins: 0, losses: 0, total: 0, winRate: 0, totalPips: 0, buyCount: 0, sellCount: 0, buyWins: 0, sellWins: 0 };
        const p = pairBreakdown[s.pair];
        p.total++;
        p.totalPips += s.pipResult ?? 0;
        if (s.action === "BUY") { p.buyCount++; if (isWin(s.outcome)) p.buyWins++; }
        else if (s.action === "SELL") { p.sellCount++; if (isWin(s.outcome)) p.sellWins++; }
        if (isWin(s.outcome)) p.wins++;
        else p.losses++;
      }
      for (const p of Object.values(pairBreakdown)) {
        p.winRate = p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0;
        p.totalPips = parseFloat(p.totalPips.toFixed(1));
      }

      const tp3 = closed.filter(s => s.outcome === "hit_tp3" || s.outcome === "hit_tp").length;
      const tp2 = closed.filter(s => s.outcome === "hit_tp2_then_sl").length;
      const tp1 = closed.filter(s => s.outcome === "hit_tp1_then_sl").length;

      res.json({
        empty: false,
        totalTrades: closed.length,
        winRate,
        profitFactor,
        totalPips,
        avgRR,
        wins: wins.length,
        losses: losses.length,
        tp3, tp2, tp1,
        equityCurve,
        pairBreakdown,
        scalpingStats,
      });
    } catch (err: any) {
      console.error("Error fetching performance:", err.message);
      res.json({ empty: true, scalpingStats: null });
    }
  });

  app.get("/api/stats/daily", async (req, res) => {
    try {
      const all = await db.select().from(signalHistory);
      const market = req.query.market as string | undefined;
      const isCommodity = (pair: string) => pair.startsWith("X") || ["WTI/USD", "BRENT/USD", "NG/USD"].includes(pair);
      const marketFiltered = market === "commodities" ? all.filter(s => isCommodity(s.pair)) :
                             market === "forex" ? all.filter(s => !isCommodity(s.pair)) : all;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayClosed = marketFiltered.filter(s => {
        const closedDate = s.closedAt ?? s.createdAt;
        return new Date(closedDate) >= today && s.outcome !== "pending" && s.outcome !== "expired";
      });

      const isWin = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
      const tp1Count = todayClosed.filter(s => s.outcome === "hit_tp1_then_sl").length;
      const tp2Count = todayClosed.filter(s => s.outcome === "hit_tp2_then_sl").length;
      const tp3Count = todayClosed.filter(s => s.outcome === "hit_tp3" || s.outcome === "hit_tp").length;
      const slCount = todayClosed.filter(s => s.outcome === "hit_sl").length;
      const wins = todayClosed.filter(s => isWin(s.outcome)).length;
      const totalPips = parseFloat(todayClosed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));
      const winRate = todayClosed.length > 0 ? Math.round((wins / todayClosed.length) * 100) : 0;

      res.json({
        total: todayClosed.length,
        tp1: tp1Count,
        tp2: tp2Count,
        tp3: tp3Count,
        sl: slCount,
        wins,
        totalPips,
        winRate,
      });
    } catch (err: any) {
      console.error("Error fetching daily stats:", err.message);
      res.json({ total: 0, tp1: 0, tp2: 0, tp3: 0, sl: 0, wins: 0, totalPips: 0, winRate: 0 });
    }
  });

  app.get("/api/stats/:pair", async (req, res) => {
    try {
      const pair = decodeURIComponent(req.params.pair);
      const all = await db.select().from(signalHistory);
      const pairSignals = all.filter(s => s.pair === pair);
      const isWinO = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
      const isClosedO = (o: string) => isWinO(o) || o === "hit_sl";
      const closed = pairSignals.filter(s => isClosedO(s.outcome));
      const wins = closed.filter(s => isWinO(s.outcome));
      const losses = closed.filter(s => s.outcome === "hit_sl");
      const pending = pairSignals.filter(s => s.outcome === "pending" || s.outcome === "expired");
      const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
      const totalPips = parseFloat(closed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));
      const avgPips = closed.length > 0
        ? parseFloat((closed.reduce((sum, s) => sum + (s.pipResult ?? 0), 0) / closed.length).toFixed(1))
        : 0;

      res.json({
        pair,
        totalSignals: pairSignals.length,
        closedSignals: closed.length,
        wins: wins.length,
        losses: losses.length,
        pending: pending.length,
        winRate,
        totalPips,
        avgPips,
      });
    } catch (err: any) {
      console.error("Error fetching pair stats:", err.message);
      res.json({ pair: req.params.pair, totalSignals: 0, closedSignals: 0, wins: 0, losses: 0, pending: 0, winRate: 0, totalPips: 0, avgPips: 0 });
    }
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      signals: cachedSignals.length,
      commoditySignals: cachedCommoditySignals.length,
      news: cachedNews.length + cachedCommodityNews.length,
      alerts: cachedAlerts.length,
      calendar: cachedCalendar.length,
      lastGenerated: lastGenerated?.toISOString() ?? null,
      isGenerating,
    });
  });

  app.post("/api/signals/generate", async (_req, res) => {
    if (isMarketClosed()) {
      return res.status(400).json({ success: false, message: "Mercato chiuso. I segnali verranno generati automaticamente alla riapertura." });
    }
    if (isNightSession()) {
      return res.status(400).json({ success: false, message: "Fascia notturna (20:00-06:00). La generazione riprende alle 06:00 CET per evitare segnali in condizioni di bassa liquidita." });
    }
    if (isGenerating) {
      return res.json({ success: false, message: "Generazione in corso..." });
    }
    try {
      await doGenerate();
      res.json({
        success: true,
        signals: cachedSignals.length,
        commoditySignals: cachedCommoditySignals.length,
        news: cachedNews.length + cachedCommodityNews.length,
        calendar: cachedCalendar.length,
        alerts: cachedAlerts.length,
        generatedAt: lastGenerated?.toISOString(),
      });
    } catch (error: any) {
      console.error("Error generating signals:", error);
      res.status(500).json({ error: "Errore nella generazione dei segnali: " + error.message });
    }
  });

  app.get("/api/scalping/signals", (_req, res) => {
    res.json(cachedScalpingSignals);
  });

  app.get("/api/scalping/history", async (_req, res) => {
    try {
      const rows = await db.select().from(scalpingSignals)
        .where(sql`${scalpingSignals.status} != 'active' AND ${scalpingSignals.status} != 'hit_tp1'`)
        .orderBy(desc(scalpingSignals.closedAt))
        .limit(30);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/scalping/stats", async (_req, res) => {
    try {
      const rows = await db.select().from(scalpingSignals);
      const closed = rows.filter(r => r.status !== "active" && r.status !== "hit_tp1");
      const wins = closed.filter(r => r.status === "hit_tp2" || r.status === "hit_tp1_then_sl" || (r.pipResult ?? 0) > 0);
      const totalPips = closed.reduce((sum, r) => sum + (r.pipResult ?? 0), 0);
      res.json({
        total: rows.length,
        active: rows.filter(r => r.status === "active" || r.status === "hit_tp1").length,
        closed: closed.length,
        wins: wins.length,
        winRate: closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0,
        totalPips: parseFloat(totalPips.toFixed(1)),
        avgPips: closed.length > 0 ? parseFloat((totalPips / closed.length).toFixed(1)) : 0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/scalping/generate", async (_req, res) => {
    if (isMarketClosed()) {
      return res.status(400).json({ success: false, message: "Mercato chiuso" });
    }
    try {
      await generateAndAddScalpingSignal();
      res.json({ success: true, signals: cachedScalpingSignals.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/scalping/radar", (_req, res) => {
    if (!cachedScalpingRadar) {
      return res.json(null);
    }
    const elapsed = Math.round((Date.now() - lastScalpingCheckTime) / 1000);
    const nextCheck = Math.max(0, Math.round(SCALPING_GENERATION_INTERVAL / 1000) - elapsed);
    res.json({ ...cachedScalpingRadar, nextCheckIn: nextCheck });
  });

  app.post("/api/alerts/:id/read", (req, res) => {
    const { id } = req.params;
    const alert = cachedAlerts.find((a) => a.id === id);
    if (alert) {
      alert.read = true;
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Alert non trovato" });
    }
  });

  app.post("/api/alerts/read-all", (_req, res) => {
    cachedAlerts.forEach((a) => (a.read = true));
    res.json({ success: true });
  });

  app.get("/api/price-alerts", async (_req, res) => {
    try {
      const alerts = await db.select().from(priceAlerts).orderBy(desc(priceAlerts.createdAt));
      res.json(alerts);
    } catch (err: any) {
      console.error("Error fetching price alerts:", err.message);
      res.json([]);
    }
  });

  app.post("/api/price-alerts", async (req, res) => {
    try {
      const { pair, targetPrice, direction, note } = req.body;
      if (!pair || !targetPrice || !direction) {
        return res.status(400).json({ error: "Pair, targetPrice e direction sono obbligatori" });
      }
      if (direction !== "above" && direction !== "below") {
        return res.status(400).json({ error: "Direction deve essere 'above' o 'below'" });
      }
      const [created] = await db.insert(priceAlerts).values({
        pair,
        targetPrice: parseFloat(targetPrice),
        direction,
        note: note || null,
      }).returning();
      res.json(created);
    } catch (err: any) {
      console.error("Error creating price alert:", err.message);
      res.status(500).json({ error: "Errore nella creazione dell'avviso" });
    }
  });

  app.delete("/api/price-alerts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting price alert:", err.message);
      res.status(500).json({ error: "Errore nella cancellazione dell'avviso" });
    }
  });

  app.get("/api/quotes", async (req, res) => {
    try {
      const market = req.query.market as string | undefined;
      let quotes: TVQuote[];
      if (market === "commodities") {
        quotes = await fetchCommodityQuotes();
      } else if (market === "forex") {
        quotes = await fetchForexQuotes();
      } else {
        quotes = await fetchAllQuotes();
      }
      res.json(quotes);
    } catch (err: any) {
      console.error("TradingView quotes error:", err.message);
      res.status(500).json({ error: "Failed to fetch quotes" });
    }
  });

  app.get("/api/rates/batch", async (req, res) => {
    const market = req.query.market as string | undefined;
    const signals = market === "commodities" ? cachedCommoditySignals : cachedSignals;
    const pairs = signals.map(s => ({ base: s.base, quote: s.quote, pair: `${s.base}-${s.quote}`, fullPair: s.pair }));
    const results: Record<string, number[]> = {};

    let tvQuotes: TVQuote[] = [];
    try {
      tvQuotes = market === "commodities"
        ? await fetchCommodityQuotes(pairs.map(p => p.fullPair))
        : await fetchForexQuotes(pairs.map(p => p.fullPair));
    } catch (err: any) {
      console.error("TradingView batch fetch error:", err.message);
    }

    const tvPriceMap: Record<string, TVQuote> = {};
    for (const q of tvQuotes) {
      tvPriceMap[q.pair] = q;
    }

    await Promise.all(
      pairs.map(async (p) => {
        if (ratesCache[p.pair] && Date.now() - ratesCache[p.pair].fetchedAt < RATES_TTL) {
          const cached = [...ratesCache[p.pair].data];
          const tvQ = tvPriceMap[p.fullPair];
          if (tvQ) cached[cached.length - 1] = tvQ.price;
          results[p.pair] = cached;
          return;
        }
        try {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 30);
          const from = startDate.toISOString().split("T")[0];
          const to = endDate.toISOString().split("T")[0];
          const url = `https://api.frankfurter.app/${from}..${to}?from=${p.base}&to=${p.quote}`;
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json() as { rates: Record<string, Record<string, number>> };
            const rates = Object.values(data.rates).map((r) => Object.values(r)[0]);
            const tvQ = tvPriceMap[p.fullPair];
            if (tvQ) rates.push(tvQ.price);
            ratesCache[p.pair] = { data: rates, fetchedAt: Date.now() };
            results[p.pair] = rates;
          } else {
            throw new Error("API error");
          }
        } catch {
          const tvQ = tvPriceMap[p.fullPair];
          const basePrice = tvQ?.price ?? signals.find(s => s.base === p.base && s.quote === p.quote)?.entryPrice ?? 100;
          const fallback: number[] = [];
          let val = tvQ?.open ?? basePrice * (1 - 0.005);
          const steps = 20;
          const target = basePrice;
          for (let i = 0; i < steps; i++) {
            const progress = i / (steps - 1);
            val += (target - val) * progress * 0.3 + (Math.random() - 0.5) * basePrice * 0.004;
            fallback.push(parseFloat(val.toFixed(val > 100 ? 2 : 5)));
          }
          fallback.push(parseFloat(basePrice.toFixed(basePrice > 100 ? 2 : 5)));
          results[p.pair] = fallback;
        }
      })
    );

    res.json(results);
  });

  app.get("/api/rates/:pair", async (req, res) => {
    const pair = req.params.pair;
    const parts = pair.split("-");
    if (parts.length !== 2) return res.status(400).json({ error: "Use format BASE-QUOTE, e.g. EUR-USD" });
    const [base, quote] = parts;
    const cacheKey = `${base}-${quote}`;
    const fullPair = `${base}/${quote}`;

    if (ratesCache[cacheKey] && Date.now() - ratesCache[cacheKey].fetchedAt < RATES_TTL) {
      return res.json({ pair: cacheKey, rates: ratesCache[cacheKey].data });
    }

    let tvPrice: number | null = null;
    try {
      const quotes = await fetchAllQuotes();
      const q = quotes.find(q => q.pair === fullPair);
      if (q) tvPrice = q.price;
    } catch (err: any) {
      console.error("TradingView single-pair fetch error:", err.message);
    }

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const from = startDate.toISOString().split("T")[0];
      const to = endDate.toISOString().split("T")[0];
      const url = `https://api.frankfurter.app/${from}..${to}?from=${base.toUpperCase()}&to=${quote.toUpperCase()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("API error");
      const data = await response.json() as { rates: Record<string, Record<string, number>> };
      const rates = Object.values(data.rates).map((r) => Object.values(r)[0]);
      if (tvPrice !== null) rates.push(tvPrice);
      ratesCache[cacheKey] = { data: rates, fetchedAt: Date.now() };
      res.json({ pair: cacheKey, rates });
    } catch (err: any) {
      console.error("Rates fetch error:", err.message);
      const allSignals = [...cachedSignals, ...cachedCommoditySignals];
      const sig = allSignals.find(s => s.base === base && s.quote === quote);
      const basePrice = tvPrice ?? sig?.entryPrice ?? 1;
      const fallback: number[] = [];
      let val = basePrice;
      for (let i = 0; i < 20; i++) {
        val += (Math.random() - 0.5) * basePrice * 0.01;
        fallback.push(parseFloat(val.toFixed(val > 100 ? 2 : 5)));
      }
      if (tvPrice !== null) fallback.push(tvPrice);
      res.json({ pair: cacheKey, rates: fallback });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const clientIp = req.ip || "unknown";
      const now = Date.now();
      const timestamps = (chatRateLimit.get(clientIp) || []).filter(t => now - t < CHAT_RATE_WINDOW);
      if (timestamps.length >= CHAT_RATE_LIMIT) {
        return res.status(429).json({ error: "Troppe richieste. Riprova tra un minuto." });
      }
      timestamps.push(now);
      chatRateLimit.set(clientIp, timestamps);

      const { message } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message required" });
      }

      const allSignals = [...cachedSignals, ...cachedCommoditySignals];
      const signalContext = allSignals.slice(0, 10).map(s =>
        `${s.pair}: ${s.action} (conf ${s.confidence}%, entry ${s.entryPrice}, SL ${s.stopLoss}, TP ${s.takeProfit}, R:R ${s.riskReward})`
      ).join("\n");

      const calendarContext = cachedCalendar.slice(0, 5).map(e =>
        `${e.event} (${e.impact}) - ${e.time} UTC - ${e.currencies.join(", ")}`
      ).join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.5,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content: `Sei un coach di trading forex esperto. Rispondi SEMPRE in italiano. Sei integrato in un'app di segnali di trading. Hai accesso ai segnali attivi e agli eventi economici. Rispondi in modo conciso, professionale e utile. Non dare mai consigli finanziari diretti ma analisi tecniche. Usa un tono amichevole ma professionale.

SEGNALI ATTIVI:
${signalContext || "Nessun segnale attivo"}

EVENTI ECONOMICI:
${calendarContext || "Nessun evento imminente"}`
          },
          { role: "user", content: message }
        ]
      });

      const reply = completion.choices[0]?.message?.content || "Mi dispiace, non sono riuscito a elaborare una risposta.";
      res.json({ reply });
    } catch (err: any) {
      console.error("Chat error:", err.message);
      res.status(500).json({ error: "Errore nel generare la risposta" });
    }
  });

  app.get("/api/briefing", async (_req, res) => {
    try {
      if (cachedBriefing && Date.now() - cachedBriefing.generatedAt < BRIEFING_TTL) {
        return res.json({ briefing: cachedBriefing.text, generatedAt: cachedBriefing.generatedAt });
      }

      const allSignals = [...cachedSignals, ...cachedCommoditySignals];
      const buyCount = allSignals.filter(s => s.action === "BUY").length;
      const sellCount = allSignals.filter(s => s.action === "SELL").length;
      const holdCount = allSignals.filter(s => s.action === "HOLD").length;
      const topSignals = allSignals.filter(s => s.confidence >= 75).slice(0, 5).map(s =>
        `${s.pair} ${s.action} (${s.confidence}%)`
      ).join(", ");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 500,
        messages: [{
          role: "system",
          content: `Sei un analista di mercato senior. Scrivi un briefing mattutino in italiano per trader forex. Formato: un titolo breve (max 8 parole), poi 4-5 punti chiave separati da "|". Ogni punto max 15 parole. Tono professionale, dati concreti. Non usare emoji.`
        }, {
          role: "user",
          content: `Data: ${new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Segnali attivi: ${buyCount} BUY, ${sellCount} SELL, ${holdCount} HOLD. Top segnali: ${topSignals || "nessuno"}. Genera il briefing.`
        }]
      });

      const text = completion.choices[0]?.message?.content || "Briefing non disponibile";
      cachedBriefing = { text, generatedAt: Date.now() };
      res.json({ briefing: text, generatedAt: cachedBriefing.generatedAt });
    } catch (err: any) {
      console.error("Briefing error:", err.message);
      res.status(500).json({ error: "Errore briefing" });
    }
  });

  app.get("/api/strength", async (_req, res) => {
    try {
      const indicators = await fetchForexIndicators();
      const currencies: Record<string, number> = {};
      const allCurrencies = ["EUR", "USD", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"];
      for (const c of allCurrencies) currencies[c] = 0;

      for (const [pair, ind] of indicators) {
        const [base, quote] = pair.split("/");
        const weightedRec = ind.recommend_h1 * 0.2 + ind.recommend_h4 * 0.5 + ind.recommend_d1 * 0.3;
        if (currencies[base] !== undefined) {
          currencies[base] += weightedRec;
        }
        if (currencies[quote] !== undefined) {
          currencies[quote] -= weightedRec;
        }
      }

      const rawStrength = allCurrencies.map(c => ({
        currency: c,
        raw: currencies[c],
      }));

      const minRaw = Math.min(...rawStrength.map(s => s.raw));
      const maxRaw = Math.max(...rawStrength.map(s => s.raw));
      const range = maxRaw - minRaw;

      const strength = rawStrength.map(s => {
        if (range === 0) return { currency: s.currency, strength: 50 };
        const normalized = (s.raw - minRaw) / range * 2 - 1;
        const pct = parseFloat(((normalized + 1) / 2 * 100).toFixed(1));
        return { currency: s.currency, strength: pct };
      }).sort((a, b) => b.strength - a.strength);

      console.log(`[STRENGTH] Computed from TradingView Recommend.All (H1:20% H4:50% D1:30%), raw range: ${minRaw.toFixed(3)}..${maxRaw.toFixed(3)}, normalized -1..+1 -> 0..100`);
      res.json(strength);
    } catch (err: any) {
      console.error("Strength error:", err.message);
      res.json([]);
    }
  });

  app.get("/api/sentiment", (_req, res) => {
    const allSignals = [...cachedSignals, ...cachedCommoditySignals];
    const sentiment = allSignals.map(s => {
      let score = 0;
      if (s.action === "BUY") score = 30;
      else if (s.action === "SELL") score = -30;

      score += (s.confidence - 50) * 0.8;
      score += (s.strength - 50) * 0.4;

      if (s.change24h > 0) score += Math.min(s.change24h * 10, 20);
      else score += Math.max(s.change24h * 10, -20);

      score = Math.max(-100, Math.min(100, Math.round(score)));
      return { pair: s.pair, score, action: s.action, confidence: s.confidence };
    });
    res.json(sentiment);
  });

  app.get("/api/market-sentiment", async (_req, res) => {
    try {
      if (cachedMarketSentiment && Date.now() - cachedMarketSentiment.generatedAt < MARKET_SENTIMENT_TTL) {
        return res.json(cachedMarketSentiment.data);
      }

      const allSignals = [...cachedSignals, ...cachedCommoditySignals];
      const allNews = [...cachedNews, ...cachedCommodityNews].slice(0, 8);

      if (allSignals.length === 0) {
        const fallback = { label: "Neutro", score: 0, summary: "Dati insufficienti per analizzare il sentiment.", details: [], trend: "stabile" };
        return res.json(fallback);
      }

      const buyCount = allSignals.filter(s => s.action === "BUY").length;
      const sellCount = allSignals.filter(s => s.action === "SELL").length;
      const holdCount = allSignals.filter(s => s.action === "HOLD").length;
      const avgConfidence = Math.round(allSignals.reduce((s, x) => s + x.confidence, 0) / allSignals.length);
      const avgStrength = Math.round(allSignals.reduce((s, x) => s + x.strength, 0) / allSignals.length);
      const signalSummary = allSignals.map(s => `${s.pair}: ${s.action} (conf ${s.confidence}%, forza ${s.strength}%)`).join(", ");
      const newsSummary = allNews.map(n => n.title).join("; ");

      const prompt = `Sei un analista di mercato senior. Analizza il sentiment globale dei mercati forex e materie prime basandoti su questi dati REALI di oggi.

SEGNALI ATTIVI (${allSignals.length} totali):
- BUY: ${buyCount}, SELL: ${sellCount}, HOLD: ${holdCount}
- Confidenza media: ${avgConfidence}%, Forza media: ${avgStrength}%
- Dettaglio: ${signalSummary}

NOTIZIE RECENTI:
${newsSummary || "Nessuna notizia disponibile"}

Rispondi SOLO con un JSON object:
{
  "label": "Risk-On" | "Risk-Off" | "Neutro",
  "score": numero da -100 (panico totale) a +100 (euforia totale),
  "summary": "Una frase concisa che descrive il sentiment globale del mercato oggi (max 120 caratteri)",
  "details": ["Punto chiave 1 (max 60 caratteri)", "Punto chiave 2 (max 60 caratteri)", "Punto chiave 3 (max 60 caratteri)"],
  "trend": "rialzista" | "ribassista" | "laterale"
}

REGOLE:
- Risk-On = mercato propende per il rischio, prevalgono BUY, ottimismo
- Risk-Off = mercato fugge dal rischio, prevalgono SELL, incertezza
- Sii preciso e professionale. Niente emoji. Italiano.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 400,
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }

      const result = {
        label: ["Risk-On", "Risk-Off", "Neutro"].includes(parsed.label) ? parsed.label : "Neutro",
        score: typeof parsed.score === "number" ? Math.max(-100, Math.min(100, parsed.score)) : 0,
        summary: parsed.summary ?? "Analisi sentiment non disponibile.",
        details: Array.isArray(parsed.details) ? parsed.details.slice(0, 3) : [],
        trend: ["rialzista", "ribassista", "laterale"].includes(parsed.trend) ? parsed.trend : "laterale",
        generatedAt: Date.now(),
      };

      cachedMarketSentiment = { data: result, generatedAt: Date.now() };
      res.json(result);
    } catch (err: any) {
      console.error("Market sentiment error:", err.message);
      res.status(500).json({ label: "Neutro", score: 0, summary: "Errore analisi sentiment.", details: [], trend: "laterale" });
    }
  });

  app.get("/api/journal", async (_req, res) => {
    try {
      if (cachedJournal && Date.now() - cachedJournal.generatedAt < JOURNAL_TTL) {
        return res.json(cachedJournal.data);
      }

      const allHistory = await db.select().from(signalHistory).orderBy(desc(signalHistory.createdAt)).limit(500);

      if (allHistory.length < 3) {
        return res.json({
          patterns: [],
          weaknesses: [],
          tips: [],
          stats: { totalSignals: allHistory.length, winRate: 0, totalPips: 0, bestPair: "N/A", worstPair: "N/A" },
          generatedAt: Date.now(),
          insufficient: true,
        });
      }

      const totalSignals = allHistory.length;
      const isWinOutcome = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
      const wins = allHistory.filter(s => isWinOutcome(s.outcome));
      const losses = allHistory.filter(s => s.outcome === "hit_sl");
      const closed = wins.length + losses.length;
      const winRate = closed > 0 ? Math.round((wins.length / closed) * 100) : 0;
      const totalPips = allHistory.reduce((sum, s) => sum + (s.pipResult || 0), 0);

      const pairStats: Record<string, { wins: number; losses: number; pips: number; count: number }> = {};
      for (const s of allHistory) {
        if (!pairStats[s.pair]) pairStats[s.pair] = { wins: 0, losses: 0, pips: 0, count: 0 };
        pairStats[s.pair].count++;
        pairStats[s.pair].pips += s.pipResult || 0;
        if (isWinOutcome(s.outcome)) pairStats[s.pair].wins++;
        if (s.outcome === "hit_sl") pairStats[s.pair].losses++;
      }

      const pairSummary = Object.entries(pairStats).map(([pair, st]) => {
        const total = st.wins + st.losses;
        const wr = total > 0 ? Math.round((st.wins / total) * 100) : 0;
        return `${pair}: ${st.count} segnali, ${wr}% win rate, ${st.pips.toFixed(1)} pips`;
      }).join("\n");

      const dayStats: Record<string, { wins: number; losses: number }> = {};
      const hourStats: Record<string, { wins: number; losses: number }> = {};
      for (const s of allHistory) {
        const d = new Date(s.createdAt!);
        const dayName = d.toLocaleDateString("it-IT", { weekday: "long" });
        const hour = d.getHours();
        const hourRange = `${hour.toString().padStart(2, "0")}:00-${(hour + 1).toString().padStart(2, "0")}:00`;

        if (!dayStats[dayName]) dayStats[dayName] = { wins: 0, losses: 0 };
        if (!hourStats[hourRange]) hourStats[hourRange] = { wins: 0, losses: 0 };

        if (isWinOutcome(s.outcome)) {
          dayStats[dayName].wins++;
          hourStats[hourRange].wins++;
        }
        if (s.outcome === "hit_sl") {
          dayStats[dayName].losses++;
          hourStats[hourRange].losses++;
        }
      }

      const daySummary = Object.entries(dayStats).map(([day, st]) => {
        const total = st.wins + st.losses;
        return `${day}: ${total > 0 ? Math.round((st.wins / total) * 100) : 0}% win rate (${total} trades)`;
      }).join("\n");

      const hourSummary = Object.entries(hourStats)
        .filter(([, st]) => st.wins + st.losses >= 2)
        .map(([hour, st]) => {
          const total = st.wins + st.losses;
          return `${hour}: ${Math.round((st.wins / total) * 100)}% win rate (${total} trades)`;
        }).join("\n");

      const tfStats: Record<string, { wins: number; losses: number }> = {};
      for (const s of allHistory) {
        if (!tfStats[s.timeframe]) tfStats[s.timeframe] = { wins: 0, losses: 0 };
        if (isWinOutcome(s.outcome)) tfStats[s.timeframe].wins++;
        if (s.outcome === "hit_sl") tfStats[s.timeframe].losses++;
      }

      const tfSummary = Object.entries(tfStats).map(([tf, st]) => {
        const total = st.wins + st.losses;
        return `${tf}: ${total > 0 ? Math.round((st.wins / total) * 100) : 0}% win rate (${total} trades)`;
      }).join("\n");

      const prompt = `Sei un analista di trading esperto. Analizza le seguenti statistiche di performance di un trader e genera un diario di trading dettagliato IN ITALIANO.

STATISTICHE GENERALI:
- Totale segnali: ${totalSignals}
- Chiusi: ${closed} (${wins.length} TP, ${losses.length} SL)
- Win rate: ${winRate}%
- Pips totali: ${totalPips.toFixed(1)}

PERFORMANCE PER COPPIA:
${pairSummary}

PERFORMANCE PER GIORNO:
${daySummary}

PERFORMANCE PER ORARIO:
${hourSummary || "Dati insufficienti"}

PERFORMANCE PER TIMEFRAME:
${tfSummary}

Rispondi con un JSON object con questa struttura:
{
  "patterns": [
    {"title": "Titolo pattern", "description": "Descrizione dettagliata del pattern osservato", "type": "positive"},
    {"title": "Titolo pattern", "description": "Descrizione", "type": "positive"}
  ],
  "weaknesses": [
    {"title": "Titolo punto debole", "description": "Descrizione del punto debole e come migliorare", "severity": "high"},
    {"title": "Titolo", "description": "Descrizione", "severity": "medium"}
  ],
  "tips": [
    {"title": "Suggerimento", "description": "Descrizione dettagliata del suggerimento personalizzato"},
    {"title": "Suggerimento", "description": "Descrizione"}
  ]
}

REGOLE:
- Genera 3-4 pattern (type: "positive" o "neutral")
- Genera 2-3 punti deboli (severity: "high", "medium", "low")
- Genera 3-4 suggerimenti personalizzati basati sui dati reali
- Sii specifico: cita nomi di coppie, giorni, orari
- Tono professionale ma accessibile
- Non usare emoji`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.5,
        max_tokens: 1500,
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }

      const bestPairEntry = Object.entries(pairStats).sort((a, b) => b[1].pips - a[1].pips)[0];
      const worstPairEntry = Object.entries(pairStats).sort((a, b) => a[1].pips - b[1].pips)[0];

      const result = {
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        tips: Array.isArray(parsed.tips) ? parsed.tips : [],
        stats: {
          totalSignals,
          winRate,
          totalPips: parseFloat(totalPips.toFixed(1)),
          closed,
          wins: wins.length,
          losses: losses.length,
          bestPair: bestPairEntry ? bestPairEntry[0] : "N/A",
          worstPair: worstPairEntry ? worstPairEntry[0] : "N/A",
        },
        generatedAt: Date.now(),
        insufficient: false,
      };

      cachedJournal = { data: result, generatedAt: Date.now() };
      res.json(result);
    } catch (err: any) {
      console.error("Journal error:", err.message);
      res.status(500).json({ error: "Errore nella generazione del diario" });
    }
  });

  app.get("/api/volatility", (_req, res) => {
    const COMMODITY_PAIRS = ["XAU/USD", "XAG/USD", "WTI/USD", "BRENT/USD", "NG/USD", "XCU/USD", "XPT/USD"];

    const results: {
      pair: string;
      price: number;
      volatilityPct: number;
      level: string;
      trend: "up" | "down" | "stable";
      stdDev: number;
      range: number;
    }[] = [];

    for (const [pair, prices] of Object.entries(priceHistoryBuffer)) {
      if (prices.length < 3) continue;

      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }

      const meanReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
      const variance = returns.reduce((s, v) => s + (v - meanReturn) ** 2, 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      const volatilityPct = parseFloat((stdDev * 100).toFixed(4));

      const currentPrice = prices[prices.length - 1];
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const rangePct = currentPrice > 0 ? parseFloat((((high - low) / currentPrice) * 100).toFixed(4)) : 0;

      const isCommodity = COMMODITY_PAIRS.includes(pair);
      let level: string;
      if (isCommodity) {
        if (volatilityPct < 0.05) level = "Bassa";
        else if (volatilityPct < 0.15) level = "Media";
        else if (volatilityPct < 0.35) level = "Alta";
        else level = "Estrema";
      } else {
        if (volatilityPct < 0.02) level = "Bassa";
        else if (volatilityPct < 0.06) level = "Media";
        else if (volatilityPct < 0.12) level = "Alta";
        else level = "Estrema";
      }

      let trend: "up" | "down" | "stable" = "stable";
      if (returns.length >= 4) {
        const half = Math.floor(returns.length / 2);
        const firstHalf = returns.slice(0, half);
        const secondHalf = returns.slice(half);
        const avgFirst = firstHalf.reduce((s, v) => s + Math.abs(v), 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((s, v) => s + Math.abs(v), 0) / secondHalf.length;
        if (avgSecond > avgFirst * 1.15) trend = "up";
        else if (avgSecond < avgFirst * 0.85) trend = "down";
      }

      results.push({
        pair,
        price: currentPrice,
        volatilityPct,
        level,
        trend,
        stdDev: parseFloat(stdDev.toFixed(6)),
        range: rangePct,
      });
    }

    results.sort((a, b) => b.volatilityPct - a.volatilityPct);

    const summary = {
      bassa: results.filter(r => r.level === "Bassa").length,
      media: results.filter(r => r.level === "Media").length,
      alta: results.filter(r => r.level === "Alta").length,
      estrema: results.filter(r => r.level === "Estrema").length,
    };

    res.json({ pairs: results, summary });
  });

  let cachedReport: { data: any; generatedAt: number; period: string } | null = null;
  const REPORT_TTL = 2 * 3600000;

  app.get("/api/report", async (req, res) => {
    try {
      const period = (req.query.period as string) || "weekly";
      if (period !== "weekly" && period !== "monthly") {
        return res.status(400).json({ error: "Periodo non valido. Usa 'weekly' o 'monthly'." });
      }

      if (cachedReport && cachedReport.period === period && Date.now() - cachedReport.generatedAt < REPORT_TTL) {
        return res.json(cachedReport.data);
      }

      const allHistory = await db.select().from(signalHistory).orderBy(desc(signalHistory.createdAt)).limit(1000);

      const now = new Date();
      const currentStart = new Date(now);
      const prevStart = new Date(now);
      const prevEnd = new Date(now);

      if (period === "weekly") {
        currentStart.setDate(currentStart.getDate() - 7);
        prevStart.setDate(prevStart.getDate() - 14);
        prevEnd.setDate(prevEnd.getDate() - 7);
      } else {
        currentStart.setMonth(currentStart.getMonth() - 1);
        prevStart.setMonth(prevStart.getMonth() - 2);
        prevEnd.setMonth(prevEnd.getMonth() - 1);
      }

      const isWinOutcome = (o: string) => o === "hit_tp" || o === "hit_tp3" || o === "hit_tp2_then_sl" || o === "hit_tp1_then_sl";
      const isClosedOutcome = (o: string) => isWinOutcome(o) || o === "hit_sl";

      const currentSignals = allHistory.filter(s => {
        const d = new Date(s.closedAt ?? s.createdAt);
        return d >= currentStart && d <= now && isClosedOutcome(s.outcome);
      });

      const prevSignals = allHistory.filter(s => {
        const d = new Date(s.closedAt ?? s.createdAt);
        return d >= prevStart && d <= prevEnd && isClosedOutcome(s.outcome);
      });

      const calcStats = (signals: typeof allHistory) => {
        const wins = signals.filter(s => isWinOutcome(s.outcome));
        const losses = signals.filter(s => s.outcome === "hit_sl");
        const totalPips = parseFloat(signals.reduce((sum, s) => sum + (s.pipResult ?? 0), 0).toFixed(1));
        const winRate = signals.length > 0 ? Math.round((wins.length / signals.length) * 100) : 0;
        const tp3Count = signals.filter(s => s.outcome === "hit_tp3" || s.outcome === "hit_tp").length;
        const tp2Count = signals.filter(s => s.outcome === "hit_tp2_then_sl").length;
        const tp1Count = signals.filter(s => s.outcome === "hit_tp1_then_sl").length;

        const pairStats: Record<string, { wins: number; losses: number; pips: number }> = {};
        for (const s of signals) {
          if (!pairStats[s.pair]) pairStats[s.pair] = { wins: 0, losses: 0, pips: 0 };
          pairStats[s.pair].pips += s.pipResult ?? 0;
          if (isWinOutcome(s.outcome)) pairStats[s.pair].wins++;
          if (s.outcome === "hit_sl") pairStats[s.pair].losses++;
        }

        const pairEntries = Object.entries(pairStats);
        const bestPair = pairEntries.sort((a, b) => b[1].pips - a[1].pips)[0];
        const worstPair = pairEntries.sort((a, b) => a[1].pips - b[1].pips)[0];

        return {
          signalsCount: signals.length,
          wins: wins.length,
          losses: losses.length,
          winRate,
          totalPips,
          tp3Count,
          tp2Count,
          tp1Count,
          bestPair: bestPair ? { pair: bestPair[0], pips: parseFloat(bestPair[1].pips.toFixed(1)), wins: bestPair[1].wins, losses: bestPair[1].losses } : null,
          worstPair: worstPair ? { pair: worstPair[0], pips: parseFloat(worstPair[1].pips.toFixed(1)), wins: worstPair[1].wins, losses: worstPair[1].losses } : null,
        };
      };

      const current = calcStats(currentSignals);
      const previous = calcStats(prevSignals);

      const delta = {
        winRate: current.winRate - previous.winRate,
        totalPips: parseFloat((current.totalPips - previous.totalPips).toFixed(1)),
        signalsCount: current.signalsCount - previous.signalsCount,
      };

      let grade: string;
      let gradeColor: string;
      const gradeScore = current.winRate * 0.6 + Math.min(Math.max(current.totalPips, -100), 200) * 0.2 + Math.min(current.signalsCount, 50) * 0.4;
      if (gradeScore >= 80) { grade = "A+"; gradeColor = "#00D4AA"; }
      else if (gradeScore >= 70) { grade = "A"; gradeColor = "#00D4AA"; }
      else if (gradeScore >= 60) { grade = "B+"; gradeColor = "#FBBF24"; }
      else if (gradeScore >= 50) { grade = "B"; gradeColor = "#FBBF24"; }
      else if (gradeScore >= 40) { grade = "C+"; gradeColor = "#FF8C00"; }
      else if (gradeScore >= 30) { grade = "C"; gradeColor = "#FF8C00"; }
      else if (gradeScore >= 20) { grade = "D"; gradeColor = "#FF4D6A"; }
      else { grade = "F"; gradeColor = "#FF4D6A"; }

      let aiInsights = "";
      try {
        const pairSummary = currentSignals.reduce((acc, s) => {
          if (!acc[s.pair]) acc[s.pair] = { wins: 0, losses: 0, pips: 0 };
          acc[s.pair].pips += s.pipResult ?? 0;
          if (isWinOutcome(s.outcome)) acc[s.pair].wins++;
          if (s.outcome === "hit_sl") acc[s.pair].losses++;
          return acc;
        }, {} as Record<string, { wins: number; losses: number; pips: number }>);

        const pairSummaryStr = Object.entries(pairSummary).map(([p, st]) =>
          `${p}: ${st.wins}W/${st.losses}L, ${st.pips.toFixed(1)} pips`
        ).join(", ");

        const periodLabel = period === "weekly" ? "settimana" : "mese";
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.5,
          max_tokens: 600,
          messages: [{
            role: "system",
            content: `Sei un analista di trading esperto. Scrivi un commento di performance in italiano. Tono professionale, conciso. Non usare emoji. Max 4-5 frasi.`
          }, {
            role: "user",
            content: `Report ${periodLabel}: ${current.signalsCount} segnali chiusi, win rate ${current.winRate}%, ${current.totalPips} pips totali. TP3: ${current.tp3Count}, TP2: ${current.tp2Count}, TP1: ${current.tp1Count}, SL: ${current.losses}. Voto: ${grade}. Delta vs periodo precedente: win rate ${delta.winRate > 0 ? "+" : ""}${delta.winRate}%, pips ${delta.totalPips > 0 ? "+" : ""}${delta.totalPips}. Dettaglio coppie: ${pairSummaryStr || "nessun dato"}. Genera un commento analitico sulla performance.`
          }]
        });
        aiInsights = completion.choices[0]?.message?.content || "";
      } catch (err: any) {
        console.error("Report AI insights error:", err.message);
        aiInsights = "Analisi IA temporaneamente non disponibile.";
      }

      const result = {
        period,
        periodLabel: period === "weekly" ? "Settimana" : "Mese",
        current,
        previous,
        delta,
        grade,
        gradeColor,
        aiInsights,
        generatedAt: Date.now(),
      };

      cachedReport = { data: result, generatedAt: Date.now(), period };
      res.json(result);
    } catch (err: any) {
      console.error("Report error:", err.message);
      res.status(500).json({ error: "Errore nella generazione del report" });
    }
  });

  app.get("/api/correlations", async (_req, res) => {
    try {
      const [fxQuotes, cmdQuotes] = await Promise.all([
        fetchForexQuotes(),
        fetchCommodityQuotes(),
      ]);
      recordPriceHistory([...fxQuotes, ...cmdQuotes]);

      const pairs = Object.keys(priceHistoryBuffer).filter(p => priceHistoryBuffer[p].length >= 5);
      const matrix: { pair1: string; pair2: string; correlation: number }[] = [];

      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const corr = computeCorrelation(priceHistoryBuffer[pairs[i]], priceHistoryBuffer[pairs[j]]);
          if (corr !== null) {
            matrix.push({ pair1: pairs[i], pair2: pairs[j], correlation: corr });
          }
        }
      }

      matrix.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

      res.json({
        pairs,
        matrix,
        dataPoints: Object.fromEntries(pairs.map(p => [p, priceHistoryBuffer[p].length])),
      });
    } catch (err: any) {
      console.error("Correlations error:", err.message);
      res.json({ pairs: [], matrix: [], dataPoints: {} });
    }
  });

  app.get("/api/achievements", async (_req, res) => {
    try {
      const allHistory = await db.select().from(signalHistory).orderBy(desc(signalHistory.createdAt)).limit(500);
      const totalSignals = allHistory.length;
      const tpWins = allHistory.filter(s => s.outcome && (s.outcome.startsWith("hit_tp"))).length;
      const slLosses = allHistory.filter(s => s.outcome === "hit_sl").length;
      const closed = tpWins + slLosses;
      const winRate = closed > 0 ? Math.round((tpWins / closed) * 100) : 0;
      const totalPips = allHistory.reduce((sum, s) => sum + (s.pipResult || 0), 0);
      const uniquePairs = new Set(allHistory.map(s => s.pair)).size;
      const tp3Hits = allHistory.filter(s => s.outcome === "hit_tp3").length;
      const tp2Hits = allHistory.filter(s => s.outcome === "hit_tp2_then_sl" || (s.tpLevel ?? 0) >= 2).length;

      let consecutiveWins = 0;
      let maxConsecutive = 0;
      for (const s of allHistory) {
        if (s.outcome && s.outcome.startsWith("hit_tp")) {
          consecutiveWins++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveWins);
        } else if (s.outcome === "hit_sl") {
          consecutiveWins = 0;
        }
      }

      const uniqueDays = new Set(allHistory.map(s => {
        const d = new Date(s.createdAt!);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })).size;

      const nightSignals = allHistory.filter(s => {
        const d = new Date(s.createdAt!);
        const h = d.getHours();
        return h >= 20 || h < 6;
      }).length;

      const weekendSignals = allHistory.filter(s => {
        const d = new Date(s.createdAt!);
        return d.getDay() === 0 || d.getDay() === 6;
      }).length;

      const forexPairs = allHistory.filter(s => !s.pair.startsWith("X") && !["WTI/USD", "BRENT/USD", "NG/USD"].includes(s.pair));
      const commodityPairs = allHistory.filter(s => s.pair.startsWith("X") || ["WTI/USD", "BRENT/USD", "NG/USD"].includes(s.pair));
      const forexCount = forexPairs.length;
      const commodityCount = commodityPairs.length;

      const goldSignals = allHistory.filter(s => s.pair === "XAU/USD").length;
      const eurUsdSignals = allHistory.filter(s => s.pair === "EUR/USD").length;
      const gbpUsdSignals = allHistory.filter(s => s.pair === "GBP/USD").length;
      const jpySignals = allHistory.filter(s => s.pair.includes("JPY")).length;

      const highConfSignals = allHistory.filter(s => s.confidence >= 85).length;
      const strongSignals = allHistory.filter(s => s.strength >= 80).length;

      const buySignals = allHistory.filter(s => s.action === "BUY").length;
      const sellSignals = allHistory.filter(s => s.action === "SELL").length;

      const positivePips = allHistory.filter(s => (s.pipResult || 0) > 0).reduce((sum, s) => sum + (s.pipResult || 0), 0);

      const todayStr = new Date().toDateString();
      const todaySignals = allHistory.filter(s => new Date(s.createdAt!).toDateString() === todayStr);
      const todayTotal = todaySignals.length;
      const todayTpWins = todaySignals.filter(s => s.outcome && s.outcome.startsWith("hit_tp")).length;
      let todayConsecutive = 0;
      let todayMaxConsecutive = 0;
      for (const s of todaySignals) {
        if (s.outcome && s.outcome.startsWith("hit_tp")) {
          todayConsecutive++;
          todayMaxConsecutive = Math.max(todayMaxConsecutive, todayConsecutive);
        } else if (s.outcome === "hit_sl") {
          todayConsecutive = 0;
        }
      }

      const achievements = [
        { id: "first_signal", name: "Primo Passo", description: "Il tuo primo segnale di trading", icon: "flag", target: 1, current: Math.min(totalSignals, 1), unlocked: totalSignals >= 1, category: "base", points: 50 },
        { id: "ten_signals", name: "Analista Attivo", description: "5 segnali generati", icon: "analytics", target: 5, current: Math.min(totalSignals, 5), unlocked: totalSignals >= 5, category: "base", points: 100 },
        { id: "fifty_signals", name: "Trader Esperto", description: "20 segnali generati", icon: "school", target: 20, current: Math.min(totalSignals, 20), unlocked: totalSignals >= 20, category: "base", points: 200 },
        { id: "hundred_signals", name: "Centurione", description: "50 segnali analizzati", icon: "medal", target: 50, current: Math.min(totalSignals, 50), unlocked: totalSignals >= 50, category: "base", points: 300 },
        { id: "two_fifty_signals", name: "Veterano di Guerra", description: "100 segnali analizzati", icon: "shield-checkmark", target: 100, current: Math.min(totalSignals, 100), unlocked: totalSignals >= 100, category: "base", points: 500 },

        { id: "first_tp", name: "Primo Profitto", description: "Il tuo primo Take Profit raggiunto", icon: "checkmark-circle", target: 1, current: Math.min(tpWins, 1), unlocked: tpWins >= 1, category: "profit", points: 50 },
        { id: "ten_tp", name: "Profittevole", description: "5 Take Profit raggiunti", icon: "trending-up", target: 5, current: Math.min(tpWins, 5), unlocked: tpWins >= 5, category: "profit", points: 150 },
        { id: "twenty_five_tp", name: "Macchina da Soldi", description: "15 Take Profit raggiunti", icon: "cash", target: 15, current: Math.min(tpWins, 15), unlocked: tpWins >= 15, category: "profit", points: 300 },
        { id: "tp3_master", name: "Cacciatore di TP3", description: "3 segnali che raggiungono TP3", icon: "trophy", target: 3, current: Math.min(tp3Hits, 3), unlocked: tp3Hits >= 3, category: "profit", points: 400 },

        { id: "streak_3", name: "In Serie", description: "2 TP consecutivi", icon: "flame", target: 2, current: Math.min(maxConsecutive, 2), unlocked: maxConsecutive >= 2, category: "streak", points: 100 },
        { id: "streak_5", name: "Inarrestabile", description: "3 TP consecutivi", icon: "rocket", target: 3, current: Math.min(maxConsecutive, 3), unlocked: maxConsecutive >= 3, category: "streak", points: 200 },
        { id: "streak_7", name: "Dominatore", description: "5 TP consecutivi", icon: "flash", target: 5, current: Math.min(maxConsecutive, 5), unlocked: maxConsecutive >= 5, category: "streak", points: 350 },
        { id: "streak_10", name: "Leggenda Vivente", description: "7 TP consecutivi", icon: "star", target: 7, current: Math.min(maxConsecutive, 7), unlocked: maxConsecutive >= 7, category: "streak", points: 500 },

        { id: "winrate_60", name: "Costante", description: "Win rate superiore al 60%", icon: "speedometer", target: 60, current: Math.min(winRate, 60), unlocked: winRate >= 60 && closed >= 3, category: "accuracy", points: 100 },
        { id: "winrate_75", name: "Precisione Chirurgica", description: "Win rate superiore al 70%", icon: "bullseye", target: 70, current: Math.min(winRate, 70), unlocked: winRate >= 70 && closed >= 5, category: "accuracy", points: 250 },
        { id: "winrate_90", name: "Cecchino del Forex", description: "Win rate superiore all'80%", icon: "eye", target: 80, current: Math.min(winRate, 80), unlocked: winRate >= 80 && closed >= 8, category: "accuracy", points: 500 },

        { id: "diversifier_5", name: "Esploratore", description: "Trading su 5 coppie diverse", icon: "compass", target: 5, current: Math.min(uniquePairs, 5), unlocked: uniquePairs >= 5, category: "diversity", points: 100 },
        { id: "diversifier_10", name: "Globetrotter", description: "Trading su 10+ coppie diverse", icon: "globe", target: 10, current: Math.min(uniquePairs, 10), unlocked: uniquePairs >= 10, category: "diversity", points: 200 },
        { id: "commodity_trader", name: "Re delle Materie Prime", description: "20 segnali su commodities", icon: "cube", target: 20, current: Math.min(commodityCount, 20), unlocked: commodityCount >= 20, category: "diversity", points: 200 },

        { id: "pips_100", name: "Primo Raccolto", description: "50+ pip totali guadagnati", icon: "leaf", target: 50, current: Math.min(Math.max(positivePips, 0), 50), unlocked: positivePips >= 50, category: "pips", points: 100 },
        { id: "pips_500", name: "Accumulatore", description: "200+ pip totali guadagnati", icon: "wallet", target: 200, current: Math.min(Math.max(positivePips, 0), 200), unlocked: positivePips >= 200, category: "pips", points: 250 },
        { id: "pips_2000", name: "Magnate dei Pips", description: "500+ pip totali guadagnati", icon: "diamond", target: 500, current: Math.min(Math.max(positivePips, 0), 500), unlocked: positivePips >= 500, category: "pips", points: 500 },

        { id: "days_3", name: "Costanza", description: "Attivo per 2+ giorni", icon: "time", target: 2, current: Math.min(uniqueDays, 2), unlocked: uniqueDays >= 2, category: "dedication", points: 50 },
        { id: "days_7", name: "Maratoneta", description: "Attivo per 5+ giorni", icon: "calendar", target: 5, current: Math.min(uniqueDays, 5), unlocked: uniqueDays >= 5, category: "dedication", points: 150 },
        { id: "days_30", name: "Disciplinato", description: "Attivo per 15+ giorni", icon: "fitness", target: 15, current: Math.min(uniqueDays, 15), unlocked: uniqueDays >= 15, category: "dedication", points: 400 },
        { id: "night_trader", name: "Trader Notturno", description: "5 segnali tra le 20:00 e le 06:00", icon: "moon", target: 5, current: Math.min(nightSignals, 5), unlocked: nightSignals >= 5, category: "dedication", points: 150 },

        { id: "gold_rush", name: "Febbre dell'Oro", description: "5 segnali su XAU/USD", icon: "trophy", target: 5, current: Math.min(goldSignals, 5), unlocked: goldSignals >= 5, category: "specialist", points: 150 },
        { id: "eurusd_master", name: "Re dell'Euro", description: "8 segnali su EUR/USD", icon: "logo-euro", target: 8, current: Math.min(eurUsdSignals, 8), unlocked: eurUsdSignals >= 8, category: "specialist", points: 150 },
        { id: "jpy_specialist", name: "Samurai dello Yen", description: "5 segnali su coppie JPY", icon: "pulse", target: 5, current: Math.min(jpySignals, 5), unlocked: jpySignals >= 5, category: "specialist", points: 150 },

        { id: "high_conf_5", name: "Alta Convinzione", description: "3 segnali con confidenza 85%+", icon: "shield", target: 3, current: Math.min(highConfSignals, 3), unlocked: highConfSignals >= 3, category: "elite", points: 200 },
        { id: "both_sides", name: "Bilanciato", description: "5+ BUY e 5+ SELL eseguiti", icon: "swap-horizontal", target: 5, current: Math.min(buySignals, sellSignals, 5), unlocked: buySignals >= 5 && sellSignals >= 5, category: "elite", points: 200 },

        { id: "daily_first", name: "Prima Sessione", description: "Genera il tuo primo segnale oggi", icon: "today", target: 1, current: Math.min(todayTotal, 1), unlocked: todayTotal >= 1, category: "daily", points: 30 },
        { id: "daily_profit", name: "Profitto del Giorno", description: "Chiudi almeno un trade in profitto oggi", icon: "sunny", target: 1, current: Math.min(todayTpWins, 1), unlocked: todayTpWins >= 1, category: "daily", points: 50 },
        { id: "daily_three", name: "Tre di Fila", description: "3 TP consecutivi oggi", icon: "podium", target: 3, current: Math.min(todayMaxConsecutive, 3), unlocked: todayMaxConsecutive >= 3, category: "daily", points: 100 },
        { id: "daily_five", name: "Sessione da Pro", description: "5+ segnali analizzati oggi", icon: "ribbon", target: 5, current: Math.min(todayTotal, 5), unlocked: todayTotal >= 5, category: "daily", points: 75 },
      ];

      const unlockedCount = achievements.filter(a => a.unlocked).length;
      const totalPoints = achievements.filter(a => a.unlocked).reduce((sum, a) => sum + a.points, 0);
      const level = totalPoints < 50 ? 1 : totalPoints < 150 ? 2 : totalPoints < 350 ? 3 : totalPoints < 700 ? 4 : totalPoints < 1500 ? 5 : 6;
      const levelNames = ["Principiante", "Apprendista", "Trader", "Esperto", "Maestro", "Leggenda"];
      const levelThresholds = [0, 50, 150, 350, 700, 1500, 3000];
      const currentThreshold = levelThresholds[level - 1];
      const nextThreshold = levelThresholds[Math.min(level, levelThresholds.length - 1)];
      const levelProgress = nextThreshold > currentThreshold ? (totalPoints - currentThreshold) / (nextThreshold - currentThreshold) : 1;

      const nextAchievement = achievements
        .filter(a => !a.unlocked && a.current > 0)
        .sort((a, b) => (b.current / b.target) - (a.current / a.target))[0] || null;

      res.json({
        achievements,
        summary: {
          unlockedCount,
          total: achievements.length,
          level,
          levelName: levelNames[Math.min(level - 1, levelNames.length - 1)],
          points: totalPoints,
          levelProgress,
          nextThreshold,
          currentThreshold,
        },
        nextAchievement,
      });
    } catch (err: any) {
      console.error("Achievements error:", err.message);
      res.json({ achievements: [], summary: { unlockedCount: 0, total: 0, level: 1, levelName: "Principiante", points: 0, levelProgress: 0, nextThreshold: 50, currentThreshold: 0 }, nextAchievement: null });
    }
  });

  try {
    const legacyCutoff = new Date("2026-03-14T00:00:00Z");
    const legacyHist = await db.select({ count: sql<number>`count(*)` }).from(signalHistory).where(sql`${signalHistory.createdAt} < ${legacyCutoff}`);
    const legacyScalp = await db.select({ count: sql<number>`count(*)` }).from(scalpingSignals).where(sql`${scalpingSignals.createdAt} < ${legacyCutoff}`);
    const hc = Number(legacyHist[0]?.count);
    const sc = Number(legacyScalp[0]?.count);
    if (hc > 0 || sc > 0) {
      console.log(`[RESET] Clearing legacy data before ${legacyCutoff.toISOString()}: ${hc} signal_history, ${sc} scalping_signals`);
      await db.delete(signalHistory).where(sql`${signalHistory.createdAt} < ${legacyCutoff}`);
      await db.delete(scalpingSignals).where(sql`${scalpingSignals.createdAt} < ${legacyCutoff}`);
      await db.delete(activeSignals);
      console.log("[RESET] Legacy history data cleared successfully");
    }
  } catch (err: any) {
    console.error("[RESET] Error clearing legacy data:", err.message);
  }

  try {
    const restored = await restoreActiveSignals();
    if (restored.forex.length > 0 || restored.commodities.length > 0) {
      const allRestored = [...restored.forex, ...restored.commodities];
      console.log(`Checking ${allRestored.length} restored signals for TP/SL hits during downtime...`);
      const checkedForex = await retroactiveCheck(restored.forex);
      const checkedCommodities = await retroactiveCheck(restored.commodities);
      cachedSignals = checkedForex;
      cachedCommoditySignals = checkedCommodities;
      console.log(`After retroactive check: ${cachedSignals.length} forex + ${cachedCommoditySignals.length} commodity signals still active`);
      await persistActiveSignals();
    }
  } catch (err: any) {
    console.error("Error restoring signals:", err.message);
  }

  try {
    const scalpRows = await db.select().from(scalpingSignals)
      .where(sql`${scalpingSignals.status} = 'active' OR ${scalpingSignals.status} = 'hit_tp1'`);
    const now = new Date();
    for (const row of scalpRows) {
      if (row.expiresAt && now >= row.expiresAt) {
        await db.update(scalpingSignals).set({ status: "expired", closedAt: now }).where(eq(scalpingSignals.id, row.id));
        continue;
      }
      cachedScalpingSignals.push({
        id: row.id,
        action: row.action as "BUY" | "SELL",
        entryPrice: row.entryPrice,
        stopLoss: row.stopLoss,
        currentSL: row.currentSL,
        tp1: row.tp1,
        tp2: row.tp2,
        confidence: row.confidence,
        timeframe: row.timeframe as "M1" | "M5",
        summary: row.summary ?? "",
        status: row.status as any,
        pipResult: row.pipResult ?? 0,
        beActive: row.beActive,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
      });
    }
    if (cachedScalpingSignals.length > 0) {
      console.log(`Restored ${cachedScalpingSignals.length} active scalping signals from DB`);
    }
  } catch (err: any) {
    console.error("Error restoring scalping signals:", err.message);
  }

  if (isMarketClosed()) {
    console.log("Mercato chiuso. I segnali verranno generati automaticamente alla riapertura del mercato.");
  } else if (isNightSession()) {
    console.log("Fascia notturna (20:00-06:00 CET). Monitoraggio TP/SL attivo, generazione segnali sospesa.");
  } else {
    doGenerate();
  }

  let wasInactive = isMarketClosed() || isNightSession();
  setInterval(() => {
    const inactive = isMarketClosed() || isNightSession();
    if (wasInactive && !inactive) {
      console.log("Sessione attiva! Avvio generazione segnali...");
      doGenerate();
    }
    wasInactive = inactive;
  }, 5 * 60000);

  let monitorCycle = 0;
  setInterval(async () => {
    await checkSignalOutcomes();
    await checkScalpingOutcomes();
    monitorCycle++;
    if (monitorCycle % 8 === 0 && (cachedSignals.length > 0 || cachedCommoditySignals.length > 0)) {
      await persistActiveSignals();
    }
    if (monitorCycle % 4 === 0) {
      await checkCalendarUpcomingEvents();
      for (const s of cachedSignals) {
        s.newsWarning = getNewsWarning(s.pair, cachedCalendar);
      }
      for (const s of cachedCommoditySignals) {
        s.newsWarning = getNewsWarning(s.pair, cachedCalendar);
      }
    }
  }, 15000);
  console.log("Monitoraggio SL/TP attivo: controllo prezzi ogni 15 secondi");

  generateAndAddScalpingSignal();
  setInterval(() => {
    generateAndAddScalpingSignal();
  }, SCALPING_GENERATION_INTERVAL);
  console.log("Scalping XAU/USD attivo: generazione ogni 5 minuti");

  const httpServer = createServer(app);
  return httpServer;
}
