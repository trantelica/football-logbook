/**
 * TranscriptPanel — Non-parsing transcript capture UI (Phase 10).
 *
 * Captures speech via Web Speech API or typed fallback input.
 * Transcript is held in local state only — isolated from:
 *   - rawInputParser / parseRawInput
 *   - candidatePatch creation
 *   - applySystemPatch / proposal state
 *   - committed rows / transaction state
 *
 * Controls: Start/Stop mic, Clear, typed fallback textarea.
 */

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Trash2, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranscriptCapture } from "@/hooks/useTranscriptCapture";

export function TranscriptPanel() {
  const {
    lines,
    interim,
    listening,
    supported,
    hasContent,
    toggleListening,
    clear,
    appendLine,
  } = useTranscriptCapture();

  const [typedText, setTypedText] = useState("");
  const [showTyped, setShowTyped] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, interim]);

  // Show typed fallback automatically when speech is not supported
  useEffect(() => {
    if (!supported) setShowTyped(true);
  }, [supported]);

  const handleTypedSubmit = () => {
    if (!typedText.trim()) return;
    appendLine(typedText);
    setTypedText("");
  };

  const handleTypedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTypedSubmit();
    }
  };

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
              {showTyped ? "Hide keyboard" : "Type instead"}
            </Button>
          )}
        </div>

        {hasContent && !listening && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={clear}
          >
            <Trash2 className="h-2.5 w-2.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Transcript display */}
      {hasContent && (
        <div
          ref={scrollRef}
          className={cn(
            "max-h-[120px] overflow-y-auto rounded border border-border/30 bg-background/50 px-2 py-1.5 space-y-0.5",
            listening && "border-destructive/30"
          )}
        >
          {lines.map((line, i) => (
            <p key={i} className="text-xs font-mono text-foreground leading-relaxed">
              {line}
            </p>
          ))}
          {interim && (
            <p className="text-xs font-mono text-muted-foreground italic leading-relaxed">
              {interim}
            </p>
          )}
        </div>
      )}

      {/* Typed fallback */}
      {showTyped && !listening && (
        <div className="flex gap-1.5">
          <Textarea
            className="text-xs font-mono h-10 min-h-[40px] resize-none flex-1"
            placeholder="Type transcript line and press Enter…"
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={handleTypedKeyDown}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-10 text-xs px-2"
            onClick={handleTypedSubmit}
            disabled={!typedText.trim()}
          >
            Add
          </Button>
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
