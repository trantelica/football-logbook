/**
 * Football Engine — Deterministic Raw Input Parser
 *
 * Anchor-based shorthand grammar per Pass 1 Parser Scaffold.
 * No inference, no synonyms, no fuzzy matching.
 * Exact case-insensitive matching only. Returns parse report for ambiguous/unrecognized tokens.
 *
 * Key design rules:
 * - Multi-word fields (offForm, offPlay, motion) consume until a STOP anchor
 * - Actor fields (rusher, passer, receiver) are marker-led, conservative
 * - gainLoss supports GN/LS, GAIN, LOSS, GN, LS anchors
 * - GAIN/LOSS/GN/LS act as stop boundaries for offPlay
 * - No AI, no fuzzy matching
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

/**
 * All recognized anchors in priority order.
 * Longer anchors first to avoid partial matches.
 * Includes extended markers from scaffold: GAIN, LOSS, GN, LS.
 */
export const ANCHORS = [
  "GN/LS", "GNLS", "PENYARDS", "2MIN",
  "PENALTY", "RESULT", "MOTION", "FORM", "PLAY",
  "RECEIVER", "RUSHER", "PASSER",
  "YARD", "HASH", "DIST", "DN", "EFF",
  "GAIN", "LOSS", "GN", "LS",
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
  "GN": "gainLoss",
  "LS": "gainLossNeg",   // special: negate value
  "GAIN": "gainLoss",
  "LOSS": "gainLossNeg",  // special: negate value
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

/** Enum fields with exact-match validation against allowed values.
 * NOTE: penalty is intentionally NOT here — it is a free-text multi-word field
 * at parse time. The coach may say "Holding" without the O-/D- prefix.
 * Canonical matching happens downstream via lookup governance.
 */
const ENUM_FIELD_VALUES: Record<string, readonly string[]> = {
  hash: HASH_VALUES,
  result: RESULT_VALUES,
  eff: EFF_VALUES,
  twoMin: ["Y", "N"],
};

/**
 * Multi-word fields — consume all tokens until next anchor.
 * These fields STOP at any recognized anchor boundary.
 */
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
    let fieldName = ANCHOR_FIELD_MAP[normalizedAnchor] ?? ANCHOR_FIELD_MAP[anchor];
    if (!fieldName) continue;

    // Handle negation anchors (LS, LOSS → gainLoss with negation)
    const isNegating = fieldName === "gainLossNeg";
    if (isNegating) {
      fieldName = "gainLoss";
    }

    // Display anchor for reports
    const reportAnchor = isNegating ? (anchor === "LS" ? "LS" : "LOSS") : normalizedAnchor;

    if (!rawValue) {
      report.push({ anchor: reportAnchor, rawValue: "", status: "unrecognized" });
      continue;
    }

    // Integer fields
    if (INTEGER_FIELDS.has(fieldName)) {
      const token = rawValue.split(/\s/)[0];
      const parsed = parseInt(token, 10);
      if (!isNaN(parsed)) {
        const finalValue = isNegating ? -Math.abs(parsed) : parsed;
        patch[fieldName] = finalValue;
        report.push({ anchor: reportAnchor, rawValue, status: "matched", matchedValue: String(finalValue) });
      } else {
        report.push({ anchor: reportAnchor, rawValue, status: "unrecognized" });
      }
      continue;
    }

    // Enum fields with exact matching
    const allowedValues = ENUM_FIELD_VALUES[fieldName];
    if (allowedValues) {
      const valueLower = rawValue.toLowerCase();
      if (MULTI_WORD_FIELDS.has(fieldName)) {
        const exactMatches = allowedValues.filter(
          (v) => v.toLowerCase() === valueLower
        );
        if (exactMatches.length === 1) {
          patch[fieldName] = exactMatches[0];
          report.push({ anchor: reportAnchor, rawValue, status: "matched", matchedValue: exactMatches[0] });
        } else if (exactMatches.length > 1) {
          report.push({ anchor: reportAnchor, rawValue, status: "ambiguous" });
        } else {
          report.push({ anchor: reportAnchor, rawValue, status: "unrecognized" });
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
          report.push({ anchor: reportAnchor, rawValue: token, status: "matched", matchedValue: exactMatches[0] });
        } else if (exactMatches.length > 1) {
          report.push({ anchor: reportAnchor, rawValue: token, status: "ambiguous" });
        } else {
          report.push({ anchor: reportAnchor, rawValue: token, status: "unrecognized" });
        }
      }
      continue;
    }

    // Free-text multi-word fields (offForm, offPlay, motion)
    if (MULTI_WORD_FIELDS.has(fieldName)) {
      patch[fieldName] = rawValue;
      report.push({ anchor: reportAnchor, rawValue, status: "matched", matchedValue: rawValue });
      continue;
    }

    // Fallback: single token
    patch[fieldName] = rawValue.split(/\s/)[0];
    report.push({ anchor: reportAnchor, rawValue, status: "matched", matchedValue: rawValue.split(/\s/)[0] });
  }

  return { patch, report };
}
