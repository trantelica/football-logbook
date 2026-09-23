/**
 * KeyboardLegend — the Pass 1 shortcut map.
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
    heading: "Review & Workflow",
    note: "Nothing is written yet.",
    rows: [
      { key: "U", label: "Update proposal", hint: "Parse what you dictated" },
      { key: "F", label: "Finish entry", hint: "Assemble all sections for review" },
      { key: "C", label: "Clear section", hint: "Discards the active section's text" },
      { key: "Alt + 1/2/3", label: "Switch Pass", hint: "Jump to Pass 1, 2, or 3" },
    ],
  },
  {
    heading: "Navigation",
    note: "Active when a play is selected.",
    rows: [
      { key: "↑ / ↓", label: "Move selection", hint: "Navigate the Play Rail" },
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
          title="Keyboard shortcuts"
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
            Single keys, no modifiers unless specified. Inactive while a dialog is open or Text Editing is on.
          </p>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-3">
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
