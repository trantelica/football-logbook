/**
 * Defense Roster Assist — deterministic name/jersey → roster suggestions for
 * Pass 4 Playmakers fields (tacklers, interception, cover, PBR, awards).
 *
 * Same guarantees as rosterAssist: roster-only, never invents, only empty
 * untouched fields, coach reviews every suggestion before it lands.
 * A cue word sets the role; the role "sticks" across a short list
 * ("tackle by Reed and Fisher") so several tacklers fill in spoken order.
 */
import { isBoundedSttMatch } from "./sttEditDistance";

export type DefRole = "tackler" | "interceptedBy" | "coverPlayer" | "pbr" | "dawg" | "unsung";
export type DefActorField =
  | "tackler1" | "tackler2" | "tackler3" | "tackler4"
  | "interceptedBy" | "coverPlayer" | "pbr" | "dawg" | "unsung";

export const DEF_ACTOR_FIELDS: readonly DefActorField[] = [
  "tackler1", "tackler2", "tackler3", "tackler4",
  "interceptedBy", "coverPlayer", "pbr", "dawg", "unsung",
];
export const TACKLER_FIELDS = ["tackler1", "tackler2", "tackler3", "tackler4"] as const;

export interface DefRosterAssistOption {
  field: DefActorField;
  jerseyNumber: number;
  playerName: string;
  signal: "exact" | "stt_edit";
  cue: string;
}

const CUES: Record<DefRole, readonly string[]> = {
  tackler: ["tackle", "tackled", "tackles", "tackling", "tackler", "tacklers", "stopped", "stop", "brought", "wrapped", "assist", "assisted"],
  interceptedBy: ["intercepted", "interception", "picked", "pick", "int", "interceptor", "intercept", "intercepts", "intercepting"],
  coverPlayer: ["covered", "covering", "cover"],
  pbr: ["pbr", "breakup", "broke", "broken", "deflected", "deflection", "knocked", "batted"],
  dawg: ["dawg", "dawgs", "dog"],
  unsung: ["unsung"],
};
/** Words allowed between names without ending the current list. */
const CONNECTORS = new Set(["and", "by", "the", "with", "from", "number", "no", "jersey", "player", "of", "on", "up", "down", "was", "is", "goes", "to", "award", "hero", "a", "an", "for", "made", "makes", "out"]);

function tokens(s: string): string[] {
  return (s ?? "").toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
}

function cueRole(t: string): DefRole | null {
  for (const r of Object.keys(CUES) as DefRole[]) if (CUES[r].includes(t)) return r;
  return null;
}

type Roster = ReadonlyArray<{ jerseyNumber: number; playerName: string }>;

function matchPlayer(t: string, roster: Roster): { p: Roster[number]; signal: "exact" | "stt_edit" } | null {
  if (/^\d{1,2}$/.test(t)) {
    const p = roster.find((r) => r.jerseyNumber === Number(t));
    return p ? { p, signal: "exact" } : null;
  }
  if (t.length < 3) return null;
  let fuzzy: Roster[number] | null = null;
  for (const p of roster) {
    const nameToks = tokens(p.playerName).filter((n) => n.length >= 3);
    if (nameToks.includes(t)) return { p, signal: "exact" };
    if (!fuzzy && nameToks.some((n) => isBoundedSttMatch(t, n))) fuzzy = p;
  }
  return fuzzy ? { p: fuzzy, signal: "stt_edit" } : null;
}

export function collectDefenseRosterAssist(input: {
  text: string;
  roster: Roster;
  /** Fields already filled/touched — never proposed. */
  blockedFields?: ReadonlySet<string>;
}): DefRosterAssistOption[] {
  const toks = tokens(input.text);
  if (toks.length === 0 || input.roster.length === 0) return [];
  const blocked = input.blockedFields ?? new Set<string>();

  // Pass 1: ordered (role, player) hits.
  const hits: Array<{ role: DefRole; p: Roster[number]; signal: "exact" | "stt_edit"; cue: string }> = [];
  let role: DefRole | null = null;
  let cue = "";
  let gap = 0;
  for (const t of toks) {
    const r = cueRole(t);
    if (r) { role = r; cue = t; gap = 0; continue; }
    if (!role) continue;
    const m = matchPlayer(t, input.roster);
    if (m) {
      hits.push({ role, p: m.p, signal: m.signal, cue });
      gap = 0;
      if (role !== "tackler") role = null; // single-player roles end on a name
      continue;
    }
    if (CONNECTORS.has(t)) continue;
    if (++gap > 1) role = null;
  }

  // Pass 2: assign to fields. Tacklers fill empty slots in spoken order.
  const out: DefRosterAssistOption[] = [];
  const freeTacklers = TACKLER_FIELDS.filter((f) => !blocked.has(f));
  const usedTackler = new Set<number>();
  const usedSingle = new Set<string>();
  for (const h of hits) {
    if (h.role === "tackler") {
      if (usedTackler.has(h.p.jerseyNumber)) continue;
      const field = freeTacklers.shift();
      if (!field) continue;
      usedTackler.add(h.p.jerseyNumber);
      out.push({ field, jerseyNumber: h.p.jerseyNumber, playerName: h.p.playerName, signal: h.signal, cue: h.cue });
    } else {
      if (blocked.has(h.role) || usedSingle.has(h.role)) continue;
      usedSingle.add(h.role);
      out.push({ field: h.role, jerseyNumber: h.p.jerseyNumber, playerName: h.p.playerName, signal: h.signal, cue: h.cue });
    }
  }
  return out;
}

/** Defensive commit rules (ODK=D only). Returns field → message. */
export function validateDefenseRules(play: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (play.odk !== "D") return errors;
  const has = (k: string) => play[k] !== null && play[k] !== undefined && play[k] !== "";
  const result = has("result") ? String(play.result) : "";
  if (result.startsWith("Interception") && !has("interceptedBy")) {
    errors.interceptedBy = "Intercepted By is required on an interception";
  }
  if (has("interceptedBy") && result && !result.startsWith("Interception")) {
    errors.interceptedBy = "Intercepted By is set but the result is not an interception";
  }
  const seen = new Map<number, string>();
  let gapAt: string | null = null;
  for (const f of TACKLER_FIELDS) {
    if (!has(f)) { gapAt = gapAt ?? f; continue; }
    if (gapAt) { errors[f] = `Fill ${gapAt.replace("tackler", "Tackler ")} before ${f.replace("tackler", "Tackler ")}`; continue; }
    const n = Number(play[f]);
    if (seen.has(n)) errors[f] = `#${n} is already listed as ${seen.get(n)!.replace("tackler", "Tackler ")}`;
    else seen.set(n, f);
  }
  return errors;
}
