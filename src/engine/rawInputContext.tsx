/**
 * Football Engine — Raw Input Context Provider
 * 
 * Manages raw input provenance persistence and parser invocation.
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import type { RawInputRecord } from "./types";
import { saveRawInput as dbSaveRawInput, getRawInput as dbGetRawInput, getRawInputsByGame } from "./db";
import { parseRawInput, type ParseResult } from "./rawInputParser";
import { useGameContext } from "./gameContext";

interface RawInputContextValue {
  saveInput: (playNum: number, text: string) => Promise<ParseResult>;
  getInput: (playNum: number) => Promise<RawInputRecord | undefined>;
  rawInputs: RawInputRecord[];
  loadRawInputs: () => Promise<void>;
}

const RawInputContext = createContext<RawInputContextValue | null>(null);

export function RawInputProvider({ children }: { children: React.ReactNode }) {
  const { activeGame } = useGameContext();
  const gameId = activeGame?.gameId ?? "";
  const [rawInputs, setRawInputs] = useState<RawInputRecord[]>([]);

  const loadRawInputs = useCallback(async () => {
    if (!gameId) { setRawInputs([]); return; }
    const inputs = await getRawInputsByGame(gameId);
    setRawInputs(inputs.sort((a, b) => a.playNum - b.playNum));
  }, [gameId]);

  const saveInput = useCallback(
    async (playNum: number, text: string): Promise<ParseResult> => {
      const result = parseRawInput(text);
      const record: RawInputRecord = {
        gameId,
        playNum,
        rawInputText: text,
        rawInputCreatedAt: new Date().toISOString(),
        rawInputSource: "manual",
        candidatePatch: result.patch,
      };
      await dbSaveRawInput(record);
      await loadRawInputs();
      return result;
    },
    [gameId, loadRawInputs]
  );

  const getInput = useCallback(
    async (playNum: number) => {
      if (!gameId) return undefined;
      return dbGetRawInput(gameId, playNum);
    },
    [gameId]
  );

  return (
    <RawInputContext.Provider value={{ saveInput, getInput, rawInputs, loadRawInputs }}>
      {children}
    </RawInputContext.Provider>
  );
}

export function useRawInput() {
  const ctx = useContext(RawInputContext);
  if (!ctx) throw new Error("useRawInput must be within RawInputProvider");
  return ctx;
}
