/**
 * AI setup — the live check.
 *
 * Sends one made-up play through the real AI assist path with the coach's own
 * key and model. Passing proves the whole chain: this app's AI function is
 * current, the provider accepts the key, and the chosen model can fill in
 * fields. Nothing is saved to a game.
 */
import { supabase } from "@/integrations/supabase/client";
import { playSchema } from "./schema";
import { readFunctionError } from "./aiAuth";
import { AI_PROVIDERS, type AiRequestConfig } from "./aiSetup";

export const SAMPLE_PLAY_TEXT = "Run to the left for a gain of four yards.";

export type AiCheckResult =
  | { ok: true; reading: string }
  | {
      ok: false;
      /** "app" = this app's AI function is not current; the key is not at fault. */
      reason: "key" | "credit" | "limit" | "model" | "app" | "network" | "other";
      message: string;
    };

const NOT_UPDATED =
  "This app's AI service has not been updated to use personal keys yet. Nothing is wrong with your key. Try again after the app is updated.";

function describeReading(proposal: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof proposal.result === "string") parts.push(`Result: ${proposal.result}`);
  if (proposal.gainLoss !== undefined && proposal.gainLoss !== null) parts.push(`Gain: ${String(proposal.gainLoss)}`);
  return parts.length ? parts.join(", ") : "Connected";
}

export async function checkAiSetup(config: AiRequestConfig): Promise<AiCheckResult> {
  const company = AI_PROVIDERS[config.provider].company;
  const resultDef = playSchema.find((f) => f.name === "result");

  let data: { proposal?: Record<string, unknown>; aiSource?: string; error?: string } | null;
  let error: unknown;
  try {
    const res = await supabase.functions.invoke("ai-enrich", {
      body: {
        observationText: SAMPLE_PLAY_TEXT,
        deterministicPatch: {},
        candidate: { playNum: 1 },
        unresolvedFields: ["result", "gainLoss"],
        fieldHints: {
          result: { label: "Result", type: "enum", allowedValues: resultDef?.allowedValues ?? [] },
          gainLoss: { label: "Gain/Loss", type: "integer" },
        },
        aiConfig: config,
      },
    });
    data = res.data;
    error = res.error;
  } catch {
    return { ok: false, reason: "network", message: "Could not reach the app's AI service. Check your internet connection and try again." };
  }

  if (error) {
    const detail = await readFunctionError(error);
    if (!detail) {
      return { ok: false, reason: "network", message: "Could not reach the app's AI service. Check your internet connection and try again." };
    }
    switch (detail.errorCategory) {
      case "key_rejected":
        return { ok: false, reason: "key", message: `${company} did not accept that key. Copy it again and make sure you get the whole key.` };
      case "credits_exhausted":
        return { ok: false, reason: "credit", message: `The key works, but the ${company} account has no credit. Add a payment method or credit there, then check again.` };
      case "rate_limited":
        return { ok: false, reason: "limit", message: `${company} says this account is busy or over its limit. Wait a minute and check again.` };
      case "model_unavailable":
      case "model_error":
        return { ok: false, reason: "model", message: `The model “${config.model}” could not read the sample play. Pick a different model below and check again.` };
      // An older copy of the AI function knows nothing about personal keys
      // and answers with its sign-in refusal.
      case "auth":
        return { ok: false, reason: "app", message: NOT_UPDATED };
      default:
        return { ok: false, reason: "other", message: detail.error ?? `${company} had a problem. Try again in a minute.` };
    }
  }

  // An older copy of the AI function ignores the key and answers with the
  // built-in AI. Only an answer marked as coming from the coach's key counts.
  if (data?.aiSource !== "own") return { ok: false, reason: "app", message: NOT_UPDATED };
  if (data.error) return { ok: false, reason: "other", message: data.error };
  return { ok: true, reading: describeReading(data.proposal ?? {}) };
}
