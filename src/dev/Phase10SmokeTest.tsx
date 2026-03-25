/**
 * Dev-only Phase 10 smoke test harness.
 * Renders nothing in production builds.
 */
import React, { useState, useCallback, useRef } from "react";
import { isDevMode } from "@/engine/devMode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTransaction } from "@/engine/transaction";
import { toast } from "sonner";
import { FlaskConical, CheckCircle2, XCircle } from "lucide-react";

interface TestResult {
  ok: boolean;
  name: string;
  detail?: string;
}

async function nextTick() {
  await new Promise((r) => setTimeout(r, 0));
}

export function Phase10SmokeTest() {
  const txn = useTransaction();
  const txnRef = useRef(txn);
  txnRef.current = txn;

  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const snapshot = () => {
    const t = txnRef.current;
    return JSON.stringify({
      selectedSlotNum: t.selectedSlotNum,
      activePass: (t as any).activePass ?? null,
      touched: [...t.touchedFields],
      ai: [...t.aiProposedFields],
      lookupInterruptPending: t.lookupInterruptPending,
    });
  };

  const runTests = useCallback(async () => {
    if (txnRef.current.selectedSlotNum === null) return;
    setRunning(true);
    const out: TestResult[] = [];

    const assert = (cond: boolean, name: string) => {
      const entry: TestResult = { ok: cond, name };
      if (!cond) entry.detail = snapshot();
      out.push(entry);
    };

    // A) clearDraft
    txnRef.current.clearDraft();
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
    assert(safeCollisions.length === 0, "B0 safe patch returns no collisions");
    await nextTick();

    assert(txnRef.current.aiProposedFields.has("dn"), "B1 aiProposedFields contains dn");
    assert(txnRef.current.aiProposedFields.has("dist"), "B2 aiProposedFields contains dist");
    assert(txnRef.current.aiProposedFields.has("yardLn"), "B3 aiProposedFields contains yardLn");
    assert(txnRef.current.aiProposedFields.has("rusher"), "B4 aiProposedFields contains rusher");
    assert(txnRef.current.touchedFields.size === 0, "B5 touchedFields still empty");

    // C) Promote AI→touched
    txnRef.current.updateField("dist", "9");
    await nextTick();
    assert(!txnRef.current.aiProposedFields.has("dist"), "C1 dist removed from aiProposedFields");
    assert(txnRef.current.touchedFields.has("dist"), "C2 dist added to touchedFields");

    // D) Collision detection — set dist explicitly then patch over it
    txnRef.current.updateField("dist", "10");
    await nextTick();
    const collisionResult = txnRef.current.applySystemPatch(
      { dist: "7" },
      { fillOnly: true, evidence: { dist: { snippet: "7 yards" } } }
    );
    assert(collisionResult.length > 0, "D1 collision detected for filled field");

    // E) Lookup interrupt
    txnRef.current.applySystemPatch(
      { offForm: "Purple" },
      { evidence: { offForm: { snippet: "formation Purple" } } }
    );
    await nextTick();
    assert(txnRef.current.lookupInterruptPending != null, "E1 lookupInterruptPending is set");
    txnRef.current.clearLookupInterrupt();
    await nextTick();
    assert(txnRef.current.lookupInterruptPending == null, "E2 lookupInterruptPending cleared");

    // F) Union validation blocks bad enum value
    txnRef.current.applySystemPatch({ result: "NotARealEnum" });
    await nextTick();
    txnRef.current.reviewProposal();
    await nextTick();
    const hasErrors = Object.keys(txnRef.current.inlineErrors).length > 0;
    const notProposal = txnRef.current.state !== "proposal";
    assert(hasErrors || notProposal, "F1 bad enum blocks proposal");

    setResults(out);
    setRunning(false);
    setModalOpen(true);

    const passed = out.filter((r) => r.ok).length;
    const total = out.length;
    const summary = { passed, total, results: out };
    console.log("[Phase10SmokeTest]", summary);

    if (passed === total) {
      toast.success(`Phase 10 Smoke Test: ${passed}/${total} PASSED`);
    } else {
      toast.error(`Phase 10 Smoke Test: ${passed}/${total} passed, ${total - passed} FAILED`);
    }
  }, []);

  if (!import.meta.env.DEV) return null;

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
    <>
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
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] w-full text-muted-foreground"
              onClick={() => setModalOpen(true)}
            >
              View Results ({passed}✅ {failed > 0 ? `${failed}❌` : ""})
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-amber-500" />
              Phase 10 Smoke Test Results
            </DialogTitle>
            <DialogDescription className="text-xs">
              {passed}/{results.length} checks passed
              {failed > 0 && ` · ${failed} failed`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 py-1">
                {r.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium">{r.name}</div>
                  {r.detail && (
                    <pre className="text-[10px] text-muted-foreground mt-0.5 whitespace-pre-wrap break-all font-mono bg-muted/50 rounded px-1.5 py-1">
                      {r.detail}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
