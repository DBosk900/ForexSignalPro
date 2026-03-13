import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTheme } from "@/contexts/ThemeContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const QUICK_QUESTIONS = [
  "Analisi EUR/USD",
  "Qual e' il miglior setup oggi?",
  "Sentiment generale del mercato",
  "Livelli chiave oro (XAU/USD)",
  "Rischio/rendimento migliore",
  "Outlook settimanale",
];

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content: "Ciao! Sono il tuo AI Trading Coach. Posso aiutarti con analisi tecniche, sentiment di mercato e strategie. Ho accesso ai segnali attivi e agli eventi economici in tempo reale. Come posso aiutarti?",
  timestamp: Date.now(),
};

export default function CoachScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    const userMsg: Message = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };

    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setInput("");
    setSending(true);

    try {
      const res = await apiRequest("POST", "/api/chat", { message: text.trim() });
      const data = await res.json();

      const aiMsg: Message = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        role: "assistant",
        content: data.reply || "Mi dispiace, si e' verificato un errore.",
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch {
      const errMsg: Message = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        role: "assistant",
        content: "Errore di connessione. Riprova tra qualche secondo.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }, [messages, sending]);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.aiBubble,
          {
            backgroundColor: isUser ? colors.accent : colors.backgroundCard,
            borderColor: isUser ? colors.accent : colors.border,
          },
        ]}
      >
        {!isUser && (
          <View style={styles.aiHeader}>
            <View style={[styles.aiIcon, { backgroundColor: colors.accent + "20" }]}>
              <Ionicons name="sparkles" size={12} color={colors.accent} />
            </View>
            <Text style={[styles.aiLabel, { color: colors.accent }]}>AI Coach</Text>
          </View>
        )}
        <Text
          style={[
            styles.messageText,
            { color: isUser ? "#FFFFFF" : colors.text },
          ]}
        >
          {item.content}
        </Text>
        <Text
          style={[
            styles.timestamp,
            { color: isUser ? "rgba(255,255,255,0.6)" : colors.textMuted },
          ]}
        >
          {new Date(item.timestamp).toLocaleTimeString("it-IT", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </Animated.View>
    );
  }, [colors]);

  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: 12 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={styles.quickSection}>
              <Text style={[styles.quickTitle, { color: colors.textMuted }]}>
                Domande rapide
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.quickRow}>
                  {QUICK_QUESTIONS.map((q) => (
                    <Pressable
                      key={q}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        sendMessage(q);
                      }}
                      style={[styles.quickChip, { backgroundColor: colors.accent + "15", borderColor: colors.accent + "30" }]}
                    >
                      <Text style={[styles.quickText, { color: colors.accent }]}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          }
        />

        {sending && (
          <View style={[styles.typingRow, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.typingText, { color: colors.textMuted }]}>
              Il coach sta analizzando...
            </Text>
          </View>
        )}

        <View style={[styles.inputRow, { backgroundColor: colors.backgroundCard, borderTopColor: colors.border, paddingBottom: Math.max(bottomInset, 8) }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}
            placeholder="Chiedi al tuo coach..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              sendMessage(input);
            }}
            disabled={!input.trim() || sending}
            style={[
              styles.sendBtn,
              {
                backgroundColor: input.trim() && !sending ? colors.accent : colors.backgroundElevated,
              },
            ]}
          >
            <Ionicons
              name="send"
              size={18}
              color={input.trim() && !sending ? "#FFFFFF" : colors.textMuted}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  aiIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  aiLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  messageText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    alignSelf: "flex-end",
  },
  quickSection: {
    marginBottom: 16,
  },
  quickTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    marginBottom: 8,
  },
  quickRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  typingText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
