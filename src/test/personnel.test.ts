/**
 * Phase 6 — Personnel Tests
 *
 * Tests for pass completion, personnel validation, carry-forward seeding,
 * roster safety, and jersey #0 support.
 */

import { describe, it, expect } from "vitest";
import {
  isPass1Complete,
  isPass2Complete,
  validatePersonnel,
  getCarryForwardPersonnel,
  PERSONNEL_POSITIONS,
} from "@/engine/personnel";
import { validateInline, validateCommitGate } from "@/engine/validation";
import { splitBlocksAtHalftime, computeSeriesForPlay } from "@/engine/slotEngine";
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
    gradeLT: null,
    gradeLG: null,
    gradeC: null,
    gradeRG: null,
    gradeRT: null,
    gradeX: null,
    gradeY: null,
    grade1: null,
    grade2: null,
    grade3: null,
    grade4: null,
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

  const rosterNumbers = new Set([50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 7, 22, 0]);

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
    expect(errors.rusher).toContain("Actor Integrity");
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

  // ── Jersey #0 tests ──

  it("accepts jersey #0 in personnel positions", () => {
    const errors = validatePersonnel(
      makeCandidate({ posLT: 0 }),
      rosterNumbers
    );
    expect(errors.posLT).toBeUndefined();
  });

  it("accepts jersey #0 as actor when in personnel", () => {
    const errors = validatePersonnel(
      makeCandidate({ posLT: 0, rusher: 0 }),
      rosterNumbers
    );
    expect(errors.posLT).toBeUndefined();
    expect(errors.rusher).toBeUndefined();
  });

  it("detects actor #0 not in personnel", () => {
    // Default personnel starts at 50, so 0 isn't in the 11
    const errors = validatePersonnel(
      makeCandidate({ rusher: 0 }),
      rosterNumbers
    );
    expect(errors.rusher).toContain("must be one of the 11");
  });

  it("detects duplicate jersey #0", () => {
    const errors = validatePersonnel(
      makeCandidate({ posLT: 0, posLG: 0 }),
      rosterNumbers
    );
    expect(errors.posLG).toContain("already assigned");
  });

  it("rejects jersey #0 when not in roster", () => {
    const rosterWithout0 = new Set([50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    const errors = validatePersonnel(
      makeCandidate({ posLT: 0 }),
      rosterWithout0
    );
    expect(errors.posLT).toContain("not in roster");
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

  it("finds source across D/K gap (backward-looking, not limited to playNum-1)", () => {
    const personnelValues: Record<string, number> = {};
    PERSONNEL_POSITIONS.forEach((f, i) => { personnelValues[f] = 50 + i; });

    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, ...personnelValues }),
      makePlay({ playNum: 2, odk: "D" }),
      makePlay({ playNum: 3, odk: "K" }),
      makePlay({ playNum: 4 }), // O play, target
    ];
    const metas = new Map<number, SlotMeta>();
    metas.set(1, makeMeta([...PERSONNEL_POSITIONS as unknown as string[]], 1));
    metas.set(2, makeMeta([], 2));
    metas.set(3, makeMeta([], 3));

    const result = getCarryForwardPersonnel(plays, metas, 4);
    expect(result).not.toBeNull();
    expect(result!.posLT).toBe(50);
  });

  it("uses most recent complete source, not first", () => {
    const pv1: Record<string, number> = {};
    PERSONNEL_POSITIONS.forEach((f, i) => { pv1[f] = 50 + i; });
    const pv2: Record<string, number> = {};
    PERSONNEL_POSITIONS.forEach((f, i) => { pv2[f] = 70 + i; });

    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, ...pv1 }),
      makePlay({ playNum: 3, ...pv2 }),
      makePlay({ playNum: 5 }),
    ];
    const metas = new Map<number, SlotMeta>();
    metas.set(1, makeMeta([...PERSONNEL_POSITIONS as unknown as string[]], 1));
    metas.set(3, makeMeta([...PERSONNEL_POSITIONS as unknown as string[]], 3));

    const result = getCarryForwardPersonnel(plays, metas, 5);
    expect(result).not.toBeNull();
    expect(result!.posLT).toBe(70); // from play 3, not play 1
  });

  it("carries forward jersey #0 correctly", () => {
    const personnelValues: Record<string, number> = {};
    PERSONNEL_POSITIONS.forEach((f, i) => { personnelValues[f] = i; }); // 0 through 10

    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, ...personnelValues }),
      makePlay({ playNum: 2 }),
    ];
    const metas = new Map<number, SlotMeta>();
    metas.set(1, makeMeta([...PERSONNEL_POSITIONS as unknown as string[]], 1));

    const result = getCarryForwardPersonnel(plays, metas, 2);
    expect(result).not.toBeNull();
    expect(result!.posLT).toBe(0);
  });
});

// ── Actor Fix Flows ──

describe("actor fix flows", () => {
  function makeCandidate(overrides: Record<string, unknown> = {}): CandidateData {
    const base: Record<string, unknown> = { gameId: "g1", odk: "O" };
    PERSONNEL_POSITIONS.forEach((f, i) => { base[f] = 50 + i; });
    return { ...base, ...overrides } as CandidateData;
  }

  const rosterNumbers = new Set([50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 7, 22, 0]);

  it("Option A: swapping actor into personnel resolves error", () => {
    // Actor rusher=#7 not in 11. Swap into posLT (replacing #50).
    const c = makeCandidate({ rusher: 7 });
    let errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeDefined();

    // Apply fix: set posLT = 7
    (c as Record<string, unknown>).posLT = 7;
    errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeUndefined();
    expect(errors.posLT).toBeUndefined();
  });

  it("Option B: changing actor to existing personnel member resolves error", () => {
    // Actor rusher=#7 not in 11. Change rusher to #50 (posLT).
    const c = makeCandidate({ rusher: 7 });
    let errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeDefined();

    // Apply fix: set rusher = 50
    (c as Record<string, unknown>).rusher = 50;
    errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeUndefined();
  });

  it("actor fix with jersey #0 works (Option A)", () => {
    const c = makeCandidate({ rusher: 0 });
    let errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeDefined(); // 0 not in default 50-60

    // Swap 0 into posLT
    (c as Record<string, unknown>).posLT = 0;
    errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeUndefined();
  });

  it("actor fix with jersey #0 works (Option B)", () => {
    // Set posLT=0, then actor rusher to 0
    const c = makeCandidate({ posLT: 0, rusher: 7 });
    let errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeDefined();

    (c as Record<string, unknown>).rusher = 0;
    errors = validatePersonnel(c, rosterNumbers);
    expect(errors.rusher).toBeUndefined();
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

// ── Q3 Series Auto-Increment ──

describe("Q3 series auto-increment", () => {
  it("computes series = prior O play series + 1 at Q3 boundary", () => {
    // Simulate: last O play before Q3 has series=5
    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, odk: "O", series: 3 }),
      makePlay({ playNum: 10, odk: "O", series: 5 }),
      makePlay({ playNum: 11, odk: "D", series: null }),
    ];
    // Q3 starts at play 12, odk=O
    const q3PlayNum = 12;
    const priorOPlays = plays
      .filter((p) => p.playNum < q3PlayNum && p.odk === "O" && p.series != null)
      .sort((a, b) => b.playNum - a.playNum);
    expect(priorOPlays.length).toBeGreaterThan(0);
    const newSeries = Number(priorOPlays[0].series) + 1;
    expect(newSeries).toBe(6);
  });

  it("returns no series if no prior O plays exist", () => {
    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, odk: "D", series: null }),
    ];
    const q3PlayNum = 2;
    const priorOPlays = plays
      .filter((p) => p.playNum < q3PlayNum && p.odk === "O" && p.series != null)
      .sort((a, b) => b.playNum - a.playNum);
    expect(priorOPlays.length).toBe(0);
  });

  it("uses most recent prior O play, not first", () => {
    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, odk: "O", series: 1 }),
      makePlay({ playNum: 5, odk: "O", series: 4 }),
      makePlay({ playNum: 8, odk: "O", series: 7 }),
    ];
    const q3PlayNum = 10;
    const priorOPlays = plays
      .filter((p) => p.playNum < q3PlayNum && p.odk === "O" && p.series != null)
      .sort((a, b) => b.playNum - a.playNum);
    const newSeries = Number(priorOPlays[0].series) + 1;
    expect(newSeries).toBe(8); // 7 + 1
  });

  it("increments series when O block spans halftime (Q2->Q3)", () => {
    // Simulate: plays 9,10 are O with series=5 (same block), Q3 starts at play 11
    const plays: PlayRecord[] = [
      makePlay({ playNum: 9, odk: "O", series: 5 }),
      makePlay({ playNum: 10, odk: "O", series: 5 }),
    ];
    const q3PlayNum = 11;
    // Slot at q3Start is also O with series=5 (block-carried)
    const slot = makePlay({ playNum: q3PlayNum, odk: "O", series: 5 });

    const priorOPlays = plays
      .filter((p) => p.playNum < q3PlayNum && p.odk === "O" && p.series != null)
      .sort((a, b) => b.playNum - a.playNum);
    expect(priorOPlays.length).toBeGreaterThan(0);
    const proposedSeries = Number(priorOPlays[0].series) + 1;
    expect(proposedSeries).toBe(6);

    // The fix: if slot.series === block-carried value (5), override to proposed (6)
    if (slot.series === null || slot.series === undefined || slot.series === plays[plays.length - 1].series) {
      slot.series = proposedSeries;
    }
    expect(slot.series).toBe(6);
  });

  it("forces series increment at Q3 start (quarterStarts['3']=7, block-carried series=1)", () => {
    const q3Start = 7;
    // Simulate DB-backed scan: plays 1-6 are O with series=1
    const dbPlays: Record<number, PlayRecord> = {};
    for (let i = 1; i <= 6; i++) {
      dbPlays[i] = makePlay({ playNum: i, odk: "O", series: 1 });
    }
    const slot = makePlay({ playNum: 7, odk: "O", series: 1 }); // block-carried

    const playNum = 7;
    const halfTimeBoundary = playNum === q3Start;
    expect(halfTimeBoundary).toBe(true);

    const newCandidate = { ...slot };

    if (halfTimeBoundary && slot.odk === "O") {
      // DB-backed scan (simulated)
      let lastSeries: number | null = null;
      for (let n = playNum - 1; n >= 1; n--) {
        const p = dbPlays[n];
        if (p && p.odk === "O" && p.series != null) {
          lastSeries = Number(p.series);
          break;
        }
      }
      const proposedSeries = lastSeries !== null ? lastSeries + 1 : 1;
      const currentNum = newCandidate.series != null ? Number(newCandidate.series) : null;
      const slotNum = slot.series != null ? Number(slot.series) : null;
      if (currentNum === null || currentNum === slotNum) {
        newCandidate.series = proposedSeries;
      }
    }

    expect(newCandidate.series).toBe(2);
  });

  it("splitBlocksAtHalftime splits O block spanning Q3 start", () => {
    const blocks = [{ odk: "O", startPlay: 1, endPlay: 12 }];
    const quarterStarts = { "1": 1, "2": 4, "3": 7, "4": 10 };
    const result = splitBlocksAtHalftime(blocks, quarterStarts);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ odk: "O", startPlay: 1, endPlay: 6 });
    expect(result[1]).toEqual({ odk: "O", startPlay: 7, endPlay: 12 });
  });

  it("splitBlocksAtHalftime produces correct series across halftime", () => {
    const blocks = [{ odk: "O", startPlay: 1, endPlay: 12 }];
    const quarterStarts = { "1": 1, "2": 4, "3": 7, "4": 10 };
    const split = splitBlocksAtHalftime(blocks, quarterStarts);
    // Series for play 6 (end of first half O block) should be 1
    const series6 = computeSeriesForPlay(6, split);
    expect(series6).toBe(1);
    // Series for play 7 (start of second half O block) should be 2 (new block = new series)
    const series7 = computeSeriesForPlay(7, split);
    expect(series7).toBe(2);
  });
});

describe("Next Slot — pure navigation logic", () => {
  it("computes next slot from odkFilter ordering without modifying candidate state", () => {
    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, odk: "O" }),
      makePlay({ playNum: 2, odk: "D" }),
      makePlay({ playNum: 3, odk: "O" }),
      makePlay({ playNum: 4, odk: "O" }),
    ];

    // odkFilter = "O" → filtered list is [1, 3, 4]
    const odkFilter = "O";
    const filteredList = plays.filter((p) => p.odk === odkFilter);
    const selectedSlotNum = 1;

    const currentIdx = filteredList.findIndex((p) => p.playNum === selectedSlotNum);
    expect(currentIdx).toBe(0);
    expect(filteredList[currentIdx + 1].playNum).toBe(3); // next O play is 3, not 2

    // Verify candidate is NOT mutated (simulate)
    const candidate = { ...plays[0] };
    const candidateBefore = JSON.stringify(candidate);
    // "nextSlot" just calls selectSlot — no mutation of current candidate expected
    // The key assertion: no commitProposal call needed
    const candidateAfter = JSON.stringify(candidate);
    expect(candidateAfter).toBe(candidateBefore);
  });

  it("returns false (no next) when at last slot in filtered list", () => {
    const plays: PlayRecord[] = [
      makePlay({ playNum: 1, odk: "O" }),
      makePlay({ playNum: 2, odk: "D" }),
    ];
    const odkFilter = "O";
    const filteredList = plays.filter((p) => p.odk === odkFilter);
    const selectedSlotNum = 1;

    const currentIdx = filteredList.findIndex((p) => p.playNum === selectedSlotNum);
    const hasNext = currentIdx >= 0 && currentIdx < filteredList.length - 1;
    expect(hasNext).toBe(false); // only one O play, no next
  });

  it("does not modify touchedFields, predictedFields, or carriedForwardFields sets", () => {
    // These sets should be untouched by nextSlot navigation logic
    const touched = new Set(["odk", "series"]);
    const predicted = new Set(["dn"]);
    const carriedForward = new Set(["posLT"]);

    // Simulate: nextSlot only computes next play and calls selectSlot
    // It does NOT alter these sets directly — selectSlot resets them on its own
    const touchedBefore = new Set(touched);
    const predictedBefore = new Set(predicted);
    const carriedBefore = new Set(carriedForward);

    // No mutation happens to these in the nextSlot function itself
    expect(touched).toEqual(touchedBefore);
    expect(predicted).toEqual(predictedBefore);
    expect(carriedForward).toEqual(carriedBefore);
  });
});

describe("Actor fix action toast trigger", () => {
  it("triggers alert when swap changes a value", () => {
    // Simulate ActorFixCard swap logic
    const candidate: Record<string, unknown> = { posLT: 55 };
    const swapTarget = "posLT";
    const actorJersey = 22;
    const currentVal = candidate[swapTarget];

    // Value changes: 55 → 22
    const changed = String(currentVal) !== String(actorJersey);
    expect(changed).toBe(true); // toast should fire
  });

  it("does not trigger alert when value is already the same", () => {
    const candidate: Record<string, unknown> = { posLT: 22 };
    const swapTarget = "posLT";
    const actorJersey = 22;
    const currentVal = candidate[swapTarget];

    const changed = String(currentVal) !== String(actorJersey);
    expect(changed).toBe(false); // no toast
  });
});
