/**
 * Phraseology Baseline — Tier 1 (global, immutable at runtime).
 *
 * Teaches the AI how coaches commonly speak about specific field concepts.
 * These hints are included in the AI context packet for relevant unresolved fields.
 *
 * Governed and versioned. Updated only via app releases.
 */

export interface PhraseologyHint {
  fieldName: string;
  hints: string[];
}

const baseline: PhraseologyHint[] = [
  {
    fieldName: "yardLn",
    hints: [
      "'our 20' or 'our 20-yard line' = team's own 20 (negative signed value in Hudl-centered model)",
      "'their 35' = opponent's 35 (positive signed value in Hudl-centered model)",
      "'on the 40' = ambiguous possession side — OMIT rather than guess if 'our'/'their' is unclear",
      "'midfield' = the 50 (on 100-yard field) or 40 (on 80-yard field)",
      "Value is a signed integer: negative = own territory, positive = opponent territory",
    ],
  },
  {
    fieldName: "hash",
    hints: [
      "'left hash' = L",
      "'right hash' = R",
      "'middle of the field' or 'middle' = M",
      "'wide side' or 'short side' are ambiguous without additional context — omit if unclear",
    ],
  },
  {
    fieldName: "result",
    hints: [
      "'complete' / 'caught' / 'completion' = Complete",
      "'incomplete' / 'dropped' / 'overthrown' = Incomplete",
      "'picked off' / 'intercepted' / 'INT' = Interception",
      "'sack' / 'got sacked' = Sack",
      "'sack fumble' / 'sacked and fumbled' = Sack, Fumble",
      "'first down' / 'picked up the first' = 1st DN",
      "'touchdown' / 'TD' / 'scored' = TD",
      "'fumble' / 'fumbled' = Fumble",
      "'rush' / 'ran it' / 'carried' = Rush",
    ],
  },
  {
    fieldName: "gainLoss",
    hints: [
      "'gain of 6' / 'picked up 6' / 'got about six' = gainLoss positive integer",
      "'loss of 3' / 'lost 3' / 'dropped back for a loss' = gainLoss negative integer",
      "'no gain' = gainLoss 0",
      "Value must be an integer (positive for gain, negative for loss, 0 for no gain)",
    ],
  },
  {
    fieldName: "offForm",
    hints: [
      "Coach typically names the formation directly from the playbook",
      "Formation usually appears before the play name in dictation",
      "'gun' often means 'Shotgun' prefix",
      "'trips' typically means 3 receivers to one side",
      "Must match a governed lookup value EXACTLY — do not invent formations",
    ],
  },
  {
    fieldName: "offPlay",
    hints: [
      "Coach typically names the play directly from the playbook",
      "Play name usually appears after the formation in dictation",
      "May include a number prefix (e.g., '24 dive', '36 counter')",
      "Must match a governed lookup value EXACTLY — do not invent plays",
    ],
  },
];

const baselineMap = new Map<string, string[]>();
for (const entry of baseline) {
  baselineMap.set(entry.fieldName, entry.hints);
}

/** Get Tier 1 phraseology hints for a given field, or empty array */
export function getBaselinePhraseology(fieldName: string): string[] {
  return baselineMap.get(fieldName) ?? [];
}
