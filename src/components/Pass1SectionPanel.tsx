/**
 * Pass1SectionPanel — Section-based candidate entry for Pass 1.
 *
 * Three Section cards in the left column own disjoint subsets of Pass 1 fields:
 *   - Situation
 *   - Play Details
 *   - Play Results
 *
 * Each Section accepts dictated or typed text and runs a section-scoped
 * "Update Proposal" pipeline: deterministic parse → AI enrichment → governed
 * lookup interrupts, all restricted to that section's owned fields.
 *
 * Right column is the Unified Proposal Candidate (the existing field grid),
 * rendered by the parent via `proposalSlot` so we don't reimplement field
 * rendering here.
 *
 * Keyboard model:
 *   Text Editing OFF (default): single-key shortcuts S/D/R/U/C/F/N/L are active.
 *   Text Editing ON: typing flows into focused textarea; only Esc fires (exits).
 *
 * No silent commit, no AI scope expansion, no overwrite of manually edited fields
 * without a section-scoped overwrite review.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Trash2,
  RefreshCw,
  Pencil,
  PencilOff,
  Loader2,
  Keyboard,
  Flag,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";

import { SECTIONS, type SectionDef, type SectionId, ALL_SECTION_OWNED_FIELDS } from "@/engine/sectionOwnership";
import { useTransaction, type SystemPatchCollision } from "@/engine/transaction";
import { useLookup } from "@/engine/lookupContext";
import { useGameContext } from "@/engine/gameContext";
import { useTranscriptCapture } from "@/hooks/useTranscriptCapture";
import { parseRawInput } from "@/engine/rawInputParser";
import { normalizeTranscriptForParse } from "@/engine/transcriptNormalize";
import { normalizeGovernedCandidate, normalizeGovernedCandidateForField } from "@/engine/governedValueNormalize";
import { fetchAiProposal } from "@/engine/aiEnrichClient";
import { playSchema } from "@/engine/schema";
import { RawInputCollisionDialog, type Collision } from "@/components/RawInputCollisionDialog";

interface Pass1SectionPanelProps {
  /** The right-column Unified Proposal Candidate slot (existing field grid). */
  proposalSlot: React.ReactNode;
  /** Bottom action bar in the right column. */
  proposalActions?: React.ReactNode;
}

interface SectionState {
  /** Persisted text for this section (everything outside an active dictation). */
  text: string;
  /** Whether text changed since the last successful Update Proposal. */
  dirty: boolean;
  /** Last applied source text for diffing. */
  lastAppliedText: string;
}

const INITIAL_SECTION_STATE: SectionState = { text: "", dirty: false, lastAppliedText: "" };

/** Join a persisted base with the in-flight live dictation transcript. */
function joinBaseAndLive(base: string, live: string): string {
  const b = base.trimEnd();
  const l = live.trim();
  if (!b) return l;
  if (!l) return base;
  return b + (b.endsWith("\n") ? "" : "\n") + l;
}

/** Build a label lookup once. */
const FIELD_LABELS: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const f of playSchema) m[f.name] = f.label;
  return m;
})();

/**
 * Governed lookup fields where an AI proposal value must look like a field
 * candidate (a short canonical token), NOT a transcript-shaped sentence.
 * Used to prevent governance from firing against raw natural-language blobs
 * such as "we're in black formation we're running 26 punch".
 */
const GOVERNED_LOOKUP_FIELDS = new Set(["offForm", "offPlay", "motion"]);

/**
 * Derived fields are populated ONLY by deterministic lookup-derivation
 * (offForm → offStrength/personnel; offPlay → playType/playDir; motion → motionDir)
 * or by deterministic calculation (eff). They must NEVER be AI-targeted, must
 * NEVER trigger lookup governance, and must NEVER show a "New Value Suggested"
 * modal — even if AI hallucinates a value for them. This is a hard guardrail
 * applied above the AI-eligibility filter as belt-and-suspenders.
 */
const DERIVED_FIELDS_NEVER_AI = new Set([
  "offStrength",
  "personnel",
  "playType",
  "playDir",
  "motionDir",
  "eff",
]);

/**
 * Literal absent-data placeholders that the AI sometimes returns instead of
 * omitting a field. These must NEVER reach governance / candidate state.
 * Absent data must be expressed as null/empty, not as a string token.
 */
const ABSENT_PLACEHOLDERS = new Set([
  "none", "n/a", "na", "null", "nil", "nothing", "no",
  "no motion", "no penalty", "no result",
  "—", "-", "--", "unknown", "n.a.",
]);

function isAbsentPlaceholder(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  if (!v) return true;
  return ABSENT_PLACEHOLDERS.has(v);
}

/**
 * Heuristic: a governed value looks like a real field candidate
 * (e.g. "Black", "26 Punch", "Z Jet") and not a transcript chunk.
 *  - ≤ 32 chars
 *  - ≤ 4 whitespace-separated tokens
 *  - no sentence punctuation (. , ; : ! ?)
 *  - no obvious narration verbs ("we're", "running", "called", etc.)
 */
function looksLikeGovernedCandidate(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim();
  if (!v) return false;
  if (isAbsentPlaceholder(v)) return false;
  if (v.length > 32) return false;
  if (/[.,;:!?]/.test(v)) return false;
  const tokens = v.split(/\s+/);
  if (tokens.length > 4) return false;
  // Reject narration / filler tokens
  if (/\b(we|we're|were|im|i'm|the|a|running|called|ran|run|gonna|going|then|and)\b/i.test(v)) {
    return false;
  }
  return true;
}

export function Pass1SectionPanel({ proposalSlot, proposalActions }: Pass1SectionPanelProps) {
  const {
    state,
    candidate,
    touchedFields,
    deterministicParseFields,
    predictedFields,
    carriedForwardFields,
    lookupDerivedFields,
    aiProposedFields,
    activePass,
    applySystemPatch,
    requestAiEnrichment,
    updateField,
    reviewProposal,
    commitProposal,
    commitAndNext,
    deselectSlot,
    commitCount,
    lookupInterruptPending,
    lookupAppendInProgress,
    reseedAutoFieldsFor,
    rebuildLookupGovernanceQueue,
  } = useTransaction();
  const { getLookupMap } = useLookup();
  const { activeGame } = useGameContext();

  const isProposal = state === "proposal";

  // ── Per-section state ──
  const [sectionState, setSectionState] = useState<Record<SectionId, SectionState>>(() => ({
    situation: { ...INITIAL_SECTION_STATE },
    playDetails: { ...INITIAL_SECTION_STATE },
    playResults: { ...INITIAL_SECTION_STATE },
  }));

  /** Most recently interacted section — target for U / C / F. */
  const [activeSection, setActiveSection] = useState<SectionId>("situation");

  /** Single shared dictation hook; we route its output to whichever section is recording. */
  const recording = useTranscriptCapture();
  const recordingForRef = useRef<SectionId | null>(null);
  /** Snapshot of section.text at the moment dictation started for that section. */
  const baseTextBeforeDictationRef = useRef<string>("");
  /**
   * Monotonic counter incremented on every dictation switch. Used to detect
   * stale `recording.text` in `computeSectionRenderedText` — after a switch,
   * `recording.clear()` is async (React setState) so `recording.text` briefly
   * still holds the OLD section's transcript. By comparing the generation at
   * switch time vs render time we avoid leaking that stale text into the new
   * section's textarea.
   */
  const dictationGenRef = useRef(0);
  const dictationGenAtClearRef = useRef(0);

  /** Text Editing toggle. */
  const [textEditing, setTextEditing] = useState(false);

  /** Per-section busy flag. */
  const [busySection, setBusySection] = useState<SectionId | null>(null);

  /** Section-scoped overwrite review state. */
  const [overwriteState, setOverwriteState] = useState<{
    section: SectionId;
    collisions: Collision[];
    /** Resolved overwrite patch fields (apply via fillOnly:false). */
    onConfirm: (selectedFields: Set<string>) => void;
  } | null>(null);

  /** Section-scoped AI clarification modal (single-key answerable). */
  const [clarification, setClarification] = useState<{
    section: SectionId;
    title: string;
    snippet?: string;
    question: string;
    options: { key: string; label: string; onSelect: () => void }[];
  } | null>(null);

  // Reset all sections after commit.
  const commitCountRef = useRef(commitCount);
  useEffect(() => {
    if (commitCountRef.current !== commitCount) {
      commitCountRef.current = commitCount;
      setSectionState({
        situation: { ...INITIAL_SECTION_STATE },
        playDetails: { ...INITIAL_SECTION_STATE },
        playResults: { ...INITIAL_SECTION_STATE },
      });
      recording.clear();
      recordingForRef.current = null;
      baseTextBeforeDictationRef.current = "";
      setBusySection(null);
      setOverwriteState(null);
      setClarification(null);
    }
  }, [commitCount, recording]);

  /**
   * Compute the rendered text for a section, accounting for active dictation.
   * While that section is being dictated into, render base + live transcript.
   * Otherwise render the persisted section.text as-is.
   */
  const computeSectionRenderedText = useCallback(
    (id: SectionId): string => {
      const persisted = sectionState[id].text;
      if (recordingForRef.current !== id) return persisted;
      // If recording.text hasn't been cleared yet after a section switch,
      // it still holds stale text from the previous section. Detect this by
      // comparing generation counters: dictationGenRef is bumped on switch,
      // dictationGenAtClearRef is bumped once recording.text becomes empty
      // after the clear call. Until they match, ignore recording.text.
      if (dictationGenRef.current !== dictationGenAtClearRef.current && recording.text) {
        return persisted;
      }
      return joinBaseAndLive(baseTextBeforeDictationRef.current, recording.text);
    },
    [sectionState, recording.text],
  );

  // ── Dictation switching ──
  /**
   * Stop the active dictation cleanly and persist its merged text into the
   * owning section. Returns a map of any sections whose text was just updated
   * so the caller can use it as a fresh "base" without waiting for React state.
   */
  const stopDictation = useCallback((): { updatedId: SectionId | null; updatedText: string | null } => {
    const id = recordingForRef.current;
    // Snapshot live text + interim BEFORE we tear down the recognition session
    // so an in-flight interim phrase isn't lost when switching sections (e.g.
    // S → R). The hook's stopListening() flushes interim asynchronously, but
    // we need the merged value synchronously to seed the next section.
    const liveSnapshot = recording.text;
    const interimSnapshot = recording.interim;
    if (recording.listening) recording.stopListening();
    let updatedText: string | null = null;
    if (id) {
      // Compose: persistedBase + finalizedLive + interim (if any).
      const finalizedLive = liveSnapshot.trim();
      const interimTail = interimSnapshot.trim();
      const liveCombined = finalizedLive
        ? interimTail
          ? finalizedLive + "\n" + interimTail
          : finalizedLive
        : interimTail;
      const merged = joinBaseAndLive(baseTextBeforeDictationRef.current, liveCombined);
      updatedText = merged;
      setSectionState((s) => {
        const prev = s[id];
        if (prev.text === merged) return s;
        return { ...s, [id]: { ...prev, text: merged, dirty: merged !== prev.lastAppliedText } };
      });
    }
    recordingForRef.current = null;
    baseTextBeforeDictationRef.current = "";
    recording.clear();
    return { updatedId: id, updatedText };
  }, [recording]);

  const dictateInto = useCallback(
    (id: SectionId) => {
      setActiveSection(id);
      // If already recording into this section, treat as toggle-stop.
      if (recordingForRef.current === id && recording.listening) {
        stopDictation();
        return;
      }
      // If recording into a different section, persist that one cleanly first
      // and capture the just-merged text so we can switch immediately without
      // waiting for React state to flush.
      let stopped: { updatedId: SectionId | null; updatedText: string | null } = { updatedId: null, updatedText: null };
      if (recording.listening || recordingForRef.current) {
        stopped = stopDictation();
      }
      // Snapshot current persisted text as the base; live transcript appends to it.
      // Prefer the synchronous merged text from a just-stopped dictation if it
      // belongs to the same target section; otherwise fall back to sectionState.
      const base =
        stopped.updatedId === id && stopped.updatedText !== null
          ? stopped.updatedText
          : sectionState[id].text;
      baseTextBeforeDictationRef.current = base;
      recording.clear();
      recordingForRef.current = id;
      recording.startListening();
    },
    [recording, sectionState, stopDictation],
  );

  // ── Section text edit (Text Editing ON) ──
  const setSectionText = useCallback((id: SectionId, value: string) => {
    setSectionState((s) => ({
      ...s,
      [id]: { ...s[id], text: value, dirty: value !== s[id].lastAppliedText },
    }));
  }, []);

  /**
   * Section-level clarification-worthy fields.
   * These are the owned fields whose absence is meaningful enough to surface a
   * clarification prompt when an Update Proposal yields nothing applied.
   * Intentionally narrower than ownedFields and broader than schema
   * requiredAtCommit (e.g. offForm/motion/offPlay are critical to coach
   * workflow even though not strictly required-at-commit).
   */
  const CLARIFICATION_FIELDS_BY_SECTION: Record<SectionId, readonly string[]> = React.useMemo(
    () => ({
      situation: ["dn", "dist", "yardLn", "hash"],
      playDetails: ["offForm", "motion", "offPlay"],
      playResults: ["result", "gainLoss"],
    }),
    [],
  );

  /** Owned fields in this section that are still unresolved on the candidate. */
  const unresolvedOwnedFields = useCallback(
    (id: SectionId): string[] => {
      const sec = SECTIONS.find((s) => s.id === id)!;
      const c = candidate as Record<string, unknown>;
      return sec.ownedFields.filter((f) => {
        const v = c[f];
        return v === null || v === undefined || v === "";
      });
    },
    [candidate],
  );

  const checkAllSectionsGovernance = useCallback(
    (candidateOverride?: Record<string, unknown>): boolean => {
      if (lookupInterruptPending || lookupAppendInProgress) return true;
      return rebuildLookupGovernanceQueue(candidateOverride);
    },
    [lookupInterruptPending, lookupAppendInProgress, rebuildLookupGovernanceQueue],
  );

  /** Result returned by runUpdateProposal so callers (F) can react. */
  type UpdateResult =
    | { kind: "applied"; count: number }
    | { kind: "nothing"; importantUnresolved: string[] }
    | { kind: "deferred" } // overwrite review or empty/proposal
    | { kind: "error" };

  // ── Update Proposal (section-scoped) ──
  const runUpdateProposal = useCallback(
    async (
      id: SectionId,
      opts: { allowOverwrite?: boolean; suppressClarification?: boolean; textOverride?: string } = {},
    ): Promise<UpdateResult> => {
      if (isProposal) {
        toast.info("In review mode — back to edit before updating sections.");
        return { kind: "deferred" };
      }
      const section = SECTIONS.find((s) => s.id === id)!;
      const text = (opts.textOverride ?? sectionState[id].text).trim();
      if (!text) {
        toast.info(`${section.title}: nothing to interpret.`);
        return { kind: "deferred" };
      }
      setBusySection(id);
      try {
        // ── Step 1: Deterministic parse, scoped to owned fields ──
        const normalized = normalizeTranscriptForParse(text);
        const parseResult = parseRawInput(normalized);
        const ownedSet = new Set(section.ownedFields);
        const lookupMapEarly = getLookupMap();
        const scopedParsePatch: Record<string, unknown> = {};
        const droppedDeterministicFields: string[] = [];
        for (const [k, v] of Object.entries(parseResult.patch)) {
          if (!ownedSet.has(k)) continue;
          // Hard guardrail: never apply parse-derived values to derived fields.
          if (DERIVED_FIELDS_NEVER_AI.has(k)) continue;
          // Drop literal absent placeholders before they can collide or govern.
          if (isAbsentPlaceholder(v)) continue;
          // Governed lookup fields: normalize coach-readable form before
          // governance/canonical matching ("three jet sweep" → "3 Jet Sweep").
          let val: unknown = v;
          if (GOVERNED_LOOKUP_FIELDS.has(k)) {
            const normalized = normalizeGovernedCandidateForField(v, k);
            if (normalized) val = normalized;
            // Reject anything that doesn't look like a real candidate token.
            if (!looksLikeGovernedCandidate(val)) {
              droppedDeterministicFields.push(k);
              continue;
            }
          }
          scopedParsePatch[k] = val;
        }
        if (droppedDeterministicFields.length > 0) {
          // Quietly drop — these would have triggered bogus collision review
          // against an already-valid governed value using a sentence fragment.
          console.debug(
            `[${section.title}] dropped deterministic fragments for governed fields:`,
            droppedDeterministicFields,
          );
        }

        // Detect manual-edit collisions inside owned fields.
        const manualCollisions: Collision[] = [];
        const fillablePatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(scopedParsePatch)) {
          const current = (candidate as Record<string, unknown>)[k];
          const hasExisting = current !== null && current !== undefined && current !== "";
          if (hasExisting && String(current) !== String(v)) {
            // For governed fields: if the existing candidate value is already
            // a known canonical lookup entry, do NOT raise a collision driven
            // by a fresh re-parse of the same Section blurb. This prevents
            // "re-interpret the whole text into every owned field" loops where
            // the coach is only resolving one field (e.g. motion) but the
            // parser keeps re-proposing offForm/offPlay from the same text.
            if (GOVERNED_LOOKUP_FIELDS.has(k)) {
              const known = lookupMapEarly.get(k) ?? [];
              const existingCanonical = String(current).toLowerCase().replace(/\s+/g, " ");
              const isExistingValid = known.some(
                (e) => e.toLowerCase().replace(/\s+/g, " ") === existingCanonical,
              );
              if (isExistingValid) continue;
            }
            manualCollisions.push({ fieldName: k, currentValue: current, proposedValue: v });
          } else if (!hasExisting) {
            fillablePatch[k] = v;
          }
        }

        // Apply non-conflicting deterministic-parse fields immediately.
        if (Object.keys(fillablePatch).length > 0) {
          applySystemPatch(fillablePatch, {
            fillOnly: true,
            evidence: Object.fromEntries(
              Object.keys(fillablePatch).map((k) => [k, { snippet: text.slice(0, 80) }]),
            ),
            source: "deterministic_parse",
          });
        }

        // If overwrite review needed, surface scoped review BEFORE running AI for those fields.
        if (manualCollisions.length > 0 && !opts.allowOverwrite) {
          setOverwriteState({
            section: id,
            collisions: manualCollisions,
            onConfirm: (selectedFields) => {
              const overridePatch: Record<string, unknown> = {};
              for (const c of manualCollisions) {
                if (selectedFields.has(c.fieldName)) overridePatch[c.fieldName] = c.proposedValue;
              }
              if (Object.keys(overridePatch).length > 0) {
                applySystemPatch(overridePatch, {
                  fillOnly: false,
                  evidence: Object.fromEntries(
                    Object.keys(overridePatch).map((k) => [k, { snippet: text.slice(0, 80) }]),
                  ),
                  source: "deterministic_parse",
                });
              }
              setOverwriteState(null);
              void runUpdateProposal(id, { allowOverwrite: true, suppressClarification: opts.suppressClarification, textOverride: text });
            },
          });
          setBusySection(null);
          return { kind: "deferred" };
        }

        // ── Step 2: AI enrichment, masked so AI may only fill owned, still-unresolved fields ──
        const maskedTouched = new Set<string>(touchedFields);
        for (const f of ALL_SECTION_OWNED_FIELDS) {
          if (!ownedSet.has(f)) maskedTouched.add(f);
        }

        const lookupMap = getLookupMap();
        const aiResult = await fetchAiProposal(
          candidate as Record<string, unknown>,
          activePass,
          {
            touchedFields: maskedTouched,
            deterministicParseFields,
            predictedFields,
            carriedForwardFields,
            lookupDerivedFields,
            aiProposedFields,
            observationText: text,
            deterministicPatch: scopedParsePatch,
            lookupValues: lookupMap,
            fieldSize: (activeGame?.fieldSize ?? 80) as 80 | 100,
            predictedYardLn: predictedFields.has("yardLn") ? (candidate.yardLn as number | null) : null,
          },
        );

        if (aiResult.error && Object.keys(scopedParsePatch).length === 0) {
          if (aiResult.error !== "All AI-eligible fields are already resolved") {
            toast.info(aiResult.error);
          }
        }

        const aiProposal = aiResult.proposal ?? {};
        const ownedAiProposal: Record<string, unknown> = {};
        const droppedGovernedFields: string[] = [];
        // Fields that the deterministic parser just applied in this run.
        // AI must NOT overwrite them — provenance for those values must remain
        // "deterministic_parse" (Parse badge), not "ai_proposed" (AI badge).
        const justParsedFields = new Set<string>(Object.keys(fillablePatch));

        // Build a set of token-fragments already accounted for by deterministic
        // governed extractions in this same run (from scopedParsePatch). This
        // prevents AI from "leaking" sub-tokens into a sibling governed field.
        // Example: parser extracts motion = "3 Across" from "3 Across motion".
        // AI then proposes offPlay = "Across" from the same observation text.
        // Since "Across" is a sub-token of an already-extracted governed value,
        // drop the AI proposal for offPlay rather than triggering bogus
        // governance against a phrase fragment.
        const deterministicGovernedFragments = new Set<string>();
        for (const [pk, pv] of Object.entries(scopedParsePatch)) {
          if (!GOVERNED_LOOKUP_FIELDS.has(pk)) continue;
          if (typeof pv !== "string") continue;
          for (const tok of pv.split(/\s+/)) {
            const norm = tok.trim().toLowerCase();
            if (norm) deterministicGovernedFragments.add(norm);
          }
        }
        for (const [k, v] of Object.entries(aiProposal)) {
          if (!ownedSet.has(k)) continue;
          // Hard guardrail: AI must never target derived fields, even via the
          // section-owned set. Skip silently before any governance / collision.
          if (DERIVED_FIELDS_NEVER_AI.has(k)) continue;
          if (justParsedFields.has(k)) continue;

          // Unwrap governed proposal { value, matchType } once for inspection.
          let inner =
            v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Record<string, unknown>)
              ? (v as { value: unknown }).value
              : v;

          // Drop literal absent placeholders ("None", "N/A", "no motion", …)
          if (isAbsentPlaceholder(inner)) continue;

          // For governed lookup fields (offForm/offPlay/motion), normalize the
          // candidate value (title-case + number-words → digits) BEFORE
          // governance/collision logic so the modal shows "3 Jet Sweep" not
          // "three jet sweep".
          if (GOVERNED_LOOKUP_FIELDS.has(k)) {
            const normalizedInner = normalizeGovernedCandidateForField(inner, k);
            if (normalizedInner) inner = normalizedInner;
            if (!looksLikeGovernedCandidate(inner)) {
              droppedGovernedFields.push(k);
              continue;
            }
            // Contamination guard: drop AI governed proposals whose entire
            // normalized value is composed of tokens already accounted for by
            // a deterministic governed extraction in this same run. Prevents
            // motion-phrase residue (e.g. "Across") leaking into offPlay.
            const aiTokens = String(inner).trim().toLowerCase().split(/\s+/).filter(Boolean);
            if (
              aiTokens.length > 0 &&
              aiTokens.every((t) => deterministicGovernedFragments.has(t))
            ) {
              droppedGovernedFields.push(k);
              continue;
            }
            // Re-wrap with normalized value if it was a governed proposal shape
            if (v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Record<string, unknown>)) {
              ownedAiProposal[k] = { ...(v as object), value: inner };
            } else {
              ownedAiProposal[k] = inner;
            }
            // Field-candidate-based update: if the existing candidate value is
            // already a known canonical lookup entry AND the AI is proposing
            // the same value (case/space-insensitive), treat as a no-op.
            const existing = (candidate as Record<string, unknown>)[k];
            if (existing !== null && existing !== undefined && existing !== "") {
              const known = lookupMapEarly.get(k) ?? [];
              const existingCanonical = String(existing).toLowerCase().replace(/\s+/g, " ");
              const innerCanonical = String(inner).toLowerCase().replace(/\s+/g, " ");
              const isExistingValid = known.some(
                (e) => e.toLowerCase().replace(/\s+/g, " ") === existingCanonical,
              );
              if (isExistingValid && existingCanonical === innerCanonical) {
                delete ownedAiProposal[k];
                continue;
              }
            }
            continue;
          }
          ownedAiProposal[k] = v;
        }
        let aiCollisions: SystemPatchCollision[] = [];
        if (Object.keys(ownedAiProposal).length > 0) {
          aiCollisions = requestAiEnrichment(ownedAiProposal);
        }
        if (droppedGovernedFields.length > 0) {
          // Surface lightly so coach knows AI couldn't pull a clean candidate.
          const labels = droppedGovernedFields.map((f) => FIELD_LABELS[f] ?? f).join(", ");
          toast.info(`${section.title}: ${labels} — needs a clearer cue.`);
        }

        const filledCount =
          Object.keys(fillablePatch).length +
          (Object.keys(ownedAiProposal).length - aiCollisions.length);

        // Build a projected candidate that includes everything we just applied
        // synchronously, so we can check governance immediately rather than
        // waiting for React state to settle.
        const projected = { ...(candidate as Record<string, unknown>), ...fillablePatch };
        for (const [k, v] of Object.entries(ownedAiProposal)) {
          if (aiCollisions.find((c) => c.fieldName === k)) continue;
          // Unwrap governed proposal {value,matchType}
          if (v && typeof v === "object" && !Array.isArray(v) && "value" in (v as Record<string, unknown>)) {
            projected[k] = (v as { value: unknown }).value;
          } else {
            projected[k] = v;
          }
        }

        checkAllSectionsGovernance(projected);

        // Per spec: clear dirty/unsynced only after the proposal has actually
        // been updated for this section.
        if (filledCount > 0) {
          setSectionState((s) => ({
            ...s,
            [id]: { ...s[id], dirty: false, lastAppliedText: text },
          }));
          toast.success(`${section.title}: updated ${filledCount} field(s).`);
          return { kind: "applied", count: filledCount };
        }
        if (aiCollisions.length > 0) {
          toast.info(`${section.title}: no new fields applied.`);
          return { kind: "applied", count: 0 };
        }

        // Nothing applied. Check whether clarification is warranted.
        // Important = section-defined clarification-worthy fields ∩ still-unresolved on candidate.
        const c = candidate as Record<string, unknown>;
        const clarificationFields = CLARIFICATION_FIELDS_BY_SECTION[id];
        const importantUnresolved = clarificationFields.filter((f) => {
          const v = c[f];
          return v === null || v === undefined || v === "";
        });

        if (!opts.suppressClarification && importantUnresolved.length > 0) {
          // Open section-scoped clarification modal.
          const snippet = text.length > 120 ? text.slice(0, 117) + "…" : text;
          const fieldList = importantUnresolved
            .map((f) => FIELD_LABELS[f] ?? f)
            .join(", ");
          setClarification({
            section: id,
            title: "Need a clearer cue",
            snippet,
            question: `${section.title}: couldn't confidently fill ${fieldList} from this text. Choose:`,
            options: [
              {
                key: "1",
                label: "Edit Section text",
                onSelect: () => {
                  setActiveSection(id);
                  setTextEditing(true);
                  // Defer focus until modal closes.
                  setTimeout(() => {
                    const ta = document.querySelector<HTMLTextAreaElement>(
                      `textarea[data-section-id="${id}"]`,
                    );
                    ta?.focus();
                  }, 0);
                },
              },
              {
                key: "2",
                label: "Leave this Section unresolved",
                onSelect: () => {
                  toast(`${section.title}: left unresolved.`);
                },
              },
              {
                key: "3",
                label: "Retry update",
                onSelect: () => {
                  void runUpdateProposal(id, { suppressClarification: true, textOverride: text });
                },
              },
            ],
          });
          return { kind: "nothing", importantUnresolved };
        }

        if (Object.keys(scopedParsePatch).length === 0 && Object.keys(ownedAiProposal).length === 0) {
          toast.info(`${section.title}: nothing recognized.`);
        }
        return { kind: "nothing", importantUnresolved };
      } catch (e) {
        console.error("Section update failed:", e);
        toast.error(`${SECTIONS.find((s) => s.id === id)?.title ?? "Section"}: update failed.`);
        return { kind: "error" };
      } finally {
        setBusySection(null);
      }
    },
    [
      isProposal,
      sectionState,
      candidate,
      touchedFields,
      deterministicParseFields,
      predictedFields,
      carriedForwardFields,
      lookupDerivedFields,
      aiProposedFields,
      activePass,
      activeGame?.fieldSize,
      applySystemPatch,
      requestAiEnrichment,
      getLookupMap,
      CLARIFICATION_FIELDS_BY_SECTION,
      checkAllSectionsGovernance,
    ],
  );

  // ── Clear (section-scoped) ──
  const clearSection = useCallback(
    (id: SectionId) => {
      if (isProposal) {
        toast.info("In review mode — back to edit before clearing sections.");
        return;
      }
      const section = SECTIONS.find((s) => s.id === id)!;
      // Clear section text.
      setSectionState((s) => ({
        ...s,
        [id]: { ...INITIAL_SECTION_STATE },
      }));
      // Stop dictation if it was recording into this section.
      if (recordingForRef.current === id) {
        if (recording.listening) recording.stopListening();
        recordingForRef.current = null;
        baseTextBeforeDictationRef.current = "";
        recording.clear();
      }
      // Clear ONLY this section's owned candidate fields whose current
      // provenance came from this section's text — i.e. AI-proposed or
      // deterministic parse. Carry-forward, predicted, lookup-derived, and
      // coach-edited values must remain untouched.
      //
      // Predicted/scaffolded fields that were temporarily overwritten by AI
      // are restored to their predicted/scaffolded value via reseedAutoFieldsFor
      // so that the next dictated segment can rely on carry-forward behavior.
      const fieldsToReseed: string[] = [];
      for (const f of section.ownedFields) {
        if (aiProposedFields.has(f) || deterministicParseFields.has(f)) {
          fieldsToReseed.push(f);
        }
      }
      // Penalty derivative cleanup: penYards is seeded as `predicted` from the
      // canonical penalty value, so it does not appear in parse/AI provenance
      // sets. When penalty is being cleared in this section, also clear the
      // derived penYards so the field doesn't keep a stale default.
      if (
        section.ownedFields.includes("penalty") &&
        fieldsToReseed.includes("penalty") &&
        !fieldsToReseed.includes("penYards")
      ) {
        fieldsToReseed.push("penYards");
      }
      if (fieldsToReseed.length > 0) {
        // Fire-and-forget; reseedAutoFieldsFor handles state updates atomically.
        void reseedAutoFieldsFor(fieldsToReseed);
      }
      toast(
        fieldsToReseed.length > 0
          ? `${section.title}: text cleared (${fieldsToReseed.length} field${fieldsToReseed.length === 1 ? "" : "s"} reset).`
          : `${section.title}: text cleared.`,
      );
    },
    [isProposal, aiProposedFields, deterministicParseFields, reseedAutoFieldsFor, recording],
  );

  // Track open modals via refs so the keyboard handlers don't need to re-bind.
  const overwriteOpenRef = useRef(false);
  const clarificationOpenRef = useRef(false);
  const lookupInterruptOpenRef = useRef(false);
  useEffect(() => { overwriteOpenRef.current = !!overwriteState; }, [overwriteState]);
  useEffect(() => { clarificationOpenRef.current = !!clarification; }, [clarification]);
  useEffect(() => { lookupInterruptOpenRef.current = !!lookupInterruptPending; }, [lookupInterruptPending]);

  /**
   * F — Finish dictation entry.
   * 1. Stop active dictation cleanly (persists base+live merged text).
   * 2. Run Update Proposal for every dirty section sequentially.
   * 3. If nothing is blocking (no overwrite, no clarification, no inline modal),
   *    transition to `proposal` state so N / L commit immediately.
   * Returns true if we ended in `proposal` state and are commit-ready.
   */
  const finishDictationEntry = useCallback(async (): Promise<boolean> => {
    if (isProposal) return true; // already review-ready

    // Compute the post-dictation text snapshot for every section SYNCHRONOUSLY
    // before stopDictation enqueues its setSectionState. Without this snapshot
    // the loop below would read the stale closure copy of `sectionState` and
    // skip any section that was just being dictated into (e.g. Play Results),
    // leaving it permanently Unsynced.
    const recId = recordingForRef.current;
    const liveBase = baseTextBeforeDictationRef.current;
    const liveText = recording.text;
    // Capture in-flight interim too — without it, the last spoken phrase that
    // hasn't yet been finalized by the SpeechRecognition engine is lost when F
    // immediately stops dictation.
    const liveInterim = recording.interim;
    const snapshot: Record<SectionId, { text: string; dirty: boolean }> = {
      situation: { ...sectionState.situation },
      playDetails: { ...sectionState.playDetails },
      playResults: { ...sectionState.playResults },
    };
    if (recId) {
      const finalizedLive = liveText.trim();
      const interimTail = liveInterim.trim();
      const liveCombined = finalizedLive
        ? interimTail
          ? finalizedLive + "\n" + interimTail
          : finalizedLive
        : interimTail;
      const merged = joinBaseAndLive(liveBase, liveCombined);
      const prev = snapshot[recId];
      snapshot[recId] = {
        text: merged,
        dirty: merged !== prev.text || prev.dirty || merged !== sectionState[recId].lastAppliedText,
      };
    }

    stopDictation();

    for (const s of SECTIONS) {
      const snap = snapshot[s.id];
      if (snap.dirty && snap.text.trim()) {
        // eslint-disable-next-line no-await-in-loop
        await runUpdateProposal(s.id, { textOverride: snap.text });
        if (overwriteOpenRef.current || clarificationOpenRef.current || lookupInterruptOpenRef.current) {
          // Coach must respond first; do NOT auto-advance to review.
          return false;
        }
      }
    }
    // Sweep ALL sections for any unresolved governed lookup value (covers
    // sections that were not dirty this pass but still hold an unknown value
    // from a prior Update). If governance fires, do not transition to review.
    if (checkAllSectionsGovernance()) {
      return false;
    }
    // Auto-transition to review state so N/L are true commit actions.
    reviewProposal();
    toast.success("Ready for review.");
    return true;
  }, [isProposal, stopDictation, sectionState, recording.text, recording.interim, runUpdateProposal, reviewProposal, checkAllSectionsGovernance]);

  // ── Commit handlers ──
  // On a clean path (no clarification, no overwrite, no governance/review modal),
  // a single press of N or L runs finishDictationEntry() AND completes the commit.
  const handleCommitAndNext = useCallback(async () => {
    if (state !== "proposal") {
      const ready = await finishDictationEntry();
      if (!ready) return;
      if (overwriteOpenRef.current || clarificationOpenRef.current) return;
    }
    // Final governance gate — even in proposal state, never commit a row whose
    // governed lookup values are not in the playbook.
    if (checkAllSectionsGovernance()) return;
    await commitAndNext();
  }, [state, finishDictationEntry, commitAndNext, checkAllSectionsGovernance]);

  const handleCommitAndLeave = useCallback(async () => {
    if (state !== "proposal") {
      const ready = await finishDictationEntry();
      if (!ready) return;
      if (overwriteOpenRef.current || clarificationOpenRef.current) return;
    }
    if (checkAllSectionsGovernance()) return;
    await commitProposal();
    deselectSlot();
  }, [state, finishDictationEntry, commitProposal, deselectSlot, checkAllSectionsGovernance]);

  // ── Single-key shortcuts (Text Editing OFF) ──
  useEffect(() => {
    function isTextInputTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }

    /**
     * Suspend section workflow shortcuts whenever ANY blocking modal/dialog is
     * open (lookup governance, clarification, overwrite review, PAT, possession,
     * grade overwrite, etc.). We detect this generically by looking for any
     * Radix Dialog / AlertDialog primitive currently open in the DOM, instead
     * of enumerating each dialog component individually.
     */
    function anyBlockingModalOpen(): boolean {
      // Internal scoped modals.
      if (overwriteOpenRef.current || clarificationOpenRef.current) return true;
      // Any Radix Dialog or AlertDialog in the open state (rendered to portal).
      return !!document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (textEditing) {
          setTextEditing(false);
          (document.activeElement as HTMLElement | null)?.blur?.();
          e.preventDefault();
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Suppress shortcuts entirely when Text Editing is ON.
      if (textEditing) return;

      // Suppress shortcuts whenever a blocking modal is open — typing into a
      // modal field (or even just having one open) must never trigger
      // S/D/R/U/C/F/N/L. This prevents the lookup governance modal, the
      // clarification modal, overwrite review, PAT, and possession dialogs
      // from leaking keystrokes into the section workflow.
      if (anyBlockingModalOpen()) return;

      // If focus is on a text input (e.g. proposal-side input), do not steal keystrokes.
      if (isTextInputTarget(e.target)) return;

      // Ignore modifier-bare key like Shift alone
      if (e.key.length !== 1) return;
      const k = e.key.toUpperCase();

      switch (k) {
        case "S":
          e.preventDefault();
          dictateInto("situation");
          break;
        case "D":
          e.preventDefault();
          dictateInto("playDetails");
          break;
        case "R":
          e.preventDefault();
          dictateInto("playResults");
          break;
        case "U":
          e.preventDefault();
          void runUpdateProposal(activeSection);
          break;
        case "C":
          e.preventDefault();
          clearSection(activeSection);
          break;
        case "F":
          e.preventDefault();
          void finishDictationEntry();
          break;
        case "N":
          e.preventDefault();
          void handleCommitAndNext();
          break;
        case "L":
          e.preventDefault();
          handleCommitAndLeave();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    textEditing,
    activeSection,
    dictateInto,
    runUpdateProposal,
    clearSection,
    finishDictationEntry,
    handleCommitAndNext,
    handleCommitAndLeave,
  ]);

  // ── Render ──
  return (
    <div className="space-y-3">
      {/* Mode bar */}
      <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-1.5 bg-muted/30">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Keyboard className="h-3 w-3" />
          <span>
            {textEditing ? (
              "Text Editing ON — type freely. Esc to exit."
            ) : (
              <>Shortcuts: <kbd className="kbd">S</kbd> <kbd className="kbd">D</kbd> <kbd className="kbd">R</kbd> dictate · <kbd className="kbd">U</kbd> update · <kbd className="kbd">C</kbd> clear · <kbd className="kbd">F</kbd> finish · <kbd className="kbd">N</kbd> commit & next · <kbd className="kbd">L</kbd> commit & leave</>
            )}
          </span>
        </div>
        <Button
          size="sm"
          variant={textEditing ? "default" : "outline"}
          className="h-7 text-xs gap-1"
          onClick={() => setTextEditing((v) => !v)}
        >
          {textEditing ? <PencilOff className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          {textEditing ? "Text Editing: ON" : "Text Editing: OFF"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left column: Section cards */}
        <div className="lg:col-span-2 space-y-3">
          {SECTIONS.map((section) => {
            const isRec = recording.listening && recordingForRef.current === section.id;
            return (
              <SectionCard
                key={section.id}
                section={section}
                state={sectionState[section.id]}
                renderedText={computeSectionRenderedText(section.id)}
                isActive={activeSection === section.id}
                isRecording={isRec}
                recordingInterim={isRec ? recording.interim : ""}
                busy={busySection === section.id}
                textEditing={textEditing}
                isProposal={isProposal}
                onFocus={() => setActiveSection(section.id)}
                onTextChange={(v) => setSectionText(section.id, v)}
                onDictate={() => dictateInto(section.id)}
                onUpdate={() => runUpdateProposal(section.id)}
                onClear={() => clearSection(section.id)}
              />
            );
          })}
        </div>

        {/* Right column: Unified Proposal Candidate (sticky) */}
        <div className="lg:col-span-3">
          <div className="lg:sticky lg:top-2 space-y-3">
            <div className="rounded-lg border-2 border-border/60 p-3 bg-background space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Unified Proposal Candidate
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {isProposal ? "Review" : "Draft"}
                </span>
              </div>
              {proposalSlot}
              {proposalActions ? (
                <div className="pt-1 border-t border-border/40">{proposalActions}</div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => void finishDictationEntry()}>
                  <Flag className="h-3.5 w-3.5" />
                  Finish dictation entry
                  <kbd className="kbd ml-1">F</kbd>
                </Button>
                <Button size="sm" className="h-8 gap-1" onClick={() => void handleCommitAndNext()}>
                  <ChevronRight className="h-3.5 w-3.5" />
                  Commit & Next
                  <kbd className="kbd ml-1">N</kbd>
                </Button>
                <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={handleCommitAndLeave}>
                  <LogOut className="h-3.5 w-3.5" />
                  Commit & Leave
                  <kbd className="kbd ml-1">L</kbd>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section-scoped overwrite review */}
      {overwriteState && (
        <RawInputCollisionDialog
          open
          collisions={overwriteState.collisions}
          nonCollisionCount={0}
          onConfirm={overwriteState.onConfirm}
          onCancel={() => setOverwriteState(null)}
        />
      )}

      {/* AI clarification scaffolding (single-key answerable) */}
      {clarification && (
        <Dialog open onOpenChange={(o) => { if (!o) setClarification(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                {clarification.title}
                <Badge variant="secondary" className="text-[10px]">
                  {SECTIONS.find((s) => s.id === clarification.section)?.title}
                </Badge>
              </DialogTitle>
            </DialogHeader>
            {clarification.snippet && (
              <p className="text-xs text-muted-foreground italic font-mono">"{clarification.snippet}"</p>
            )}
            <p className="text-sm">{clarification.question}</p>
            <ClarificationOptions
              options={clarification.options}
              onSelect={(idx) => {
                const opt = clarification.options[idx];
                if (opt) {
                  opt.onSelect();
                  setClarification(null);
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Section card ──
interface SectionCardProps {
  section: SectionDef;
  state: SectionState;
  /** The text to render in the textarea (already merged with live dictation when recording). */
  renderedText: string;
  isActive: boolean;
  isRecording: boolean;
  recordingInterim: string;
  busy: boolean;
  textEditing: boolean;
  isProposal: boolean;
  onFocus: () => void;
  onTextChange: (v: string) => void;
  onDictate: () => void;
  onUpdate: () => void;
  onClear: () => void;
}

function SectionCard(props: SectionCardProps) {
  const {
    section,
    state,
    renderedText,
    isActive,
    isRecording,
    recordingInterim,
    busy,
    textEditing,
    isProposal,
    onFocus,
    onTextChange,
    onDictate,
    onUpdate,
    onClear,
  } = props;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        isActive ? "border-primary/60 bg-primary/5" : "border-border/60 bg-background",
        isRecording && "border-destructive/60",
      )}
      onClick={onFocus}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">
            {section.title}
          </Label>
          <kbd className="kbd">{section.dictateKey}</kbd>
          {isRecording && (
            <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              Listening
            </span>
          )}
          {state.dirty && !isRecording && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">Unsynced</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={isRecording ? "destructive" : "outline"}
            className="h-7 text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); onDictate(); }}
            disabled={isProposal}
            title={`Dictate (${section.dictateKey})`}
          >
            {isRecording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {isRecording ? "Stop" : "Dictate"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); onUpdate(); }}
            disabled={busy || isProposal || (!state.text.trim() && !isRecording)}
            title="Update Proposal (U)"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Update Proposal
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-muted-foreground"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            disabled={isProposal}
            title="Clear (C)"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>

      {/* Owned fields chips */}
      <div className="flex flex-wrap gap-1">
        {section.ownedFields.map((f) => (
          <TooltipProvider key={f} delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] font-normal">
                  {FIELD_LABELS[f] ?? f}
                </Badge>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Owned by this Section</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      {/* Section text area.
          When recording, value = base + live (computed by parent) + optional interim suffix.
          When not recording, value = persisted section.text.
          Never appends running transcript repeatedly. */}
      <Textarea
        data-section-id={section.id}
        className={cn(
          "text-xs font-mono min-h-[64px] resize-y bg-background/50",
          isRecording && "border-destructive/30",
        )}
        placeholder={
          isRecording
            ? "Listening — speech will appear here…"
            : textEditing
              ? `Type ${section.title.toLowerCase()} narration…`
              : `Press ${section.dictateKey} to dictate, or enable Text Editing to type.`
        }
        value={
          isRecording && recordingInterim
            ? renderedText + (renderedText.endsWith("\n") || !renderedText ? "" : " ") + recordingInterim
            : renderedText
        }
        readOnly={!textEditing || isRecording}
        onChange={(e) => {
          if (textEditing && !isRecording) onTextChange(e.target.value);
        }}
        onFocus={onFocus}
      />
    </div>
  );
}

// ── Clarification options (single-key answerable) ──
function ClarificationOptions({
  options,
  onSelect,
}: {
  options: { key: string; label: string; onSelect: () => void }[];
  onSelect: (idx: number) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      const idx = options.findIndex((o) => o.key.toUpperCase() === k.toUpperCase());
      if (idx >= 0) {
        e.preventDefault();
        onSelect(idx);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, onSelect]);

  return (
    <div className="flex flex-col gap-2 pt-2">
      {options.map((opt, i) => (
        <Button
          key={i}
          size="sm"
          variant="outline"
          className="justify-start gap-2"
          onClick={() => onSelect(i)}
        >
          <kbd className="kbd">{opt.key}</kbd>
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
