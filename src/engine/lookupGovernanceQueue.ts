import { normalizeGovernedCandidateForField } from "./governedValueNormalize";
import { getFieldDef } from "./schema";

export interface LookupGovernanceItem {
  fieldName: string;
  fieldLabel: string;
  value: string;
  source?: "ai" | "manual";
}

const GOVERNED_FIELD_ORDER = ["offForm", "offPlay", "motion"] as const;

function canonicalizeLookupValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildLookupGovernanceQueue(
  candidate: Record<string, unknown>,
  lookupMap: Map<string, string[]>,
  aiProposedFields?: Set<string>,
): LookupGovernanceItem[] {
  const queue: LookupGovernanceItem[] = [];
  for (const fieldName of GOVERNED_FIELD_ORDER) {
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