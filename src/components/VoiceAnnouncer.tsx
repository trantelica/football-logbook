/**
 * VoiceAnnouncer — headless bridge from transaction state to spoken feedback.
 *
 * Renders nothing. It observes the transaction context and announces the
 * moments a coach needs to hear while their eyes are on the film.
 *
 * Deliberately a separate component rather than `say()` calls scattered through
 * DraftPanel and Pass1SectionPanel:
 *
 *   - the announcement policy stays in one readable place
 *   - the large panels are untouched, so this is trivial to remove
 *   - announcements follow committed *state*, not the code path that caused it,
 *     so a commit fires exactly one announcement whether it came from the N key,
 *     the L key, or a click
 *
 * Advisory only. This never mutates a proposal and never commits.
 */

import { useEffect, useRef } from "react";
import { useTransaction } from "@/engine/transaction";
import { usePreferences } from "@/engine/preferencesContext";
import { playSchema } from "@/engine/schema";

export function VoiceAnnouncer() {
  const {
    commitCount,
    commitErrors,
    state,
    selectedSlotNum,
    lookupInterruptPending,
    existingPlay,
    pendingNormalized,
  } = useTransaction();
  const { say } = usePreferences();

  // Track the play number across a commit: by the time commitCount changes,
  // selection has already advanced to the next slot, so the number that was
  // just written is the one we held a render earlier.
  const previousSlotRef = useRef<number | null>(selectedSlotNum);
  const lastCommitCountRef = useRef(commitCount);

  useEffect(() => {
    if (commitCount === lastCommitCountRef.current) {
      previousSlotRef.current = selectedSlotNum;
      return;
    }
    lastCommitCountRef.current = commitCount;

    const committedPlay = previousSlotRef.current;
    previousSlotRef.current = selectedSlotNum;

    if (committedPlay === null) return;
    say({
      kind: "committed",
      playNumber: committedPlay,
      // Only report a next play when the workflow actually advanced.
      nextPlayNumber:
        selectedSlotNum !== null && selectedSlotNum !== committedPlay
          ? selectedSlotNum
          : undefined,
    });
  }, [commitCount, selectedSlotNum, say]);

  // Validation blocks. Keyed on the joined reasons so the same standing set of
  // errors is announced once, not on every keystroke that leaves them unchanged.
  const reasons = Object.values(commitErrors ?? {});
  const reasonKey = reasons.join("|");
  const lastReasonKeyRef = useRef("");

  useEffect(() => {
    if (reasonKey === lastReasonKeyRef.current) return;
    lastReasonKeyRef.current = reasonKey;
    if (!reasonKey) return;
    say({ kind: "blocked", reasons: Object.values(commitErrors ?? {}) });
    // commitErrors is intentionally read through reasonKey; adding the object
    // itself would re-fire on every identity change with identical content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasonKey, say]);

  // Unknown governed value — the coach has to make a decision before the play
  // can commit, so this always interrupts regardless of verbosity.
  const interruptKey = lookupInterruptPending
    ? `${lookupInterruptPending.fieldName}:${lookupInterruptPending.value}`
    : "";
  const lastInterruptRef = useRef("");

  useEffect(() => {
    if (interruptKey === lastInterruptRef.current) return;
    lastInterruptRef.current = interruptKey;
    if (!lookupInterruptPending) return;
    say({
      kind: "lookupInterrupt",
      fieldLabel: lookupInterruptPending.fieldLabel,
      value: lookupInterruptPending.value,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interruptKey, say]);

  // Entering overwrite review means committed data is about to change. The
  // count is the number of fields whose value actually differs — the same
  // comparison OverwriteReview renders — not the validation-error count.
  const wasOverwriteRef = useRef(false);
  useEffect(() => {
    const isOverwrite = state === "overwrite-review";
    if (isOverwrite && !wasOverwriteRef.current) {
      const changedCount =
        existingPlay && pendingNormalized
          ? playSchema.filter((f) => {
              const oldVal = (existingPlay as unknown as Record<string, unknown>)[f.name];
              const newVal = (pendingNormalized as unknown as Record<string, unknown>)[f.name];
              return String(oldVal ?? "") !== String(newVal ?? "");
            }).length
          : 0;
      say({ kind: "overwriteReview", fieldCount: changedCount });
    }
    wasOverwriteRef.current = isOverwrite;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, say]);

  return null;
}
