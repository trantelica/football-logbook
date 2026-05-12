/**
 * Play Results TD-evidence guardrail
 *
 * Two narrow guardrails verified here:
 *
 * 1. Defensive facemask phrasing in the transcript normalizer:
 *    - "the defense is flagged for facemask" → "PENALTY D-Face Mask"
 *    - "defense flagged for face mask"       → "PENALTY D-Face Mask"
 *    - "facemask on the defense"             → "PENALTY D-Face Mask"
 *    Parser then resolves penalty = "D-Face Mask".
 *
 * 2. AI TD-evidence guardrail in Pass1SectionPanel (Play Results only):
 *    The downgradeTdResult helper logic mirrors the in-component guardrail.
 *    A TD-bearing AI proposal (e.g. "Rush, TD") must be downgraded to its
 *    base ("Rush") unless the observation text contains an explicit TD cue.
 *    Bare "TD" with no cue is dropped entirely.
 */
import { describe, it, expect } from "vitest";
import { parseRawInput } from "../engine/rawInputParser";
import { normalizeTranscriptForParse } from "../engine/transcriptNormalize";
import { RESULT_VALUES } from "../engine/schema";

function parseFull(input: string) {
  return parseRawInput(normalizeTranscriptForParse(input));
}

// Local mirror of the Pass1SectionPanel guardrail (same logic, same regex).
const TD_CUE_RE =
  /\b(touchdown|tds?|scored?s?|gets?\s+in|got\s+in|into\s+the\s+end\s*zone|end\s*zone|endzone)\b/i;

function downgradeTdResult(val: unknown, observationText: string): unknown {
  if (TD_CUE_RE.test(observationText)) return val;
  if (typeof val !== "string") return val;
  const v = val.trim();
  if (!/(^|,\s*)(Def\s+TD|TD)$/i.test(v)) return val;
  let base = v.replace(/,\s*Def\s+TD$/i, "").replace(/,\s*TD$/i, "");
  if (/^TD$/i.test(base)) base = "";
  base = base.trim();
  if (!base) return null;
  return (RESULT_VALUES as readonly string[]).includes(base) ? base : null;
}

describe("Defensive facemask phrasing → penalty extraction", () => {
  it("'the defense is flagged for facemask' → D-Face Mask", () => {
    const text = "the defense is flagged for facemask";
    const { patch } = parseFull(text);
    expect(patch.penalty).toBe("D-Face Mask");
  });

  it("'defense flagged for face mask' → D-Face Mask", () => {
    const { patch } = parseFull("defense flagged for face mask");
    expect(patch.penalty).toBe("D-Face Mask");
  });

  it("'facemask on the defense' → D-Face Mask", () => {
    const { patch } = parseFull("facemask on the defense");
    expect(patch.penalty).toBe("D-Face Mask");
  });

  it("Full failing-case sentence: gain extracted; penalty extracted; no TD invented by parser", () => {
    const text =
      "number 6 gains 4 yards and then is tackled. The defense is flagged for facemask.";
    const { patch } = parseFull(text);
    expect(patch.gainLoss).toBe(4);
    expect(patch.rusher).toBe(6);
    expect(patch.penalty).toBe("D-Face Mask");
    // Deterministic parser must not assert a TD-bearing result here.
    if (typeof patch.result === "string") {
      expect(patch.result.includes("TD")).toBe(false);
    }
  });
});

describe("TD-evidence guardrail (downgradeTdResult)", () => {
  const tackled =
    "number 6 gains 4 yards and then is tackled. The defense is flagged for facemask.";
  const scores = "number 6 gains 4 yards and scores.";
  const endZone = "number 6 gains 4 yards into the end zone.";
  const tackledShort = "number 6 gains 4 yards and is tackled.";

  it("Case 1: 'tackled' + facemask — Rush, TD downgrades to Rush", () => {
    expect(downgradeTdResult("Rush, TD", tackled)).toBe("Rush");
  });

  it("Case 2: 'scores' — Rush, TD preserved", () => {
    expect(downgradeTdResult("Rush, TD", scores)).toBe("Rush, TD");
  });

  it("Case 3: 'into the end zone' — Rush, TD preserved", () => {
    expect(downgradeTdResult("Rush, TD", endZone)).toBe("Rush, TD");
  });

  it("Case 4: tackled, no TD cue — Rush, TD downgrades to Rush", () => {
    expect(downgradeTdResult("Rush, TD", tackledShort)).toBe("Rush");
  });

  it("Compound TD-bearing values downgrade to valid base", () => {
    expect(downgradeTdResult("Sack, Fumble, Def TD", tackled)).toBe("Sack, Fumble");
    expect(downgradeTdResult("Fumble, Def TD", tackled)).toBe("Fumble");
    expect(downgradeTdResult("Interception, Def TD", tackled)).toBe("Interception");
    expect(downgradeTdResult("Complete, TD", tackled)).toBe("Complete");
    expect(downgradeTdResult("Scramble, TD", tackled)).toBe("Scramble");
    expect(downgradeTdResult("No Good, Def TD", tackled)).toBe("No Good");
  });

  it("Bare 'TD' with no cue is dropped (returns null)", () => {
    expect(downgradeTdResult("TD", tackled)).toBeNull();
  });

  it("Non-TD result values are passed through unchanged", () => {
    expect(downgradeTdResult("Rush", tackled)).toBe("Rush");
    expect(downgradeTdResult("Complete", tackled)).toBe("Complete");
    expect(downgradeTdResult("Penalty", tackled)).toBe("Penalty");
  });

  it("Cue detection: 'touchdown', 'TD', 'scored', 'got in', 'endzone'", () => {
    for (const phrase of [
      "he scored on the play",
      "touchdown on the play",
      "got in for the TD",
      "got in for six",
      "ran it into the endzone",
      "into the end zone",
    ]) {
      expect(TD_CUE_RE.test(phrase), `phrase: ${phrase}`).toBe(true);
    }
  });
});
