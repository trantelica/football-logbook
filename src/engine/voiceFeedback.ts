/**
 * Football Engine — Spoken Feedback
 *
 * The coach dictates with their eyes on the film. Every confirmation this app
 * gives visually — mic armed, proposal updated, play committed, validation
 * blocked — costs a glance away from the video, which is exactly what the
 * voice-first design exists to prevent.
 *
 * This module closes that loop: the app reports state back over audio.
 *
 * Design rules:
 *
 *  1. ADVISORY ONLY. Speech never mutates a proposal, never commits, never
 *     acknowledges on the coach's behalf. It reports what already happened.
 *  2. NEVER SPEAK INTO A LIVE MIC. Browser speech recognition will happily
 *     transcribe our own synthesis, which would inject phantom narration into
 *     the transcript buffer. `speak()` refuses while the mic is listening.
 *  3. TERSE. A coach mid-film wants "committed, thirteen", not a sentence.
 *  4. INTERRUPTIBLE. A newer announcement always cancels an older one; stale
 *     state must never be narrated over current state.
 *
 * Announcement *selection* and *phrasing* are pure functions so they can be
 * tested without a speech engine. Only `speak()` touches the platform.
 */

import type { AudioFeedbackLevel } from "./preferences";

/**
 * Moments the app can announce.
 *
 * `critical` events are the ones a coach cannot afford to miss: something was
 * written, or something needs a decision. Everything else is flow narration
 * that only the "full" level speaks.
 */
export type VoiceEventKind =
  | "dictationStopped"
  | "proposalUpdated"
  | "committed"
  | "blocked"
  | "lookupInterrupt"
  | "overwriteReview";

const CRITICAL_KINDS: ReadonlySet<VoiceEventKind> = new Set<VoiceEventKind>([
  "committed",
  "blocked",
  "lookupInterrupt",
  "overwriteReview",
]);

export type VoiceEvent =
  | { kind: "dictationStopped"; sectionTitle: string }
  | { kind: "proposalUpdated"; resolvedCount: number; unresolvedCount: number }
  | { kind: "committed"; playNumber: number; nextPlayNumber?: number }
  | { kind: "blocked"; reasons: string[] }
  | { kind: "lookupInterrupt"; fieldLabel: string; value: string }
  | { kind: "overwriteReview"; fieldCount: number };

/**
 * Whether an event should be spoken at the given verbosity.
 *
 * "off"      → silence.
 * "critical" → only writes and decisions.
 * "full"     → the whole loop, including arming and proposal updates.
 */
export function shouldAnnounce(kind: VoiceEventKind, level: AudioFeedbackLevel): boolean {
  if (level === "off") return false;
  if (level === "full") return true;
  return CRITICAL_KINDS.has(kind);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

/**
 * Phrase an event for speech.
 *
 * Kept deliberately short — this is read aloud while the coach is watching
 * film, so it should land in about a second.
 */
export function buildAnnouncement(event: VoiceEvent): string {
  switch (event.kind) {
    case "dictationStopped":
      return "stopped";

    case "proposalUpdated": {
      if (event.unresolvedCount > 0) {
        return `${plural(event.unresolvedCount, "field", "fields")} still open`;
      }
      if (event.resolvedCount > 0) {
        return "proposal ready";
      }
      return "nothing new";
    }

    case "committed":
      return event.nextPlayNumber === undefined
        ? `committed ${event.playNumber}`
        : `committed ${event.playNumber}, next ${event.nextPlayNumber}`;

    case "blocked": {
      const [first] = event.reasons;
      if (!first) return "blocked";
      const more = event.reasons.length - 1;
      // Only the first reason is spoken. Reading a list aloud takes longer than
      // looking at the screen, which defeats the purpose.
      return more > 0 ? `blocked. ${first}. plus ${more} more` : `blocked. ${first}`;
    }

    case "lookupInterrupt":
      return `unknown ${event.fieldLabel}: ${event.value}`;

    case "overwriteReview":
      return `overwrite review, ${plural(event.fieldCount, "field", "fields")}`;

    default: {
      // Exhaustiveness guard — a new VoiceEvent must add a phrasing above.
      const _never: never = event;
      return String(_never);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Mic transition cues
 *
 * Arming and stopping the mic are the two moments speech cannot cover: the mic
 * is opening or has just been open, so any spoken word risks being transcribed
 * into the coach's narration.
 *
 * They are also the moments that most need confirmation — narrating a whole play
 * into a mic that never armed loses the play. So these use a short tone instead
 * of a word: a burst of sine has no transcribable content, but still tells the
 * coach the mic is live without a glance.
 *
 * Rising = armed. Falling = stopped.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CueKind = "armed" | "stopped";

/** Frequencies chosen to cut through room noise without being shrill. */
const CUE_TONES: Record<CueKind, { from: number; to: number }> = {
  armed: { from: 660, to: 990 },
  stopped: { from: 660, to: 440 },
};

const CUE_DURATION_S = 0.09;

export interface CueEngine {
  available: boolean;
  play(kind: CueKind): void;
}

/**
 * WebAudio cue engine.
 *
 * The AudioContext is created lazily and reused: browsers cap how many can
 * exist, and one per keystroke would exhaust that within a drive.
 */
export function browserCueEngine(): CueEngine {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  let ctx: AudioContext | null = null;

  return {
    available: !!Ctor,
    play(kind: CueKind) {
      if (!Ctor) return;
      try {
        ctx ??= new Ctor();
        // Autoplay policy suspends contexts created before a user gesture.
        if (ctx.state === "suspended") void ctx.resume();

        const { from, to } = CUE_TONES[kind];
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(from, now);
        osc.frequency.linearRampToValueAtTime(to, now + CUE_DURATION_S);

        // Ramp the envelope rather than gating it — an abrupt start or stop
        // produces an audible click.
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.09, now + 0.012);
        gain.gain.linearRampToValueAtTime(0, now + CUE_DURATION_S);

        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + CUE_DURATION_S);
      } catch {
        /* cues are a convenience; never break the logging flow */
      }
    },
  };
}

/** Cues follow the same verbosity setting: silent at "off", audible otherwise. */
export function shouldCue(level: AudioFeedbackLevel): boolean {
  return level !== "off";
}

export interface SpeakOptions {
  level: AudioFeedbackLevel;
  rate: number;
  /**
   * True while speech recognition is capturing. Speaking now would be
   * transcribed as coach narration, so the announcement is dropped.
   */
  micLive: boolean;
}

/** Injectable seam so tests can assert without a real speech engine. */
export interface SpeechEngine {
  cancel(): void;
  speak(text: string, rate: number): void;
  available: boolean;
}

/** The browser's built-in synthesis. No dependency, no network, no cost. */
export function browserSpeechEngine(): SpeechEngine {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  return {
    available: !!synth,
    cancel() {
      try {
        synth?.cancel();
      } catch {
        /* synthesis is best-effort; never break the logging flow */
      }
    },
    speak(text: string, rate: number) {
      if (!synth) return;
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        synth.speak(utterance);
      } catch {
        /* ditto */
      }
    },
  };
}

/**
 * Announce an event, honouring verbosity and the live-mic guard.
 *
 * Returns the spoken text, or null when the event was suppressed — which is
 * what the tests assert against.
 */
export function announce(
  event: VoiceEvent,
  opts: SpeakOptions,
  engine: SpeechEngine,
): string | null {
  if (!engine.available) return null;
  if (opts.micLive) return null;
  if (!shouldAnnounce(event.kind, opts.level)) return null;

  const text = buildAnnouncement(event);
  if (!text) return null;

  // Newest announcement wins; never queue stale state behind current state.
  engine.cancel();
  engine.speak(text, opts.rate);
  return text;
}
