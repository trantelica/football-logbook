/**
 * useTranscriptCapture — Editable transcript buffer for voice/typed input.
 *
 * This hook manages speech recognition and a typed-fallback transcript buffer.
 * It is intentionally separated from the raw-input pipeline:
 *   - Does NOT call parseRawInput
 *   - Does NOT create candidatePatch
 *   - Does NOT invoke applySystemPatch
 *   - Does NOT affect committed rows or proposal state
 *
 * The transcript is an editable working draft. Parsing is triggered
 * explicitly via a separate Parse action (not managed here).
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
  /** The editable working transcript text */
  text: string;
  /** In-progress interim text from speech recognition */
  interim: string;
  /** Whether the mic is actively listening */
  listening: boolean;
  /** Whether the Web Speech API is available */
  supported: boolean;
  /** Whether there is any captured content */
  hasContent: boolean;
  /** Update the working transcript text (editable) */
  setText: (text: string) => void;
  /** Append text (from speech finalization or typed submit) */
  appendText: (addition: string) => void;
  /** Start speech recognition */
  startListening: () => void;
  /** Stop speech recognition */
  stopListening: () => void;
  /** Toggle listening on/off */
  toggleListening: () => void;
  /** Clear all captured transcript */
  clear: () => void;
}

export function useTranscriptCapture(): TranscriptCaptureState {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Check support on mount
  useEffect(() => {
    if (!getSpeechRecognition()) setSupported(false);
  }, []);

  const clear = useCallback(() => {
    setText("");
    setInterim("");
  }, []);

  const appendText = useCallback((addition: string) => {
    const trimmed = addition.trim();
    if (!trimmed) return;
    setText((prev) => {
      if (!prev.trim()) return trimmed;
      return prev.trimEnd() + "\n" + trimmed;
    });
  }, []);

  const startListening = useCallback(() => {
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
          const trimmed = transcript.trim();
          if (trimmed) {
            setText((prev) => {
              if (!prev.trim()) return trimmed;
              return prev.trimEnd() + "\n" + trimmed;
            });
          }
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
    // Flush remaining interim to text
    setInterim((prev) => {
      if (prev.trim()) {
        setText((t) => {
          if (!t.trim()) return prev.trim();
          return t.trimEnd() + "\n" + prev.trim();
        });
      }
      return "";
    });
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  const hasContent = text.trim().length > 0 || interim.length > 0;

  return {
    text,
    interim,
    listening,
    supported,
    hasContent,
    setText,
    appendText,
    startListening,
    stopListening,
    toggleListening,
    clear,
  };
}
