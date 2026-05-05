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
  "motion",
  // Play Results actor fields — section-scoped to playResults via sectionOwnership.
  // Validation/roster governance still gates jersey numbers at commit.
  "rusher",
  "passer",
  "receiver",
]);

/**
 * Play Results actor fields. AI proposals must be bare integer jersey numbers
 * and only flow when the active section is playResults. Enforced by
 * filterAiProposal (integer coercion + contamination guard) and by the
 * section-aware drop in fetchAiProposal.
 */
export const PLAY_RESULTS_ACTOR_FIELDS = new Set([
  "rusher",
  "passer",
  "receiver",
]);

/**
 * `result` values where a rusher proposal is contamination unless the
 * coach explicitly named a ball carrier. Used by filterAiProposal as a
 * conservative drop-list (passer/receiver are not similarly guarded here).
 */
export const NON_RUSH_RESULT_PREFIXES = [
  "Complete",
  "Incomplete",
  "Interception",
  "Sack",
  "Penalty",
  "Dropped",
  "Tipped",
  "Batted Down",
  "Fair Catch",
  "Out of Bounds",
  "Touchback",
];

/** Location-related fields subject to Hudl-centered mapping constraint */
export const LOCATION_CONSTRAINED_FIELDS = new Set([
  "yardLn",
  "gainLoss",
  "dist",
]);
