import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  Pressable,
  Platform,
  ViewToken,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFavorites } from "@/contexts/FavoritesContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const ONBOARDING_KEY = "onboarding_completed";

const POPULAR_PAIRS = [
  { symbol: "EUR/USD", category: "forex" },
  { symbol: "GBP/USD", category: "forex" },
  { symbol: "USD/JPY", category: "forex" },
  { symbol: "USD/CHF", category: "forex" },
  { symbol: "AUD/USD", category: "forex" },
  { symbol: "NZD/USD", category: "forex" },
  { symbol: "EUR/GBP", category: "forex" },
  { symbol: "EUR/JPY", category: "forex" },
  { symbol: "GBP/JPY", category: "forex" },
  { symbol: "USD/CAD", category: "forex" },
  { symbol: "XAU/USD", category: "commodity" },
  { symbol: "XAG/USD", category: "commodity" },
  { symbol: "WTI/USD", category: "commodity" },
  { symbol: "BRENT/USD", category: "commodity" },
];

interface OnboardingPage {
  id: string;
  accentColor: string;
}

const pages: OnboardingPage[] = [
  { id: "welcome", accentColor: "#00D4AA" },
  { id: "signal_card", accentColor: "#00C896" },
  { id: "long_press", accentColor: "#818CF8" },
  { id: "news_guard", accentColor: "#FF8C00" },
  { id: "confluence", accentColor: "#38BDF8" },
  { id: "scalping", accentColor: "#FBBF24" },
  { id: "history", accentColor: "#00D4AA" },
  { id: "tools", accentColor: "#A78BFA" },
  { id: "notifications", accentColor: "#FF6B8A" },
  { id: "favorites", accentColor: "#FF6B8A" },
];

function MockSignalCard() {
  return (
    <View style={m.card}>
      <View style={m.cardHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="trending-up" size={16} color="#00D4AA" />
          <Text style={m.cardPair}>EUR/USD</Text>
        </View>
        <View style={[m.badge, { backgroundColor: "#00D4AA" }]}>
          <Text style={m.badgeText}>BUY</Text>
        </View>
      </View>

      <View style={m.cardRow}>
        <View style={m.cardCol}>
          <Text style={m.cardLabel}>Entry</Text>
          <Text style={m.cardValue}>1.0845</Text>
        </View>
        <View style={m.cardCol}>
          <Text style={[m.cardLabel, { color: "#FF6B6B" }]}>SL</Text>
          <Text style={[m.cardValue, { color: "#FF6B6B" }]}>1.0810</Text>
        </View>
      </View>

      <View style={m.cardRow}>
        <View style={m.cardCol}>
          <Text style={[m.cardLabel, { color: "#00D4AA" }]}>TP1</Text>
          <Text style={[m.cardValue, { color: "#00D4AA" }]}>1.0880</Text>
        </View>
        <View style={m.cardCol}>
          <Text style={[m.cardLabel, { color: "#00D4AA" }]}>TP2</Text>
          <Text style={[m.cardValue, { color: "#00D4AA" }]}>1.0920</Text>
        </View>
        <View style={m.cardCol}>
          <Text style={[m.cardLabel, { color: "#00D4AA" }]}>TP3</Text>
          <Text style={[m.cardValue, { color: "#00D4AA" }]}>1.0960</Text>
        </View>
      </View>

      <View style={m.cardFooter}>
        <View style={m.barContainer}>
          <Text style={m.barLabel}>Conf. 87%</Text>
          <View style={m.barBg}>
            <View style={[m.barFill, { width: "87%", backgroundColor: "#00D4AA" }]} />
          </View>
        </View>
        <View style={m.barContainer}>
          <Text style={m.barLabel}>Forza 72</Text>
          <View style={m.barBg}>
            <View style={[m.barFill, { width: "72%", backgroundColor: "#38BDF8" }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

function WelcomeSlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <View style={[s.iconBox, { shadowColor: "#00D4AA" }]}>
          <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={64} color="#00D4AA" />
        </View>
        <Text style={s.title}>{"Benvenuto su\nForex Signals"}</Text>
        <Text style={[s.accent, { color: "#00D4AA" }]}>Segnali reali da TradingView</Text>
        <Text style={s.desc}>
          Segnali di trading in tempo reale basati su dati multi-timeframe di TradingView. Analisi tecnica, calendario economico e strumenti professionali in un'unica app.
        </Text>
      </View>
    </View>
  );
}

function SignalCardSlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{"Come leggere\nun Segnale"}</Text>
        <Text style={[s.accent, { color: "#00C896" }]}>Ogni elemento ha un significato</Text>

        <MockSignalCard />

        <View style={m.legend}>
          <View style={m.legendRow}>
            <View style={[m.legendDot, { backgroundColor: "#00D4AA" }]} />
            <Text style={m.legendText}><Text style={m.legendBold}>BUY/SELL</Text> — direzione del trade</Text>
          </View>
          <View style={m.legendRow}>
            <View style={[m.legendDot, { backgroundColor: "#FFFFFF" }]} />
            <Text style={m.legendText}><Text style={m.legendBold}>Entry</Text> — prezzo di ingresso</Text>
          </View>
          <View style={m.legendRow}>
            <View style={[m.legendDot, { backgroundColor: "#FF6B6B" }]} />
            <Text style={m.legendText}><Text style={m.legendBold}>SL</Text> — stop loss, limite di perdita</Text>
          </View>
          <View style={m.legendRow}>
            <View style={[m.legendDot, { backgroundColor: "#00D4AA" }]} />
            <Text style={m.legendText}><Text style={m.legendBold}>TP1/TP2/TP3</Text> — 3 livelli take profit</Text>
          </View>
          <View style={m.legendRow}>
            <View style={[m.legendDot, { backgroundColor: "#38BDF8" }]} />
            <Text style={m.legendText}><Text style={m.legendBold}>Conf. / Forza</Text> — affidabilità e momentum</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function LongPressSlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <Text style={s.title}>{"Tieni premuto\nper condividere"}</Text>
        <Text style={[s.accent, { color: "#818CF8" }]}>Condividi segnali con un gesto</Text>

        <View style={m.pressDemo}>
          <View style={m.miniCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={m.miniCardPair}>GBP/USD</Text>
              <View style={[m.badge, { backgroundColor: "#FF6B6B" }]}>
                <Text style={m.badgeText}>SELL</Text>
              </View>
            </View>
            <View style={m.pressOverlay}>
              <View style={m.fingerIcon}>
                <Ionicons name="finger-print" size={28} color="#818CF8" />
              </View>
              <Text style={m.pressHint}>Tieni premuto</Text>
            </View>
          </View>

          <Ionicons name="arrow-down" size={24} color="#556688" style={{ marginVertical: 8 }} />

          <View style={m.menuMock}>
            <View style={m.menuItem}>
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
              <Text style={m.menuText}>Condividi</Text>
            </View>
            <View style={[m.menuItem, { borderTopWidth: 1, borderTopColor: "#1E2D45" }]}>
              <Ionicons name="close" size={18} color="#8899BB" />
              <Text style={[m.menuText, { color: "#8899BB" }]}>Annulla</Text>
            </View>
          </View>
        </View>

        <Text style={s.desc}>
          Tieni premuto su qualsiasi segnale per condividerlo via WhatsApp, Telegram o altri. Un tap normale apre i dettagli completi.
        </Text>
      </View>
    </View>
  );
}

function NewsGuardSlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <Text style={s.title}>{"Guardia Notizie\nAutomatica"}</Text>
        <Text style={[s.accent, { color: "#FF8C00" }]}>Protezione eventi ad alto impatto</Text>

        <View style={m.newsDemo}>
          <View style={m.miniCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={m.miniCardPair}>USD/JPY</Text>
              <View style={[m.badge, { backgroundColor: "#00D4AA" }]}>
                <Text style={m.badgeText}>BUY</Text>
              </View>
            </View>
          </View>
          <View style={m.warningBanner}>
            <Ionicons name="warning" size={16} color="#FF8C00" />
            <Text style={m.warningText}>NFP (14:30 UTC) tra 15 min</Text>
          </View>
        </View>

        <Text style={s.desc}>
          L'app monitora il calendario economico in tempo reale. Se una notizia ad alto impatto è prevista entro 30 minuti, un avviso arancione appare sulla card. In quella finestra temporale, aprire trade è molto rischioso.
        </Text>
      </View>
    </View>
  );
}

function ConfluenceSlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <Text style={s.title}>{"Filtro Confluenza\nMulti-Timeframe"}</Text>
        <Text style={[s.accent, { color: "#38BDF8" }]}>Solo segnali di alta qualità</Text>

        <View style={m.confluenceDemo}>
          <Text style={m.confluenceLabel}>Segnale confermato:</Text>
          <View style={m.tfRow}>
            <View style={[m.tfBadge, { borderColor: "#00D4AA" }]}>
              <Text style={m.tfText}>H1</Text>
              <Ionicons name="arrow-down" size={14} color="#FF6B6B" />
              <Text style={[m.tfDir, { color: "#FF6B6B" }]}>SELL</Text>
              <Ionicons name="checkmark-circle" size={14} color="#00D4AA" />
            </View>
            <View style={[m.tfBadge, { borderColor: "#00D4AA" }]}>
              <Text style={m.tfText}>H4</Text>
              <Ionicons name="arrow-down" size={14} color="#FF6B6B" />
              <Text style={[m.tfDir, { color: "#FF6B6B" }]}>SELL</Text>
              <Ionicons name="checkmark-circle" size={14} color="#00D4AA" />
            </View>
            <View style={[m.tfBadge, { borderColor: "#00D4AA" }]}>
              <Text style={m.tfText}>D1</Text>
              <Ionicons name="arrow-down" size={14} color="#FF6B6B" />
              <Text style={[m.tfDir, { color: "#FF6B6B" }]}>SELL</Text>
              <Ionicons name="checkmark-circle" size={14} color="#00D4AA" />
            </View>
          </View>

          <Text style={[m.confluenceLabel, { marginTop: 16 }]}>Segnale bloccato (HOLD):</Text>
          <View style={m.tfRow}>
            <View style={[m.tfBadge, { borderColor: "#FF6B6B" }]}>
              <Text style={m.tfText}>H1</Text>
              <Ionicons name="arrow-up" size={14} color="#00D4AA" />
              <Text style={[m.tfDir, { color: "#00D4AA" }]}>BUY</Text>
              <Ionicons name="close-circle" size={14} color="#FF6B6B" />
            </View>
            <View style={[m.tfBadge, { borderColor: "#FF6B6B" }]}>
              <Text style={m.tfText}>H4</Text>
              <Ionicons name="arrow-down" size={14} color="#FF6B6B" />
              <Text style={[m.tfDir, { color: "#FF6B6B" }]}>SELL</Text>
              <Ionicons name="close-circle" size={14} color="#FF6B6B" />
            </View>
            <View style={[m.tfBadge, { borderColor: "#FF6B6B" }]}>
              <Text style={m.tfText}>D1</Text>
              <Ionicons name="remove" size={14} color="#556688" />
              <Text style={[m.tfDir, { color: "#556688" }]}>---</Text>
              <Ionicons name="close-circle" size={14} color="#FF6B6B" />
            </View>
          </View>
        </View>

        <Text style={s.desc}>
          I segnali vengono generati solo quando H1, H4 e D1 sono allineati nella stessa direzione. Se i timeframe divergono, il segnale viene bloccato per proteggere la qualità.
        </Text>
      </View>
    </View>
  );
}

function ScalpingSlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <Text style={s.title}>{"Scalping\nXAU/USD"}</Text>
        <Text style={[s.accent, { color: "#FBBF24" }]}>Segnali ultra-rapidi sull'Oro</Text>

        <View style={m.scalpingDemo}>
          <View style={m.scalpingHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="flash" size={20} color="#FBBF24" />
              <Text style={m.scalpingPair}>XAU/USD</Text>
            </View>
            <Text style={m.scalpingPrice}>$3.085,50</Text>
          </View>

          <View style={m.scalpingIndicators}>
            <View style={m.scalpingInd}>
              <Text style={m.indLabel}>M1/M5</Text>
              <Text style={m.indValue}>Timeframe</Text>
            </View>
            <View style={m.scalpingInd}>
              <Text style={m.indLabel}>45 min</Text>
              <Text style={m.indValue}>Scadenza</Text>
            </View>
            <View style={m.scalpingInd}>
              <Text style={m.indLabel}>Max 3</Text>
              <Text style={m.indValue}>Attivi</Text>
            </View>
          </View>

          <View style={m.scalpingTags}>
            <View style={m.scalpingTag}>
              <Text style={m.tagText}>EMA 9/21</Text>
            </View>
            <View style={m.scalpingTag}>
              <Text style={m.tagText}>RSI</Text>
            </View>
            <View style={m.scalpingTag}>
              <Text style={m.tagText}>ATR</Text>
            </View>
          </View>
        </View>

        <Text style={s.desc}>
          Segnali rapidi basati su M1/M5 con EMA, RSI e ATR. Scadono in 45 minuti. Attivi solo durante le sessioni di Londra e New York. Generati automaticamente ogni 5 minuti.
        </Text>
      </View>
    </View>
  );
}

function HistorySlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <Text style={s.title}>{"Storico &\nPerformance"}</Text>
        <Text style={[s.accent, { color: "#00D4AA" }]}>Monitora i tuoi risultati</Text>

        <View style={m.statsDemo}>
          <View style={m.statRow}>
            <View style={m.statItem}>
              <Text style={[m.statValue, { color: "#00D4AA" }]}>72%</Text>
              <Text style={m.statLabel}>Win Rate</Text>
            </View>
            <View style={m.statItem}>
              <Text style={[m.statValue, { color: "#00D4AA" }]}>+203</Text>
              <Text style={m.statLabel}>Pips</Text>
            </View>
            <View style={m.statItem}>
              <Text style={m.statValue}>2.3</Text>
              <Text style={m.statLabel}>R:R Medio</Text>
            </View>
            <View style={m.statItem}>
              <Text style={m.statValue}>18.5</Text>
              <Text style={m.statLabel}>Profit Factor</Text>
            </View>
          </View>

          <View style={m.equityMock}>
            <Text style={m.equityTitle}>Curva di Equity</Text>
            <View style={m.equityLine}>
              <View style={[m.eqDot, { left: "0%", bottom: "10%" }]} />
              <View style={[m.eqDot, { left: "15%", bottom: "20%" }]} />
              <View style={[m.eqDot, { left: "30%", bottom: "35%" }]} />
              <View style={[m.eqDot, { left: "45%", bottom: "30%" }]} />
              <View style={[m.eqDot, { left: "60%", bottom: "55%" }]} />
              <View style={[m.eqDot, { left: "75%", bottom: "65%" }]} />
              <View style={[m.eqDot, { left: "90%", bottom: "80%" }]} />
            </View>
          </View>
        </View>

        <Text style={s.desc}>
          Ogni segnale chiuso (TP o SL) viene registrato nello Storico. Monitora win rate, pips totali, profit factor e la curva equity nel tempo. Tab separati per Forex e Scalping.
        </Text>
      </View>
    </View>
  );
}

function ToolsSlide() {
  const tools = [
    { icon: "calculator" as const, label: "Calcolatore\nRischio", color: "#00D4AA", desc: "Lotto e rischio %" },
    { icon: "school" as const, label: "Coach\nAI", color: "#818CF8", desc: "Consigli personalizzati" },
    { icon: "trophy" as const, label: "Traguardi", color: "#FBBF24", desc: "Sfide giornaliere" },
    { icon: "calendar" as const, label: "Calendario\nEconomico", color: "#38BDF8", desc: "Eventi macro live" },
    { icon: "stats-chart" as const, label: "Forza\nValute", color: "#FF6B8A", desc: "Heatmap valute" },
    { icon: "notifications" as const, label: "Alert\nPrezzi", color: "#FF8C00", desc: "Push al prezzo" },
  ];

  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <Text style={s.title}>{"Strumenti\nProfessionali"}</Text>
        <Text style={[s.accent, { color: "#A78BFA" }]}>Tutto per il tuo trading</Text>

        <View style={m.toolsGrid}>
          {tools.map((tool, i) => (
            <View key={i} style={m.toolItem}>
              <View style={[m.toolIcon, { backgroundColor: tool.color + "18" }]}>
                <Ionicons name={tool.icon} size={24} color={tool.color} />
              </View>
              <Text style={m.toolLabel}>{tool.label}</Text>
              <Text style={m.toolDesc}>{tool.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function NotificationsSlide() {
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.content}>
        <Text style={s.title}>{"Notifiche\nin Tempo Reale"}</Text>
        <Text style={[s.accent, { color: "#FF6B8A" }]}>Non perderti nessun segnale</Text>

        <View style={m.notifDemo}>
          <View style={m.toggleRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="notifications" size={18} color="#FF6B8A" />
              <Text style={m.toggleLabel}>Notifiche Push</Text>
            </View>
            <View style={m.toggleOn}>
              <View style={m.toggleKnob} />
              <Text style={m.toggleText}>ON</Text>
            </View>
          </View>

          <View style={m.notifItem}>
            <View style={[m.notifIcon, { backgroundColor: "rgba(0,212,170,0.15)" }]}>
              <Ionicons name="checkmark-circle" size={20} color="#00D4AA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={m.notifTitle}>XAU/USD ha raggiunto TP2</Text>
              <Text style={m.notifSub}>+32 pips di profitto</Text>
            </View>
          </View>

          <View style={m.notifItem}>
            <View style={[m.notifIcon, { backgroundColor: "rgba(255,107,107,0.15)" }]}>
              <Ionicons name="alert-circle" size={20} color="#FF6B6B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={m.notifTitle}>EUR/USD ha toccato lo SL</Text>
              <Text style={m.notifSub}>-25 pips</Text>
            </View>
          </View>

          <View style={m.notifItem}>
            <View style={[m.notifIcon, { backgroundColor: "rgba(56,189,248,0.15)" }]}>
              <Ionicons name="pulse" size={20} color="#38BDF8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={m.notifTitle}>Nuovo segnale BUY</Text>
              <Text style={m.notifSub}>GBP/USD — Conf. 92%</Text>
            </View>
          </View>
        </View>

        <Text style={s.desc}>
          Abilita le notifiche push per ricevere aggiornamenti quando un segnale raggiunge TP o SL, e quando vengono generati nuovi segnali. Non serve tenere l'app aperta.
        </Text>
      </View>
    </View>
  );
}

function FavoritesPage() {
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  return (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.favContent}>
        <View style={[s.iconBox, { shadowColor: "#FF6B8A" }]}>
          <Ionicons name="star" size={64} color="#FF6B8A" />
        </View>
        <Text style={s.title}>{"Scegli le tue\ncoppie preferite"}</Text>
        <Text style={[s.accent, { color: "#FF6B8A" }]}>Personalizza la tua esperienza</Text>
        <Text style={[s.desc, { marginBottom: 20 }]}>
          Seleziona le coppie che vuoi seguire. Potrai modificarle in qualsiasi momento dalle impostazioni.
        </Text>
        <ScrollView
          style={s.pairsScroll}
          contentContainerStyle={s.pairsGrid}
          showsVerticalScrollIndicator={false}
        >
          {POPULAR_PAIRS.map((pair) => (
            <Pressable
              key={pair.symbol}
              onPress={() => toggleFavorite(pair.symbol)}
              style={[
                s.chip,
                isFavorite(pair.symbol) && s.chipSelected,
                isFavorite(pair.symbol) && { borderColor: "#FF6B8A" },
              ]}
            >
              <Ionicons
                name={pair.category === "commodity" ? "diamond-outline" : "trending-up"}
                size={16}
                color={isFavorite(pair.symbol) ? "#FF6B8A" : "#556688"}
                style={{ marginRight: 6 }}
              />
              <Text style={[s.chipText, isFavorite(pair.symbol) && s.chipTextSelected]}>
                {pair.symbol}
              </Text>
              {isFavorite(pair.symbol) && (
                <Ionicons name="checkmark-circle" size={16} color="#FF6B8A" style={{ marginLeft: 6 }} />
              )}
            </Pressable>
          ))}
        </ScrollView>
        <Text style={s.selectedCount}>
          {favorites.length} {favorites.length === 1 ? "coppia selezionata" : "coppie selezionate"}
        </Text>
      </View>
    </View>
  );
}

function DotIndicator({ currentIndex, total }: { currentIndex: number; total: number }) {
  return (
    <View style={s.dotsRow}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            i === currentIndex && s.dotActive,
            i === currentIndex && { backgroundColor: pages[currentIndex].accentColor },
          ]}
        />
      ))}
    </View>
  );
}

function PageItem({ item }: { item: OnboardingPage }) {
  switch (item.id) {
    case "welcome": return <WelcomeSlide />;
    case "signal_card": return <SignalCardSlide />;
    case "long_press": return <LongPressSlide />;
    case "news_guard": return <NewsGuardSlide />;
    case "confluence": return <ConfluenceSlide />;
    case "scalping": return <ScalpingSlide />;
    case "history": return <HistorySlide />;
    case "tools": return <ToolsSlide />;
    case "notifications": return <NotificationsSlide />;
    case "favorites": return <FavoritesPage />;
    default: return null;
  }
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLastPage = currentIndex === pages.length - 1;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const completeOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/(tabs)");
  };

  const goNext = () => {
    if (isLastPage) {
      completeOnboarding();
    } else {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    }
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[s.container, { paddingTop: insets.top + webTopInset, paddingBottom: insets.bottom + webBottomInset }]}>
      <View style={s.header}>
        <Text style={s.pageCounter}>{currentIndex + 1}/{pages.length}</Text>
        {!isLastPage ? (
          <Pressable onPress={completeOnboarding} style={s.skipBtn} hitSlop={12}>
            <Text style={s.skipText}>Salta</Text>
          </Pressable>
        ) : (
          <View style={s.skipBtn} />
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={pages}
        renderItem={({ item }) => <PageItem item={item} />}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEnabled={true}
      />

      <View style={s.footer}>
        <DotIndicator currentIndex={currentIndex} total={pages.length} />

        {isLastPage ? (
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [
              s.startBtn,
              { backgroundColor: pages[currentIndex].accentColor },
              pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
            ]}
          >
            <Text style={s.startBtnText}>Iniziamo</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [
              s.nextBtn,
              { backgroundColor: pages[currentIndex].accentColor },
              pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
            ]}
          >
            <Ionicons name="arrow-forward" size={24} color="#0A0E1A" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0E1A" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  pageCounter: {
    color: "#556688",
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  skipBtn: { paddingVertical: 8, paddingHorizontal: 16, minWidth: 60 },
  skipText: { color: "#8899BB", fontFamily: "Inter_500Medium", fontSize: 15, textAlign: "right" },
  page: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  content: { alignItems: "center", maxWidth: 360, width: "100%" },
  scrollContent: { alignItems: "center", maxWidth: 360, paddingTop: 10, paddingBottom: 20 },
  iconBox: {
    width: 120, height: 120, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.04)",
    justifyContent: "center", alignItems: "center",
    marginBottom: 32,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24, elevation: 8,
  },
  title: {
    color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 28,
    textAlign: "center", lineHeight: 36, marginBottom: 8,
  },
  accent: { fontFamily: "Inter_600SemiBold", fontSize: 15, textAlign: "center", marginBottom: 16 },
  desc: {
    color: "#8899BB", fontFamily: "Inter_400Regular", fontSize: 14,
    textAlign: "center", lineHeight: 22,
  },
  footer: { alignItems: "center", paddingBottom: 24, paddingHorizontal: 24, gap: 24 },
  dotsRow: { flexDirection: "row", gap: 6, justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#1E2D45" },
  dotActive: { width: 20, borderRadius: 3 },
  nextBtn: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  startBtn: { paddingHorizontal: 40, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  startBtnText: { color: "#0A0E1A", fontFamily: "Inter_700Bold", fontSize: 16 },
  favContent: { alignItems: "center", flex: 1, paddingHorizontal: 24, paddingTop: 10 },
  pairsScroll: { maxHeight: 200, width: "100%" },
  pairsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, paddingBottom: 8 },
  chip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1.5, borderColor: "#1E2D45",
  },
  chipSelected: { backgroundColor: "rgba(255,107,138,0.1)" },
  chipText: { color: "#8899BB", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  chipTextSelected: { color: "#FFFFFF" },
  selectedCount: { color: "#556688", fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 12 },
});

const m = StyleSheet.create({
  card: {
    backgroundColor: "#111827", borderRadius: 16, padding: 16, width: "100%",
    borderWidth: 1, borderColor: "#1E2D45", marginVertical: 16,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardPair: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: "#0A0E1A", fontFamily: "Inter_700Bold", fontSize: 12 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardCol: { flex: 1 },
  cardLabel: { color: "#556688", fontFamily: "Inter_500Medium", fontSize: 11, marginBottom: 2 },
  cardValue: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  cardFooter: { marginTop: 8, gap: 6 },
  barContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { color: "#8899BB", fontFamily: "Inter_500Medium", fontSize: 11, width: 60 },
  barBg: { flex: 1, height: 4, backgroundColor: "#1E2D45", borderRadius: 2 },
  barFill: { height: 4, borderRadius: 2 },

  legend: { width: "100%", gap: 8, marginTop: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#8899BB", fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  legendBold: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold" },

  pressDemo: { alignItems: "center", width: "100%", marginVertical: 16 },
  miniCard: {
    backgroundColor: "#111827", borderRadius: 12, padding: 14, width: "100%",
    borderWidth: 1, borderColor: "#1E2D45",
  },
  miniCardPair: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
  pressOverlay: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginTop: 10, gap: 8,
  },
  fingerIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(129,140,248,0.15)",
    justifyContent: "center", alignItems: "center",
  },
  pressHint: { color: "#818CF8", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  menuMock: {
    backgroundColor: "#111827", borderRadius: 12, width: "80%",
    borderWidth: 1, borderColor: "#1E2D45", overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  menuText: { color: "#FFFFFF", fontFamily: "Inter_500Medium", fontSize: 14 },

  newsDemo: { width: "100%", marginVertical: 16 },
  warningBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,140,0,0.12)", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
    borderWidth: 1, borderColor: "rgba(255,140,0,0.3)",
  },
  warningText: { color: "#FF8C00", fontFamily: "Inter_600SemiBold", fontSize: 13 },

  confluenceDemo: { width: "100%", marginVertical: 16 },
  confluenceLabel: { color: "#8899BB", fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 8 },
  tfRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  tfBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1,
  },
  tfText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  tfDir: { fontFamily: "Inter_600SemiBold", fontSize: 11 },

  scalpingDemo: {
    backgroundColor: "#111827", borderRadius: 16, padding: 16, width: "100%",
    borderWidth: 1, borderColor: "#1E2D45", marginVertical: 16,
  },
  scalpingHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12,
  },
  scalpingPair: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  scalpingPrice: { color: "#FBBF24", fontFamily: "Inter_700Bold", fontSize: 18 },
  scalpingIndicators: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  scalpingInd: { alignItems: "center", flex: 1 },
  indLabel: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  indValue: { color: "#556688", fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  scalpingTags: { flexDirection: "row", gap: 8 },
  scalpingTag: {
    backgroundColor: "rgba(251,191,36,0.12)", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: { color: "#FBBF24", fontFamily: "Inter_600SemiBold", fontSize: 11 },

  statsDemo: { width: "100%", marginVertical: 16 },
  statRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 18 },
  statLabel: { color: "#556688", fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  equityMock: {
    backgroundColor: "#111827", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#1E2D45", height: 100,
  },
  equityTitle: { color: "#8899BB", fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 8 },
  equityLine: { flex: 1, position: "relative" as const },
  eqDot: {
    position: "absolute" as const, width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#00D4AA",
  },

  toolsGrid: {
    flexDirection: "row", flexWrap: "wrap", justifyContent: "center",
    gap: 12, width: "100%", marginVertical: 16,
  },
  toolItem: {
    width: "30%", alignItems: "center",
    backgroundColor: "#111827", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#1E2D45",
  },
  toolIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: "center", alignItems: "center", marginBottom: 8,
  },
  toolLabel: {
    color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 11,
    textAlign: "center", lineHeight: 15,
  },
  toolDesc: {
    color: "#556688", fontFamily: "Inter_400Regular", fontSize: 9,
    textAlign: "center", marginTop: 3,
  },

  toggleRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#111827", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#1E2D45",
  },
  toggleLabel: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  toggleOn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,107,138,0.2)", borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  toggleKnob: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: "#FF6B8A",
  },
  toggleText: { color: "#FF6B8A", fontFamily: "Inter_700Bold", fontSize: 11 },

  notifDemo: { width: "100%", marginVertical: 16, gap: 10 },
  notifItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#111827", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#1E2D45",
  },
  notifIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  notifTitle: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  notifSub: { color: "#556688", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
});
