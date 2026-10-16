/**
 * Roster Assist — deterministic name → jersey suggestions for Pass 1
 * Play Result actor fields (rusher, passer, receiver).
 *
 * Guarantees: suggestions come only from the season roster; never invents;
 * only proposes for empty, untouched actor fields; a role is assigned only
 * when a cue word (e.g. "run by", "pass from", "caught by") sits just before
 * the name. Output is reviewed by the coach — never applied silently.
 */
import { isBoundedSttMatch } from "./sttEditDistance";

export type ActorField = "rusher" | "passer" | "receiver";

export interface RosterAssistOption {
  field: ActorField;
  jerseyNumber: number;
  playerName: string;
  signal: "exact" | "stt_edit";
  cue: string;
}

const CUES: Record<ActorField, readonly string[]> = {
  rusher: ["run", "ran", "runs", "carry", "carried", "carries", "rush", "rushed", "rusher", "keeper", "handoff"],
  passer: ["pass", "passed", "throw", "threw", "throws", "passer", "from", "qb"],
  receiver: ["to", "caught", "catch", "catches", "receiver", "target", "targeted", "complete", "completed"],
};
const WINDOW = 3;

function tokens(s: string): string[] {
  return (s ?? "").toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
}

export function collectRosterAssist(input: {
  text: string;
  roster: ReadonlyArray<{ jerseyNumber: number; playerName: string }>;
  blockedFields?: ReadonlySet<string>;
}): RosterAssistOption[] {
  const toks = tokens(input.text);
  if (toks.length === 0 || input.roster.length === 0) return [];
  const blocked = input.blockedFields ?? new Set<string>();
  const out: RosterAssistOption[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.length < 3) continue;
    // Which role does a nearby preceding cue imply? Closest cue wins.
    let role: ActorField | null = null;
    for (let j = i - 1; j >= Math.max(0, i - WINDOW) && !role; j--) {
      for (const f of Object.keys(CUES) as ActorField[]) {
        if (CUES[f].includes(toks[j])) { role = f; break; }
      }
    }
    if (!role || blocked.has(role)) continue;
    for (const p of input.roster) {
      const nameToks = tokens(p.playerName).filter((n) => n.length >= 3);
      let signal: "exact" | "stt_edit" | null = null;
      if (nameToks.includes(t)) signal = "exact";
      else if (nameToks.some((n) => isBoundedSttMatch(t, n))) signal = "stt_edit";
      if (!signal) continue;
      const key = `${role}:${p.jerseyNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ field: role, jerseyNumber: p.jerseyNumber, playerName: p.playerName, signal, cue: t });
    }
  }
  // exact before sounds-like, cap 4 per field
  out.sort((a, b) => (a.signal === b.signal ? 0 : a.signal === "exact" ? -1 : 1));
  const perField: Record<string, number> = {};
  return out.filter((o) => (perField[o.field] = (perField[o.field] ?? 0) + 1) <= 4);
}
