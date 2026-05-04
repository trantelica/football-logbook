/**
 * Lookup Assist (Slice F2.a)
 *
 * Pure deterministic candidate retrieval for the three Pass 1 Play Details
 * governed parent fields (offForm, offPlay, motion). Surfaces bounded
 * known-canonical options when the coach's text contains partial,
 * tag-heavy, or STT-corrupted cues.
 *
 * STRICT GUARANTEES:
 *  - All candidates come verbatim from `lookupMap.get(field)`. Never invents.
 *  - No AI. No phonetic algorithms. No multi-token fuzzy.
 *  - Read-only: never mutates inputs, never calls I/O.
 *  - Section-scoped via the caller (panel only invokes for playDetails).
 *  - Scanner whole-canonical winners suppress assist for that field.
 *  - Already-touched / already-filled fields are suppressed.
 */

import { isBoundedSttMatch } from "./sttEditDistance";
import type { GovernedLookupField, LookupScanResult } from "./lookupScanner";

export type AssistSignal =
  | "exact"
  | "prefix"
  | "contains"
  | "numeric"
  | "stt_edit"
  | "synonym"
  | "overlap";

export interface AssistOption {
  /** Verbatim from lookupMap.get(field). */
  canonical: string;
  /** Deduped, deterministic order. */
  signals: AssistSignal[];
}

export type AssistFieldResult =
  | { fieldName: GovernedLookupField; kind: "no_match"; cue: string }
  | {
      fieldName: GovernedLookupField;
      kind: "options";
      cue: string;
      knownOptions: AssistOption[];
      uniqueOption?: string;
      parserValue?: string;
    };

export interface AssistReport {
  perField: Partial<Record<GovernedLookupField, AssistFieldResult>>;
}

export interface CollectAssistInput {
  sectionText: string;
  parserPatch?: Readonly<Record<string, unknown>>;
  scannerResult?: Readonly<LookupScanResult> | null;
  lookupMap: ReadonlyMap<string, readonly string[]>;
  touchedFields?: ReadonlySet<string>;
  filledFields?: ReadonlySet<string>;
}

const GOVERNED_FIELDS: readonly GovernedLookupField[] = ["offForm", "offPlay", "motion"];
const CAPS: Record<GovernedLookupField, number> = { offForm: 5, offPlay: 6, motion: 5 };
const SIGNAL_ORDER: readonly AssistSignal[] = [
  "numeric",
  "prefix",
  "contains",
  "stt_edit",
  "exact",
  "synonym",
  "overlap",
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "of", "to", "with", "from", "for", "in", "on", "off",
  "is", "was", "be", "are", "we", "our", "us",
  "formation", "form", "motion", "play", "plays",
]);

function normalize(s: string): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function tokenize(s: string): string[] {
  const n = normalize(s);
  if (!n) return [];
  // split on non-word but keep digit groups intact
  return n.split(/[^a-z0-9]+/).filter(Boolean);
}

function isDigitToken(t: string): boolean {
  return /^\d+$/.test(t);
}

function nonTrivial(t: string): boolean {
  if (!t) return false;
  if (STOPWORDS.has(t)) return false;
  if (isDigitToken(t)) return true;
  return t.length >= 3;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

interface ScoredCandidate {
  canonical: string;
  signals: Set<AssistSignal>;
  overlapScore: number; // 0..1, used only as a ranking boost
}

function detectSignals(
  field: GovernedLookupField,
  cueTokens: string[],
  cueText: string,
  canonical: string,
): { signals: Set<AssistSignal>; overlap: number } {
  const signals = new Set<AssistSignal>();
  const canonNorm = normalize(canonical);
  const canonTokens = tokenize(canonNorm);
  if (canonTokens.length === 0) return { signals, overlap: 0 };

  // exact: full canonical appears as whole-token substring of cue
  // (whole tokens — guard with word boundary check)
  const cueJoined = " " + cueTokens.join(" ") + " ";
  const canonJoined = " " + canonTokens.join(" ") + " ";
  if (cueJoined.includes(canonJoined)) {
    signals.add("exact");
  }

  // numeric: offPlay only — any digit token in cue equals digit token in canonical
  if (field === "offPlay") {
    const cueDigits = cueTokens.filter(isDigitToken);
    const canonDigits = canonTokens.filter(isDigitToken);
    if (cueDigits.some((d) => canonDigits.includes(d))) {
      signals.add("numeric");
    }
  }

  // prefix: coach token is whole-token prefix of canonical's first token
  // OR coach multi-token sequence is prefix of canonical token list
  // Single-token case
  for (const ct of cueTokens) {
    if (!nonTrivial(ct)) continue;
    if (ct.length < 2) continue;
    // strict prefix of first token, OR equals first token of multi-token canonical
    if (canonTokens[0].startsWith(ct) && ct !== canonTokens[0]) {
      signals.add("prefix");
      break;
    }
    if (ct === canonTokens[0] && canonTokens.length > 1) {
      signals.add("prefix");
      break;
    }
  }
  // Multi-token prefix sequence
  if (cueTokens.length >= 2 && canonTokens.length >= cueTokens.length) {
    let allMatch = true;
    for (let i = 0; i < cueTokens.length; i++) {
      if (cueTokens[i] !== canonTokens[i]) {
        // allow last token to be prefix
        if (i === cueTokens.length - 1 && canonTokens[i].startsWith(cueTokens[i])) continue;
        allMatch = false;
        break;
      }
    }
    if (allMatch) signals.add("prefix");
  }

  // contains: canonical contains a non-trivial coach token as a whole token
  for (const ct of cueTokens) {
    if (!nonTrivial(ct)) continue;
    if (canonTokens.includes(ct)) {
      signals.add("contains");
      break;
    }
  }

  // stt_edit: bounded single-token DL distance against any canonical token
  for (const ct of cueTokens) {
    if (!nonTrivial(ct) || isDigitToken(ct)) continue;
    if (canonTokens.includes(ct)) continue;
    let matched = false;
    for (const kt of canonTokens) {
      if (isDigitToken(kt)) continue;
      if (isBoundedSttMatch(ct, kt)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      signals.add("stt_edit");
      break;
    }
  }

  // overlap (ranking only)
  const cueSet = new Set(cueTokens.filter(nonTrivial));
  const canonSet = new Set(canonTokens.filter(nonTrivial));
  const overlap = jaccard(cueSet, canonSet);

  return { signals, overlap };
}

function strongestSignalRank(signals: Set<AssistSignal>): number {
  for (let i = 0; i < SIGNAL_ORDER.length; i++) {
    if (signals.has(SIGNAL_ORDER[i])) return i;
  }
  return SIGNAL_ORDER.length;
}

function orderSignals(signals: Set<AssistSignal>): AssistSignal[] {
  return SIGNAL_ORDER.filter((s) => signals.has(s));
}

function collectForField(
  field: GovernedLookupField,
  cueText: string,
  canonicals: readonly string[],
  parserValue: string | undefined,
): AssistFieldResult {
  const cueTokens = tokenize(cueText);
  const scored: ScoredCandidate[] = [];

  for (const canonical of canonicals) {
    const { signals, overlap } = detectSignals(field, cueTokens, cueText, canonical);
    // overlap alone never introduces a candidate
    const introducing: AssistSignal[] = ["numeric", "prefix", "contains", "stt_edit", "exact", "synonym"];
    const hasIntroducer = introducing.some((s) => signals.has(s));
    if (!hasIntroducer) continue;
    if (overlap > 0) signals.add("overlap");
    scored.push({ canonical, signals, overlapScore: overlap });
  }

  if (scored.length === 0) {
    return { fieldName: field, kind: "no_match", cue: cueText };
  }

  // Rank: strongest signal asc (lower = stronger), then overlap desc, then alpha asc
  scored.sort((a, b) => {
    const ra = strongestSignalRank(a.signals);
    const rb = strongestSignalRank(b.signals);
    if (ra !== rb) return ra - rb;
    if (a.overlapScore !== b.overlapScore) return b.overlapScore - a.overlapScore;
    return a.canonical.localeCompare(b.canonical);
  });

  const capped = scored.slice(0, CAPS[field]);
  const knownOptions: AssistOption[] = capped.map((c) => ({
    canonical: c.canonical,
    signals: orderSignals(c.signals),
  }));

  // uniqueOption: exactly one candidate carries a strong signal (numeric or
  // prefix) and no other candidate carries either of those.
  let uniqueOption: string | undefined;
  const strongCarriers = scored.filter(
    (c) => c.signals.has("numeric") || c.signals.has("prefix"),
  );
  if (strongCarriers.length === 1 && scored.length >= 1) {
    uniqueOption = strongCarriers[0].canonical;
  }

  return {
    fieldName: field,
    kind: "options",
    cue: cueText,
    knownOptions,
    ...(uniqueOption ? { uniqueOption } : {}),
    ...(parserValue ? { parserValue } : {}),
  };
}

export function collectAssistCandidates(input: CollectAssistInput): AssistReport {
  const report: AssistReport = { perField: {} };
  const text = input.sectionText ?? "";
  if (!text.trim()) return report;
  const lookupMap = input.lookupMap;
  if (!lookupMap) return report;

  const touched = input.touchedFields ?? new Set<string>();
  const filled = input.filledFields ?? new Set<string>();
  const scannerPerField = input.scannerResult?.perField ?? {};

  for (const field of GOVERNED_FIELDS) {
    // Suppress: scanner whole-canonical winner exists.
    if (scannerPerField[field]) continue;
    // Suppress: coach already touched or field already filled.
    if (touched.has(field)) continue;
    if (filled.has(field)) continue;

    const canonicals = lookupMap.get(field) ?? [];
    if (canonicals.length === 0) continue;

    const parserVal = input.parserPatch?.[field];
    const parserValue = typeof parserVal === "string" && parserVal.trim() ? parserVal.trim() : undefined;

    const result = collectForField(field, text, canonicals, parserValue);
    report.perField[field] = result;
  }

  return report;
}
