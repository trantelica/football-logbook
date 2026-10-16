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
import { getSttVocabulary } from "@/engine/sttVocabulary";
import { isEnhancedDictationEnabled, transcribeClip } from "@/engine/transcribeClient";

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
  /** Stop speech recognition. Pass { discardInterim: true } to skip flushing
   *  interim into text — used when the caller has already snapshotted the
   *  in-flight interim and is about to switch the recording target. */
  stopListening: (opts?: { discardInterim?: boolean }) => void;
  /** Toggle listening on/off */
  toggleListening: () => void;
  /** Clear all captured transcript */
  clear: () => void;
  /** True while the enhanced transcription is refining the last utterance */
  enhancing: boolean;
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
    sessionRef.current++;
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

  // ── Enhanced transcription: record the utterance in parallel and, on stop,
  // replace this session's browser text with the football-aware service text.
  const textRef = useRef("");
  useEffect(() => { textRef.current = text; }, [text]);
  const recorderRef = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; prefix: string } | null>(null);
  const sessionRef = useRef(0);
  const [enhancing, setEnhancing] = useState(false);

  const startRecorder = useCallback(async () => {
    if (!isEnhancedDictationEnabled() || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    const session = ++sessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (session !== sessionRef.current || !recognitionRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      const rec = new MediaRecorder(stream);
      const entry = { rec, stream, chunks: [] as Blob[], prefix: textRef.current };
      rec.ondataavailable = (e) => { if (e.data.size) entry.chunks.push(e.data); };
      rec.start();
      recorderRef.current = entry;
    } catch (e) {
      console.warn("[TranscriptCapture] recorder unavailable", e);
    }
  }, []);

  const stopRecorder = useCallback((apply: boolean) => {
    sessionRef.current++;
    const entry = recorderRef.current;
    recorderRef.current = null;
    if (!entry) return;
    const session = sessionRef.current;
    entry.rec.onstop = async () => {
      entry.stream.getTracks().forEach((t) => t.stop());
      if (!apply || !entry.chunks.length) return;
      const blob = new Blob(entry.chunks, { type: entry.rec.mimeType || "audio/webm" });
      setEnhancing(true);
      const result = await transcribeClip(blob, getSttVocabulary());
      setEnhancing(false);
      if (session !== sessionRef.current || !result) return;
      const prefix = entry.prefix;
      setText((cur) => {
        // Only replace if the coach hasn't edited the earlier text meanwhile.
        if (!cur.startsWith(prefix)) return cur;
        return prefix.trim() ? prefix.trimEnd() + "\n" + result : result;
      });
    };
    try { entry.rec.stop(); } catch { entry.stream.getTracks().forEach((t) => t.stop()); }
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
      void startRecorder();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setSupported(false);
    }
  }, [startRecorder]);

  const stopListening = useCallback((opts?: { discardInterim?: boolean }) => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      // Detach ALL handlers BEFORE abort so any in-flight result/end/error
      // callback that fires during teardown can't append stale text into the
      // hook's state (which would then leak into the next dictation target).
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try { recognition.abort(); } catch { /* ignore */ }
    }
    setListening(false);
    stopRecorder(!opts?.discardInterim);
    if (opts?.discardInterim) {
      setInterim("");
      return;
    }
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
  }, [stopRecorder]);

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
    enhancing,
  };
}
