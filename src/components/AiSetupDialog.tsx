/**
 * AI setup — a guided, three-step way for a coach to register their own AI
 * key and model: pick a provider, get and paste a key, check it.
 *
 * Written for someone who has never seen an "API key". Every step says what
 * to press and where, the check runs a real sample play before anything is
 * saved, and each failure says what to do next in plain words.
 *
 * The key is saved on this device only (see engine/aiSetup.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  cleanKey,
  clearAiSetup,
  getAiSetup,
  guessProviderFromKey,
  listModels,
  maskKey,
  onAiSetupChange,
  pickRecommendedModel,
  saveAiSetup,
  type AiModelOption,
  type AiProvider,
  type AiSetup,
} from "@/engine/aiSetup";
import { checkAiSetup, SAMPLE_PLAY_TEXT } from "@/engine/aiSetupCheck";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "home" | "provider" | "key" | "check";
type RowState = "waiting" | "running" | "ok" | "failed";

interface CheckState {
  key: RowState;
  sample: RowState;
  /** What the AI read from the sample play, shown on success. */
  reading: string;
  /** Plain-language reason and next step, shown on failure. */
  problem: string;
  /** True when the failure can be fixed by choosing another model. */
  modelProblem: boolean;
}

const IDLE_CHECK: CheckState = { key: "waiting", sample: "waiting", reading: "", problem: "", modelProblem: false };

function StepRow({ state, children }: { state: RowState; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
        {state === "running" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {state === "ok" && <Check className="h-4 w-4 text-emerald-600" />}
        {state === "failed" && <X className="h-4 w-4 text-destructive" />}
        {state === "waiting" && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />}
      </span>
      <span className={cn(state === "waiting" && "text-muted-foreground")}>{children}</span>
    </li>
  );
}

export function AiSetupDialog({ open, onOpenChange }: Props) {
  const [saved, setSaved] = useState<AiSetup | null>(() => getAiSetup());
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("home");
  const [provider, setProvider] = useState<AiProvider>("gemini");
  const [keyText, setKeyText] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<AiModelOption[]>([]);
  const [model, setModel] = useState("");
  const [check, setCheck] = useState<CheckState>(IDLE_CHECK);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Guards against a slow check finishing after the coach has moved on.
  const runId = useRef(0);

  useEffect(() => onAiSetupChange(() => setSaved(getAiSetup())), []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setSignedInEmail(session?.user?.email ?? null));
    supabase.auth.getSession().then(({ data: d }) => setSignedInEmail(d.session?.user?.email ?? null)).catch(() => {});
    return () => data.subscription.unsubscribe();
  }, []);

  // Every opening starts from the summary, with no half-typed key left over.
  useEffect(() => {
    if (!open) return;
    runId.current += 1;
    setSaved(getAiSetup());
    setStep("home");
    setKeyText("");
    setShowKey(false);
    setCheck(IDLE_CHECK);
    setConfirmRemove(false);
  }, [open]);

  const info = AI_PROVIDERS[provider];
  const key = cleanKey(keyText);
  const guessed = key ? guessProviderFromKey(key) : null;
  const mismatch = guessed && guessed !== provider ? guessed : null;

  /** Runs the sample play with the given model. */
  const runSample = useCallback(async (p: AiProvider, k: string, m: string, id: number) => {
    setCheck((c) => ({ ...c, key: p === "anthropic" ? "running" : "ok", sample: "running", problem: "", modelProblem: false, reading: "" }));
    const res = await checkAiSetup({ provider: p, apiKey: k, model: m });
    if (runId.current !== id) return;
    // Compared with === because this project compiles without strict null
    // checks, where a bare truthiness test does not narrow the result type.
    if (res.ok === true) {
      setCheck({ key: "ok", sample: "ok", reading: res.reading, problem: "", modelProblem: false });
      return;
    }
    // Claude's key is only proven by the sample itself.
    const keyState: RowState =
      res.reason === "key" ? "failed" : p !== "anthropic" || res.reason === "model" || res.reason === "credit" ? "ok" : "waiting";
    setCheck({
      key: keyState,
      sample: res.reason === "key" ? "waiting" : "failed",
      reading: "",
      problem: res.message,
      modelProblem: res.reason === "model",
    });
  }, []);

  /** Full check: is the key accepted, then can the model read a sample play. */
  const runCheck = useCallback(async (p: AiProvider, k: string, preferredModel?: string) => {
    const id = ++runId.current;
    setStep("check");
    setCheck({ ...IDLE_CHECK, key: "running" });
    const list = await listModels(p, k);
    if (runId.current !== id) return;
    if (list.ok === false) {
      setCheck({ ...IDLE_CHECK, key: "failed", problem: list.message });
      return;
    }
    setModels(list.models);
    const chosen =
      preferredModel && list.models.some((m) => m.id === preferredModel)
        ? preferredModel
        : pickRecommendedModel(p, list.models) ?? list.models[0].id;
    setModel(chosen);
    await runSample(p, k, chosen, id);
  }, [runSample]);

  const changeModel = (m: string) => {
    setModel(m);
    const id = ++runId.current;
    void runSample(provider, key, m, id);
  };

  const finish = () => {
    if (!saveAiSetup({ provider, apiKey: key, model })) {
      toast.error("This browser would not save the key. Turn off private browsing and try again.");
      return;
    }
    setKeyText("");
    setStep("home");
    toast.success(`AI assist is set up with ${info.label}`);
  };

  const recheckSaved = () => {
    if (!saved) return;
    setProvider(saved.provider);
    setKeyText(saved.apiKey);
    void runCheck(saved.provider, saved.apiKey, saved.model);
  };

  const remove = () => {
    clearAiSetup();
    setConfirmRemove(false);
    toast.success("Key removed from this device");
  };

  const checking = check.key === "running" || check.sample === "running";
  const passed = check.key === "ok" && check.sample === "ok";
  const recommended = pickRecommendedModel(provider, models);
  const stepNumber = step === "provider" ? 1 : step === "key" ? 2 : 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">AI setup</DialogTitle>
          <DialogDescription className="text-xs">
            {step === "home"
              ? "AI assist fills in play details, personnel and grades from what you say."
              : `Step ${stepNumber} of 3`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Summary ───────────────────────────────────────────────── */}
        {step === "home" && saved && (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-600/40 bg-emerald-600/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Check className="h-4 w-4 text-emerald-600" aria-hidden />
                AI assist is using your {AI_PROVIDERS[saved.provider].label} key
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <dt>Model</dt>
                <dd className="truncate">{saved.model}</dd>
                <dt>Key</dt>
                <dd>{maskKey(saved.apiKey)}</dd>
                <dt>Dictation</dt>
                <dd>
                  {AI_PROVIDERS[saved.provider].dictation
                    ? "Football-aware, on this key"
                    : signedInEmail
                      ? "Football-aware, on built-in AI"
                      : "Browser dictation (Claude cannot transcribe audio)"}
                </dd>
              </dl>
            </div>
            {confirmRemove ? (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p>Remove the key from this device? AI assist will stop until you set it up again or sign in.</p>
                <div className="flex gap-2">
                  <Button variant="destructive" className="flex-1" onClick={remove}>Remove key</Button>
                  <Button variant="outline" className="flex-1" onClick={() => setConfirmRemove(false)}>Keep it</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button className="flex-1" onClick={recheckSaved}>Check it now</Button>
                <Button variant="outline" className="flex-1" onClick={() => { setProvider(saved.provider); setStep("provider"); }}>
                  Change
                </Button>
                <Button variant="ghost" onClick={() => setConfirmRemove(true)}>Remove</Button>
              </div>
            )}
          </div>
        )}

        {step === "home" && !saved && (
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-sm">
              {signedInEmail ? (
                <>
                  <div className="font-medium">AI assist is using the built-in AI</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You are signed in as {signedInEmail}. You can keep using it, or switch to your own AI account below.
                  </p>
                </>
              ) : (
                <>
                  <div className="font-medium">AI assist is off on this device</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Everything else works without it. To turn it on, connect an AI account of your own.
                  </p>
                </>
              )}
            </div>
            <p className="text-sm">
              You will need a <strong>key</strong>: a long password from an AI company that lets this app use your
              account. Getting one takes about two minutes, and this screen walks you through it.
            </p>
            <Button className="w-full" onClick={() => setStep("provider")}>Set up my key</Button>
          </div>
        )}

        {/* ── Step 1: provider ──────────────────────────────────────── */}
        {step === "provider" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Which AI do you want to use?</p>
            <div role="radiogroup" aria-label="AI provider" className="space-y-2">
              {AI_PROVIDER_ORDER.map((id) => {
                const p = AI_PROVIDERS[id];
                const selected = id === provider;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setProvider(id)}
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span>{p.label}</span>
                      {id === "gemini" && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Good first choice
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.blurb}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Covers AI assist{p.dictation ? " and football-aware dictation." : ". Dictation uses your browser's own."}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Not sure? Pick Google Gemini. You can change it later.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("home")}>Back</Button>
              <Button className="flex-1" onClick={() => setStep("key")}>Next</Button>
            </div>
          </div>
        )}

        {/* ── Step 2: key ───────────────────────────────────────────── */}
        {step === "key" && (
          <form
            className="space-y-3"
            onSubmit={(e) => { e.preventDefault(); if (key) void runCheck(provider, key); }}
          >
            <p className="text-sm font-medium">Get your {info.label} key</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {info.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <Button asChild variant="outline" className="w-full">
              <a href={info.keyPageUrl} target="_blank" rel="noopener noreferrer">
                Open {info.keyPageName.replace(/^the /, "")} <ExternalLink className="ml-2 h-3.5 w-3.5" aria-hidden />
              </a>
            </Button>
            <div className="space-y-1.5">
              <label htmlFor="ai-key" className="text-sm font-medium">Paste your key here</label>
              <div className="flex gap-2">
                <Input
                  id="ai-key"
                  type={showKey ? "text" : "password"}
                  value={keyText}
                  onChange={(e) => setKeyText(e.target.value)}
                  placeholder={`Starts with ${info.keyPrefix}…`}
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showKey ? "Hide key" : "Show key"}
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {mismatch && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
                  <span>This looks like a {AI_PROVIDERS[mismatch].label} key.</span>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setProvider(mismatch)}>
                    Switch to {AI_PROVIDERS[mismatch].label}
                  </Button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Your key is saved only in this browser on this device. When you use AI it is sent to {info.company} through
              this app's AI service, which does not keep it. It is never included in backups or exports. Treat it like a
              password.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("provider")}>Back</Button>
              <Button type="submit" className="flex-1" disabled={!key}>Check my key</Button>
            </div>
          </form>
        )}

        {/* ── Step 3: check ─────────────────────────────────────────── */}
        {step === "check" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Checking your {info.label} key</p>
            <ul className="space-y-2" aria-live="polite">
              <StepRow state={check.key}>
                {check.key === "ok"
                  ? `${info.company} accepted the key`
                  : check.key === "failed"
                    ? `Could not confirm the key with ${info.company}`
                    : `Asking ${info.company} to accept the key`}
              </StepRow>
              <StepRow state={check.sample}>
                {check.sample === "ok"
                  ? "Read a sample play"
                  : check.sample === "failed"
                    ? "Could not read a sample play"
                    : check.sample === "running"
                      ? "Reading a sample play"
                      : "Read a sample play"}
                {check.sample === "ok" && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    “{SAMPLE_PLAY_TEXT}” → {check.reading}
                  </span>
                )}
              </StepRow>
            </ul>

            {check.problem && (
              <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                {check.problem}
              </div>
            )}

            {models.length > 0 && (passed || check.modelProblem) && (
              <div className="space-y-1.5">
                <label htmlFor="ai-model" className="text-sm font-medium">Model</label>
                <select
                  id="ai-model"
                  value={model}
                  disabled={checking}
                  onChange={(e) => changeModel(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}{m.id === recommended ? " (recommended)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  The recommended model is the fast, low-cost one. That suits AI assist, which runs once per play. You
                  can leave this alone.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" disabled={checking} onClick={() => { runId.current += 1; setStep("key"); }}>
                Back
              </Button>
              {passed ? (
                <Button className="flex-1" onClick={finish}>Save and finish</Button>
              ) : (
                <Button className="flex-1" disabled={checking} onClick={() => void runCheck(provider, key, model || undefined)}>
                  {checking ? "Checking…" : "Check again"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
