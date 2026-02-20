/**
 * Football Engine — Game Context Provider
 * 
 * Single active game context. Switching clears draft state.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type { GameMeta } from "./types";
import { SCHEMA_VERSION } from "./schema";
import { createGame as dbCreateGame, getAllGames } from "./db";
import { useSeason } from "./seasonContext";

interface GameContextValue {
  activeGame: GameMeta | null;
  games: GameMeta[];
  seasonGames: GameMeta[];
  createNewGame: (opponent: string, date: string) => Promise<GameMeta>;
  switchGame: (gameId: string) => void;
  pendingSwitch: string | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  hasDraft: boolean;
  setHasDraft: (v: boolean) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { activeSeason } = useSeason();
  const seasonId = activeSeason?.seasonId ?? "";

  const [activeGame, setActiveGame] = useState<GameMeta | null>(null);
  const [games, setGames] = useState<GameMeta[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Load games on mount
  useEffect(() => {
    getAllGames().then(setGames);
  }, []);

  // Clear active game when season changes
  useEffect(() => {
    setActiveGame(null);
    setHasDraft(false);
  }, [seasonId]);

  const seasonGames = games.filter((g) => g.seasonId === seasonId);

  const createNewGame = useCallback(
    async (opponent: string, date: string): Promise<GameMeta> => {
      if (!seasonId) throw new Error("No active season");
      const meta: GameMeta = {
        gameId: uuidv4(),
        seasonId,
        opponent,
        date,
        createdAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
      };
      await dbCreateGame(meta);
      setGames((prev) => [...prev, meta]);
      setActiveGame(meta);
      setHasDraft(false);
      return meta;
    },
    [seasonId]
  );

  const switchGame = useCallback(
    (gameId: string) => {
      if (hasDraft) {
        setPendingSwitch(gameId);
      } else {
        const game = games.find((g) => g.gameId === gameId) ?? null;
        setActiveGame(game);
      }
    },
    [hasDraft, games]
  );

  const confirmSwitch = useCallback(() => {
    if (pendingSwitch) {
      const game = games.find((g) => g.gameId === pendingSwitch) ?? null;
      setActiveGame(game);
      setHasDraft(false);
      setPendingSwitch(null);
    }
  }, [pendingSwitch, games]);

  const cancelSwitch = useCallback(() => {
    setPendingSwitch(null);
  }, []);

  return (
    <GameContext.Provider
      value={{
        activeGame,
        games,
        seasonGames,
        createNewGame,
        switchGame,
        pendingSwitch,
        confirmSwitch,
        cancelSwitch,
        hasDraft,
        setHasDraft,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGameContext must be used within GameProvider");
  return ctx;
}
