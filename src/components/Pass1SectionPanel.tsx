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
  const lastFlushedTextRef = useRef<string>("");

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

  /** Section-scoped AI clarification modal scaffolding (single-key answerable). */
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
      lastFlushedTextRef.current = "";
      setBusySection(null);
      setOverwriteState(null);
      setClarification(null);
    }
  }, [commitCount, recording]);

  // ── Live-route dictated text into the section that owns the recording ──
  useEffect(() => {
    if (!recordingForRef.current) return;
    const id = recordingForRef.current;
    const fullText = recording.text;
    if (fullText === lastFlushedTextRef.current) return;
    lastFlushedTextRef.current = fullText;
    setSectionState((s) => {
      const prev = s[id];
      // Replace section text with the live transcript while recording into it.
      // Coach's existing pre-dictation text is preserved as a prefix in `dictateInto`.
      const newText = prev.text.length > 0 && fullText.length > 0
        ? prev.text.endsWith("\n") || fullText.startsWith("\n")
          ? prev.text + fullText
          : prev.text + " " + fullText
        : fullText;
      // Only rebuild if differs
      if (newText === prev.text) return s;
      return { ...s, [id]: { ...prev, text: newText, dirty: true } };
    });
  }, [recording.text]);

  // ── Dictation switching ──
  const dictateInto = useCallback(
    (id: SectionId) => {
      setActiveSection(id);
      // If already recording into this section, stop.
      if (recordingForRef.current === id && recording.listening) {
        recording.stopListening();
        recordingForRef.current = null;
        lastFlushedTextRef.current = "";
        return;
      }
      // If recording into a different section, stop it cleanly first.
      if (recording.listening) {
        recording.stopListening();
        recordingForRef.current = null;
        lastFlushedTextRef.current = "";
      }
      // Start fresh capture buffer; the section retains its existing text as prefix.
      recording.clear();
      lastFlushedTextRef.current = "";
      recordingForRef.current = id;
      recording.startListening();
    },
    [recording],
  );

  const stopDictation = useCallback(() => {
    if (recording.listening) {
      recording.stopListening();
      recordingForRef.current = null;
      lastFlushedTextRef.current = "";
    }
  }, [recording]);

  // ── Section text edit (Text Editing ON) ──
  const setSectionText = useCallback((id: SectionId, value: string) => {
    setSectionState((s) => ({
      ...s,
      [id]: { ...s[id], text: value, dirty: value !== s[id].lastAppliedText },
    }));
  }, []);

  // ── Update Proposal (section-scoped) ──
  const runUpdateProposal = useCallback(
    async (id: SectionId, opts: { allowOverwrite?: boolean } = {}) => {
      if (isProposal) {
        toast.info("In review mode — back to edit before updating sections.");
        return;
      }
      const section = SECTIONS.find((s) => s.id === id)!;
      const text = sectionState[id].text.trim();
      if (!text) {
        toast.info(`${section.title}: nothing to interpret.`);
        return;
      }
      setBusySection(id);
      try {
        // ── Step 1: Deterministic parse, scoped to owned fields ──
        const normalized = normalizeTranscriptForParse(text);
        const parseResult = parseRawInput(normalized);
        const ownedSet = new Set(section.ownedFields);
        const scopedParsePatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(parseResult.patch)) {
          if (ownedSet.has(k)) scopedParsePatch[k] = v;
        }

        // Detect manual-edit collisions inside owned fields.
        const manualCollisions: Collision[] = [];
        const fillablePatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(scopedParsePatch)) {
          const current = (candidate as Record<string, unknown>)[k];
          const hasExisting = current !== null && current !== undefined && current !== "";
          // A "manual" or otherwise resolved field that disagrees with the parse is a collision.
          if (hasExisting && String(current) !== String(v)) {
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
              // Continue with AI step after overwrite resolution.
              void runUpdateProposal(id, { allowOverwrite: true });
            },
          });
          // Do NOT proceed to AI until overwrite is resolved.
          setBusySection(null);
          return;
        }

        // ── Step 2: AI enrichment, masked so AI may only fill owned, still-unresolved fields ──
        // Mask non-owned fields by adding them to touchedFields so they appear "resolved" to AI logic.
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
          // Only surface AI errors when deterministic parse contributed nothing.
          if (aiResult.error !== "All AI-eligible fields are already resolved") {
            toast.info(aiResult.error);
          }
        }

        // Filter AI proposal again to owned fields (defensive — should already be true via masking).
        const aiProposal = aiResult.proposal ?? {};
        const ownedAiProposal: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(aiProposal)) {
          if (ownedSet.has(k)) ownedAiProposal[k] = v;
        }
        let aiCollisions: SystemPatchCollision[] = [];
        if (Object.keys(ownedAiProposal).length > 0) {
          aiCollisions = requestAiEnrichment(ownedAiProposal);
        }

        // Mark section as no-longer-dirty.
        setSectionState((s) => ({
          ...s,
          [id]: { ...s[id], dirty: false, lastAppliedText: text },
        }));

        const filledCount =
          Object.keys(fillablePatch).length +
          (Object.keys(ownedAiProposal).length - aiCollisions.length);
        if (filledCount > 0) {
          toast.success(`${section.title}: updated ${filledCount} field(s).`);
        } else if (aiCollisions.length > 0) {
          toast.info(`${section.title}: no new fields applied.`);
        } else if (Object.keys(scopedParsePatch).length === 0 && Object.keys(ownedAiProposal).length === 0) {
          toast.info(`${section.title}: nothing recognized.`);
        }
      } catch (e) {
        console.error("Section update failed:", e);
        toast.error(`${SECTIONS.find((s) => s.id === id)?.title ?? "Section"}: update failed.`);
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
      if (recordingForRef.current === id && recording.listening) {
        recording.stopListening();
        recordingForRef.current = null;
        lastFlushedTextRef.current = "";
      }
      // Clear that section's owned uncommitted candidate fields. Do not touch other sections.
      // We avoid clearing fields that look manually-set with no prior section involvement —
      // but section "Clear" is intentionally aggressive on its own owned fields.
      for (const f of section.ownedFields) {
        const val = (candidate as Record<string, unknown>)[f];
        if (val !== null && val !== undefined && val !== "") {
          updateField(f, "");
        }
      }
      toast(`${section.title}: cleared.`);
    },
    [isProposal, candidate, updateField, recording],
  );

  // ── Finish dictation entry (F) ──
  const finishDictationEntry = useCallback(async () => {
    stopDictation();
    // Run Update Proposal for any dirty section.
    for (const s of SECTIONS) {
      if (sectionState[s.id].dirty && sectionState[s.id].text.trim()) {
        // sequential to keep toast/clarification ordering predictable
        // eslint-disable-next-line no-await-in-loop
        await runUpdateProposal(s.id);
      }
    }
    toast.success("Ready for review.");
  }, [stopDictation, sectionState, runUpdateProposal]);

  // ── Commit handlers ──
  const handleCommitAndNext = useCallback(async () => {
    if (state !== "proposal") {
      reviewProposal();
      // Defer commit to the next paint so any opened review modals (PAT, possession) can intercept.
      return;
    }
    await commitAndNext();
  }, [state, reviewProposal, commitAndNext]);

  const handleCommitAndLeave = useCallback(() => {
    if (state !== "proposal") {
      reviewProposal();
      return;
    }
    commitProposal();
    deselectSlot();
  }, [state, reviewProposal, commitProposal, deselectSlot]);

  // ── Single-key shortcuts (Text Editing OFF) ──
  useEffect(() => {
    function isTextInputTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
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
          {SECTIONS.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              state={sectionState[section.id]}
              isActive={activeSection === section.id}
              isRecording={recording.listening && recordingForRef.current === section.id}
              recordingInterim={recording.listening && recordingForRef.current === section.id ? recording.interim : ""}
              busy={busySection === section.id}
              textEditing={textEditing}
              isProposal={isProposal}
              onFocus={() => setActiveSection(section.id)}
              onTextChange={(v) => setSectionText(section.id, v)}
              onDictate={() => dictateInto(section.id)}
              onUpdate={() => runUpdateProposal(section.id)}
              onClear={() => clearSection(section.id)}
            />
          ))}
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
            disabled={busy || isProposal || !state.text.trim()}
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

      {/* Section text area */}
      <Textarea
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
        value={state.text + (isRecording && recordingInterim ? (state.text ? "\n" : "") + recordingInterim : "")}
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
