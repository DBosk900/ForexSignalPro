import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

type ThemeMode = "dark" | "light";
type ThemeColors = typeof Colors.dark;

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isAutoTheme: boolean;
  setAutoTheme: (auto: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  colors: Colors.dark,
  toggleTheme: () => {},
  setTheme: () => {},
  isAutoTheme: false,
  setAutoTheme: () => {},
});

const STORAGE_KEY = "app_theme_mode";
const AUTO_THEME_KEY = "app_theme_auto";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [isAutoTheme, setIsAutoTheme] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(AUTO_THEME_KEY),
    ]).then(([savedMode, savedAuto]) => {
      const auto = savedAuto === "true";
      setIsAutoTheme(auto);
      if (auto) {
        setMode(systemScheme === "light" ? "light" : "dark");
      } else if (savedMode === "light" || savedMode === "dark") {
        setMode(savedMode);
      }
    });
  }, []);

  useEffect(() => {
    if (isAutoTheme) {
      setMode(systemScheme === "light" ? "light" : "dark");
    }
  }, [systemScheme, isAutoTheme]);

  const setTheme = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(mode === "dark" ? "light" : "dark");
  }, [mode, setTheme]);

  const setAutoTheme = useCallback((auto: boolean) => {
    setIsAutoTheme(auto);
    AsyncStorage.setItem(AUTO_THEME_KEY, auto ? "true" : "false");
    if (auto) {
      const sysMode = systemScheme === "light" ? "light" : "dark";
      setMode(sysMode);
      AsyncStorage.setItem(STORAGE_KEY, sysMode);
    }
  }, [systemScheme]);

  const colors = mode === "dark" ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ mode, colors, toggleTheme, setTheme, isAutoTheme, setAutoTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
