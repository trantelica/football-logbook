/**
 * Phase 5B — Prediction Coach Messages Tests
 */

import { describe, it, expect } from "vitest";
import { toCoachMessage, toCoachMessages } from "@/engine/predictionMessages";

describe("toCoachMessage", () => {
  it("maps 'previous slot not available'", () => {
    const msg = toCoachMessage("Prediction suspended: previous slot not available", 5);
    expect(msg.coach).toBe("Auto-fill paused: Play #5 is not committed yet.");
    expect(msg.technical).toContain("previous slot not available");
  });

  it("maps 'not offensive' for previous play", () => {
    const msg = toCoachMessage("Prediction suspended: previous play is not offensive", 3);
    expect(msg.coach).toBe("Auto-fill paused: Play #3 is not an offensive play.");
  });

  it("maps 'current play is not offensive'", () => {
    const msg = toCoachMessage("Prediction suspended: current play is not offensive", 10);
    expect(msg.coach).toBe("Auto-fill paused: This slot is not offense.");
  });

  it("maps 'penalty present'", () => {
    const msg = toCoachMessage("Prediction suspended: penalty present on previous play", 7);
    expect(msg.coach).toBe("Auto-fill paused: Penalty on Play #7.");
  });

  it("maps 'result missing'", () => {
    const msg = toCoachMessage("Prediction suspended: result missing on previous play", 2);
    expect(msg.coach).toBe("Auto-fill paused: Add a Result for Play #2.");
  });

  it("maps 'gain/loss missing'", () => {
    const msg = toCoachMessage("Prediction suspended: gain/loss missing on previous play", 4);
    expect(msg.coach).toBe("Auto-fill paused: Add Gain/Loss for Play #4.");
  });

  it("maps 'down missing' (partial prediction)", () => {
    const msg = toCoachMessage("Prediction limited: down missing on previous play", 6);
    expect(msg.coach).toBe("Auto-fill limited: Down is missing on Play #6.");
  });

  it("maps 'distance missing' (partial prediction)", () => {
    const msg = toCoachMessage("Prediction limited: distance missing on previous play", 8);
    expect(msg.coach).toBe("Auto-fill limited: Distance is missing on Play #8.");
  });

  it("maps 'yard line missing'", () => {
    const msg = toCoachMessage("Prediction suspended: yard line missing on previous play", 1);
    expect(msg.coach).toBe("Auto-fill paused: Yard Line is missing on Play #1.");
  });

  it("maps goal-line overflow", () => {
    const msg = toCoachMessage("Forward progress exceeded playable field; scoring/safety logic deferred. Prediction suspended.", 12);
    expect(msg.coach).toBe("Auto-fill paused: That play reaches the goal line. (Scoring flow not enabled yet.)");
  });

  it("maps 4th down turnover", () => {
    const msg = toCoachMessage("4th down turnover assumed; possession logic deferred", 15);
    expect(msg.coach).toBe("Auto-fill suggestion: Assuming possession changed after 4th down.");
  });

  it("passes through unknown strings", () => {
    const msg = toCoachMessage("Some future explanation", 1);
    expect(msg.coach).toBe("Some future explanation");
  });
});

describe("toCoachMessages", () => {
  it("maps multiple explanations", () => {
    const msgs = toCoachMessages([
      "Prediction limited: down missing on previous play",
      "Prediction limited: distance missing on previous play",
    ], 9);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].coach).toContain("Down is missing on Play #9");
    expect(msgs[1].coach).toContain("Distance is missing on Play #9");
  });
});
