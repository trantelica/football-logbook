import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { useLookup } from "@/engine/lookupContext";
import { useRoster } from "@/engine/rosterContext";
import { useRawInput } from "@/engine/rawInputContext";
import { useSeason } from "@/engine/seasonContext";
import { playSchema, SEGMENT_REQUIRED_FIELDS, QTR_DISPLAY, PENALTY_YARDS_MAP } from "@/engine/schema";
import { canonicalizeLookupValue, getSeasonConfig } from "@/engine/db";
import { cn } from "@/lib/utils";
import { Eraser, Eye, Check, ArrowLeft, Plus, Lock, X, MousePointerClick, ChevronRight, ChevronDown, Terminal, Sparkles, Bot, ArrowRightLeft, Info, AlertCircle, ShieldAlert } from "lucide-react";
import { LookupConfirmDialog } from "./LookupConfirmDialog";
import { RawInputCollisionDialog, type Collision } from "./RawInputCollisionDialog";
import { ActorCombobox } from "./ActorCombobox";
import { TDCorrectionDialog } from "./TDCorrectionDialog";
import { PATTryDialog } from "./PATTryDialog";
import { PossessionCheckDialog } from "./PossessionCheckDialog";
import { PersonnelPanel } from "./PersonnelPanel";
import { BlockingPanel } from "./BlockingPanel";
import { GradeOverwriteDialog } from "./GradeOverwriteDialog";
import { CoachNotesPanel } from "./CoachNotesPanel";
import { GRADE_FIELDS } from "@/engine/personnel";
import { toast } from "sonner";
import { Phase10SmokeTest } from "@/dev/Phase10SmokeTest";
import { isDevMode } from "@/engine/devMode";
import { VoicePanel } from "./VoicePanel";
import { parseRawInput } from "@/engine/rawInputParser";
import { normalizeTranscriptForParse } from "@/engine/transcriptNormalize";

const WORKFLOW_STAGES = [
  { value: "0", label: "Game Setup", pass: 0, enabled: true },
  { value: "1", label: "Pass 1: Play Details", pass: 1, enabled: true },
  { value: "2", label: "Pass 2: Personnel", pass: 2, enabled: true },
  { value: "3", label: "Pass 3: Blocking", pass: 3, enabled: true },
] as const;

/** Map of parent lookup fields → dependent fields to auto-populate */
const DEPENDENT_FIELD_MAP: Record<string, string[]> = {
  offForm: ["offStrength", "personnel"],
  offPlay: ["playType", "playDir"],
  motion: ["motionDir"],
};

/** Actor fields backed by roster */
const ACTOR_FIELDS = new Set(["rusher", "passer", "receiver", "returner"]);

export function DraftPanel() {
  const { activeGame } = useGameContext();
  const { activeSeason } = useSeason();
  const voiceClearRef = React.useRef<(() => void) | null>(null);
  const {
    state,
    candidate,
    touchedFields,
    predictedFields,
    predictionExplanations,
    predictionCoachMessages,
    inlineErrors,
    commitErrors,
    updateField,
    clearDraft,
    reviewProposal,
    backToEdit,
    commitProposal,
    selectedSlotNum,
    slotMetaMap,
    isSlotMode,
    scaffoldedWarning,
    deselectSlot,
    dismissScaffoldWarning,
    activePass,
    setActivePass,
    commitAndNext,
    nextSlot,
    adjustments,
    tdCorrectionPending,
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
    carriedForwardFields,
    carriedForwardFromPlayNum,
    gradeOverwriteDiffs,
    confirmGradeOverwrite,
    cancelGradeOverwrite,
    aiProposedFields,
    deterministicParseFields,
    applySystemPatch,
    lookupInterruptPending,
    clearLookupInterrupt,
    proposalMeta,
  } = useTransaction();
  const { getValues, isLookupField, addValue, getEntryAttributes } = useLookup();
  const { roster, addPlayer } = useRoster();
  const { saveInput } = useRawInput();

  // 9.2A: Load active fields from season config
  const [activeFieldsMap, setActiveFieldsMap] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (!activeSeason) { setActiveFieldsMap(null); return; }
    getSeasonConfig(activeSeason.seasonId)
      .then((cfg) => setActiveFieldsMap(cfg?.activeFields ?? null))
      .catch(() => setActiveFieldsMap(null));
  }, [activeSeason?.seasonId]);

  /** Check if a field is inactive per season config */
  const isFieldInactive = (fieldName: string): boolean => {
    if (!activeFieldsMap) return false;
    return activeFieldsMap[fieldName] === false;
  };

  const [confirmDialog, setConfirmDialog] = useState<{
    fieldName: string;
    fieldLabel: string;
    value: string;
  } | null>(null);

  const [rawInputText, setRawInputText] = useState("");
  const [rawInputOpen, setRawInputOpen] = useState(false);
  const [collisionState, setCollisionState] = useState<{
    collisions: Collision[];
    nonCollisionPatch: Record<string, unknown>;
    fullPatch: Record<string, unknown>;
    report: { anchor: string; rawValue: string; status: string; matchedValue?: string }[];
  } | null>(null);

  // Phase 10: AI system patch collision state
  const [aiCollisionState, setAiCollisionState] = useState<{
    collisions: Collision[];
    nonCollisionCount: number;
    evidence?: Record<string, import("@/engine/transaction").AIFieldEvidence>;
  } | null>(null);

  if (!activeGame) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Create or select a game to begin logging plays.
      </div>
    );
  }

  // Workflow Stage Selector — always visible when game is active
  const stageSelector = (
    <div className="mb-4">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 block">
        Workflow Stage
      </Label>
      <ToggleGroup
        type="single"
        value={String(activePass)}
        onValueChange={(val) => {
          if (val) setActivePass(Number(val));
        }}
        size="sm"
        className="justify-start flex-wrap"
      >
        {WORKFLOW_STAGES.map((stage) => (
          <ToggleGroupItem
            key={stage.value}
            value={stage.value}
            disabled={!stage.enabled}
            className={cn(
              "text-xs px-3 h-7 font-medium",
              !stage.enabled && "opacity-50 cursor-not-allowed"
            )}
            title={!stage.enabled ? "Coming soon" : undefined}
          >
            {stage.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  // Slot mode: no slot selected → show idle message with stage selector
  if (isSlotMode && selectedSlotNum === null) {
    return (
      <div className="space-y-0">
        {stageSelector}
        <div className="rounded-lg border-2 border-muted p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <MousePointerClick className="h-8 w-8 opacity-50" />
          <p className="text-sm font-medium">Select a slot from the grid below to begin editing.</p>
        </div>
      </div>
    );
  }

  const isSegment = candidate.odk === "S";
  const errors = { ...inlineErrors, ...commitErrors };
  const isProposal = state === "proposal";
  const isDraft = state === "candidate" || state === "proposal";

  function getError(field: string) {
    return errors[field];
  }

  function isTouched(field: string) {
    return touchedFields.has(field);
  }

  function isPredicted(field: string) {
    return predictedFields.has(field);
  }

  function isAiProposed(field: string) {
    return aiProposedFields.has(field);
  }

  function isDeterministicParse(field: string) {
    return deterministicParseFields.has(field);
  }

  /** Field was populated by any system patch (parse or AI) */
  function isSystemProposed(field: string) {
    return deterministicParseFields.has(field) || aiProposedFields.has(field);
  }

  function isMinimalField(field: string) {
    return (SEGMENT_REQUIRED_FIELDS as readonly string[]).includes(field) || field === "playNum";
  }

  function isDeemphasized(field: string) {
    return isSegment && !isMinimalField(field);
  }

  function isLookupCommitError(fieldName: string): boolean {
    return !!(commitErrors[fieldName] && isLookupField(fieldName));
  }

  /** Check if a field is outside the current workflow stage */
  function isFieldLockedByStage(fieldName: string): boolean {
    const fieldDef = playSchema.find((f) => f.name === fieldName);
    if (!fieldDef) return false;
    return fieldDef.defaultPassEntry > activePass;
  }

  const handleAddLookupFromError = (fieldName: string) => {
    const value = (candidate as Record<string, unknown>)[fieldName];
    if (value == null || String(value).trim() === "") return;
    const fieldDef = playSchema.find((f) => f.name === fieldName);
    setConfirmDialog({
      fieldName,
      fieldLabel: fieldDef?.label ?? fieldName,
      value: String(value).trim(),
    });
  };

  const handleClearField = (fieldName: string) => {
    updateField(fieldName, "");
    // Clear dependents if this is a parent lookup field
    const deps = DEPENDENT_FIELD_MAP[fieldName];
    if (deps) {
      for (const dep of deps) updateField(dep, "");
    }
  };

  /** Handle lookup field selection with dependent auto-population */
  const handleLookupSelect = (fieldName: string, value: string) => {
    updateField(fieldName, value);
    // Auto-populate dependent fields from entryAttributes
    const deps = DEPENDENT_FIELD_MAP[fieldName];
    if (deps && value) {
      const attrs = getEntryAttributes(fieldName, value);
      if (attrs) {
        for (const dep of deps) {
          if (attrs[dep]) updateField(dep, attrs[dep]);
        }
      }
    }
  };

  /** Handle penalty selection with penYards auto-population */
  const handlePenaltyChange = (value: string) => {
    updateField("penalty", value);
    if (value && PENALTY_YARDS_MAP[value] !== undefined) {
      updateField("penYards", String(PENALTY_YARDS_MAP[value]));
    } else if (!value) {
      updateField("penYards", "");
    }
  };

  const borderClasses = isProposal
    ? "border-proposal bg-proposal-muted"
    : isDraft
      ? "border-candidate bg-candidate-muted"
      : "border-border";

  const slotCommittedFields = isSlotMode && selectedSlotNum !== null
    ? new Set(slotMetaMap.get(selectedSlotNum)?.committedFields ?? [])
    : new Set<string>();

  const isFieldCommitted = (fieldName: string) => slotCommittedFields.has(fieldName);

  const renderFieldLabel = (fieldName: string, label: string, required: boolean) => {
    const meta = proposalMeta.get(fieldName);

    // Status badge for needs_clarification or governance_blocked
    const statusBadge = meta && (meta.status === "needs_clarification" || meta.status === "governance_blocked") ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-semibold rounded px-1",
              meta.status === "governance_blocked"
                ? "text-destructive bg-destructive/10"
                : "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40"
            )}>
              {meta.status === "governance_blocked" ? (
                <><ShieldAlert className="h-2.5 w-2.5" />Gov</>
              ) : (
                <><AlertCircle className="h-2.5 w-2.5" />?</>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{meta.status === "governance_blocked" ? "Value not in approved lookup list" : "Needs clarification"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null;

    return (
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1 flex-wrap">
        {isFieldCommitted(fieldName) && !isPredicted(fieldName) && !isAiProposed(fieldName) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent><p>Committed</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isPredicted(fieldName) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 rounded px-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  Pred
                </span>
              </TooltipTrigger>
              <TooltipContent><p>Auto-predicted from previous play. Editable.</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {carriedForwardFields.has(fieldName) && !isPredicted(fieldName) && !deterministicParseFields.has(fieldName) && !isAiProposed(fieldName) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 rounded px-1">
                  <ArrowRightLeft className="h-2.5 w-2.5" />
                  CF
                </span>
              </TooltipTrigger>
              <TooltipContent><p>Carried forward from play {carriedForwardFromPlayNum ?? "?"}. Editable.</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {deterministicParseFields.has(fieldName) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 rounded px-1">
                  <Terminal className="h-2.5 w-2.5" />Parse
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>From transcript parse. Editable.</p>
                {meta?.transcriptEvidence && (
                  <p className="text-[10px] mt-1 opacity-80 font-mono">
                    <Info className="h-2.5 w-2.5 inline mr-0.5" />
                    "{meta.transcriptEvidence}"
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {isAiProposed(fieldName) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/40 rounded px-1">
                  <Bot className="h-2.5 w-2.5" />AI
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>AI-proposed value. Editable.</p>
                {meta?.transcriptEvidence && (
                  <p className="text-[10px] mt-1 opacity-80 font-mono">
                    <Info className="h-2.5 w-2.5 inline mr-0.5" />
                    "{meta.transcriptEvidence}"
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {statusBadge}
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
    );
  };

  const committedDot = (fieldName: string) =>
    isFieldCommitted(fieldName) ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
          </TooltipTrigger>
          <TooltipContent><p>Committed</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null;

  const renderField = (fieldName: string) => {
    // 9.2A: Hide inactive fields from editable input grid (NOT banner)
    if (isFieldInactive(fieldName)) return null;

    // PAT context: hide RESULT (set via dialog), hide playType (auto-set), hide patTry (auto-set)
    if (patContext && (fieldName === "result" || fieldName === "playType" || fieldName === "patTry")) {
      return null;
    }

    // Slot mode: playNum is read-only badge
    if (isSlotMode && selectedSlotNum !== null && fieldName === "playNum") {
      return (
        <div key={fieldName} className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground">Play #</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="gap-1 font-mono text-sm h-8 px-3 flex items-center w-fit">
                  <Lock className="h-3 w-3" />
                  Play #{selectedSlotNum}
                </Badge>
              </TooltipTrigger>
              <TooltipContent><p>Slot-owned — immutable</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    const fieldDef = playSchema.find((f) => f.name === fieldName);
    if (!fieldDef) return null;

    const value = (candidate as Record<string, unknown>)[fieldName];
    const error = getError(fieldName);
    const touched = isTouched(fieldName);
    const deemphasized = isDeemphasized(fieldName);
    const stageLocked = isFieldLockedByStage(fieldName);

    const fieldClasses = cn(
      "space-y-1",
      deemphasized && "opacity-40",
      stageLocked && "opacity-50"
    );

    const predicted = isPredicted(fieldName);
    const aiProposed = isAiProposed(fieldName);
    const inputClasses = cn(
      "h-8 text-sm font-mono",
      predicted && !touched && !error && "bg-violet-50 dark:bg-violet-950/30 border-violet-300 dark:border-violet-700",
      aiProposed && !touched && !error && !predicted && "bg-sky-50 dark:bg-sky-950/30 border-sky-300 dark:border-sky-700",
      touched && !error && !predicted && !aiProposed && "bg-field-touched",
      error && "border-destructive"
    );

    const isDisabled = isProposal || stageLocked;

    // Stage-locked label hint
    const stageLockLabel = stageLocked ? (
      <span className="text-[10px] text-muted-foreground italic block">Not editable in this stage</span>
    ) : null;

    // Actor fields → ActorCombobox
    if (ACTOR_FIELDS.has(fieldName)) {
      return (
        <div key={fieldName} className={fieldClasses}>
          <ActorCombobox
            fieldLabel={fieldDef.label}
            requiredAtCommit={fieldDef.requiredAtCommit}
            value={value != null ? String(value) : ""}
            onChange={(v) => updateField(fieldName, v)}
            roster={roster}
            addPlayer={addPlayer}
            disabled={isDisabled}
            inputClassName={inputClasses}
            error={error}
            committedDot={committedDot(fieldName)}
            provenanceBadge={(() => {
              const actorMeta = proposalMeta.get(fieldName);
              if (isAiProposed(fieldName)) {
                const isParsed = actorMeta?.provenance === "deterministic_parse";
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-[9px] font-semibold rounded px-1",
                          isParsed
                            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40"
                            : "text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/40"
                        )}>
                          {isParsed ? <><Terminal className="h-2.5 w-2.5" />Parse</> : <><Bot className="h-2.5 w-2.5" />AI</>}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{isParsed ? "From transcript parse. Editable." : "AI-proposed value. Editable."}</p>
                        {actorMeta?.transcriptEvidence && (
                          <p className="text-[10px] mt-1 opacity-80 font-mono">"{actorMeta.transcriptEvidence}"</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              if (isPredicted(fieldName)) {
                return (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 rounded px-1">
                          Pred
                        </span>
                      </TooltipTrigger>
                      <TooltipContent><p>Auto-predicted from previous play. Editable.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }
              return null;
            })()}
          />
          {(() => {
            const jerseyStr = value != null ? String(value).trim() : "";
            const jerseyNum = parseInt(jerseyStr, 10);
            if (jerseyStr !== "" && !isNaN(jerseyNum) && jerseyNum >= 0) {
              const player = roster.find((r) => r.jerseyNumber === jerseyNum);
              if (player) {
                return (
                  <span className="text-[9px] text-muted-foreground truncate block pl-0.5">
                    {player.playerName}
                  </span>
                );
              }
            }
            return null;
          })()}
          {stageLockLabel}
          {commitErrors[fieldName] && (
            <div className="flex gap-1 mt-0.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px] px-1.5 text-destructive"
                onClick={() => handleClearField(fieldName)}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      );
    }

    // LOOKUP-sourced string fields → combobox with dependent auto-population
    if (isLookupField(fieldName) && fieldDef.dataType === "string") {
      return (
        <div key={fieldName} className={fieldClasses}>
          <LookupCombobox
            fieldName={fieldName}
            fieldLabel={fieldDef.label}
            requiredAtCommit={fieldDef.requiredAtCommit}
            value={value != null ? String(value) : ""}
            onChange={(v) => handleLookupSelect(fieldName, v)}
            onRequestAdd={(v) =>
              setConfirmDialog({ fieldName, fieldLabel: fieldDef.label, value: v })
            }
            lookupValues={getValues(fieldName)}
            disabled={isDisabled}
            inputClassName={inputClasses}
            error={error}
          />
          {stageLockLabel}
          {isLookupCommitError(fieldName) && !stageLocked && (
            <div className="flex gap-1 mt-0.5">
              <Button
                size="sm"
                variant="outline"
                className="h-5 text-[10px] px-1.5 gap-0.5"
                onClick={() => handleAddLookupFromError(fieldName)}
              >
                <Plus className="h-2.5 w-2.5" />
                Add to lookup
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px] px-1.5 text-destructive"
                onClick={() => handleClearField(fieldName)}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      );
    }

    // Penalty field: special handler for penYards auto-population
    if (fieldName === "penalty" && fieldDef.allowedValues) {
      return (
        <div key={fieldName} className={fieldClasses}>
          {renderFieldLabel(fieldName, fieldDef.label, fieldDef.requiredAtCommit)}
          <Select
            value={value != null && String(value) !== "" ? String(value) : "__none__"}
            onValueChange={(v) => handlePenaltyChange(v === "__none__" ? "" : v)}
            disabled={isDisabled}
          >
            <SelectTrigger className={inputClasses}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {fieldDef.allowedValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stageLockLabel}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    }

    if (fieldDef.allowedValues) {
      const displayLabel = (v: string) => {
        if (fieldName === "qtr") return QTR_DISPLAY[v] ?? v;
        return v;
      };
      // Determine if this field is nullable (not required at commit)
      const isNullable = !fieldDef.requiredAtCommit;
      return (
        <div key={fieldName} className={fieldClasses}>
          {renderFieldLabel(fieldName, fieldDef.label, fieldDef.requiredAtCommit)}
          <Select
            value={value != null && String(value) !== "" ? String(value) : "__none__"}
            onValueChange={(v) => updateField(fieldName, v === "__none__" ? "" : v)}
            disabled={isDisabled}
          >
            <SelectTrigger className={inputClasses}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {isNullable && <SelectItem value="__none__">—</SelectItem>}
              {fieldDef.allowedValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {displayLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stageLockLabel}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    }

    if (fieldDef.allowedValues) {
      const displayLabel = (v: string) => {
        if (fieldName === "qtr") return QTR_DISPLAY[v] ?? v;
        return v;
      };
      return (
        <div key={fieldName} className={fieldClasses}>
          {renderFieldLabel(fieldName, fieldDef.label, fieldDef.requiredAtCommit)}
          <Select
            value={value != null ? String(value) : ""}
            onValueChange={(v) => updateField(fieldName, v)}
            disabled={isDisabled}
          >
            <SelectTrigger className={inputClasses}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {fieldDef.allowedValues.map((v) => (
                <SelectItem key={v} value={v}>
                  {displayLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {stageLockLabel}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      );
    }

    return (
      <div key={fieldName} className={fieldClasses}>
        {renderFieldLabel(fieldName, fieldDef.label, fieldDef.requiredAtCommit)}
        <Input
          className={inputClasses}
          type="text"
          inputMode={fieldDef.dataType === "integer" ? "numeric" : "text"}
          value={value != null ? String(value) : ""}
          onChange={(e) => updateField(fieldName, e.target.value)}
          placeholder="—"
          disabled={isDisabled}
        />
        {stageLockLabel}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  const handleCommitAndNext = async () => {
    const result = await commitAndNext();
    if (result.committed) {
      voiceClearRef.current?.();
      if (!result.hasNext) {
        toast("End of filtered list.");
      }
    }
  };

  const handleNextSlot = async () => {
    const advanced = await nextSlot();
    if (!advanced) {
      toast("No next slot.");
    }
  };

  const handleParseAndApply = async () => {
    if (!rawInputText.trim() || selectedSlotNum === null) return;
    const result = await saveInput(selectedSlotNum, rawInputText.trim());

    // Report unrecognized/ambiguous
    const issues = result.report.filter((r) => r.status !== "matched");
    if (issues.length > 0) {
      const msgs = issues.map((i) => `${i.anchor}: ${i.status} ("${i.rawValue}")`);
      toast.warning(`Parse issues: ${msgs.join("; ")}`);
    }

    if (Object.keys(result.patch).length === 0) {
      toast("No anchors recognized in input.");
      setRawInputText("");
      return;
    }

    // Detect collisions: fields that already have a non-empty value in the candidate
    const collisions: Collision[] = [];
    const nonCollisionPatch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(result.patch)) {
      const current = (candidate as Record<string, unknown>)[key];
      const hasExisting = current !== null && current !== undefined && current !== "";
      if (hasExisting && String(current) !== String(val)) {
        collisions.push({ fieldName: key, currentValue: current, proposedValue: val });
      } else {
        nonCollisionPatch[key] = val;
      }
    }

    if (collisions.length > 0) {
      // Show collision dialog — non-colliding fields are NOT applied yet
      setCollisionState({
        collisions,
        nonCollisionPatch,
        fullPatch: result.patch,
        report: result.report,
      });
    } else {
      // No collisions — apply all
      for (const [key, val] of Object.entries(result.patch)) {
        updateField(key, val);
      }
      toast.success(`Applied ${Object.keys(result.patch).length} field(s) from raw input`);
      setRawInputText("");
    }
  };

  const handleCollisionConfirm = (selectedFields: Set<string>) => {
    if (!collisionState) return;
    // Apply non-colliding fields
    for (const [key, val] of Object.entries(collisionState.nonCollisionPatch)) {
      updateField(key, val);
    }
    // Apply selected collision fields
    for (const c of collisionState.collisions) {
      if (selectedFields.has(c.fieldName)) {
        updateField(c.fieldName, c.proposedValue);
      }
    }
    const applied = Object.keys(collisionState.nonCollisionPatch).length + selectedFields.size;
    toast.success(`Applied ${applied} field(s) from raw input`);
    setCollisionState(null);
    setRawInputText("");
  };

  const handleVoiceParse = (transcriptText: string) => {
    if (!transcriptText.trim()) {
      toast("No transcript to parse.");
      return;
    }
    const normalized = normalizeTranscriptForParse(transcriptText.trim());
    const result = parseRawInput(normalized);

    // Report unrecognized/ambiguous
    const issues = result.report.filter((r) => r.status !== "matched");
    if (issues.length > 0) {
      const msgs = issues.map((i) => `${i.anchor}: ${i.status} ("${i.rawValue}")`);
      toast.warning(`Parse issues: ${msgs.join("; ")}`);
    }

    // Filter out derived/calculated fields — only allow coach-observed fields
    const ALLOWED_VOICE_FIELDS = new Set([
      "dn", "dist", "yardLn", "hash", "qtr", "odk", "series",
      "offForm", "offPlay", "motion", "result", "gainLoss",
      "penalty", "penYards", "rusher", "passer", "receiver", "returner", "twoMin",
    ]);
    for (const key of Object.keys(result.patch)) {
      if (!ALLOWED_VOICE_FIELDS.has(key)) {
        delete result.patch[key];
      }
    }

    if (Object.keys(result.patch).length === 0) {
      toast("No anchors recognized in transcript.");
      return;
    }

    // Build evidence from transcript snippet per field
    const evidence: Record<string, { snippet: string }> = {};
    for (const entry of result.report) {
      if (entry.status === "matched" && entry.matchedValue !== undefined) {
        const fieldName = Object.entries(result.patch).find(
          ([, v]) => String(v) === entry.matchedValue
        )?.[0];
        if (fieldName) {
          evidence[fieldName] = { snippet: transcriptText.slice(0, 40) };
        }
      }
    }

    // Detect collisions
    const collisions: Collision[] = [];
    let nonCollisionCount = 0;
    const safePatch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(result.patch)) {
      const current = (candidate as Record<string, unknown>)[key];
      const hasExisting = current !== null && current !== undefined && current !== "";
      if (hasExisting && String(current) !== String(val)) {
        collisions.push({ fieldName: key, currentValue: current, proposedValue: val });
      } else {
        safePatch[key] = val;
        nonCollisionCount++;
      }
    }

    // Apply non-colliding fields via applySystemPatch
    if (Object.keys(safePatch).length > 0) {
      const safeEvidence: Record<string, { snippet: string }> = {};
      for (const key of Object.keys(safePatch)) {
        if (evidence[key]) safeEvidence[key] = evidence[key];
      }
      applySystemPatch(safePatch, { evidence: safeEvidence });
    }

    if (collisions.length > 0) {
      setAiCollisionState({
        collisions: collisions.map((c) => ({
          fieldName: c.fieldName,
          currentValue: c.currentValue,
          proposedValue: c.proposedValue,
        })),
        nonCollisionCount,
        evidence,
      });
      toast.info(`${nonCollisionCount} field(s) applied, ${collisions.length} collision(s) need review.`);
    } else {
      toast.success(`Applied ${nonCollisionCount} field(s) from transcript`);
    }
  };

  return (
    <>
      {stageSelector}

      {/* Phase 10: Dev-only smoke test harness */}
      {isDevMode() && <Phase10SmokeTest />}

      {/* Voice Transcription Panel — visible in Pass 1+ with a slot selected */}
      {activePass >= 1 && selectedSlotNum !== null && (
        <div className="mb-3">
          <VoicePanel clearRef={voiceClearRef} disabled={isProposal} onParse={handleVoiceParse} />
        </div>
      )}

      {/* Raw Input Section — visible in Pass 1+ with a slot selected */}
      {activePass >= 1 && selectedSlotNum !== null && (
        <Collapsible open={rawInputOpen} onOpenChange={setRawInputOpen} className="mb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 mb-1">
              <Terminal className="h-3.5 w-3.5" />
              Raw Input
              <ChevronDown className={cn("h-3 w-3 transition-transform", rawInputOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/30">
              <Textarea
                className="text-xs font-mono h-16 resize-none"
                placeholder="e.g. DN 2 DIST 6 FORM Trips Rt RESULT Rush GN/LS 4"
                value={rawInputText}
                onChange={(e) => setRawInputText(e.target.value)}
                disabled={isProposal}
              />
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={handleParseAndApply}
                  disabled={!rawInputText.trim() || isProposal}
                >
                  <Terminal className="h-3 w-3" />
                  Parse &amp; Apply
                </Button>
                <Collapsible>
                  <CollapsibleTrigger className="text-[10px] text-muted-foreground hover:text-foreground underline">
                    Grammar help
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="text-[10px] text-muted-foreground mt-1 bg-muted/50 rounded p-2 font-mono whitespace-pre-wrap">
{`Anchors (case-insensitive):
DN 2 DIST 6 YARD -35 HASH L
FORM Trips Rt PLAY 26 Punch MOTION Jet
RESULT Rush GN/LS 4
RUSHER 22 PASSER 7 RECEIVER 11
PENALTY O-Holding EFF Y 2MIN N`}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Dev-only AI Patch test buttons */}
      {isDevMode() && activePass >= 1 && selectedSlotNum !== null && (
        <div className="mb-3 rounded-lg border border-dashed border-sky-400/50 p-3 space-y-2 bg-sky-50/30 dark:bg-sky-950/20">
          <span className="text-[10px] uppercase tracking-wider text-sky-600 dark:text-sky-400 font-semibold">Dev: AI Patch Testing</span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-sky-300 dark:border-sky-700"
              disabled={isProposal}
              onClick={() => {
                const collisions = applySystemPatch(
                  { dn: "1", dist: "10", yardLn: "-10", rusher: "10" },
                  {
                    evidence: {
                      dn: { snippet: "first down" },
                      dist: { snippet: "and 10" },
                      yardLn: { snippet: "on our 10" },
                      rusher: { snippet: "ball carrier 10" },
                    },
                  }
                );
                if (collisions.length > 0) {
                  setAiCollisionState({
                    collisions: collisions.map((c) => ({
                      fieldName: c.fieldName,
                      currentValue: c.currentValue,
                      proposedValue: c.proposedValue,
                    })),
                    nonCollisionCount: 4 - collisions.length,
                    evidence: {
                      dn: { snippet: "first down" },
                      dist: { snippet: "and 10" },
                      yardLn: { snippet: "on our 10" },
                      rusher: { snippet: "ball carrier 10" },
                    },
                  });
                } else {
                  toast.success("AI patch applied (4 fields, no collisions)");
                }
              }}
            >
              <Bot className="h-3 w-3" />
              Dev: Apply AI Patch (safe)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-sky-300 dark:border-sky-700"
              disabled={isProposal}
              onClick={() => {
                applySystemPatch(
                  { offForm: "Purple" },
                  { evidence: { offForm: { snippet: "formation Purple" } } }
                );
                toast.info("AI patch sent — should trigger lookup interrupt");
              }}
            >
              <Bot className="h-3 w-3" />
              Dev: Apply AI Patch (unknown lookup)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-sky-300 dark:border-sky-700"
              disabled={isProposal}
              onClick={() => {
                const collisions = applySystemPatch(
                  { dist: "7" },
                  { evidence: { dist: { snippet: "7 yards" } } }
                );
                if (collisions.length > 0) {
                  setAiCollisionState({
                    collisions: collisions.map((c) => ({
                      fieldName: c.fieldName,
                      currentValue: c.currentValue,
                      proposedValue: c.proposedValue,
                    })),
                    nonCollisionCount: 0,
                    evidence: { dist: { snippet: "7 yards" } },
                  });
                } else {
                  toast.success("AI patch applied (dist=7, no collision)");
                }
              }}
            >
              <Bot className="h-3 w-3" />
              Dev: Apply AI Patch (collision)
            </Button>
          </div>
        </div>
      )}


      {/* Coach Notes — visible on all passes, independent of transaction */}
      {selectedSlotNum !== null && (
        <CoachNotesPanel selectedSlotNum={selectedSlotNum} />
      )}

      <div
        className={cn(
          "rounded-lg border-2 p-4 space-y-4",
          borderClasses
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2">
            {isProposal ? "Proposal Review" : "Draft Entry"}
            {isSlotMode && selectedSlotNum !== null && (
              <span className="flex items-center gap-1 text-xs font-mono normal-case text-muted-foreground">
                <Lock className="h-3 w-3" /> Slot #{selectedSlotNum}
              </span>
            )}
          </h2>
          <div className="flex gap-2">
            {isSlotMode && selectedSlotNum !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={deselectSlot}
              >
                <X className="h-3 w-3" />
                Deselect Slot
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={clearDraft}
            >
              <Eraser className="h-3 w-3" />
              Clear Draft
            </Button>
          </div>
        </div>

        {/* Scaffolded warning banner */}
        {scaffoldedWarning && (
          <div className="flex items-start gap-2 text-xs rounded px-3 py-2 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
            <span className="flex-1">
              Changing this value may create inconsistency with seeded structure. Downstream plays are not changed automatically.
            </span>
            <button
              type="button"
              onClick={dismissScaffoldWarning}
              className="shrink-0 hover:opacity-70"
              aria-label="Dismiss warning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* PAT context indicator */}
        {patContext && (
          <div className="text-xs rounded px-3 py-2 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800 font-medium space-y-1">
            <div className="flex items-center justify-between">
              <span>
                PAT Attempt {candidate.patTry === "1" ? "(Going for 1 — Extra Pt.)" : candidate.patTry === "2" ? "(Going for 2 — 2 Pt.)" : "— select try type"}
              </span>
              {candidate.patTry && candidate.result && !isProposal && (
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5" onClick={reopenPatDialog}>
                  Edit
                </Button>
              )}
            </div>
            {candidate.result && (
              <div className="text-[11px]">Outcome: <span className="font-semibold">{String(candidate.result)}</span></div>
            )}
          </div>
        )}

        {/* Prediction explanation banner — Pass 1 only */}
        {activePass < 2 && predictionCoachMessages.length > 0 && (
          <PredictionBanner coachMessages={predictionCoachMessages} technicalExplanations={predictionExplanations} />
        )}

        {/* Adjustment banner — shown in proposal state when normalization changed values */}
        {isProposal && adjustments.length > 0 && (
          <div className="flex flex-col gap-0.5 text-xs rounded px-3 py-2 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            {adjustments.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
          </div>
        )}

        {isSegment && (
          <div className={cn(
            "text-xs rounded px-2 py-1",
            isProposal
              ? "text-proposal-foreground bg-proposal/20"
              : "text-candidate-foreground bg-candidate/20"
          )}>
            Segment row (ODK=S): Only Play #, Quarter, and ODK are required.
          </div>
        )}

        {commitErrors._noop && (
          <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
            {commitErrors._noop}
          </div>
        )}

        {/* Pass 3: Blocking panel; Pass 2: Personnel panel; Pass 1: standard field grid */}
        {activePass === 3 ? (
          <BlockingPanel />
        ) : activePass === 2 ? (
          <PersonnelPanel />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {playSchema.map((f) => renderField(f.name))}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-border/30">
          {!isProposal && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={reviewProposal}
              disabled={
                activePass === 3
                  ? !Array.from(touchedFields).some((f) => (GRADE_FIELDS as readonly string[]).includes(f))
                  : activePass >= 2
                    ? (touchedFields.size === 0 && carriedForwardFields.size === 0 && aiProposedFields.size === 0)
                    : (touchedFields.size === 0 && aiProposedFields.size === 0)
              }
            >
              <Eye className="h-3.5 w-3.5" />
              Review Proposal
            </Button>
          )}
          {selectedSlotNum !== null && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs"
              onClick={handleNextSlot}
            >
              <ChevronRight className="h-3.5 w-3.5" />
              Next Slot
            </Button>
          )}
          {isProposal && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={backToEdit}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Edit
              </Button>
              <Button
                size="sm"
                className="gap-1 bg-proposal text-proposal-foreground hover:bg-proposal/90"
                onClick={() => { commitProposal(); voiceClearRef.current?.(); }}
              >
                <Check className="h-3.5 w-3.5" />
                Commit
              </Button>
              {isSlotMode && (
                <Button
                  size="sm"
                  className="gap-1 bg-proposal text-proposal-foreground hover:bg-proposal/90"
                  onClick={handleCommitAndNext}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                  Commit & Next
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {confirmDialog && (
        <LookupConfirmDialog
          open
          fieldName={confirmDialog.fieldName}
          fieldLabel={confirmDialog.fieldLabel}
          value={confirmDialog.value}
          onConfirm={async (attributes) => {
            const { fieldName, value } = confirmDialog;
            try {
              await addValue(fieldName, value, attributes);
              handleLookupSelect(fieldName, value);
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Failed to add value");
              updateField(confirmDialog.fieldName, "");
            }
            setConfirmDialog(null);
          }}
          onCancel={() => {
            updateField(confirmDialog.fieldName, "");
            setConfirmDialog(null);
          }}
        />
      )}

      {collisionState && (
        <RawInputCollisionDialog
          open
          collisions={collisionState.collisions}
          nonCollisionCount={Object.keys(collisionState.nonCollisionPatch).length}
          onConfirm={handleCollisionConfirm}
          onCancel={() => setCollisionState(null)}
        />
      )}

      {tdCorrectionPending && (
        <TDCorrectionDialog
          open
          correctedResult={tdCorrectionPending.correctedResult}
          onConfirm={confirmTDCorrection}
          onCancel={cancelTDCorrection}
        />
      )}

      {patTryPending && (
        <PATTryDialog
          open
          lockedTry={patLockedTry}
          onConfirm={selectPatAttempt}
          onCancel={cancelPatTry}
        />
      )}

      {activePass < 2 && possessionCheckPending && (
        <PossessionCheckDialog
          open
          prevPlayInfo={possessionPrevPlayInfo}
          onConfirmOffense={confirmPossessionOffense}
          onCancel={cancelPossessionCheck}
        />
      )}

      {gradeOverwriteDiffs.length > 0 && (
        <GradeOverwriteDialog
          open
          diffs={gradeOverwriteDiffs}
          onConfirm={confirmGradeOverwrite}
          onCancel={cancelGradeOverwrite}
        />
      )}

      {/* Phase 10: AI system patch collision dialog */}
      {aiCollisionState && (
        <RawInputCollisionDialog
          open
          collisions={aiCollisionState.collisions}
          nonCollisionCount={aiCollisionState.nonCollisionCount}
          onConfirm={(selectedFields) => {
            // Build overwrite patch from selected collision fields only
            const overwritePatch: Record<string, unknown> = {};
            for (const c of aiCollisionState.collisions) {
              if (selectedFields.has(c.fieldName)) {
                overwritePatch[c.fieldName] = c.proposedValue;
              }
            }
            if (Object.keys(overwritePatch).length > 0) {
              applySystemPatch(overwritePatch, { fillOnly: false, evidence: aiCollisionState.evidence });
            }
            toast.success(`Applied ${selectedFields.size + aiCollisionState.nonCollisionCount} AI field(s)`);
            setAiCollisionState(null);
          }}
          onCancel={() => setAiCollisionState(null)}
        />
      )}

      {/* Phase 10D: Lookup interrupt dialog for AI patches */}
      {lookupInterruptPending && (
        <Dialog open onOpenChange={(o) => { if (!o) clearLookupInterrupt(); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                Unknown Lookup Value
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              The AI-proposed value{" "}
              <span className="font-mono font-semibold text-foreground">
                &ldquo;{lookupInterruptPending.value}&rdquo;
              </span>{" "}
              for{" "}
              <span className="font-semibold text-foreground">
                {lookupInterruptPending.fieldLabel}
              </span>{" "}
              is not in the lookup table.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => {
                  const li = lookupInterruptPending;
                  clearLookupInterrupt();
                  setConfirmDialog({
                    fieldName: li.fieldName,
                    fieldLabel: li.fieldLabel,
                    value: li.value,
                  });
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add new lookup value
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => {
                  clearLookupInterrupt();
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Correct play details manually
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="justify-start gap-2 text-destructive"
                onClick={() => {
                  clearLookupInterrupt();
                  clearDraft();
                }}
              >
                <X className="h-3.5 w-3.5" />
                Exit play logging
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── Prediction Banner Sub-Component with "Why?" expander ──

import type { CoachMessage } from "@/engine/predictionMessages";

function PredictionBanner({ coachMessages, technicalExplanations }: {
  coachMessages: CoachMessage[];
  technicalExplanations: string[];
}) {
  const [showTechnical, setShowTechnical] = React.useState(false);

  return (
    <div className="flex flex-col gap-1 text-xs rounded px-3 py-2 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
      <div className="flex items-start gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-0.5">
          {coachMessages.map((msg, i) => (
            <p key={i}>{msg.coach}</p>
          ))}
        </div>
        {technicalExplanations.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTechnical(!showTechnical)}
            className="shrink-0 text-[10px] underline opacity-60 hover:opacity-100"
          >
            Why?
          </button>
        )}
      </div>
      {showTechnical && (
        <div className="ml-5 mt-1 text-[10px] opacity-60 space-y-0.5 font-mono border-t border-violet-200 dark:border-violet-700 pt-1">
          {technicalExplanations.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      )}
    </div>
  );
}



interface LookupComboboxProps {
  fieldName: string;
  fieldLabel: string;
  requiredAtCommit: boolean;
  value: string;
  onChange: (value: string) => void;
  onRequestAdd: (value: string) => void;
  lookupValues: string[];
  disabled: boolean;
  inputClassName: string;
  error?: string;
}

function LookupCombobox({
  fieldName,
  fieldLabel,
  requiredAtCommit,
  value,
  onChange,
  onRequestAdd,
  lookupValues,
  disabled,
  inputClassName,
  error,
}: LookupComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const displayValue = search !== "" ? search : value;
  const typedCanonical = canonicalizeLookupValue(displayValue);

  const filtered = displayValue.trim() === ""
    ? lookupValues
    : lookupValues.filter((v) =>
        canonicalizeLookupValue(v).includes(typedCanonical)
      );

  const isNovelValue =
    displayValue.trim() !== "" &&
    !lookupValues.some((v) => canonicalizeLookupValue(v) === typedCanonical);

  // Close dropdown on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <Label className="text-xs font-medium text-muted-foreground">
        {fieldLabel}
        {requiredAtCommit && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        className={inputClassName}
        value={displayValue}
        onChange={(e) => {
          const v = e.target.value;
          setSearch(v);
          onChange(v);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={lookupValues.length === 0 ? "No values yet. Type to add." : "—"}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {open && !disabled && (filtered.length > 0 || isNovelValue) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-[180px] overflow-y-auto">
          {filtered.map((v) => (
            <button
              key={v}
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-accent cursor-pointer"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(v);
                setSearch("");
                setOpen(false);
              }}
            >
              {v}
            </button>
          ))}
          {isNovelValue && (
            <button
              type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent cursor-pointer flex items-center gap-1 text-primary font-medium"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onRequestAdd(displayValue.trim());
                setSearch("");
                setOpen(false);
              }}
            >
              <Plus className="h-3 w-3" />
              Add &ldquo;{displayValue.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
