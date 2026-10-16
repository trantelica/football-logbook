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

export type SectionId =
  | "situation" | "playDetails" | "playResults"
  | "defSituation" | "defCall" | "defResults" | "defPlaymakers";

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

/**
 * Pass 4 (defense, ODK = D) cards. Same card engine as Pass 1; Playmakers is
 * roster-backed and fully optional.
 */
export const DEF_SECTIONS: readonly SectionDef[] = [
  {
    id: "defSituation",
    title: "Situation",
    dictateKey: "S",
    ownedFields: ["qtr", "odk", "series", "twoMin", "dn", "dist", "yardLn", "hash"],
  },
  {
    id: "defCall",
    title: "Defensive Call",
    dictateKey: "D",
    ownedFields: ["defFront", "defStrength", "blitz", "coverage", "playType"],
  },
  {
    id: "defResults",
    title: "Results",
    dictateKey: "R",
    ownedFields: ["result", "gainLoss", "penalty", "penYards", "eff", "retYards"],
  },
  {
    id: "defPlaymakers",
    title: "Playmakers",
    dictateKey: "P",
    ownedFields: [
      "tackler1", "tackler2", "tackler3", "tackler4",
      "coverPlayer", "interceptedBy", "pbr", "dawg", "unsung",
    ],
  },
] as const;

/** Card set for a pass: Pass 4 uses the defensive cards, everything else Pass 1's. */
export function getSectionsForPass(pass: number): readonly SectionDef[] {
  return pass === 4 ? DEF_SECTIONS : SECTIONS;
}

export function getDefOwningSection(fieldName: string): SectionId | undefined {
  return DEF_SECTIONS.find((s) => s.ownedFields.includes(fieldName))?.id;
}

export function getSection(id: SectionId): SectionDef {
  const s = [...SECTIONS, ...DEF_SECTIONS].find((x) => x.id === id);
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
