/**
 * PAT Engine Tests
 *
 * Covers: PAT context detection, patTry → playType, result constraints,
 * penalty re-try, prediction suspension.
 */

import { describe, it, expect } from "vitest";
import {
  shouldEnterPATContext,
  getCarriedPatTry,
  patTryToPlayType,
  validatePATResult,
  isTDResult,
  isSafetyResult,
} from "@/engine/patEngine";
import type { PlayRecord } from "@/engine/types";

function makePlay(overrides: Partial<PlayRecord>): PlayRecord {
  return {
    gameId: "test-game",
    playNum: 1,
    qtr: "1",
    odk: "O",
    series: 1,
    yardLn: -30,
    dn: "1",
    dist: 10,
    hash: "M",
    offForm: null,
    offPlay: null,
    motion: null,
    result: "Rush",
    gainLoss: 5,
    twoMin: null,
    rusher: null,
    passer: null,
    receiver: null,
    penalty: null,
    penYards: null,
    eff: null,
    offStrength: null,
    personnel: null,
    playType: null,
    playDir: null,
    motionDir: null,
    patTry: null,
    ...overrides,
  } as PlayRecord;
}

describe("isTDResult", () => {
  it("returns true for TD results", () => {
    expect(isTDResult("Rush, TD")).toBe(true);
    expect(isTDResult("Complete, TD")).toBe(true);
    expect(isTDResult("TD")).toBe(true);
  });

  it("returns false for non-TD results", () => {
    expect(isTDResult("Rush")).toBe(false);
    expect(isTDResult("Complete")).toBe(false);
    expect(isTDResult(null)).toBe(false);
  });
});

describe("isSafetyResult", () => {
  it("detects Safety", () => {
    expect(isSafetyResult("Safety")).toBe(true);
    expect(isSafetyResult("Rush")).toBe(false);
    expect(isSafetyResult(null)).toBe(false);
  });
});

describe("shouldEnterPATContext", () => {
  it("enters PAT context when prevPlay is TD and patMode is youth_1_2", () => {
    const prev = makePlay({ result: "Rush, TD" });
    expect(shouldEnterPATContext(prev, makePlay({}), "youth_1_2")).toBe(true);
  });

  it("does NOT enter PAT when patMode is none", () => {
    const prev = makePlay({ result: "Rush, TD" });
    expect(shouldEnterPATContext(prev, makePlay({}), "none")).toBe(false);
  });

  it("does NOT enter PAT when prevPlay is not TD", () => {
    const prev = makePlay({ result: "Rush" });
    expect(shouldEnterPATContext(prev, makePlay({}), "youth_1_2")).toBe(false);
  });

  it("enters PAT context when current slot has patTry (penalty re-try)", () => {
    const prev = makePlay({ result: "Penalty", patTry: "1" });
    const current = makePlay({ patTry: "1" });
    expect(shouldEnterPATContext(prev, current, "youth_1_2")).toBe(true);
  });

  it("does NOT enter PAT when patMode is undefined", () => {
    const prev = makePlay({ result: "Rush, TD" });
    expect(shouldEnterPATContext(prev, makePlay({}), undefined)).toBe(false);
  });
});

describe("getCarriedPatTry", () => {
  it("carries patTry from penalty re-try", () => {
    const prev = makePlay({ result: "Penalty", patTry: "2" });
    expect(getCarriedPatTry(prev, makePlay({}))).toBe("2");
  });

  it("returns null when previous play was not penalty", () => {
    const prev = makePlay({ result: "Good", patTry: "1" });
    expect(getCarriedPatTry(prev, makePlay({}))).toBeNull();
  });

  it("returns current slot patTry if set", () => {
    expect(getCarriedPatTry(makePlay({}), makePlay({ patTry: "1" }))).toBe("1");
  });

  it("returns null when nothing to carry", () => {
    expect(getCarriedPatTry(makePlay({}), makePlay({}))).toBeNull();
  });
});

describe("patTryToPlayType", () => {
  it("maps 1 to Extra Pt.", () => {
    expect(patTryToPlayType("1")).toBe("Extra Pt.");
  });

  it("maps 2 to 2 Pt.", () => {
    expect(patTryToPlayType("2")).toBe("2 Pt.");
  });
});

describe("validatePATResult", () => {
  it("accepts Good", () => {
    expect(validatePATResult("Good")).toBeNull();
  });

  it("accepts No Good", () => {
    expect(validatePATResult("No Good")).toBeNull();
  });

  it("accepts Penalty", () => {
    expect(validatePATResult("Penalty")).toBeNull();
  });

  it("rejects Rush", () => {
    expect(validatePATResult("Rush")).not.toBeNull();
  });

  it("rejects Rush, TD", () => {
    expect(validatePATResult("Rush, TD")).not.toBeNull();
  });

  it("accepts null/empty", () => {
    expect(validatePATResult(null)).toBeNull();
    expect(validatePATResult("")).toBeNull();
  });
});
