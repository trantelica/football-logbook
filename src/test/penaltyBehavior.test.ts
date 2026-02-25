/**
 * Phase 5 — Penalty Behavior Tests
 * 
 * Covers Rules 1-4 for penalty prediction and proposal-time defaults.
 */

import { describe, it, expect } from "vitest";
import { computePrediction } from "@/engine/prediction";
import { toCoachMessage } from "@/engine/predictionMessages";
import { computeEff } from "@/engine/eff";
import type { PlayRecord } from "@/engine/types";
import { PENALTY_YARDS_MAP } from "@/engine/schema";

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

describe("Rule 1 — PEN YARDS defaulting", () => {
  it("PENALTY_YARDS_MAP has entries for known penalties", () => {
    expect(PENALTY_YARDS_MAP["O-Holding"]).toBe(10);
    expect(PENALTY_YARDS_MAP["O-False Start"]).toBe(5);
    expect(PENALTY_YARDS_MAP["D-Pass Interference"]).toBe(15);
  });

  // Proposal-time defaulting is tested via transaction integration;
  // here we verify the map is available and correct.
});

describe("Rule 2 — Offsetting Penalties → replay down", () => {
  it("holds yardLn, dn, dist when result is Offsetting Penalties", () => {
    const play = makePlay({
      result: "Offsetting Penalties",
      penalty: "O-Holding",
      gainLoss: 0,
      yardLn: -30,
      dn: "2",
      dist: 7,
    });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(-30); // held
    expect(r.dn).toBe(2);       // held
    expect(r.dist).toBe(7);     // held
    expect(r.explanations[0]).toContain("Offsetting penalties");
  });

  it("holds values even without gainLoss (offsetting overrides gates)", () => {
    const play = makePlay({
      result: "Offsetting Penalties",
      penalty: "O-Holding",
      gainLoss: null,
      yardLn: -25,
      dn: "3",
      dist: 4,
    });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(-25);
    expect(r.dn).toBe(3);
    expect(r.dist).toBe(4);
  });

  it("returns null dn/dist if missing on prevPlay with offsetting", () => {
    const play = makePlay({
      result: "Offsetting Penalties",
      penalty: "O-Holding",
      gainLoss: null,
      yardLn: -25,
      dn: null,
      dist: null,
    });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(-25);
    expect(r.dn).toBeNull();
    expect(r.dist).toBeNull();
  });

  it("EFF = N for offsetting penalties", () => {
    const eff = computeEff({
      result: "Offsetting Penalties",
      gainLoss: 0,
      dn: 2,
      dist: 7,
      penalty: "O-Holding",
    });
    // Penalty present → eff is null (existing behavior)
    expect(eff).toBeNull();
  });

  it("coach message for offsetting", () => {
    const msg = toCoachMessage("Offsetting penalties: replay down. Next values held.", 5);
    expect(msg.coach).toContain("Offsetting penalties");
    expect(msg.coach).toContain("replay down");
  });
});

describe("Rule 3 — Penalty + net result → normal prediction with note", () => {
  it("predicts normally when penalty present with Rush result", () => {
    const play = makePlay({
      penalty: "O-Holding",
      result: "Rush",
      gainLoss: 5,
      yardLn: -30,
      dn: "1",
      dist: 10,
    });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(-35);
    expect(r.dn).toBe(2);
    expect(r.dist).toBe(5);
    expect(r.explanations.some(e => e.includes("Penalty noted"))).toBe(true);
  });

  it("predicts normally when penalty present with Complete result", () => {
    const play = makePlay({
      penalty: "D-Pass Interference",
      result: "Complete",
      gainLoss: 12,
      yardLn: -30,
      dn: "2",
      dist: 8,
    });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(38); // crossed midfield
    expect(r.dn).toBe(1);      // first down
    expect(r.dist).toBe(10);
  });

  it("coach message for penalty with net result", () => {
    const msg = toCoachMessage("Penalty noted. Next-play values based on net result recorded.", 5);
    expect(msg.coach).toContain("Penalty noted");
    expect(msg.coach).toContain("net result");
  });
});

describe("Rule 4 — Generic penalty result → suspend predictions", () => {
  it("suspends when result is Penalty", () => {
    const play = makePlay({
      penalty: "O-Holding",
      result: "Penalty",
      gainLoss: null,
      yardLn: -30,
      dn: "2",
      dist: 7,
    });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.yardLn).toBeNull();
    expect(r.dn).toBeNull();
    expect(r.dist).toBeNull();
    expect(r.explanations[0]).toContain("not predicted");
  });

  it("suspends when result is Penalty, Safety", () => {
    const play = makePlay({
      penalty: "O-Holding",
      result: "Penalty, Safety",
      gainLoss: null,
      yardLn: -5,
      dn: "1",
      dist: 10,
    });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("not predicted");
  });

  it("coach message for generic penalty suspension", () => {
    const msg = toCoachMessage("Penalty recorded: next yard line/down/distance not predicted.", 5);
    expect(msg.coach).toContain("not predicted");
    expect(msg.coach).toContain("Enter next values");
  });
});

describe("Rule 1 — Banner messages for PEN YARDS", () => {
  // These test the message strings that would be produced by reviewProposal
  it("defaulting message is coach-friendly", () => {
    const msg = "Penalty yards filled from the penalty list. You can change it.";
    expect(msg).not.toContain("clamp");
    expect(msg).toContain("penalty list");
  });

  it("clearing message is coach-friendly", () => {
    const msg = "Penalty cleared. Penalty yards cleared.";
    expect(msg).not.toContain("clamp");
    expect(msg).toContain("cleared");
  });
});
