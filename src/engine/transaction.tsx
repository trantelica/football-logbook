/**
 * Football Engine — Transaction State Machine Provider
 * 
 * Manages Candidate → Proposal → Commit lifecycle with two-tier validation.
 * Phase 3: Supports slot-based editing with field-level commit state.
 * Phase 4: Workflow stage selector, ODK filter, Commit & Next.
 * Phase 5A: Deterministic prediction integration.
 * Phase 6: PAT flow integration.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { CandidateData, PlayRecord, TransactionState, ValidationErrors, SlotMeta } from "./types";
import { validateInline, validateCommitGate } from "./validation";
import { commitPlay as dbCommitPlay, getPlay, getPlaysByGame, getAllSlotMetaForGame, saveSlotMeta, getGameInit } from "./db";
import { useGameContext } from "./gameContext";
import { useLookup } from "./lookupContext";
import { useRoster } from "./rosterContext";
import { playSchema, getFieldDef, PENALTY_YARDS_MAP } from "./schema";
import { computePrediction } from "./prediction";
import { toCoachMessages, type CoachMessage } from "./predictionMessages";
import { computeEff } from "./eff";
import { runCommitQC } from "./commitQC";
import { shouldEnterPATContext, getCarriedPatTry, patTryToPlayType, validatePATResult } from "./patEngine";
import { possessionGuardrail } from "./possession";
import { validatePersonnel, getCarryForwardPersonnel, computePassCompletion, PERSONNEL_POSITIONS } from "./personnel";

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
  /** Coach-facing adjustment messages from review normalization */
  adjustments: string[];
  
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

  // Phase 6: PAT state
  patContext: boolean;
  patTryPending: boolean;
  /** Locked try type for penalty re-try (null if fresh PAT) */
  patLockedTry: "1" | "2" | null;
  selectPatAttempt: (patTry: "1" | "2", result: "Good" | "No Good" | "Penalty") => void;
  reopenPatDialog: () => void;
  cancelPatTry: () => void;

  // Phase 5: Possession guardrail
  possessionCheckPending: boolean;
  possessionPrevPlayInfo: { playNum: number; result: string } | null;
  confirmPossessionOffense: () => void;
  cancelPossessionCheck: () => void;
  
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
  
  // Adjustment tracking: coach-facing messages for review normalization
  const [adjustments, setAdjustments] = useState<string[]>([]);
  
  // Phase 5A: Prediction state (ephemeral, never persisted)
  const [predictedFields, setPredictedFields] = useState<Set<string>>(new Set());
  const [predictionExplanations, setPredictionExplanations] = useState<string[]>([]);
  const [predictionCoachMessages, setPredictionCoachMessages] = useState<CoachMessage[]>([]);

  // Phase 6: PAT state
  const [patContext, setPatContext] = useState(false);
  const [patTryPending, setPatTryPending] = useState(false);
  const [patLockedTry, setPatLockedTry] = useState<"1" | "2" | null>(null);

  // Phase 5: Possession check state
  const [possessionCheckPending, setPossessionCheckPending] = useState(false);
  const [possessionCheckDismissed, setPossessionCheckDismissed] = useState(false);
  const [possessionPrevPlayInfo, setPossessionPrevPlayInfo] = useState<{ playNum: number; result: string } | null>(null);
  // Phase 4: activePass as state (default 1 = "Basic Play Data")
  const [activePass, setActivePass] = useState<number>(1);
  // Phase 4: ODK filter (display-only, no persistence)
  const [odkFilter, setOdkFilter] = useState<string>("ALL");

  const fieldSize = activeGame?.fieldSize ?? 80;
  const patMode = activeGame?.patMode ?? "none";

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
    setAdjustments([]);
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
    setAdjustments([]);
    setInlineErrors({});
    setCommitErrors({});
    setState(gameId ? (isSlotMode ? "idle" : "candidate") : "idle");
    setExistingPlay(null);
    setPendingNormalized(null);
    setSelectedSlotNum(null);
    setScaffoldedWarning(null);
    setPatContext(false);
    setPatTryPending(false);
    setPatLockedTry(null);
  }, [gameId, isSlotMode]);

  const reviewProposal = useCallback(() => {
    const errors = validateInline(candidate, touchedFields, getLookupMap());
    setInlineErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // Phase 6: Pass 2 personnel validation for offensive plays
    if (activePass >= 2 && candidate.odk === "O") {
      const personnelErrors = validatePersonnel(candidate, rosterNumbers);
      if (Object.keys(personnelErrors).length > 0) {
        setCommitErrors(personnelErrors);
        return;
      }
    }

    const reviewAdjustments: string[] = [];

    // Rule 1: PEN YARDS proposal-time defaulting
    const penaltyVal = candidate.penalty as string | null | undefined;
    if (penaltyVal && penaltyVal !== "") {
      // Penalty is set — default penYards if not touched
      if (!touchedFields.has("penYards")) {
        const defaultYards = PENALTY_YARDS_MAP[penaltyVal];
        const currentPenYards = candidate.penYards;
        if (defaultYards !== undefined && (currentPenYards === null || currentPenYards === undefined || currentPenYards === "")) {
          setCandidate((prev) => ({ ...prev, penYards: defaultYards }));
          reviewAdjustments.push("Penalty yards filled from the penalty list. You can change it.");
        }
      }
    } else {
      // Penalty cleared — clear penYards if not touched
      if (!touchedFields.has("penYards") && candidate.penYards != null && candidate.penYards !== "") {
        setCandidate((prev) => ({ ...prev, penYards: null }));
        reviewAdjustments.push("Penalty cleared. Penalty yards cleared.");
      }
    }

    // Phase 6: PAT context — apply playType override and validate result
    if (patContext && candidate.patTry) {
      const expectedPlayType = patTryToPlayType(String(candidate.patTry));
      const currentPlayType = candidate.playType as string | null;
      if (currentPlayType !== expectedPlayType) {
        reviewAdjustments.push(`Adjusted: Play Type set to ${expectedPlayType} due to PAT rules.`);
        setCandidate((prev) => ({ ...prev, playType: expectedPlayType }));
      }
      
      // Validate PAT result
      const patResultError = validatePATResult(candidate.result as string | null);
      if (patResultError) {
        setCommitErrors({ result: patResultError });
        return;
      }
      
      // Skip TD normalization and gain limiting in PAT context
      setAdjustments(reviewAdjustments);
      setState("proposal");
      return;
    }

    // Offsetting Penalties → force EFF = N (unless coach touched)
    if (!touchedFields.has("eff") && String(candidate.result) === "Offsetting Penalties") {
      setCandidate((prev) => ({ ...prev, eff: "N" }));
    } else if (!touchedFields.has("eff")) {
      // Normal EFF computation
      const effValue = computeEff({
        result: candidate.result as string | null,
        gainLoss: candidate.gainLoss != null ? Number(candidate.gainLoss) : null,
        dn: candidate.dn != null ? Number(candidate.dn) : null,
        dist: candidate.dist != null ? Number(candidate.dist) : null,
        penalty: candidate.penalty as string | null,
      });
      if (effValue !== null) {
        setCandidate((prev) => ({ ...prev, eff: effValue }));
      }
    }

    // Phase 5C patch: TD labeling correction at review time
    const qc = runCommitQC(
      candidate.yardLn != null ? Number(candidate.yardLn) : null,
      candidate.gainLoss != null ? Number(candidate.gainLoss) : null,
      candidate.result as string | null,
      fieldSize as 80 | 100
    );

    // Apply gain limiting and track adjustment
    if (qc.gainLossMessage) {
      const originalGL = candidate.gainLoss != null ? Number(candidate.gainLoss) : null;
      setCandidate((prev) => ({ ...prev, gainLoss: qc.adjustedGainLoss }));
      reviewAdjustments.push(`Adjusted: Gain limited from ${originalGL} to ${qc.adjustedGainLoss}.`);
      // Recompute EFF with adjusted gainLoss if not touched
      if (!touchedFields.has("eff")) {
        const effRecomputed = computeEff({
          result: candidate.result as string | null,
          gainLoss: qc.adjustedGainLoss,
          dn: candidate.dn != null ? Number(candidate.dn) : null,
          dist: candidate.dist != null ? Number(candidate.dist) : null,
          penalty: candidate.penalty as string | null,
        });
        if (effRecomputed !== null) {
          setCandidate((prev) => ({ ...prev, eff: effRecomputed }));
        }
      }
    }

    setAdjustments(reviewAdjustments);

    // TD correction dialog — block proposal transition
    if (qc.correctedResult) {
      setTdCorrectionPending({ correctedResult: qc.correctedResult, normalizedPlay: null as unknown as PlayRecord, existingSlot: null });
      return;
    }

    setState("proposal");
  }, [candidate, touchedFields, getLookupMap, fieldSize, patContext, selectedSlotNum, committedPlays, odkFilter]);

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

      // EFF and QC already applied at review time — no need to recompute here

      const meta = slotMetaMap.get(selectedSlotNum);
      const committedFields = meta?.committedFields ?? [];

      // Check for complete no-op: compare ALL schema fields between existing and normalized
      const existingSlot = committedPlays.find((p) => p.playNum === selectedSlotNum);
      
      if (existingSlot) {
        const isNoop = playSchema.every((f) => {
          const oldVal = (existingSlot as unknown as Record<string, unknown>)[f.name];
          const newVal = (normalized as unknown as Record<string, unknown>)[f.name];
          return String(oldVal ?? "") === String(newVal ?? "");
        });

        if (isNoop) {
          setCommitErrors({ _noop: "No changes to commit." });
          return false;
        }
      }

      // Check if any committed fields have changed values → overwrite review
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
      const committedFieldsArr = Array.from(newCommittedFields);
      const passFlags = computePassCompletion(normalized, committedFieldsArr);
      const updatedMeta: SlotMeta = {
        gameId,
        playNum: selectedSlotNum,
        committedFields: committedFieldsArr,
        pass1Complete: passFlags.pass1Complete,
        pass2Complete: passFlags.pass2Complete,
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
      const committedFieldsArr = Array.from(newCommittedFields);
      const passFlags = computePassCompletion(pendingNormalized, committedFieldsArr);
      const updatedMeta: SlotMeta = {
        gameId,
        playNum: selectedSlotNum,
        committedFields: committedFieldsArr,
        pass1Complete: passFlags.pass1Complete,
        pass2Complete: passFlags.pass2Complete,
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

      // Phase 6: PAT context detection
      const isPAT = shouldEnterPATContext(prevPlay, slot, patMode);
      setPatContext(isPAT);
      
      if (isPAT) {
        // Check if patTry is already set (penalty re-try or existing)
        const carriedTry = getCarriedPatTry(prevPlay, slot);
        if (carriedTry) {
          // Penalty re-try: lock try type, still need outcome dialog
          newCandidate.patTry = carriedTry;
          newCandidate.playType = patTryToPlayType(carriedTry);
          setPatLockedTry(carriedTry as "1" | "2");
        } else {
          // Fresh PAT: need both try type and outcome
          setPatLockedTry(null);
        }
        // Always show dialog to capture outcome
        setPatTryPending(true);
        
        // Suspend normal predictions in PAT context
        setCandidate(newCandidate);
        setSelectedSlotNum(playNum);
        setTouchedFields(new Set());
        setPredictedFields(new Set());
        setPredictionExplanations(["PAT attempt: normal predictions suspended."]);
        setPredictionCoachMessages([{ coach: "Auto-fill paused: PAT attempt.", technical: "PAT attempt: normal predictions suspended." }]);
        setInlineErrors({});
        setCommitErrors({});
        setScaffoldedWarning(null);
        setAdjustments([]);
        setState("candidate");
        return;
      }
      
      setPatTryPending(false);

      // Phase 5C patch: Half-time boundary check (only Q3 start)
      let halfTimeBoundary = false;
      const initConfig = await getGameInit(gameId);
      if (initConfig) {
        const q3Start = initConfig.quarterStarts["3"];
        if (q3Start && playNum === q3Start) {
          halfTimeBoundary = true;
        }
      }

      const prediction = computePrediction(prevPlay, slot.odk, fieldSize as 80 | 100, halfTimeBoundary);
      
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

      // Phase 6: Carry-forward personnel seeding for Pass 2 on offensive plays
      if (activePass >= 2 && slot.odk === "O") {
        const carryForward = getCarryForwardPersonnel(committedPlays, slotMetaMap, playNum);
        if (carryForward) {
          for (const [pos, jersey] of Object.entries(carryForward)) {
            const currentVal = (newCandidate as Record<string, unknown>)[pos];
            if (currentVal === null || currentVal === undefined || currentVal === "") {
              (newCandidate as Record<string, unknown>)[pos] = jersey;
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
      setAdjustments([]);
      setState("candidate");

      // Phase 5: Possession guardrail at slot load (skip PAT context)
      setPossessionCheckDismissed(false);
      setPossessionCheckPending(false);
      setPossessionPrevPlayInfo(null);
      const nextSlotOdk = slot.odk;
      const isOdkFilterActive = odkFilter !== "ALL";
      const guard = possessionGuardrail(prevPlay, nextSlotOdk, isOdkFilterActive);
      if (guard.possessionChanged && guard.needsModal) {
        setPossessionPrevPlayInfo({
          playNum: playNum - 1,
          result: prevPlay?.result != null ? String(prevPlay.result) : "unknown",
        });
        setPossessionCheckPending(true);
      }
    },
    [committedPlays, gameId, fieldSize, slotMetaMap, patMode, odkFilter, activePass]
  );

  const deselectSlot = useCallback(() => {
    setSelectedSlotNum(null);
    setCandidate(emptyCandidate(gameId));
    setTouchedFields(new Set());
    setPredictedFields(new Set());
    setPredictionExplanations([]);
    setPredictionCoachMessages([]);
    setAdjustments([]);
    setInlineErrors({});
    setCommitErrors({});
    setScaffoldedWarning(null);
    setState(gameId ? "idle" : "idle");
  }, [gameId]);

  const dismissScaffoldWarning = useCallback(() => {
    setScaffoldedWarning(null);
  }, []);

  // Phase 5C patch: TD correction at review time — apply corrected result and proceed to proposal
  const confirmTDCorrection = useCallback(async (): Promise<boolean> => {
    if (!tdCorrectionPending) return false;
    const { correctedResult } = tdCorrectionPending;
    const originalResult = candidate.result as string | null;
    
    // Apply corrected result to candidate
    setCandidate((prev) => ({ ...prev, result: correctedResult }));
    
    // Track adjustment
    setAdjustments((prev) => [...prev, `Adjusted: Result updated from ${originalResult ?? "(blank)"} to ${correctedResult}.`]);
    
    // Recompute EFF with corrected result
    const effValue = computeEff({
      result: correctedResult,
      gainLoss: candidate.gainLoss != null ? Number(candidate.gainLoss) : null,
      dn: candidate.dn != null ? Number(candidate.dn) : null,
      dist: candidate.dist != null ? Number(candidate.dist) : null,
      penalty: candidate.penalty as string | null,
    });
    if (effValue !== null) {
      setCandidate((prev) => ({ ...prev, eff: effValue }));
    }

    setTdCorrectionPending(null);
    setState("proposal");
    return true;
  }, [tdCorrectionPending, candidate]);

  const cancelTDCorrection = useCallback(() => {
    setTdCorrectionPending(null);
  }, []);

  // Phase 6: PAT attempt selection (combined try + outcome)
  const selectPatAttempt = useCallback((patTry: "1" | "2", result: "Good" | "No Good" | "Penalty") => {
    setPatTryPending(false);
    const expectedPlayType = patTryToPlayType(patTry);
    const newAdjustments: string[] = [];
    
    // Track playType adjustment
    const currentPlayType = candidate.playType as string | null;
    if (currentPlayType !== expectedPlayType) {
      newAdjustments.push(`Adjusted: Play Type set to ${expectedPlayType} due to PAT rules.`);
    }
    
    setCandidate((prev) => ({
      ...prev,
      patTry,
      playType: expectedPlayType,
      result,
    }));
    // Mark these as touched so later steps don't overwrite
    setTouchedFields((prev) => {
      const next = new Set(prev);
      next.add("patTry");
      next.add("playType");
      next.add("result");
      return next;
    });
    setAdjustments(newAdjustments);
  }, [candidate.playType]);

  const reopenPatDialog = useCallback(() => {
    setPatTryPending(true);
  }, []);

  const cancelPatTry = useCallback(() => {
    setPatTryPending(false);
    // Deselect slot since PAT try is required
    setSelectedSlotNum(null);
    setCandidate(emptyCandidate(gameId));
    setPatContext(false);
    setPatLockedTry(null);
    setState(gameId ? "idle" : "idle");
  }, [gameId]);

  // Phase 5: Possession check confirmation — remain in Draft, one-time dismiss
  const confirmPossessionOffense = useCallback(() => {
    setPossessionCheckPending(false);
    setPossessionCheckDismissed(true);
  }, []);

  const cancelPossessionCheck = useCallback(() => {
    setPossessionCheckPending(false);
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
        adjustments,
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
        patContext,
        patTryPending,
        patLockedTry,
        selectPatAttempt,
        reopenPatDialog,
        cancelPatTry,
        possessionCheckPending,
        possessionPrevPlayInfo,
        confirmPossessionOffense,
        cancelPossessionCheck,
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
