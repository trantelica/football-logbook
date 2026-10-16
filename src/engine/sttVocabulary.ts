/**
 * STT vocabulary registry — season-aware keyword hints for the transcription
 * service. Pure module state; set by DraftPanel from lookups + roster, read by
 * useTranscriptCapture. Never affects parsing or transactions.
 */

const BASE_TERMS = [
  "DN", "DIST", "YARD", "HASH", "RESULT", "GAIN", "LOSS", "PENALTY",
  "formation", "play", "motion", "rusher", "passer", "receiver",
  "LT", "LG", "C", "RG", "RT", "X", "Y", "Z", "H", "F", "O line",
  "1st and 10", "2nd and 7", "3rd and 3", "4th and 1",
];

const KEYWORD_FIELDS = ["offForm", "offPlay", "motion", "defFront", "blitz", "coverage", "penalty", "result"];
const MAX_KEYWORDS = 200;

let current: string[] = BASE_TERMS.slice();

export function buildSttVocabulary(
  lookupMap: Map<string, string[]>,
  roster: { jerseyNumber: number; playerName: string }[],
): string[] {
  const out = new Set<string>(BASE_TERMS);
  for (const f of KEYWORD_FIELDS) for (const v of lookupMap.get(f) ?? []) if (v?.trim()) out.add(v.trim());
  for (const r of roster) if (r.playerName?.trim()) out.add(r.playerName.trim());
  return Array.from(out).slice(0, MAX_KEYWORDS);
}

export function setSttVocabulary(words: string[]) {
  current = words.slice(0, MAX_KEYWORDS);
}

export function getSttVocabulary(): string[] {
  return current;
}
