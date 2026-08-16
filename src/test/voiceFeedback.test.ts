/**
 * Spoken Feedback — verbosity gating, phrasing, live-mic guard
 */

import { describe, it, expect } from "vitest";
import {
  announce,
  buildAnnouncement,
  shouldAnnounce,
  shouldCue,
  type SpeechEngine,
  type VoiceEvent,
} from "@/engine/voiceFeedback";

function recorderEngine(available = true) {
  const spoken: Array<{ text: string; rate: number }> = [];
  let cancels = 0;
  const engine: SpeechEngine = {
    available,
    cancel: () => void cancels++,
    speak: (text, rate) => void spoken.push({ text, rate }),
  };
  return { engine, spoken, cancelCount: () => cancels };
}

describe("shouldAnnounce", () => {
  it("says nothing at level off", () => {
    expect(shouldAnnounce("committed", "off")).toBe(false);
    expect(shouldAnnounce("blocked", "off")).toBe(false);
  });

  it("speaks every event at level full", () => {
    expect(shouldAnnounce("dictationStopped", "full")).toBe(true);
    expect(shouldAnnounce("proposalUpdated", "full")).toBe(true);
    expect(shouldAnnounce("committed", "full")).toBe(true);
  });

  it("at level critical speaks writes and decisions only", () => {
    expect(shouldAnnounce("committed", "critical")).toBe(true);
    expect(shouldAnnounce("blocked", "critical")).toBe(true);
    expect(shouldAnnounce("lookupInterrupt", "critical")).toBe(true);
    expect(shouldAnnounce("overwriteReview", "critical")).toBe(true);

    expect(shouldAnnounce("dictationStopped", "critical")).toBe(false);
    expect(shouldAnnounce("proposalUpdated", "critical")).toBe(false);
  });
});

describe("shouldCue", () => {
  // Mic-transition tones ride the same setting as speech, but are safe while
  // the mic is live because a tone carries no transcribable words.
  it("is silent only at level off", () => {
    expect(shouldCue("off")).toBe(false);
    expect(shouldCue("critical")).toBe(true);
    expect(shouldCue("full")).toBe(true);
  });
});

describe("buildAnnouncement", () => {
  it("confirms the mic closed", () => {
    expect(buildAnnouncement({ kind: "dictationStopped", sectionTitle: "Situation" })).toBe(
      "stopped",
    );
  });

  it("announces commit with the next play number", () => {
    expect(
      buildAnnouncement({ kind: "committed", playNumber: 12, nextPlayNumber: 13 }),
    ).toBe("committed 12, next 13");
  });

  it("announces a final commit without a next play", () => {
    expect(buildAnnouncement({ kind: "committed", playNumber: 40 })).toBe("committed 40");
  });

  it("speaks only the first blocking reason and counts the rest", () => {
    expect(
      buildAnnouncement({
        kind: "blocked",
        reasons: ["Distance is required", "Hash is required", "Down is required"],
      }),
    ).toBe("blocked. Distance is required. plus 2 more");
  });

  it("speaks a single blocking reason without a remainder", () => {
    expect(buildAnnouncement({ kind: "blocked", reasons: ["Grade must be -3 to 3"] })).toBe(
      "blocked. Grade must be -3 to 3",
    );
  });

  it("degrades to a bare 'blocked' when no reason is supplied", () => {
    expect(buildAnnouncement({ kind: "blocked", reasons: [] })).toBe("blocked");
  });

  it("reports unresolved fields ahead of readiness", () => {
    expect(
      buildAnnouncement({ kind: "proposalUpdated", resolvedCount: 6, unresolvedCount: 2 }),
    ).toBe("2 fields still open");
    expect(
      buildAnnouncement({ kind: "proposalUpdated", resolvedCount: 6, unresolvedCount: 1 }),
    ).toBe("1 field still open");
    expect(
      buildAnnouncement({ kind: "proposalUpdated", resolvedCount: 6, unresolvedCount: 0 }),
    ).toBe("proposal ready");
  });

  it("names the unknown governed value", () => {
    expect(
      buildAnnouncement({ kind: "lookupInterrupt", fieldLabel: "formation", value: "Black" }),
    ).toBe("unknown formation: Black");
  });
});

describe("announce", () => {
  const committed: VoiceEvent = { kind: "committed", playNumber: 5, nextPlayNumber: 6 };

  it("speaks a permitted event and returns the text", () => {
    const { engine, spoken } = recorderEngine();
    const said = announce(committed, { level: "critical", rate: 1.25, micLive: false }, engine);
    expect(said).toBe("committed 5, next 6");
    expect(spoken).toEqual([{ text: "committed 5, next 6", rate: 1.25 }]);
  });

  it("never speaks while the mic is live", () => {
    // Synthesis into a live mic would be transcribed back as coach narration.
    const { engine, spoken } = recorderEngine();
    const said = announce(committed, { level: "full", rate: 1, micLive: true }, engine);
    expect(said).toBeNull();
    expect(spoken).toEqual([]);
  });

  it("stays silent at level off", () => {
    const { engine, spoken } = recorderEngine();
    expect(announce(committed, { level: "off", rate: 1, micLive: false }, engine)).toBeNull();
    expect(spoken).toEqual([]);
  });

  it("suppresses non-critical events at level critical", () => {
    const { engine, spoken } = recorderEngine();
    const said = announce(
      { kind: "dictationStopped", sectionTitle: "Situation" },
      { level: "critical", rate: 1, micLive: false },
      engine,
    );
    expect(said).toBeNull();
    expect(spoken).toEqual([]);
  });

  it("cancels any in-flight speech so stale state is never narrated", () => {
    const { engine, cancelCount } = recorderEngine();
    announce(committed, { level: "full", rate: 1, micLive: false }, engine);
    expect(cancelCount()).toBe(1);
  });

  it("no-ops when the platform has no speech engine", () => {
    const { engine, spoken } = recorderEngine(false);
    expect(announce(committed, { level: "full", rate: 1, micLive: false }, engine)).toBeNull();
    expect(spoken).toEqual([]);
  });
});
