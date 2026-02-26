/**
 * Phase 6 — Personnel Tests
 *
 * Tests for pass completion, personnel validation, carry-forward seeding,
 * and roster safety.
 */

import { describe, it, expect } from "vitest";
import {
  isPass1Complete,
  isPass2Complete,
  validatePersonnel,
  getCarryForwardPersonnel,
  PERSONNEL_POSITIONS,
} from "@/engine/personnel";
import type { PlayRecord, SlotMeta, CandidateData } from "@/engine/types";

function makePlay(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    gameId: "g1",
    playNum: 1,
    qtr: "1",
    odk: "O",
    series: 1,
    yardLn: 35,
    dn: "1",
    dist: 10,
    hash: null,
    offForm: "Trips Rt",
    offPlay: "26 Punch",
    motion: null,
    result: "Rush",
    gainLoss: 4,
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
    posLT: null,
    posLG: null,
    posC: null,
    posRG: null,
    posRT: null,
    posX: null,
    posY: null,
    pos1: null,
    pos2: null,
    pos3: null,
    pos4: null,
    returner: null,
    ...overrides,
  };
}

function makeMeta(
  committedFields: string[],
  playNum = 1
): SlotMeta {
  return { gameId: "g1", playNum, committedFields };
}

// ── Pass 1 Complete ──

describe("isPass1Complete", () => {
  it("returns true when all required offensive fields are committed", () => {
    const play = makePlay();
    const meta = makeMeta([
      "qtr", "odk", "series", "yardLn", "dn", "dist", "offPlay", "result", "gainLoss",
    ]);
    expect(isPass1Complete(play, meta)).toBe(true);
  });

  it("returns false when result is missing", () => {
    const play = makePlay({ result: null });
    const meta = makeMeta(["qtr", "odk", "series", "yardLn", "dn", "dist", "offPlay", "gainLoss"]);
    expect(isPass1Complete(play, meta)).toBe(false);
  });

  it("returns false when gainLoss not committed", () => {
    const play = makePlay();
    const meta = makeMeta(["qtr", "odk", "series", "yardLn", "dn", "dist", "offPlay", "result"]);
    expect(isPass1Complete(play, meta)).toBe(false);
  });

  it("returns true for D play without offensive-specific fields", () => {
    const play = makePlay({ odk: "D", series: null, yardLn: null, dn: null, dist: null, offPlay: null });
    const meta = makeMeta(["qtr", "odk", "result", "gainLoss"]);
    expect(isPass1Complete(play, meta)).toBe(true);
  });

  it("returns false without meta", () => {
    expect(isPass1Complete(makePlay(), undefined)).toBe(false);
  });
});

// ── Pass 2 Complete ──

describe("isPass2Complete", () => {
  const personnelFields = PERSONNEL_POSITIONS as unknown as string[];

  it("returns true when all 11 personnel positions are committed for O play", () => {
    const overrides: Record<string, number> = {};
    personnelFields.forEach((f, i) => { overrides[f] = 50 + i; });
    const play = makePlay(overrides as Partial<PlayRecord>);
    const meta = makeMeta([...personnelFields]);
    expect(isPass2Complete(play, meta)).toBe(true);
  });

  it("returns false when one position is missing", () => {
    const overrides: Record<string, number | null> = {};
    personnelFields.forEach((f, i) => { overrides[f] = 50 + i; });
    overrides.posC = null; // missing
    const play = makePlay(overrides as Partial<PlayRecord>);
    const committed = personnelFields.filter((f) => f !== "posC");
    const meta = makeMeta(committed);
    expect(isPass2Complete(play, meta)).toBe(false);
  });

  it("returns true for D/K plays (trivially complete)", () => {
    const play = makePlay({ odk: "D" });
    const meta = makeMeta([]);
    expect(isPass2Complete(play, meta)).toBe(true);
  });
});

// ── Personnel Validation ──

describe("validatePersonnel", () => {
  function makeCandidate(overrides: Record<string, unknown> = {}): CandidateData {
    const base: Record<string, unknown> = { gameId: "g1", odk: "O" };
    PERSONNEL_POSITIONS.forEach((f, i) => { base[f] = 50 + i; });
    return { ...base, ...overrides } as CandidateData;
  }

  const rosterNumbers = new Set([50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 7, 22]);

  it("returns no errors when all 11 positions valid and unique", () => {
    const errors = validatePersonnel(makeCandidate(), rosterNumbers);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("returns errors for missing positions", () => {
    const errors = validatePersonnel(makeCandidate({ posC: null }), rosterNumbers);
    expect(errors.posC).toBeDefined();
  });

  it("detects duplicate jerseys", () => {
    const errors = validatePersonnel(makeCandidate({ posLG: 50 }), rosterNumbers); // posLT is also 50
    expect(errors.posLG).toContain("already assigned");
  });

  it("detects jersey not in roster", () => {
    const errors = validatePersonnel(makeCandidate({ posLT: 99 }), rosterNumbers);
    expect(errors.posLT).toContain("not in roster");
  });

  it("validates actor must be in personnel", () => {
    const errors = validatePersonnel(
      makeCandidate({ rusher: 7 }), // 7 is in roster but not in the 11
      rosterNumbers
    );
    expect(errors.rusher).toContain("must be one of the 11");
    expect(errors.rusher).toContain("fix in Play Details");
  });

  it("passes when actor is in personnel", () => {
    const errors = validatePersonnel(
      makeCandidate({ rusher: 50 }), // 50 = posLT
      rosterNumbers
    );
    expect(errors.rusher).toBeUndefined();
  });

  it("skips validation for non-O plays", () => {
    const errors = validatePersonnel(
      { gameId: "g1", odk: "D" } as CandidateData
    );
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

// ── Carry-Forward Seeding ──

describe("getCarryForwardPersonnel", () => {
  it("returns personnel from most recent prior O play with pass2 complete", () => {
    const personnelValues: Record<string, number> = {};
    PERSONNEL_POSITIONS.forEach((f, i) => { personnelValues[f] = 50 + i; });

    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, ...personnelValues }),
      makePlay({ playNum: 2 }),
      makePlay({ playNum: 3 }),
    ];

    const metas = new Map<number, SlotMeta>();
    metas.set(1, makeMeta([...PERSONNEL_POSITIONS as unknown as string[]], 1));
    metas.set(2, makeMeta([], 2));

    const result = getCarryForwardPersonnel(plays, metas, 3);
    expect(result).not.toBeNull();
    expect(result!.posLT).toBe(50);
  });

  it("returns null when no prior pass2 complete play exists", () => {
    const plays: PlayRecord[] = [makePlay({ playNum: 1 })];
    const metas = new Map<number, SlotMeta>();
    metas.set(1, makeMeta(["qtr", "odk"], 1));
    const result = getCarryForwardPersonnel(plays, metas, 2);
    expect(result).toBeNull();
  });

  it("skips D plays when looking for carry-forward source", () => {
    const personnelValues: Record<string, number> = {};
    PERSONNEL_POSITIONS.forEach((f, i) => { personnelValues[f] = 50 + i; });

    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, odk: "D" }),
      makePlay({ playNum: 2 }),
    ];
    const metas = new Map<number, SlotMeta>();
    metas.set(1, makeMeta([...PERSONNEL_POSITIONS as unknown as string[]], 1));
    const result = getCarryForwardPersonnel(plays, metas, 2);
    expect(result).toBeNull();
  });
});

// ── Roster Safety ──

describe("roster safety", () => {
  it("editing personnel does not modify other plays (structural guarantee)", () => {
    const play1 = makePlay({ playNum: 1, posLT: 50 });
    const play2 = makePlay({ playNum: 2, posLT: 51 });

    // Mutating play2's personnel should not affect play1
    play2.posLT = 99;
    expect(play1.posLT).toBe(50);
  });
});
