/**
 * Football Engine — Deterministic Raw Input Parser
 * 
 * Anchor-based shorthand grammar. No inference, no synonyms, no fuzzy matching.
 * Exact case-insensitive matching only. Returns parse report for ambiguous/unrecognized tokens.
 */

import { RESULT_VALUES, PENALTY_VALUES, HASH_VALUES, EFF_VALUES } from "./schema";

export interface ParseReportEntry {
  anchor: string;
  rawValue: string;
  status: "matched" | "ambiguous" | "unrecognized";
  matchedValue?: string;
}

export interface ParseResult {
  patch: Record<string, unknown>;
  report: ParseReportEntry[];
}

/** All recognized anchors in priority order (longer anchors first to avoid partial matches) */
const ANCHORS = [
  "GN/LS", "GNLS", "PENYARDS", "2MIN",
  "PENALTY", "RESULT", "MOTION", "FORM", "PLAY",
  "RECEIVER", "RUSHER", "PASSER",
  "YARD", "HASH", "DIST", "DN", "EFF",
] as const;

const ANCHOR_REGEX = new RegExp(
  `\\b(${ANCHORS.join("|")})\\b`,
  "gi"
);

/** Map anchor keyword to field name */
const ANCHOR_FIELD_MAP: Record<string, string> = {
  "DN": "dn",
  "DIST": "dist",
  "YARD": "yardLn",
  "HASH": "hash",
  "RESULT": "result",
  "GN/LS": "gainLoss",
  "GNLS": "gainLoss",
  "FORM": "offForm",
  "PLAY": "offPlay",
  "MOTION": "motion",
  "RUSHER": "rusher",
  "PASSER": "passer",
  "RECEIVER": "receiver",
  "PENALTY": "penalty",
  "PENYARDS": "penYards",
  "EFF": "eff",
  "2MIN": "twoMin",
};

/** Integer fields — parse next token as integer */
const INTEGER_FIELDS = new Set(["dn", "dist", "yardLn", "gainLoss", "rusher", "passer", "receiver", "penYards"]);

/** Enum fields with exact-match validation against allowed values */
const ENUM_FIELD_VALUES: Record<string, readonly string[]> = {
  hash: HASH_VALUES,
  result: RESULT_VALUES,
  penalty: PENALTY_VALUES,
  eff: EFF_VALUES,
  twoMin: EFF_VALUES,
};

/** Multi-word fields — consume all tokens until next anchor */
const MULTI_WORD_FIELDS = new Set(["result", "penalty", "offForm", "offPlay", "motion"]);

/**
 * Parse raw input text into a candidate patch using anchor-based extraction.
 * Only exact case-insensitive matching for enum fields.
 */
export function parseRawInput(text: string): ParseResult {
  const patch: Record<string, unknown> = {};
  const report: ParseReportEntry[] = [];

  if (!text || !text.trim()) return { patch, report };

  // Find all anchor positions
  const anchors: { anchor: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  ANCHOR_REGEX.lastIndex = 0;
  while ((match = ANCHOR_REGEX.exec(text)) !== null) {
    anchors.push({ anchor: match[1].toUpperCase(), index: match.index });
  }

  if (anchors.length === 0) return { patch, report };

  // Extract value segments between anchors
  for (let i = 0; i < anchors.length; i++) {
    const { anchor } = anchors[i];
    const anchorEnd = anchors[i].index + anchor.length;
    const nextAnchorStart = i + 1 < anchors.length ? anchors[i + 1].index : text.length;
    const rawValue = text.slice(anchorEnd, nextAnchorStart).trim();

    // Normalize anchor (GNLS -> GN/LS equivalent)
    const normalizedAnchor = anchor === "GNLS" ? "GN/LS" : anchor;
    const fieldName = ANCHOR_FIELD_MAP[normalizedAnchor] ?? ANCHOR_FIELD_MAP[anchor];
    if (!fieldName) continue;

    if (!rawValue) {
      report.push({ anchor: normalizedAnchor, rawValue: "", status: "unrecognized" });
      continue;
    }

    // Integer fields
    if (INTEGER_FIELDS.has(fieldName)) {
      const parsed = parseInt(rawValue.split(/\s/)[0], 10);
      if (!isNaN(parsed)) {
        patch[fieldName] = fieldName === "yardLn" || fieldName === "gainLoss" ? parsed : parsed;
        report.push({ anchor: normalizedAnchor, rawValue, status: "matched", matchedValue: String(parsed) });
      } else {
        report.push({ anchor: normalizedAnchor, rawValue, status: "unrecognized" });
      }
      continue;
    }

    // Enum fields with exact matching
    const allowedValues = ENUM_FIELD_VALUES[fieldName];
    if (allowedValues) {
      const valueLower = rawValue.toLowerCase();
      // For multi-word fields, use the full consumed segment
      if (MULTI_WORD_FIELDS.has(fieldName)) {
        const exactMatches = allowedValues.filter(
          (v) => v.toLowerCase() === valueLower
        );
        if (exactMatches.length === 1) {
          patch[fieldName] = exactMatches[0];
          report.push({ anchor: normalizedAnchor, rawValue, status: "matched", matchedValue: exactMatches[0] });
        } else if (exactMatches.length > 1) {
          report.push({ anchor: normalizedAnchor, rawValue, status: "ambiguous" });
        } else {
          report.push({ anchor: normalizedAnchor, rawValue, status: "unrecognized" });
        }
      } else {
        // Simple enum: first token only
        const token = rawValue.split(/\s/)[0];
        const tokenLower = token.toLowerCase();
        const exactMatches = allowedValues.filter(
          (v) => v.toLowerCase() === tokenLower
        );
        if (exactMatches.length === 1) {
          patch[fieldName] = exactMatches[0];
          report.push({ anchor: normalizedAnchor, rawValue: token, status: "matched", matchedValue: exactMatches[0] });
        } else if (exactMatches.length > 1) {
          report.push({ anchor: normalizedAnchor, rawValue: token, status: "ambiguous" });
        } else {
          report.push({ anchor: normalizedAnchor, rawValue: token, status: "unrecognized" });
        }
      }
      continue;
    }

    // Free-text fields (offForm, offPlay, motion without enum validation)
    if (MULTI_WORD_FIELDS.has(fieldName)) {
      patch[fieldName] = rawValue;
      report.push({ anchor: normalizedAnchor, rawValue, status: "matched", matchedValue: rawValue });
      continue;
    }

    // Fallback: single token
    patch[fieldName] = rawValue.split(/\s/)[0];
    report.push({ anchor: normalizedAnchor, rawValue, status: "matched", matchedValue: rawValue.split(/\s/)[0] });
  }

  return { patch, report };
}
