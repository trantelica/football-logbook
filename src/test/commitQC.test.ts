/**
 * Phase 5C — Commit QC Tests (gainLoss limiting + TD correction)
 * Updated: goalIdx = fieldSize (not fieldSize-1)
 */

import { describe, it, expect } from "vitest";
import { runCommitQC } from "@/engine/commitQC";

describe("runCommitQC", () => {
  it("does not limit gainLoss within distToGoal", () => {
    // yardLn=5, idx=75, distToGoal=80-75=5, gainLoss=3 → no limit
    const r = runCommitQC(5, 3, "Rush", 80);
    expect(r.adjustedGainLoss).toBe(3);
    expect(r.gainLossMessage).toBeNull();
  });

  it("limits gainLoss when exceeding distToGoal", () => {
    // yardLn=5, idx=75, distToGoal=80-75=5, gainLoss=10 → limited to 5
    const r = runCommitQC(5, 10, "Rush", 80);
    expect(r.adjustedGainLoss).toBe(5);
    expect(r.gainLossMessage).toContain("Gain limited to 5");
    expect(r.gainLossMessage).not.toContain("clamp");
  });

  it("detects TD correction needed for Rush at goal line", () => {
    // yardLn=5, idx=75, distToGoal=5, gainLoss=5 → reaches goal
    const r = runCommitQC(5, 5, "Rush", 80);
    expect(r.reachesGoalLine).toBe(true);
    expect(r.correctedResult).toBe("Rush, TD");
  });

  it("detects TD correction needed for Complete at goal line", () => {
    const r = runCommitQC(5, 5, "Complete", 80);
    expect(r.correctedResult).toBe("Complete, TD");
  });

  it("does not flag TD correction when result already has TD", () => {
    const r = runCommitQC(5, 5, "Rush, TD", 80);
    expect(r.correctedResult).toBeNull();
  });

  it("does not limit negative gainLoss", () => {
    const r = runCommitQC(5, -3, "Rush", 80);
    expect(r.adjustedGainLoss).toBe(-3);
    expect(r.gainLossMessage).toBeNull();
  });

  it("returns no-op when yardLn or gainLoss is null", () => {
    expect(runCommitQC(null, 5, "Rush", 80).gainLossMessage).toBeNull();
    expect(runCommitQC(5, null, "Rush", 80).gainLossMessage).toBeNull();
  });

  it("works with 100-yard field", () => {
    // yardLn=5, idx=95, distToGoal=100-95=5, gainLoss=10 → limited to 5
    const r = runCommitQC(5, 10, "Rush", 100);
    expect(r.adjustedGainLoss).toBe(5);
    expect(r.gainLossMessage).toContain("Gain limited to 5");
  });

  it("off-by-one fix: -35 yardLn on 80-yard field → distToGoal=45", () => {
    // yardLn=-35, idx=35 (yardLnToIdx(-35,80)=35), distToGoal=80-35=45
    const r = runCommitQC(-35, 50, "Rush", 80);
    expect(r.adjustedGainLoss).toBe(45);
    expect(r.gainLossMessage).toContain("Gain limited to 45");
  });

  it("gain exactly equal to distToGoal reaches goal line", () => {
    // yardLn=5, idx=75, distToGoal=5, gainLoss=5 → reaches goal
    const r = runCommitQC(5, 5, "Rush", 80);
    expect(r.reachesGoalLine).toBe(true);
  });

  it("gain one less than distToGoal does NOT reach goal line", () => {
    // yardLn=5, idx=75, distToGoal=5, gainLoss=4 → newIdx=79 < 80
    const r = runCommitQC(5, 4, "Rush", 80);
    expect(r.reachesGoalLine).toBe(false);
  });
});
