/**
 * Football Engine — Game Context Provider
 * 
 * Single active game context with Phase 3 initialization support.
 * Supports both legacy (free-form) and initialized (slot-based) games.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

import { loadLastSession, resolveRestorableGame, saveLastSession } from "./lastSession";
import type { GameMeta, GameInitConfig, ODKBlock, QuarterMapping, SlotMeta, PatMode } from "./types";
import { SCHEMA_VERSION } from "./schema";
import {
  createGame as dbCreateGame,
  getAllGames,
  saveGameInit,
  getGameInit,
  putSlotsBatch,
  addGameAudit,
} from "./db";
import { splitBlocksAtHalftime } from "./slotEngine";
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
    fieldSize?: 80 | 100,
    patMode?: PatMode
  ) => Promise<GameMeta>;
  switchGame: (gameId: string) => void;
  pendingSwitch: string | null;
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  hasDraft: boolean;
  setHasDraft: (v: boolean) => void;
  /** Re-fetch all games from DB */
  reloadGames: () => Promise<void>;
  /** Set active game by ID (e.g. after import) */
  setActiveGameById: (gameId: string) => Promise<void>;
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

  /**
   * Reopen the game the coach last had loaded — once, on startup.
   *
   * Guarded by a ref rather than by state because the effect above clears the
   * active game on every seasonId change, including the initial "" -> restored
   * transition. Without the guard this would also fire on a deliberate season
   * switch and drag the previous game back in.
   *
   * resolveRestorableGame re-checks that the game still exists and still
   * belongs to this season, so a deleted or rehomed game degrades to no
   * restore rather than pairing one season's lookups with another's plays.
   */
  const attemptedGameRestoreRef = useRef(false);
  useEffect(() => {
    if (attemptedGameRestoreRef.current) return;
    if (!seasonId || games.length === 0) return;
    attemptedGameRestoreRef.current = true;
    const restored = resolveRestorableGame(games, seasonId, loadLastSession());
    if (restored) setActiveGame(restored);
  }, [seasonId, games]);

  // Persist the game half of the pointer. Deselecting a game keeps the season
  // so the coach reopens to the right season's game list.
  useEffect(() => {
    if (!seasonId) return;
    if (!attemptedGameRestoreRef.current) return;
    saveLastSession({ seasonId, gameId: activeGame?.gameId ?? null });
  }, [seasonId, activeGame?.gameId]);

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

  const isSlotMode = gameInitConfig !== null || (activeGame?.totalPlays != null && activeGame.totalPlays > 0);

  // Legacy game creation (Phase 2 compat)
  const createNewGame = useCallback(
    async (opponent: string, date: string): Promise<GameMeta> => {
      if (!seasonId) throw new Error("No active season");
      const meta: GameMeta = {
        gameId: crypto.randomUUID(),
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
      fieldSize: 80 | 100 = 80,
      patMode: PatMode = "none"
    ): Promise<GameMeta> => {
      if (!seasonId) throw new Error("No active season");

      // Validate init config
      const validationErrors = validateInitConfig(totalPlays, quarterStarts, odkBlocks);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.map((e) => e.message).join("; "));
      }

      const gameId = crypto.randomUUID();
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
        patMode,
        totalPlays,
      };
      await dbCreateGame(meta);

      // 2. Split blocks at halftime boundary before seeding
      const normalizedBlocks = splitBlocksAtHalftime(odkBlocks, quarterStarts);

      // 3. Create slots with seeding (uses normalized blocks)
      const { slots, seededFieldsPerSlot } = createSlots(gameId, totalPlays, quarterStarts, normalizedBlocks);

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
        odkBlocks: normalizedBlocks,
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

  const reloadGames = useCallback(async () => {
    const all = await getAllGames();
    setGames(all);
  }, []);

  const setActiveGameById = useCallback(async (gameId: string) => {
    // Ensure games list is fresh
    const all = await getAllGames();
    setGames(all);
    const game = all.find((g) => g.gameId === gameId) ?? null;
    setActiveGame(game);
    setHasDraft(false);
    if (game) {
      const config = await getGameInit(gameId);
      setGameInitConfig(config ?? null);
    }
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
        reloadGames,
        setActiveGameById,
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
