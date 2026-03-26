/**
 * TranscriptPanel — Editable transcript working draft with explicit Parse and Apply actions.
 *
 * - Transcript is an editable textarea (coach can fix STT errors).
 * - Parse is triggered only on explicit button press.
 * - Parse operates on a frozen snapshot of the current text.
 * - Apply to Draft transfers the frozen parse result into the draft via applySystemPatch.
 * - Editing after parse marks transcript as "dirty" — Apply is disabled until re-parse.
 * - No auto-parse. No AI. No silent mutation of candidate/proposal/committed state.
 */

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Trash2, Keyboard, Play, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranscriptCapture } from "@/hooks/useTranscriptCapture";
import { parseRawInput, type ParseResult } from "@/engine/rawInputParser";
import { normalizeTranscriptForParse } from "@/engine/transcriptNormalize";
import { useTransaction, type SystemPatchCollision } from "@/engine/transaction";
import { RawInputCollisionDialog, type Collision } from "@/components/RawInputCollisionDialog";
import { toast } from "sonner";

interface ParseSnapshot {
  /** The exact text that was parsed */
  sourceText: string;
  /** The parse result from the deterministic parser */
  result: ParseResult;
  /** ISO timestamp of when parse was triggered */
  parsedAt: string;
}

export function TranscriptPanel() {
  const {
    text,
    interim,
    listening,
    supported,
    hasContent,
    setText,
    toggleListening,
    clear,
  } = useTranscriptCapture();

  const { applySystemPatch } = useTransaction();

  const [showTyped, setShowTyped] = useState(false);
  const [typedLine, setTypedLine] = useState("");
  const [lastSnapshot, setLastSnapshot] = useState<ParseSnapshot | null>(null);
  const [applied, setApplied] = useState(false);

  // Collision dialog state
  const [collisionState, setCollisionState] = useState<{
    collisions: Collision[];
    nonCollisionCount: number;
    fullPatch: Record<string, unknown>;
  } | null>(null);

  // Determine if transcript has changed since last parse
  const isDirtyAfterParse = lastSnapshot !== null && text.trim() !== lastSnapshot.sourceText;
  const hasParsed = lastSnapshot !== null;
  const hasParseableText = text.trim().length > 0;
  const hasPatchFields = hasParsed && Object.keys(lastSnapshot.result.patch).length > 0;

  // Apply is available only when: parsed, not dirty, not already applied, has fields
  const canApply = hasPatchFields && !isDirtyAfterParse && !applied;

  // Show typed fallback automatically when speech is not supported
  React.useEffect(() => {
    if (!supported) setShowTyped(true);
  }, [supported]);

  const handleTypedSubmit = useCallback(() => {
    const trimmed = typedLine.trim();
    if (!trimmed) return;
    setText(text ? text.trimEnd() + "\n" + trimmed : trimmed);
    setTypedLine("");
  }, [typedLine, text, setText]);

  const handleTypedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTypedSubmit();
    }
  };

  const handleClear = useCallback(() => {
    clear();
    setLastSnapshot(null);
    setTypedLine("");
    setApplied(false);
    setCollisionState(null);
  }, [clear]);

  /**
   * Explicit Parse action — freezes current text into a snapshot,
   * normalizes it, runs the deterministic parser, and stores the result.
   */
  const handleParse = useCallback(() => {
    const sourceText = text.trim();
    if (!sourceText) return;

    const normalized = normalizeTranscriptForParse(sourceText);
    const result = parseRawInput(normalized);

    setLastSnapshot({
      sourceText,
      result,
      parsedAt: new Date().toISOString(),
    });
    setApplied(false);
  }, [text]);

  /**
   * Apply to Draft — transfers frozen parse snapshot into draft via applySystemPatch.
   * Collisions are surfaced via the standard RawInputCollisionDialog.
   */
  const handleApplyToDraft = useCallback(() => {
    if (!lastSnapshot || isDirtyAfterParse || applied) return;

    const patch = { ...lastSnapshot.result.patch };
    if (Object.keys(patch).length === 0) return;

    const collisions = applySystemPatch(patch, { fillOnly: true });

    if (collisions.length > 0) {
      // Show collision dialog for user to pick overrides
      const nonCollisionCount = Object.keys(patch).length - collisions.length;
      setCollisionState({
        collisions: collisions.map((c: SystemPatchCollision) => ({
          fieldName: c.fieldName,
          currentValue: c.currentValue,
          proposedValue: c.proposedValue,
        })),
        nonCollisionCount,
        fullPatch: patch,
      });
    } else {
      setApplied(true);
      toast.success(`Applied ${Object.keys(patch).length} field(s) to draft`);
    }
  }, [lastSnapshot, isDirtyAfterParse, applied, applySystemPatch]);

  /** Handle collision resolution — apply selected overrides */
  const handleCollisionConfirm = useCallback((selectedFields: Set<string>) => {
    if (!collisionState) return;

    // Build override patch from selected collision fields
    const overridePatch: Record<string, unknown> = {};
    for (const c of collisionState.collisions) {
      if (selectedFields.has(c.fieldName)) {
        overridePatch[c.fieldName] = c.proposedValue;
      }
    }

    if (Object.keys(overridePatch).length > 0) {
      applySystemPatch(overridePatch, { fillOnly: false });
    }

    const totalApplied = collisionState.nonCollisionCount + Object.keys(overridePatch).length;
    toast.success(`Applied ${totalApplied} field(s) to draft`);
    setApplied(true);
    setCollisionState(null);
  }, [collisionState, applySystemPatch]);

  const handleCollisionCancel = useCallback(() => {
    // Non-collision fields were already applied by the first applySystemPatch call.
    // Mark as applied since partial apply occurred.
    if (collisionState && collisionState.nonCollisionCount > 0) {
      setApplied(true);
      toast.info(`Applied ${collisionState.nonCollisionCount} non-conflicting field(s)`);
    }
    setCollisionState(null);
  }, [collisionState]);

  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {supported && (
            <Button
              size="sm"
              variant={listening ? "destructive" : "outline"}
              className="h-7 text-xs gap-1"
              onClick={toggleListening}
            >
              {listening ? (
                <>
                  <MicOff className="h-3 w-3" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="h-3 w-3" />
                  Dictate
                </>
              )}
            </Button>
          )}

          {listening && (
            <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              Listening…
            </span>
          )}

          {!listening && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => setShowTyped((v) => !v)}
            >
              <Keyboard className="h-3 w-3" />
              {showTyped ? "Hide keyboard" : "Type"}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Parse button */}
          {hasParseableText && !listening && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs gap-1"
              onClick={handleParse}
            >
              <Play className="h-3 w-3" />
              Parse
            </Button>
          )}

          {/* Apply to Draft button */}
          {hasPatchFields && !listening && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={handleApplyToDraft}
              disabled={!canApply}
            >
              <ArrowRight className="h-3 w-3" />
              Apply to Draft
            </Button>
          )}

          {hasContent && !listening && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] gap-1 text-muted-foreground"
              onClick={handleClear}
            >
              <Trash2 className="h-2.5 w-2.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Editable transcript area */}
      <Textarea
        className={cn(
          "text-xs font-mono min-h-[60px] resize-y bg-background/50",
          listening && "border-destructive/30"
        )}
        placeholder={listening ? "Listening — speech will appear here…" : "Transcript working draft — type or dictate, then press Parse."}
        value={text + (interim ? (text ? "\n" : "") + interim : "")}
        onChange={(e) => {
          if (!listening) setText(e.target.value);
        }}
        readOnly={listening}
      />

      {/* Typed line input */}
      {showTyped && !listening && (
        <div className="flex gap-1.5">
          <Textarea
            className="text-xs font-mono h-10 min-h-[40px] resize-none flex-1"
            placeholder="Type a line and press Enter to add…"
            value={typedLine}
            onChange={(e) => setTypedLine(e.target.value)}
            onKeyDown={handleTypedKeyDown}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-10 text-xs px-2"
            onClick={handleTypedSubmit}
            disabled={!typedLine.trim()}
          >
            Add
          </Button>
        </div>
      )}

      {/* Parse status indicators */}
      {isDirtyAfterParse && (
        <div className="flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Transcript changed since last parse. Press Parse to re-parse.
        </div>
      )}

      {hasParsed && !isDirtyAfterParse && !applied && (
        <p className="text-[10px] text-muted-foreground">
          ✓ Parsed {Object.keys(lastSnapshot.result.patch).length} field(s)
          {lastSnapshot.result.report.filter((r) => r.status === "unrecognized").length > 0 &&
            ` · ${lastSnapshot.result.report.filter((r) => r.status === "unrecognized").length} unrecognized`}
        </p>
      )}

      {applied && (
        <p className="text-[10px] text-muted-foreground">
          ✓ Applied to draft. Edit transcript and re-parse for new data.
        </p>
      )}

      {/* Parse result preview */}
      {hasParsed && Object.keys(lastSnapshot.result.patch).length > 0 && (
        <div className="rounded border border-border/30 bg-background/50 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground mb-1 font-medium">
            {applied ? "Applied fields:" : "Parse result (preview — press Apply to Draft):"}
          </p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(lastSnapshot.result.patch).map(([field, value]) => (
              <span
                key={field}
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono",
                  applied
                    ? "bg-primary/10 text-primary"
                    : "bg-accent/50 text-accent-foreground"
                )}
              >
                {field}: {String(value)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasContent && !listening && !showTyped && (
        <p className="text-[10px] text-muted-foreground text-center py-1">
          Tap Dictate or Type to begin capturing transcript.
        </p>
      )}

      {/* Collision dialog */}
      {collisionState && (
        <RawInputCollisionDialog
          open
          collisions={collisionState.collisions}
          nonCollisionCount={collisionState.nonCollisionCount}
          onConfirm={handleCollisionConfirm}
          onCancel={handleCollisionCancel}
        />
      )}
    </div>
  );
}
