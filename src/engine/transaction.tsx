/**
 * Football Engine — Transaction State Machine Provider
 * 
 * Manages Candidate → Proposal → Commit lifecycle with two-tier validation.
 * Phase 3: Supports slot-based editing with field-level commit state.
 * Phase 4: Workflow stage selector, ODK filter, Commit & Next.
 * Phase 5A: Deterministic prediction integration.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { CandidateData, PlayRecord, TransactionState, ValidationErrors, SlotMeta } from "./types";
import { validateInline, validateCommitGate } from "./validation";
import { commitPlay as dbCommitPlay, getPlay, getPlaysByGame, getAllSlotMetaForGame, saveSlotMeta } from "./db";
import { useGameContext } from "./gameContext";
import { useLookup } from "./lookupContext";
import { useRoster } from "./rosterContext";
import { playSchema, getFieldDef } from "./schema";
import { computePrediction } from "./prediction";
import { toCoachMessages, type CoachMessage } from "./predictionMessages";
import { computeEff } from "./eff";
import { runCommitQC } from "./commitQC";

interface TransactionContextValue {
  state: TransactionState;
  candidate: CandidateData;
  touchedFields: Set<string>;
  predictedFields: Set<string>;
  predictionExplanations: string[];
  predictionCoachMessages: CoachMessage[];
  inlineErrors: ValidationErrors;
  commitErrors: ValidationErrors;
  committedPlays: PlayRecord[];
  existingPlay: PlayRecord | null;
  pendingNormalized: PlayRecord | null;
  
  // Slot mode
  selectedSlotNum: number | null;
  slotMetaMap: Map<number, SlotMeta>;
  isSlotMode: boolean;
  scaffoldedWarning: string | null;
  
  // Phase 4: Workflow stage & ODK filter
  activePass: number;
  setActivePass: (pass: number) => void;
  odkFilter: string;
  setOdkFilter: (filter: string) => void;

  // Phase 5C: TD correction dialog state
  tdCorrectionPending: { correctedResult: string } | null;
  confirmTDCorrection: () => Promise<boolean>;
  cancelTDCorrection: () => void;
  
  updateField: (fieldName: string, value: unknown) => void;
  clearDraft: () => void;
  reviewProposal: () => void;
  backToEdit: () => void;
  commitProposal: () => Promise<boolean>;
  confirmOverwrite: () => Promise<boolean>;
  cancelOverwrite: () => void;
  loadPlayForOverwrite: (play: PlayRecord) => void;
  refreshCommittedPlays: () => Promise<void>;
  selectSlot: (playNum: number) => Promise<void>;
  deselectSlot: () => void;
  dismissScaffoldWarning: () => void;
  commitAndNext: () => Promise<{ committed: boolean; hasNext: boolean }>;
}

const TransactionContext = createContext<TransactionContextValue | null>(null);

function emptyCandidate(gameId: string): CandidateData {
  return { gameId };
}

/** Fields that are scaffolded (seeded at init) and should warn on edit */
const SCAFFOLDED_FIELDS = new Set(["odk", "series", "qtr"]);

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const { activeGame, setHasDraft, isSlotMode: gameIsSlotMode } = useGameContext();
  const { getLookupMap, lookupTables } = useLookup();
  const { roster } = useRoster();
  const gameId = activeGame?.gameId ?? "";

  const rosterNumbers = React.useMemo(
    () => new Set(roster.map((r) => r.jerseyNumber)),
    [roster]
  );

  const [state, setState] = useState<TransactionState>("idle");
  const [candidate, setCandidate] = useState<CandidateData>(emptyCandidate(gameId));
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [inlineErrors, setInlineErrors] = useState<ValidationErrors>({});
  const [commitErrors, setCommitErrors] = useState<ValidationErrors>({});
  const [committedPlays, setCommittedPlays] = useState<PlayRecord[]>([]);
  const [existingPlay, setExistingPlay] = useState<PlayRecord | null>(null);
  const [pendingNormalized, setPendingNormalized] = useState<PlayRecord | null>(null);
  const [selectedSlotNum, setSelectedSlotNum] = useState<number | null>(null);
  const [slotMetaMap, setSlotMetaMap] = useState<Map<number, SlotMeta>>(new Map());
  const [scaffoldedWarning, setScaffoldedWarning] = useState<string | null>(null);

  // Phase 5C: TD correction dialog state
  const [tdCorrectionPending, setTdCorrectionPending] = useState<{ correctedResult: string; normalizedPlay: PlayRecord; existingSlot: PlayRecord | null } | null>(null);
  
  // Phase 5A: Prediction state (ephemeral, never persisted)
  const [predictedFields, setPredictedFields] = useState<Set<string>>(new Set());
  const [predictionExplanations, setPredictionExplanations] = useState<string[]>([]);
  const [predictionCoachMessages, setPredictionCoachMessages] = useState<CoachMessage[]>([]);

  // Phase 4: activePass as state (default 1 = "Basic Play Data")
  const [activePass, setActivePass] = useState<number>(1);
  // Phase 4: ODK filter (display-only, no persistence)
  const [odkFilter, setOdkFilter] = useState<string>("ALL");

  const fieldSize = activeGame?.fieldSize ?? 80;

  const isSlotMode = gameIsSlotMode;

  // Reset on game change
  useEffect(() => {
    setCandidate(emptyCandidate(gameId));
    setTouchedFields(new Set());
    setInlineErrors({});
    setCommitErrors({});
    setState(gameId ? (gameIsSlotMode ? "idle" : "candidate") : "idle");
    setExistingPlay(null);
    setPendingNormalized(null);
    setSelectedSlotNum(null);
    setScaffoldedWarning(null);
    setPredictedFields(new Set());
    setPredictionExplanations([]);
    setPredictionCoachMessages([]);
    setActivePass(1);
    setOdkFilter("ALL");
    if (gameId) {
      getPlaysByGame(gameId).then((plays) =>
        setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum))
      );
      getAllSlotMetaForGame(gameId).then((metas) => {
        const map = new Map<number, SlotMeta>();
        for (const m of metas) map.set(m.playNum, m);
        setSlotMetaMap(map);
      });
    } else {
      setCommittedPlays([]);
      setSlotMetaMap(new Map());
    }
  }, [gameId, gameIsSlotMode]);

  // Track draft status
  useEffect(() => {
    const isDirty = touchedFields.size > 0;
    setHasDraft(isDirty);
  }, [touchedFields, setHasDraft]);

  // Revalidate inline errors when lookupMap changes
  useEffect(() => {
    if (touchedFields.size > 0) {
      setInlineErrors(validateInline(candidate, touchedFields, getLookupMap()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupTables]);

  const updateField = useCallback(
    (fieldName: string, value: unknown) => {
      // Stage-based field locking: reject updates for fields outside active pass
      const fieldDef = getFieldDef(fieldName);
      if (fieldDef && fieldDef.defaultPassEntry > activePass) {
        return; // Read-only at this stage
      }

      // Scaffolded field warning check (slot mode only)
      if (isSlotMode && selectedSlotNum !== null && SCAFFOLDED_FIELDS.has(fieldName)) {
        const meta = slotMetaMap.get(selectedSlotNum);
        if (meta && meta.committedFields.includes(fieldName)) {
          setScaffoldedWarning(
            "Changing this value may create inconsistency with seeded structure."
          );
        }
      }

      setCandidate((prev) => ({ ...prev, [fieldName]: value }));
      setTouchedFields((prev) => new Set(prev).add(fieldName));
      // If editing a predicted field, move it from predicted to touched
      setPredictedFields((prev) => {
        if (prev.has(fieldName)) {
          const next = new Set(prev);
          next.delete(fieldName);
          return next;
        }
        return prev;
      });
      setState("candidate");
      setCommitErrors({});

      const newTouched = new Set(touchedFields).add(fieldName);
      const newCandidate = { ...candidate, [fieldName]: value };
      setInlineErrors(validateInline(newCandidate, newTouched, getLookupMap()));
    },
    [candidate, touchedFields, getLookupMap, isSlotMode, selectedSlotNum, slotMetaMap, activePass]
  );

  const clearDraft = useCallback(() => {
    setCandidate(emptyCandidate(gameId));
    setTouchedFields(new Set());
    setPredictedFields(new Set());
    setPredictionExplanations([]);
    setPredictionCoachMessages([]);
    setInlineErrors({});
    setCommitErrors({});
    setState(gameId ? (isSlotMode ? "idle" : "candidate") : "idle");
    setExistingPlay(null);
    setPendingNormalized(null);
    setSelectedSlotNum(null);
    setScaffoldedWarning(null);
  }, [gameId, isSlotMode]);

  const reviewProposal = useCallback(() => {
    const errors = validateInline(candidate, touchedFields, getLookupMap());
    setInlineErrors(errors);
    if (Object.keys(errors).length === 0) {
      setState("proposal");
    }
  }, [candidate, touchedFields, getLookupMap]);

  const backToEdit = useCallback(() => {
    if (state === "proposal") {
      setState("candidate");
      setCommitErrors({});
    }
  }, [state]);

  const commitProposal = useCallback(async (): Promise<boolean> => {
    if (state !== "proposal") return false;

    if (isSlotMode && selectedSlotNum !== null) {
      // Slot-mode commit: field-level commit state
      const result = validateCommitGate(candidate, activePass, getLookupMap(), rosterNumbers);
      if (!result.valid) {
        setCommitErrors(result.errors);
        return false;
      }

      const normalized = result.normalizedPlay!;

      // Phase 5C: Compute EFF at commit time
      const effValue = computeEff({
        result: normalized.result,
        gainLoss: normalized.gainLoss,
        dn: normalized.dn != null ? Number(normalized.dn) : null,
        dist: normalized.dist,
        penalty: normalized.penalty,
      });
      if (effValue !== null) {
        (normalized as unknown as Record<string, unknown>).eff = effValue;
      }

      // Phase 5C: Commit-gate QC — gainLoss limiting + TD correction
      const qc = runCommitQC(normalized.yardLn, normalized.gainLoss, normalized.result, fieldSize as 80 | 100);
      if (qc.gainLossMessage) {
        (normalized as unknown as Record<string, unknown>).gainLoss = qc.adjustedGainLoss;
        // Recompute EFF with adjusted gainLoss
        const effRecomputed = computeEff({
          result: normalized.result,
          gainLoss: qc.adjustedGainLoss,
          dn: normalized.dn != null ? Number(normalized.dn) : null,
          dist: normalized.dist,
          penalty: normalized.penalty,
        });
        if (effRecomputed !== null) {
          (normalized as unknown as Record<string, unknown>).eff = effRecomputed;
        }
      }

      // Phase 5C: TD labeling correction — block commit and show dialog
      if (qc.correctedResult) {
        const existingSlot = committedPlays.find((p) => p.playNum === selectedSlotNum) ?? null;
        setTdCorrectionPending({ correctedResult: qc.correctedResult, normalizedPlay: normalized, existingSlot });
        return false;
      }

      const meta = slotMetaMap.get(selectedSlotNum);
      const committedFields = meta?.committedFields ?? [];

      // Check if any committed fields have changed values
      const existingSlot = committedPlays.find((p) => p.playNum === selectedSlotNum);
      const overwriteFields: string[] = [];

      if (existingSlot) {
        for (const fieldName of committedFields) {
          if (fieldName === "playNum" || fieldName === "gameId") continue;
          const oldVal = (existingSlot as unknown as Record<string, unknown>)[fieldName];
          const newVal = (normalized as unknown as Record<string, unknown>)[fieldName];
          const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
          const newStr = newVal === null || newVal === undefined ? "" : String(newVal);
          if (oldStr !== newStr) {
            overwriteFields.push(fieldName);
          }
        }
      }

      if (overwriteFields.length > 0) {
        setExistingPlay(existingSlot ?? null);
        setPendingNormalized(normalized);
        setState("overwrite-review");
        return false;
      }

      // No committed field changes — direct commit
      await dbCommitPlay(normalized, existingSlot ?? null);

      const newCommittedFields = new Set(committedFields);
      for (const f of playSchema) {
        const val = (normalized as unknown as Record<string, unknown>)[f.name];
        if (val !== null && val !== undefined) {
          newCommittedFields.add(f.name);
        }
      }
      const updatedMeta: SlotMeta = {
        gameId,
        playNum: selectedSlotNum,
        committedFields: Array.from(newCommittedFields),
      };
      await saveSlotMeta(updatedMeta);

      const plays = await getPlaysByGame(gameId);
      setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
      setSlotMetaMap((prev) => {
        const next = new Map(prev);
        next.set(selectedSlotNum, updatedMeta);
        return next;
      });
      clearDraft();
      return true;
    }

    // Legacy mode commit
    const result = validateCommitGate(candidate, activePass, getLookupMap(), rosterNumbers);
    if (!result.valid) {
      setCommitErrors(result.errors);
      return false;
    }

    const normalized = result.normalizedPlay!;

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
  }, [candidate, activePass, gameId, clearDraft, state, getLookupMap, isSlotMode, selectedSlotNum, slotMetaMap, committedPlays, rosterNumbers]);

  const confirmOverwrite = useCallback(async (): Promise<boolean> => {
    if (!pendingNormalized || !existingPlay) return false;

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

    if (isSlotMode && selectedSlotNum !== null) {
      const meta = slotMetaMap.get(selectedSlotNum);
      const newCommittedFields = new Set(meta?.committedFields ?? []);
      for (const f of playSchema) {
        const val = (pendingNormalized as unknown as Record<string, unknown>)[f.name];
        if (val !== null && val !== undefined) {
          newCommittedFields.add(f.name);
        }
      }
      const updatedMeta: SlotMeta = {
        gameId,
        playNum: selectedSlotNum,
        committedFields: Array.from(newCommittedFields),
      };
      await saveSlotMeta(updatedMeta);
      setSlotMetaMap((prev) => {
        const next = new Map(prev);
        next.set(selectedSlotNum, updatedMeta);
        return next;
      });
    }

    const plays = await getPlaysByGame(gameId);
    setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
    clearDraft();
    return true;
  }, [pendingNormalized, existingPlay, gameId, clearDraft, isSlotMode, selectedSlotNum, slotMetaMap]);

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

  const selectSlot = useCallback(
    async (playNum: number) => {
      const slot = committedPlays.find((p) => p.playNum === playNum);
      if (!slot) return;

      const newCandidate: CandidateData = { ...slot };
      
      // Phase 5A: Load prevPlay from IndexedDB to avoid stale state
      const prevPlay = await getPlay(gameId, playNum - 1);

      // Phase 5C: Quarter boundary check
      let quarterChanged: { prevQtr: string; currQtr: string } | undefined;
      if (prevPlay && prevPlay.qtr && slot.qtr && prevPlay.qtr !== slot.qtr) {
        quarterChanged = { prevQtr: String(prevPlay.qtr), currQtr: String(slot.qtr) };
      }

      const prediction = computePrediction(prevPlay, slot.odk, fieldSize as 80 | 100, quarterChanged);
      
      const newPredicted = new Set<string>();
      if (prediction.eligible) {
        const meta = slotMetaMap.get(playNum);
        const committedFieldSet = new Set(meta?.committedFields ?? []);
        
        for (const [field, val] of Object.entries({ yardLn: prediction.yardLn, dn: prediction.dn, dist: prediction.dist })) {
          if (val !== null && !committedFieldSet.has(field)) {
            const currentVal = (newCandidate as Record<string, unknown>)[field];
            if (currentVal === null || currentVal === undefined || currentVal === "") {
              (newCandidate as Record<string, unknown>)[field] = val;
              newPredicted.add(field);
            }
          }
        }
      }
      
      setCandidate(newCandidate);
      setSelectedSlotNum(playNum);
      setTouchedFields(new Set());
      setPredictedFields(newPredicted);
      setPredictionExplanations(prediction.explanations);
      setPredictionCoachMessages(toCoachMessages(prediction.explanations, playNum - 1));
      setInlineErrors({});
      setCommitErrors({});
      setScaffoldedWarning(null);
      setState("candidate");
    },
    [committedPlays, gameId, fieldSize, slotMetaMap]
  );

  const deselectSlot = useCallback(() => {
    setSelectedSlotNum(null);
    setCandidate(emptyCandidate(gameId));
    setTouchedFields(new Set());
    setPredictedFields(new Set());
    setPredictionExplanations([]);
    setPredictionCoachMessages([]);
    setInlineErrors({});
    setCommitErrors({});
    setScaffoldedWarning(null);
    setState(gameId ? "idle" : "idle");
  }, [gameId]);

  const dismissScaffoldWarning = useCallback(() => {
    setScaffoldedWarning(null);
  }, []);

  // Phase 5C: TD correction confirmation
  const confirmTDCorrection = useCallback(async (): Promise<boolean> => {
    if (!tdCorrectionPending) return false;
    const { correctedResult, normalizedPlay, existingSlot } = tdCorrectionPending;
    
    // Apply corrected result
    const corrected = { ...normalizedPlay, result: correctedResult } as PlayRecord;
    
    // Recompute EFF with corrected result
    const effValue = computeEff({
      result: correctedResult,
      gainLoss: corrected.gainLoss,
      dn: corrected.dn != null ? Number(corrected.dn) : null,
      dist: corrected.dist,
      penalty: corrected.penalty,
    });
    if (effValue !== null) {
      (corrected as unknown as Record<string, unknown>).eff = effValue;
    }

    await dbCommitPlay(corrected, existingSlot);

    if (selectedSlotNum !== null) {
      const meta = slotMetaMap.get(selectedSlotNum);
      const newCommittedFields = new Set(meta?.committedFields ?? []);
      for (const f of playSchema) {
        const val = (corrected as unknown as Record<string, unknown>)[f.name];
        if (val !== null && val !== undefined) {
          newCommittedFields.add(f.name);
        }
      }
      const updatedMeta: SlotMeta = {
        gameId,
        playNum: selectedSlotNum,
        committedFields: Array.from(newCommittedFields),
      };
      await saveSlotMeta(updatedMeta);
      setSlotMetaMap((prev) => {
        const next = new Map(prev);
        next.set(selectedSlotNum, updatedMeta);
        return next;
      });
    }

    const plays = await getPlaysByGame(gameId);
    setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
    setTdCorrectionPending(null);
    clearDraft();
    return true;
  }, [tdCorrectionPending, selectedSlotNum, slotMetaMap, gameId, clearDraft]);

  const cancelTDCorrection = useCallback(() => {
    setTdCorrectionPending(null);
  }, []);

  const refreshCommittedPlays = useCallback(async () => {
    if (!gameId) return;
    const plays = await getPlaysByGame(gameId);
    setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
    const metas = await getAllSlotMetaForGame(gameId);
    const map = new Map<number, SlotMeta>();
    for (const m of metas) map.set(m.playNum, m);
    setSlotMetaMap(map);
  }, [gameId]);

  // Phase 4: Commit & Next — advances to next slot in filtered scaffold list
  const commitAndNext = useCallback(async (): Promise<{ committed: boolean; hasNext: boolean }> => {
    if (state !== "proposal") {
      return { committed: false, hasNext: false };
    }

    // Snapshot current state before commit (clearDraft resets selectedSlotNum)
    const currentSlotNum = selectedSlotNum;
    const _currentPlays = [...committedPlays];

    const success = await commitProposal();
    if (!success) {
      return { committed: false, hasNext: false };
    }

    // Refresh committedPlays from DB before selecting next slot
    // so prediction sees the freshly committed play
    await refreshCommittedPlays();

    // Re-read fresh plays for filtered list
    const freshPlays = await getPlaysByGame(gameId);
    const sortedPlays = freshPlays.sort((a, b) => a.playNum - b.playNum);

    const filteredList = odkFilter === "ALL"
      ? sortedPlays
      : sortedPlays.filter((p) => p.odk === odkFilter);
    
    const currentIdx = filteredList.findIndex((p) => p.playNum === currentSlotNum);
    if (currentIdx >= 0 && currentIdx < filteredList.length - 1) {
      await selectSlot(filteredList[currentIdx + 1].playNum);
      return { committed: true, hasNext: true };
    }

    // No next slot — already deselected by clearDraft
    return { committed: true, hasNext: false };
  }, [state, selectedSlotNum, committedPlays, odkFilter, commitProposal, selectSlot, refreshCommittedPlays, gameId]);

  return (
    <TransactionContext.Provider
      value={{
        state,
        candidate,
        touchedFields,
        predictedFields,
        predictionExplanations,
        predictionCoachMessages,
        inlineErrors,
        commitErrors,
        committedPlays,
        existingPlay,
        pendingNormalized,
        selectedSlotNum,
        slotMetaMap,
        isSlotMode,
        scaffoldedWarning,
        activePass,
        setActivePass,
        odkFilter,
        setOdkFilter,
        updateField,
        clearDraft,
        reviewProposal,
        backToEdit,
        commitProposal,
        confirmOverwrite,
        cancelOverwrite,
        loadPlayForOverwrite,
        refreshCommittedPlays,
        selectSlot,
        deselectSlot,
        dismissScaffoldWarning,
        commitAndNext,
        tdCorrectionPending: tdCorrectionPending ? { correctedResult: tdCorrectionPending.correctedResult } : null,
        confirmTDCorrection,
        cancelTDCorrection,
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
