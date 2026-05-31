/**
 * Pass 3 — Deterministic Bulk Grade Command Parser
 *
 * Recognizes a narrow imperative grammar:
 *   "set all (remaining|empty) [blocking] grades to <value> [except <pos...>]"
 *   "all (of the )? (remaining|empty) [blocking] grades (should be) set to <value> [except <pos...>]"
 *
 * Returns the parsed intent only. State-aware filtering (which fields are
 * currently empty in the proposal + committed row) is performed by the caller.
 *
 * Hard rules:
 *  - Pure function, no DB / no side effects / no AI.
 *  - Does NOT mutate any committed or proposed value.
 *  - If the command matches but the exception clause is unresolvable,
 *    returns "unresolved_exception" so the caller can refuse to apply.
 *  - If the value is out of -3..+3, returns "out_of_range".
 *  - If the command grammar does not match at all, returns null (caller
 *    should fall through to the normal per-clause grade parser).
 *
 * Exception alias resolution:
 *  - Canonical labels always resolve: LT, LG, C, RG, RT, X, Y, 1..4.
 *  - Other tokens resolve only via the active season's PositionAliasMap
 *    (e.g. "F", "Z") — same map Pass 2 uses; nothing speculative.
 */

import { GRADE_FIELDS } from "./personnel";
import { resolveToCanonicalPos, type PositionAliasMap } from "./positionAliases";

export type GradeBulkCommandResult =
  | { status: "matched"; value: number; exceptions: Set<string> }
  | { status: "unresolved_exception"; reason: string }
  | { status: "out_of_range"; reason: string }
  | { status: "no_value"; reason: string };

/** Canonical position label (lowercase) → grade field. */
const POS_LABEL_TO_GRADE: Record<string, string> = {
  lt: "gradeLT", lg: "gradeLG", c: "gradeC", rg: "gradeRG", rt: "gradeRT",
  x: "gradeX", y: "gradeY",
  "1": "grade1", "2": "grade2", "3": "grade3", "4": "grade4",
};

/** posX → gradeX (inverse of BlockingPanel's GRADE_TO_POS). */
const POS_TO_GRADE: Record<string, string> = {
  posLT: "gradeLT", posLG: "gradeLG", posC: "gradeC", posRG: "gradeRG", posRT: "gradeRT",
  posX: "gradeX", posY: "gradeY",
  pos1: "grade1", pos2: "grade2", pos3: "grade3", pos4: "grade4",
};

/** Fillers permitted inside an "except …" tail. */
const EXCEPTION_FILLERS = new Set([
  "for", "the", "a", "an", "in", "of", "at", "and", "is", "be", "position", "spot",
]);

/** Spoken-number / numeric value parser, scoped to -3..+3 sensibility. */
function parseValueToken(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const wordMap: Record<string, number> = {
    "zero": 0, "one": 1, "two": 2, "three": 3,
    "minus one": -1, "minus two": -2, "minus three": -3,
    "negative one": -1, "negative two": -2, "negative three": -3,
    "plus one": 1, "plus two": 2, "plus three": 3,
  };
  if (wordMap[t] !== undefined) return wordMap[t];
  // "minus 1" / "negative 2" / "plus 3"
  const m = t.match(/^(minus|negative|plus)\s+(\d+)$/);
  if (m) {
    const n = parseInt(m[2], 10);
    return m[1] === "plus" ? n : -n;
  }
  // signed/unsigned digits
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

/** Resolve an exception token to a canonical grade field, or null. */
function resolveExceptionToken(
  tok: string,
  aliasMap: PositionAliasMap | null | undefined,
): string | null {
  const k = tok.trim().toLowerCase();
  if (!k) return null;
  if (POS_LABEL_TO_GRADE[k]) return POS_LABEL_TO_GRADE[k];
  // Try season alias map (e.g. coach configured F → pos3).
  const posField = resolveToCanonicalPos(tok, aliasMap ?? null);
  if (posField && POS_TO_GRADE[posField]) return POS_TO_GRADE[posField];
  return null;
}

export function parseGradeBulkCommand(
  input: string,
  aliasMap?: PositionAliasMap | null,
): GradeBulkCommandResult | null {
  if (!input || !input.trim()) return null;
  const text = input.toLowerCase().replace(/[,;.\n]/g, " ").replace(/\s+/g, " ").trim();

  // ── Grammar anchors (all must be present) ────────────────────────────
  const hasAll = /\ball\b/.test(text);
  const hasScope = /\b(remaining|empty)\b/.test(text);
  const hasGrades = /\b(blocking\s+)?grades?\b/.test(text);
  // "set …", "set them …", "set all … to", "should be set to", "should be a"
  const hasSetVerb = /\b(set|should\s+be)\b/.test(text);
  if (!(hasAll && hasScope && hasGrades && hasSetVerb)) return null;

  // ── Value extraction ─────────────────────────────────────────────────
  // Search after the first "set" or "be" occurrence for "to (a|an|the)? <value>"
  // or just "<value>" if the value follows "be a/an" directly.
  const verbIdx = (() => {
    const m = text.match(/\b(set|be)\b/);
    return m && typeof m.index === "number" ? m.index : 0;
  })();
  const tail = text.slice(verbIdx);
  // Accept "to a 1", "to one", "to minus 1", "to -1", and bare "a 1" / "a one"
  // immediately after "be".
  const valueRegex =
    /\b(?:to\s+(?:a\s+|an\s+|the\s+)?|a\s+|an\s+)?(minus\s+\d+|negative\s+\d+|plus\s+\d+|minus\s+one|minus\s+two|minus\s+three|negative\s+one|negative\s+two|negative\s+three|plus\s+one|plus\s+two|plus\s+three|zero|one|two|three|[+-]?\d+)\b/;
  // Constrain: must come after "to " somewhere — otherwise we'd grab "all" → never.
  // Anchor: prefer "to <value>"; fall back to "be a <value>".
  let valueToken: string | null = null;
  const toMatch = tail.match(
    /\bto\s+(?:a\s+|an\s+|the\s+)?(minus\s+\d+|negative\s+\d+|plus\s+\d+|minus\s+one|minus\s+two|minus\s+three|negative\s+one|negative\s+two|negative\s+three|plus\s+one|plus\s+two|plus\s+three|zero|one|two|three|[+-]?\d+)\b/,
  );
  if (toMatch) {
    valueToken = toMatch[1];
  } else {
    const beAMatch = tail.match(
      /\bbe\s+(?:a\s+|an\s+)?(minus\s+\d+|negative\s+\d+|plus\s+\d+|minus\s+one|minus\s+two|minus\s+three|negative\s+one|negative\s+two|negative\s+three|plus\s+one|plus\s+two|plus\s+three|zero|one|two|three|[+-]?\d+)\b/,
    );
    if (beAMatch) valueToken = beAMatch[1];
  }
  if (!valueToken) {
    return { status: "no_value", reason: "Could not parse a grade value." };
  }
  const value = parseValueToken(valueToken);
  if (value === null) {
    return { status: "no_value", reason: `Unrecognized grade value "${valueToken}".` };
  }
  if (value < -3 || value > 3) {
    return { status: "out_of_range", reason: `Grade ${value} is out of range (-3..+3).` };
  }

  // ── Exception clause (optional) ──────────────────────────────────────
  const exceptions = new Set<string>();
  const exMatch = text.match(/\bexcept(?:\s+for)?\s+(.+)$/);
  if (exMatch) {
    const exTail = exMatch[1].trim();
    const tokens = exTail.split(/\s+/).filter(Boolean);
    let unresolved: string | null = null;
    let anyResolved = false;
    for (const tok of tokens) {
      if (EXCEPTION_FILLERS.has(tok)) continue;
      const f = resolveExceptionToken(tok, aliasMap);
      if (f) {
        exceptions.add(f);
        anyResolved = true;
      } else {
        unresolved = tok;
        break;
      }
    }
    if (unresolved) {
      return {
        status: "unresolved_exception",
        reason: `Could not resolve exception token "${unresolved}".`,
      };
    }
    if (!anyResolved) {
      return {
        status: "unresolved_exception",
        reason: "No exception position could be resolved.",
      };
    }
  }

  return { status: "matched", value, exceptions };
}

/**
 * Given a matched bulk command and current state, return the patch that
 * fills only fields empty in BOTH committed row and current candidate.
 */
export function computeBulkFillPatch(
  value: number,
  exceptions: Set<string>,
  committed: Record<string, unknown> | null,
  candidate: Record<string, unknown>,
): { patch: Record<string, number>; targets: string[] } {
  const patch: Record<string, number> = {};
  const targets: string[] = [];
  for (const f of GRADE_FIELDS) {
    if (exceptions.has(f)) continue;
    const cv = committed?.[f];
    const dv = candidate[f];
    const committedEmpty = cv == null || cv === "";
    const candidateEmpty = dv == null || dv === "";
    if (!committedEmpty || !candidateEmpty) continue;
    patch[f] = value;
    targets.push(f);
  }
  return { patch, targets };
}
