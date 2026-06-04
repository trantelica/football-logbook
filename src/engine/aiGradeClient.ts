/**
 * AI Grade Client (Pass 3 only).
 *
 * Narrow advisory fallback for Pass 3 blocking grade narration the
 * deterministic grade parser could not fully resolve. Coach-initiated only.
 *
 * Hard contract enforced on the client (defense-in-depth — server also filters):
 *   - Only the 11 canonical grade* fields may appear in the returned patch.
 *   - Values must be integers in [-3, 3].
 *   - Fields already resolved by the deterministic parser are NEVER overwritten:
 *       same value  → dropped silently
 *       diff value  → moved to `conflicts[]` for coach review
 *   - Any other key/value/shape is dropped.
 *
 * Caller is responsible for routing `patch` through
 * `applySystemPatch(patch, { fillOnly: true, source: "ai_proposed" })`
 * so existing validation/overwrite-review/commit flow remains authoritative.
 */

import { supabase } from "@/integrations/supabase/client";
import { GRADE_FIELDS } from "./personnel";
import type { PositionAliasMap } from "./positionAliases";

const GRADE_SET = new Set<string>(GRADE_FIELDS);

export interface AiGradeConflict {
  field: string;
  parserValue: number;
  aiValue: number;
}

export interface FetchAiGradesOpts {
  /** Original coach narration text. */
  narrationText: string;
  /** Deterministic parser patch already applied (canonical grade* keys → number). */
  parserPatch: Record<string, number>;
  /** Unresolved grade fields the AI may propose values for. */
  unresolvedFields: string[];
  /** Canonical-field → alias map (informational for the prompt). */
  positionAliases?: PositionAliasMap;
  /** Optional position labels (canonical grade field → display label) for the prompt. */
  positionLabels?: Record<string, string>;
}

export type AiGradeErrorCategory =
  | "bad_request"
  | "auth"
  | "rate_limited"
  | "credits_exhausted"
  | "gateway_error"
  | "model_empty"
  | "server_exception";

export interface FetchAiGradesResult {
  /** Safe patch of canonical grade fields the caller can apply directly. */
  patch: Record<string, number>;
  /** AI values that disagreed with parser-resolved values — for coach review. */
  conflicts: AiGradeConflict[];
  error?: string;
  errorCategory?: AiGradeErrorCategory;
}

const GRADE_MIN = -3;
const GRADE_MAX = 3;

export async function fetchAiGradeProposal(
  opts: FetchAiGradesOpts,
): Promise<FetchAiGradesResult> {
  const narrationText = (opts.narrationText ?? "").trim();
  if (!narrationText) {
    return {
      patch: {},
      conflicts: [],
      error: "No narration text — AI grade assist needs narration",
      errorCategory: "bad_request",
    };
  }

  const parserPatch = opts.parserPatch ?? {};
  const unresolvedFields = (opts.unresolvedFields ?? []).filter((f) =>
    GRADE_SET.has(f),
  );

  const { data, error } = await supabase.functions.invoke("ai-enrich-grades", {
    body: {
      narrationText,
      parserPatch,
      unresolvedFields,
      positionAliases: opts.positionAliases ?? {},
      positionLabels: opts.positionLabels ?? {},
      gradeRange: { min: GRADE_MIN, max: GRADE_MAX },
      canonicalFields: GRADE_FIELDS,
    },
  });

  if (error) {
    const detail =
      (data as { error?: string; errorCategory?: AiGradeErrorCategory } | null) ?? null;
    return {
      patch: {},
      conflicts: [],
      error: detail?.error ?? `AI grade assist error: ${error.message ?? "unknown"}`,
      errorCategory: detail?.errorCategory ?? "gateway_error",
    };
  }
  if (data?.error) {
    return {
      patch: {},
      conflicts: [],
      error: data.error,
      errorCategory: data.errorCategory as AiGradeErrorCategory | undefined,
    };
  }

  const raw = (data?.patch ?? {}) as Record<string, unknown>;
  const patch: Record<string, number> = {};
  const conflicts: AiGradeConflict[] = [];

  for (const [k, v] of Object.entries(raw)) {
    // Drop non-grade keys.
    if (!GRADE_SET.has(k)) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n)) continue;
    if (n < GRADE_MIN || n > GRADE_MAX) continue;

    // Reconcile with parser-resolved fields. AI never silently overwrites.
    if (Object.prototype.hasOwnProperty.call(parserPatch, k)) {
      const parserVal = Number(parserPatch[k]);
      if (Number.isFinite(parserVal) && parserVal !== n) {
        conflicts.push({ field: k, parserValue: parserVal, aiValue: n });
      }
      // Same value or conflict — never apply over parser.
      continue;
    }

    patch[k] = n;
  }

  return { patch, conflicts };
}
