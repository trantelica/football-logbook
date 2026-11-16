/**
 * Client for the football-aware transcription function.
 * Enhanced dictation is on by default; per-device opt-out via localStorage
 * key "hudl.enhancedDictation" = "off". Returns null on any failure so the
 * browser transcript stays in place.
 */
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { isSignedInForAi } from "./aiAuth";

const KEY = "hudl.enhancedDictation";
let paused = false; // set after a credits/permission failure for this session
let signInNoticeShown = false; // one notice per page load, not one per utterance

export function isEnhancedDictationEnabled(): boolean {
  if (paused) return false;
  try {
    if (import.meta.env.MODE === "test") return false;
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return false;
  }
}

export function setEnhancedDictationEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ }
  if (on) paused = false;
}

export async function transcribeClip(blob: Blob, keywords: string[]): Promise<string | null> {
  if (blob.size < 2000) return null;
  // Enhanced dictation needs a signed-in coach. Signed out, keep the browser
  // transcript and say so once rather than uploading audio that will be refused.
  if (!(await isSignedInForAi())) {
    if (!signInNoticeShown) {
      signInNoticeShown = true;
      toast({
        title: "Dictation",
        description: "Using browser dictation. Sign in (… menu, then Cloud backup) for football-aware dictation.",
      });
    }
    return null;
  }
  const form = new FormData();
  form.append("file", new File([blob], "clip.webm", { type: blob.type.replace(/^video\//, "audio/") || "audio/webm" }));
  form.append("keywords", JSON.stringify(keywords));
  const { data, error } = await supabase.functions.invoke("transcribe", { body: form });
  if (error) {
    let msg = "Enhanced dictation unavailable — kept browser transcript.";
    let status = 0;
    if (error instanceof FunctionsHttpError) {
      status = error.context.status;
      try { msg = (await error.context.json())?.error ?? msg; } catch { /* ignore */ }
    }
    if (status === 401 || status === 402 || status === 403) paused = true;
    toast({ title: "Dictation", description: msg });
    return null;
  }
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  return text || null;
}
