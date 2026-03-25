/**
 * Dev-only Phase 10 smoke test harness.
 * Renders nothing in production builds (unless ?dev=1).
 */
import React, { useState, useCallback, useRef } from "react";
import { isDevMode } from "@/engine/devMode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransaction } from "@/engine/transaction";
import { toast } from "sonner";
import { FlaskConical, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";

interface TestResult {
  ok: boolean;
  id: string;
  message: string;
  snapshot?: Record<string, unknown>;
}

const SNAPSHOT_FIELDS = ["dn", "dist", "yardLn", "rusher", "offForm"] as const;

function captureSnapshot(txn: ReturnType<typeof useTransaction>): Record<string, unknown> {
  const candidate = txn.candidate as Record<string, unknown>;
  const subset: Record<string, unknown> = {};
  for (const f of SNAPSHOT_FIELDS) {
    subset[f] = candidate[f] ?? null;
  }
  return {
    selectedSlotNum: txn.selectedSlotNum,
    activePass: (txn as any).activePass ?? null,
    candidateSubset: subset,
    touched: [...txn.touchedFields],
    ai: [...txn.aiProposedFields],
    lookupInterruptPending: txn.lookupInterruptPending,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(
  txnRef: React.MutableRefObject<ReturnType<typeof useTransaction>>,
  condFn: () => boolean,
  _label: string,
  timeoutMs = 400
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condFn()) return true;
    await sleep(10);
  }
  return false;
}

function FailureDetail({ snapshot }: { snapshot: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-muted-foreground flex items-center gap-0.5 hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        State snapshot
      </button>
      {open && (
        <pre className="text-[10px] text-muted-foreground mt-1 whitespace-pre-wrap break-all font-mono bg-muted/50 rounded px-1.5 py-1 border border-border/50">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function Phase10SmokeTest() {
  const txn = useTransaction();
  const txnRef = useRef(txn);
  txnRef.current = txn;

  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const runTests = useCallback(async () => {
    if (txnRef.current.selectedSlotNum === null) return;
    setRunning(true);
    const out: TestResult[] = [];

    const assert = (cond: boolean, id: string, message: string) => {
      const entry: TestResult = { ok: cond, id, message };
      if (!cond) entry.snapshot = captureSnapshot(txnRef.current);
      out.push(entry);
    };

    // A) clearDraft
    txnRef.current.clearDraftPreservingSelection();
    await nextTick();

    // B) Safe AI patch
    const safeCollisions = txnRef.current.applySystemPatch(
      { dn: "1", dist: "10", yardLn: "-10", rusher: "10" },
      {
        evidence: {
          dn: { snippet: "first down" },
          dist: { snippet: "and 10" },
          yardLn: { snippet: "on our 10" },
          rusher: { snippet: "ball carrier 10" },
        },
      }
    );
    assert(safeCollisions.length === 0, "B0", "Safe patch returns no collisions");
    await nextTick();

    assert(txnRef.current.aiProposedFields.has("dn"), "B1", "aiProposedFields contains dn");
    assert(txnRef.current.aiProposedFields.has("dist"), "B2", "aiProposedFields contains dist");
    assert(txnRef.current.aiProposedFields.has("yardLn"), "B3", "aiProposedFields contains yardLn");
    assert(txnRef.current.aiProposedFields.has("rusher"), "B4", "aiProposedFields contains rusher");
    assert(txnRef.current.touchedFields.size === 0, "B5", "touchedFields still empty after AI patch");

    // C) Promote AI→touched
    txnRef.current.updateField("dist", "9");
    await nextTick();
    assert(!txnRef.current.aiProposedFields.has("dist"), "C1", "dist removed from aiProposedFields after edit");
    assert(txnRef.current.touchedFields.has("dist"), "C2", "dist added to touchedFields after edit");

    // D) Collision detection
    txnRef.current.updateField("dist", "10");
    await nextTick();
    const collisionResult = txnRef.current.applySystemPatch(
      { dist: "7" },
      { fillOnly: true, evidence: { dist: { snippet: "7 yards" } } }
    );
    assert(collisionResult.length > 0, "D1", "Collision detected when patching filled field");

    // E) Lookup interrupt
    txnRef.current.applySystemPatch(
      { offForm: "Purple" },
      { evidence: { offForm: { snippet: "formation Purple" } } }
    );
    await nextTick();
    assert(txnRef.current.lookupInterruptPending != null, "E1", "lookupInterruptPending set for unknown governed value");
    txnRef.current.clearLookupInterrupt();
    await nextTick();
    assert(txnRef.current.lookupInterruptPending == null, "E2", "lookupInterruptPending cleared after dismiss");

    // F) Union validation blocks bad enum
    txnRef.current.applySystemPatch({ result: "NotARealEnum" });
    await nextTick();
    txnRef.current.reviewProposal();
    await nextTick();
    const hasErrors = Object.keys(txnRef.current.inlineErrors).length > 0;
    const notProposal = txnRef.current.state !== "proposal";
    assert(hasErrors || notProposal, "F1", "Bad enum value blocks proposal / produces validation error");

    setResults(out);
    setRunning(false);

    const passed = out.filter((r) => r.ok).length;
    const failed = out.filter((r) => !r.ok);
    const total = out.length;

    console.log("[Phase10SmokeTest]", { passed, total, results: out });
    if (failed.length > 0) {
      console.group("[Phase10SmokeTest] FAILURES");
      failed.forEach((f) => {
        console.error(`❌ ${f.id}: ${f.message}`, f.snapshot ?? "");
      });
      console.groupEnd();
      toast.error(`Smoke Test FAIL (${failed.length} failures) — see details below`, { duration: 8000 });
    } else {
      toast.success(`Smoke Test PASS (${passed}/${total})`);
    }
  }, []);

  if (!isDevMode()) return null;

  if (txnRef.current.selectedSlotNum === null) {
    return (
      <Card className="border-dashed border-amber-500/50">
        <CardContent className="py-3 text-xs text-muted-foreground text-center">
          Select a slot first to run Phase 10 smoke test.
        </CardContent>
      </Card>
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  return (
    <Card className="border-dashed border-amber-500/50">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <FlaskConical className="h-3.5 w-3.5" />
          Phase 10 Smoke Test
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs w-full border-amber-400 dark:border-amber-600"
          onClick={runTests}
          disabled={running}
        >
          {running ? "Running…" : "Run Phase 10 Smoke Test"}
        </Button>

        {results.length > 0 && (
          <div className="space-y-0.5 mt-2">
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              {passed}/{results.length} passed
              {failed > 0 && <span className="text-destructive ml-1">· {failed} failed</span>}
            </div>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-1">
              {results.map((r) => (
                <div key={r.id} className="py-1">
                  <div className="flex items-start gap-1.5">
                    {r.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <span className="text-[11px] font-mono font-semibold mr-1">{r.id}</span>
                      <span className="text-[11px]">{r.message}</span>
                      {!r.ok && r.snapshot && <FailureDetail snapshot={r.snapshot} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
