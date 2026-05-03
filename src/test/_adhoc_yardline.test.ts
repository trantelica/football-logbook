import { describe, it, expect } from "vitest";
import { normalizeTranscriptForParse } from "../engine/transcriptNormalize";
import { parseRawInput } from "../engine/rawInputParser";

describe("yardLn signed phrase", () => {
  it("parses '-39 yard line'", () => {
    const s = "It is first down in 10 yards to go from the -39 yard line you're at the mall";
    const n = normalizeTranscriptForParse(s);
    const { patch } = parseRawInput(n);
    expect(patch.yardLn).toBe(-39);
    expect(patch.hash).toBeUndefined();
  });
});
