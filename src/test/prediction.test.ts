/**
 * Phase 5A — Prediction Engine Tests
 */

import { describe, it, expect } from "vitest";
import {
  yardLnToIdx,
  idxToYardLn,
  clampIdx,
  computePrediction,
} from "@/engine/prediction";
import type { PlayRecord } from "@/engine/types";

// Helper to create a minimal committed play
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
    ...overrides,
  } as PlayRecord;
}

describe("Yardline Index Model — 80-yard field", () => {
  it("converts negative yardLn to idx", () => {
    expect(yardLnToIdx(-30, 80)).toBe(30);
    expect(yardLnToIdx(-1, 80)).toBe(1);
    expect(yardLnToIdx(-39, 80)).toBe(39);
  });

  it("converts positive yardLn to idx", () => {
    expect(yardLnToIdx(40, 80)).toBe(40);
    expect(yardLnToIdx(1, 80)).toBe(79);
    expect(yardLnToIdx(39, 80)).toBe(41);
  });

  it("round-trips correctly", () => {
    for (let idx = 1; idx <= 79; idx++) {
      const yl = idxToYardLn(idx, 80);
      expect(yardLnToIdx(yl, 80)).toBe(idx);
    }
  });
});

describe("Yardline Index Model — 100-yard field", () => {
  it("converts correctly", () => {
    expect(yardLnToIdx(-49, 100)).toBe(49);
    expect(yardLnToIdx(50, 100)).toBe(50);
    expect(yardLnToIdx(1, 100)).toBe(99);
  });

  it("round-trips correctly", () => {
    for (let idx = 1; idx <= 99; idx++) {
      const yl = idxToYardLn(idx, 100);
      expect(yardLnToIdx(yl, 100)).toBe(idx);
    }
  });
});

describe("clampIdx", () => {
  it("clamps below 1", () => {
    expect(clampIdx(0, 80)).toEqual({ idx: 1, clamped: true });
    expect(clampIdx(-5, 80)).toEqual({ idx: 1, clamped: true });
  });

  it("clamps above maxIdx", () => {
    expect(clampIdx(80, 80)).toEqual({ idx: 79, clamped: true });
    expect(clampIdx(100, 100)).toEqual({ idx: 99, clamped: true });
  });

  it("does not clamp valid indices", () => {
    expect(clampIdx(40, 80)).toEqual({ idx: 40, clamped: false });
  });
});

describe("Prediction Eligibility Gates", () => {
  it("suspends when no previous play", () => {
    const r = computePrediction(null, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("previous slot not available");
  });

  it("suspends when previous play ODK != O", () => {
    const r = computePrediction(makePlay({ odk: "D" }), "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("not offensive");
  });

  it("suspends when current slot ODK != O", () => {
    const r = computePrediction(makePlay({}), "K", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("not offensive");
  });

  it("suspends when penalty present", () => {
    const r = computePrediction(makePlay({ penalty: "O-Holding" }), "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("penalty present");
  });

  it("suspends when result missing", () => {
    const r = computePrediction(makePlay({ result: null }), "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("result missing");
  });

  it("suspends when gainLoss missing", () => {
    const r = computePrediction(makePlay({ gainLoss: null }), "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("gain/loss missing");
  });

  it("suspends when dn missing", () => {
    const r = computePrediction(makePlay({ dn: null }), "O", 80);
    expect(r.eligible).toBe(false);
  });

  it("suspends when dist missing", () => {
    const r = computePrediction(makePlay({ dist: null }), "O", 80);
    expect(r.eligible).toBe(false);
  });

  it("suspends when yardLn missing", () => {
    const r = computePrediction(makePlay({ yardLn: null }), "O", 80);
    expect(r.eligible).toBe(false);
  });
});

describe("Midfield Crossing — 80-yard field", () => {
  it("predicts yardline across midfield correctly", () => {
    // Play at own -35 (idx=35), gain 10 => idx=45, yardLn = 80-45 = 35
    const play = makePlay({ yardLn: -35, dn: "1", dist: 10, gainLoss: 10, result: "Rush" });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(35); // opponent's 35
    expect(r.dn).toBe(1); // first down achieved (10 >= 10)
    expect(r.dist).toBe(10);
  });

  it("handles midfield exactly (idx=40 → yardLn=40)", () => {
    // Play at own -35, gain 5 => idx=40, yardLn = 80-40 = 40
    const play = makePlay({ yardLn: -35, dn: "1", dist: 10, gainLoss: 5, result: "Rush" });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(40); // midfield
    expect(r.dn).toBe(2);
    expect(r.dist).toBe(5);
  });
});

describe("4th Down — Never produces DN > 4", () => {
  it("predicts DN=1 on 4th down failure with turnover explanation", () => {
    const play = makePlay({ dn: "4", dist: 5, gainLoss: 2, result: "Rush", yardLn: -30 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.dn).toBe(1); // NOT 5
    expect(r.explanations).toContain("4th down turnover assumed; possession logic deferred");
  });

  it("predicts first down on 4th down conversion", () => {
    const play = makePlay({ dn: "4", dist: 3, gainLoss: 5, result: "Rush", yardLn: -30 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.dn).toBe(1);
    expect(r.explanations).not.toContain("4th down turnover assumed; possession logic deferred");
  });
});

describe("Goal Line — distToGoal correctness", () => {
  it("predicts dist=1 at opponent 1-yard line after first down", () => {
    // At opponent 5 (idx=75), dn=1 dist=5 gain=4 => idx=79, yardLn=1
    // gain 4 < dist 5 → not first down. Need gain >= dist for 1st down.
    // Use dn=1 dist=3 gain=4 => first down, idx=79, distToGoal=1
    const play = makePlay({ yardLn: 5, dn: "1", dist: 3, gainLoss: 4, result: "Rush" });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(1);
    expect(r.dn).toBe(1);
    expect(r.dist).toBe(1);
  });

  it("predicts dist=2 at opponent 2-yard line after first down", () => {
    // At opponent 5 (idx=75), dn=1 dist=3 gain=3 => idx=78, yardLn=2
    // gain 3 >= dist 3 → first down, distToGoal = 79-78+1 = 2
    const play = makePlay({ yardLn: 5, dn: "1", dist: 3, gainLoss: 3, result: "Rush" });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.dn).toBe(1);
    expect(r.dist).toBe(2);
  });

  it("100-yard field: dist=1 at opponent 1", () => {
    // At opponent 5 (idx=95), dn=1 dist=4 gain=4 => idx=99, yardLn=1
    // distToGoal = 99-99+1 = 1
    const play = makePlay({ yardLn: 5, dn: "1", dist: 4, gainLoss: 4, result: "Rush" });
    const r = computePrediction(play, "O", 100);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(1);
    expect(r.dist).toBe(1);
  });
});

describe("Scoring/Safety Overflow — Prediction Suspended", () => {
  it("suspends when forward progress exceeds opponent end zone", () => {
    // At opponent 2 (idx=78), gain 5 => idx=83 > 79
    const play = makePlay({ yardLn: 2, dn: "1", dist: 10, gainLoss: 5, result: "Rush" });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.yardLn).toBeNull();
    expect(r.dn).toBeNull();
    expect(r.dist).toBeNull();
    expect(r.explanations[0]).toContain("scoring/safety logic deferred");
  });

  it("suspends when loss exceeds own end zone", () => {
    // At own -2 (idx=2), loss -5 => idx=-3 < 1
    const play = makePlay({ yardLn: -2, dn: "1", dist: 10, gainLoss: -5, result: "Rush" });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.yardLn).toBeNull();
    expect(r.explanations[0]).toContain("scoring/safety logic deferred");
  });

  it("does NOT suspend at the boundary (idx=maxIdx is still valid)", () => {
    // At opponent 5 (idx=75), gain 4 => idx=79 = maxIdx, still in range
    const play = makePlay({ yardLn: 5, dn: "1", dist: 10, gainLoss: 4, result: "Rush" });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(1);
  });
});

describe("Edge Cases", () => {
  it("normal down progression (2nd and 5)", () => {
    const play = makePlay({ dn: "2", dist: 5, gainLoss: 3, result: "Rush", yardLn: -30 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.dn).toBe(3);
    expect(r.dist).toBe(2);
  });
});
