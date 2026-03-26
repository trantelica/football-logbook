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

  // --- New scaffold-driven tests ---

  it("normalizes down phrases: '1st down' → 'DN 1'", () => {
    expect(normalizeTranscriptForParse("1st down")).toBe("DN 1");
    expect(normalizeTranscriptForParse("3rd down")).toBe("DN 3");
  });

  it("normalizes distance phrases: '3rd and 7'", () => {
    const out = normalizeTranscriptForParse("3rd down and 7");
    expect(out).toContain("DN 3");
    expect(out).toContain("DIST 7");
  });

  it("normalizes 'N to go' → 'DIST N'", () => {
    expect(normalizeTranscriptForParse("5 to go")).toBe("DIST 5");
  });

  it("normalizes gain/loss phrases", () => {
    expect(normalizeTranscriptForParse("3 yard gain")).toBe("GN/LS 3");
    expect(normalizeTranscriptForParse("4 yard loss")).toBe("GN/LS -4");
    expect(normalizeTranscriptForParse("no gain")).toBe("GN/LS 0");
    expect(normalizeTranscriptForParse("plus 5")).toBe("GN/LS 5");
    expect(normalizeTranscriptForParse("minus 3")).toBe("GN/LS -3");
  });

  it("normalizes 'gain N' and 'loss N'", () => {
    expect(normalizeTranscriptForParse("gain 4")).toBe("GN/LS 4");
    expect(normalizeTranscriptForParse("loss 2")).toBe("GN/LS -2");
  });

  it("normalizes hash phrases", () => {
    expect(normalizeTranscriptForParse("left hash")).toBe("HASH L");
    expect(normalizeTranscriptForParse("right hash")).toBe("HASH R");
    expect(normalizeTranscriptForParse("middle hash")).toBe("HASH M");
  });

  it("normalizes formation phrase", () => {
    expect(normalizeTranscriptForParse("formation Trips")).toBe("FORM Trips");
  });

  it("normalizes two-minute phrases", () => {
    expect(normalizeTranscriptForParse("two minute")).toBe("2MIN");
    expect(normalizeTranscriptForParse("2 minute")).toBe("2MIN");
  });

  it("normalizes actor phrases: QB → PASSER", () => {
    expect(normalizeTranscriptForParse("QB 12")).toBe("PASSER 12");
  });

  it("normalizes yard line phrases", () => {
    expect(normalizeTranscriptForParse("yard line -28")).toBe("YARD -28");
    expect(normalizeTranscriptForParse("ball on the 35")).toBe("YARD 35");
  });

  it("normalizes scaffold acceptance example 1", () => {
    const input = "Down 3 DIST 2 Yard Line -28 Form Trips Play Curly Chair Max GN 12 Passer 1 Receiver 3";
    const out = normalizeTranscriptForParse(input);
    expect(out).toBe("DN 3 DIST 2 YARD -28 FORM Trips PLAY Curly Chair Max GN 12 PASSER 1 RECEIVER 3");
  });

  it("normalizes scaffold acceptance example 2", () => {
    const input = "Form Black Play 26 Punch Gain 4";
    const out = normalizeTranscriptForParse(input);
    expect(out).toBe("FORM Black PLAY 26 Punch GN/LS 4");
  });
});
