/**
 * Who pays for an AI request (client half).
 *
 * AI assist can run two ways:
 *   1. The coach's own AI key, registered under AI setup. The key travels with
 *      the request and no sign-in is needed.
 *   2. The built-in AI. It spends the app owner's paid credits and its address
 *      is public, so the AI functions only serve it to signed-in coaches.
 *
 * The server is the real gate. These checks only save a doomed round trip and
 * let the app say why AI assist is unavailable instead of surfacing a generic
 * service error.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { aiRequestConfig, type AiRequestConfig } from "./aiSetup";

export const AI_SIGN_IN_MESSAGE =
  "AI assist is not set up on this device. Open the … menu, then AI setup.";

/**
 * True when a user session exists. If the session cannot be read at all we
 * answer true and let the server decide, so a storage hiccup never blocks a
 * coach who is in fact signed in.
 */
export async function isSignedInForAi(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data?.session;
  } catch {
    return true;
  }
}

export interface AiAccess {
  /** False when there is neither a registered key nor a sign-in. */
  allowed: boolean;
  /** The coach's own key and model to send along, or null for built-in AI. */
  aiConfig: AiRequestConfig | null;
}

/** A registered key wins; otherwise built-in AI, which needs sign-in. */
export async function resolveAiAccess(): Promise<AiAccess> {
  const aiConfig = aiRequestConfig();
  if (aiConfig) return { allowed: true, aiConfig };
  return { allowed: await isSignedInForAi(), aiConfig: null };
}

/**
 * The JSON body of a refused AI request, if it has one. supabase-js reports a
 * non-2xx answer as an error with the response attached and `data` empty, so
 * the function's own plain-language message has to be read from here.
 */
export async function readFunctionError(
  error: unknown,
): Promise<{ error?: string; errorCategory?: string; status: number } | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  const status = error.context?.status ?? 0;
  try {
    const body = (await error.context.json()) as { error?: unknown; errorCategory?: unknown } | null;
    return {
      status,
      error: typeof body?.error === "string" ? body.error : undefined,
      errorCategory: typeof body?.errorCategory === "string" ? body.errorCategory : undefined,
    };
  } catch {
    return { status };
  }
}
