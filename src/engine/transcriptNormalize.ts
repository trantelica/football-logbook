/**
 * Normalize speech-to-text transcript before deterministic parsing.
 * Cleans common STT artifacts, converts number words, expands phrase-based
 * markers into canonical anchor tokens, and ensures anchors are uppercase.
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
const PHRASE_NORMALIZATIONS: [RegExp, string][] = [
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
  [/\bball\s+(?:is\s+)?on\s+(?:the\s+)?(?:our\s+)?(-?\d+)\b/gi, "YARD $1"],
  [/\bball\s+(?:is\s+)?on\s+(?:the\s+)?their\s+(\d+)\b/gi, "YARD $1"],

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

  // Two-minute phrases
  [/\btwo\s+minute\b/gi, "2MIN"],
  [/\b2\s+minute\b/gi, "2MIN"],

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

export function normalizeTranscriptForParse(s: string): string {
  let t = s;

  // Replace common STT spoken-punctuation artifacts
  t = t.replace(/\bspace\b/gi, " ");
  t = t.replace(/\bdash\b/gi, "-");
  t = t.replace(/\bslash\b/gi, "/");

  // Apply phrase normalizations (order matters)
  for (const [re, replacement] of PHRASE_NORMALIZATIONS) {
    t = t.replace(re, replacement);
  }

  // Convert number words to digits (0-20)
  t = t.replace(NUMBER_WORD_RE, (m) => NUMBER_WORDS[m.toLowerCase()]);

  // Collapse whitespace
  t = t.replace(/\s+/g, " ").trim();

  // Normalize "YARD - 20" → "YARD -20" (anchor followed by space-dash-space-number)
  t = t.replace(/\b(YARD)\s+-\s*(\d)/gi, "$1 -$2");

  // Uppercase all anchors
  t = t.replace(ANCHOR_RE, (m) => m.toUpperCase());

  return t;
}
