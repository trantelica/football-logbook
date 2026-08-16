/**
 * Football Engine — Device Preferences Context
 *
 * Binds DevicePreferences to React, applies the colour scheme to <html>, and
 * exposes a single `say()` the whole app uses for spoken feedback.
 *
 * `say()` is intentionally the only speech entry point. Components never touch
 * speechSynthesis directly, so the verbosity setting and the live-mic guard
 * cannot be bypassed by a call site that forgets about them.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type DevicePreferences,
  type ThemeMode,
} from "./preferences";
import {
  announce,
  browserCueEngine,
  browserSpeechEngine,
  shouldCue,
  type CueKind,
  type VoiceEvent,
} from "./voiceFeedback";

interface PreferencesContextValue {
  prefs: DevicePreferences;
  setPreference: <K extends keyof DevicePreferences>(
    key: K,
    value: DevicePreferences[K],
  ) => void;
  /** Announce an event over audio, subject to verbosity and the mic guard. */
  say: (event: VoiceEvent) => void;
  /**
   * Play a mic-transition tone. Unlike `say()` this is safe while the mic is
   * live — a tone carries no transcribable words.
   */
  cue: (kind: CueKind) => void;
  /**
   * Report mic state. While true, `say()` is suppressed so synthesis is never
   * transcribed back into the coach's narration.
   */
  setMicLive: (live: boolean) => void;
  /** Whether this browser can speak at all (drives the settings UI copy). */
  speechSupported: boolean;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function resolveDark(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<DevicePreferences>(() => loadPreferences());
  const engine = useMemo(() => browserSpeechEngine(), []);
  const cues = useMemo(() => browserCueEngine(), []);

  // Ref, not state: the mic flag is read inside `say()` and must reflect the
  // instant it is called. Routing it through a re-render would let an
  // announcement slip out during the gap after the mic opens.
  const micLiveRef = useRef(false);

  // Apply the colour scheme to <html> and follow the OS while on "system".
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => root.classList.toggle("dark", resolveDark(prefs.theme));
    apply();

    if (prefs.theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, [prefs.theme]);

  const setPreference = useCallback(
    <K extends keyof DevicePreferences>(key: K, value: DevicePreferences[K]) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        savePreferences(next);
        return next;
      });
    },
    [],
  );

  const setMicLive = useCallback((live: boolean) => {
    micLiveRef.current = live;
    // Cut off any announcement still in flight as the mic opens, so the tail
    // of it cannot be captured as narration.
    if (live) engine.cancel();
  }, [engine]);

  const say = useCallback(
    (event: VoiceEvent) => {
      announce(
        event,
        {
          level: prefs.audioFeedback,
          rate: prefs.speechRate,
          micLive: micLiveRef.current,
        },
        engine,
      );
    },
    [prefs.audioFeedback, prefs.speechRate, engine],
  );

  const cue = useCallback(
    (kind: CueKind) => {
      if (!shouldCue(prefs.audioFeedback)) return;
      cues.play(kind);
    },
    [prefs.audioFeedback, cues],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({ prefs, setPreference, say, cue, setMicLive, speechSupported: engine.available }),
    [prefs, setPreference, say, cue, setMicLive, engine.available],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

/**
 * Access device preferences and spoken feedback.
 *
 * Falls back to an inert no-op implementation when used outside the provider,
 * so isolated component tests never need the whole provider tree.
 */
export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (ctx) return ctx;
  return {
    prefs: DEFAULT_PREFERENCES,
    setPreference: () => {},
    say: () => {},
    cue: () => {},
    setMicLive: () => {},
    speechSupported: false,
  };
}
