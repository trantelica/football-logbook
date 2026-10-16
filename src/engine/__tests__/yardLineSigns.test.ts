import { describe, it, expect } from "vitest";
import { normalizeTranscriptForParse } from "../transcriptNormalize";
import { parseRawInput } from "../rawInputParser";

const yl = (s: string) => parseRawInput(normalizeTranscriptForParse(s)).patch.yardLn;

describe("yard line sign handling", () => {
  it.each([
    ["ball on the -23 yard line", -23],
    ["-23 yard line", -23],
    ["we are at the -23 yard line", -23],
    ["minus 23 yard line", -23],
    ["negative twenty three yard line", -23],
    ["our 23 yard line", -23],
    ["on our own 23", -23],
    ["at our 40", -40],
    ["their 23 yard line", 23],
    ["on their 30", 30],
    ["the opponent's 30 yard line", 30],
    ["from our 20 yard line, first and 10", -20],
  ])("%s -> %s", (text, expected) => {
    expect(yl(text)).toBe(expected);
  });

  it("does not infer a side for a bare yard line", () => {
    expect(yl("on the 23 yard line")).toBeUndefined();
  });

  it("minus 23 yard line is not read as a loss", () => {
    const p = parseRawInput(normalizeTranscriptForParse("minus 23 yard line")).patch;
    expect(p.gainLoss).toBeUndefined();
  });
});
