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

interface GameContextValue {
  activeGame: GameMeta | null;
  games: GameMeta[];
  createNewGame: (opponent: string, date: string) => Promise<GameMeta>;
  switchGame: (gameId: string) => void;
  /** True if we're about to switch and need confirmation */
  pendingSwitch: string | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  /** Called by transaction provider to signal dirty draft */
  hasDraft: boolean;
  setHasDraft: (v: boolean) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [activeGame, setActiveGame] = useState<GameMeta | null>(null);
  const [games, setGames] = useState<GameMeta[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Load games on mount
  useEffect(() => {
    getAllGames().then(setGames);
  }, []);

  const createNewGame = useCallback(
    async (opponent: string, date: string): Promise<GameMeta> => {
      const meta: GameMeta = {
        gameId: uuidv4(),
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
    []
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
