import { describe, it, expect } from "vitest";
import {
  normalizeGovernedCandidate,
  normalizeGovernedCandidateForField,
} from "../engine/governedValueNormalize";

describe("normalizeGovernedCandidate", () => {
  it("title-cases simple lowercase token", () => {
    expect(normalizeGovernedCandidate("green")).toBe("Green");
  });
  it("converts number-word + words to digits + Title Case", () => {
    expect(normalizeGovernedCandidate("three jet sweep")).toBe("3 Jet Sweep");
  });
  it("converts 'two across' → '2 Across'", () => {
    expect(normalizeGovernedCandidate("two across")).toBe("2 Across");
  });
  it("converts compound number words: 'twenty six punch' → '26 Punch'", () => {
    expect(normalizeGovernedCandidate("twenty six punch")).toBe("26 Punch");
  });
  it("preserves single uppercase letter token like 'Z'", () => {
    expect(normalizeGovernedCandidate("Z across")).toBe("Z Across");
  });
  it("leaves digit tokens alone", () => {
    expect(normalizeGovernedCandidate("3 jet sweep")).toBe("3 Jet Sweep");
  });
  it("collapses whitespace", () => {
    expect(normalizeGovernedCandidate("  green   formation ")).toBe("Green Formation");
  });
  it("returns empty for null/empty", () => {
    expect(normalizeGovernedCandidate(null)).toBe("");
    expect(normalizeGovernedCandidate("")).toBe("");
    expect(normalizeGovernedCandidate("   ")).toBe("");
  });
});
