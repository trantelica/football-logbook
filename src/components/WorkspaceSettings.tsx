/**
 * WorkspaceSettings — per-device interface preferences.
 *
 * Deliberately separate from season Config: nothing here is audited, versioned,
 * or exported. These are workstation settings (how loud, how dark), not game
 * data, so changing them must never touch seasonRevision.
 */

import { useState } from "react";
import { Headphones, Monitor, Moon, Sun, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { usePreferences } from "@/engine/preferencesContext";
import { MAX_SPEECH_RATE, MIN_SPEECH_RATE, type AudioFeedbackLevel, type ThemeMode } from "@/engine/preferences";
import { cn } from "@/lib/utils";

const AUDIO_OPTIONS: Array<{
  value: AudioFeedbackLevel;
  label: string;
  hint: string;
}> = [
  { value: "off", label: "Silent", hint: "No spoken feedback." },
  {
    value: "critical",
    label: "Essential",
    hint: "Speaks on commit, validation blocks, and unknown lookup values.",
  },
  {
    value: "full",
    label: "Full",
    hint: "Also speaks when a section arms and when a proposal updates.",
  },
];

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Shared segmented-control button. Keeps both groups visually identical. */
function SegmentButton({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[5px] px-2.5 py-1.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function WorkspaceSettings() {
  const { prefs, setPreference, say, setMicLive, speechSupported } = usePreferences();
  const [open, setOpen] = useState(false);

  const activeAudio = AUDIO_OPTIONS.find((o) => o.value === prefs.audioFeedback);

  // Preview uses a real announcement through the real path, so what the coach
  // hears here is exactly what they will hear mid-game.
  const previewVoice = () => {
    setMicLive(false);
    say({ kind: "committed", playNumber: 12, nextPlayNumber: 13 });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Workspace settings"
        >
          <Headphones className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[300px] p-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold leading-none">Workspace</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved on this device only.
          </p>
        </div>

        <div className="space-y-5 px-4 py-4">
          {/* ── Spoken feedback ── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Spoken feedback
              </label>
              {speechSupported && prefs.audioFeedback !== "off" && (
                <button
                  type="button"
                  onClick={previewVoice}
                  className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <Volume2 className="h-3 w-3" />
                  Preview
                </button>
              )}
            </div>

            <div
              role="radiogroup"
              aria-label="Spoken feedback level"
              className="flex gap-0.5 rounded-md bg-muted p-0.5"
            >
              {AUDIO_OPTIONS.map((opt) => (
                <SegmentButton
                  key={opt.value}
                  selected={prefs.audioFeedback === opt.value}
                  onClick={() => setPreference("audioFeedback", opt.value)}
                >
                  {opt.label}
                </SegmentButton>
              ))}
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {speechSupported
                ? activeAudio?.hint
                : "This browser has no speech engine, so spoken feedback is unavailable."}
            </p>
          </section>

          {/* ── Speech rate — only meaningful when something will be spoken ── */}
          {speechSupported && prefs.audioFeedback !== "off" && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Speech rate
                </label>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {prefs.speechRate.toFixed(2)}×
                </span>
              </div>
              <Slider
                value={[prefs.speechRate]}
                min={MIN_SPEECH_RATE}
                max={MAX_SPEECH_RATE}
                step={0.05}
                onValueChange={([v]) => setPreference("speechRate", v)}
                aria-label="Speech rate"
              />
            </section>
          )}

          {/* ── Appearance ── */}
          <section>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Appearance
            </label>
            <div
              role="radiogroup"
              aria-label="Colour scheme"
              className="flex gap-0.5 rounded-md bg-muted p-0.5"
            >
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <SegmentButton
                  key={value}
                  selected={prefs.theme === value}
                  onClick={() => setPreference("theme", value)}
                  className="flex items-center justify-center gap-1.5"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </SegmentButton>
              ))}
            </div>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
