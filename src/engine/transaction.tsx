/**
 * Football Engine — Transaction State Machine Provider
 * 
 * Manages Candidate → Proposal → Commit lifecycle with two-tier validation.
 * Phase 3: Supports slot-based editing with field-level commit state.
 * Phase 4: Workflow stage selector, ODK filter, Commit & Next.
 * Phase 5A: Deterministic prediction integration.
 * Phase 6: PAT flow integration.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

import type { CandidateData, PlayRecord, TransactionState, ValidationErrors, SlotMeta } from "./types";
import { validateInline, validateCommitGate } from "./validation";
import { commitPlay as dbCommitPlay, getPlay, getPlaysByGame, getAllSlotMetaForGame, saveSlotMeta, getGameInit, getSeasonConfig } from "./db";
import { useGameContext } from "./gameContext";
import { useLookup } from "./lookupContext";
import { useRoster } from "./rosterContext";
import { useSeason } from "./seasonContext";
import { playSchema, getFieldDef, PENALTY_YARDS_MAP } from "./schema";
import { computePrediction } from "./prediction";
import { toCoachMessages, type CoachMessage } from "./predictionMessages";
import { computeEff } from "./eff";
import { runCommitQC } from "./commitQC";
import { shouldEnterPATContext, getCarriedPatTry, patTryToPlayType, validatePATResult } from "./patEngine";
import { possessionGuardrail } from "./possession";
import { toast } from "sonner";
import { validatePersonnel, computePassCompletion, PERSONNEL_POSITIONS, GRADE_FIELDS } from "./personnel";
import type { GradeOverwriteDiff } from "@/components/GradeOverwriteDialog";
import { computeProposalMeta, type ProposalMetaMap } from "./proposalMeta";
import { computeValidationReasons } from "./validationReasons";
// normalizeToSchema imported for potential future use; grade normalization is inline
/** Evidence for a single AI-proposed field */
export interface AIFieldEvidence {
  snippet: string;
  semanticRole?: string;
  utteranceId?: string;
}

/** Options for applySystemPatch */
export interface SystemPatchOptions {
  /** When true (default), only fill empty/null fields; non-empty fields become collisions */
  fillOnly?: boolean;
  /** Evidence keyed by field name */
  evidence?: Record<string, AIFieldEvidence>;
  /** Source of the patch — determines provenance tracking.
   *  "deterministic_parse" (default) for transcript parse results.
   *  "ai_proposed" reserved for future true AI enrichment. */
  source?: "deterministic_parse" | "ai_proposed";
}

/** Collision returned by applySystemPatch */
export interface SystemPatchCollision {
  fieldName: string;
  currentValue: unknown;
  proposedValue: unknown;
}

interface TransactionContextValue {
  /** Mark fields as lookup-derived (auto-populated from parent lookup) */
  markLookupDerived: (fieldNames: string[]) => void;
  /** Incremented on each successful commit — used to signal transcript clear */
  commitCount: number;
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

  // Phase 10: System patch provenance — separate signals
  deterministicParseFields: Set<string>;
  parseEvidenceByField: Record<string, AIFieldEvidence>;
  aiProposedFields: Set<string>;
  aiEvidenceByField: Record<string, AIFieldEvidence>;
  applySystemPatch: (patch: Record<string, unknown>, options?: SystemPatchOptions) => SystemPatchCollision[];
  /** Lookup interrupt: an AI-patched field has an unknown governed lookup value */
  lookupInterruptPending: { fieldName: string; fieldLabel: string; value: string } | null;
  clearLookupInterrupt: () => void;
  
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

  // Phase 7: Grade overwrite
  gradeOverwriteDiffs: GradeOverwriteDiff[];
  confirmGradeOverwrite: () => Promise<boolean>;
  cancelGradeOverwrite: () => void;
  
  updateField: (fieldName: string, value: unknown) => void;
  clearDraft: () => void;
  clearDraftPreservingSelection: () => void;
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
  nextSlot: () => Promise<boolean>;

  // Carry-forward indicators (Pass 2)
  carriedForwardFields: Set<string>;
  carriedForwardFromPlayNum: number | null;

  // Phase 10: Lookup-derived fields
  lookupDerivedFields: Set<string>;

  // Proposal metadata layer
  proposalMeta: ProposalMetaMap;
}

const TransactionContext = createContext<TransactionContextValue | null>(null);

function emptyCandidate(gameId: string): CandidateData {
  return { gameId };
}

/** Returns true when a play row is an empty placeholder (all key fields null/empty) */
function isEmptySlotPlay(play: PlayRecord): boolean {
  return (
    play.yardLn === null &&
    play.dn === null &&
    play.dist === null &&
    play.offPlay === null &&
    play.playType === null &&
    play.result === null &&
    play.gainLoss === null
  );
}

/**
 * 9.2B: Merge inactive fields — preserves committed values for deactivated fields.
 * For each inactive field, copies the existing committed value instead of the candidate value.
 */
function mergeInactiveFields(
  normalized: PlayRecord,
  existingPlay: PlayRecord | null,
  activeFields: Record<string, boolean> | undefined
): PlayRecord {
  if (!activeFields || !existingPlay) return normalized;
  const merged = { ...normalized } as unknown as Record<string, unknown>;
  for (const f of playSchema) {
    if (activeFields[f.name] === false) {
      merged[f.name] = (existingPlay as unknown as Record<string, unknown>)[f.name];
    }
  }
  return merged as unknown as PlayRecord;
}

/** Fields that are scaffolded (seeded at init) and should warn on edit */
const SCAFFOLDED_FIELDS = new Set(["odk", "series", "qtr"]);

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const { activeGame, setHasDraft, isSlotMode: gameIsSlotMode } = useGameContext();
  const { getLookupMap, lookupTables } = useLookup();
  const { roster } = useRoster();
  const { configMode } = useSeason();
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
  const [activePass, setActivePassRaw] = useState<number>(1);

  // Phase 7: Grade overwrite state
  const [gradeOverwriteDiffs, setGradeOverwriteDiffs] = useState<GradeOverwriteDiff[]>([]);
  const [pendingGradeSnapshot, setPendingGradeSnapshot] = useState<Record<string, number | null> | null>(null);
  // Carry-forward state (Pass 2 only)
  const [carriedForwardFields, setCarriedForwardFields] = useState<Set<string>>(new Set());
  const [carriedForwardFromPlayNum, setCarriedForwardFromPlayNum] = useState<number | null>(null);
  const [lastPass2CommitPlayNum, setLastPass2CommitPlayNum] = useState<number | null>(null);

  // Commit counter — incremented on each successful commit for transcript lifecycle
  const [commitCount, setCommitCount] = useState(0);

  // Phase 10: Deterministic parse state (from transcript parse)
  const [deterministicParseFields, setDeterministicParseFields] = useState<Set<string>>(new Set());
  const [parseEvidenceByField, setParseEvidenceByField] = useState<Record<string, AIFieldEvidence>>({});
  // Phase 10: Lookup-derived state (auto-populated from parent lookup selection)
  const [lookupDerivedFields, setLookupDerivedFields] = useState<Set<string>>(new Set());
  // Phase 10: AI/system patch state (reserved for true AI enrichment)
  const [aiProposedFields, setAiProposedFields] = useState<Set<string>>(new Set());
  const [aiEvidenceByField, setAiEvidenceByField] = useState<Record<string, AIFieldEvidence>>({});

  // Stage setter — no carry-forward here, just clear Pass 1 prompts
  const setActivePass = useCallback((pass: number) => {
    setActivePassRaw(pass);
    // Clear Pass 1 prompts when entering Pass 2+
    if (pass >= 2) {
      setPredictionExplanations([]);
      setPredictionCoachMessages([]);
      setPossessionCheckPending(false);
      setPossessionPrevPlayInfo(null);
    }
  }, []);

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
    setActivePassRaw(1);
    setOdkFilter("ALL");
    setDeterministicParseFields(new Set());
    setParseEvidenceByField({});
    setAiProposedFields(new Set());
    setAiEvidenceByField({});
    setLookupDerivedFields(new Set());
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

  // Track draft status — dirty when touched, parsed, or aiProposed
  useEffect(() => {
    const isDirty = touchedFields.size > 0 || deterministicParseFields.size > 0 || aiProposedFields.size > 0;
    setHasDraft(isDirty);
  }, [touchedFields, deterministicParseFields, aiProposedFields, setHasDraft]);

  // Phase 10D: Lookup interrupt state
  const [lookupInterruptPending, setLookupInterruptPending] = useState<{ fieldName: string; fieldLabel: string; value: string } | null>(null);
  const clearLookupInterrupt = useCallback(() => setLookupInterruptPending(null), []);

  // Revalidate inline errors when lookupMap changes
  useEffect(() => {
    const validationFields = new Set([...touchedFields, ...deterministicParseFields, ...aiProposedFields]);
    if (validationFields.size > 0) {
      setInlineErrors(validateInline(candidate, validationFields, getLookupMap()));
    } else {
      setInlineErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupTables]);

  const updateField = useCallback(
    (fieldName: string, value: unknown) => {
      // Stage-based field locking: reject updates for fields outside active pass
      // Exception: actor fields are editable in Pass 2 for integrity correction
      const ACTOR_FIELD_NAMES = new Set(["rusher", "passer", "receiver", "returner"]);
      const fieldDef = getFieldDef(fieldName);
      if (fieldDef && fieldDef.defaultPassEntry > activePass) {
        // Allow actor fields in Pass 2 for integrity fixes
        if (!(activePass >= 2 && ACTOR_FIELD_NAMES.has(fieldName))) {
          return; // Read-only at this stage
        }
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
      // If editing a carried-forward field, remove indicator
      setCarriedForwardFields((prev) => {
        if (prev.has(fieldName)) {
          const next = new Set(prev);
          next.delete(fieldName);
          return next;
        }
        return prev;
      });
      // Phase 10: Coach edit converts parse/AI-proposed → touched, clears evidence
      setDeterministicParseFields((prev) => {
        if (prev.has(fieldName)) {
          const next = new Set(prev);
          next.delete(fieldName);
          return next;
        }
        return prev;
      });
      setParseEvidenceByField((prev) => {
        if (fieldName in prev) {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        }
        return prev;
      });
      setAiProposedFields((prev) => {
        if (prev.has(fieldName)) {
          const next = new Set(prev);
          next.delete(fieldName);
          return next;
        }
        return prev;
      });
      // Phase 10: Coach edit removes lookup-derived tracking
      setLookupDerivedFields((prev) => {
        if (prev.has(fieldName)) {
          const next = new Set(prev);
          next.delete(fieldName);
          return next;
        }
        return prev;
      });
      setAiEvidenceByField((prev) => {
        if (fieldName in prev) {
          const next = { ...prev };
          delete next[fieldName];
          return next;
        }
        return prev;
      });
      setState("candidate");
      setCommitErrors({});

      const newTouched = new Set(touchedFields).add(fieldName);
      const newCandidate = { ...candidate, [fieldName]: value };
      // Validate union of touched + parse + aiProposed
      const validationFields = new Set([...newTouched, ...deterministicParseFields, ...aiProposedFields, ...lookupDerivedFields]);
      setInlineErrors(validateInline(newCandidate, validationFields, getLookupMap()));
    },
    [candidate, touchedFields, getLookupMap, isSlotMode, selectedSlotNum, slotMetaMap, activePass, lookupDerivedFields]
  );

  // Phase 10: Mark fields as lookup-derived (auto-populated from parent lookup)
  const markLookupDerived = useCallback((fieldNames: string[]) => {
    setLookupDerivedFields((prev) => {
      const next = new Set(prev);
      for (const fn of fieldNames) next.add(fn);
      return next;
    });
    // Remove from touched so provenance stays lookup_derived
    setTouchedFields((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const fn of fieldNames) {
        if (next.has(fn)) { next.delete(fn); changed = true; }
      }
      return changed ? next : prev;
    });
  }, []);

  // Phase 10: Apply system patch without marking fields as touched
  // Routes to deterministicParseFields or aiProposedFields based on source option
  const applySystemPatch = useCallback(
    (patch: Record<string, unknown>, options?: SystemPatchOptions): SystemPatchCollision[] => {
      const fillOnly = options?.fillOnly !== false; // default true
      const evidence = options?.evidence;
      const source = options?.source ?? "deterministic_parse"; // default to parse
      const collisions: SystemPatchCollision[] = [];
      const fieldsToApply: Record<string, unknown> = {};
      const newFields = new Set<string>();

      const ACTOR_FIELD_NAMES = new Set(["rusher", "passer", "receiver", "returner"]);

      for (const [fieldName, proposedValue] of Object.entries(patch)) {
        if (fieldName === "gameId" || fieldName === "playNum") continue;

        // 10-1C: Respect pass locking — same gate as updateField
        const fieldDef = getFieldDef(fieldName);
        if (fieldDef && fieldDef.defaultPassEntry > activePass) {
          if (!(activePass >= 2 && ACTOR_FIELD_NAMES.has(fieldName))) {
            continue; // skip out-of-pass fields
          }
        }

        const currentValue = (candidate as Record<string, unknown>)[fieldName];
        const hasExisting = currentValue !== null && currentValue !== undefined && currentValue !== "";

        if (fillOnly && hasExisting && String(currentValue) !== String(proposedValue)) {
          collisions.push({ fieldName, currentValue, proposedValue });
          continue;
        }

        fieldsToApply[fieldName] = proposedValue;
        newFields.add(fieldName);
      }

      if (Object.keys(fieldsToApply).length > 0) {
        // Canonicalize values against lookup map for proper casing
        const lookupMapForCasing = getLookupMap();
        for (const [fieldName, value] of Object.entries(fieldsToApply)) {
          if (!lookupMapForCasing.has(fieldName)) continue;
          const knownValues = lookupMapForCasing.get(fieldName) ?? [];
          const valStr = String(value).trim();
          if (valStr === "") continue;
          const valLower = valStr.toLowerCase().replace(/\s+/g, " ");
          const canonicalMatch = knownValues.find(
            (v) => v.toLowerCase().replace(/\s+/g, " ") === valLower
          );
          if (canonicalMatch) {
            fieldsToApply[fieldName] = canonicalMatch;
          }
        }
        setCandidate((prev) => ({ ...prev, ...fieldsToApply }));

        // Route to correct provenance set based on source
        if (source === "deterministic_parse") {
          setDeterministicParseFields((prev) => {
            const next = new Set(prev);
            for (const f of newFields) next.add(f);
            return next;
          });
          if (evidence) {
            setParseEvidenceByField((prev) => {
              const next = { ...prev };
              for (const f of newFields) {
                if (evidence[f]) next[f] = evidence[f];
              }
              return next;
            });
          }
        } else {
          // ai_proposed
          setAiProposedFields((prev) => {
            const next = new Set(prev);
            for (const f of newFields) next.add(f);
            return next;
          });
          if (evidence) {
            setAiEvidenceByField((prev) => {
              const next = { ...prev };
              for (const f of newFields) {
                if (evidence[f]) next[f] = evidence[f];
              }
              return next;
            });
          }
        }

        // Recompute inline errors with union of all active field sets
        const updatedCandidate = { ...candidate, ...fieldsToApply };
        const validationFields = new Set([...touchedFields, ...deterministicParseFields, ...aiProposedFields, ...newFields]);
        setInlineErrors(validateInline(updatedCandidate as CandidateData, validationFields, getLookupMap()));

        setState("candidate");
        setCommitErrors({});

        // 10-1D: Immediate lookup interrupt for governed lookup fields with unknown values
        const lookupMap = getLookupMap();
        for (const [fieldName, value] of Object.entries(fieldsToApply)) {
          if (!lookupMap.has(fieldName)) continue;
          const knownValues = lookupMap.get(fieldName) ?? [];
          const valStr = String(value).trim();
          if (valStr === "") continue;
          const canonical = valStr.toLowerCase().replace(/\s+/g, " ");
          const found = knownValues.some((v) => v.toLowerCase().replace(/\s+/g, " ") === canonical);
          if (!found) {
            const fd = getFieldDef(fieldName);
            setLookupInterruptPending({
              fieldName,
              fieldLabel: fd?.label ?? fieldName,
              value: valStr,
            });
            break;
          }
        }
      }

      return collisions;
    },
    [candidate, touchedFields, aiProposedFields, getLookupMap, activePass]
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
    setCarriedForwardFields(new Set());
    setCarriedForwardFromPlayNum(null);
    setDeterministicParseFields(new Set());
    setParseEvidenceByField({});
    setAiProposedFields(new Set());
    setAiEvidenceByField({});
    setLookupDerivedFields(new Set());
    setCommitCount((c) => c + 1);
  }, [gameId, isSlotMode]);

  const clearDraftPreservingSelection = useCallback(() => {
    if (!(isSlotMode && selectedSlotNum !== null)) {
      clearDraft();
      return;
    }

    setCandidate(emptyCandidate(gameId));
    setTouchedFields(new Set());
    setPredictedFields(new Set());
    setPredictionExplanations([]);
    setPredictionCoachMessages([]);
    setAdjustments([]);
    setInlineErrors({});
    setCommitErrors({});
    setState(gameId ? "candidate" : "idle");
    setExistingPlay(null);
    setPendingNormalized(null);
    setScaffoldedWarning(null);
    setPatContext(false);
    setPatTryPending(false);
    setPatLockedTry(null);
    setCarriedForwardFields(new Set());
    setCarriedForwardFromPlayNum(null);
    setDeterministicParseFields(new Set());
    setParseEvidenceByField({});
    setAiProposedFields(new Set());
    setAiEvidenceByField({});
    setLookupDerivedFields(new Set());
    setCommitCount((c) => c + 1);
  }, [clearDraft, gameId, isSlotMode, selectedSlotNum]);

  const reviewProposal = useCallback(() => {
    if (configMode) {
      toast.error("Exit Configuration Mode first.");
      return;
    }
    // ── Pass 3: Grade-only review ──
    if (activePass === 3) {
      // Only validate touched grade fields
      const gradeErrors: ValidationErrors = {};
      for (const fieldName of touchedFields) {
        if (!GRADE_FIELDS.includes(fieldName as any)) continue;
        const val = (candidate as Record<string, unknown>)[fieldName];
        if (val === null || val === undefined || val === "") continue;
        const str = String(val).trim();
        if (!/^-?\d+$/.test(str)) {
          gradeErrors[fieldName] = `Must be a whole number`;
          continue;
        }
        const num = Number(str);
        if (num < -3 || num > 3) {
          gradeErrors[fieldName] = `Must be between -3 and 3`;
        }
      }
      if (Object.keys(gradeErrors).length > 0) {
        setInlineErrors(gradeErrors);
        return;
      }
      setInlineErrors({});
      setAdjustments([]);
      setState("proposal");
      return;
    }

    // Validate union of touched + parse + aiProposed fields
    const validationFields = new Set([...touchedFields, ...deterministicParseFields, ...aiProposedFields]);
    const errors = validateInline(candidate, validationFields, getLookupMap());
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
      if (!touchedFields.has("penYards")) {
        const defaultYards = PENALTY_YARDS_MAP[penaltyVal];
        const currentPenYards = candidate.penYards;
        if (defaultYards !== undefined && (currentPenYards === null || currentPenYards === undefined || currentPenYards === "")) {
          setCandidate((prev) => ({ ...prev, penYards: defaultYards }));
          reviewAdjustments.push("Penalty yards filled from the penalty list. You can change it.");
        }
      }
    } else {
      if (!touchedFields.has("penYards") && candidate.penYards != null && candidate.penYards !== "") {
        setCandidate((prev) => ({ ...prev, penYards: null }));
        reviewAdjustments.push("Penalty cleared. Penalty yards cleared.");
      }
    }

    // Phase 6: PAT context
    if (patContext && candidate.patTry) {
      const expectedPlayType = patTryToPlayType(String(candidate.patTry));
      const currentPlayType = candidate.playType as string | null;
      if (currentPlayType !== expectedPlayType) {
        reviewAdjustments.push(`Adjusted: Play Type set to ${expectedPlayType} due to PAT rules.`);
        setCandidate((prev) => ({ ...prev, playType: expectedPlayType }));
      }
      const patResultError = validatePATResult(candidate.result as string | null);
      if (patResultError) {
        setCommitErrors({ result: patResultError });
        return;
      }
      setAdjustments(reviewAdjustments);
      setState("proposal");
      return;
    }

    // Offsetting Penalties → force EFF = N
    if (!touchedFields.has("eff") && String(candidate.result) === "Offsetting Penalties") {
      setCandidate((prev) => ({ ...prev, eff: "N" }));
    } else if (!touchedFields.has("eff")) {
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

    // Phase 5C: TD labeling correction
    const qc = runCommitQC(
      candidate.yardLn != null ? Number(candidate.yardLn) : null,
      candidate.gainLoss != null ? Number(candidate.gainLoss) : null,
      candidate.result as string | null,
      fieldSize as 80 | 100
    );

    if (qc.gainLossMessage) {
      const originalGL = candidate.gainLoss != null ? Number(candidate.gainLoss) : null;
      setCandidate((prev) => ({ ...prev, gainLoss: qc.adjustedGainLoss }));
      reviewAdjustments.push(`Adjusted: Gain limited from ${originalGL} to ${qc.adjustedGainLoss}.`);
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

    if (qc.correctedResult) {
      setTdCorrectionPending({ correctedResult: qc.correctedResult, normalizedPlay: null as unknown as PlayRecord, existingSlot: null });
      return;
    }

    setState("proposal");
  }, [candidate, touchedFields, getLookupMap, fieldSize, patContext, selectedSlotNum, committedPlays, odkFilter, activePass, rosterNumbers, configMode]);

  const backToEdit = useCallback(() => {
    if (state === "proposal") {
      setState("candidate");
      setCommitErrors({});
    }
  }, [state]);

  /** Helper: field-scoped grade commit — merges only grade fields onto committedRow */
  const commitGradeFields = useCallback(async (
    gradeSnapshot: Record<string, number | null>,
    committedRow: PlayRecord
  ): Promise<boolean> => {
    if (!selectedSlotNum) return false;
    // Build merged play: copy committedRow, overwrite only grade fields
    const merged = { ...committedRow } as unknown as Record<string, unknown>;
    for (const gf of GRADE_FIELDS) {
      merged[gf] = gradeSnapshot[gf] ?? null;
    }
    const mergedPlay = merged as unknown as PlayRecord;

    await dbCommitPlay(mergedPlay, committedRow);

    // Update slotMeta: add grade fields to committed set
    const meta = slotMetaMap.get(selectedSlotNum);
    const newCommittedFields = new Set(meta?.committedFields ?? []);
    for (const gf of GRADE_FIELDS) {
      if (gradeSnapshot[gf] != null) {
        newCommittedFields.add(gf);
      }
    }
    const committedFieldsArr = Array.from(newCommittedFields);
    const passFlags = computePassCompletion(mergedPlay, committedFieldsArr);
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
  }, [gameId, selectedSlotNum, slotMetaMap, clearDraft]);

  const commitProposal = useCallback(async (): Promise<boolean> => {
    if (configMode) {
      toast.error("Exit Configuration Mode first.");
      return false;
    }
    if (state !== "proposal") return false;

    // ── Pass 3: Field-scoped grade commit ──
    if (activePass === 3 && isSlotMode && selectedSlotNum !== null) {
      const committedRow = committedPlays.find((p) => p.playNum === selectedSlotNum);
      
      // Defense-in-depth: hard reject if no committedRow or not offense
      if (!committedRow) {
        setCommitErrors({ _gate: "No committed row found. Commit Pass 1 first." });
        return false;
      }
      if (committedRow.odk !== "O") {
        setCommitErrors({ _gate: "Grades only apply to committed Offense plays (ODK = O)." });
        return false;
      }

      // Normalize grade fields from candidate to integers
      const gradeSnapshot: Record<string, number | null> = {};
      const gradeErrors: ValidationErrors = {};
      for (const gf of GRADE_FIELDS) {
        const raw = (candidate as Record<string, unknown>)[gf];
        if (raw === null || raw === undefined || raw === "") {
          gradeSnapshot[gf] = null;
          continue;
        }
        const str = String(raw).trim();
        if (!/^-?\d+$/.test(str)) {
          gradeErrors[gf] = `Must be a whole number`;
          continue;
        }
        const num = Number(str);
        if (num < -3 || num > 3) {
          gradeErrors[gf] = `Must be between -3 and 3`;
          continue;
        }
        gradeSnapshot[gf] = num;
      }
      if (Object.keys(gradeErrors).length > 0) {
        setCommitErrors(gradeErrors);
        return false;
      }

      // Check for no-op
      const cr = committedRow as unknown as Record<string, unknown>;
      const hasAnyChange = GRADE_FIELDS.some((gf) => {
        const before = cr[gf] as number | null ?? null;
        const after = gradeSnapshot[gf] ?? null;
        return before !== after;
      });
      if (!hasAnyChange) {
        setCommitErrors({ _noop: "No grade changes to commit." });
        return false;
      }

      // Compute overwrite diffs: trigger when before !== null AND after !== before
      const diffs: GradeOverwriteDiff[] = [];
      for (const gf of GRADE_FIELDS) {
        const before = cr[gf] as number | null ?? null;
        const after = gradeSnapshot[gf] ?? null;
        if (before !== null && after !== before) {
          diffs.push({ field: gf, before, after });
        }
      }

      if (diffs.length > 0) {
        // Freeze snapshot and show dialog
        setPendingGradeSnapshot({ ...gradeSnapshot });
        setGradeOverwriteDiffs(diffs);
        return false;
      }

      // No overwrites — direct field-scoped commit
      return commitGradeFields(gradeSnapshot, committedRow);
    }

    // 9.2B: Load season config for inactive field merge
    const seasonId = activeGame?.seasonId;
    const seasonCfg = seasonId ? await getSeasonConfig(seasonId) : undefined;
    const cfgActiveFields = seasonCfg?.activeFields;

    if (isSlotMode && selectedSlotNum !== null) {
      // Slot-mode commit: field-level commit state
      const result = validateCommitGate(candidate, activePass, getLookupMap(), rosterNumbers);
      if (!result.valid) {
        setCommitErrors(result.errors);
        return false;
      }

      let normalized = result.normalizedPlay!;

      const meta = slotMetaMap.get(selectedSlotNum);
      const committedFields = meta?.committedFields ?? [];

      const existingSlot = committedPlays.find((p) => p.playNum === selectedSlotNum);

      // 9.2B: Merge inactive fields from existing committed play
      normalized = mergeInactiveFields(normalized, existingSlot ?? null, cfgActiveFields);
      
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

      const overwriteFields: string[] = [];

      if (existingSlot) {
        for (const fieldName of committedFields) {
          if (fieldName === "playNum" || fieldName === "gameId") continue;
          // 9.2C: Skip inactive fields from overwrite detection
          if (cfgActiveFields && cfgActiveFields[fieldName] === false) continue;
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

    let normalized = result.normalizedPlay!;

    const existing = await getPlay(gameId, normalized.playNum);
    if (existing && !isEmptySlotPlay(existing)) {
      // 9.2B: Merge inactive fields before overwrite review
      normalized = mergeInactiveFields(normalized, existing, cfgActiveFields);
      setExistingPlay(existing);
      setPendingNormalized(normalized);
      setState("overwrite-review");
      return false;
    }

    // 9.2B: Merge inactive fields for empty slot / first commit
    if (existing) {
      normalized = mergeInactiveFields(normalized, existing, cfgActiveFields);
    }

    await dbCommitPlay(normalized, existing ?? null);
    const plays = await getPlaysByGame(gameId);
    setCommittedPlays(plays.sort((a, b) => a.playNum - b.playNum));
    clearDraft();
    return true;
  }, [candidate, activePass, gameId, clearDraft, state, getLookupMap, isSlotMode, selectedSlotNum, slotMetaMap, committedPlays, rosterNumbers, commitGradeFields, configMode, activeGame?.seasonId]);

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

      // ── Q3 Series auto-increment (runs in ALL passes) ──
      // If this play is Q3 start and ODK=O, force series = (most recent prior O play's series) + 1
      const initConfig = await getGameInit(gameId);
      let halfTimeBoundary = false;
      if (initConfig) {
        const q3Start = initConfig.quarterStarts["3"];
        if (q3Start !== undefined && q3Start !== null && playNum === q3Start) {
          halfTimeBoundary = true;
        }
      }

      if (halfTimeBoundary && slot.odk === "O") {
        // DB-backed: scan backwards from playNum-1 to find last O play with series
        let lastSeries: number | null = null;
        for (let n = playNum - 1; n >= 1; n--) {
          const p = await getPlay(gameId, n);
          if (p && p.odk === "O" && p.series != null) {
            const s = Number(p.series);
            if (Number.isFinite(s)) {
              lastSeries = s;
              break;
            }
          }
        }
        const proposedSeries = lastSeries !== null ? lastSeries + 1 : 1;
        // Force override unless coach manually set a DIFFERENT value (not matching block-carried slot value)
        const currentSeries = newCandidate.series;
        const slotOriginalSeries = slot.series;
        const currentNum = currentSeries != null && currentSeries !== "" ? Number(currentSeries) : null;
        const slotNum = slotOriginalSeries != null ? Number(slotOriginalSeries) : null;
        if (currentNum === null || currentNum === slotNum) {
          newCandidate.series = proposedSeries;
        }
      }

      // ── Pass 1-only logic: predictions, PAT, possession ──
      // When activePass >= 2, skip all Pass 1 gating entirely
      if (activePass < 2) {
        // Phase 6: PAT context detection
        const isPAT = shouldEnterPATContext(prevPlay, slot, patMode);
        setPatContext(isPAT);
        
        if (isPAT) {
          const carriedTry = getCarriedPatTry(prevPlay, slot);
          if (carriedTry) {
            newCandidate.patTry = carriedTry;
            newCandidate.playType = patTryToPlayType(carriedTry);
            setPatLockedTry(carriedTry as "1" | "2");
          } else {
            setPatLockedTry(null);
          }
          setPatTryPending(true);
          
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

        const prediction = computePrediction(prevPlay, slot.odk, fieldSize as 80 | 100, halfTimeBoundary);
        
        // 9.3: Load active fields for prediction filtering
        const slotSeasonId = activeGame?.seasonId;
        const slotSeasonCfg = slotSeasonId ? await getSeasonConfig(slotSeasonId) : undefined;
        const slotActiveFields = slotSeasonCfg?.activeFields;

        const newPredicted = new Set<string>();
        if (prediction.eligible) {
          const meta = slotMetaMap.get(playNum);
          const committedFieldSet = new Set(meta?.committedFields ?? []);
          
          for (const [field, val] of Object.entries({ yardLn: prediction.yardLn, dn: prediction.dn, dist: prediction.dist })) {
            // 9.3: Do not output predicted values into inactive fields
            if (slotActiveFields && slotActiveFields[field] === false) continue;
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
        return;
      }

      // ── Pass 2+ logic: no predictions, no possession, no PAT ──
      setPatContext(false);
      setPatTryPending(false);
      setPatLockedTry(null);
      setPossessionCheckPending(false);
      setPossessionPrevPlayInfo(null);

      // Optional +1 carry-forward exception: only if this is exactly lastPass2CommitPlayNum + 1
      if (activePass === 2 && slot.odk === "O" && lastPass2CommitPlayNum !== null && playNum === lastPass2CommitPlayNum + 1) {
        const sourcePlay = committedPlays.find((p) => p.playNum === lastPass2CommitPlayNum);
        if (sourcePlay) {
          const seededFields = new Set<string>();
          const sp = sourcePlay as unknown as Record<string, unknown>;
          for (const pos of PERSONNEL_POSITIONS) {
            const currentVal = (newCandidate as Record<string, unknown>)[pos];
            if (currentVal === null || currentVal === undefined || currentVal === "") {
              const srcVal = sp[pos];
              if (srcVal !== null && srcVal !== undefined && srcVal !== "") {
                (newCandidate as Record<string, unknown>)[pos] = srcVal;
                seededFields.add(pos);
              }
            }
          }
          if (seededFields.size > 0) {
            setCarriedForwardFields(seededFields);
            setCarriedForwardFromPlayNum(lastPass2CommitPlayNum);
          }
        }
      } else {
        // No carry-forward on arbitrary selection
        setCarriedForwardFields(new Set());
        setCarriedForwardFromPlayNum(null);
      }

      setCandidate(newCandidate);
      setSelectedSlotNum(playNum);
      setTouchedFields(new Set());
      setPredictedFields(new Set());
      setPredictionExplanations([]);
      setPredictionCoachMessages([]);
      setInlineErrors({});
      setCommitErrors({});
      setScaffoldedWarning(null);
      setAdjustments([]);
      setState("candidate");
    },
    [committedPlays, gameId, fieldSize, slotMetaMap, patMode, odkFilter, activePass, lastPass2CommitPlayNum, activeGame?.seasonId]
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
    setDeterministicParseFields(new Set());
    setParseEvidenceByField({});
    setAiProposedFields(new Set());
    setAiEvidenceByField({});
    setLookupDerivedFields(new Set());
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

  // Phase 7: Grade overwrite confirmation — uses frozen snapshot
  const confirmGradeOverwrite = useCallback(async (): Promise<boolean> => {
    if (!pendingGradeSnapshot || !selectedSlotNum) return false;
    const committedRow = committedPlays.find((p) => p.playNum === selectedSlotNum);
    if (!committedRow || committedRow.odk !== "O") return false;
    const success = await commitGradeFields(pendingGradeSnapshot, committedRow);
    setGradeOverwriteDiffs([]);
    setPendingGradeSnapshot(null);
    return success;
  }, [pendingGradeSnapshot, selectedSlotNum, committedPlays, commitGradeFields]);

  const cancelGradeOverwrite = useCallback(() => {
    setGradeOverwriteDiffs([]);
    setPendingGradeSnapshot(null);
    setState("proposal");
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

  // Phase 6: Next Slot — pure navigation, no commit, no state mutation
  const nextSlot = useCallback(async (): Promise<boolean> => {
    if (!gameId || selectedSlotNum === null) return false;

    const freshPlays = await getPlaysByGame(gameId);
    const sortedPlays = freshPlays.sort((a, b) => a.playNum - b.playNum);
    const filteredList = odkFilter === "ALL"
      ? sortedPlays
      : sortedPlays.filter((p) => p.odk === odkFilter);

    const currentIdx = filteredList.findIndex((p) => p.playNum === selectedSlotNum);
    if (currentIdx >= 0 && currentIdx < filteredList.length - 1) {
      const nextPlay = filteredList[currentIdx + 1];
      await selectSlot(nextPlay.playNum);
      return true;
    }
    return false;
  }, [gameId, selectedSlotNum, odkFilter, selectSlot]);

  // Phase 4: Commit & Next — advances to next slot in filtered scaffold list
  const commitAndNext = useCallback(async (): Promise<{ committed: boolean; hasNext: boolean }> => {
    if (state !== "proposal") {
      return { committed: false, hasNext: false };
    }

    // Snapshot current state before commit (clearDraft resets selectedSlotNum)
    const currentSlotNum = selectedSlotNum;
    const currentActivePass = activePass;

    const success = await commitProposal();
    if (!success) {
      return { committed: false, hasNext: false };
    }

    // Track last Pass 2 commit for +1 exception
    if (currentActivePass === 2 && currentSlotNum !== null) {
      setLastPass2CommitPlayNum(currentSlotNum);
    }

    // Refresh committedPlays from DB before selecting next slot
    await refreshCommittedPlays();

    // Re-read fresh plays for filtered list
    const freshPlays = await getPlaysByGame(gameId);
    const sortedPlays = freshPlays.sort((a, b) => a.playNum - b.playNum);

    const filteredList = odkFilter === "ALL"
      ? sortedPlays
      : sortedPlays.filter((p) => p.odk === odkFilter);
    
    const currentIdx = filteredList.findIndex((p) => p.playNum === currentSlotNum);
    if (currentIdx >= 0 && currentIdx < filteredList.length - 1) {
      const nextPlay = filteredList[currentIdx + 1];

      // Pass 2 carry-forward: seed personnel into next slot if ODK=O
      if (currentActivePass === 2 && nextPlay.odk === "O" && currentSlotNum !== null) {
        // Get the just-committed play from fresh data
        const justCommitted = sortedPlays.find((p) => p.playNum === currentSlotNum);
        if (justCommitted) {
          const nextSlot = sortedPlays.find((p) => p.playNum === nextPlay.playNum);
          if (nextSlot) {
            const seededCandidate: CandidateData = { ...nextSlot };
            const seededFields = new Set<string>();
            const src = justCommitted as unknown as Record<string, unknown>;
            for (const pos of PERSONNEL_POSITIONS) {
              const currentVal = (seededCandidate as unknown as Record<string, unknown>)[pos];
              if (currentVal === null || currentVal === undefined || currentVal === "") {
                const srcVal = src[pos];
                if (srcVal !== null && srcVal !== undefined && srcVal !== "") {
                  (seededCandidate as unknown as Record<string, unknown>)[pos] = srcVal;
                  seededFields.add(pos);
                }
              }
            }

            // Set state directly instead of calling selectSlot to avoid clearing seeded values
            setCandidate(seededCandidate);
            setSelectedSlotNum(nextPlay.playNum);
            setTouchedFields(new Set());
            setPredictedFields(new Set());
            setPredictionExplanations([]);
            setPredictionCoachMessages([]);
            setInlineErrors({});
            setCommitErrors({});
            setScaffoldedWarning(null);
            setAdjustments([]);
            setPatContext(false);
            setPatTryPending(false);
            setPatLockedTry(null);
            setPossessionCheckPending(false);
            setPossessionPrevPlayInfo(null);
            setCarriedForwardFields(seededFields);
            setCarriedForwardFromPlayNum(currentSlotNum);
            setDeterministicParseFields(new Set());
            setParseEvidenceByField({});
            setAiProposedFields(new Set());
            setAiEvidenceByField({});
            setLookupDerivedFields(new Set());
            setState("candidate");
            return { committed: true, hasNext: true };
          }
        }
      }

      await selectSlot(nextPlay.playNum);
      return { committed: true, hasNext: true };
    }

    // No next slot — already deselected by clearDraft
    return { committed: true, hasNext: false };
  }, [state, selectedSlotNum, committedPlays, odkFilter, commitProposal, selectSlot, refreshCommittedPlays, gameId, activePass]);

  // Structured validation reasons for proposal metadata
  const validationReasons = useMemo(() => {
    const activeFields = new Set([...touchedFields, ...deterministicParseFields, ...aiProposedFields, ...lookupDerivedFields]);
    return computeValidationReasons(candidate, activeFields, getLookupMap(), rosterNumbers);
  }, [candidate, touchedFields, deterministicParseFields, aiProposedFields, lookupDerivedFields, getLookupMap, rosterNumbers]);

  // Proposal metadata — derived from existing state signals
  const proposalMeta = useMemo(() => computeProposalMeta({
    candidate: candidate as Record<string, unknown>,
    touchedFields,
    predictedFields,
    deterministicParseFields,
    aiProposedFields,
    lookupDerivedFields,
    carriedForwardFields,
    parseEvidenceByField,
    aiEvidenceByField,
    validationReasons,
  }), [candidate, touchedFields, predictedFields, deterministicParseFields, aiProposedFields, lookupDerivedFields, carriedForwardFields, parseEvidenceByField, aiEvidenceByField, validationReasons]);

  return (
    <TransactionContext.Provider
      value={{
        commitCount,
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
        deterministicParseFields,
        parseEvidenceByField,
        aiProposedFields,
        aiEvidenceByField,
        applySystemPatch,
        lookupInterruptPending,
        clearLookupInterrupt,
        activePass,
        setActivePass,
        odkFilter,
        setOdkFilter,
        updateField,
        clearDraft,
        clearDraftPreservingSelection,
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
        nextSlot,
        carriedForwardFields,
        carriedForwardFromPlayNum,
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
        gradeOverwriteDiffs,
        confirmGradeOverwrite,
        cancelGradeOverwrite,
        proposalMeta,
        markLookupDerived,
        lookupDerivedFields,
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
