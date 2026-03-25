/**
 * VoicePanel — Transcription-only mic input (Phase 10.1).
 * Displays live transcript from Web Speech API. No parsing or field updates.
 * Clears on commit via onCommitClear callback.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Trash2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

// Extend Window for webkitSpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

interface VoicePanelProps {
  /** Ref to allow parent to call clearTranscript on commit */
  clearRef: React.MutableRefObject<(() => void) | null>;
  disabled?: boolean;
  /** Called when coach clicks "Parse transcript" with the full transcript text */
  onParse?: (transcriptText: string) => void;
}

export function VoicePanel({ clearRef, disabled, onParse }: VoicePanelProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Expose clear function to parent
  const clearTranscript = useCallback(() => {
    setLines([]);
    setInterim("");
  }, []);

  useEffect(() => {
    clearRef.current = clearTranscript;
    return () => { clearRef.current = null; };
  }, [clearRef, clearTranscript]);

  // Auto-scroll on new lines
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, interim]);

  // Check support on mount
  useEffect(() => {
    if (!getSpeechRecognition()) {
      setSupported(false);
    }
  }, []);

  const startListening = useCallback(() => {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          setLines((prev) => [...prev, transcript.trim()]);
          setInterim("");
        } else {
          interimText += transcript;
        }
      }
      if (interimText) {
        setInterim(interimText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("[VoicePanel] SpeechRecognition error:", event.error);
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in listening mode (browser can stop after silence)
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          setListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.abort();
    }
    setListening(false);
    // Flush any remaining interim to lines
    setInterim((prev) => {
      if (prev.trim()) {
        setLines((lines) => [...lines, prev.trim()]);
      }
      return "";
    });
  }, []);

  const handleToggle = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening]);

  if (!supported) {
    return (
      <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          Voice transcription is not supported in this browser.
        </p>
      </div>
    );
  }

  const hasContent = lines.length > 0 || interim.length > 0;

  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={listening ? "destructive" : "outline"}
            className="h-7 text-xs gap-1"
            onClick={handleToggle}
            disabled={disabled}
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
          {listening && (
            <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              Listening…
            </span>
          )}
        </div>
        {hasContent && !listening && (
          <div className="flex items-center gap-1">
            {onParse && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] gap-1"
                onClick={() => onParse(lines.join(" "))}
                disabled={disabled}
              >
                <Terminal className="h-2.5 w-2.5" />
                Parse transcript
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] gap-1 text-muted-foreground"
              onClick={clearTranscript}
            >
              <Trash2 className="h-2.5 w-2.5" />
              Clear
            </Button>
          </div>
        )}
      </div>

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
    </div>
  );
}
