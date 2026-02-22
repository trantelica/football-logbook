/**
 * Football Engine — Phase 5C EFF (Efficiency) Computation
 *
 * Deterministic efficiency calculation at commit time.
 * No side effects, no state mutation.
 */

export interface EffInput {
  result: string | null;
  gainLoss: number | null;
  dn: number | null;
  dist: number | null;
  penalty: string | null;
}

/**
 * Compute EFF value based on finish rules.
 *
 * Rules:
 * - If result contains "TD" → "Y"
 * - If gainLoss >= dist → "Y" (first down achieved)
 * - If dn==1 and gainLoss >= 0.50*dist → "Y"
 * - If dn==2 and gainLoss >= 0.40*dist → "Y"
 * - For dn==3 or dn==4, only TD/first-down rules produce "Y"
 * - If penalty present → null (leave eff unset)
 * - If any required field missing → null
 *
 * @returns "Y", "N", or null (cannot compute)
 */
export function computeEff(input: EffInput): string | null {
  // If penalty present, leave eff null
  if (input.penalty !== null && input.penalty !== undefined && input.penalty !== "") {
    return null;
  }

  // Must have result to compute
  if (input.result === null || input.result === undefined || input.result === "") {
    return null;
  }

  // TD in result → always Y
  if (input.result.includes("TD")) {
    return "Y";
  }

  // Need dn, dist, gainLoss for threshold rules
  if (
    input.dn === null || input.dn === undefined ||
    input.dist === null || input.dist === undefined ||
    input.gainLoss === null || input.gainLoss === undefined
  ) {
    return null;
  }

  const dn = Number(input.dn);
  const dist = Number(input.dist);
  const gainLoss = Number(input.gainLoss);

  // First down achieved
  if (gainLoss >= dist) {
    return "Y";
  }

  // Threshold-based rules (dn 1 and 2 only)
  if (dn === 1 && gainLoss >= 0.50 * dist) {
    return "Y";
  }
  if (dn === 2 && gainLoss >= 0.40 * dist) {
    return "Y";
  }

  // dn 3 and 4: only TD/first-down can produce Y (already checked above)
  return "N";
}
