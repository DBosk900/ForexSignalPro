import { Share } from "react-native";

interface ShareableSignal {
  pair: string;
  action: string;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidence: number;
  strength: number;
  timeframe: string;
  timestamp?: string;
  summary?: string;
}

export async function shareSignal(signal: ShareableSignal) {
  const actionLabel = signal.action === "BUY" ? "ACQUISTA" : signal.action === "SELL" ? "VENDI" : "MANTIENI";
  const arrow = signal.action === "BUY" ? "▲" : signal.action === "SELL" ? "▼" : "●";
  const ep = signal.entryPrice;
  const dec = ep > 100 ? 2 : ep > 10 ? 2 : 4;

  const dateStr = signal.timestamp
    ? new Date(signal.timestamp).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const text = [
    `${arrow} ${signal.pair} — ${actionLabel}`,
    `Data: ${dateStr}`,
    `━━━━━━━━━━━━━━━━━━━`,
    `Entrata: ${ep.toFixed(dec)}`,
    `SL: ${signal.stopLoss.toFixed(dec)}`,
    `TP1: ${signal.tp1.toFixed(dec)}`,
    `TP2: ${signal.tp2.toFixed(dec)}`,
    `TP3: ${signal.tp3.toFixed(dec)}`,
    `━━━━━━━━━━━━━━━━━━━`,
    `Confidenza: ${signal.confidence}%`,
    `Forza: ${signal.strength}%`,
    `Timeframe: ${signal.timeframe}`,
    signal.summary ? `\n${signal.summary}` : "",
    `\nForex Signals AI`,
  ].filter(Boolean).join("\n");

  try {
    await Share.share({
      message: text,
      title: `${signal.pair} — ${actionLabel}`,
    });
  } catch {}
}
