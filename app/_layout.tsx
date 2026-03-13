import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { StatusBar } from "expo-status-bar";
import {
  setupNotifications,
  initializeSignalTracking,
  checkNotificationsNow,
} from "@/lib/notifications";
import NetworkErrorBanner from "@/components/NetworkErrorBanner";

SplashScreen.preventAutoHideAsync();

const ONBOARDING_KEY = "onboarding_completed";

function RootLayoutNav() {
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const { colors, mode } = useTheme();

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((value) => {
      if (value !== "true") {
        router.replace("/onboarding");
      }
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    async function initNotifications() {
      const AsyncStorageLib = (await import("@react-native-async-storage/async-storage")).default;
      const notifEnabled = await AsyncStorageLib.getItem("notifications_enabled");
      if (notifEnabled === "false") return;

      const granted = await setupNotifications();
      if (!granted) return;

      await initializeSignalTracking();
      await checkNotificationsNow();

      pollInterval = setInterval(async () => {
        await checkNotificationsNow();
      }, 30000);
    }

    initNotifications();

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
        animationDuration: 250,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, animation: "fade" }} />
      <Stack.Screen name="history" options={{
          headerShown: true,
          headerBackTitle: "Segnali",
          headerTitle: "Storico Segnali",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="signal/[id]"
        options={{
          headerShown: true,
          headerBackTitle: "Segnali",
          headerTitle: "",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          presentation: "card",
          animation: "slide_from_right",
          animationDuration: 250,
        }}
      />
      <Stack.Screen
        name="pair/[pair]"
        options={{
          headerShown: true,
          headerBackTitle: "Mercati",
          headerTitle: "",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="news/[id]"
        options={{
          headerShown: true,
          headerBackTitle: "Notizie",
          headerTitle: "",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="calculator"
        options={{
          headerShown: true,
          headerBackTitle: "Dettaglio",
          headerTitle: "Calcolatore Rischio",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="coach"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "AI Trading Coach",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="strength"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Forza Valute",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="achievements"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Traguardi",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="sessions"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Sessioni Mondiali",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="correlations"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Radar Correlazioni",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="replay"
        options={{
          headerShown: true,
          headerBackTitle: "Storico",
          headerTitle: "Replay Segnale",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="journal"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Diario di Trading IA",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="sniper"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Modalita Sniper",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="scalping"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Scalping XAU/USD",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: "#FBBF24",
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="volatility"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Indicatore Volatilita",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="report"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Report Performance",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="simulator"
        options={{
          headerShown: true,
          headerBackTitle: "Indietro",
          headerTitle: "Simulatore di Trading",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="compare"
        options={{
          headerShown: true,
          headerBackTitle: "Segnali",
          headerTitle: "Confronto Segnali",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: colors.text },
          presentation: "card",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FavoritesProvider>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <ThemedStatusBar />
                <NetworkErrorBanner />
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </FavoritesProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === "dark" ? "light" : "dark"} />;
}
