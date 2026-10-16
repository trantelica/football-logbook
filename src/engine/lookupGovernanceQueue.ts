import { normalizeGovernedCandidateForField } from "./governedValueNormalize";
import { getFieldDef, playSchema } from "./schema";

export interface LookupGovernanceItem {
  fieldName: string;
  fieldLabel: string;
  value: string;
  source?: "ai" | "manual";
}

/** Only coach-maintained lists participate; fixed enums never enter add-value review. */
export const GOVERNED_LOOKUP_FIELD_NAMES = playSchema
  .filter((field) => field.lookupMode === "season" && !field.allowedValues)
  .map((field) => field.name);

function canonicalizeLookupValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildLookupGovernanceQueue(
  candidate: Record<string, unknown>,
  lookupMap: Map<string, string[]>,
  aiProposedFields?: Set<string>,
): LookupGovernanceItem[] {
  const queue: LookupGovernanceItem[] = [];
  for (const fieldName of GOVERNED_LOOKUP_FIELD_NAMES) {
    const raw = candidate[fieldName];
    if (raw === null || raw === undefined || raw === "") continue;
    const normalized = normalizeGovernedCandidateForField(raw, fieldName) || String(raw).trim();
    if (!normalized) continue;
    const known = lookupMap.get(fieldName) ?? [];
    const exists = known.some((value) => canonicalizeLookupValue(value) === canonicalizeLookupValue(normalized));
    if (exists) continue;
    const fieldDef = getFieldDef(fieldName);
    queue.push({
      fieldName,
      fieldLabel: fieldDef?.label ?? fieldName,
      value: normalized,
      source: aiProposedFields?.has(fieldName) ? "ai" : "manual",
    });
  }
  return queue;
}