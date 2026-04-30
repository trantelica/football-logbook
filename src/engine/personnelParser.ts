/**
 * Pass 2 Personnel Narration Parser — deterministic, no AI.
 *
 * Parses statements such as:
 *   "number one is playing at Q"
 *   "number 7 is playing left guard"
 *   "#22 plays X"
 *   "12 at right tackle"
 *
 * Resolves position TOKEN (canonical label, configured alias, or full role
 * phrase like "left guard") to a canonical pos* field via the alias map +
 * built-in role phrase table. Output patch keys are ALWAYS canonical pos*
 * fields — never aliases, never role phrases.
 *
 * If `currentPersonnel` is provided and a parsed jersey already lives at a
 * different canonical slot, the result records a "move" (clears the old slot
 * in the patch in addition to setting the new one). This honors the user's
 * stated intent of relocation rather than duplication.
 */

import { PERSONNEL_POSITIONS } from "./personnel";
import { resolveToCanonicalPos, type PositionAliasMap } from "./positionAliases";

export interface PersonnelParseEntry {
  rawSentence: string;
  status: "matched" | "unrecognized" | "ambiguous";
  jersey?: number;
  canonicalField?: string;
  /** Set when the jersey was relocated from another slot. */
  movedFrom?: string;
  reason?: string;
}

export interface PersonnelParseResult {
  /** Canonical pos* keys only. May include `null` values for cleared (moved-from) slots. */
  patch: Record<string, number | null>;
  report: PersonnelParseEntry[];
}

/**
 * Number-word table for jersey numerics in narration.
 * Restricted to small jerseys; bigger numbers use digits.
 */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/**
 * Built-in role phrases that always resolve to a canonical pos* field,
 * independent of the configured alias map. These are the long-form names
 * coaches commonly speak.
 */
const ROLE_PHRASES: { phrase: string; field: string }[] = [
  { phrase: "left tackle", field: "posLT" },
  { phrase: "left guard", field: "posLG" },
  { phrase: "center", field: "posC" },
  { phrase: "right guard", field: "posRG" },
  { phrase: "right tackle", field: "posRT" },
  // Note: "X", "Y" etc. are canonical labels handled by resolveToCanonicalPos.
];

const CANONICAL_SET = new Set<string>(PERSONNEL_POSITIONS);

/** Parse a jersey number token (digits or number-word). Returns null on failure. */
function parseJerseyToken(token: string): number | null {
  if (!token) return null;
  const cleaned = token.replace(/^#/, "").trim();
  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const word = cleaned.toLowerCase();
  if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  return null;
}

/** Try to resolve a position phrase to a canonical pos* field. */
function resolvePositionPhrase(
  phrase: string,
  aliasMap: PositionAliasMap | undefined | null,
): string | null {
  const trimmed = phrase.trim();
  if (!trimmed) return null;

  // 1. Built-in long-form role phrases (case-insensitive).
  const lower = trimmed.toLowerCase();
  for (const r of ROLE_PHRASES) {
    if (lower === r.phrase) return r.field;
  }

  // 2. Single-token: try canonical label / alias resolution.
  // Strip any trailing punctuation.
  const cleaned = trimmed.replace(/[.,;:!?]+$/, "");
  // If multi-word but not a known role phrase, try the first token only as a
  // last resort (handles "X receiver", "Y tight end", etc.).
  const firstToken = cleaned.split(/\s+/)[0];
  return (
    resolveToCanonicalPos(cleaned, aliasMap) ??
    resolveToCanonicalPos(firstToken, aliasMap)
  );
}

/**
 * Try to extract (jerseyToken, positionPhrase) from a single sentence/clause.
 *
 * Supported shapes (case-insensitive):
 *   number <jersey> (is playing|plays|playing|is) [at|in|the] <position>
 *   #<digits>       (is playing|plays|playing|at)  [at|in|the] <position>
 *   <digits>        (is playing|plays|playing|at)  [at|in|the] <position>
 */
function extractClauseMatch(clause: string): { jerseyToken: string; positionPhrase: string } | null {
  const trimmed = clause.trim();
  if (!trimmed) return null;

  // Form 1: "number <token> ..."
  let m = trimmed.match(/^number\s+(#?\w+)\s+(?:is\s+playing|plays|playing|is)\s+(?:at\s+|in\s+|the\s+)?(.+)$/i);
  if (m) return { jerseyToken: m[1], positionPhrase: m[2] };

  // Form 2: "#22 ..." or "22 ..."
  m = trimmed.match(/^(#?\d+)\s+(?:is\s+playing|plays|playing|at)\s+(?:at\s+|in\s+|the\s+)?(.+)$/i);
  if (m) return { jerseyToken: m[1], positionPhrase: m[2] };

  return null;
}

/**
 * Parse personnel narration into a canonical pos* patch + report.
 */
export function parsePersonnelNarration(
  text: string,
  aliasMap: PositionAliasMap | undefined | null,
  currentPersonnel?: Record<string, unknown> | null,
): PersonnelParseResult {
  const patch: Record<string, number | null> = {};
  const report: PersonnelParseEntry[] = [];

  if (!text || !text.trim()) return { patch, report };

  // Where each canonical slot will land after this parse pass (locally tracked
  // so multiple sentences in one parse interact correctly).
  const localAssignments: Record<string, number | null> = {};

  // Split into clauses on sentence/clause separators including " and ".
  // Conservative: handles common multi-assignment narration in one breath.
  const clauses = text
    .split(/(?:[.;\n]|,\s+|\s+and\s+)+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const matched = extractClauseMatch(clause);
    if (!matched) continue;
    const { jerseyToken, positionPhrase } = matched;
    const rawSentence = clause;
    const jersey = parseJerseyToken(jerseyToken);
    if (jersey == null) {
      report.push({ rawSentence, status: "unrecognized", reason: `Could not parse jersey "${jerseyToken}"` });
      continue;
    }

      const canonicalField = resolvePositionPhrase(positionPhrase, aliasMap);
      if (!canonicalField || !CANONICAL_SET.has(canonicalField)) {
        report.push({
          rawSentence,
          status: "unrecognized",
          jersey,
          reason: `Unknown position "${positionPhrase.trim()}"`,
        });
        continue;
      }

      // Move detection: did this jersey already live at a different canonical
      // slot in current personnel (or in a prior sentence in this same parse)?
      let movedFrom: string | undefined;
      const checkSources: Array<Record<string, unknown>> = [];
      if (currentPersonnel) checkSources.push(currentPersonnel);
      checkSources.push(localAssignments as Record<string, unknown>);

      for (const src of checkSources) {
        for (const pos of PERSONNEL_POSITIONS) {
          if (pos === canonicalField) continue;
          const v = src[pos];
          if (v == null || v === "") continue;
          if (Number(v) === jersey) {
            movedFrom = pos;
            break;
          }
        }
        if (movedFrom) break;
      }

      if (movedFrom) {
        localAssignments[movedFrom] = null;
        patch[movedFrom] = null;
      }
      localAssignments[canonicalField] = jersey;
      patch[canonicalField] = jersey;

      report.push({
        rawSentence,
        status: "matched",
        jersey,
        canonicalField,
        movedFrom,
      });
    }
  }

  return { patch, report };
}
