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

  it("normalizes two-minute phrases to 2MIN Y", () => {
    expect(normalizeTranscriptForParse("two minute")).toBe("2MIN Y");
    expect(normalizeTranscriptForParse("2 minute")).toBe("2MIN Y");
  });

  it("normalizes 'ball is on our N' → YARD -N (negative for our side)", () => {
    expect(normalizeTranscriptForParse("Ball is on our 28")).toContain("YARD -28");
  });

  it("normalizes 'ball is on their N' → YARD N (positive)", () => {
    expect(normalizeTranscriptForParse("ball is on their 40")).toContain("YARD 40");
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

  // --- Actor extraction (Play Results) ---

  it("extracts rusher from 'number four is the ball carrier'", () => {
    expect(normalizeTranscriptForParse("number four is the ball carrier")).toContain("RUSHER 4");
  });

  it("extracts rusher from '#4 is the ball carrier'", () => {
    expect(normalizeTranscriptForParse("#4 is the ball carrier")).toContain("RUSHER 4");
  });

  it("extracts rusher from 'four carried it'", () => {
    expect(normalizeTranscriptForParse("four carried it")).toContain("RUSHER 4");
  });

  it("extracts rusher from 'ball carrier is number 22'", () => {
    expect(normalizeTranscriptForParse("ball carrier is number 22")).toContain("RUSHER 22");
  });

  it("extracts passer from 'number twelve threw it'", () => {
    expect(normalizeTranscriptForParse("number twelve threw it")).toContain("PASSER 12");
  });

  it("extracts passer + receiver from 'twelve passed to eighty eight'", () => {
    const out = normalizeTranscriptForParse("twelve passed to eighty eight");
    expect(out).toContain("PASSER 12");
    expect(out).toContain("RECEIVER 88");
  });

  it("extracts receiver from 'caught by eighty eight'", () => {
    expect(normalizeTranscriptForParse("caught by eighty eight")).toContain("RECEIVER 88");
  });

  it("converts compound number words like 'eighty eight' → 88", () => {
    expect(normalizeTranscriptForParse("RECEIVER eighty eight")).toBe("RECEIVER 88");
  });

  // --- Light dictation safety substitutions ---

  it("treats 'Russia' as 'rusher' when adjacent to a jersey number cue", () => {
    expect(normalizeTranscriptForParse("4 is the russia")).toContain("RUSHER 4");
    expect(normalizeTranscriptForParse("russia 7")).toContain("RUSHER 7");
  });

  it("does not replace 'Russia' outside an actor context", () => {
    // No digit nearby and no "the russia" actor framing → left alone
    expect(normalizeTranscriptForParse("we played in russia last year")).not.toMatch(/RUSHER/);
  });

  // --- Motion phrase normalization ---

  it("normalizes '<digit> across motion' into MOTION token", () => {
    expect(normalizeTranscriptForParse("with a 2 across motion")).toContain("MOTION 2 Across");
    expect(normalizeTranscriptForParse("with a two across motion")).toContain("MOTION 2 Across");
  });

  it("normalizes '<letter> across motion' into MOTION token", () => {
    expect(normalizeTranscriptForParse("Z across motion")).toContain("MOTION Z Across");
  });

  it("normalizes single-token motions like 'jet motion'", () => {
    expect(normalizeTranscriptForParse("with a jet motion")).toContain("MOTION Jet");
  });

  // --- Ordinal-and-distance phrases (Situation) ---

  it("normalizes '4th and 10' → 'DN 4 DIST 10'", () => {
    const out = normalizeTranscriptForParse("4th and 10");
    expect(out).toContain("DN 4");
    expect(out).toContain("DIST 10");
  });

  it("normalizes 'fourth and 10 from their 35 yard line at the right side of the field'", () => {
    const out = normalizeTranscriptForParse(
      "4th and 10 from their 35 yard line at the right side of the field",
    );
    expect(out).toContain("DN 4");
    expect(out).toContain("DIST 10");
    expect(out).toContain("YARD 35");
    expect(out).toContain("HASH R");
  });

  it("normalizes 'first and 10' / 'second and 7' / 'third and 3'", () => {
    expect(normalizeTranscriptForParse("first and 10")).toContain("DN 1");
    expect(normalizeTranscriptForParse("second and 7")).toContain("DN 2");
    expect(normalizeTranscriptForParse("third and 3")).toContain("DN 3");
  });

  // --- Play Results natural-language phrases ---

  it("extracts rusher from 'ball being carried by number 12'", () => {
    expect(normalizeTranscriptForParse("ball being carried by number 12")).toContain("RUSHER 12");
  });

  it("extracts rusher from 'the ball was carried by number 12'", () => {
    expect(normalizeTranscriptForParse("the ball was carried by number 12")).toContain("RUSHER 12");
  });

  it("extracts rusher from 'carried by number 12'", () => {
    expect(normalizeTranscriptForParse("carried by number 12")).toContain("RUSHER 12");
  });

  it("extracts receiver from 'The pass was thrown to number four.'", () => {
    expect(normalizeTranscriptForParse("The pass was thrown to number four.")).toContain("RECEIVER 4");
  });

  it("extracts passer from 'Number 1 is at quarterback.'", () => {
    expect(normalizeTranscriptForParse("Number 1 is at quarterback.")).toContain("PASSER 1");
  });

  it("extracts gainLoss from 'We gained 12 yards.'", () => {
    expect(normalizeTranscriptForParse("We gained 12 yards.")).toContain("GN/LS 12");
  });

  it("extracts full Play Results sentence (receiver + passer + gain)", () => {
    const out = normalizeTranscriptForParse(
      "The pass was thrown to number four. Number 1 is at quarterback. We gained 12 yards.",
    );
    expect(out).toContain("RECEIVER 4");
    expect(out).toContain("PASSER 1");
    expect(out).toContain("GN/LS 12");
  });

  // --- Result mapping (Incomplete / Complete) ---

  it("maps 'incomplete pass' → RESULT Incomplete", () => {
    expect(normalizeTranscriptForParse("incomplete pass")).toContain("RESULT Incomplete");
  });

  it("maps 'the pass was incomplete' → RESULT Incomplete", () => {
    expect(normalizeTranscriptForParse("the pass was incomplete")).toContain("RESULT Incomplete");
  });

  it("maps bare 'incomplete' → RESULT Incomplete", () => {
    expect(normalizeTranscriptForParse("incomplete")).toContain("RESULT Incomplete");
  });

  it("maps 'the pass was caught' → RESULT Complete", () => {
    expect(normalizeTranscriptForParse("the pass was caught")).toContain("RESULT Complete");
  });

  it("maps 'complete pass' → RESULT Complete", () => {
    expect(normalizeTranscriptForParse("complete pass")).toContain("RESULT Complete");
  });

  it("maps 'pass was complete' → RESULT Complete", () => {
    expect(normalizeTranscriptForParse("pass was complete")).toContain("RESULT Complete");
  });

  it("does not double-emit RESULT for already-canonical input", () => {
    const out = normalizeTranscriptForParse("RESULT Incomplete");
    expect(out).toBe("RESULT Incomplete");
  });

  // --- Passer extraction (#0 was the quarterback / N was the quarterback) ---

  it("extracts passer from '#0 was the quarterback'", () => {
    expect(normalizeTranscriptForParse("#0 was the quarterback")).toContain("PASSER 0");
  });

  it("extracts passer from 'number 0 was the quarterback'", () => {
    expect(normalizeTranscriptForParse("number 0 was the quarterback")).toContain("PASSER 0");
  });

  it("extracts passer from '12 is the quarterback'", () => {
    expect(normalizeTranscriptForParse("12 is the quarterback")).toContain("PASSER 12");
  });

  it("extracts passer from 'the quarterback was 7'", () => {
    expect(normalizeTranscriptForParse("the quarterback was 7")).toContain("PASSER 7");
  });
});
