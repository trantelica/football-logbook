/**
 * Parser Suspicion Detector (Slice C)
 *
 * Pure signal layer that inspects deterministic parser output for the three
 * Pass 1 governed Play Details parent fields (offForm, offPlay, motion) and
 * emits suspicion metadata describing why a parsed value may be wrong.
 *
 * STRICT GUARANTEES:
 *  - Pure: no I/O, no console, no mutation of inputs, no React/DB/ctx access.
 *  - Read-only: never modifies parserPatch, scannerResult, lookupMap, sourceText.
 *  - Never corrects values, never blocks commit, never calls AI.
 *  - Never broadens deterministic parsing — only flags.
 *  - Operates ONLY on offForm / offPlay / motion. All other fields are ignored.
 *
 * Output is a structured report intended for downstream AI crosscheck (Slice D)
 * and is not yet wired into UI or TransactionContext.
 */

import { ANCHORS } from "./rawInputParser";
import type { LookupScanResult, GovernedLookupField } from "./lookupScanner";

export type SuspicionCode =
  | "overlong_value"
  | "sentence_shape"
  | "connector_absorbed"
  | "contains_other_anchor"
  | "scanner_conflict"
  | "phrase_fragment_unknown";

/** Deterministic ordering for emitted codes within a single field. */
const CODE_ORDER: readonly SuspicionCode[] = [
  "overlong_value",
  "sentence_shape",
  "connector_absorbed",
  "contains_other_anchor",
  "scanner_conflict",
  "phrase_fragment_unknown",
] as const;

const GOVERNED_FIELDS: readonly GovernedLookupField[] = ["offForm", "offPlay", "motion"];

/** Words that strongly suggest the parser absorbed a connector phrase. */
const CONNECTOR_WORDS = new Set([
  "from", "to", "with", "for", "by", "into", "onto", "off", "the", "a", "an",
  "and", "of", "out", "in",
]);

/** Sentence-shape markers: punctuation or sentence-y verbs. */
const SENTENCE_VERBS = new Set([
  "is", "was", "were", "are", "be", "being", "been", "did", "does",
  "ran", "runs", "throws", "threw", "caught", "catches",
]);

/**
 * "Soft" anchor token forms — root words of multi-form anchors that a coach
 * may dictate inline (e.g., "PASS" → PASSER). Matched as whole tokens.
 */
const SOFT_ANCHOR_TOKENS: readonly string[] = ["PASS", "RUSH", "RECEIVE"];

const ALL_ANCHOR_TOKENS: ReadonlySet<string> = new Set(
  [...ANCHORS, ...SOFT_ANCHOR_TOKENS].map((a) => a.toUpperCase()),
);

/** Per-field suspicion thresholds. */
const OVERLONG_TOKEN_LIMIT: Record<GovernedLookupField, number> = {
  offForm: 4,
  offPlay: 6,
  motion: 4,
};

export interface ParserSuspicionSignal {
  fieldName: GovernedLookupField;
  observedValue: string;
  /** Suspicion codes, in deterministic order. Always non-empty if present. */
  codes: SuspicionCode[];
  /** Present iff a scanner_conflict was detected. */
  scannerCanonical?: string;
  /** Lightweight evidence per code; deterministic. */
  evidence: Partial<Record<SuspicionCode, string>>;
}

export interface ParserSuspicionReport {
  /** Per-field suspicion entries. */
  perField: Partial<Record<GovernedLookupField, ParserSuspicionSignal>>;
  /** Flat list, ordered by GOVERNED_FIELDS order. */
  signals: ParserSuspicionSignal[];
}

export interface DetectParserSuspicionInput {
  parserPatch: Readonly<Record<string, unknown>>;
  scannerResult?: Readonly<LookupScanResult> | null;
  lookupMap?: ReadonlyMap<string, readonly string[]> | null;
  sourceText?: string;
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function tokensOf(s: string): string[] {
  const n = normalize(s);
  if (!n) return [];
  return n.split(" ");
}

function isKnownLookupValue(
  field: GovernedLookupField,
  value: string,
  lookupMap?: ReadonlyMap<string, readonly string[]> | null,
): boolean {
  if (!lookupMap) return false;
  const known = lookupMap.get(field);
  if (!known) return false;
  const target = normalize(value);
  for (const k of known) if (normalize(k) === target) return true;
  return false;
}

function detectForField(
  field: GovernedLookupField,
  rawValue: string,
  scannerResult: Readonly<LookupScanResult> | null | undefined,
  lookupMap: ReadonlyMap<string, readonly string[]> | null | undefined,
): ParserSuspicionSignal | null {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // Clean known canonical → no suspicion at all.
  if (isKnownLookupValue(field, trimmed, lookupMap)) return null;

  const tokens = tokensOf(trimmed);
  const upperTokens = tokens.map((t) => t.toUpperCase());
  const codes = new Set<SuspicionCode>();
  const evidence: Partial<Record<SuspicionCode, string>> = {};

  // overlong_value
  if (tokens.length > OVERLONG_TOKEN_LIMIT[field]) {
    codes.add("overlong_value");
    evidence.overlong_value = `${tokens.length} tokens > limit ${OVERLONG_TOKEN_LIMIT[field]}`;
  }

  // sentence_shape: punctuation or sentence verbs
  if (/[.!?,;:]/.test(trimmed)) {
    codes.add("sentence_shape");
    evidence.sentence_shape = "punctuation";
  } else {
    for (const t of tokens) {
      if (SENTENCE_VERBS.has(t)) {
        codes.add("sentence_shape");
        evidence.sentence_shape = `verb:${t}`;
        break;
      }
    }
  }

  // connector_absorbed
  for (const t of tokens) {
    if (CONNECTOR_WORDS.has(t)) {
      codes.add("connector_absorbed");
      evidence.connector_absorbed = `connector:${t}`;
      break;
    }
  }

  // contains_other_anchor
  for (const t of upperTokens) {
    if (ALL_ANCHOR_TOKENS.has(t)) {
      codes.add("contains_other_anchor");
      evidence.contains_other_anchor = `anchor:${t}`;
      break;
    }
  }

  // scanner_conflict
  let scannerCanonical: string | undefined;
  const scanHit = scannerResult?.perField?.[field];
  if (scanHit && normalize(scanHit.canonical) !== normalize(trimmed)) {
    codes.add("scanner_conflict");
    scannerCanonical = scanHit.canonical;
    evidence.scanner_conflict = `scanner:${scanHit.canonical}`;
  }

  // phrase_fragment_unknown — fallback when nothing else fired but value is
  // not a known lookup. This means the parser produced an unrecognized phrase
  // worth AI crosscheck. Only emitted in absence of other codes.
  if (codes.size === 0) {
    codes.add("phrase_fragment_unknown");
    evidence.phrase_fragment_unknown = `unknown:${tokens.length}t`;
  }

  // Deterministic ordering
  const orderedCodes = CODE_ORDER.filter((c) => codes.has(c));

  return {
    fieldName: field,
    observedValue: trimmed,
    codes: orderedCodes,
    ...(scannerCanonical !== undefined ? { scannerCanonical } : {}),
    evidence,
  };
}

export function detectParserSuspicion(
  input: DetectParserSuspicionInput,
): ParserSuspicionReport {
  const { parserPatch, scannerResult, lookupMap } = input;
  const report: ParserSuspicionReport = { perField: {}, signals: [] };
  if (!parserPatch || typeof parserPatch !== "object") return report;

  for (const field of GOVERNED_FIELDS) {
    const v = parserPatch[field];
    if (typeof v !== "string") continue;
    const sig = detectForField(field, v, scannerResult ?? null, lookupMap ?? null);
    if (!sig) continue;
    report.perField[field] = sig;
    report.signals.push(sig);
  }

  return report;
}
