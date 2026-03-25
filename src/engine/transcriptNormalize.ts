/**
 * Normalize speech-to-text transcript before deterministic parsing.
 * Cleans common STT artifacts, converts number words, and ensures anchors are uppercase.
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
];

const ANCHOR_RE = new RegExp(`\\b(${ANCHORS.join("|")})\\b`, "gi");

export function normalizeTranscriptForParse(s: string): string {
  let t = s;

  // Replace common STT spoken-punctuation artifacts
  t = t.replace(/\bspace\b/gi, " ");
  t = t.replace(/\bdash\b/gi, "-");
  t = t.replace(/\bslash\b/gi, "/");

  // Normalize GN/LS variants: "GN / LS", "GN/LS", "GN - LS"
  t = t.replace(/\bGN\s*[\/\-]\s*LS\b/gi, "GN/LS");

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
