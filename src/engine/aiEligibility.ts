/**
 * AI Eligibility — defines which fields AI may propose values for.
 *
 * Bucket A (deterministic-only): system-managed + lookup-derived fields.
 * Bucket B (AI-eligible): narration-inferable fields listed here.
 * Bucket C (coach-only): pos*, grade* — never AI-proposed.
 *
 * Deterministically derived fields (offStrength, playType, playDir,
 * motionDir, penYards, personnel, eff, patTry) are NEVER AI-eligible.
 */

/**
 * The narrow initial set of AI-eligible fields.
 * AI may only propose values for these fields.
 */
export const AI_ELIGIBLE_FIELDS = new Set([
  "yardLn",
  "hash",
  "result",
  "gainLoss",
  "offForm",
  "offPlay",
]);

/** Location-related fields subject to Hudl-centered mapping constraint */
export const LOCATION_CONSTRAINED_FIELDS = new Set([
  "yardLn",
  "gainLoss",
  "dist",
]);
