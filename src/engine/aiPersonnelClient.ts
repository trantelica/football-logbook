/**
 * AI Personnel Client (Pass 2 only).
 *
 * Calls the dedicated `ai-enrich-personnel` edge function as a fallback when
 * the deterministic personnel parser misses or only partially resolves
 * meaningful Pass 2 narration (including surgical edits over filled
 * carry-forward state).
 *
 * Contract:
 *   - Returns ONLY canonical pos* fields with integer jersey values (0..99).
 *   - Defensively normalizes any alias-keyed positions (F → pos3, Z → pos4)
 *     using the configured alias map before returning.
 *   - Drops every other key, non-integer value, or out-of-range jersey.
 *   - Empty / whitespace observation text → no invocation, returns error.
 *
 * Caller is responsible for:
 *   - Routing the patch through `applySystemPatch({ fillOnly: true,
 *     source: "ai_proposed" })` so existing collision/overwrite review,
 *     duplicate validation, and off-roster governance remain authoritative.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  PERSONNEL_POSITIONS,
} from "./personnel";
import {
  normalizePatchKeysToCanonical,
  type PositionAliasMap,
} from "./positionAliases";

const CANONICAL_SET = new Set<string>(PERSONNEL_POSITIONS);

export interface AiPersonnelRosterEntry {
  jersey: number;
  name?: string;
}

export interface FetchAiPersonnelOpts {
  observationText: string;
  /** Snapshot of canonical pos* fields in the active slot (carry-forward + draft). */
  currentPersonnel: Partial<Record<(typeof PERSONNEL_POSITIONS)[number], number | null>>;
  /** Parser's pos* output for the same text (may be empty). */
  deterministicPatch: Record<string, unknown>;
  /** Canonical-field → alias map (e.g. { pos3: "F", pos4: "Z" }). */
  positionAliases?: PositionAliasMap;
  /** Roster context — informational only; off-roster governance still gates commit. */
  roster?: AiPersonnelRosterEntry[];
}

export type AiPersonnelErrorCategory =
  | "bad_request"
  | "auth"
  | "rate_limited"
  | "credits_exhausted"
  | "gateway_error"
  | "model_empty"
  | "server_exception";

export interface FetchAiPersonnelResult {
  patch: Record<string, number>;
  error?: string;
  errorCategory?: AiPersonnelErrorCategory;
}

export async function fetchAiPersonnelProposal(
  opts: FetchAiPersonnelOpts,
): Promise<FetchAiPersonnelResult> {
  const observationText = (opts.observationText ?? "").trim();
  if (!observationText) {
    return { patch: {}, error: "No observation text — AI personnel needs narration", errorCategory: "bad_request" };
  }

  const positionAliases = (opts.positionAliases ?? {}) as PositionAliasMap;

  const { data, error } = await supabase.functions.invoke("ai-enrich-personnel", {
    body: {
      observationText,
      currentPersonnel: opts.currentPersonnel ?? {},
      deterministicPatch: opts.deterministicPatch ?? {},
      positionAliases,
      roster: opts.roster ?? [],
      canonicalFields: PERSONNEL_POSITIONS,
    },
  });

  if (error) {
    console.error("ai-enrich-personnel invocation error:", error);
    // supabase-js wraps non-2xx as error but still includes the body in `data`.
    const detail = (data as { error?: string; errorCategory?: AiPersonnelErrorCategory } | null) ?? null;
    return {
      patch: {},
      error: detail?.error ?? `AI personnel service error: ${error.message ?? "unknown"}`,
      errorCategory: detail?.errorCategory ?? "gateway_error",
    };
  }
  if (data?.error) {
    return { patch: {}, error: data.error, errorCategory: data.errorCategory as AiPersonnelErrorCategory | undefined };
  }

  const rawPatch = (data?.patch ?? {}) as Record<string, unknown>;

  // Defensive: alias-key leakage → canonical pos* keys
  const { patch: normalized } = normalizePatchKeysToCanonical(
    rawPatch,
    positionAliases,
  );

  // Final whitelist: canonical pos* keys with integer jerseys 0..99
  const filtered: Record<string, number> = {};
  for (const [k, v] of Object.entries(normalized)) {
    if (!CANONICAL_SET.has(k)) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n)) continue;
    if (n < 0 || n > 99) continue;
    filtered[k] = n;
  }

  return { patch: filtered };
}
