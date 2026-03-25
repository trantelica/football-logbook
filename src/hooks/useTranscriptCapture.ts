/**
 * useTranscriptCapture — Isolated transcript buffer for voice/typed input.
 *
 * This hook manages speech recognition and a typed-fallback transcript buffer.
 * It is intentionally separated from the raw-input pipeline:
 *   - Does NOT call parseRawInput
 *   - Does NOT create candidatePatch
 *   - Does NOT invoke applySystemPatch
 *   - Does NOT affect committed rows or proposal state
 *
 * Transcript lines are held in local React state only.
 */

import { useState, useRef, useCallback, useEffect } from "react";

/* ── Web Speech API types (not in standard TS lib) ── */

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

export interface TranscriptCaptureState {
  /** Finalized transcript lines */
  lines: string[];
  /** In-progress interim text from speech recognition */
  interim: string;
  /** Whether the mic is actively listening */
  listening: boolean;
  /** Whether the Web Speech API is available */
  supported: boolean;
  /** Full transcript as a single string */
  fullText: string;
  /** Whether there is any captured content */
  hasContent: boolean;
  /** Start speech recognition */
  startListening: () => void;
  /** Stop speech recognition */
  stopListening: () => void;
  /** Toggle listening on/off */
  toggleListening: () => void;
  /** Clear all captured transcript lines and interim */
  clear: () => void;
  /** Append a line from typed fallback input */
  appendLine: (text: string) => void;
}

export function useTranscriptCapture(): TranscriptCaptureState {
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Check support on mount
  useEffect(() => {
    if (!getSpeechRecognition()) setSupported(false);
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setInterim("");
  }, []);

  const appendLine = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) setLines((prev) => [...prev, trimmed]);
  }, []);

  const startListening = useCallback(() => {
    // Guard: prevent duplicate sessions
    if (recognitionRef.current) return;

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
      if (interimText) setInterim(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("[TranscriptCapture] SpeechRecognition error:", event.error);
      if (event.error === "not-allowed") {
        // Mic permission denied — degrade gracefully to typed-only
        recognitionRef.current = null;
        setListening(false);
        setSupported(false);
        return;
      }
      if (event.error !== "no-speech" && event.error !== "aborted") {
        recognitionRef.current = null;
        setListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still in listening mode
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          recognitionRef.current = null;
          setListening(false);
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() can throw if permissions blocked synchronously
      recognitionRef.current = null;
      setListening(false);
      setSupported(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.abort();
    }
    setListening(false);
    // Flush remaining interim to lines
    setInterim((prev) => {
      if (prev.trim()) {
        setLines((l) => [...l, prev.trim()]);
      }
      return "";
    });
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  const fullText = lines.join(" ");
  const hasContent = lines.length > 0 || interim.length > 0;

  return {
    lines,
    interim,
    listening,
    supported,
    fullText,
    hasContent,
    startListening,
    stopListening,
    toggleListening,
    clear,
    appendLine,
  };
}
