/**
 * Football Engine — Season Context Provider
 * 
 * Manages season lifecycle. Season switch clears draft state with confirmation.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

import type { SeasonMeta } from "./types";
import { createSeason as dbCreateSeason, getAllSeasons, getSeason, initDefaultLookups } from "./db";
import {
  clearLastSession,
  loadLastSession,
  resolveRestorableSeason,
  saveLastSession,
} from "./lastSession";
import { playSchema } from "./schema";

interface SeasonContextValue {
  activeSeason: SeasonMeta | null;
  seasons: SeasonMeta[];
  createNewSeason: (label: string) => Promise<SeasonMeta>;
  switchSeason: (seasonId: string) => void;
  pendingSwitchSeason: string | null;
  confirmSeasonSwitch: () => void;
  cancelSeasonSwitch: () => void;
  hasDraft: boolean;
  setHasDraft: (v: boolean) => void;
  /** Re-fetch active season meta from DB */
  refreshActiveSeason: () => Promise<void>;
  /** Re-fetch all seasons list from DB */
  reloadSeasons: () => Promise<void>;
  /** Set active season by ID (after import) */
  setActiveSeasonById: (seasonId: string) => Promise<void>;
  /** Config mode flag — blocks commit/propose while true */
  configMode: boolean;
  setConfigMode: (v: boolean) => void;
  /** True until the stored last-session pointer has been resolved on startup. */
  restoringSession: boolean;
}

const SeasonContext = createContext<SeasonContextValue | null>(null);

/** Get field names that are LOOKUP-sourced */
function getLookupFieldNames(): string[] {
  return playSchema.filter((f) => f.source === "LOOKUP").map((f) => f.name);
}

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const [activeSeason, setActiveSeason] = useState<SeasonMeta | null>(null);
  const [seasons, setSeasons] = useState<SeasonMeta[]>([]);
  const [pendingSwitchSeason, setPendingSwitchSeason] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [configMode, setConfigMode] = useState(false);

  /**
   * True until the stored last-session pointer has been resolved (or found
   * absent). The app shell waits on this so a restored session does not flash
   * the welcome screen on the way in.
   */
  const [restoringSession, setRestoringSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAllSeasons().then((all) => {
      if (cancelled) return;
      setSeasons(all);
      // Reopen the season the coach last had loaded. A deleted or unknown
      // season simply yields no restore rather than blocking startup.
      const restored = resolveRestorableSeason(all, loadLastSession());
      if (restored) setActiveSeason(restored);
      setRestoringSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the pointer whenever the active season changes. The game half is
  // written by GameProvider, which owns the game id.
  useEffect(() => {
    if (restoringSession) return;
    if (activeSeason) {
      const existing = loadLastSession();
      saveLastSession({
        seasonId: activeSeason.seasonId,
        // Switching seasons invalidates the remembered game — GameProvider
        // clears the active game on season change, so the pointer must not
        // keep naming a game from the previous season.
        gameId: existing?.seasonId === activeSeason.seasonId ? existing.gameId : null,
      });
    } else {
      clearLastSession();
    }
  }, [activeSeason, restoringSession]);

  const createNewSeason = useCallback(async (label: string): Promise<SeasonMeta> => {
    const meta: SeasonMeta = {
      seasonId: crypto.randomUUID(),
      label,
      createdAt: new Date().toISOString(),
      seasonRevision: 0,
    };
    await dbCreateSeason(meta);
    await initDefaultLookups(meta.seasonId, getLookupFieldNames());
    setSeasons((prev) => [...prev, meta]);
    setActiveSeason(meta);
    setHasDraft(false);
    return meta;
  }, []);

  const switchSeason = useCallback(
    (seasonId: string) => {
      if (activeSeason?.seasonId === seasonId) return;
      if (hasDraft) {
        setPendingSwitchSeason(seasonId);
      } else {
        const season = seasons.find((s) => s.seasonId === seasonId) ?? null;
        setActiveSeason(season);
      }
    },
    [hasDraft, seasons, activeSeason]
  );

  const confirmSeasonSwitch = useCallback(() => {
    if (pendingSwitchSeason) {
      const season = seasons.find((s) => s.seasonId === pendingSwitchSeason) ?? null;
      setActiveSeason(season);
      setHasDraft(false);
      setPendingSwitchSeason(null);
    }
  }, [pendingSwitchSeason, seasons]);

  const cancelSeasonSwitch = useCallback(() => {
    setPendingSwitchSeason(null);
  }, []);

  const refreshActiveSeason = useCallback(async () => {
    if (!activeSeason) return;
    const fresh = await getSeason(activeSeason.seasonId);
    if (fresh) {
      setActiveSeason(fresh);
      setSeasons((prev) => prev.map((s) => (s.seasonId === fresh.seasonId ? fresh : s)));
    }
  }, [activeSeason]);

  const reloadSeasons = useCallback(async () => {
    const all = await getAllSeasons();
    setSeasons(all);
  }, []);

  const setActiveSeasonById = useCallback(async (seasonId: string) => {
    const fresh = await getSeason(seasonId);
    if (fresh) {
      setActiveSeason(fresh);
      // Ensure it's in the list
      setSeasons((prev) => {
        const exists = prev.some((s) => s.seasonId === seasonId);
        return exists ? prev.map((s) => (s.seasonId === seasonId ? fresh : s)) : [...prev, fresh];
      });
      setHasDraft(false);
    }
  }, []);

  return (
    <SeasonContext.Provider
      value={{
        activeSeason,
        seasons,
        createNewSeason,
        switchSeason,
        pendingSwitchSeason,
        confirmSeasonSwitch,
        cancelSeasonSwitch,
        hasDraft,
        setHasDraft,
        refreshActiveSeason,
        reloadSeasons,
        setActiveSeasonById,
        configMode,
        setConfigMode,
        restoringSession,
      }}
    >
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason() {
  const ctx = useContext(SeasonContext);
  if (!ctx) throw new Error("useSeason must be within SeasonProvider");
  return ctx;
}
