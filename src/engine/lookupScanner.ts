/**
 * Section-Aware Known Lookup Scanner (Slice B)
 *
 * Pure deterministic guardrail that finds KNOWN season-scoped lookup values
 * (offForm / offPlay / motion) in coach text, scoped to the active Pass 1
 * section's owned fields.
 *
 * Guarantees:
 *  - Returns only values present in the provided lookup map (never invents
 *    canonicals; never fuzzy-matches; no broad language interpretation).
 *  - Only operates on the intersection of (allowedFields, governed fields).
 *  - Never emits derived fields (offStrength/personnel/playType/playDir/motionDir).
 *  - Whole-token, case-insensitive, whitespace-normalized matching.
 *  - Per field: longest match wins → tie on length → earliest start wins →
 *    still tied with two distinct canonicals at the same span → drop the field.
 *  - Multi-token canonical values supported up to their actual token length
 *    (no hard 1..4 cap).
 *
 * The scanner does not commit, does not bypass governance, and does not write
 * dependent fields. Output is meant to flow through the existing proposal
 * pipeline.
 */

export type GovernedLookupField = "offForm" | "offPlay" | "motion";

const GOVERNED_FIELDS: readonly GovernedLookupField[] = ["offForm", "offPlay", "motion"] as const;
const GOVERNED_FIELD_SET: ReadonlySet<string> = new Set(GOVERNED_FIELDS);

export interface LookupScanHit {
  fieldName: GovernedLookupField;
  /** The exact canonical value as stored in the lookup table. */
  canonical: string;
  /** Number of normalized tokens in the canonical value. */
  tokenLength: number;
  /** Character offset in the normalized input where the match starts. */
  startIndex: number;
  /** Character offset (exclusive) in the normalized input. */
  endIndex: number;
}

export interface LookupScanResult {
  /** Per-field winning hit, if any. */
  perField: Partial<Record<GovernedLookupField, LookupScanHit>>;
  /** Flat winners list (mirrors perField values). */
  hits: LookupScanHit[];
}

/** Lowercase + collapse internal whitespace. Matches canonicalizeLookupValue. */
function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find all whole-token (case-insensitive) occurrences of `canonical` inside
 * `normalizedText`. Whole-token boundary uses non-word lookarounds so digit
 * runs like "39" and tokens like "Z" are matched intact.
 */
function findAllOccurrences(
  canonical: string,
  normalizedText: string,
): Array<{ start: number; end: number }> {
  const norm = normalize(canonical);
  if (!norm) return [];
  const re = new RegExp(`(?:^|\\W)(${escapeRegex(norm)})(?=$|\\W)`, "g");
  const out: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalizedText)) !== null) {
    const start = m.index + (m[0].length - m[1].length);
    out.push({ start, end: start + m[1].length });
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
  }
  return out;
}

function tokenLength(canonical: string): number {
  const n = normalize(canonical);
  if (!n) return 0;
  return n.split(" ").length;
}

/**
 * Scan `text` for known lookup values within `allowedFields`.
 *
 * @param text          coach text (transcript-normalized text is fine)
 * @param lookupMap     fieldName → known canonical values
 * @param allowedFields the active section's owned fields (any superset OK;
 *                      scanner intersects with governed fields itself)
 */
export function scanKnownLookups(
  text: string,
  lookupMap: Map<string, string[]>,
  allowedFields: readonly string[],
): LookupScanResult {
  const result: LookupScanResult = { perField: {}, hits: [] };
  if (!text || typeof text !== "string") return result;

  const normalizedText = normalize(text);
  if (!normalizedText) return result;

  const allowed = new Set(allowedFields);

  for (const field of GOVERNED_FIELDS) {
    if (!allowed.has(field)) continue;
    const values = lookupMap.get(field) ?? [];
    if (values.length === 0) continue;

    interface Candidate {
      canonical: string;
      tokenLength: number;
      start: number;
      end: number;
    }
    const candidates: Candidate[] = [];
    for (const v of values) {
      const occ = findAllOccurrences(v, normalizedText);
      if (occ.length === 0) continue;
      const tlen = tokenLength(v);
      for (const o of occ) {
        candidates.push({ canonical: v, tokenLength: tlen, start: o.start, end: o.end });
      }
    }
    if (candidates.length === 0) continue;

    let best: Candidate | null = null;
    let tieBlocked = false;
    for (const c of candidates) {
      if (!best) {
        best = c;
        continue;
      }
      const cLen = c.end - c.start;
      const bLen = best.end - best.start;
      if (cLen > bLen) {
        best = c;
        tieBlocked = false;
      } else if (cLen === bLen) {
        if (c.start < best.start) {
          best = c;
          tieBlocked = false;
        } else if (c.start === best.start) {
          if (normalize(c.canonical) !== normalize(best.canonical)) {
            tieBlocked = true;
          }
          // identical canonical at identical position → same hit, ignore
        }
        // else: existing best wins on earlier position
      }
    }
    if (!best || tieBlocked) continue;

    const hit: LookupScanHit = {
      fieldName: field,
      canonical: best.canonical,
      tokenLength: best.tokenLength,
      startIndex: best.start,
      endIndex: best.end,
    };
    result.perField[field] = hit;
    result.hits.push(hit);
  }

  return result;
}

export function isGovernedLookupField(name: string): name is GovernedLookupField {
  return GOVERNED_FIELD_SET.has(name);
}
