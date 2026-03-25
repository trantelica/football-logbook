import { describe, it, expect } from "vitest";
import { normalizeTranscriptForParse } from "../engine/transcriptNormalize";

describe("normalizeTranscriptForParse", () => {
  it("converts number words to digits", () => {
    expect(normalizeTranscriptForParse("DN one DIST ten")).toBe("DN 1 DIST 10");
  });

  it("normalizes GN/LS variants", () => {
    expect(normalizeTranscriptForParse("GN slash LS 3")).toBe("GN/LS 3");
    expect(normalizeTranscriptForParse("GN - LS 5")).toBe("GN/LS 5");
    expect(normalizeTranscriptForParse("gn / ls 2")).toBe("GN/LS 2");
  });

  it("handles YARD with dash spacing", () => {
    expect(normalizeTranscriptForParse("yard - 20")).toBe("YARD -20");
  });

  it("uppercases anchors", () => {
    expect(normalizeTranscriptForParse("dn 1 dist 10 hash M")).toBe("DN 1 DIST 10 HASH M");
  });

  it("replaces STT artifacts", () => {
    expect(normalizeTranscriptForParse("GN dash LS")).toContain("GN/LS");
  });

  it("handles full acceptance example", () => {
    const input = "DN one DIST 10 yard -20 hash M form black play 26 punch";
    const out = normalizeTranscriptForParse(input);
    expect(out).toBe("DN 1 DIST 10 YARD -20 HASH M FORM black PLAY 26 punch");
  });
});
