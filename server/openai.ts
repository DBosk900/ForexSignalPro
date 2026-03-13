import OpenAI from "openai";
import type { XAUScalpingIndicators, PairIndicators, RawCalendarEvent, RawNewsItem } from "./tradingview.js";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type MarketType = "forex" | "commodities";

export interface Timeframes {
  h1: "BUY" | "SELL" | "HOLD";
  h4: "BUY" | "SELL" | "HOLD";
  d1: "BUY" | "SELL" | "HOLD";
}

export interface Confluence {
  score: number;
  h1: number;
  h4: number;
  d1: number;
  aligned: boolean;
}

export interface Signal {
  id: string;
  pair: string;
  base: string;
  quote: string;
  action: "BUY" | "SELL" | "HOLD";
  strength: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  tp1: number;
  tp2: number;
  tp3: number;
  currentSL: number;
  tpHit: number;
  timeframe: string;
  confidence: number;
  summary: string;
  analysis: string;
  timestamp: string;
  change24h: number;
  riskReward: number;
  pipTarget: number;
  newsFactors: string[];
  rsi: number;
  macd: number;
  ema20: number;
  ema50: number;
  market: MarketType;
  timeframes: Timeframes;
  confluence: Confluence;
  chartPattern?: string;
  newsWarning?: string;
  closedAt?: string;
  closedOutcome?: string;
  closedPrice?: number;
  closedPips?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  summary: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  currencies: string[];
  timestamp: string;
  url?: string;
  market?: MarketType;
}

export interface AlertItem {
  id: string;
  type: "signal" | "news" | "market" | "outcome";
  title: string;
  message: string;
  pair?: string;
  action?: "BUY" | "SELL" | "HOLD";
  timestamp: string;
  read: boolean;
  market?: MarketType;
}

const FOREX_PAIRS = [
  { pair: "EUR/USD", base: "EUR", quote: "USD" },
  { pair: "GBP/USD", base: "GBP", quote: "USD" },
  { pair: "USD/JPY", base: "USD", quote: "JPY" },
  { pair: "USD/CHF", base: "USD", quote: "CHF" },
  { pair: "AUD/USD", base: "AUD", quote: "USD" },
  { pair: "USD/CAD", base: "USD", quote: "CAD" },
  { pair: "NZD/USD", base: "NZD", quote: "USD" },
  { pair: "EUR/GBP", base: "EUR", quote: "GBP" },
  { pair: "EUR/JPY", base: "EUR", quote: "JPY" },
  { pair: "GBP/JPY", base: "GBP", quote: "JPY" },
];

const BASE_PRICES: Record<string, number> = {
  "EUR/USD": 1.0845,
  "GBP/USD": 1.2690,
  "USD/JPY": 149.80,
  "USD/CHF": 0.9120,
  "AUD/USD": 0.6530,
  "USD/CAD": 1.3620,
  "NZD/USD": 0.6090,
  "EUR/GBP": 0.8545,
  "EUR/JPY": 162.40,
  "GBP/JPY": 190.10,
};

export const COMMODITY_PAIRS = [
  { pair: "XAU/USD", base: "XAU", quote: "USD", name: "Oro" },
  { pair: "XAG/USD", base: "XAG", quote: "USD", name: "Argento" },
  { pair: "WTI/USD", base: "WTI", quote: "USD", name: "Petrolio WTI" },
  { pair: "BRENT/USD", base: "BRENT", quote: "USD", name: "Petrolio Brent" },
  { pair: "NG/USD", base: "NG", quote: "USD", name: "Gas Naturale" },
  { pair: "XCU/USD", base: "XCU", quote: "USD", name: "Rame" },
  { pair: "XPT/USD", base: "XPT", quote: "USD", name: "Platino" },
];

const BASE_COMMODITY_PRICES: Record<string, number> = {
  "XAU/USD": 2340.50,
  "XAG/USD": 29.85,
  "WTI/USD": 78.20,
  "BRENT/USD": 82.40,
  "NG/USD": 2.15,
  "XCU/USD": 4.52,
  "XPT/USD": 985.00,
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function jitter(base: number, pct: number) {
  return base * (1 + (Math.random() * 2 - 1) * pct);
}

function extractArray(raw: string): any[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    return [];
  } catch {
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return [];
  }
}

function recommendToAction(rec: number): "BUY" | "SELL" | "HOLD" {
  if (rec > 0.2) return "BUY";
  if (rec < -0.2) return "SELL";
  return "HOLD";
}

function timeframesFromIndicators(ind: PairIndicators): Timeframes {
  return {
    h1: recommendToAction(ind.recommend_h1),
    h4: recommendToAction(ind.recommend_h4),
    d1: recommendToAction(ind.recommend_d1),
  };
}

function actionFromRecommend(rec_h4: number): "BUY" | "SELL" | "HOLD" {
  if (rec_h4 > 0.2) return "BUY";
  if (rec_h4 < -0.2) return "SELL";
  return "HOLD";
}

function confidenceFromRecommend(rec: number): number {
  const abs = Math.abs(rec);
  if (abs >= 0.5) return Math.min(95, 82 + Math.round((abs - 0.5) * 26));
  if (abs >= 0.2) return 70 + Math.round((abs - 0.2) * 40);
  return Math.round(50 + abs * 100);
}

function strengthFromRecommend(rec: number, action: string): number {
  if (action === "HOLD") return Math.round(40 + Math.abs(rec) * 15);
  const abs = Math.abs(rec);
  return Math.min(95, Math.round(60 + abs * 35));
}

export interface CalendarEvent {
  id: string;
  date: string;
  time: string;
  event: string;
  country: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  currencies: string[];
  forecast?: string;
  previous?: string;
  actual?: string;
  riskWarning: string;
  affectedPairs: string[];
}

const COUNTRY_TO_CURRENCIES: Record<string, string[]> = {
  USD: ["USD"], EUR: ["EUR"], GBP: ["GBP"], JPY: ["JPY"],
  AUD: ["AUD"], NZD: ["NZD"], CAD: ["CAD"], CHF: ["CHF"],
  CNY: ["CNY"],
};

const CURRENCY_TO_PAIRS: Record<string, string[]> = {
  USD: ["EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","USD/CAD","NZD/USD","XAU/USD","WTI/USD","BRENT/USD"],
  EUR: ["EUR/USD","EUR/GBP","EUR/JPY"],
  GBP: ["GBP/USD","EUR/GBP","GBP/JPY"],
  JPY: ["USD/JPY","EUR/JPY","GBP/JPY"],
  AUD: ["AUD/USD"],
  NZD: ["NZD/USD"],
  CAD: ["USD/CAD"],
  CHF: ["USD/CHF"],
};

function mapImpact(raw: string): "HIGH" | "MEDIUM" | "LOW" {
  const lower = raw.toLowerCase().trim();
  if (lower === "high") return "HIGH";
  if (lower === "medium") return "MEDIUM";
  return "LOW";
}

function formatCalendarDate(rawDate: string): string {
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return rawDate;
    return d.toISOString().split("T")[0];
  } catch {
    return rawDate;
  }
}

function formatCalendarTime(rawTime: string): string {
  if (!rawTime || rawTime === "All Day") return "Tutto il giorno";
  if (/^\d{2}:\d{2}$/.test(rawTime)) return rawTime;
  const match = rawTime.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3].toLowerCase();
    if (ampm === "pm" && hours !== 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  return rawTime;
}

export async function buildCalendarFromReal(rawEvents: RawCalendarEvent[]): Promise<CalendarEvent[]> {
  const filtered = rawEvents.filter(e => {
    const impact = e.impact?.toLowerCase().trim();
    return impact !== "holiday" && impact !== "low";
  });

  if (filtered.length === 0) return [];

  const titles = filtered.map(e => e.title);
  const batchSize = 50;
  const translatedTitles: string[] = [];

  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Traduci questi titoli di eventi economici dall'inglese all'italiano. Rispondi con un JSON object con chiave "translations" contenente un array di stringhe tradotte, nello stesso ordine.\n\nTitoli:\n${batch.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}`,
        }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      const raw = response.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw);
      const translations = parsed.translations || parsed.tradotte || [];
      for (let j = 0; j < batch.length; j++) {
        translatedTitles.push(translations[j] || batch[j]);
      }
    } catch {
      translatedTitles.push(...batch);
    }
  }

  console.log(`[CALENDAR] Translated ${translatedTitles.length} event titles to Italian`);

  const allPairs = [...FOREX_PAIRS.map(p => p.pair), ...COMMODITY_PAIRS.map(p => p.pair)];

  return filtered.map((e, idx) => {
    const currencies = COUNTRY_TO_CURRENCIES[e.country] || [e.country];
    const affectedPairs = currencies.flatMap(c => CURRENCY_TO_PAIRS[c] || [])
      .filter((p, i, arr) => arr.indexOf(p) === i)
      .filter(p => allPairs.includes(p));

    const impact = mapImpact(e.impact);
    let riskWarning = "";
    if (impact === "HIGH") {
      riskWarning = `Dato ad alto impatto per ${currencies.join(", ")}. Possibile elevata volatilita'.`;
    } else if (impact === "MEDIUM") {
      riskWarning = `Dato a medio impatto per ${currencies.join(", ")}.`;
    }

    return {
      id: uid(),
      date: formatCalendarDate(e.date),
      time: formatCalendarTime(e.time),
      event: translatedTitles[idx] || e.title,
      country: e.country || "N/A",
      impact,
      currencies,
      forecast: e.forecast || undefined,
      previous: e.previous || undefined,
      actual: e.actual || undefined,
      riskWarning,
      affectedPairs,
    };
  });
}

export async function generateFallbackCalendar(): Promise<CalendarEvent[]> {
  try {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `Sei un analista finanziario. Genera 8 eventi economici realistici per la settimana corrente (dal ${dateStr}). Rispondi SOLO con un array JSON. Ogni oggetto ha: title (italiano), date (YYYY-MM-DD), time (HH:MM UTC), country (codice 3 lettere), impact (HIGH/MEDIUM), forecast (valore con %), previous (valore con %). Includi eventi tipici: CPI, PMI, NFP, decisioni tassi, PIL, bilancia commerciale.`,
        },
        { role: "user", content: "Genera gli eventi del calendario economico." },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = extractArray(raw);
    return parsed.map((e: any) => {
      const country = e.country || "USD";
      const currencies = COUNTRY_TO_CURRENCIES[country] || [country];
      const majorPairs = ["EUR/USD","GBP/USD","USD/JPY","AUD/USD","NZD/USD","USD/CAD","USD/CHF"];
      const affectedPairs = majorPairs.filter(p => currencies.some(c => p.includes(c)));
      return {
        id: uid(),
        date: e.date || dateStr,
        time: e.time || "12:00",
        event: e.title || "Evento economico",
        country,
        impact: (e.impact === "HIGH" ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
        currencies,
        forecast: e.forecast || undefined,
        previous: e.previous || undefined,
        riskWarning: `Dato a ${e.impact === "HIGH" ? "alto" : "medio"} impatto per ${country}. Fonte: AI fallback (ForexFactory non disponibile).`,
        affectedPairs,
      };
    });
  } catch (err) {
    console.error("[CALENDAR] AI fallback generation failed:", err);
    return [];
  }
}

export async function processRealNews(rawNews: RawNewsItem[], market: "forex" | "commodities"): Promise<NewsItem[]> {
  if (rawNews.length === 0) return [];

  const forexKeywords = ["forex","currency","dollar","euro","yen","pound","sterling","fed","ecb","boj","rate","inflation","cpi","gdp","employment","nfp","pmi","treasury","bond","yield"];
  const commodityKeywords = ["gold","silver","oil","crude","brent","wti","copper","platinum","natural gas","commodity","opec","metal","mining","energy"];

  const relevant = rawNews.filter(item => {
    const lower = item.title.toLowerCase();
    const keywords = market === "forex" ? forexKeywords : commodityKeywords;
    return keywords.some(k => lower.includes(k));
  }).slice(0, 10);

  if (relevant.length === 0) {
    return rawNews.slice(0, 6).map(item => {
      let ts: string;
      try { ts = new Date(item.pubDate).toISOString(); } catch { ts = new Date().toISOString(); }
      return {
        id: uid(),
        title: item.title,
        source: item.source,
        summary: "",
        impact: "LOW" as const,
        currencies: [],
        timestamp: ts,
        url: item.link,
        market,
      };
    });
  }

  try {
    const allPairs = market === "forex"
      ? FOREX_PAIRS.map(p => p.pair)
      : COMMODITY_PAIRS.map(p => p.pair);

    const prompt = `Sei un analista finanziario. Traduci questi titoli di notizie finanziarie in italiano e classifica il loro impatto sui mercati ${market === "forex" ? "forex" : "delle materie prime"}.

Titoli:
${relevant.map((n, i) => `${i + 1}. [${n.source}] ${n.title}`).join("\n")}

Coppie disponibili: ${allPairs.join(", ")}
Valute: EUR, USD, GBP, JPY, AUD, NZD, CAD, CHF, XAU, XAG, WTI, BRENT, NG, XCU, XPT

Rispondi con un JSON object con chiave "news" contenente un array di oggetti (stesso ordine):
{"news":[{"title":"Titolo tradotto in italiano","summary":"Riassunto in 1-2 frasi in italiano","impact":"HIGH","currencies":["USD","EUR"]}]}

impact: HIGH = notizia che muove i mercati subito, MEDIUM = impatto moderato, LOW = informativa`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const parsed = extractArray(raw);

    return relevant.map((item, idx) => {
      const ai = parsed[idx] || {};
      let ts: string;
      try { ts = new Date(item.pubDate).toISOString(); } catch { ts = new Date().toISOString(); }
      return {
        id: uid(),
        title: ai.title || item.title,
        source: item.source,
        summary: ai.summary || "",
        impact: (["HIGH", "MEDIUM", "LOW"].includes(ai.impact) ? ai.impact : "LOW") as "HIGH" | "MEDIUM" | "LOW",
        currencies: Array.isArray(ai.currencies) ? ai.currencies : [],
        timestamp: ts,
        url: item.link,
        market,
      };
    });
  } catch (err) {
    console.error(`[NEWS] AI processing error for ${market}:`, err);
    return relevant.map(item => {
      let ts: string;
      try { ts = new Date(item.pubDate).toISOString(); } catch { ts = new Date().toISOString(); }
      return {
        id: uid(),
        title: item.title,
        source: item.source,
        summary: "",
        impact: "LOW" as const,
        currencies: [],
        timestamp: ts,
        url: item.link,
        market,
      };
    });
  }
}

function buildSignalFromIndicators(
  p: { pair: string; base: string; quote: string; name?: string },
  ind: PairIndicators | undefined,
  aiData: any,
  market: MarketType,
  liveQuotePrice?: number,
): Signal {
  const now = new Date().toISOString();

  if (!ind || ind.price <= 0) {
    const fallbackPrice = liveQuotePrice && liveQuotePrice > 0
      ? liveQuotePrice
      : (BASE_PRICES[p.pair] ?? BASE_COMMODITY_PRICES[p.pair] ?? 1.0);
    return {
      id: uid(), pair: p.pair, base: p.base, quote: p.quote,
      action: "HOLD", strength: 45, entryPrice: fallbackPrice,
      stopLoss: 0, takeProfit: 0, tp1: 0, tp2: 0, tp3: 0, currentSL: 0, tpHit: 0,
      timeframe: "H4", confidence: 50,
      summary: aiData?.summary ?? `Dati non disponibili per ${p.pair}. Attendere aggiornamento.`,
      analysis: aiData?.analysis ?? `Indicatori non disponibili per ${p.pair}.`,
      timestamp: now, change24h: 0, riskReward: 0, pipTarget: 0, newsFactors: [],
      rsi: 50, macd: 0, ema20: fallbackPrice, ema50: fallbackPrice,
      market, timeframes: { h1: "HOLD", h4: "HOLD", d1: "HOLD" },
      confluence: { score: 0, h1: 0, h4: 0, d1: 0, aligned: false },
    };
  }

  const entry = ind.price;

  const h1Action = recommendToAction(ind.recommend_h1);
  const h4Action = recommendToAction(ind.recommend_h4);
  const d1Action = recommendToAction(ind.recommend_d1);

  const THRESHOLD = 0.2;
  const allBuy = ind.recommend_h1 > THRESHOLD && ind.recommend_h4 > THRESHOLD && ind.recommend_d1 > THRESHOLD;
  const allSell = ind.recommend_h1 < -THRESHOLD && ind.recommend_h4 < -THRESHOLD && ind.recommend_d1 < -THRESHOLD;
  const allAligned = allBuy || allSell;

  const dominantDir = allBuy ? "BUY" : allSell ? "SELL" : h4Action !== "HOLD" ? h4Action : h1Action !== "HOLD" ? h1Action : d1Action;
  let alignedCount = 0;
  if (h1Action === dominantDir && h1Action !== "HOLD") alignedCount++;
  if (h4Action === dominantDir && h4Action !== "HOLD") alignedCount++;
  if (d1Action === dominantDir && d1Action !== "HOLD") alignedCount++;

  const confluenceData: Confluence = {
    score: alignedCount,
    h1: ind.recommend_h1,
    h4: ind.recommend_h4,
    d1: ind.recommend_d1,
    aligned: allAligned,
  };

  let action: "BUY" | "SELL" | "HOLD";
  if (allBuy) {
    action = "BUY";
  } else if (allSell) {
    action = "SELL";
  } else {
    if (h4Action !== "HOLD") {
      console.log(`[CONFLUENCE FILTER] ${p.pair}: H4=${h4Action} blocked | H1=${ind.recommend_h1.toFixed(2)} H4=${ind.recommend_h4.toFixed(2)} D1=${ind.recommend_d1.toFixed(2)} (require all >${THRESHOLD} or all <-${THRESHOLD})`);
    }
    action = "HOLD";
  }

  let confidence = confidenceFromRecommend(ind.recommend_h4);
  if (allAligned) {
    const avgStrength = (Math.abs(ind.recommend_h1) + Math.abs(ind.recommend_h4) + Math.abs(ind.recommend_d1)) / 3;
    confidence = Math.min(95, confidence + Math.round(avgStrength * 10));
  }

  const strength = strengthFromRecommend(ind.recommend_h4, action);
  const timeframes = timeframesFromIndicators(ind);

  const pip = entry > 50 ? 0.01 : entry > 10 ? 0.01 : p.pair.includes("JPY") ? 0.01 : 0.0001;
  const dec = p.pair.includes("JPY") ? 3 : entry > 100 ? 2 : entry > 10 ? 2 : entry > 1 ? 4 : 5;

  let slDist: number;
  if (ind.atr_h4 > 0) {
    slDist = ind.atr_h4 * 1.5;
  } else {
    const isJpy = p.pair.includes("JPY");
    slDist = isJpy ? 20 * pip : 15 * pip;
  }

  const hlRange = ind.high > 0 && ind.low > 0 ? ind.high - ind.low : 0;
  if (hlRange > 0) {
    const minSl = hlRange * 0.3;
    const maxSl = hlRange * 2.0;
    slDist = Math.max(minSl, Math.min(slDist, maxSl));
  }

  let sl: number;
  if (action === "BUY") {
    sl = entry - slDist;
    if (ind.low > 0 && sl > ind.low) {
      sl = ind.low - pip;
    }
  } else if (action === "SELL") {
    sl = entry + slDist;
    if (ind.high > 0 && sl < ind.high) {
      sl = ind.high + pip;
    }
  } else {
    sl = 0;
  }

  const actualSlDist = Math.abs(entry - sl);
  const tp1v = action === "BUY" ? entry + actualSlDist : action === "SELL" ? entry - actualSlDist : 0;
  const tp2v = action === "BUY" ? entry + actualSlDist * 2 : action === "SELL" ? entry - actualSlDist * 2 : 0;
  const tp3v = action === "BUY" ? entry + actualSlDist * 3 : action === "SELL" ? entry - actualSlDist * 3 : 0;
  const pipTarget = actualSlDist > 0 ? Math.round((actualSlDist * 3) / pip) : 0;

  return {
    id: uid(),
    pair: p.pair,
    base: p.base,
    quote: p.quote,
    action,
    strength,
    entryPrice: parseFloat(entry.toFixed(dec)),
    stopLoss: action === "HOLD" ? 0 : parseFloat(sl.toFixed(dec)),
    takeProfit: action === "HOLD" ? 0 : parseFloat(tp3v.toFixed(dec)),
    tp1: action === "HOLD" ? 0 : parseFloat(tp1v.toFixed(dec)),
    tp2: action === "HOLD" ? 0 : parseFloat(tp2v.toFixed(dec)),
    tp3: action === "HOLD" ? 0 : parseFloat(tp3v.toFixed(dec)),
    currentSL: action === "HOLD" ? 0 : parseFloat(sl.toFixed(dec)),
    tpHit: 0,
    timeframe: "H4",
    confidence,
    summary: aiData?.summary ?? `Segnale ${action} su ${p.name ?? p.pair} basato su indicatori reali H4.`,
    analysis: aiData?.analysis ?? `Recommend H4: ${ind.recommend_h4.toFixed(2)}. RSI H4: ${ind.rsi_h4.toFixed(0)}. ATR H4: ${ind.atr_h4.toFixed(dec)}. EMA20: ${ind.ema20_h4.toFixed(dec)} / EMA50: ${ind.ema50_h4.toFixed(dec)}.`,
    timestamp: now,
    change24h: ind.change ?? 0,
    riskReward: action === "HOLD" ? 0 : 3.0,
    pipTarget,
    newsFactors: Array.isArray(aiData?.newsFactors) ? aiData.newsFactors : [],
    rsi: ind.rsi_h4,
    macd: ind.macd_h4,
    ema20: ind.ema20_h4,
    ema50: ind.ema50_h4,
    market,
    timeframes,
    confluence: confluenceData,
    chartPattern: aiData?.chartPattern ?? undefined,
  };
}

export async function generateForexSignalsWithAI(
  indicatorData: Map<string, PairIndicators>,
  liveQuotes?: Map<string, number>,
  realNews?: NewsItem[],
): Promise<{
  signals: Signal[];
  news: NewsItem[];
  alerts: AlertItem[];
}> {
  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const pairDataLines = FOREX_PAIRS.map(p => {
    const ind = indicatorData.get(p.pair);
    if (!ind) return `${p.pair}: dati non disponibili`;
    const action = actionFromRecommend(ind.recommend_h4);
    const dec = p.pair.includes("JPY") ? 3 : 5;
    return `${p.pair}: prezzo ${ind.price.toFixed(dec)} | ${action} | RSI_H4=${ind.rsi_h4.toFixed(0)} | EMA20=${ind.ema20_h4.toFixed(dec)} EMA50=${ind.ema50_h4.toFixed(dec)} | MACD=${ind.macd_h4.toFixed(6)} | ATR_H4=${ind.atr_h4.toFixed(dec)} | H=${ind.high.toFixed(dec)} L=${ind.low.toFixed(dec)} | Rec_H1=${ind.recommend_h1.toFixed(2)} Rec_H4=${ind.recommend_h4.toFixed(2)} Rec_D1=${ind.recommend_d1.toFixed(2)}`;
  }).join("\n");

  const signalsPrompt = `Sei un analista forex professionista. Oggi e' ${today}.
Ecco i DATI REALI degli indicatori tecnici TradingView per le 10 coppie forex:

${pairDataLines}

Per OGNI coppia, la direzione (BUY/SELL/HOLD) e' GIA' DECISA dalla confluenza multi-timeframe: BUY solo se H1, H4 e D1 sono tutti >0.2, SELL solo se tutti <-0.2, altrimenti HOLD.
Tu devi scrivere SOLO: summary (max 80 char, in italiano), analysis (2-3 frasi in italiano con i dati reali), chartPattern e newsFactors.

Rispondi con un JSON object con chiave "signals" contenente un array di 10 oggetti:
{"signals":[{"pair":"EUR/USD","summary":"Trend rialzista confermato, RSI 58 supporta acquisti","analysis":"Prezzo sopra EMA20 e EMA50. RSI a 58 in zona rialzista. MACD positivo.","chartPattern":"Canale rialzista","newsFactors":["PMI zona Euro sopra attese"]}]}

chartPattern: uno tra "Flag rialzista", "Flag ribassista", "Testa e spalle", "Doppio massimo", "Doppio minimo", "Triangolo simmetrico", "Canale rialzista", "Canale ribassista", "Supporto dinamico", "Resistenza dinamica", "Breakout", "Pullback su EMA", "Nessun pattern chiaro".`;

  console.log("Starting AI request for forex signal descriptions (real indicators)...");

  const signalsResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: signalsPrompt }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const signalsRaw = signalsResponse.choices[0]?.message?.content ?? "";
  const parsedSignals = extractArray(signalsRaw);

  console.log("Forex AI parsed: signal descriptions=", parsedSignals.length);

  const now = new Date().toISOString();

  const news: NewsItem[] = realNews || [];

  const signals: Signal[] = FOREX_PAIRS.map((p) => {
    const ind = indicatorData.get(p.pair);
    const aiData = parsedSignals.find((s: any) => s.pair === p.pair);
    const fallbackPrice = liveQuotes?.get(p.pair);
    const signal = buildSignalFromIndicators(p, ind, aiData, "forex", fallbackPrice);
    if (ind) {
      const cfTag = signal.confluence.aligned ? "CONFLUENZA" : signal.confluence.score >= 1 ? "PARZIALE" : "DIVERGENZA";
      console.log(`[FOREX] ${p.pair}: ${signal.action} [${cfTag} ${signal.confluence.score}/3] | Rec H1=${ind.recommend_h1.toFixed(2)} H4=${ind.recommend_h4.toFixed(2)} D1=${ind.recommend_d1.toFixed(2)} | price=${ind.price} RSI=${ind.rsi_h4.toFixed(0)} | SL=${signal.stopLoss} TP1=${signal.tp1} TP2=${signal.tp2} TP3=${signal.tp3}`);
    }
    return signal;
  });

  const alerts: AlertItem[] = signals
    .filter((s) => s.strength >= 70)
    .map((s) => ({
      id: uid(),
      type: "signal" as const,
      title: `Nuovo segnale ${s.action}: ${s.pair}`,
      message: s.summary,
      pair: s.pair,
      action: s.action,
      timestamp: now,
      read: false,
      market: "forex" as MarketType,
    }));

  news.filter((n) => n.impact === "HIGH").forEach((n) => {
    alerts.push({
      id: uid(),
      type: "news" as const,
      title: "Notizia ad alto impatto",
      message: n.title,
      timestamp: n.timestamp,
      read: false,
      market: "forex",
    });
  });

  return { signals, news, alerts };
}

export async function generateCommoditySignalsWithAI(
  indicatorData: Map<string, PairIndicators>,
  liveQuotes?: Map<string, number>,
  realNews?: NewsItem[],
): Promise<{
  signals: Signal[];
  news: NewsItem[];
  alerts: AlertItem[];
}> {
  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const pairDataLines = COMMODITY_PAIRS.map(p => {
    const ind = indicatorData.get(p.pair);
    if (!ind) return `${p.pair} (${p.name}): dati non disponibili`;
    const action = actionFromRecommend(ind.recommend_h4);
    const dec = ind.price > 100 ? 2 : ind.price > 10 ? 2 : 4;
    return `${p.pair} ${p.name}: prezzo ${ind.price.toFixed(dec)} | ${action} | RSI_H4=${ind.rsi_h4.toFixed(0)} | EMA20=${ind.ema20_h4.toFixed(dec)} EMA50=${ind.ema50_h4.toFixed(dec)} | MACD=${ind.macd_h4.toFixed(4)} | ATR_H4=${ind.atr_h4.toFixed(dec)} | H=${ind.high.toFixed(dec)} L=${ind.low.toFixed(dec)} | Rec_H1=${ind.recommend_h1.toFixed(2)} Rec_H4=${ind.recommend_h4.toFixed(2)} Rec_D1=${ind.recommend_d1.toFixed(2)}`;
  }).join("\n");

  const signalsPrompt = `Sei un analista di materie prime professionista. Oggi e' ${today}.
Ecco i DATI REALI degli indicatori tecnici TradingView per le 7 materie prime:

${pairDataLines}

Per OGNI strumento, la direzione (BUY/SELL/HOLD) e' GIA' DECISA dalla confluenza multi-timeframe: BUY solo se H1, H4 e D1 sono tutti >0.2, SELL solo se tutti <-0.2, altrimenti HOLD.
Tu devi scrivere SOLO: summary (max 80 char, in italiano), analysis (2-3 frasi in italiano con i dati reali), chartPattern e newsFactors.

Rispondi con un JSON object con chiave "signals" contenente un array di 7 oggetti:
{"signals":[{"pair":"XAU/USD","summary":"Oro in trend rialzista, RSI 60 conferma momentum","analysis":"Prezzo sopra EMA20 e EMA50. RSI a 60, MACD positivo.","chartPattern":"Canale rialzista","newsFactors":["Aspettative taglio tassi Fed"]}]}

chartPattern: uno tra "Flag rialzista", "Flag ribassista", "Testa e spalle", "Doppio massimo", "Doppio minimo", "Triangolo simmetrico", "Canale rialzista", "Canale ribassista", "Supporto dinamico", "Resistenza dinamica", "Breakout", "Pullback su EMA", "Nessun pattern chiaro".`;

  console.log("Starting AI request for commodity signal descriptions (real indicators)...");

  const signalsResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: signalsPrompt }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const signalsRaw = signalsResponse.choices[0]?.message?.content ?? "";
  const parsedSignals = extractArray(signalsRaw);

  console.log("Commodity AI parsed: signal descriptions=", parsedSignals.length);

  const now = new Date().toISOString();

  const news: NewsItem[] = realNews || [];

  const signals: Signal[] = COMMODITY_PAIRS.map((p) => {
    const ind = indicatorData.get(p.pair);
    const aiData = parsedSignals.find((s: any) => s.pair === p.pair);
    const fallbackPrice = liveQuotes?.get(p.pair);
    const signal = buildSignalFromIndicators(p, ind, aiData, "commodities", fallbackPrice);
    if (ind) {
      const cfTag = signal.confluence.aligned ? "CONFLUENZA" : signal.confluence.score >= 1 ? "PARZIALE" : "DIVERGENZA";
      console.log(`[COMMODITY] ${p.pair}: ${signal.action} [${cfTag} ${signal.confluence.score}/3] | Rec H1=${ind.recommend_h1.toFixed(2)} H4=${ind.recommend_h4.toFixed(2)} D1=${ind.recommend_d1.toFixed(2)} | price=${ind.price} RSI=${ind.rsi_h4.toFixed(0)} | SL=${signal.stopLoss} TP1=${signal.tp1} TP2=${signal.tp2} TP3=${signal.tp3}`);
    }
    return signal;
  });

  const alerts: AlertItem[] = signals
    .filter((s) => s.strength >= 70)
    .map((s) => ({
      id: uid(),
      type: "signal" as const,
      title: `Nuovo segnale ${s.action}: ${s.pair}`,
      message: s.summary,
      pair: s.pair,
      action: s.action,
      timestamp: now,
      read: false,
      market: "commodities" as MarketType,
    }));

  news.filter((n) => n.impact === "HIGH").forEach((n) => {
    alerts.push({
      id: uid(),
      type: "news" as const,
      title: "Notizia ad alto impatto - Materie Prime",
      message: n.title,
      timestamp: n.timestamp,
      read: false,
      market: "commodities",
    });
  });

  return { signals, news, alerts };
}

export interface ScalpingSignalData {
  id: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  currentSL: number;
  tp1: number;
  tp2: number;
  confidence: number;
  timeframe: "M1" | "M5";
  summary: string;
  status: "active" | "hit_tp1" | "hit_tp2" | "hit_sl" | "hit_tp1_then_sl" | "expired";
  pipResult: number;
  beActive: boolean;
  expiresAt: string;
  createdAt: string;
  closedAt: string | null;
}

interface ConfluenceResult {
  action: "BUY" | "SELL" | null;
  score: number;
  timeframe: "M1" | "M5";
  atr: number;
  reasons: string[];
}

function evaluateTFDirection(ind: { ema9: number; ema21: number; rsi: number; atr: number; macdLine: number; macdSignal: number; close: number }) {
  const { ema9, ema21, rsi, macdLine, macdSignal, close } = ind;
  if (ema9 <= 0 || ema21 <= 0 || rsi <= 0) return null;

  let buyScore = 0;
  let sellScore = 0;
  const buyReasons: string[] = [];
  const sellReasons: string[] = [];

  if (ema9 > ema21) { buyScore += 2; buyReasons.push(`EMA9>${ema9.toFixed(2)}>EMA21`); }
  else               { sellScore += 2; sellReasons.push(`EMA9<EMA21 (${ema9.toFixed(2)}<${ema21.toFixed(2)})`); }

  if (rsi > 55 && rsi <= 72) { buyScore += 2; buyReasons.push(`RSI ${rsi.toFixed(0)} zona rialzo`); }
  else if (rsi >= 28 && rsi < 45) { sellScore += 2; sellReasons.push(`RSI ${rsi.toFixed(0)} zona ribasso`); }

  if (macdLine > macdSignal) { buyScore += 2; buyReasons.push(`MACD cross bullish`); }
  else                        { sellScore += 2; sellReasons.push(`MACD cross bearish`); }

  if (close > ema9) { buyScore += 1; buyReasons.push(`prezzo sopra EMA9`); }
  else               { sellScore += 1; sellReasons.push(`prezzo sotto EMA9`); }

  const score = Math.max(buyScore, sellScore);
  const action = buyScore >= sellScore && buyScore >= 5 ? "BUY" as const
    : sellScore > buyScore && sellScore >= 5 ? "SELL" as const
    : null;
  const reasons = buyScore >= sellScore ? buyReasons : sellReasons;
  return { action, score, reasons };
}

function evaluateConfluence(data: XAUScalpingIndicators): ConfluenceResult {
  const m1 = evaluateTFDirection(data.m1);
  const m5 = evaluateTFDirection(data.m5);

  if (!m1 || !m5) return { action: null, score: 0, timeframe: "M1", atr: 0, reasons: [] };

  if (data.m5.atr <= 0.5) {
    console.log(`[SCALPING] ATR M5 troppo basso (${data.m5.atr.toFixed(3)} < 0.5). Mercato piatto, skip.`);
    return { action: null, score: 0, timeframe: "M5", atr: data.m5.atr, reasons: [] };
  }

  if (!m5.action) {
    console.log(`[SCALPING] M5 non direzionale (${m5.score}/7). Nessun segnale.`);
    return { action: null, score: m5.score, timeframe: "M5", atr: data.m5.atr, reasons: [] };
  }

  if (m1.score < 4) {
    console.log(`[SCALPING] M1 troppo debole (${m1.score}/7 < 4). Conferma insufficiente.`);
    return { action: null, score: m1.score + m5.score, timeframe: "M5", atr: data.m5.atr, reasons: [] };
  }

  if (m1.action && m1.action !== m5.action) {
    console.log(`[SCALPING] M1=${m1.action} vs M5=${m5.action} divergenti. Nessun segnale.`);
    return { action: null, score: Math.max(m1.score, m5.score), timeframe: "M5", atr: data.m5.atr, reasons: [] };
  }

  const action = m5.action;
  if (action === "BUY" && data.m5.rsi > 72) {
    console.log(`[SCALPING] RSI M5 overbought (${data.m5.rsi.toFixed(0)} > 72). BUY rischioso, skip.`);
    return { action: null, score: m5.score, timeframe: "M5", atr: data.m5.atr, reasons: [] };
  }
  if (action === "SELL" && data.m5.rsi < 28) {
    console.log(`[SCALPING] RSI M5 oversold (${data.m5.rsi.toFixed(0)} < 28). SELL rischioso, skip.`);
    return { action: null, score: m5.score, timeframe: "M5", atr: data.m5.atr, reasons: [] };
  }

  const combinedScore = m1.score + m5.score;
  if (combinedScore < 10) {
    console.log(`[SCALPING] Score combinato insufficiente (${combinedScore}/14 < 10). M1=${m1.action ?? "HOLD"}(${m1.score}/7) M5=${m5.action}(${m5.score}/7).`);
    return { action: null, score: combinedScore, timeframe: "M5", atr: data.m5.atr, reasons: [] };
  }
  const allReasons = [...m5.reasons, ...m1.reasons.filter(r => !m5.reasons.includes(r))];
  const tf: "M1" | "M5" = m1.score >= m5.score ? "M1" : "M5";
  const atr = tf === "M1" ? data.m1.atr : data.m5.atr;

  return { action, score: combinedScore, timeframe: tf, atr, reasons: allReasons };
}

export async function generateScalpingSignal(data: XAUScalpingIndicators): Promise<ScalpingSignalData | null> {
  const nowUtc = new Date().getUTCHours();
  const isLondon = nowUtc >= 8 && nowUtc < 16;
  const isNY = nowUtc >= 13 && nowUtc < 21;
  if (!isLondon && !isNY) {
    console.log(`[SCALPING] Sessione non operativa (ora UTC: ${nowUtc}). Segnale non generato.`);
    return null;
  }

  const confluence = evaluateConfluence(data);
  if (!confluence.action) {
    console.log(`[SCALPING] Confluenza insufficiente (score: ${confluence.score}/14). Nessun segnale.`);
    return null;
  }

  const confidence = Math.min(97, 82 + Math.round(((confluence.score - 10) / 4) * 15));
  const livePrice = data.price;
  const { action, timeframe, atr, reasons } = confluence;

  const slRangeMin = timeframe === "M1" ? 0.8 : 1.5;
  const slRangeMax = timeframe === "M1" ? 1.5 : 2.5;
  const slDist = atr > 0
    ? Math.max(slRangeMin, Math.min(slRangeMax, atr * 1.5))
    : (timeframe === "M1" ? 1.0 : 2.0);

  const entry = parseFloat(livePrice.toFixed(2));
  const sl   = action === "BUY" ? parseFloat((entry - slDist).toFixed(2)) : parseFloat((entry + slDist).toFixed(2));
  const tp1  = action === "BUY" ? parseFloat((entry + slDist * 1.5).toFixed(2)) : parseFloat((entry - slDist * 1.5).toFixed(2));
  const tp2  = action === "BUY" ? parseFloat((entry + slDist * 3).toFixed(2)) : parseFloat((entry - slDist * 3).toFixed(2));

  const sessionLabel = (isLondon && isNY) ? "Londra/NY" : isLondon ? "Londra" : "New York";
  const reasonsText = reasons.slice(0, 3).join(", ");

  let summary = `${action} ${timeframe}: ${reasonsText} | sessione ${sessionLabel}`.slice(0, 100);

  try {
    const summaryPrompt = `Sei un trader professionista. Scrivi UN SOLO summary in italiano (max 85 caratteri, senza emoji) per questo segnale di scalping su XAU/USD:
- Direzione: ${action}
- Timeframe: ${timeframe}
- Indicatori chiave: ${reasonsText}
- Sessione: ${sessionLabel}
- RSI: ${(timeframe === "M1" ? data.m1 : data.m5).rsi.toFixed(0)}
- Entry: $${entry}
Rispondi con SOLO il testo del summary, niente altro.`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: summaryPrompt }],
      temperature: 0.4,
      max_tokens: 60,
    });
    const aiSummary = resp.choices[0]?.message?.content?.trim() ?? "";
    if (aiSummary.length > 0 && aiSummary.length <= 100) summary = aiSummary;
  } catch { }

  const now = new Date();
  const expiryMs = timeframe === "M1" ? 20 * 60000 : 35 * 60000;
  const expiresAt = new Date(now.getTime() + expiryMs);

  console.log(`[SCALPING] Confluenza OK: ${action} ${timeframe} score=${confluence.score}/14 conf=${confidence}% | ${reasonsText}`);

  return {
    id: uid(),
    action,
    entryPrice: entry,
    stopLoss: sl,
    currentSL: sl,
    tp1,
    tp2,
    confidence,
    timeframe,
    summary,
    status: "active",
    pipResult: 0,
    beActive: false,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    closedAt: null,
  };
}
