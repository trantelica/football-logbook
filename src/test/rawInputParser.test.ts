import { describe, it, expect } from "vitest";
import { parseRawInput } from "../engine/rawInputParser";
import { normalizeTranscriptForParse } from "../engine/transcriptNormalize";

/** Helper: normalize then parse (the real pipeline) */
function parseFull(input: string) {
  return parseRawInput(normalizeTranscriptForParse(input));
}

describe("rawInputParser — scaffold acceptance examples", () => {
  it("Example 1: full play with all fields", () => {
    const input = "Down 3 DIST 2 Yard Line -28 Form Trips Play Curly Chair Max GN 12 Passer 1 Receiver 3";
    const { patch } = parseFull(input);
    expect(patch.dn).toBe(3);
    expect(patch.dist).toBe(2);
    expect(patch.yardLn).toBe(-28);
    expect(patch.offForm).toBe("Trips");
    expect(patch.offPlay).toBe("Curly Chair Max");
    expect(patch.gainLoss).toBe(12);
    expect(patch.passer).toBe(1);
    expect(patch.receiver).toBe(3);
  });

  it("Example 2: Form Black Play 26 Punch Gain 4", () => {
    const input = "Form Black Play 26 Punch Gain 4";
    const { patch } = parseFull(input);
    expect(patch.offForm).toBe("Black");
    expect(patch.offPlay).toBe("26 Punch");
    expect(patch.gainLoss).toBe(4);
  });

  it("Example 3: Play Curly Chair Max Passer 1 Receiver 3", () => {
    const input = "Play Curly Chair Max Passer 1 Receiver 3";
    const { patch } = parseFull(input);
    expect(patch.offPlay).toBe("Curly Chair Max");
    expect(patch.passer).toBe(1);
    expect(patch.receiver).toBe(3);
  });

  it("Example 4: yard-line phrase normalization", () => {
    const input = "ball on the 35 hash L";
    const { patch } = parseFull(input);
    expect(patch.yardLn).toBe(35);
    expect(patch.hash).toBe("L");
  });

  it("Example 5: gain/loss phrase normalization (yard gain/loss)", () => {
    const input = "Play Counter 3 yard gain";
    const { patch } = parseFull(input);
    expect(patch.offPlay).toBe("Counter");
    expect(patch.gainLoss).toBe(3);
  });

  it("Example 5b: yard loss", () => {
    const input = "Play Counter 4 yard loss";
    const { patch } = parseFull(input);
    expect(patch.offPlay).toBe("Counter");
    expect(patch.gainLoss).toBe(-4);
  });

  it("Example 6: conservative non-parse — ambiguous 'to 3' should not parse as receiver", () => {
    // "to 3" without RECEIVER anchor should not set receiver
    const input = "PLAY Slant to 3";
    const { patch } = parseFull(input);
    expect(patch.offPlay).toBe("Slant to 3");
    expect(patch.receiver).toBeUndefined();
  });

  it("Example 7: no gain phrase", () => {
    const input = "Play Dive no gain";
    const { patch } = parseFull(input);
    expect(patch.offPlay).toBe("Dive");
    expect(patch.gainLoss).toBe(0);
  });
});

describe("rawInputParser — boundary and stop logic", () => {
  it("offPlay stops at GN/LS anchor", () => {
    const { patch } = parseRawInput("PLAY Sweep Left GN/LS 5");
    expect(patch.offPlay).toBe("Sweep Left");
    expect(patch.gainLoss).toBe(5);
  });

  it("offPlay stops at PASSER anchor", () => {
    const { patch } = parseRawInput("PLAY Mesh PASSER 7");
    expect(patch.offPlay).toBe("Mesh");
    expect(patch.passer).toBe(7);
  });

  it("offPlay stops at RESULT anchor", () => {
    const { patch } = parseRawInput("PLAY Power RESULT Complete");
    expect(patch.offPlay).toBe("Power");
    expect(patch.result).toBe("Complete");
  });

  it("offPlay stops at PENALTY anchor", () => {
    const { patch } = parseRawInput("PLAY Jet Sweep PENALTY O-Holding");
    expect(patch.offPlay).toBe("Jet Sweep");
    expect(patch.penalty).toBe("O-Holding");
  });

  it("offPlay stops at RUSHER anchor", () => {
    const { patch } = parseRawInput("PLAY Draw RUSHER 22");
    expect(patch.offPlay).toBe("Draw");
    expect(patch.rusher).toBe(22);
  });

  it("offPlay stops at RECEIVER anchor", () => {
    const { patch } = parseRawInput("PLAY Comeback RECEIVER 11");
    expect(patch.offPlay).toBe("Comeback");
    expect(patch.receiver).toBe(11);
  });

  it("LOSS anchor negates value", () => {
    const { patch } = parseRawInput("LOSS 3");
    expect(patch.gainLoss).toBe(-3);
  });

  it("GN anchor is positive", () => {
    const { patch } = parseRawInput("GN 8");
    expect(patch.gainLoss).toBe(8);
  });

  it("LS anchor negates value", () => {
    const { patch } = parseRawInput("LS 5");
    expect(patch.gainLoss).toBe(-5);
  });

  it("GAIN anchor is positive", () => {
    const { patch } = parseRawInput("GAIN 12");
    expect(patch.gainLoss).toBe(12);
  });
});

describe("rawInputParser — twoMin isolation from eff", () => {
  it("2MIN Y parses to twoMin, not eff", () => {
    const { patch } = parseRawInput("2MIN Y");
    expect(patch.twoMin).toBe("Y");
    expect(patch.eff).toBeUndefined();
  });

  it("EFF Y parses to eff, not twoMin", () => {
    const { patch } = parseRawInput("EFF Y");
    expect(patch.eff).toBe("Y");
    expect(patch.twoMin).toBeUndefined();
  });
});

describe("rawInputParser — hash conservative", () => {
  it("HASH L parses correctly", () => {
    const { patch } = parseRawInput("HASH L");
    expect(patch.hash).toBe("L");
  });

  it("HASH with invalid value reports unrecognized", () => {
    const { patch, report } = parseRawInput("HASH left");
    expect(patch.hash).toBeUndefined();
    expect(report.some(r => r.anchor === "HASH" && r.status === "unrecognized")).toBe(true);
  });
});
