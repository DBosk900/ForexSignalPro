import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface Watchlist {
  id: string;
  name: string;
  pairs: string[];
}

interface FavoritesContextType {
  favorites: string[];
  toggleFavorite: (pair: string) => void;
  isFavorite: (pair: string) => boolean;
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  setActiveWatchlistId: (id: string | null) => void;
  createWatchlist: (name: string) => string;
  deleteWatchlist: (id: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  addToWatchlist: (watchlistId: string, pair: string) => void;
  removeFromWatchlist: (watchlistId: string, pair: string) => void;
  getActiveWatchlistPairs: () => string[] | null;
}

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: [],
  toggleFavorite: () => {},
  isFavorite: () => false,
  watchlists: [],
  activeWatchlistId: null,
  setActiveWatchlistId: () => {},
  createWatchlist: () => "",
  deleteWatchlist: () => {},
  renameWatchlist: () => {},
  addToWatchlist: () => {},
  removeFromWatchlist: () => {},
  getActiveWatchlistPairs: () => null,
});

const FAV_KEY = "forex_favorites";
const WL_KEY = "forex_watchlists";

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FAV_KEY),
      AsyncStorage.getItem(WL_KEY),
    ]).then(([favData, wlData]) => {
      if (favData) { try { setFavorites(JSON.parse(favData)); } catch {} }
      if (wlData) { try { setWatchlists(JSON.parse(wlData)); } catch {} }
    });
  }, []);

  const saveWatchlists = useCallback((wls: Watchlist[]) => {
    setWatchlists(wls);
    AsyncStorage.setItem(WL_KEY, JSON.stringify(wls));
  }, []);

  const toggleFavorite = useCallback((pair: string) => {
    setFavorites((prev) => {
      const next = prev.includes(pair) ? prev.filter((p) => p !== pair) : [...prev, pair];
      AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback((pair: string) => favorites.includes(pair), [favorites]);

  const createWatchlist = useCallback((name: string): string => {
    const id = genId();
    const wl: Watchlist = { id, name, pairs: [] };
    saveWatchlists([...watchlists, wl]);
    return id;
  }, [watchlists, saveWatchlists]);

  const deleteWatchlist = useCallback((id: string) => {
    saveWatchlists(watchlists.filter((w) => w.id !== id));
    if (activeWatchlistId === id) setActiveWatchlistId(null);
  }, [watchlists, saveWatchlists, activeWatchlistId]);

  const renameWatchlist = useCallback((id: string, name: string) => {
    saveWatchlists(watchlists.map((w) => (w.id === id ? { ...w, name } : w)));
  }, [watchlists, saveWatchlists]);

  const addToWatchlist = useCallback((watchlistId: string, pair: string) => {
    saveWatchlists(
      watchlists.map((w) =>
        w.id === watchlistId && !w.pairs.includes(pair)
          ? { ...w, pairs: [...w.pairs, pair] }
          : w
      )
    );
  }, [watchlists, saveWatchlists]);

  const removeFromWatchlist = useCallback((watchlistId: string, pair: string) => {
    saveWatchlists(
      watchlists.map((w) =>
        w.id === watchlistId ? { ...w, pairs: w.pairs.filter((p) => p !== pair) } : w
      )
    );
  }, [watchlists, saveWatchlists]);

  const getActiveWatchlistPairs = useCallback(() => {
    if (!activeWatchlistId) return null;
    const wl = watchlists.find((w) => w.id === activeWatchlistId);
    return wl ? wl.pairs : null;
  }, [activeWatchlistId, watchlists]);

  return (
    <FavoritesContext.Provider
      value={{
        favorites, toggleFavorite, isFavorite,
        watchlists, activeWatchlistId, setActiveWatchlistId,
        createWatchlist, deleteWatchlist, renameWatchlist,
        addToWatchlist, removeFromWatchlist, getActiveWatchlistPairs,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
