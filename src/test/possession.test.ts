/**
 * Phase 5 — Possession Guardrail Tests
 */

import { describe, it, expect } from "vitest";
import { isPossessionChange, isFourthDownShort, possessionGuardrail, normalizeResult, POSSESSION_CHANGE_RESULTS } from "@/engine/possession";
import { computePrediction } from "@/engine/prediction";
import { toCoachMessage } from "@/engine/predictionMessages";
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

describe("Possession-change result enum triggers", () => {
  const allTriggers = [
    "Interception",
    "Interception, Def TD",
    "Fumble",
    "Fumble, Def TD",
    "Complete, Fumble",
    "Sack, Fumble",
    "Sack, Fumble, Def TD",
    "Def TD",
    "Safety",
    "Sack, Safety",
    "Rush, Safety",
    "COP",
  ];

  for (const result of allTriggers) {
    it(`detects possession change for "${result}"`, () => {
      expect(isPossessionChange(makePlay({ result }))).toBe(true);
    });
  }

  it("does NOT trigger for normal results", () => {
    expect(isPossessionChange(makePlay({ result: "Rush" }))).toBe(false);
    expect(isPossessionChange(makePlay({ result: "Complete" }))).toBe(false);
    expect(isPossessionChange(makePlay({ result: "Incomplete" }))).toBe(false);
  });

  it("does NOT trigger for Offsetting Penalties", () => {
    expect(isPossessionChange(makePlay({ result: "Offsetting Penalties" }))).toBe(false);
  });

  it("does NOT trigger for Penalty result", () => {
    expect(isPossessionChange(makePlay({ result: "Penalty" }))).toBe(false);
  });

  it("does NOT trigger for null prevPlay", () => {
    expect(isPossessionChange(null)).toBe(false);
  });
});

describe("4th-down-short condition", () => {
  it("triggers when dn=4 and gainLoss < dist", () => {
    const play = makePlay({ dn: "4", dist: 3, gainLoss: 1, result: "Rush" });
    expect(isFourthDownShort(play)).toBe(true);
  });

  it("does NOT trigger when gainLoss >= dist", () => {
    const play = makePlay({ dn: "4", dist: 3, gainLoss: 5, result: "Rush" });
    expect(isFourthDownShort(play)).toBe(false);
  });

  it("does NOT trigger when dn != 4", () => {
    const play = makePlay({ dn: "3", dist: 3, gainLoss: 1, result: "Rush" });
    expect(isFourthDownShort(play)).toBe(false);
  });

  it("does NOT trigger when result is Penalty", () => {
    const play = makePlay({ dn: "4", dist: 3, gainLoss: 1, result: "Penalty" });
    expect(isFourthDownShort(play)).toBe(false);
  });

  it("does NOT trigger when result is Offsetting Penalties", () => {
    const play = makePlay({ dn: "4", dist: 3, gainLoss: 1, result: "Offsetting Penalties" });
    expect(isFourthDownShort(play)).toBe(false);
  });

  it("does NOT trigger when gainLoss is null", () => {
    const play = makePlay({ dn: "4", dist: 3, gainLoss: null, result: "Rush" });
    expect(isFourthDownShort(play)).toBe(false);
  });
});

describe("possessionGuardrail — modal vs banner", () => {
  it("needs modal when possession changed, next slot O, no filter", () => {
    const play = makePlay({ result: "Interception" });
    const r = possessionGuardrail(play, "O", false);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(true);
    expect(r.needsBanner).toBe(false);
  });

  it("needs banner (no modal) when possession changed, next slot O, filter active", () => {
    const play = makePlay({ result: "Interception" });
    const r = possessionGuardrail(play, "O", true);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(false);
    expect(r.needsBanner).toBe(true);
  });

  it("needs banner (no modal) when possession changed, next slot D", () => {
    const play = makePlay({ result: "Interception" });
    const r = possessionGuardrail(play, "D", false);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(false);
    expect(r.needsBanner).toBe(true);
  });

  it("no guardrail for normal play", () => {
    const play = makePlay({ result: "Rush" });
    const r = possessionGuardrail(play, "O", false);
    expect(r.possessionChanged).toBe(false);
    expect(r.needsModal).toBe(false);
    expect(r.needsBanner).toBe(false);
  });

  it("4th-down-short triggers modal when next slot O, no filter", () => {
    const play = makePlay({ dn: "4", dist: 5, gainLoss: 2, result: "Rush" });
    const r = possessionGuardrail(play, "O", false);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(true);
  });

  it("4th-down-short triggers banner when filter active", () => {
    const play = makePlay({ dn: "4", dist: 5, gainLoss: 2, result: "Rush" });
    const r = possessionGuardrail(play, "O", true);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(false);
    expect(r.needsBanner).toBe(true);
  });
});

describe("Prediction engine integration — possession suspension", () => {
  it("suspends predictions for Interception result", () => {
    const play = makePlay({ result: "Interception", yardLn: -30, dn: "2", dist: 7, gainLoss: 0 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.yardLn).toBeNull();
    expect(r.dn).toBeNull();
    expect(r.dist).toBeNull();
    expect(r.explanations[0]).toContain("Possession likely changed");
  });

  it("suspends predictions for Fumble result", () => {
    const play = makePlay({ result: "Fumble", yardLn: -30, dn: "1", dist: 10, gainLoss: 3 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("Possession likely changed");
  });

  it("suspends predictions for Safety result", () => {
    const play = makePlay({ result: "Safety", yardLn: -5, dn: "1", dist: 10, gainLoss: -5 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
  });

  it("suspends predictions for 4th-down-short", () => {
    const play = makePlay({ dn: "4", dist: 5, gainLoss: 2, result: "Rush", yardLn: -30 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("Possession likely changed");
  });

  it("does NOT suspend for Offsetting Penalties (Rule 2 intact)", () => {
    const play = makePlay({ result: "Offsetting Penalties", penalty: "O-Holding", yardLn: -30, dn: "2", dist: 7, gainLoss: 0 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(-30);
    expect(r.dn).toBe(2);
    expect(r.dist).toBe(7);
  });

  it("does NOT suspend for generic Penalty result (Rule 4 intact)", () => {
    const play = makePlay({ result: "Penalty", penalty: "O-Holding", yardLn: -30, dn: "2", dist: 7, gainLoss: null });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    // Should be penalty suspension, not possession
    expect(r.explanations[0]).toContain("not predicted");
    expect(r.explanations[0]).not.toContain("Possession");
  });

  it("does NOT interfere with normal Rush prediction", () => {
    const play = makePlay({ result: "Rush", yardLn: -30, dn: "1", dist: 10, gainLoss: 5 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(true);
    expect(r.yardLn).toBe(-35);
    expect(r.dn).toBe(2);
    expect(r.dist).toBe(5);
  });
});

describe("Coach messages for possession guardrail", () => {
  it("maps possession explanation to coach message", () => {
    const msg = toCoachMessage("Possession likely changed: next yard line/down/distance not predicted.", 5);
    expect(msg.coach).toContain("Possession may have changed");
    expect(msg.coach).toContain("not predicted");
  });
});

describe("COP result — possession guardrail", () => {
  it("detects possession change for COP", () => {
    expect(isPossessionChange(makePlay({ result: "COP" }))).toBe(true);
  });

  it("suspends predictions for COP result", () => {
    const play = makePlay({ result: "COP", yardLn: -30, dn: "2", dist: 7, gainLoss: 0 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.yardLn).toBeNull();
    expect(r.dn).toBeNull();
    expect(r.dist).toBeNull();
    expect(r.explanations[0]).toContain("Possession likely changed");
  });

  it("needs modal when COP + next slot O + no filter", () => {
    const play = makePlay({ result: "COP" });
    const r = possessionGuardrail(play, "O", false);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(true);
    expect(r.needsBanner).toBe(false);
  });

  it("needs banner (no modal) when COP + filter active", () => {
    const play = makePlay({ result: "COP" });
    const r = possessionGuardrail(play, "O", true);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(false);
    expect(r.needsBanner).toBe(true);
  });
});

describe("Normalization — comma-spacing variants", () => {
  it("normalizeResult trims and fixes comma spacing", () => {
    expect(normalizeResult("Interception,Def TD")).toBe("Interception, Def TD");
    expect(normalizeResult("Sack,Fumble,Def TD")).toBe("Sack, Fumble, Def TD");
    expect(normalizeResult("  Rush,Safety  ")).toBe("Rush, Safety");
    expect(normalizeResult("Interception,  Def TD")).toBe("Interception, Def TD");
  });

  it("isPossessionChange matches without space after comma", () => {
    expect(isPossessionChange(makePlay({ result: "Interception,Def TD" }))).toBe(true);
  });

  it("isPossessionChange matches with space after comma", () => {
    expect(isPossessionChange(makePlay({ result: "Interception, Def TD" }))).toBe(true);
  });

  it("isPossessionChange matches Sack,Safety variant", () => {
    expect(isPossessionChange(makePlay({ result: "Sack,Safety" }))).toBe(true);
  });

  it("isPossessionChange matches Fumble,Def TD variant", () => {
    expect(isPossessionChange(makePlay({ result: "Fumble,Def TD" }))).toBe(true);
  });

  it("isPossessionChange matches Sack,Fumble,Def TD variant", () => {
    expect(isPossessionChange(makePlay({ result: "Sack,Fumble,Def TD" }))).toBe(true);
  });

  it("prediction suspends for comma-variant result", () => {
    const play = makePlay({ result: "Interception,Def TD", yardLn: -30, dn: "1", dist: 10, gainLoss: 0 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("Possession likely changed");
  });

  it("modal triggers for comma-variant result", () => {
    const play = makePlay({ result: "Fumble,Def TD" });
    const r = possessionGuardrail(play, "O", false);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(true);
  });
});

describe("Complete, Fumble — possession guardrail", () => {
  it("detects possession change for Complete, Fumble", () => {
    expect(isPossessionChange(makePlay({ result: "Complete, Fumble" }))).toBe(true);
  });

  it("needs modal when Complete, Fumble + next slot O + no filter", () => {
    const play = makePlay({ result: "Complete, Fumble" });
    const r = possessionGuardrail(play, "O", false);
    expect(r.possessionChanged).toBe(true);
    expect(r.needsModal).toBe(true);
    expect(r.needsBanner).toBe(false);
  });

  it("suspends predictions for Complete, Fumble", () => {
    const play = makePlay({ result: "Complete, Fumble", yardLn: -30, dn: "2", dist: 7, gainLoss: 5 });
    const r = computePrediction(play, "O", 80);
    expect(r.eligible).toBe(false);
    expect(r.explanations[0]).toContain("Possession likely changed");
  });
});

describe("Interception, Fumble — removed from triggers", () => {
  it("does NOT trigger possession change for Interception, Fumble", () => {
    expect(isPossessionChange(makePlay({ result: "Interception, Fumble" }))).toBe(false);
  });
});
