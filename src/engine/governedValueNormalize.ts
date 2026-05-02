/**
 * Governed Lookup Value Normalization
 *
 * Used to clean up governed lookup field candidates (offForm, offPlay, motion)
 * before they reach the lookup-governance modal. This produces a coach-readable
 * canonical-shaped string:
 *   - lowercase number words → digits ("three" → "3", "twenty six" → "26")
 *   - Title-Case each token (uppercase single-letter tokens kept upper: "Z")
 *   - collapse whitespace
 *   - (field-aware variant) strip generic cue words that came from dictation
 *     ("formation"/"form", "play"/"run"/"call"/"called", "motion") so the
 *     modal proposes "Orange" not "Orange Formation".
 *
 * IMPORTANT: this never mutates the coach-visible raw transcript. It is only
 * applied to candidate values used for lookup governance / proposal display.
 *
 * Examples (generic):
 *   "green"            → "Green"
 *   "three jet sweep"  → "3 Jet Sweep"
 *   "two across"       → "2 Across"
 *   "twenty six punch" → "26 Punch"
 *   "z across"         → "Z Across"
 *
 * Examples (field-aware, see normalizeGovernedCandidateForField):
 *   offForm: "Orange formation"     → "Orange"
 *   offPlay: "play 33 dive"         → "33 Dive"
 *   offPlay: "33 dive play"         → "33 Dive"
 *   offPlay: "we run the play 33 dive" → "33 Dive"
 *   motion:  "four pirate motion"   → "4 Pirate"
 */

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS_WORDS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function titleCaseToken(tok: string): string {
  // Single uppercase letter tokens (Z, X, Y) stay as-is.
  if (tok.length === 1 && /[A-Z]/.test(tok)) return tok;
  // Pure digit token: leave as-is.
  if (/^\d+$/.test(tok)) return tok;
  // Otherwise: capitalize first letter, lowercase the rest.
  return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
}

export function normalizeGovernedCandidate(input: unknown): string {
  if (input === null || input === undefined) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  // Tokenize on whitespace; preserve hyphenated tokens as-is for now.
  const tokens = raw.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const lower = tok.toLowerCase();
    // Compound tens: "twenty six" → 26
    if (TENS_WORDS[lower] !== undefined) {
      const next = tokens[i + 1]?.toLowerCase();
      if (next && NUMBER_WORDS[next] !== undefined && NUMBER_WORDS[next] < 10) {
        out.push(String(TENS_WORDS[lower] + NUMBER_WORDS[next]));
        i++;
        continue;
      }
      out.push(String(TENS_WORDS[lower]));
      continue;
    }
    if (NUMBER_WORDS[lower] !== undefined) {
      out.push(String(NUMBER_WORDS[lower]));
      continue;
    }
    out.push(titleCaseToken(tok));
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Field-scoped cue words that get stripped from the candidate value before
 * generic normalization. These are dictation artifacts coaches naturally say
 * around the canonical name, e.g. "Orange formation", "play 33 dive",
 * "four pirate motion". They must never become part of the canonical lookup
 * value.
 *
 * Cue words are matched case-insensitively as whole tokens only.
 */
const CUE_WORDS_BY_FIELD: Record<string, ReadonlySet<string>> = {
  offForm: new Set(["formation", "form"]),
  offPlay: new Set(["play", "run", "call", "called", "ran"]),
  motion: new Set(["motion"]),
};

/** Generic cue-word filler that may appear adjacent to the canonical token. */
const GENERIC_CUE_FILLER = new Set([
  "the", "a", "an", "we", "we're", "were", "im", "i'm",
  "have", "has", "had", "is", "are", "was", "with", "in", "on", "at",
  // Trailing/leading conjunctions that bleed into a captured governed value
  // when the deterministic parser stops at the next anchor (e.g. "Poison and"
  // when followed by a PLAY anchor). Safe to drop for governed candidates.
  "and", "then", "but",
]);

/**
 * Field-aware variant of normalizeGovernedCandidate. Strips cue words specific
 * to the governed field (e.g. "formation" for offForm, "play"/"run"/"called"
 * for offPlay, "motion" for motion) AND a small set of generic filler words
 * that often surround them in dictation, then applies generic normalization
 * (number-words → digits, title casing, whitespace collapse).
 *
 * The strip is whole-token only — substrings inside legitimate canonical
 * tokens (e.g. "Form-X") are not touched.
 */
export function normalizeGovernedCandidateForField(input: unknown, fieldName: string): string {
  if (input === null || input === undefined) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  const cues = CUE_WORDS_BY_FIELD[fieldName];
  if (!cues) {
    // Non-governed (or unconfigured) field: fall through to generic normalize.
    return normalizeGovernedCandidate(raw);
  }
  const tokens = raw.split(/\s+/);
  const kept: string[] = [];
  for (const tok of tokens) {
    const lower = tok.toLowerCase().replace(/[.,;:!?]+$/g, "");
    if (!lower) continue;
    if (cues.has(lower)) continue;
    if (GENERIC_CUE_FILLER.has(lower)) continue;
    kept.push(tok);
  }
  // If stripping removed everything, fall back to the original generic
  // normalization rather than emitting an empty value (which would suppress
  // governance entirely).
  if (kept.length === 0) return normalizeGovernedCandidate(raw);
  return normalizeGovernedCandidate(kept.join(" "));
}
