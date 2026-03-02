/**
 * Football Engine — Hudl Export Contract (Phase 8.1)
 *
 * Pure functions only. No DB imports. No side effects.
 * Deterministic, frozen header contracts.
 */

import type { PlayRecord, CoachNote } from "./types";
import { playSchema, APP_VERSION } from "./schema";
import { patTryToPlayType, validatePATResult } from "./patEngine";

// ── Constants ──

export const EXPORT_FORMAT_VERSION = "8.1.0";
export const HUDL_PLAYS_FILENAME = "hudl_plays.csv";
export const HUDL_NOTES_FILENAME = "hudl_notes.csv";
export const EXPORT_MANIFEST_FILENAME = "export_manifest.json";

// ── Frozen Header Contracts ──

/**
 * HUDL_HEADERS — Explicit, frozen array matching the current plays CSV contract.
 * Order and contents must NOT drift. Do NOT derive dynamically from playSchema.
 */
export const HUDL_HEADERS: ReadonlyArray<{ key: string; label: string }> = Object.freeze([
  { key: "playNum", label: "PLAY #" },
  { key: "qtr", label: "QTR" },
  { key: "odk", label: "ODK" },
  { key: "series", label: "SERIES" },
  { key: "yardLn", label: "YARD LN" },
  { key: "dn", label: "DN" },
  { key: "dist", label: "DIST" },
  { key: "hash", label: "HASH" },
  { key: "offForm", label: "OFF FORM" },
  { key: "offPlay", label: "OFF PLAY" },
  { key: "motion", label: "MOTION" },
  { key: "result", label: "RESULT" },
  { key: "gainLoss", label: "GN/LS" },
  { key: "twoMin", label: "2 MIN" },
  { key: "rusher", label: "RUSHER" },
  { key: "passer", label: "PASSER" },
  { key: "receiver", label: "RECEIVER" },
  { key: "penalty", label: "PENALTY" },
  { key: "penYards", label: "PEN YARDS" },
  { key: "eff", label: "EFF" },
  { key: "offStrength", label: "OFF STR" },
  { key: "personnel", label: "PERSONNEL" },
  { key: "playType", label: "PLAY TYPE" },
  { key: "playDir", label: "PLAY DIR" },
  { key: "motionDir", label: "MOTION DIR" },
  { key: "patTry", label: "PAT TRY" },
  { key: "posLT", label: "LT" },
  { key: "posLG", label: "LG" },
  { key: "posC", label: "C" },
  { key: "posRG", label: "RG" },
  { key: "posRT", label: "RT" },
  { key: "posX", label: "X" },
  { key: "posY", label: "Y" },
  { key: "pos1", label: "POS 1" },
  { key: "pos2", label: "POS 2" },
  { key: "pos3", label: "POS 3" },
  { key: "pos4", label: "POS 4" },
  { key: "returner", label: "RETURNER" },
  { key: "gradeLT", label: "LT GRADE" },
  { key: "gradeLG", label: "LG GRADE" },
  { key: "gradeC", label: "C GRADE" },
  { key: "gradeRG", label: "RG GRADE" },
  { key: "gradeRT", label: "RT GRADE" },
  { key: "gradeX", label: "X GRADE" },
  { key: "gradeY", label: "Y GRADE" },
  { key: "grade1", label: "1 GRADE" },
  { key: "grade2", label: "2 GRADE" },
  { key: "grade3", label: "3 GRADE" },
  { key: "grade4", label: "4 GRADE" },
] as const);

export const NOTES_HEADERS: ReadonlyArray<{ key: string; label: string }> = Object.freeze([
  { key: "gameId", label: "GAME ID" },
  { key: "playNum", label: "PLAY #" },
  { key: "noteId", label: "NOTE ID" },
  { key: "createdAt", label: "CREATED AT" },
  { key: "updatedAt", label: "UPDATED AT" },
  { key: "text", label: "TEXT" },
  { key: "qtr", label: "QTR" },
  { key: "odk", label: "ODK" },
  { key: "yardLn", label: "YARD LN" },
  { key: "dn", label: "DN" },
  { key: "dist", label: "DIST" },
  { key: "offForm", label: "OFF FORM" },
  { key: "offStrength", label: "OFF STR" },
  { key: "offPlay", label: "OFF PLAY" },
  { key: "motion", label: "MOTION" },
  { key: "result", label: "RESULT" },
  { key: "gainLoss", label: "GN/LS" },
] as const);

// ── CSV Escaping ──

export function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ── Plays CSV ──

/**
 * Generate Hudl-ready plays CSV from committed plays.
 * - Sorts by playNum ascending
 * - null/undefined → empty cell
 * - Never outputs "null" or "undefined" strings
 * - Empty plays → header row only
 * - Does NOT mutate input
 */
export function toHudlCsv(plays: ReadonlyArray<PlayRecord>): string {
  const headerRow = HUDL_HEADERS.map((h) => escapeCSV(h.label)).join(",");

  const sorted = [...plays].sort((a, b) => a.playNum - b.playNum);

  const rows = sorted.map((p) => {
    const rec = p as unknown as Record<string, unknown>;
    return HUDL_HEADERS.map((h) => {
      const val = rec[h.key];
      if (val === null || val === undefined) return "";
      return escapeCSV(String(val));
    }).join(",");
  });

  return [headerRow, ...rows].join("\n");
}

// ── Notes CSV ──

/**
 * Generate notes CSV with derived play context.
 * - Filters soft-deleted notes (deletedAt !== null)
 * - Excludes notes referencing non-existent plays
 * - Joins play context at export time
 * - Sorts by playNum then createdAt
 * - Does NOT mutate input
 */
export function toNotesCsv(
  plays: ReadonlyArray<PlayRecord>,
  notes: ReadonlyArray<CoachNote>
): string {
  const headerRow = NOTES_HEADERS.map((h) => escapeCSV(h.label)).join(",");

  const playMap = new Map<number, PlayRecord>();
  for (const p of plays) playMap.set(p.playNum, p);

  const activeNotes = notes
    .filter((n) => !n.deletedAt && playMap.has(n.playNum))
    .sort((a, b) => a.playNum - b.playNum || a.createdAt.localeCompare(b.createdAt));

  const rows = activeNotes.map((n) => {
    const p = playMap.get(n.playNum)!;
    const vals: Record<string, string> = {
      gameId: n.gameId,
      playNum: String(n.playNum),
      noteId: n.id,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt ?? "",
      text: n.text,
      qtr: p.qtr != null ? String(p.qtr) : "",
      odk: p.odk ?? "",
      yardLn: p.yardLn != null ? String(p.yardLn) : "",
      dn: p.dn != null ? String(p.dn) : "",
      dist: p.dist != null ? String(p.dist) : "",
      offForm: p.offForm ?? "",
      offStrength: p.offStrength ?? "",
      offPlay: p.offPlay ?? "",
      motion: p.motion ?? "",
      result: p.result ?? "",
      gainLoss: p.gainLoss != null ? String(p.gainLoss) : "",
    };
    return NOTES_HEADERS.map((h) => escapeCSV(vals[h.key] ?? "")).join(",");
  });

  return [headerRow, ...rows].join("\n");
}

// ── Preflight Validation ──

export interface ExportError {
  playNumber: number | null;
  field: string;
  message: string;
}

export interface ExportValidationResult {
  valid: boolean;
  errors: ExportError[];
}

/** Build a map of field name → allowedValues from the schema for enum validation */
function getEnumConstraints(): Map<string, ReadonlyArray<string>> {
  const map = new Map<string, ReadonlyArray<string>>();
  for (const f of playSchema) {
    if (f.allowedValues && f.allowedValues.length > 0) {
      map.set(f.name, f.allowedValues);
    }
  }
  return map;
}

/**
 * Validate committed plays for export readiness.
 *
 * Tier A — Always required:
 *   - playNum present, integer, >0
 *   - No duplicate playNums
 *   - Enum fields, if present (non-null), must be in allowedValues
 *
 * Tier B — Conditionally required:
 *   - If patTry present → playType must equal patTryToPlayType(patTry)
 *   - If patTry present OR playType in ["Extra Pt.", "2 Pt."] →
 *     result must be null/blank or one of PAT_RESULTS
 *
 * Tier C — Not enforced:
 *   - Blank values allowed when not applicable
 *   - No offense-only field requirements when odk ≠ "O"
 *   - No lookup default comparison
 */
export function validateForExport(
  plays: ReadonlyArray<PlayRecord>
): ExportValidationResult {
  const errors: ExportError[] = [];
  const enumConstraints = getEnumConstraints();
  const seenPlayNums = new Set<number>();

  for (const p of plays) {
    const pn = p.playNum;

    // Tier A: playNum present, integer, >0
    if (pn == null || !Number.isInteger(pn) || pn <= 0) {
      errors.push({
        playNumber: pn ?? null,
        field: "playNum",
        message: "playNum must be a positive integer",
      });
      continue; // skip further checks for this row
    }

    // Tier A: duplicate playNum
    if (seenPlayNums.has(pn)) {
      errors.push({
        playNumber: pn,
        field: "playNum",
        message: `Duplicate playNum: ${pn}`,
      });
      continue;
    }
    seenPlayNums.add(pn);

    // Tier A: enum validation (only if value is non-null)
    const rec = p as unknown as Record<string, unknown>;
    for (const [fieldName, allowed] of enumConstraints) {
      const val = rec[fieldName];
      if (val != null && val !== "") {
        if (!(allowed as readonly string[]).includes(String(val))) {
          errors.push({
            playNumber: pn,
            field: fieldName,
            message: `Invalid value "${String(val)}" — allowed: ${(allowed as readonly string[]).join(", ")}`,
          });
        }
      }
    }

    // Tier B: patTry → playType consistency
    if (p.patTry != null && p.patTry !== "") {
      const expectedPlayType = patTryToPlayType(p.patTry);
      if (p.playType !== expectedPlayType) {
        errors.push({
          playNumber: pn,
          field: "playType",
          message: `patTry="${p.patTry}" requires playType="${expectedPlayType}", got "${p.playType ?? ""}"`,
        });
      }
    }

    // Tier B: PAT result validation
    const isPATContext =
      (p.patTry != null && p.patTry !== "") ||
      p.playType === "Extra Pt." ||
      p.playType === "2 Pt.";

    if (isPATContext && p.result != null && p.result !== "") {
      const resultErr = validatePATResult(p.result);
      if (resultErr) {
        errors.push({
          playNumber: pn,
          field: "result",
          message: resultErr,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Export Manifest ──

export interface ExportManifest {
  appVersion: string;
  exportFormatVersion: string;
  lookupStoreVersion: string;
  seasonRevision: number;
  exportedAt: string;
  counts: {
    plays: number;
    notes: number;
  };
}

export function buildExportManifest(params: {
  lookupStoreVersion: string;
  seasonRevision: number;
  playCount: number;
  noteCount: number;
}): ExportManifest {
  return {
    appVersion: APP_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    lookupStoreVersion: params.lookupStoreVersion,
    seasonRevision: params.seasonRevision,
    exportedAt: new Date().toISOString(),
    counts: {
      plays: params.playCount,
      notes: params.noteCount,
    },
  };
}

// ── Download Helper ──

export function triggerDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
