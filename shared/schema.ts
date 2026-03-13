import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const signalHistory = pgTable("signal_history", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  pair: text("pair").notNull(),
  action: text("action").notNull(),
  entryPrice: real("entry_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  takeProfit: real("take_profit").notNull(),
  tp1: real("tp1"),
  tp2: real("tp2"),
  tp3: real("tp3"),
  tpLevel: integer("tp_level").default(0),
  confidence: integer("confidence").notNull(),
  strength: integer("strength").notNull(),
  timeframe: text("timeframe").notNull(),
  summary: text("summary"),
  rsi: real("rsi"),
  macd: real("macd"),
  outcome: text("outcome").notNull().default("pending"),
  pipResult: real("pip_result"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const activeSignals = pgTable("active_signals", {
  id: varchar("id").primaryKey(),
  pair: text("pair").notNull(),
  market: text("market").notNull(),
  signalData: text("signal_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const priceAlerts = pgTable("price_alerts", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  pair: text("pair").notNull(),
  targetPrice: real("target_price").notNull(),
  direction: text("direction").notNull(),
  note: text("note"),
  triggered: boolean("triggered").default(false).notNull(),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pushTokensTable = pgTable("push_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsed: timestamp("last_used").defaultNow().notNull(),
});

export const scalpingSignals = pgTable("scalping_signals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  entryPrice: real("entry_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  currentSL: real("current_sl").notNull(),
  tp1: real("tp1").notNull(),
  tp2: real("tp2").notNull(),
  confidence: integer("confidence").notNull(),
  timeframe: text("timeframe").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("active"),
  pipResult: real("pip_result"),
  beActive: boolean("be_active").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export type ScalpingSignal = typeof scalpingSignals.$inferSelect;
export type PriceAlert = typeof priceAlerts.$inferSelect;
export type PushToken = typeof pushTokensTable.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SignalHistory = typeof signalHistory.$inferSelect;
