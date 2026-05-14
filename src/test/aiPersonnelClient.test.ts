import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAiPersonnelProposal } from "../engine/aiPersonnelClient";
import type { PositionAliasMap } from "../engine/positionAliases";

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

const ALIASES: PositionAliasMap = { pos3: "F", pos4: "Z" };

beforeEach(() => {
  invokeMock.mockReset();
});

describe("aiPersonnelClient — Pass 2 fallback contract", () => {
  it("empty observationText → no invocation, returns error", async () => {
    const res = await fetchAiPersonnelProposal({
      observationText: "   ",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(res.patch).toEqual({});
    expect(res.error).toBeTruthy();
  });

  it("alias key F is normalized to canonical pos3", async () => {
    invokeMock.mockResolvedValue({ data: { patch: { F: 3 } }, error: null });
    const res = await fetchAiPersonnelProposal({
      observationText: "3 bumps to F",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({ pos3: 3 });
  });

  it("alias key Z is normalized to canonical pos4", async () => {
    invokeMock.mockResolvedValue({ data: { patch: { Z: 10 } }, error: null });
    const res = await fetchAiPersonnelProposal({
      observationText: "put 10 at Z",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({ pos4: 10 });
  });

  it("non-canonical key (e.g. 'center') is dropped", async () => {
    invokeMock.mockResolvedValue({ data: { patch: { center: 12, posC: 12 } }, error: null });
    const res = await fetchAiPersonnelProposal({
      observationText: "12 takes over at center",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    // "center" is not canonical and not an alias; only posC survives
    expect(res.patch).toEqual({ posC: 12 });
  });

  it("non-integer values are dropped", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { posC: "twelve", posLT: 1.5, posLG: 2 } },
      error: null,
    });
    const res = await fetchAiPersonnelProposal({
      observationText: "x",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({ posLG: 2 });
  });

  it("out-of-range jerseys (>99 or <0) are dropped", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { posC: 100, posLT: -1, posLG: 99, posRT: 0 } },
      error: null,
    });
    const res = await fetchAiPersonnelProposal({
      observationText: "x",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({ posLG: 99, posRT: 0 });
  });

  it("swap proposal passes through when AI returns both canonical sides", async () => {
    invokeMock.mockResolvedValue({
      data: { patch: { posC: 12, pos3: 3 } },
      error: null,
    });
    const res = await fetchAiPersonnelProposal({
      observationText: "swap 3 and 12",
      currentPersonnel: { posC: 3, pos3: 12 },
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({ posC: 12, pos3: 3 });
  });

  it("ambiguous swap → AI returns empty patch → empty result, no error", async () => {
    invokeMock.mockResolvedValue({ data: { patch: {} }, error: null });
    const res = await fetchAiPersonnelProposal({
      observationText: "swap 3 and 12",
      currentPersonnel: { posC: 3 }, // 12 not located
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({});
    expect(res.error).toBeUndefined();
  });

  it("request body includes positionAliases and roster context", async () => {
    invokeMock.mockResolvedValue({ data: { patch: {} }, error: null });
    await fetchAiPersonnelProposal({
      observationText: "Stevens moved to center",
      currentPersonnel: { posC: 3 },
      deterministicPatch: {},
      positionAliases: ALIASES,
      roster: [{ jersey: 12, name: "Stevens" }, { jersey: 44, name: "Carter" }],
    });
    const [, opts] = invokeMock.mock.calls[0];
    expect(opts.body.positionAliases).toEqual(ALIASES);
    expect(opts.body.roster).toEqual([
      { jersey: 12, name: "Stevens" },
      { jersey: 44, name: "Carter" },
    ]);
    expect(opts.body.observationText).toBe("Stevens moved to center");
    expect(opts.body.currentPersonnel).toEqual({ posC: 3 });
  });

  it("invocation error → returns error, empty patch", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await fetchAiPersonnelProposal({
      observationText: "x",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({});
    expect(res.error).toBeTruthy();
  });

  it("server error envelope → propagates error string", async () => {
    invokeMock.mockResolvedValue({ data: { error: "Rate limited, please try again later." }, error: null });
    const res = await fetchAiPersonnelProposal({
      observationText: "x",
      currentPersonnel: {},
      deterministicPatch: {},
      positionAliases: ALIASES,
    });
    expect(res.patch).toEqual({});
    expect(res.error).toMatch(/Rate limited/);
  });
});
