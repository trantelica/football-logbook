import { describe, it, expect } from "vitest";
import { tokenEditDistance, isBoundedSttMatch } from "@/engine/sttEditDistance";

describe("tokenEditDistance", () => {
  it("identity → 0", () => {
    expect(tokenEditDistance("vader", "vader")).toBe(0);
    expect(tokenEditDistance("Vader", "vader")).toBe(0);
  });

  it("single insertion / deletion / substitution / transposition → 1", () => {
    expect(tokenEditDistance("vader", "invader")).toBeLessThanOrEqual(2); // 2 inserts
    expect(tokenEditDistance("punc", "punch")).toBe(1);   // insertion
    expect(tokenEditDistance("punch", "punc")).toBe(1);   // deletion
    expect(tokenEditDistance("punch", "punck")).toBe(1);  // substitution
    expect(tokenEditDistance("acros", "acorss")).toBeLessThanOrEqual(2);
    expect(tokenEditDistance("ab", "ba")).toBe(1);        // transposition
  });

  it("empty inputs → Infinity", () => {
    expect(tokenEditDistance("", "x")).toBe(Infinity);
    expect(tokenEditDistance("x", "")).toBe(Infinity);
  });
});

describe("isBoundedSttMatch", () => {
  it("rejects identical tokens (handled by exact match elsewhere)", () => {
    expect(isBoundedSttMatch("vader", "vader")).toBe(false);
  });

  it("accepts distance-1 regardless of token length", () => {
    expect(isBoundedSttMatch("punc", "punch")).toBe(true);
    expect(isBoundedSttMatch("ab", "ba")).toBe(true);
  });

  it("accepts distance-2 only when canonical length ≥ 6", () => {
    // canonical length 6, distance 2
    expect(isBoundedSttMatch("vader", "invader")).toBe(true); // canonical="invader" (7), d=2
    // canonical length 5, distance 2 → false
    expect(isBoundedSttMatch("acros", "cross")).toBe(false); // canonical="cross" (5), d=2
  });

  it("rejects multi-token inputs", () => {
    expect(isBoundedSttMatch("z across", "z across")).toBe(false);
    expect(isBoundedSttMatch("vader", "in vader")).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(isBoundedSttMatch("", "x")).toBe(false);
    expect(isBoundedSttMatch("x", "")).toBe(false);
  });

  it("rejects distance-3+", () => {
    expect(isBoundedSttMatch("abcd", "wxyz")).toBe(false);
  });
});
