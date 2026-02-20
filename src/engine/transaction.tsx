/**
 * Football Engine — Transaction State Machine Provider
 * 
 * Manages Candidate → Proposal → Commit lifecycle with two-tier validation.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { CandidateData, PlayRecord, TransactionState, ValidationErrors } from "./types";
import { validateInline, validateCommitGate } from "./validation";
import { commitPlay as dbCommitPlay, getPlay, getPlaysByGame } from "./db";
import { useGameContext } from "./gameContext";
import { playSchema } from "./schema";

interface TransactionContextValue {
  state: TransactionState;
  candidate: CandidateData;
  touchedFields: Set<string>;
  inlineErrors: ValidationErrors;
  commitErrors: ValidationErrors;
  committedPlays: PlayRecord[];
  existingPlay: PlayRecord | null;
  pendingNormalized: PlayRecord | null;
  
  updateField: (fieldName: string, value: unknown) => void;
  clearDraft: () => void;
  reviewProposal: () => void;
  backToEdit: () => void;
  commitProposal: () => Promise<boolean>;
  confirmOverwrite: () => Promise<boolean>;
  cancelOverwrite: () => void;
  loadPlayForOverwrite: (play: PlayRecord) => void;
  refreshCommittedPlays: () => Promise<void>;
  
  activePass: number;
}

const TransactionContext = createContext<TransactionContextValue | null>(null);

function emptyCandidate(gameId: string): CandidateData {
  return { gameId };
}

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const { activeGame, setHasDraft } = useGameContext();
  const gameId = activeGame?.gameId ?? "";

  const [state, setState] = useState<TransactionState>("idle");
  const [candidate, setCandidate] = useState<CandidateData>(emptyCandidate(gameId));
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [inlineErrors, setInlineErrors] = useState<ValidationErrors>({});
  const [commitErrors, setCommitErrors] = useState<ValidationErrors>({});
  const [committedPlays, setCommittedPlays] = useState<PlayRecord[]>([]);
  const [existingPlay, setExistingPlay] = useState<PlayRecord | null>(null);
  const [pendingNormalized, setPendingNormalized] = useState<PlayRecord | null>(null);
  const activePass = 0;

  // Reset on game change
  useEffect(() => {
    setCandidate(emptyCandidate(gameId));
    setTouchedFields(new Set());
    setInlineErrors({});
    setCommitErrors({});
    setState(gameId ? "candidate" : "idle");
    setExistingPlay(null);
    setPendingNormalized(null);
    if (gameId) {
      getPlaysByGame(gameId).then((plays) =>
        setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum))
      );
    } else {
      setCommittedPlays([]);
    }
  }, [gameId]);

  // Track draft status
  useEffect(() => {
    const isDirty = touchedFields.size > 0;
    setHasDraft(isDirty);
  }, [touchedFields, setHasDraft]);

  const updateField = useCallback(
    (fieldName: string, value: unknown) => {
      setCandidate((prev) => ({ ...prev, [fieldName]: value }));
      setTouchedFields((prev) => new Set(prev).add(fieldName));
      setState("candidate");
      setCommitErrors({});

      const newTouched = new Set(touchedFields).add(fieldName);
      const newCandidate = { ...candidate, [fieldName]: value };
      setInlineErrors(validateInline(newCandidate, newTouched));
    },
    [candidate, touchedFields]
  );

  const clearDraft = useCallback(() => {
    setCandidate(emptyCandidate(gameId));
    setTouchedFields(new Set());
    setInlineErrors({});
    setCommitErrors({});
    setState(gameId ? "candidate" : "idle");
    setExistingPlay(null);
    setPendingNormalized(null);
  }, [gameId]);

  const reviewProposal = useCallback(() => {
    const errors = validateInline(candidate, touchedFields);
    setInlineErrors(errors);
    if (Object.keys(errors).length === 0) {
      setState("proposal");
    }
  }, [candidate, touchedFields]);

  const backToEdit = useCallback(() => {
    if (state === "proposal") {
      setState("candidate");
      setCommitErrors({});
    }
  }, [state]);

  const commitProposal = useCallback(async (): Promise<boolean> => {
    // Guard: commit only from proposal state
    if (state !== "proposal") return false;

    const result = validateCommitGate(candidate, activePass);
    if (!result.valid) {
      setCommitErrors(result.errors);
      return false;
    }

    const normalized = result.normalizedPlay!;

    // Check for collision
    const existing = await getPlay(gameId, normalized.playNum);
    if (existing) {
      setExistingPlay(existing);
      setPendingNormalized(normalized);
      setState("overwrite-review");
      return false;
    }

    await dbCommitPlay(normalized, null);
    const plays = await getPlaysByGame(gameId);
    setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
    clearDraft();
    return true;
  }, [candidate, activePass, gameId, clearDraft, state]);

  const confirmOverwrite = useCallback(async (): Promise<boolean> => {
    if (!pendingNormalized || !existingPlay) return false;

    // No-op detection: compare normalized values field-by-field
    const isNoop = playSchema.every((f) => {
      const oldVal = (existingPlay as unknown as Record<string, unknown>)[f.name];
      const newVal = (pendingNormalized as unknown as Record<string, unknown>)[f.name];
      return String(oldVal ?? "") === String(newVal ?? "");
    });

    if (isNoop) {
      setCommitErrors({ _noop: "No changes detected — overwrite blocked" });
      return false;
    }

    await dbCommitPlay(pendingNormalized, existingPlay);
    const plays = await getPlaysByGame(gameId);
    setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
    clearDraft();
    return true;
  }, [pendingNormalized, existingPlay, gameId, clearDraft]);

  const cancelOverwrite = useCallback(() => {
    setState("proposal");
    setExistingPlay(null);
    setPendingNormalized(null);
  }, []);

  const loadPlayForOverwrite = useCallback(
    (play: PlayRecord) => {
      const newCandidate: CandidateData = { ...play };
      setCandidate(newCandidate);
      const fields = new Set(
        Object.keys(play).filter(
          (k) => k !== "gameId" && play[k as keyof PlayRecord] !== null
        )
      );
      setTouchedFields(fields);
      setInlineErrors({});
      setCommitErrors({});
      setState("candidate");
    },
    []
  );

  const refreshCommittedPlays = useCallback(async () => {
    if (!gameId) return;
    const plays = await getPlaysByGame(gameId);
    setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
  }, [gameId]);

  return (
    <TransactionContext.Provider
      value={{
        state,
        candidate,
        touchedFields,
        inlineErrors,
        commitErrors,
        committedPlays,
        existingPlay,
        pendingNormalized,
        updateField,
        clearDraft,
        reviewProposal,
        backToEdit,
        commitProposal,
        confirmOverwrite,
        cancelOverwrite,
        loadPlayForOverwrite,
        refreshCommittedPlays,
        activePass,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransaction() {
  const ctx = useContext(TransactionContext);
  if (!ctx) throw new Error("useTransaction must be within TransactionProvider");
  return ctx;
}
