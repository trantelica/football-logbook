import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTranscriptForParse } from "../engine/transcriptNormalize";
import { parseRawInput } from "../engine/rawInputParser";
import { filterAiProposal } from "../engine/aiEnrichment";
import type { CandidateData } from "../engine/types";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
import { fetchAiProposal } from "../engine/aiEnrichClient";

describe("defensive yard-line dictation", () => {
  it.each([
    ["their 25 yard line", -25], ["on their 25", -25],
    ["ball is on the opponent's thirty two", -32],
    ["our 25 yard line", 25], ["at our own 25", 25],
    ["from our 25 yard line", 25], ["own 25 yard line", 25],
    ["minus 23 yard line", -23], ["-23 yard line", -23],
    ["YARD -23", -23], ["YARD 23", 23],
  ])("%s is offense-relative %i on defense", (text, yardLn) => {
    expect(parseRawInput(normalizeTranscriptForParse(text, { odk: "D" })).patch.yardLn).toBe(yardLn);
  });
  it("preserves offensive conventions and unrelated gain/loss", () => {
    expect(parseRawInput(normalizeTranscriptForParse("on their 25")).patch.yardLn).toBe(25);
    expect(parseRawInput(normalizeTranscriptForParse("on our 25")).patch.yardLn).toBe(-25);
    expect(parseRawInput(normalizeTranscriptForParse("third and 7 on their 25, loss 3", { odk: "D" })).patch)
      .toMatchObject({ dn: 3, dist: 7, yardLn: -25, gainLoss: -3 });
  });
});

describe("Pass 4 reviewed AI fallback", () => {
  beforeEach(() => invoke.mockReset());
  it("scopes defensive call requests and preserves new-value review metadata", async () => {
    invoke.mockResolvedValue({ data: { proposal: {
      defFront: { value: "Bear", matchType: "candidate_new" },
      coverage: { value: "Cover 3", matchType: "exact" },
      offPlay: "Dive", playType: "Run", eff: "Y", tackler1: 32,
    } }, error: null });
    const result = await fetchAiProposal({ odk: "D" }, 4, {
      activeSection: "defCall", observationText: "We crowd the line in Bear with Cover 3 behind it",
      lookupValues: new Map([["defFront", ["Even"]], ["coverage", ["Cover 3"]]]),
    });
    expect(invoke.mock.calls[0][1].body.unresolvedFields).toEqual(expect.arrayContaining(["defFront", "coverage", "blitz", "defStrength"]));
    expect(result.proposal).toEqual({ defFront: { value: "Bear", matchType: "candidate_new" }, coverage: { value: "Cover 3", matchType: "exact" } });
  });
  it("sends defense location perspective and drops same-run Parse values", async () => {
    invoke.mockResolvedValue({ data: { proposal: { yardLn: 25, hash: "R" } }, error: null });
    const result = await fetchAiProposal({ odk: "D", yardLn: -25 }, 4, {
      activeSection: "defSituation", observationText: "their 25 on the far right stripe",
      deterministicParseFields: new Set(["yardLn"]), fieldSize: 100,
    });
    expect(result.proposal).toEqual({ hash: "R" });
    const body = invoke.mock.calls[0][1].body;
    expect(body.unresolvedFields).not.toContain("yardLn");
    expect(body.locationMapping).toBeUndefined();
    invoke.mockResolvedValue({ data: { proposal: { yardLn: -25 } }, error: null });
    await fetchAiProposal({ odk: "D" }, 4, { activeSection: "defSituation", observationText: "opponents have it at their twenty five", fieldSize: 100 });
    expect(invoke.mock.calls[1][1].body.locationMapping.perspective).toBe("defense");
  });
  it("keeps defensive AI out of offense", async () => {
    const { safePatch } = filterAiProposal({ proposal: { defFront: "Bear", retYards: 8, tackler1: 44 }, candidate: { odk: "O" } as CandidateData, unresolvedFields: new Set(["defFront", "retYards", "tackler1"]) });
    expect(safePatch).toEqual({});
  });
  it("offers playmaker AI only on the Playmakers card, as integer jerseys", async () => {
    invoke.mockResolvedValue({ data: { proposal: { tackler1: 44, interceptedBy: "21", dawg: "Reed", pbr: 7.5 } }, error: null });
    const result = await fetchAiProposal({ odk: "D" }, 4, {
      activeSection: "defPlaymakers", observationText: "tackle by 44, intercepted by 21",
    });
    const body = invoke.mock.calls[0][1].body;
    expect(body.unresolvedFields).toEqual(expect.arrayContaining(["tackler1", "interceptedBy", "dawg"]));
    // Client passes the raw response through; the transaction filter coerces/drops.
    const { safePatch } = filterAiProposal({
      proposal: result.proposal,
      candidate: { odk: "D" } as CandidateData,
      unresolvedFields: new Set(["tackler1", "interceptedBy", "dawg", "pbr"]),
    });
    expect(safePatch).toEqual({ tackler1: 44, interceptedBy: 21 }); // names and floats dropped
  });
  it("drops playmaker proposals outside the Playmakers card and on offense", async () => {
    invoke.mockResolvedValue({ data: { proposal: { tackler1: 44 } }, error: null });
    const wrongSection = await fetchAiProposal({ odk: "D" }, 4, {
      activeSection: "defResults", observationText: "tackle by 44 on the gain of 3",
    });
    expect(wrongSection.proposal).toEqual({});
    const offense = await fetchAiProposal({ odk: "O" }, 1, {
      activeSection: "playResults", observationText: "tackle by 44",
    });
    expect(offense.proposal).toEqual({});
  });
  it("does not invent zero return yards for an incomplete pass", async () => {
    invoke.mockResolvedValue({ data: { proposal: { retYards: 0 } }, error: null });
    const result = await fetchAiProposal({ odk: "D", result: "Incomplete", gainLoss: 0 }, 4, {
      activeSection: "defResults", observationText: "Incomplete pass GN/LS 0",
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(result.proposal).toEqual({});
  });
  it("allows explicitly narrated return distances only", async () => {
    invoke.mockResolvedValue({ data: { proposal: { retYards: 12 } }, error: null });
    const result = await fetchAiProposal({ odk: "D", result: "Interception", gainLoss: 0 }, 4, {
      activeSection: "defResults", observationText: "Interception returned for twelve yards",
    });
    expect(invoke.mock.calls[0][1].body.unresolvedFields).toContain("retYards");
    expect(result.proposal.retYards).toBe(12);
  });
  it("rejects invalid defensive enums/return distances and reports resolved collisions", () => {
    const candidate = { odk: "D", defFront: "Even" } as CandidateData;
    const result = filterAiProposal({ candidate, unresolvedFields: new Set(["defStrength", "retYards"]), proposal: { defFront: "Bear", defStrength: "Middle", retYards: -8 } });
    expect(result.safePatch).toEqual({});
    expect(result.collisions).toHaveLength(1);
    expect(candidate.defFront).toBe("Even");
  });
  it("leaves parsed values intact on service failure", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("offline") });
    const candidate = { odk: "D", yardLn: -25 };
    const result = await fetchAiProposal(candidate, 4, { activeSection: "defSituation", observationText: "their 25 far right stripe", deterministicParseFields: new Set(["yardLn"]) });
    expect(result.proposal).toEqual({});
    expect(result.error).toBeTruthy();
    expect(candidate.yardLn).toBe(-25);
  });
});