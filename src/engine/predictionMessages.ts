/**
 * Football Engine — Coach-Facing Prediction Messages
 *
 * Maps internal prediction explanations to coach-friendly messages.
 * Preserves original technical strings for optional "Why?" debug view.
 */

export interface CoachMessage {
  /** Coach-facing message shown in the banner */
  coach: string;
  /** Original technical explanation for debug/expander */
  technical: string;
}

/**
 * Convert a raw prediction explanation into a coach-facing message.
 * @param technical - The raw explanation string from computePrediction
 * @param prevPlayNum - The play number of the previous play (currentSlot - 1)
 */
export function toCoachMessage(technical: string, prevPlayNum: number): CoachMessage {
  const prev = `Play #${prevPlayNum}`;

  if (technical.includes("previous slot not available")) {
    return { coach: `Auto-fill paused: ${prev} is not committed yet.`, technical };
  }
  if (technical.includes("previous play is not offensive")) {
    return { coach: `Auto-fill paused: ${prev} is not an offensive play.`, technical };
  }
  if (technical.includes("current play is not offensive")) {
    return { coach: "Auto-fill paused: This slot is not offense.", technical };
  }
  if (technical.includes("penalty present on previous play")) {
    return { coach: `Auto-fill paused: Penalty on ${prev}.`, technical };
  }
  if (technical.includes("result missing on previous play")) {
    return { coach: `Auto-fill paused: Add a Result for ${prev}.`, technical };
  }
  if (technical.includes("gain/loss missing on previous play")) {
    return { coach: `Auto-fill paused: Add Gain/Loss for ${prev}.`, technical };
  }
  if (technical.includes("down missing on previous play")) {
    return { coach: `Auto-fill limited: Down is missing on ${prev}.`, technical };
  }
  if (technical.includes("distance missing on previous play")) {
    return { coach: `Auto-fill limited: Distance is missing on ${prev}.`, technical };
  }
  if (technical.includes("yard line missing on previous play")) {
    return { coach: `Auto-fill paused: Yard Line is missing on ${prev}.`, technical };
  }
  if (technical.includes("scoring/safety logic deferred")) {
    return { coach: "Auto-fill paused: That play reaches the goal line. (Scoring flow not enabled yet.)", technical };
  }
  if (technical.includes("4th down turnover assumed")) {
    return { coach: "Auto-fill suggestion: Assuming possession changed after 4th down.", technical };
  }

  // Fallback: pass through unchanged
  return { coach: technical, technical };
}

/**
 * Convert an array of technical explanations to coach messages.
 */
export function toCoachMessages(technicals: string[], prevPlayNum: number): CoachMessage[] {
  return technicals.map((t) => toCoachMessage(t, prevPlayNum));
}
