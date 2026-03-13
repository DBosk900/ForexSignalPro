const TV_FOREX_URL = "https://scanner.tradingview.com/forex/scan";
const TV_CFD_URL = "https://scanner.tradingview.com/cfd/scan";
const TV_FUTURES_URL = "https://scanner.tradingview.com/futures/scan";
const TV_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; TradingSignals/1.0)",
};

const FOREX_TICKER_MAP: Record<string, string> = {
  "EUR/USD": "FX_IDC:EURUSD",
  "GBP/USD": "FX_IDC:GBPUSD",
  "USD/JPY": "FX_IDC:USDJPY",
  "USD/CHF": "FX_IDC:USDCHF",
  "AUD/USD": "FX_IDC:AUDUSD",
  "USD/CAD": "FX_IDC:USDCAD",
  "NZD/USD": "FX_IDC:NZDUSD",
  "EUR/GBP": "FX_IDC:EURGBP",
  "EUR/JPY": "FX_IDC:EURJPY",
  "GBP/JPY": "FX_IDC:GBPJPY",
};

const COMMODITY_CFD_MAP: Record<string, string> = {
  "XAU/USD": "TVC:GOLD",
  "XAG/USD": "TVC:SILVER",
  "NG/USD": "OANDA:NATGASUSD",
  "XCU/USD": "OANDA:XCUUSD",
  "XPT/USD": "TVC:PLATINUM",
};

const COMMODITY_FUTURES_MAP: Record<string, string> = {
  "WTI/USD": "NYMEX:CL1!",
  "BRENT/USD": "NYMEX:BZ1!",
};

const COMMODITY_TICKER_MAP: Record<string, string> = {
  ...COMMODITY_CFD_MAP,
  ...COMMODITY_FUTURES_MAP,
};

const TICKER_TO_PAIR: Record<string, string> = {};
for (const [pair, ticker] of Object.entries(FOREX_TICKER_MAP)) {
  TICKER_TO_PAIR[ticker] = pair;
}
for (const [pair, ticker] of Object.entries(COMMODITY_TICKER_MAP)) {
  TICKER_TO_PAIR[ticker] = pair;
}

export interface TVQuote {
  pair: string;
  price: number;
  change: number;
  changeAbs: number;
  high: number;
  low: number;
  open: number;
}

interface TVResponse {
  totalCount: number;
  data: Array<{
    s: string;
    d: (string | number | null)[];
  }>;
}

const COLUMNS = ["name", "close", "change", "change_abs", "high", "low", "open"];

async function fetchFromTV(
  url: string,
  tickers: string[]
): Promise<TVQuote[]> {
  const body = {
    symbols: { tickers },
    columns: COLUMNS,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: TV_HEADERS,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`TradingView API error: ${response.status}`);
  }
  const data = (await response.json()) as TVResponse;
  return data.data.map((item) => {
    const pair = TICKER_TO_PAIR[item.s] || (item.d[0] as string);
    return {
      pair,
      price: (item.d[1] as number) ?? 0,
      change: (item.d[2] as number) ?? 0,
      changeAbs: (item.d[3] as number) ?? 0,
      high: (item.d[4] as number) ?? 0,
      low: (item.d[5] as number) ?? 0,
      open: (item.d[6] as number) ?? 0,
    };
  });
}

const QUOTES_TTL = 5000;

const forexCache: { data: TVQuote[] | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
const commodityCache: { data: TVQuote[] | null; fetchedAt: number } = { data: null, fetchedAt: 0 };

export async function fetchForexQuotes(
  pairs?: string[]
): Promise<TVQuote[]> {
  if (!pairs && forexCache.data && Date.now() - forexCache.fetchedAt < QUOTES_TTL) {
    return forexCache.data;
  }
  const tickers = pairs
    ? pairs.map((p) => FOREX_TICKER_MAP[p]).filter(Boolean)
    : Object.values(FOREX_TICKER_MAP);
  if (tickers.length === 0) return [];
  try {
    const result = await fetchFromTV(TV_FOREX_URL, tickers);
    if (!pairs) {
      forexCache.data = result;
      forexCache.fetchedAt = Date.now();
    }
    return result;
  } catch (err) {
    console.error("TradingView forex fetch error:", err);
    if (!pairs && forexCache.data) return forexCache.data;
    return [];
  }
}

export async function fetchCommodityQuotes(
  pairs?: string[]
): Promise<TVQuote[]> {
  if (!pairs && commodityCache.data && Date.now() - commodityCache.fetchedAt < QUOTES_TTL) {
    return commodityCache.data;
  }

  const cfdTickers = pairs
    ? pairs.map((p) => COMMODITY_CFD_MAP[p]).filter(Boolean)
    : Object.values(COMMODITY_CFD_MAP);
  const futuresTickers = pairs
    ? pairs.map((p) => COMMODITY_FUTURES_MAP[p]).filter(Boolean)
    : Object.values(COMMODITY_FUTURES_MAP);

  try {
    const promises: Promise<TVQuote[]>[] = [];
    if (cfdTickers.length > 0) promises.push(fetchFromTV(TV_CFD_URL, cfdTickers));
    if (futuresTickers.length > 0) promises.push(fetchFromTV(TV_FUTURES_URL, futuresTickers));

    const settled = await Promise.allSettled(promises);
    const combined = settled
      .filter((r): r is PromiseFulfilledResult<TVQuote[]> => r.status === "fulfilled")
      .flatMap(r => r.value);

    if (!pairs) {
      commodityCache.data = combined;
      commodityCache.fetchedAt = Date.now();
    }
    return combined;
  } catch (err) {
    console.error("TradingView commodity fetch error:", err);
    if (!pairs && commodityCache.data) return commodityCache.data;
    return [];
  }
}

export async function fetchAllQuotes(): Promise<TVQuote[]> {
  const [forex, commodities] = await Promise.all([
    fetchForexQuotes(),
    fetchCommodityQuotes(),
  ]);
  return [...forex, ...commodities];
}

export function getTVTicker(
  pair: string
): string | undefined {
  return FOREX_TICKER_MAP[pair] || COMMODITY_TICKER_MAP[pair];
}

export function isForexPair(pair: string): boolean {
  return pair in FOREX_TICKER_MAP;
}

export interface PairIndicators {
  pair: string;
  price: number;
  change: number;
  high: number;
  low: number;
  rsi_h1: number;
  rsi_h4: number;
  ema20_h4: number;
  ema50_h4: number;
  macd_h4: number;
  macdSignal_h4: number;
  atr_h4: number;
  recommend_h1: number;
  recommend_h4: number;
  recommend_d1: number;
}

const INDICATOR_COLUMNS = [
  "close", "change", "high", "low",
  "RSI|60", "RSI|240",
  "EMA20|240", "EMA50|240",
  "MACD.macd|240", "MACD.signal|240",
  "ATR|240",
  "Recommend.All|60", "Recommend.All|240", "Recommend.All|1D",
];

function parseIndicatorRow(pair: string, d: (string | number | null)[]): PairIndicators {
  const s = (v: string | number | null | undefined): number =>
    typeof v === "number" && isFinite(v) ? v : 0;
  return {
    pair,
    price:          s(d[0]),
    change:         s(d[1]),
    high:           s(d[2]),
    low:            s(d[3]),
    rsi_h1:         s(d[4]),
    rsi_h4:         s(d[5]),
    ema20_h4:       s(d[6]),
    ema50_h4:       s(d[7]),
    macd_h4:        s(d[8]),
    macdSignal_h4:  s(d[9]),
    atr_h4:         s(d[10]),
    recommend_h1:   s(d[11]),
    recommend_h4:   s(d[12]),
    recommend_d1:   s(d[13]),
  };
}

async function fetchIndicatorsFromTV(
  url: string,
  tickers: string[],
): Promise<PairIndicators[]> {
  const body = { symbols: { tickers }, columns: INDICATOR_COLUMNS };
  const response = await fetch(url, {
    method: "POST",
    headers: TV_HEADERS,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`TradingView indicator API error: ${response.status}`);
  const data = (await response.json()) as TVResponse;
  return data.data.map((item) => {
    const pair = TICKER_TO_PAIR[item.s] || item.s;
    return parseIndicatorRow(pair, item.d as (string | number | null)[]);
  });
}

const INDICATOR_TTL = 30000;
const forexIndicatorCache: { data: Map<string, PairIndicators> | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
const commodityIndicatorCache: { data: Map<string, PairIndicators> | null; fetchedAt: number } = { data: null, fetchedAt: 0 };

export async function fetchForexIndicators(): Promise<Map<string, PairIndicators>> {
  if (forexIndicatorCache.data && Date.now() - forexIndicatorCache.fetchedAt < INDICATOR_TTL) {
    return forexIndicatorCache.data;
  }
  try {
    const tickers = Object.values(FOREX_TICKER_MAP);
    const results = await fetchIndicatorsFromTV(TV_FOREX_URL, tickers);
    const map = new Map<string, PairIndicators>();
    for (const r of results) if (r.price > 0) map.set(r.pair, r);
    forexIndicatorCache.data = map;
    forexIndicatorCache.fetchedAt = Date.now();
    return map;
  } catch (err) {
    console.error("TradingView forex indicator fetch error:", err);
    return forexIndicatorCache.data ?? new Map();
  }
}

export async function fetchCommodityIndicators(): Promise<Map<string, PairIndicators>> {
  if (commodityIndicatorCache.data && Date.now() - commodityIndicatorCache.fetchedAt < INDICATOR_TTL) {
    return commodityIndicatorCache.data;
  }
  try {
    const promises: Promise<PairIndicators[]>[] = [];
    const cfdTickers = Object.values(COMMODITY_CFD_MAP);
    const futuresTickers = Object.values(COMMODITY_FUTURES_MAP);
    if (cfdTickers.length > 0) promises.push(fetchIndicatorsFromTV(TV_CFD_URL, cfdTickers));
    if (futuresTickers.length > 0) promises.push(fetchIndicatorsFromTV(TV_FUTURES_URL, futuresTickers));

    const settled = await Promise.allSettled(promises);
    const map = new Map<string, PairIndicators>();
    for (const r of settled) {
      if (r.status === "fulfilled") {
        for (const item of r.value) if (item.price > 0) map.set(item.pair, item);
      }
    }
    commodityIndicatorCache.data = map;
    commodityIndicatorCache.fetchedAt = Date.now();
    return map;
  } catch (err) {
    console.error("TradingView commodity indicator fetch error:", err);
    return commodityIndicatorCache.data ?? new Map();
  }
}

export interface XAUScalpingIndicators {
  price: number;
  m1: {
    close: number; high: number; low: number;
    ema9: number; ema21: number; rsi: number;
    atr: number; macdLine: number; macdSignal: number;
  };
  m5: {
    close: number; high: number; low: number;
    ema9: number; ema21: number; rsi: number;
    atr: number; macdLine: number; macdSignal: number;
  };
}

export interface RawCalendarEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
}

const calendarCache: { data: RawCalendarEvent[] | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
const CALENDAR_TTL = 30 * 60 * 1000;

export async function fetchRealCalendar(): Promise<RawCalendarEvent[]> {
  if (calendarCache.data && Date.now() - calendarCache.fetchedAt < CALENDAR_TTL) {
    return calendarCache.data;
  }
  try {
    const FF_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
    const response = await fetch(FF_CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TradingSignals/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`ForexFactory calendar API error: ${response.status}`);
    const raw = await response.json() as any[];
    const events: RawCalendarEvent[] = raw
      .filter((e: any) => e.title && e.date)
      .map((e: any) => {
        let dateStr = "";
        let timeStr = "All Day";
        try {
          const d = new Date(e.date);
          if (!isNaN(d.getTime())) {
            dateStr = d.toISOString().split("T")[0];
            const hours = d.getUTCHours();
            const minutes = d.getUTCMinutes();
            if (hours !== 0 || minutes !== 0) {
              timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
            }
          } else {
            dateStr = e.date;
          }
        } catch {
          dateStr = e.date;
        }
        return {
          title: e.title ?? "",
          country: e.country ?? "",
          date: dateStr,
          time: timeStr,
          impact: e.impact ?? "Low",
          forecast: e.forecast ?? "",
          previous: e.previous ?? "",
          actual: e.actual ?? "",
        };
      });
    console.log(`[CALENDAR] Fetched ${events.length} real events from ForexFactory (source: ${FF_CALENDAR_URL})`);
    calendarCache.data = events;
    calendarCache.fetchedAt = Date.now();
    return events;
  } catch (err) {
    console.error("[CALENDAR] ForexFactory fetch error:", err);
    if (calendarCache.data) return calendarCache.data;
    return [];
  }
}

export interface RawNewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

const newsRSSCache: { data: RawNewsItem[] | null; fetchedAt: number } = { data: null, fetchedAt: 0 };
const NEWS_RSS_TTL = 15 * 60 * 1000;

const RSS_FEEDS = [
  { url: "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines", source: "MarketWatch" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", source: "CNBC" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000115", source: "CNBC Commodities" },
  { url: "https://www.reutersagency.com/feed/?best-topics=business-finance", source: "Reuters" },
  { url: "https://www.ft.com/rss/markets", source: "Financial Times" },
];

function parseRSSItems(xml: string, source: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/);
    const dateMatch = itemXml.match(/<pubDate>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/pubDate>/);
    if (titleMatch && titleMatch[1]) {
      items.push({
        title: titleMatch[1].trim(),
        link: linkMatch?.[1]?.trim() ?? "",
        pubDate: dateMatch?.[1]?.trim() ?? new Date().toISOString(),
        source,
      });
    }
  }
  return items;
}

export async function fetchFinancialNewsRSS(): Promise<RawNewsItem[]> {
  if (newsRSSCache.data && Date.now() - newsRSSCache.fetchedAt < NEWS_RSS_TTL) {
    return newsRSSCache.data;
  }
  try {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TradingSignals/1.0)" },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return [];
        const xml = await response.text();
        return parseRSSItems(xml, feed.source);
      })
    );
    const allItems: RawNewsItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") allItems.push(...r.value);
    }
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    const deduplicated = allItems.filter((item, index, self) =>
      index === self.findIndex(t => t.title === item.title)
    ).slice(0, 30);
    const feedUrls = RSS_FEEDS.map(f => f.source + ": " + f.url).join(", ");
    console.log(`[NEWS RSS] Fetched ${deduplicated.length} real headlines from ${RSS_FEEDS.length} feeds (sources: ${feedUrls})`);
    newsRSSCache.data = deduplicated;
    newsRSSCache.fetchedAt = Date.now();
    return deduplicated;
  } catch (err) {
    console.error("[NEWS RSS] Fetch error:", err);
    if (newsRSSCache.data) return newsRSSCache.data;
    return [];
  }
}

export async function fetchXAUScalpingData(): Promise<XAUScalpingIndicators | null> {
  const columns = [
    "close",
    "EMA9|1", "EMA21|1", "RSI|1", "ATR|1", "MACD.macd|1", "MACD.signal|1", "close|1", "high|1", "low|1",
    "EMA9|5", "EMA21|5", "RSI|5", "ATR|5", "MACD.macd|5", "MACD.signal|5", "close|5", "high|5", "low|5",
  ];

  const body = {
    symbols: { tickers: ["TVC:GOLD"] },
    columns,
  };

  try {
    const response = await fetch(TV_CFD_URL, {
      method: "POST",
      headers: TV_HEADERS,
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as TVResponse;
    if (!data.data || data.data.length === 0) return null;

    const d = data.data[0].d as (number | null)[];

    const safeNum = (v: number | null | undefined): number => (typeof v === "number" && isFinite(v) ? v : 0);

    const result: XAUScalpingIndicators = {
      price: safeNum(d[0]),
      m1: {
        ema9:       safeNum(d[1]),
        ema21:      safeNum(d[2]),
        rsi:        safeNum(d[3]),
        atr:        safeNum(d[4]),
        macdLine:   safeNum(d[5]),
        macdSignal: safeNum(d[6]),
        close:      safeNum(d[7]),
        high:       safeNum(d[8]),
        low:        safeNum(d[9]),
      },
      m5: {
        ema9:       safeNum(d[10]),
        ema21:      safeNum(d[11]),
        rsi:        safeNum(d[12]),
        atr:        safeNum(d[13]),
        macdLine:   safeNum(d[14]),
        macdSignal: safeNum(d[15]),
        close:      safeNum(d[16]),
        high:       safeNum(d[17]),
        low:        safeNum(d[18]),
      },
    };

    if (result.price <= 0) return null;
    return result;
  } catch (err) {
    console.error("[SCALPING] Errore fetch indicatori XAU:", err);
    return null;
  }
}
