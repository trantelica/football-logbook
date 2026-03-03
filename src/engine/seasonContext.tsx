/**
 * Football Engine — Season Context Provider
 * 
 * Manages season lifecycle. Season switch clears draft state with confirmation.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import type { SeasonMeta } from "./types";
import { createSeason as dbCreateSeason, getAllSeasons, getSeason, initDefaultLookups } from "./db";
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

  useEffect(() => {
    getAllSeasons().then(setSeasons);
  }, []);

  const createNewSeason = useCallback(async (label: string): Promise<SeasonMeta> => {
    const meta: SeasonMeta = {
      seasonId: uuidv4(),
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
