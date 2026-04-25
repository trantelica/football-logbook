/**
 * Section Ownership Map — Pass 1 section-based candidate entry.
 *
 * Locks each Pass 1 Section to a strict subset of fields. AI interpretation,
 * deterministic parse application, and Clear are all section-scoped via this map.
 *
 * Derived fields (offStrength, personnel, playType, playDir, motionDir) are
 * intentionally NOT owned by any section — they continue to be derived
 * downstream from governed parent values.
 */

export type SectionId = "situation" | "playDetails" | "playResults";

export interface SectionDef {
  id: SectionId;
  title: string;
  /** Single-key shortcut for Dictate when Text Editing is OFF */
  dictateKey: string;
  /** Fields this section may write to */
  ownedFields: readonly string[];
}

export const SECTIONS: readonly SectionDef[] = [
  {
    id: "situation",
    title: "Situation",
    dictateKey: "S",
    ownedFields: ["qtr", "odk", "series", "twoMin", "patTry", "dn", "dist", "yardLn", "hash"],
  },
  {
    id: "playDetails",
    title: "Play Details",
    dictateKey: "D",
    ownedFields: ["offForm", "motion", "offPlay"],
  },
  {
    id: "playResults",
    title: "Play Results",
    dictateKey: "R",
    ownedFields: ["result", "gainLoss", "rusher", "passer", "receiver", "penalty", "penYards", "eff"],
  },
] as const;

export function getSection(id: SectionId): SectionDef {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown section: ${id}`);
  return s;
}

/** Reverse map: field name → owning section (or undefined for derived fields) */
const FIELD_TO_SECTION = new Map<string, SectionId>();
for (const s of SECTIONS) {
  for (const f of s.ownedFields) FIELD_TO_SECTION.set(f, s.id);
}

export function getOwningSection(fieldName: string): SectionId | undefined {
  return FIELD_TO_SECTION.get(fieldName);
}

/** All fields owned by any section (used to mask AI candidate context) */
export const ALL_SECTION_OWNED_FIELDS: readonly string[] = SECTIONS.flatMap((s) => s.ownedFields);
