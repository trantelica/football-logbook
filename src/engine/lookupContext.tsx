/**
 * Football Engine — Lookup Context Provider
 * 
 * Season-scoped lookup governance for LOOKUP-sourced fields.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { LookupTable } from "./types";
import {
  getAllLookups,
  addLookupValue as dbAddLookupValue,
  removeLookupValue as dbRemoveLookupValue,
  canonicalizeLookupValue,
} from "./db";
import { useSeason } from "./seasonContext";
import { playSchema } from "./schema";

interface LookupContextValue {
  lookupTables: LookupTable[];
  getValues: (fieldName: string) => string[];
  getLookupMap: () => Map<string, string[]>;
  addValue: (fieldName: string, value: string, attributes?: Record<string, string>) => Promise<void>;
  removeValue: (fieldName: string, value: string) => Promise<void>;
  isLookupField: (fieldName: string) => boolean;
  /** Check if a canonicalized value exists in a lookup table */
  hasValue: (fieldName: string, value: string) => boolean;
  loading: boolean;
}

const LookupContext = createContext<LookupContextValue | null>(null);

const LOOKUP_FIELD_NAMES = new Set(
  playSchema.filter((f) => f.source === "LOOKUP").map((f) => f.name)
);

export function LookupProvider({ children }: { children: React.ReactNode }) {
  const { activeSeason } = useSeason();
  const seasonId = activeSeason?.seasonId ?? "";
  const [lookupTables, setLookupTables] = useState<LookupTable[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!seasonId) {
      setLookupTables([]);
      return;
    }
    setLoading(true);
    const tables = await getAllLookups(seasonId);
    setLookupTables(tables);
    setLoading(false);
  }, [seasonId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const getValues = useCallback(
    (fieldName: string): string[] => {
      const table = lookupTables.find((t) => t.fieldName === fieldName);
      return table?.values ?? [];
    },
    [lookupTables]
  );

  const getLookupMap = useCallback((): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const table of lookupTables) {
      map.set(table.fieldName, table.values);
    }
    return map;
  }, [lookupTables]);

  const addValue = useCallback(
    async (fieldName: string, value: string, attributes?: Record<string, string>) => {
      if (!seasonId) return;
      await dbAddLookupValue(seasonId, fieldName, value, attributes);
      await reload();
    },
    [seasonId, reload]
  );

  const removeValue = useCallback(
    async (fieldName: string, value: string) => {
      if (!seasonId) return;
      await dbRemoveLookupValue(seasonId, fieldName, value);
      await reload();
    },
    [seasonId, reload]
  );

  const isLookupField = useCallback(
    (fieldName: string) => LOOKUP_FIELD_NAMES.has(fieldName),
    []
  );

  const hasValue = useCallback(
    (fieldName: string, value: string): boolean => {
      const values = getValues(fieldName);
      const canonical = canonicalizeLookupValue(value);
      return values.some((v) => canonicalizeLookupValue(v) === canonical);
    },
    [getValues]
  );

  return (
    <LookupContext.Provider
      value={{
        lookupTables,
        getValues,
        getLookupMap,
        addValue,
        removeValue,
        isLookupField,
        hasValue,
        loading,
      }}
    >
      {children}
    </LookupContext.Provider>
  );
}

export function useLookup() {
  const ctx = useContext(LookupContext);
  if (!ctx) throw new Error("useLookup must be within LookupProvider");
  return ctx;
}
