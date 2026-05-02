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

  it("normalizes 'we have a four pirate motion' into MOTION 4 Pirate", () => {
    expect(normalizeTranscriptForParse("we have a four pirate motion")).toContain("MOTION 4 Pirate");
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

describe("normalizeTranscriptForParse — receiver/passer phrasing additions", () => {
  it("maps 'complete to number 4' to RESULT Complete + RECEIVER 4", () => {
    const out = normalizeTranscriptForParse("complete to number 4");
    expect(out).toContain("RESULT Complete");
    expect(out).toContain("RECEIVER 4");
  });

  it("maps 'complete to #4' to RECEIVER 4", () => {
    expect(normalizeTranscriptForParse("complete to #4")).toContain("RECEIVER 4");
  });

  it("maps 'received by number 4' to RECEIVER 4", () => {
    expect(normalizeTranscriptForParse("received by number 4")).toContain("RECEIVER 4");
  });

  it("maps 'pass by number 0' to PASSER 0", () => {
    expect(normalizeTranscriptForParse("the pass by number 0")).toContain("PASSER 0");
  });

  it("full sentence: 'The pass by number zero was complete to number four for a 12 yard gain'", () => {
    const out = normalizeTranscriptForParse(
      "The pass by number zero was complete to number four for a 12 yard gain",
    );
    expect(out).toContain("PASSER 0");
    expect(out).toContain("RECEIVER 4");
    expect(out).toContain("RESULT Complete");
    expect(out).toContain("GN/LS 12");
  });
});

describe("normalizeTranscriptForParse — motion phrasing coverage", () => {
  it("extracts MOTION from 'we use four pirate motion'", () => {
    expect(normalizeTranscriptForParse("we use four pirate motion")).toContain("MOTION 4 Pirate");
  });
  it("extracts MOTION from 'then we use four pirate motion'", () => {
    expect(normalizeTranscriptForParse("then we use four pirate motion")).toContain("MOTION 4 Pirate");
  });
  it("extracts MOTION from 'and then we use four pirate motion'", () => {
    expect(normalizeTranscriptForParse("and then we use four pirate motion")).toContain("MOTION 4 Pirate");
  });
  it("extracts MOTION from 'we have four pirate motion' (no 'a')", () => {
    expect(normalizeTranscriptForParse("we have four pirate motion")).toContain("MOTION 4 Pirate");
  });
  it("extracts MOTION from 'with four pirate motion'", () => {
    expect(normalizeTranscriptForParse("with four pirate motion")).toContain("MOTION 4 Pirate");
  });
  it("extracts MOTION from 'in four pirate motion'", () => {
    expect(normalizeTranscriptForParse("in four pirate motion")).toContain("MOTION 4 Pirate");
  });
  it("extracts MOTION from 'using four pirate motion'", () => {
    expect(normalizeTranscriptForParse("using four pirate motion")).toContain("MOTION 4 Pirate");
  });
  it("never produces a token-abutted MOTION (e.g. 'useMOTION')", () => {
    const out = normalizeTranscriptForParse("we use four pirate motion");
    expect(out).not.toMatch(/[A-Za-z]MOTION/);
  });

  it("conjunction-heavy: extracts FORM, PLAY, MOTION from a single utterance", () => {
    const out = normalizeTranscriptForParse(
      "We're an orange formation and we run the play 33 dive and then we use four pirate motion",
    );
    expect(out).toContain("FORM");
    expect(out).toContain("PLAY");
    expect(out).toContain("MOTION 4 Pirate");
  });

  it("conjunction-heavy 'and then': extracts MOTION 4 Pirate without losing PLAY", () => {
    const out = normalizeTranscriptForParse(
      "orange formation and we run the play 33 dive and then we use four pirate motion",
    );
    expect(out).toContain("PLAY");
    expect(out).toContain("MOTION 4 Pirate");
  });

  it("preserves prior 'jet motion' single-token coverage", () => {
    expect(normalizeTranscriptForParse("with a jet motion")).toContain("MOTION Jet");
  });

  it("bare '3 Across motion' produces only MOTION (no PLAY contamination)", () => {
    const out = normalizeTranscriptForParse("3 Across motion");
    expect(out).toContain("MOTION 3 Across");
    expect(out).not.toMatch(/\bPLAY\b/);
  });

  it("bare '3 across motion' (lowercase) produces only MOTION", () => {
    const out = normalizeTranscriptForParse("3 across motion");
    expect(out).toContain("MOTION 3 Across");
    expect(out).not.toMatch(/\bPLAY\b/);
  });

  // ── Penalty natural-language normalization ──
  describe("penalty natural-language normalization", () => {
    it("'holding on the offense' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("holding on the offense");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'pass interference on the defense' → PENALTY D-Pass Interference", () => {
      const out = normalizeTranscriptForParse("pass interference on the defense");
      expect(out).toContain("PENALTY D-Pass Interference");
    });

    it("'false start on offense' → PENALTY O-False Start", () => {
      const out = normalizeTranscriptForParse("false start on offense");
      expect(out).toContain("PENALTY O-False Start");
    });

    it("'holding penalty on the offense' (suffix + side) → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("holding penalty on the offense");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'penalty holding on the offense' (anchor + side) → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("penalty holding on the offense");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'penalty on the offense for holding' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("penalty on the offense for holding");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'offensive holding' (side prefix) → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("offensive holding");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'defensive pass interference' → PENALTY D-Pass Interference", () => {
      const out = normalizeTranscriptForParse("defensive pass interference");
      expect(out).toContain("PENALTY D-Pass Interference");
    });

    it("'we had a holding penalty' (no side) → PENALTY Holding (no prefix; governance handles)", () => {
      const out = normalizeTranscriptForParse("we had a holding penalty");
      expect(out).toContain("PENALTY Holding");
      expect(out).not.toContain("PENALTY O-");
    });

    it("'flag on the offense for holding' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("flag on the offense for holding");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("compound: '5 yard gain holding penalty on offense' yields both fields cleanly", () => {
      const out = normalizeTranscriptForParse("5 yard gain holding penalty on offense");
      expect(out).toContain("GN/LS 5");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("does not hijack PLAY anchor with bare 'flag on the play'", () => {
      const out = normalizeTranscriptForParse("flag on the play");
      expect(out).toContain("PLAY");
    });

    it("'the defense was called for offsides on the play' → PENALTY D-Offside", () => {
      const out = normalizeTranscriptForParse("the defense was called for offsides on the play");
      expect(out).toContain("PENALTY D-Offside");
      // Trailing PLAY anchor must remain available — "on the play" is not eaten.
      expect(out).toContain("PLAY");
    });

    it("'offense called for holding' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("offense called for holding");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'called for false start on the offense' → PENALTY O-False Start", () => {
      const out = normalizeTranscriptForParse("called for false start on the offense");
      expect(out).toContain("PENALTY O-False Start");
    });

    it("bare 'called for holding' (no side) → PENALTY Holding", () => {
      const out = normalizeTranscriptForParse("called for holding");
      expect(out).toContain("PENALTY Holding");
      expect(out).not.toContain("PENALTY O-");
      expect(out).not.toContain("PENALTY D-");
    });

    it("'offsides' singularizes to canonical 'Offside'", () => {
      const out = normalizeTranscriptForParse("defensive offsides");
      expect(out).toContain("PENALTY D-Offside");
    });

    // ── Team-perspective phrasings ──
    it("'we were called for delay of game' → PENALTY O-Delay of Game", () => {
      const out = normalizeTranscriptForParse("we were called for delay of game");
      expect(out).toContain("PENALTY O-Delay of Game");
    });

    it("'we were flagged for holding' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("we were flagged for holding");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'we got called for false start' → PENALTY O-False Start", () => {
      const out = normalizeTranscriptForParse("we got called for false start");
      expect(out).toContain("PENALTY O-False Start");
    });

    it("'they were called for offside' → PENALTY D-Offside", () => {
      const out = normalizeTranscriptForParse("they were called for offside");
      expect(out).toContain("PENALTY D-Offside");
    });

    it("'they called holding on us' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("they called holding on us");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'called holding on us' (no leading 'they') → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("called holding on us");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'they called offside on them' → PENALTY D-Offside", () => {
      const out = normalizeTranscriptForParse("they called offside on them");
      expect(out).toContain("PENALTY D-Offside");
    });

    it("'called holding on the other team' → PENALTY D-Holding", () => {
      const out = normalizeTranscriptForParse("called holding on the other team");
      expect(out).toContain("PENALTY D-Holding");
    });

    it("'called holding on our team' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("called holding on our team");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'the other team was called for holding' → PENALTY D-Holding", () => {
      const out = normalizeTranscriptForParse("the other team was called for holding");
      expect(out).toContain("PENALTY D-Holding");
    });

    it("'our team was flagged for holding' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("our team was flagged for holding");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'flag on us for holding' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("flag on us for holding");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'flag on them for offside' → PENALTY D-Offside", () => {
      const out = normalizeTranscriptForParse("flag on them for offside");
      expect(out).toContain("PENALTY D-Offside");
    });

    it("does NOT trigger penalty on bare 'we' or 'them' without infraction", () => {
      const out = normalizeTranscriptForParse("we ran the ball and they stopped them");
      expect(out).not.toContain("PENALTY");
    });

    it("preserves 'on the play' anchor in team-perspective phrasing", () => {
      const out = normalizeTranscriptForParse("they called holding on us on the play");
      expect(out).toContain("PENALTY O-Holding");
      expect(out).toContain("PLAY");
    });

    // ── Round 4: defensive/state-style phrasings + provenance reconciliation ──

    it("'interference was called on the defense' → PENALTY D-Pass Interference", () => {
      const out = normalizeTranscriptForParse("interference was called on the defense");
      expect(out).toContain("PENALTY D-Pass Interference");
    });

    it("'pass interference was called on the defense' → PENALTY D-Pass Interference", () => {
      const out = normalizeTranscriptForParse("pass interference was called on the defense");
      expect(out).toContain("PENALTY D-Pass Interference");
    });

    it("'holding was called on the offense' → PENALTY O-Holding", () => {
      const out = normalizeTranscriptForParse("holding was called on the offense");
      expect(out).toContain("PENALTY O-Holding");
    });

    it("'they were offsides' → PENALTY D-Offside", () => {
      const out = normalizeTranscriptForParse("they were offsides");
      expect(out).toContain("PENALTY D-Offside");
    });

    it("'we were offside' → PENALTY O-Offside", () => {
      const out = normalizeTranscriptForParse("we were offside");
      expect(out).toContain("PENALTY O-Offside");
    });

    it("'the defense was offside' → PENALTY D-Offside", () => {
      const out = normalizeTranscriptForParse("the defense was offside");
      expect(out).toContain("PENALTY D-Offside");
    });

    it("'defensive interference' alias → PENALTY D-Pass Interference", () => {
      const out = normalizeTranscriptForParse("defensive interference");
      expect(out).toContain("PENALTY D-Pass Interference");
    });

    it("'called for interference' alias → PENALTY (Pass Interference, no side)", () => {
      const out = normalizeTranscriptForParse("called for interference");
      expect(out).toContain("PENALTY Pass Interference");
    });

    it("emits RESULT Penalty whenever PENALTY is normalized (provenance reconciliation)", () => {
      const out = normalizeTranscriptForParse("they were offsides");
      expect(out).toContain("PENALTY D-Offside");
      expect(out).toContain("RESULT Penalty");
    });

    it("does NOT prepend RESULT Penalty when transcript already specifies a different RESULT", () => {
      const out = normalizeTranscriptForParse("RESULT Complete PENALTY O-Holding");
      // RESULT should not be added a second time.
      const matches = out.match(/\bRESULT\b/g);
      expect(matches?.length).toBe(1);
    });

    it("does not affect transcripts without PENALTY tokens", () => {
      const out = normalizeTranscriptForParse("3rd and 7");
      expect(out).not.toContain("RESULT Penalty");
    });

    it("bare 'interference' alone (no penalty context) is not coerced", () => {
      // Sanity: word "interference" outside penalty cues stays untouched.
      const out = normalizeTranscriptForParse("there was interference");
      expect(out).not.toContain("PENALTY");
    });
  });

  describe("STT 'in' variant for 'and N' (down/distance)", () => {
    it("'first in 10' → DN 1 DIST 10", () => {
      const out = normalizeTranscriptForParse("first in 10");
      expect(out).toContain("DN 1");
      expect(out).toContain("DIST 10");
    });

    it("'second in 14' → DN 2 DIST 14", () => {
      const out = normalizeTranscriptForParse("second in 14");
      expect(out).toContain("DN 2");
      expect(out).toContain("DIST 14");
    });

    it("preserves original 'first and 10' behavior", () => {
      const out = normalizeTranscriptForParse("first and 10");
      expect(out).toContain("DN 1");
      expect(out).toContain("DIST 10");
    });
  });

  describe("Hash phrase: 'center hash' → HASH M", () => {
    it("'from the center hash' normalizes to HASH M", () => {
      const out = normalizeTranscriptForParse("from the center hash");
      expect(out).toContain("HASH M");
    });
  });

  describe("PASSER: 'is a quarterback' variant", () => {
    it("'number zero is a quarterback' → PASSER 0", () => {
      const out = normalizeTranscriptForParse("number zero is a quarterback");
      expect(out).toContain("PASSER 0");
    });

    it("preserves 'is the quarterback' behavior", () => {
      const out = normalizeTranscriptForParse("number 7 is the quarterback");
      expect(out).toContain("PASSER 7");
    });
  });

  describe("RECEIVER: sentence-leading 'to number N'", () => {
    it("'To number six for a 4 yard loss' → RECEIVER 6", () => {
      const out = normalizeTranscriptForParse("To number six for a 4 yard loss");
      expect(out).toContain("RECEIVER 6");
    });

    it("does NOT convert bare 'to N' phrases", () => {
      // "5 to go" must remain DIST 5, not produce a RECEIVER token.
      const out = normalizeTranscriptForParse("5 to go");
      expect(out).not.toContain("RECEIVER");
    });
  });

  describe("Penalty synonym: 'illegal procedure' → false start", () => {
    it("'illegal procedure on the offense' → PENALTY O-False Start", () => {
      const out = normalizeTranscriptForParse("illegal procedure on the offense");
      expect(out).toContain("PENALTY O-False Start");
    });

    it("bare 'illegal procedure' canonicalizes via penalty rules", () => {
      const out = normalizeTranscriptForParse("there was an illegal procedure penalty");
      expect(out).toContain("PENALTY");
      expect(out).toContain("False Start");
    });
  });

  describe("PLAY marker: 'run the play X'", () => {
    it("'we run the play door open' produces PLAY anchor before 'door open'", () => {
      const out = normalizeTranscriptForParse("we run the play door open");
      expect(out).toContain("PLAY door open");
    });
  });

  describe("formation cue rewrites — anchor leads name", () => {
    it("rewrites 'we are in <Name> formation' so FORM leads", () => {
      expect(normalizeTranscriptForParse("We are in Poison formation")).toBe("FORM Poison");
    });
    it("rewrites 'we are in Purple formation'", () => {
      expect(normalizeTranscriptForParse("we are in Purple formation")).toBe("FORM Purple");
    });
    it("rewrites 'out of <Multi Word> formation'", () => {
      expect(normalizeTranscriptForParse("out of Trips Right formation")).toBe("FORM Trips Right");
    });
    it("rewrites 'formation is <Name>'", () => {
      expect(normalizeTranscriptForParse("formation is Black")).toBe("FORM Black");
    });
    it("handles formation + run-the-play in one phrase", () => {
      const out = normalizeTranscriptForParse("We are in Poison formation and run the play Door Open");
      expect(out).toContain("FORM Poison");
      expect(out).toContain("PLAY Door Open");
    });
  });
});

