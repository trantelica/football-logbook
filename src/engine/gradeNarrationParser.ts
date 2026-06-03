/**
 * Pass 3 — Blocking Grade Narration Parser
 *
 * Deterministic parser for natural-language grade narration as produced by
 * voice dictation. Handles coach phrasing like:
 *   "OK our left tackle got a one our left guard got a 2 center -3
 *    right guard a two right tackle a 1 Y received a one and the four got a two"
 *
 * Returns a patch keyed by canonical grade fields (gradeLT, gradeLG, ...).
 * Values are constrained to the allowed range -3..+3.
 *
 * Conflict policy: if the same field appears twice with different values,
 * it is flagged as conflicted and excluded from the patch.
 *
 * NO commit. NO mutation of committed row data.
 */

import { GRADE_FIELDS, GRADE_LABELS } from "./personnel";
import type { PositionAliasMap } from "./positionAliases";

/** posX → gradeX (for alias-based position resolution). */
const POS_TO_GRADE: Record<string, string> = {
  posLT: "gradeLT", posLG: "gradeLG", posC: "gradeC", posRG: "gradeRG", posRT: "gradeRT",
  posX: "gradeX", posY: "gradeY",
  pos1: "grade1", pos2: "grade2", pos3: "grade3", pos4: "grade4",
};

/** O-line group expansion target fields. */
const OLINE_FIELDS = ["gradeLT", "gradeLG", "gradeC", "gradeRG", "gradeRT"];

export interface GradeParseEntry {
  rawClause: string;
  canonicalField?: string;
  value?: number;
  status: "matched" | "unrecognized" | "out_of_range" | "conflict";
  reason?: string;
}

export interface GradeParseResult {
  patch: Record<string, number>;
  report: GradeParseEntry[];
}

// ── Position token → canonical field ──────────────────────────────────────

const POSITION_MAP: Record<string, string> = {
  "left tackle": "gradeLT", lt: "gradeLT",
  "left guard": "gradeLG", lg: "gradeLG",
  center: "gradeC", centre: "gradeC", c: "gradeC",
  "right guard": "gradeRG", rg: "gradeRG",
  "right tackle": "gradeRT", rt: "gradeRT",
  x: "gradeX",
  y: "gradeY",
};

// Numeric position tokens ("the four" → grade4) need careful treatment
// because spoken numbers also appear as grade values.
const NUMERIC_POSITION_MAP: Record<string, string> = {
  "1": "grade1", "2": "grade2", "3": "grade3", "4": "grade4",
};

const GRADE_ALIAS_TO_CANONICAL: Record<string, string> = {
  gradeLT: "gradeLT",
  gradeLG: "gradeLG",
  gradeC: "gradeC",
  gradeRG: "gradeRG",
  gradeRT: "gradeRT",
  gradeX: "gradeX",
  gradeY: "gradeY",
  grade1: "grade1",
  grade2: "grade2",
  grade3: "grade3",
  grade4: "grade4",
  ltGrade: "gradeLT",
  lgGrade: "gradeLG",
  cGrade: "gradeC",
  rgGrade: "gradeRG",
  rtGrade: "gradeRT",
  xGrade: "gradeX",
  yGrade: "gradeY",
};

// ── Spoken number → integer ───────────────────────────────────────────────

const WORD_TO_NUM: Record<string, number> = {
  "zero": 0,
  "one": 1, "two": 2, "three": 3,
  "minus one": -1, "minus two": -2, "minus three": -3,
  "negative one": -1, "negative two": -2, "negative three": -3,
};

/** Convert a grade token (word or digit string) to a number or undefined. */
function parseGradeValue(token: string): number | undefined {
  const t = token.trim().toLowerCase();
  if (WORD_TO_NUM[t] !== undefined) return WORD_TO_NUM[t];
  // Try numeric: handles "2", "-3", "+1"
  if (/^[+-]?\d+$/.test(t)) {
    const n = parseInt(t, 10);
    if (n >= -3 && n <= 3) return n;
    return undefined; // out of range signaled by caller
  }
  return undefined;
}

// ── Tokeniser ─────────────────────────────────────────────────────────────

// ── Pre-parse: split collapsed position+grade tokens ──────────────────────
// Handles voice transcription joins like "Y1", "X-2", "LT1", "RG-1", "C0".
// Only splits when the prefix is a known short position alias.
const COLLAPSED_POS = new Set(["lt", "lg", "c", "rg", "rt", "x", "y"]);

function splitCollapsedTokens(raw: string): string {
  // Match word-boundary position alias immediately followed by optional sign and digits
  return raw.replace(/\b([a-zA-Z]{1,2})([+-]?\d+)\b/g, (match, pos, num) => {
    if (COLLAPSED_POS.has(pos.toLowerCase())) {
      return `${pos} ${num}`;
    }
    return match;
  });
}

/**
 * Normalise input into a flat lowercase token stream, stripping filler words
 * and punctuation but preserving semantic tokens (positions + numbers).
 */
function tokenise(input: string): string[] {
  return splitCollapsedTokens(input)
    .toLowerCase()
    .replace(/[,;.\n]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Multi-word position phrases sorted longest-first for greedy matching.
const MULTI_WORD_POSITIONS = [
  "left tackle", "left guard", "right tackle", "right guard",
  "minus three", "minus two", "minus one",
  "negative three", "negative two", "negative one",
];

// Filler words to skip during scanning.
const FILLER = new Set([
  "ok", "okay", "our", "and", "got", "gets", "get", "go", "to", "received", "a", "the",
  "an", "of", "is", "was", "his", "her", "their", "with", "looks",
  "like", "back", "grade", "here", "are", "grades", "number",
]);

export function normalizeGradePatchKeys(input: Record<string, number>): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [rawKey, value] of Object.entries(input)) {
    const canonical = GRADE_ALIAS_TO_CANONICAL[rawKey];
    if (!canonical) continue;
    if (!GRADE_FIELDS.includes(canonical as (typeof GRADE_FIELDS)[number])) continue;
    normalized[canonical] = value;
  }
  return normalized;
}

/**
 * Walk the token stream and extract (position, grade) pairs.
 *
 * Strategy: scan left-to-right. When a position token is found, look ahead
 * (skipping fillers) for a grade value. When "the <number>" appears and
 * the number is 1-4, treat it as a numeric position (grade1..grade4).
 */
export function parseGradeNarration(
  input: string,
  aliasMap?: PositionAliasMap | null,
): GradeParseResult {
  const patch: Record<string, number> = {};
  const report: GradeParseEntry[] = [];

  if (!input || !input.trim()) return { patch, report };

  // Narrow STT normalization: "left tackled" → "left tackle" (Pass 3 only).
  // Strictly word-boundary-scoped; no fuzzy matching.
  let normalizedInput = input.replace(/\bleft\s+tackled\b/gi, "left tackle");
  // Narrow STT normalization: short-token "X in the Y" → "X and the Y"
  // (e.g. "X in the H" dictated for "X and the H"). Scoped to ≤2-letter
  // alpha tokens on both sides so it cannot rewrite normal prose.
  normalizedInput = normalizedInput.replace(
    /\b([a-z]{1,2})\s+in\s+the\s+([a-z]{1,2})\b/gi,
    "$1 and the $2",
  );
  const raw = normalizedInput.toLowerCase().replace(/[,;.\n]/g, " ").replace(/\s+/g, " ").trim();
  const tokens = tokenise(raw);

  /**
   * Resolve a single token to a grade field via POSITION_MAP, else alias map.
   * Only consults aliasMap entries explicitly (not canonical labels) so that
   * numeric tokens "1".."4" continue to flow through numeric-position
   * disambiguation logic rather than being silently treated as positions.
   */
  function resolveSingleTokenPosition(tok: string): string | null {
    if (POSITION_MAP[tok]) return POSITION_MAP[tok];
    if (aliasMap) {
      const upper = tok.trim().toUpperCase();
      if (!upper) return null;
      for (const [posField, alias] of Object.entries(aliasMap)) {
        if (!alias) continue;
        if (String(alias).trim().toUpperCase() === upper && POS_TO_GRADE[posField]) {
          return POS_TO_GRADE[posField];
        }
      }
    }
    return null;
  }

  /** Try to match a multi-word phrase starting at position i. */
  function tryMultiWord(): { phrase: string; consumed: number } | null {
    for (const mw of MULTI_WORD_POSITIONS) {
      const parts = mw.split(" ");
      if (i + parts.length > tokens.length) continue;
      let match = true;
      for (let k = 0; k < parts.length; k++) {
        if (tokens[i + k] !== parts[k]) { match = false; break; }
      }
      if (match) return { phrase: mw, consumed: parts.length };
    }
    return null;
  }

  /** Skip filler tokens from current position, return next meaningful token index. */
  function skipFiller(start: number): number {
    let j = start;
    while (j < tokens.length && FILLER.has(tokens[j])) j++;
    return j;
  }

  /** Read a grade value starting at index j (may be multi-word like "minus three"). */
  function readGrade(j: number): { value: number; consumed: number } | { outOfRange: true; raw: string; consumed: number } | null {
    // Sign-word + digit: "minus 1", "negative 2", "plus 3"
    if (j < tokens.length - 1) {
      const signTok = tokens[j];
      const digTok = tokens[j + 1];
      if ((signTok === "minus" || signTok === "negative" || signTok === "plus") && /^\d+$/.test(digTok)) {
        const n = parseInt(digTok, 10) * (signTok === "plus" ? 1 : -1);
        if (n >= -3 && n <= 3) return { value: n, consumed: 2 };
        return { outOfRange: true, raw: `${signTok} ${digTok}`, consumed: 2 };
      }
    }

    // Try multi-word grade first
    const mw = (() => {
      for (const phrase of MULTI_WORD_POSITIONS) {
        if (!WORD_TO_NUM.hasOwnProperty(phrase)) continue;
        const parts = phrase.split(" ");
        if (j + parts.length > tokens.length) continue;
        let ok = true;
        for (let k = 0; k < parts.length; k++) {
          if (tokens[j + k] !== parts[k]) { ok = false; break; }
        }
        if (ok) return { phrase, consumed: parts.length };
      }
      return null;
    })();
    if (mw) {
      const v = WORD_TO_NUM[mw.phrase];
      return { value: v, consumed: mw.consumed };
    }
    // Single token grade
    const t = tokens[j];
    if (!t) return null;
    const v = parseGradeValue(t);
    if (v !== undefined) return { value: v, consumed: 1 };
    // Check out of range numeric
    if (/^[+-]?\d+$/.test(t)) {
      return { outOfRange: true, raw: t, consumed: 1 };
    }
    return null;
  }

  // Collected pairs before conflict resolution
  const pairs: { field: string; value: number; clause: string; override?: boolean }[] = [];

  let i = 0;
  // Tracks fields most recently assigned by a group expansion, so a following
  // "except <position> ..." clause can override (not conflict with) the group.
  let lastGroupFields: Set<string> | null = null;

  // ── Group expansion pre-handler ───────────────────────────────────────
  // Recognises phrases like:
  //   "O line ... each get a one"
  //   "O line and Y ... each get a one"
  //   "X and the H get a two"
  // Requires either an O-line anchor OR ≥2 positions joined by "and".
  function tryGroupExpansion(start: number):
    | { fields: string[]; value: number; consumed: number }
    | null {
    let j = start;
    const fields = new Set<string>();
    let hadOLine = false;
    let positionCount = 0;
    let sawAnd = false;

    const GROUP_FILLERS = new Set([
      "all", "of", "the", "positions", "position", "each", "both",
      "our", "a", "an",
    ]);

    while (j < tokens.length) {
      const t = tokens[j];
      if (t === "oline") { OLINE_FIELDS.forEach(f => fields.add(f)); hadOLine = true; j++; continue; }
      if ((t === "o" || t === "offensive") && tokens[j + 1] === "line") {
        OLINE_FIELDS.forEach(f => fields.add(f));
        hadOLine = true; j += 2; continue;
      }
      let matchedMW = false;
      for (const mw of MULTI_WORD_POSITIONS) {
        if (!POSITION_MAP[mw]) continue;
        const parts = mw.split(" ");
        if (j + parts.length > tokens.length) continue;
        let ok = true;
        for (let k = 0; k < parts.length; k++) {
          if (tokens[j + k] !== parts[k]) { ok = false; break; }
        }
        if (ok) {
          fields.add(POSITION_MAP[mw]);
          positionCount++;
          j += parts.length;
          matchedMW = true;
          break;
        }
      }
      if (matchedMW) continue;
      const sf = resolveSingleTokenPosition(t);
      if (sf) {
        fields.add(sf);
        positionCount++;
        j++;
        continue;
      }
      if (t === "and") { sawAnd = true; j++; continue; }
      if (GROUP_FILLERS.has(t)) { j++; continue; }
      break;
    }

    if (!hadOLine && !(positionCount >= 2 && sawAnd)) return null;
    if (fields.size < 2) return null;

    let k = j;
    while (k < tokens.length && k - j < 4 &&
      tokens[k] !== "get" && tokens[k] !== "gets" && tokens[k] !== "got") {
      if (!["each", "all", "should", "be", "a", "an", "the"].includes(tokens[k])) break;
      k++;
    }
    if (tokens[k] === "get" || tokens[k] === "gets" || tokens[k] === "got") k++;
    else return null;
    while (k < tokens.length && ["a", "an", "the"].includes(tokens[k])) k++;
    const gr = readGrade(k);
    if (!gr || !("value" in gr)) return null;
    return { fields: [...fields], value: gr.value, consumed: (k + gr.consumed) - start };
  }

  while (i < tokens.length) {
    // 0. Try group expansion first
    const grp = tryGroupExpansion(i);
    if (grp) {
      const clause = tokens.slice(i, i + grp.consumed).join(" ");
      for (const f of grp.fields) {
        pairs.push({ field: f, value: grp.value, clause });
      }
      i += grp.consumed;
      continue;
    }
    // 1. Try multi-word position
    const mw = tryMultiWord();
    if (mw && POSITION_MAP[mw.phrase]) {
      const field = POSITION_MAP[mw.phrase];
      const afterPos = i + mw.consumed;
      const gradeStart = skipFiller(afterPos);
      const gr = readGrade(gradeStart);
      if (gr && "value" in gr) {
        const clauseEnd = gradeStart + gr.consumed;
        const clause = tokens.slice(i, clauseEnd).join(" ");
        pairs.push({ field, value: gr.value, clause });
        i = clauseEnd;
        continue;
      } else if (gr && "outOfRange" in gr) {
        const clauseEnd = gradeStart + gr.consumed;
        const clause = tokens.slice(i, clauseEnd).join(" ");
        report.push({ rawClause: clause, canonicalField: field, status: "out_of_range", reason: `Grade ${gr.raw} is out of range (-3..+3).` });
        i = clauseEnd;
        continue;
      }
      // Position found but no grade follows — skip
      i += mw.consumed;
      continue;
    }

    // 2. Try single-token position (lt, c, x, y, etc., or season alias like F/H)
    const tok = tokens[i];
    const singleField = resolveSingleTokenPosition(tok);
    if (singleField) {
      const field = singleField;
      const gradeStart = skipFiller(i + 1);
      const gr = readGrade(gradeStart);
      if (gr && "value" in gr) {
        const clauseEnd = gradeStart + gr.consumed;
        const clause = tokens.slice(i, clauseEnd).join(" ");
        pairs.push({ field, value: gr.value, clause });
        i = clauseEnd;
        continue;
      } else if (gr && "outOfRange" in gr) {
        const clauseEnd = gradeStart + gr.consumed;
        const clause = tokens.slice(i, clauseEnd).join(" ");
        report.push({ rawClause: clause, canonicalField: field, status: "out_of_range", reason: `Grade ${gr.raw} is out of range (-3..+3).` });
        i = clauseEnd;
        continue;
      }
      i++;
      continue;
    }

    // 3. Try numeric position phrases. Recognized shapes:
    //   - "the four", "number four", "the number four"
    //   - "<number> position", "the <number> position"
    //     (the explicit "position" word is sufficient disambiguation on its own)
    {
      let j = i;
      let hadPrefix = false;
      if (tokens[j] === "the") { j++; hadPrefix = true; }
      if (tokens[j] === "number") { j++; hadPrefix = true; }
      if (j < tokens.length) {
        const nextTok = tokens[j];
        const posDigit = nextTok === "one" ? "1" : nextTok === "two" ? "2" : nextTok === "three" ? "3" : nextTok === "four" ? "4" : /^[1-4]$/.test(nextTok) ? nextTok : null;
        if (posDigit && NUMERIC_POSITION_MAP[posDigit]) {
          let k = j + 1;
          const hasPositionWord = tokens[k] === "position";
          if (hasPositionWord) k++;
          // Require either an explicit "the"/"number" prefix or the word
          // "position" after the digit/word — otherwise a bare "one"/"two"
          // is ambiguous with a grade value and must not trigger position
          // interpretation.
          if (hadPrefix || hasPositionWord) {
            const field = NUMERIC_POSITION_MAP[posDigit];
            const gradeStart = skipFiller(k);
            const gr = readGrade(gradeStart);
            if (gr && "value" in gr) {
              const clauseEnd = gradeStart + gr.consumed;
              const clause = tokens.slice(i, clauseEnd).join(" ");
              pairs.push({ field, value: gr.value, clause });
              i = clauseEnd;
              continue;
            } else if (gr && "outOfRange" in gr) {
              const clauseEnd = gradeStart + gr.consumed;
              const clause = tokens.slice(i, clauseEnd).join(" ");
              report.push({ rawClause: clause, canonicalField: field, status: "out_of_range", reason: `Grade ${gr.raw} is out of range (-3..+3).` });
              i = clauseEnd;
              continue;
            }
            i = k;
            continue;
          }
        }
      }
    }

    // 4. Try bare numeric position (only when followed by filler+grade pattern)
    if (NUMERIC_POSITION_MAP[tok]) {
      const field = NUMERIC_POSITION_MAP[tok];
      const gradeStart = skipFiller(i + 1);
      const gr = readGrade(gradeStart);
      if (gr && "value" in gr) {
        // Disambiguate: a bare "2" followed by another number could be ambiguous.
        // We only consume if there's a filler word between them (like "got a").
        if (gradeStart > i + 1) {
          const clauseEnd = gradeStart + gr.consumed;
          const clause = tokens.slice(i, clauseEnd).join(" ");
          pairs.push({ field, value: gr.value, clause });
          i = clauseEnd;
          continue;
        }
      }
    }

    // Skip filler / unrecognized token
    i++;
  }

  // ── Conflict detection ────────────────────────────────────────────────
  const seen = new Map<string, { value: number; clause: string }[]>();
  for (const p of pairs) {
    if (!seen.has(p.field)) seen.set(p.field, []);
    seen.get(p.field)!.push(p);
  }

  for (const [field, entries] of seen) {
    if (entries.length === 1) {
      patch[field] = entries[0].value;
      report.push({ rawClause: entries[0].clause, canonicalField: field, value: entries[0].value, status: "matched" });
    } else {
      const uniqueValues = new Set(entries.map(e => e.value));
      if (uniqueValues.size === 1) {
        // Same value repeated — no real conflict
        patch[field] = entries[0].value;
        report.push({ rawClause: entries.map(e => e.clause).join("; "), canonicalField: field, value: entries[0].value, status: "matched" });
      } else {
        // True conflict
        for (const e of entries) {
          report.push({ rawClause: e.clause, canonicalField: field, value: e.value, status: "conflict", reason: `Conflicting values for ${GRADE_LABELS[field] ?? field}.` });
        }
      }
    }
  }

  return { patch: normalizeGradePatchKeys(patch), report };
}

export { GRADE_FIELDS, GRADE_LABELS };
