/**
 * TranscriptPanel — Editable transcript working draft with explicit Parse action.
 *
 * - Transcript is an editable textarea (coach can fix STT errors).
 * - Parse is triggered only on explicit button press.
 * - Parse operates on a frozen snapshot of the current text.
 * - Editing after parse marks transcript as "dirty" (changed since last parse).
 * - No auto-parse. No AI. No silent mutation of candidate/proposal/committed state.
 */

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Trash2, Keyboard, Play, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranscriptCapture } from "@/hooks/useTranscriptCapture";
import { parseRawInput, type ParseResult } from "@/engine/rawInputParser";
import { normalizeTranscriptForParse } from "@/engine/transcriptNormalize";

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

  const [showTyped, setShowTyped] = useState(false);
  const [typedLine, setTypedLine] = useState("");
  const [lastSnapshot, setLastSnapshot] = useState<ParseSnapshot | null>(null);

  // Determine if transcript has changed since last parse
  const isDirtyAfterParse = lastSnapshot !== null && text.trim() !== lastSnapshot.sourceText;
  const hasParsed = lastSnapshot !== null;
  const hasParseableText = text.trim().length > 0;

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
  }, [clear]);

  /**
   * Explicit Parse action — freezes current text into a snapshot,
   * normalizes it, runs the deterministic parser, and stores the result.
   * Does NOT call saveInput or create candidatePatch in rawInputContext.
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
  }, [text]);

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
          // Only allow edits when not listening (interim would conflict)
          if (!listening) setText(e.target.value);
        }}
        readOnly={listening}
      />

      {/* Typed line input (quick-add without editing main area) */}
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

      {hasParsed && !isDirtyAfterParse && (
        <p className="text-[10px] text-muted-foreground">
          ✓ Parsed {Object.keys(lastSnapshot.result.patch).length} field(s)
          {lastSnapshot.result.report.filter((r) => r.status === "unrecognized").length > 0 &&
            ` · ${lastSnapshot.result.report.filter((r) => r.status === "unrecognized").length} unrecognized`}
        </p>
      )}

      {/* Parse result preview (compact) */}
      {hasParsed && Object.keys(lastSnapshot.result.patch).length > 0 && (
        <div className="rounded border border-border/30 bg-background/50 px-2 py-1.5">
          <p className="text-[10px] text-muted-foreground mb-1 font-medium">Parse result (preview only — not applied):</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(lastSnapshot.result.patch).map(([field, value]) => (
              <span
                key={field}
                className="inline-flex items-center rounded bg-accent/50 px-1.5 py-0.5 text-[10px] font-mono text-accent-foreground"
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
    </div>
  );
}
