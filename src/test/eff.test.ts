/**
 * Phase 5C — EFF Computation Tests
 */

import { describe, it, expect } from "vitest";
import { computeEff } from "@/engine/eff";

describe("computeEff", () => {
  it("returns Y when result contains TD", () => {
    expect(computeEff({ result: "Rush, TD", gainLoss: 0, dn: 3, dist: 10, penalty: null })).toBe("Y");
    expect(computeEff({ result: "Complete, TD", gainLoss: 0, dn: 1, dist: 10, penalty: null })).toBe("Y");
  });

  it("returns Y when gainLoss >= dist (first down)", () => {
    expect(computeEff({ result: "Rush", gainLoss: 10, dn: 1, dist: 10, penalty: null })).toBe("Y");
    expect(computeEff({ result: "Rush", gainLoss: 11, dn: 2, dist: 10, penalty: null })).toBe("Y");
  });

  it("returns Y on 1st down with >= 50% dist", () => {
    expect(computeEff({ result: "Rush", gainLoss: 5, dn: 1, dist: 10, penalty: null })).toBe("Y");
    expect(computeEff({ result: "Rush", gainLoss: 4, dn: 1, dist: 10, penalty: null })).toBe("N");
  });

  it("returns Y on 2nd down with >= 40% dist", () => {
    expect(computeEff({ result: "Rush", gainLoss: 4, dn: 2, dist: 10, penalty: null })).toBe("Y");
    expect(computeEff({ result: "Rush", gainLoss: 3, dn: 2, dist: 10, penalty: null })).toBe("N");
  });

  it("returns N on 3rd down without first down or TD", () => {
    expect(computeEff({ result: "Rush", gainLoss: 8, dn: 3, dist: 10, penalty: null })).toBe("N");
  });

  it("returns N on 4th down without first down or TD", () => {
    expect(computeEff({ result: "Rush", gainLoss: 9, dn: 4, dist: 10, penalty: null })).toBe("N");
  });

  it("returns null when penalty present", () => {
    expect(computeEff({ result: "Rush", gainLoss: 10, dn: 1, dist: 10, penalty: "O-Holding" })).toBeNull();
  });

  it("returns null when result missing", () => {
    expect(computeEff({ result: null, gainLoss: 10, dn: 1, dist: 10, penalty: null })).toBeNull();
  });

  it("returns null when dn/dist/gainLoss missing (non-TD)", () => {
    expect(computeEff({ result: "Rush", gainLoss: null, dn: 1, dist: 10, penalty: null })).toBeNull();
    expect(computeEff({ result: "Rush", gainLoss: 5, dn: null, dist: 10, penalty: null })).toBeNull();
    expect(computeEff({ result: "Rush", gainLoss: 5, dn: 1, dist: null, penalty: null })).toBeNull();
  });

  it("returns Y for TD even when dn/dist/gainLoss missing", () => {
    expect(computeEff({ result: "TD", gainLoss: null, dn: null, dist: null, penalty: null })).toBe("Y");
  });
});
