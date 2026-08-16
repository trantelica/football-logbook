/**
 * Device Preferences — normalization, load/save resilience
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREFERENCES,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
  PREFERENCES_STORAGE_KEY,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from "@/engine/preferences";

function fakeStorage(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(PREFERENCES_STORAGE_KEY, initial);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: () => map.get(PREFERENCES_STORAGE_KEY),
  };
}

describe("normalizePreferences", () => {
  it("returns defaults for non-object input", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences("nope")).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it("accepts valid values", () => {
    expect(
      normalizePreferences({ audioFeedback: "full", theme: "dark", speechRate: 1.5 }),
    ).toEqual({ audioFeedback: "full", theme: "dark", speechRate: 1.5 });
  });

  it("falls back per-field so one bad key does not discard the others", () => {
    const result = normalizePreferences({ audioFeedback: "loud", theme: "dark" });
    expect(result.audioFeedback).toBe(DEFAULT_PREFERENCES.audioFeedback);
    expect(result.theme).toBe("dark");
  });

  it("clamps speech rate into the usable range", () => {
    expect(normalizePreferences({ speechRate: 99 }).speechRate).toBe(MAX_SPEECH_RATE);
    expect(normalizePreferences({ speechRate: 0.01 }).speechRate).toBe(MIN_SPEECH_RATE);
  });

  it("rejects non-finite speech rates", () => {
    expect(normalizePreferences({ speechRate: NaN }).speechRate).toBe(
      DEFAULT_PREFERENCES.speechRate,
    );
    expect(normalizePreferences({ speechRate: "fast" }).speechRate).toBe(
      DEFAULT_PREFERENCES.speechRate,
    );
  });
});

describe("loadPreferences", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadPreferences(fakeStorage())).toEqual(DEFAULT_PREFERENCES);
  });

  it("returns defaults on malformed JSON rather than throwing", () => {
    expect(loadPreferences(fakeStorage("{not json"))).toEqual(DEFAULT_PREFERENCES);
  });

  it("round-trips saved preferences", () => {
    const store = fakeStorage();
    const prefs = { audioFeedback: "off", theme: "light", speechRate: 1 } as const;
    savePreferences(prefs, store);
    expect(loadPreferences(store)).toEqual(prefs);
  });
});

describe("savePreferences", () => {
  it("does not throw when storage rejects writes", () => {
    const throwing = {
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => savePreferences(DEFAULT_PREFERENCES, throwing)).not.toThrow();
  });
});
