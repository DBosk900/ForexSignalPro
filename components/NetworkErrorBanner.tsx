import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useQueryClient } from "@tanstack/react-query";

export default function NetworkErrorBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [hasError, setHasError] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event?.type === "updated" && event.query.state.status === "error") {
        setHasError(true);
      }
      if (event?.type === "updated" && event.query.state.status === "success") {
        const queries = cache.getAll();
        const anyError = queries.some((q) => q.state.status === "error");
        if (!anyError) setHasError(false);
      }
    });
    return () => unsubscribe();
  }, [queryClient]);

  const handleRetry = async () => {
    setRetrying(true);
    await queryClient.invalidateQueries({
      predicate: (q) => q.state.status === "error",
    });
    setTimeout(() => setRetrying(false), 2000);
  };

  if (!hasError) return null;

  const topOffset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutUp.duration(300)}
      style={[styles.container, { top: topOffset, backgroundColor: colors.sell + "E6" }]}
    >
      <Ionicons name="cloud-offline-outline" size={18} color="#FFFFFF" />
      <Text style={styles.text}>
        {retrying ? "Riconnessione in corso..." : "Errore di rete"}
      </Text>
      {!retrying && (
        <Pressable onPress={handleRetry} style={styles.retryBtn}>
          <Ionicons name="refresh" size={14} color="#FFFFFF" />
          <Text style={styles.retryText}>Riprova</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 1000,
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
