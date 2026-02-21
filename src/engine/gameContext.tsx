/**
 * Football Engine — Game Context Provider
 * 
 * Single active game context with Phase 3 initialization support.
 * Supports both legacy (free-form) and initialized (slot-based) games.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type { GameMeta, GameInitConfig, ODKBlock, QuarterMapping, SlotMeta } from "./types";
import { SCHEMA_VERSION } from "./schema";
import {
  createGame as dbCreateGame,
  getAllGames,
  saveGameInit,
  getGameInit,
  putSlotsBatch,
  addGameAudit,
} from "./db";
import { useSeason } from "./seasonContext";
import { createSlots, validateInitConfig } from "./slotEngine";

const DB_VERSION = 3;

interface GameContextValue {
  activeGame: GameMeta | null;
  games: GameMeta[];
  seasonGames: GameMeta[];
  gameInitConfig: GameInitConfig | null;
  isSlotMode: boolean;
  createNewGame: (opponent: string, date: string) => Promise<GameMeta>;
  initializeGame: (
    opponent: string,
    date: string,
    totalPlays: number,
    quarterStarts: QuarterMapping,
    odkBlocks: ODKBlock[],
    fieldSize?: 80 | 100
  ) => Promise<GameMeta>;
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
  const [gameInitConfig, setGameInitConfig] = useState<GameInitConfig | null>(null);

  // Load games on mount
  useEffect(() => {
    getAllGames().then(setGames);
  }, []);

  // Clear active game when season changes
  useEffect(() => {
    setActiveGame(null);
    setHasDraft(false);
    setGameInitConfig(null);
  }, [seasonId]);

  // Load init config when active game changes
  useEffect(() => {
    if (activeGame) {
      getGameInit(activeGame.gameId).then((config) => {
        setGameInitConfig(config ?? null);
      });
    } else {
      setGameInitConfig(null);
    }
  }, [activeGame?.gameId]);

  const seasonGames = games.filter((g) => g.seasonId === seasonId);

  const isSlotMode = gameInitConfig !== null;

  // Legacy game creation (Phase 2 compat)
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

  // Phase 3: Full game initialization with slot scaffolding
  const initializeGame = useCallback(
    async (
      opponent: string,
      date: string,
      totalPlays: number,
      quarterStarts: QuarterMapping,
      odkBlocks: ODKBlock[],
      fieldSize: 80 | 100 = 80
    ): Promise<GameMeta> => {
      if (!seasonId) throw new Error("No active season");

      // Validate init config
      const validationErrors = validateInitConfig(totalPlays, quarterStarts, odkBlocks);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.map((e) => e.message).join("; "));
      }

      const gameId = uuidv4();
      const now = new Date().toISOString();

      // 1. Create game meta
      const meta: GameMeta = {
        gameId,
        seasonId,
        opponent,
        date,
        createdAt: now,
        schemaVersion: SCHEMA_VERSION,
        fieldSize,
      };
      await dbCreateGame(meta);

      // 2. Create slots with seeding
      const { slots, seededFieldsPerSlot } = createSlots(gameId, totalPlays, quarterStarts, odkBlocks);

      // 3. Create slot meta (seeded fields start as committed)
      const slotMetas: SlotMeta[] = slots.map((slot) => ({
        gameId,
        playNum: slot.playNum,
        committedFields: seededFieldsPerSlot.get(slot.playNum) ?? ["playNum"],
      }));

      // 4. Batch save slots and meta
      await putSlotsBatch(slots, slotMetas);

      // 5. Save init config
      const initConfig: GameInitConfig = {
        gameId,
        totalPlays,
        quarterStarts,
        odkBlocks,
        schemaVersion: SCHEMA_VERSION,
        dbVersion: DB_VERSION,
        timestamp: now,
      };
      await saveGameInit(initConfig);

      // 6. Write init audit
      await addGameAudit({
        gameId,
        timestamp: now,
        action: "init",
        schemaVersion: SCHEMA_VERSION,
        dbVersion: DB_VERSION,
        details: {
          opponent,
          date,
          totalPlays,
          quarterStarts,
          odkBlocks,
        },
      });

      setGames((prev) => [...prev, meta]);
      setActiveGame(meta);
      setGameInitConfig(initConfig);
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
        gameInitConfig,
        isSlotMode,
        createNewGame,
        initializeGame,
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
