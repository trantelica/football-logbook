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

  // Ordinal "and N" phrases (no explicit "down" word required).
  // Examples: "4th and 10", "first and goal" (skipped — only digit), "third and 7".
  // Run BEFORE the bare ordinal-down rules so we capture both DN and DIST in one pass.
  [/\b(1st|first)\s+and\s+(\d+)\b/gi, "DN 1 DIST $2"],
  [/\b(2nd|second)\s+and\s+(\d+)\b/gi, "DN 2 DIST $2"],
  [/\b(3rd|third)\s+and\s+(\d+)\b/gi, "DN 3 DIST $2"],
  [/\b(4th|fourth)\s+and\s+(\d+)\b/gi, "DN 4 DIST $2"],

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
  // "from their N" / "from our N" / "on their N yard line" — handle BEFORE generic.
  [/\bfrom\s+(?:the\s+)?their\s+(\d+)(?:\s+yard\s*line)?\b/gi, "YARD $1"],
  [/\bfrom\s+(?:the\s+)?our\s+(\d+)(?:\s+yard\s*line)?\b/gi, "YARD -$1"],
  [/\bon\s+(?:the\s+)?their\s+(\d+)(?:\s+yard\s*line)?\b/gi, "YARD $1"],
  [/\bon\s+(?:the\s+)?our\s+(\d+)(?:\s+yard\s*line)?\b/gi, "YARD -$1"],
  // "ball on the N" (no side qualifier) — positive
  [/\bball\s+(?:is\s+)?on\s+(?:the\s+)?(-?\d+)\b/gi, "YARD $1"],

  // "right side of the field" / "left side of the field" / "middle of the field"
  [/\bright\s+side\s+of\s+the\s+field\b/gi, "HASH R"],
  [/\bleft\s+side\s+of\s+the\s+field\b/gi, "HASH L"],
  [/\bmiddle\s+of\s+the\s+field\b/gi, "HASH M"],

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
  // Single-token motion (run BEFORE the 2-token rule so "with a jet motion"
  // doesn't get parsed as "<a> jet motion").
  [/\b(?:with(?:\s+a)?|in|on)?\s*(jet|fly|orbit|return)\s+motion\b/gi,
    (_m, dir: string) => `MOTION ${dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase()}`],
  // Two-token motion: "<token> <direction> motion".
  // `who` is restricted to a digit-string OR a single uppercase letter (case-sensitive
  // matcher in a case-insensitive regex still matches lowercase letters; we filter
  // article "a"/"an" inside the replacement function and bail out if matched).
  [/\b(?:with(?:\s+a)?|in|on)?\s*((?:\d+|[A-Z]))\s+(across|out|in|over|under|return)\s+motion\b/gi,
    (m, who: string, dir: string) => {
      // Reject the indefinite article being captured as `who`.
      if (/^(a|an)$/i.test(who)) return m;
      return `MOTION ${who.toUpperCase()} ${dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase()}`;
    }],

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
  // "ball being carried by N" / "the ball was carried by N" / "carried by N" / "rushed by N"
  [/\b(?:ball\s+)?(?:being\s+|was\s+)?carried\s+by\s+(?:#|number\s+)?(\d+)/gi, "RUSHER $1"],
  [/\brushed\s+by\s+(?:#|number\s+)?(\d+)/gi, "RUSHER $1"],
  // "handed off to N" / "hand off to N"
  [/\bhand(?:ed)?\s+off\s+to\s+(?:#|number\s+)?(\d+)/gi, "RUSHER $1"],

  // ── PASSER (solo) ──
  // "number 12 threw it", "12 threw it", "#12 threw it"
  [/(?:#|number\s+)?(\d+)\s+(?:threw|throws|passed|passes)\s+(?:it|the\s+ball)\b/gi, "PASSER $1"],
  // "thrown by 12", "passed by 12"
  [/\b(?:thrown|passed)\s+by\s+(?:#|number\s+)?(\d+)/gi, "PASSER $1"],
  // "N is at quarterback" / "quarterback is N" / "N at quarterback"
  [/(?:#|number\s+)?(\d+)\s+(?:is\s+)?at\s+quarterback\b/gi, "PASSER $1"],
  [/\bquarterback\s+is\s+(?:#|number\s+)?(\d+)/gi, "PASSER $1"],
  // "N was the quarterback" / "N is the quarterback" / "#0 was the quarterback"
  [/(?:#|number\s+)?(\d+)\s+(?:was|is)\s+the\s+quarterback\b/gi, "PASSER $1"],
  // "the quarterback was N" / "the quarterback is N"
  [/\bthe\s+quarterback\s+(?:was|is)\s+(?:#|number\s+)?(\d+)/gi, "PASSER $1"],

  // ── RECEIVER (solo) ──
  // "caught by 88", "caught by number 88", "caught by #88"
  [/\bcaught\s+by\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  // "received by 4", "received by number 4"
  [/\breceived\s+by\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  // "88 caught it", "88 catches it"
  [/(?:#|number\s+)?(\d+)\s+(?:caught|catches)\s+(?:it|the\s+ball|the\s+pass)\b/gi, "RECEIVER $1"],
  // "target was 88" / "targeted 88"
  [/\btargeted\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  [/\btarget\s+was\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  // "(pass was) thrown to N" / "throw to N" / "to number N" (after "thrown"/"pass to")
  [/\b(?:pass(?:\s+was)?\s+)?thrown\s+to\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  [/\bpass(?:\s+was)?\s+to\s+(?:#|number\s+)?(\d+)/gi, "RECEIVER $1"],
  // "complete to N" / "complete to number 4" — emit BOTH the RESULT and
  // the RECEIVER so a single phrase carries both pieces of information.
  // Narrow: only fires on explicit "complete to <jersey>" cue, never on a
  // bare jersey mention.
  [/\bcomplete\s+to\s+(?:#|number\s+)?(\d+)/gi, "RESULT Complete RECEIVER $1"],
  // "incomplete to N" — same shape for the negative case.
  [/\bincomplete\s+to\s+(?:#|number\s+)?(\d+)/gi, "RESULT Incomplete RECEIVER $1"],

  // ── PASSER (additional pass-by phrasing) ──
  // "the pass by N" / "pass by number 0" / "pass by #0"
  [/\b(?:the\s+)?pass\s+by\s+(?:#|number\s+)?(\d+)/gi, "PASSER $1"],
  // "thrown by N" already handled above under PASSER (solo).

  // ── RESULT (Play Results: explicit pass-outcome cues) ──
  // Run AFTER the RECEIVER patterns above, which consume "pass to N" /
  // "caught by N" / etc. The remaining context still contains an explicit
  // outcome cue we can map. Each rule produces a clean "RESULT <Value>" token
  // (single canonical word) so the deterministic parser matches RESULT_VALUES
  // exactly without ambiguity.
  //
  // Incomplete cues — collapsed to canonical "RESULT Incomplete":
  [/\b(?:the\s+)?(?:pass|ball)\s+(?:was\s+|fell\s+)?incomplete\b/gi, "RESULT Incomplete"],
  [/\bincomplete\s+pass\b/gi, "RESULT Incomplete"],
  [/\bincomplete\s+(?=RECEIVER\b)/gi, "RESULT Incomplete "],
  // Bare "incomplete" only when not already part of a previously-emitted RESULT.
  // Bare "incomplete" only when not already part of a previously-emitted
  // "RESULT Incomplete" token (negative lookbehind).
  [/(?<!RESULT\s)\bincomplete\b/gi, "RESULT Incomplete"],
  //
  // Complete cues — collapsed to canonical "RESULT Complete":
  [/\b(?:the\s+)?(?:pass|ball)\s+was\s+caught\b/gi, "RESULT Complete"],
  [/\b(?:the\s+)?pass\s+was\s+complete\b/gi, "RESULT Complete"],
  [/\bcomplete\s+pass\b/gi, "RESULT Complete"],
  [/\bcomplete\s+(?=RECEIVER\b)/gi, "RESULT Complete "],

  // ── Gain/loss natural-language (Play Results) ──
  // "we gained N yards" / "gained N yards" / "picked up N yards"
  [/\b(?:we\s+)?(?:gained|gain|picked\s+up)\s+(\d+)\s+yards?\b/gi, "GN/LS $1"],
  // "we lost N yards" / "lost N yards"
  [/\b(?:we\s+)?(?:lost|lose)\s+(\d+)\s+yards?\b/gi, "GN/LS -$1"],
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

