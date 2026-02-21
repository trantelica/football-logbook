/**
 * Phase 5A — Incomplete Pass Validation Test
 */

import { describe, it, expect } from "vitest";
import { validateCommitGate } from "@/engine/validation";
import type { CandidateData } from "@/engine/types";

describe("Incomplete Pass + Non-Zero GN/LS Block", () => {
  const base: CandidateData = {
    gameId: "test",
    playNum: "1",
    qtr: "1",
    odk: "O",
    result: "Incomplete",
    gainLoss: "5",
  };

  it("blocks commit when result=Incomplete and gainLoss != 0", () => {
    const r = validateCommitGate(base, 0);
    expect(r.valid).toBe(false);
    expect(r.errors.gainLoss).toContain("Incomplete pass cannot have non-zero gain/loss");
  });

  it("allows commit when result=Incomplete and gainLoss = 0", () => {
    const r = validateCommitGate({ ...base, gainLoss: "0" }, 0);
    // Should not have the incomplete pass error (may have other errors but not this one)
    expect(r.errors.gainLoss).toBeUndefined();
  });

  it("allows commit when result=Rush and gainLoss != 0", () => {
    const r = validateCommitGate({ ...base, result: "Rush", gainLoss: "5" }, 0);
    expect(r.errors.gainLoss).toBeUndefined();
  });
});
