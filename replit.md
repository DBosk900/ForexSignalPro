# Forex & Commodities Trading Signals App

## Overview
A mobile application designed to provide AI-generated trading signals for forex pairs and commodities. The app analyzes economic news to produce BUY/SELL/HOLD recommendations, incorporating multi-timeframe analysis, risk management tools, and portfolio tracking. It aims to empower users with data-driven insights for trading decisions, catering to both forex and commodity markets with real-time data and comprehensive historical performance tracking. The project's ambition is to offer a sophisticated yet user-friendly platform for retail traders.

## User Preferences
- All user-facing labels should be in Italian, except for universal trading jargon like BUY/SELL/HOLD.
- The AI model used for signal generation should specifically be `gpt-4o-mini`.

## System Architecture
The application is built with Expo React Native for the frontend, utilizing `expo-router` for file-based routing and React Query for efficient data fetching. The backend runs on Express.js with TypeScript, serving API endpoints. AI signal generation and analysis are powered by OpenAI's `gpt-4o-mini` via Replit AI Integrations. PostgreSQL, managed with Drizzle ORM, serves as the database for storing signal history and other relevant data.

**UI/UX Decisions:**
- Dark and light theme support with Bloomberg-inspired color palettes.
- Custom AI-generated app icon and Inter font.
- Skeleton loading, pull-to-refresh, and smooth page transitions.
- Contextual empty states and market status banners.
- LiveTicker: Bloomberg-style auto-scrolling horizontal ticker strip with active signal pairs, live prices, and P&L.
- Swipe Gestures for signal cards (favorite, share).
- Long Press Action Sheet for contextual signal card actions.
- Dashboard Personalization: Users can reorder and toggle visibility of home screen sections.

**Technical Implementations & Feature Specifications:**
- **Signals & Markets:** Dedicated tabs for AI-generated trading signals and live market rates for 10 forex pairs and 7 commodities.
- **Multi-Timeframe Analysis:** Signals include direction badges (H1, H4, D1) and convergence section. Confluence filter (Task #6) enforces H1/H4/D1 alignment: full agreement (3/3) boosts confidence, partial agreement (H4+H1 or H4+D1) passes with slight reduction, no agreement forces HOLD. Confluence score, raw Recommend.All values, and alignment status shown on cards and detail page.
- **Risk Management:** Integrated risk calculator for position sizing.
- **Portfolio & History:** Collapsible P&L widget and enhanced signal history tracking with performance statistics and equity curve charts.
- **Economic Calendar (Real Data):** ForexFactory JSON API provides real weekly events (CPI, NFP, PMI, Fed decisions, OPEC, etc.) with forecast/previous/actual values. AI translates event titles to Italian. Holiday and Low impact events are filtered. Cache 30 minutes.
- **News Feed (Real Data):** RSS feeds from MarketWatch + CNBC provide real financial headlines. AI translates to Italian, classifies impact (HIGH/MEDIUM/LOW), and generates 1-2 sentence summaries. Source shown is the real feed name. Cache 15 minutes.
- **Currency Strength Meter (TradingView Recommend.All):** Calculates relative strength using weighted multi-timeframe Recommend.All values (H1: 20%, H4: 50%, D1: 30%) from all forex pairs. For each pair, base currency += weighted_rec, quote currency -= weighted_rec.
- **Notification System:** Smart notifications for trading signals, calendar events, and price alerts.
- **AI Integration:** Interactive "AI Trading Coach" chat and daily "AI Morning Briefing."
- **Market Analysis Tools:** Currency Strength Meter, Sentiment Heatmap, and Technical Radar Chart.
- **Live P&L on Signal Cards:** Real-time pip profit/loss with color-coded progress bar.
- **Risk Exposure Dashboard:** Portfolio-level risk analysis with circular gauges, aggregate pip metrics, and correlation/overexposure alerts.
- **Gamification:** Achievements, levels, and points system.
- **Scalping Mode (XAU/USD):** Dedicated feature with M1/M5 timeframes, specific AI settings, expiry, TP/SL rules, and push notifications.
- **Multi-TP Signal System:** Signals with three Take Profit levels (TP1, TP2, TP3) and associated trailing stop logic.
- **Signal Persistence System:** Active signals are persisted in the database, surviving server restarts, with continuous monitoring and historical tracking.
- **Commodity Pip Values:** Defined pip values for various commodities.
- **TradingView Ticker Mapping:** Specific mappings for forex and commodities.
- **Outcome Alerts & Notifications:** Server-generated outcome alerts with Italian messaging, in-app banners, and haptic feedback.
- **Daily Summary Widget:** Displays daily performance statistics.
- **Push Notifications (Server-Side):** Utilizes `expo-server-sdk` for sending high-priority push notifications for signals and outcomes.
- **Night Session Block:** Signal generation suspended during specified night hours, with active signals still monitored.
- **News Guard (Task #7):** Automatic signal blocking within ±30 min of HIGH impact calendar events. `isNewsBlocked()` checks pair currencies against event currencies. New BUY/SELL signals blocked during window with `[NEWS GUARD] BLOCCATO` logging. Active signals get `newsWarning` field with Italian countdown text, updated every ~60s. Orange warning banner on signal cards and detail page.
- **Dashboard Performance Reale (Task #8):** `/api/performance` endpoint computes from DB: win rate, profit factor (win pips / loss pips), avg R:R (winners only), equity curve, per-pair BUY/SELL breakdown with directional win rates, scalping stats from `scalping_signals` table. Frontend `app/history.tsx`: Forex/Scalping tab selector, "Statistiche Globali" card (win rate, profit factor, pips totali, R:R medio), BUY/SELL distribution per pair, scalping XAU stats tab, proper Italian empty states.
- **History Page Improvements:** Filtering by TP level, equity curve chart with outcome markers, and detailed stats.
- **Correlation Radar:** Live correlation matrix with color-coded grid and pulsating cells for strong correlations.
- **Signal Replay:** Animated mini-chart showing price movement for historical signals.
- **AI Trade Journal:** AI-generated performance analysis based on signal history.
- **Sniper Mode:** Client-side filtering of active signals based on high confidence and strength.
- **World Session Map:** SVG world map visualization showing market sessions and volatile pairs.
- **Enhanced Achievements:** 31 achievements across 9 categories with variable points and levels.
- **Trade Simulator:** Virtual paper trading with real quotes and historical tracking.
- **Performance Report:** AI-generated weekly/monthly performance reports.
- **Custom Price Alerts:** User-defined price alerts with push notifications.
- **Volatility Meter:** ATR-based volatility classification for all pairs.
- **Signal Comparison:** Side-by-side comparison of two signals with radar chart and algorithmic verdict.

## External Dependencies
- **OpenAI:** `gpt-4o-mini` for AI signal generation narratives, calendar title translation, news translation/classification, AI coach/briefing, trade journal, and performance reports.
- **PostgreSQL:** Primary database accessed via Drizzle ORM.
- **frankfurter.app API:** Provides 30-day historical forex rates.
- **TradingView:** Integrated via `scanner.tradingview.com` for real-time forex and commodity quotes AND technical indicators (RSI, EMA20/50, MACD, ATR, Recommend.All on H1/H4/D1 timeframes). Forex/commodity signal direction, SL, and TP levels are now deterministically calculated from real TradingView data; AI is used only for narrative text (summary, analysis, chartPattern). Currency Strength Meter uses weighted Recommend.All (H1:20%, H4:50%, D1:30%).
- **ForexFactory:** `nfs.faireconomy.media/ff_calendar_thisweek.json` provides real weekly economic calendar events with forecast/previous/actual values. Cache 30 minutes.
- **MarketWatch + CNBC RSS:** Real financial news headlines from `feeds.content.dowjones.io` and `search.cnbc.com`. Cache 15 minutes.
- **AsyncStorage:** Client-side persistence for user preferences.
- **expo-notifications:** Manages push notifications within the mobile application.
- **expo-server-sdk:** Used for server-side push notification sending.
- **expo-task-manager & expo-background-fetch:** For background fetch capabilities.