/**
 * Football Engine — Device Preferences
 *
 * Per-device, per-coach interface preferences. These are deliberately NOT part
 * of SeasonConfig:
 *   - SeasonConfig is season-scoped, versioned, and audit-logged. It describes
 *     the game (field size, PAT mode, active fields).
 *   - These preferences describe the *workstation* (how loud, how dark). They
 *     must not create CONFIG_CHANGE audit records, must not bump seasonRevision,
 *     and must not travel inside a season/session export.
 *
 * Storage is localStorage. Absent or malformed values fall back to defaults so
 * a corrupted key can never brick the app shell.
 *
 * Pure helpers here; the React binding lives in engine/preferencesContext.tsx.
 */

/**
 * How much the app speaks back.
 *
 * The coach's eyes are on the film, not the screen. Audio is the only channel
 * that reports state without costing a glance — but it is also intrusive, so
 * the coach chooses the volume of it.
 */
export type AudioFeedbackLevel = "off" | "critical" | "full";

export type ThemeMode = "light" | "dark" | "system";

export interface DevicePreferences {
  /** How much the app speaks back. */
  audioFeedback: AudioFeedbackLevel;
  /** Speech rate multiplier. 1 is the browser default; coaches usually want faster. */
  speechRate: number;
  /** Colour scheme. "system" follows the OS. */
  theme: ThemeMode;
}

export const DEFAULT_PREFERENCES: DevicePreferences = {
  // Ships silent. An app that starts talking unprompted is startling, and the
  // coach may well be sitting in a shared film room. Spoken feedback is the
  // feature that best serves the eyes-on-video workflow, but it is opt-in:
  // enable it in Workspace settings.
  audioFeedback: "off",
  speechRate: 1.25,
  theme: "system",
};

export const PREFERENCES_STORAGE_KEY = "footballEngine.devicePreferences.v1";

const AUDIO_LEVELS: readonly AudioFeedbackLevel[] = ["off", "critical", "full"];
const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];

/** Speech rates outside this range are unusable (inaudible or comically slow). */
export const MIN_SPEECH_RATE = 0.5;
export const MAX_SPEECH_RATE = 2;

function clampRate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PREFERENCES.speechRate;
  }
  return Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, value));
}

/**
 * Coerce arbitrary parsed JSON into a valid DevicePreferences.
 * Every field falls back independently, so one bad key does not discard
 * the coach's other settings.
 */
export function normalizePreferences(raw: unknown): DevicePreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const input = raw as Partial<Record<keyof DevicePreferences, unknown>>;

  const audioFeedback = AUDIO_LEVELS.includes(input.audioFeedback as AudioFeedbackLevel)
    ? (input.audioFeedback as AudioFeedbackLevel)
    : DEFAULT_PREFERENCES.audioFeedback;

  const theme = THEME_MODES.includes(input.theme as ThemeMode)
    ? (input.theme as ThemeMode)
    : DEFAULT_PREFERENCES.theme;

  return {
    audioFeedback,
    theme,
    speechRate: clampRate(input.speechRate),
  };
}

/** Read preferences from localStorage. Never throws. */
export function loadPreferences(storage?: Pick<Storage, "getItem">): DevicePreferences {
  const store = storage ?? safeLocalStorage();
  if (!store) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = store.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Persist preferences. Never throws (private browsing, quota, etc.). */
export function savePreferences(
  prefs: DevicePreferences,
  storage?: Pick<Storage, "setItem">,
): void {
  const store = storage ?? safeLocalStorage();
  if (!store) return;
  try {
    store.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* preferences are a convenience; failing to persist must never break logging */
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
