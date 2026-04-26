/**
 * Normalize speech-to-text transcript before deterministic parsing.
 * Cleans common STT artifacts, converts number words, expands phrase-based
 * markers into canonical anchor tokens, and ensures anchors are uppercase.
 *
 * This module is INTERNAL normalization: it produces text used for
 * deterministic interpretation only. The coach-visible raw transcript is
 * never mutated by this function.
 *
 * Based on Pass 1 Parser Scaffold.
 */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};

const NUMBER_WORD_RE = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

/** Tens for compound number-word handling: "eighty eight" → 88, "thirty" → 30 */
const TENS_WORDS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const ONES_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9,
};
const TENS_RE = new RegExp(
  `\\b(${Object.keys(TENS_WORDS).join("|")})(?:[\\s-]+(${Object.keys(ONES_WORDS).join("|")}))?\\b`,
  "gi",
);

const ANCHORS = [
  "GN/LS", "GNLS", "PENYARDS", "2MIN",
  "PENALTY", "RESULT", "MOTION", "FORM", "PLAY",
  "RECEIVER", "RUSHER", "PASSER",
  "YARD", "HASH", "DIST", "DN", "EFF",
  // Extended markers from scaffold
  "GAIN", "LOSS", "GN", "LS",
];

const ANCHOR_RE = new RegExp(`\\b(${ANCHORS.join("|")})\\b`, "gi");

/**
 * Phrase-to-anchor normalization rules.
 * Applied BEFORE anchor uppercasing so replacements produce canonical anchor tokens.
 * Order matters — longer / more specific phrases first.
 */
type PhraseRule = [RegExp, string] | [RegExp, (substring: string, ...args: string[]) => string];
const PHRASE_NORMALIZATIONS: PhraseRule[] = [
  // GN/LS variants via spoken punctuation
  [/\bGN\s*[/-]\s*LS\b/gi, "GN/LS"],

  // Down phrases: "1st down", "2nd down", "3rd down", "4th down", "down 3"
  [/\b(1st|first)\s+down\b/gi, "DN 1"],
  [/\b(2nd|second)\s+down\b/gi, "DN 2"],
  [/\b(3rd|third)\s+down\b/gi, "DN 3"],
  [/\b(4th|fourth)\s+down\b/gi, "DN 4"],
  [/\bdown\s+(\d+)\b/gi, "DN $1"],

  // Distance phrases: "3rd and 7", "4th and 1", "and 7 to go", "need 7"
  // Note: "3rd and 7" already has DN from above, this catches "and N" after DN
  [/\band\s+(\d+)\s+to\s+go\b/gi, "DIST $1"],
  [/\band\s+(\d+)\b/gi, "DIST $1"],
  [/\bneed\s+(\d+)\b/gi, "DIST $1"],
  [/\b(\d+)\s+to\s+go\b/gi, "DIST $1"],

  // Yard-line phrases: "yard line", "yardline", "YL", "ball on the 28"
  [/\byard\s*line\b/gi, "YARD"],
  [/\byardline\b/gi, "YARD"],
  [/\bYL\b/g, "YARD"],
  // "our" side → negative yard-line value
  [/\bball\s+(?:is\s+)?on\s+(?:the\s+)?our\s+(\d+)\b/gi, "YARD -$1"],
  [/\bball\s+(?:is\s+)?on\s+(?:the\s+)?their\s+(\d+)\b/gi, "YARD $1"],
  // Generic "ball on the N" (no side qualifier) — positive
  [/\bball\s+(?:is\s+)?on\s+(?:the\s+)?(-?\d+)\b/gi, "YARD $1"],

  // Gain/loss phrases: "3 yard gain", "4 yard loss", "no gain", "plus 5", "minus 3"
  [/\bno\s+gain\b/gi, "GN/LS 0"],
  [/\b(\d+)\s+yard\s+gain\b/gi, "GN/LS $1"],
  [/\b(\d+)\s+yard\s+loss\b/gi, "GN/LS -$1"],
  [/\bplus\s+(\d+)\b/gi, "GN/LS $1"],
  [/\bminus\s+(\d+)\b/gi, "GN/LS -$1"],

  // Gain/Loss single-word markers mapped to GN/LS
  [/\bgain\s+(\d+)\b/gi, "GN/LS $1"],
  [/\bloss\s+(\d+)\b/gi, "GN/LS -$1"],

  // Formation phrase: "formation"
  [/\bformation\b/gi, "FORM"],

  // Motion phrases: "<token> <direction> motion" → "MOTION <token> <Direction>"
  // Examples handled:
  //   "with a 2 across motion"          → "MOTION 2 Across"
  //   "with a two across motion"        → "MOTION 2 Across"   (after number-word pass)
  //   "Z across motion"                 → "MOTION Z Across"
  //   "in 3 out motion"                 → "MOTION 3 Out"
  //   "with a jet motion"               → "MOTION Jet"
  // Direction tokens kept narrow to known motion directions to avoid greedy grabs.
  [/\b(?:with(?:\s+a)?|in|on)?\s*((?:\d+|[A-Z]))\s+(across|out|in|over|under|return|jet|fly|orbit)\s+motion\b/gi,
    (_m, who: string, dir: string) =>
      `MOTION ${who.toUpperCase()} ${dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase()}`],
  // Single-token motion: "with a jet motion", "jet motion"
  [/\b(?:with(?:\s+a)?|in|on)?\s*(jet|fly|orbit|return|across|out)\s+motion\b/gi,
    (_m, dir: string) => `MOTION ${dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase()}`],

  // Two-minute phrases — marker presence implies Y
  [/\btwo\s+minute\b/gi, "2MIN Y"],
  [/\b2\s+minute\b/gi, "2MIN Y"],

  // Actor phrases (scaffold-supported pattern-based)
  [/\bquarterback\b/gi, "PASSER"],
  [/\bQB\b/g, "PASSER"],
  [/\bball\s+carrier\b/gi, "RUSHER"],
  [/\btarget\b/gi, "RECEIVER"],

  // Penalty phrases
  [/\bflagged\b/gi, "PENALTY"],

  // Hash phrases: "left hash", "right hash", "middle hash"
  [/\bleft\s+hash\b/gi, "HASH L"],
  [/\bright\s+hash\b/gi, "HASH R"],
  [/\bmiddle\s+hash\b/gi, "HASH M"],

  // "call" and "concept" as PLAY markers
  [/\bcall\b/gi, "PLAY"],
  [/\bconcept\b/gi, "PLAY"],
];

/**
 * Light, narrowly-scoped STT artifact substitutions for football vocabulary.
 * Each rule is conservative and only fires inside a recognizable football
 * context to avoid corrupting unrelated text. These run BEFORE actor / phrase
 * normalization so downstream rules see canonical words.
 */
const STT_SAFETY_SUBSTITUTIONS: [RegExp, string][] = [
  // "Russia" is a frequent mis-recognition of "rusher" in coach dictation.
  // Only treat it as "rusher" when it appears in an actor/result-shaped context:
  //   "<digit> is the russia"          → rusher cue
  //   "russia <digit>"                 → rusher cue (anchor-led)
  //   "the russia"                     → rusher cue (followed by digits later)
  // We deliberately do NOT replace bare "Russia" outside these contexts.
  [/\b(\d+)\s+is\s+the\s+russia\b/gi, "$1 is the rusher"],
  [/\bthe\s+russia\b/gi, "the rusher"],
  [/\brussia\s+(\d+)\b/gi, "rusher $1"],
];

/**
 * Actor extraction patterns. These produce canonical anchor-led tokens
 * (RUSHER N / PASSER N / RECEIVER N) regardless of whether the jersey number
 * appears before or after the actor cue. They MUST run after number-word
 * conversion (so "number four" becomes "number 4") and BEFORE the bare
 * "ball carrier"→RUSHER / "QB"→PASSER rules in PHRASE_NORMALIZATIONS, which
 * would otherwise strip the jersey number.
 *
 * "Number" / "#" prefixes on jersey numbers are accepted but optional.
 */
const ACTOR_NORMALIZATIONS: [RegExp, string][] = [
  // ── PASSER + RECEIVER pair (run first — most specific) ──
  // "12 passed to 88", "12 threw to 88", "12 throws to 88"
  [/(?:#|number\s+)?(\d+)\s+(?:passed|threw|throws|pass|throw)\s+(?:it\s+)?to\s+(?:#|number\s+)?(\d+)/gi, "PASSER $1 RECEIVER $2"],
  // "12 to 88 complete/incomplete" — keep narrow; require explicit verb above instead.

  // ── RUSHER ──
  // "number 4 is the ball carrier" / "#4 is the ball carrier" / "4 is the ball carrier"
  [/(?:#|number\s+)?(\d+)\s+is\s+the\s+ball\s+carrier\b/gi, "RUSHER $1"],
  // "ball carrier is number 4" / "ball carrier is 4" / "ball carrier is #4"
  [/\bball\s+carrier\s+is\s+(?:#|number\s+)?(\d+)/gi, "RUSHER $1"],
  // "4 is the rusher" / "number 4 is the rusher"
  [/(?:#|number\s+)?(\d+)\s+is\s+the\s+rusher\b/gi, "RUSHER $1"],
  // "4 carried it", "4 carries it", "4 ran it"
  [/(?:#|number\s+)?(\d+)\s+(?:carried|carries|ran|rushed)\s+(?:it|the\s+ball)\b/gi, "RUSHER $1"],

  // ── PASSER (solo) ──
  // "number 12 threw it", "12 threw it", "#12 threw it"
  [/(?:#|number\s+)?(\d+)\s+(?:threw|throws|passed|passes)\s+(?:it|the\s+ball)\b/gi, "PASSER $1"],
  // "thrown by 12", "passed by 12"
  [/\b(?:thrown|passed)\s+by\s+(?:#|number\s+)?(\d+)/gi, "PASSER $1"],

  // ── RECEIVER (solo) ──
  // "caught by 88", "caught by number 88", "caught by #88"
  [/\bcaught\s+by\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  // "88 caught it", "88 catches it"
  [/(?:#|number\s+)?(\d+)\s+(?:caught|catches)\s+(?:it|the\s+ball|the\s+pass)\b/gi, "RECEIVER $1"],
  // "target was 88" / "targeted 88"
  [/\btargeted\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  [/\btarget\s+was\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
];

/**
 * Convert compound number words like "eighty eight" / "thirty-two" to digits.
 * Keeps standalone tens ("thirty" → 30) and bare ones (handled by NUMBER_WORD_RE).
 */
function normalizeCompoundNumbers(t: string): string {
  return t.replace(TENS_RE, (_m, tens: string, ones: string | undefined) => {
    const tensVal = TENS_WORDS[tens.toLowerCase()] ?? 0;
    const onesVal = ones ? ONES_WORDS[ones.toLowerCase()] ?? 0 : 0;
    return String(tensVal + onesVal);
  });
}

export function normalizeTranscriptForParse(s: string): string {
  let t = s;

  // Replace common STT spoken-punctuation artifacts
  t = t.replace(/\bspace\b/gi, " ");
  t = t.replace(/\bdash\b/gi, "-");
  t = t.replace(/\bslash\b/gi, "/");

  // Light STT safety substitutions (narrow football contexts only)
  for (const [re, replacement] of STT_SAFETY_SUBSTITUTIONS) {
    t = t.replace(re, replacement);
  }

  // Convert number words to digits FIRST so actor patterns can match digits.
  t = normalizeCompoundNumbers(t);
  t = t.replace(NUMBER_WORD_RE, (m) => NUMBER_WORDS[m.toLowerCase()]);

  // Actor patterns — MUST run before generic phrase normalizations strip
  // the jersey number from "ball carrier" / "QB" cues.
  for (const [re, replacement] of ACTOR_NORMALIZATIONS) {
    t = t.replace(re, replacement);
  }

  // Apply phrase normalizations (order matters)
  for (const [re, replacement] of PHRASE_NORMALIZATIONS) {
    if (typeof replacement === "string") {
      t = t.replace(re, replacement);
    } else {
      t = t.replace(re, replacement);
    }
  }

  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();

  // Normalize "YARD - 20" → "YARD -20" (anchor followed by space-dash-space-number)
  t = t.replace(/\b(YARD)\s+-\s*(\d)/gi, "$1 -$2");

  // Uppercase all anchors
  t = t.replace(ANCHOR_RE, (m) => m.toUpperCase());

  return t;
}

