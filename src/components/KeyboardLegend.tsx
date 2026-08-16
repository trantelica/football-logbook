/**
 * KeyboardLegend — the Pass 1 shortcut map.
 *
 * Replaces a single run-on line:
 *
 *   Shortcuts: S D R dictate · U update · C clear · F finish · N commit & next
 *              · L commit & leave
 *
 * Two problems with that. "S D R dictate" collapsed three keys onto one label,
 * so it never said which key opened which section — the one thing a coach needs
 * while learning. And commit keys sat in the same undifferentiated run as
 * clear, giving no signal that N and L write data while U and F do not.
 *
 * Now: the three dictate keys are shown inline with the section each one opens
 * (sourced from SECTIONS so they cannot drift), and the full map lives in a
 * popover grouped by what the key actually does — capture, review, or write.
 *
 * The legend is for learning, not for use. A coach mid-film drives this by
 * muscle memory with their eyes on the video, so the inline part stays to one
 * quiet line and the rest is one click away.
 */

import { Keyboard } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SECTIONS } from "@/engine/sectionOwnership";

interface KeyRow {
  key: string;
  label: string;
  hint?: string;
}

interface KeyGroup {
  heading: string;
  note?: string;
  rows: KeyRow[];
}

/** Dictate keys come from SECTIONS so the legend matches the real bindings. */
const DICTATE_ROWS: KeyRow[] = SECTIONS.map((s) => ({
  key: s.dictateKey,
  label: s.title,
}));

const KEY_GROUPS: KeyGroup[] = [
  {
    heading: "Capture",
    note: "Press again to stop. Switching sections saves the current one first.",
    rows: DICTATE_ROWS,
  },
  {
    heading: "Review",
    note: "Nothing is written yet.",
    rows: [
      { key: "U", label: "Update proposal", hint: "Parse what you dictated" },
      { key: "F", label: "Finish entry", hint: "Assemble all sections for review" },
      { key: "C", label: "Clear section", hint: "Discards the active section's text" },
    ],
  },
  {
    heading: "Commit",
    note: "These write the play. Nothing else does.",
    rows: [
      { key: "N", label: "Commit & next", hint: "Save, then open the next slot" },
      { key: "L", label: "Commit & leave", hint: "Save, then close the slot" },
    ],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function KeyboardLegend({ textEditing }: { textEditing: boolean }) {
  if (textEditing) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Keyboard className="h-3 w-3" />
        <span>
          Text Editing on — type freely. Shortcuts are off. <Key>Esc</Key> to exit.
        </span>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard className="h-3 w-3" />
          <span className="flex items-center gap-2">
            {DICTATE_ROWS.map((r) => (
              <span key={r.key} className="flex items-center gap-1">
                <Key>{r.key}</Key>
                {r.label}
              </span>
            ))}
          </span>
          <span className="text-muted-foreground/60">· all keys</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[320px] p-0">
        <div className="border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold leading-none">Keyboard</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Single keys, no modifiers. Inactive while a dialog is open or Text Editing is on.
          </p>
        </div>

        <div className="space-y-4 px-4 py-3">
          {KEY_GROUPS.map((group) => (
            <section key={group.heading}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.heading}
              </h3>
              <ul className="space-y-1">
                {group.rows.map((row) => (
                  <li key={row.key} className="flex items-baseline gap-2 text-xs">
                    <Key>{row.key}</Key>
                    <span className="font-medium">{row.label}</span>
                    {row.hint && (
                      <span className="ml-auto text-right text-[10px] text-muted-foreground">
                        {row.hint}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {group.note && (
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  {group.note}
                </p>
              )}
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
