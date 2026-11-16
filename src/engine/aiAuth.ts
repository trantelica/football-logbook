/**
 * AI sign-in gate (client half).
 *
 * The AI and transcription functions only serve signed-in coaches, because
 * they spend paid credits and their address is public. The server is the real
 * gate; this check only saves a doomed round trip and lets the app say why AI
 * assist is unavailable instead of surfacing a generic service error.
 */
import { supabase } from "@/integrations/supabase/client";

export const AI_SIGN_IN_MESSAGE =
  "Sign in to use AI assist (open the … menu, then Cloud backup).";

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
