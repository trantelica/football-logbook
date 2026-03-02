import { describe, it, expect } from "vitest";
import {
  buildLookupsExport,
  validateLookupsImport,
  normalizeLookupsImport,
  LOOKUP_TRANSFER_FORMAT_VERSION,
} from "@/engine/lookupTransfer";
import type { LookupTable, RosterEntry } from "@/engine/types";
import { APP_VERSION, SCHEMA_VERSION } from "@/engine/schema";

const makeLookup = (fieldName: string, values: string[]): LookupTable => ({
  seasonId: "s1",
  fieldName,
  values,
  updatedAt: "2025-01-01T00:00:00.000Z",
});

const makeRoster = (jerseyNumber: number, playerName: string): RosterEntry => ({
  seasonId: "s1",
  jerseyNumber,
  playerName,
});

describe("buildLookupsExport", () => {
  it("T1: produces correct keys/meta and does not mutate inputs", () => {
    const tables = [makeLookup("offForm", ["Shotgun"]), makeLookup("offPlay", ["Dive"])];
    const roster = [makeRoster(12, "Tom")];
    const tablesCopy = JSON.parse(JSON.stringify(tables));
    const rosterCopy = JSON.parse(JSON.stringify(roster));

    const result = buildLookupsExport({
      seasonId: "s1",
      seasonRevision: 3,
      lookupTables: tables,
      roster,
      exportedAtISO: "2025-06-01T00:00:00.000Z",
    });

    expect(result.meta.appVersion).toBe(APP_VERSION);
    expect(result.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.meta.exportFormatVersion).toBe(LOOKUP_TRANSFER_FORMAT_VERSION);
    expect(result.meta.seasonId).toBe("s1");
    expect(result.meta.seasonRevision).toBe(3);
    expect(result.meta.exportedAt).toBe("2025-06-01T00:00:00.000Z");
    expect(result.lookups.offForm).toBeTruthy();
    expect(result.lookups.offPlay).toBeTruthy();
    expect(result.lookups.motion).toBeNull();
    expect(result.roster).toHaveLength(1);

    // No mutation
    expect(JSON.parse(JSON.stringify(tables))).toEqual(tablesCopy);
    expect(JSON.parse(JSON.stringify(roster))).toEqual(rosterCopy);
  });

  it("T2: selects correct tables by fieldName", () => {
    const tables = [
      makeLookup("offForm", ["I-Form"]),
      makeLookup("motion", ["Jet"]),
      makeLookup("offPlay", ["Sweep"]),
    ];

    const result = buildLookupsExport({
      seasonId: "s1",
      seasonRevision: 1,
      lookupTables: tables,
      roster: null,
    });

    expect(result.lookups.offForm!.values).toEqual(["I-Form"]);
    expect(result.lookups.offPlay!.values).toEqual(["Sweep"]);
    expect(result.lookups.motion!.values).toEqual(["Jet"]);
    expect(result.roster).toBeNull();
  });

  it("deep-clones entryAttributes so export shares no references", () => {
    const attrs = { Shotgun: { personnel: "11" } };
    const table: LookupTable = {
      seasonId: "s1",
      fieldName: "offForm",
      values: ["Shotgun"],
      updatedAt: "2025-01-01T00:00:00.000Z",
      entryAttributes: attrs,
    };

    const result = buildLookupsExport({
      seasonId: "s1",
      seasonRevision: 1,
      lookupTables: [table],
      roster: null,
    });

    // Mutate the export — original must be unaffected
    (result.lookups.offForm!.entryAttributes as any)["Shotgun"].personnel = "CHANGED";
    expect(attrs["Shotgun"].personnel).toBe("11");
  });

  it("fills updatedAt when missing from source table", () => {
    const table: LookupTable = {
      seasonId: "s1",
      fieldName: "offForm",
      values: ["Pistol"],
      updatedAt: "",
    };

    const result = buildLookupsExport({
      seasonId: "s1",
      seasonRevision: 1,
      lookupTables: [table],
      roster: null,
    });

    expect(result.lookups.offForm!.updatedAt).toBeTruthy();
    expect(typeof result.lookups.offForm!.updatedAt).toBe("string");
  });

  it("T2: selects correct tables by fieldName", () => {
    const tables = [
      makeLookup("offForm", ["I-Form"]),
      makeLookup("motion", ["Jet"]),
      makeLookup("offPlay", ["Sweep"]),
    ];

    const result = buildLookupsExport({
      seasonId: "s1",
      seasonRevision: 1,
      lookupTables: tables,
      roster: null,
    });

    expect(result.lookups.offForm!.values).toEqual(["I-Form"]);
    expect(result.lookups.offPlay!.values).toEqual(["Sweep"]);
    expect(result.lookups.motion!.values).toEqual(["Jet"]);
    expect(result.roster).toBeNull();
  });
});

describe("validateLookupsImport", () => {
  const validPayload = {
    meta: { seasonId: "s1", seasonRevision: 2 },
    lookups: {
      offForm: { fieldName: "offForm", values: ["Shotgun"] },
      offPlay: null,
      motion: null,
    },
    roster: null,
  };

  it("T3: rejects missing meta/lookups", () => {
    expect(validateLookupsImport({}).valid).toBe(false);
    expect(validateLookupsImport({ meta: null, lookups: null }).valid).toBe(false);
    expect(validateLookupsImport({ meta: {}, lookups: {} }).errors.some(e => e.path === "meta.seasonId")).toBe(true);
  });

  it("T4: rejects table with mismatched fieldName", () => {
    const bad = {
      ...validPayload,
      lookups: {
        offForm: { fieldName: "WRONG", values: [] },
        offPlay: null,
        motion: null,
      },
    };
    const result = validateLookupsImport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === "lookups.offForm.fieldName")).toBe(true);
  });

  it("T5: accepts null tables and null roster", () => {
    const result = validateLookupsImport(validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects roster entries with invalid types", () => {
    const bad = {
      ...validPayload,
      roster: [{ jerseyNumber: "not-a-number", playerName: 123 }],
    };
    const result = validateLookupsImport(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts valid roster entries", () => {
    const good = {
      ...validPayload,
      roster: [{ jerseyNumber: 12, playerName: "Tom" }],
    };
    expect(validateLookupsImport(good).valid).toBe(true);
  });
});

describe("normalizeLookupsImport", () => {
  it("T6: returns expected cleaned output with null normalization", () => {
    const payload = {
      meta: { seasonId: "s1" },
      lookups: {
        offForm: { seasonId: "s1", fieldName: "offForm", values: ["Shotgun"], updatedAt: "x" },
        offPlay: null,
        motion: null,
      },
      roster: [{ seasonId: "s1", jerseyNumber: 7, playerName: "Ben" }],
      extraKey: "ignored",
    };

    const result = normalizeLookupsImport(payload);
    expect(result.lookups.offForm).toBeTruthy();
    expect(result.lookups.offForm!.values).toEqual(["Shotgun"]);
    expect(result.lookups.offPlay).toBeNull();
    expect(result.lookups.motion).toBeNull();
    expect(result.roster).toHaveLength(1);
    expect(result.roster![0].jerseyNumber).toBe(7);

    // Verify no mutation of original
    expect((payload.lookups.offForm as any).values).toEqual(["Shotgun"]);
  });
});
