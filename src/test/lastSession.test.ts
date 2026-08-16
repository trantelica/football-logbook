/**
 * Last Session Restore — pointer validation and stale-pointer safety.
 *
 * The restore pointer is the one piece of state that survives a reload, so its
 * failure mode matters more than its success case: a stale or malformed pointer
 * must degrade to "no restore", never to a wrong season/game pairing.
 */

import { describe, it, expect } from "vitest";
import {
  LAST_SESSION_STORAGE_KEY,
  clearLastSession,
  loadLastSession,
  normalizeLastSession,
  resolveRestorableGame,
  resolveRestorableSeason,
  saveLastSession,
} from "@/engine/lastSession";

function fakeStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(LAST_SESSION_STORAGE_KEY, initial);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    has: () => map.has(LAST_SESSION_STORAGE_KEY),
  };
}

const SEASONS = [{ seasonId: "s1" }, { seasonId: "s2" }];
const GAMES = [
  { gameId: "g1", seasonId: "s1" },
  { gameId: "g2", seasonId: "s2" },
];

describe("normalizeLastSession", () => {
  it("rejects non-objects and missing season", () => {
    expect(normalizeLastSession(null)).toBeNull();
    expect(normalizeLastSession("nope")).toBeNull();
    expect(normalizeLastSession({})).toBeNull();
    expect(normalizeLastSession({ seasonId: "" })).toBeNull();
  });

  it("accepts a season without a game", () => {
    expect(normalizeLastSession({ seasonId: "s1" })).toEqual({ seasonId: "s1", gameId: null });
  });

  it("normalises an empty game id to null", () => {
    expect(normalizeLastSession({ seasonId: "s1", gameId: "" })).toEqual({
      seasonId: "s1",
      gameId: null,
    });
  });
});

describe("storage round-trip", () => {
  it("returns null when nothing is stored", () => {
    expect(loadLastSession(fakeStorage())).toBeNull();
  });

  it("returns null on malformed JSON rather than throwing", () => {
    expect(loadLastSession(fakeStorage("{not json"))).toBeNull();
  });

  it("round-trips and clears", () => {
    const store = fakeStorage();
    saveLastSession({ seasonId: "s1", gameId: "g1" }, store);
    expect(loadLastSession(store)).toEqual({ seasonId: "s1", gameId: "g1" });
    clearLastSession(store);
    expect(store.has()).toBe(false);
  });

  it("does not throw when storage rejects writes", () => {
    const throwing = {
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => saveLastSession({ seasonId: "s1", gameId: null }, throwing)).not.toThrow();
  });
});

describe("resolveRestorableSeason", () => {
  it("finds a season that still exists", () => {
    expect(resolveRestorableSeason(SEASONS, { seasonId: "s2", gameId: null })).toEqual({
      seasonId: "s2",
    });
  });

  it("yields null for a deleted season rather than blocking startup", () => {
    expect(resolveRestorableSeason(SEASONS, { seasonId: "gone", gameId: null })).toBeNull();
  });

  it("yields null with no stored pointer", () => {
    expect(resolveRestorableSeason(SEASONS, null)).toBeNull();
  });
});

describe("resolveRestorableGame", () => {
  it("restores a game that still belongs to the season", () => {
    expect(resolveRestorableGame(GAMES, "s1", { seasonId: "s1", gameId: "g1" })).toEqual({
      gameId: "g1",
      seasonId: "s1",
    });
  });

  it("yields null for a deleted game", () => {
    expect(resolveRestorableGame(GAMES, "s1", { seasonId: "s1", gameId: "gone" })).toBeNull();
  });

  it("refuses to open a game from a different season than the one being restored", () => {
    // Reopening g2 (season s2) while restoring s1 would show s1's lookups and
    // roster against s2's plays.
    expect(resolveRestorableGame(GAMES, "s1", { seasonId: "s1", gameId: "g2" })).toBeNull();
  });

  it("refuses when the pointer's season does not match the active season", () => {
    expect(resolveRestorableGame(GAMES, "s2", { seasonId: "s1", gameId: "g1" })).toBeNull();
  });

  it("yields null when a season was stored without a game", () => {
    expect(resolveRestorableGame(GAMES, "s1", { seasonId: "s1", gameId: null })).toBeNull();
  });
});
