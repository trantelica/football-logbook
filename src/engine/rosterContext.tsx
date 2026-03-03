/**
 * Football Engine — Roster Context Provider
 * 
 * Season-scoped roster store. Pure lookup — no position logic, no 11-player enforcement.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { RosterEntry } from "./types";
import {
  getRosterBySeason,
  addRosterEntry as dbAddRosterEntry,
  removeRosterEntry as dbRemoveRosterEntry,
  updateRosterEntry as dbUpdateRosterEntry,
} from "./db";
import { useSeason } from "./seasonContext";

interface RosterContextValue {
  roster: RosterEntry[];
  addPlayer: (jerseyNumber: number, playerName: string) => Promise<void>;
  removePlayer: (jerseyNumber: number) => Promise<void>;
  updatePlayer: (jerseyNumber: number, playerName: string) => Promise<void>;
  getPlayer: (jerseyNumber: number) => RosterEntry | undefined;
  /** Re-fetch roster from DB */
  reload: () => Promise<void>;
  loading: boolean;
}

const RosterContext = createContext<RosterContextValue | null>(null);

export function RosterProvider({ children }: { children: React.ReactNode }) {
  const { activeSeason } = useSeason();
  const seasonId = activeSeason?.seasonId ?? "";
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!seasonId) {
      setRoster([]);
      return;
    }
    setLoading(true);
    const entries = await getRosterBySeason(seasonId);
    setRoster(entries.sort((a, b) => a.jerseyNumber - b.jerseyNumber));
    setLoading(false);
  }, [seasonId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addPlayer = useCallback(
    async (jerseyNumber: number, playerName: string) => {
      if (!seasonId) return;
      await dbAddRosterEntry(seasonId, jerseyNumber, playerName);
      await reload();
    },
    [seasonId, reload]
  );

  const removePlayer = useCallback(
    async (jerseyNumber: number) => {
      if (!seasonId) return;
      await dbRemoveRosterEntry(seasonId, jerseyNumber);
      await reload();
    },
    [seasonId, reload]
  );

  const updatePlayer = useCallback(
    async (jerseyNumber: number, playerName: string) => {
      if (!seasonId) return;
      await dbUpdateRosterEntry(seasonId, jerseyNumber, playerName);
      await reload();
    },
    [seasonId, reload]
  );

  const getPlayer = useCallback(
    (jerseyNumber: number) => roster.find((r) => r.jerseyNumber === jerseyNumber),
    [roster]
  );

  return (
    <RosterContext.Provider
      value={{
        roster,
        addPlayer,
        removePlayer,
        updatePlayer,
        getPlayer,
        reload,
        loading,
      }}
    >
      {children}
    </RosterContext.Provider>
  );
}

export function useRoster() {
  const ctx = useContext(RosterContext);
  if (!ctx) throw new Error("useRoster must be within RosterProvider");
  return ctx;
}
