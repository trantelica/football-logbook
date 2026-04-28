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

describe("normalizeGovernedCandidateForField — cue-word stripping", () => {
  it("offForm strips trailing 'formation'", () => {
    expect(normalizeGovernedCandidateForField("Orange formation", "offForm")).toBe("Orange");
  });
  it("offForm strips trailing 'form'", () => {
    expect(normalizeGovernedCandidateForField("orange form", "offForm")).toBe("Orange");
  });
  it("offForm strips leading filler 'we are in'", () => {
    expect(normalizeGovernedCandidateForField("we are in orange formation", "offForm")).toBe("Orange");
  });
  it("offPlay strips leading 'play'", () => {
    expect(normalizeGovernedCandidateForField("play 33 dive", "offPlay")).toBe("33 Dive");
  });
  it("offPlay strips trailing 'play'", () => {
    expect(normalizeGovernedCandidateForField("33 dive play", "offPlay")).toBe("33 Dive");
  });
  it("offPlay strips 'we run the play'", () => {
    expect(normalizeGovernedCandidateForField("we run the play 33 dive", "offPlay")).toBe("33 Dive");
  });
  it("offPlay strips 'called'", () => {
    expect(normalizeGovernedCandidateForField("called 26 punch", "offPlay")).toBe("26 Punch");
  });
  it("motion strips trailing 'motion'", () => {
    expect(normalizeGovernedCandidateForField("four pirate motion", "motion")).toBe("4 Pirate");
  });
  it("motion strips 'we have a … motion'", () => {
    expect(normalizeGovernedCandidateForField("we have a four pirate motion", "motion")).toBe("4 Pirate");
  });
  it("preserves number-word and title-case normalization", () => {
    expect(normalizeGovernedCandidateForField("twenty six punch play", "offPlay")).toBe("26 Punch");
  });
  it("falls back to generic if all tokens are cue words", () => {
    // edge case: nothing left after strip → use generic on original
    expect(normalizeGovernedCandidateForField("formation", "offForm")).toBe("Formation");
  });
  it("non-governed field falls through to generic normalize", () => {
    expect(normalizeGovernedCandidateForField("orange formation", "someOtherField")).toBe("Orange Formation");
  });
});
