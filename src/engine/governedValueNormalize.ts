/**
 * Governed Lookup Value Normalization
 *
 * Used to clean up governed lookup field candidates (offForm, offPlay, motion)
 * before they reach the lookup-governance modal. This produces a coach-readable
 * canonical-shaped string:
 *   - lowercase number words → digits ("three" → "3", "twenty six" → "26")
 *   - Title-Case each token (uppercase single-letter tokens kept upper: "Z")
 *   - collapse whitespace
 *
 * IMPORTANT: this never mutates the coach-visible raw transcript. It is only
 * applied to candidate values used for lookup governance / proposal display.
 *
 * Examples:
 *   "green"            → "Green"
 *   "three jet sweep"  → "3 Jet Sweep"
 *   "two across"       → "2 Across"
 *   "twenty six punch" → "26 Punch"
 *   "z across"         → "Z Across"
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
