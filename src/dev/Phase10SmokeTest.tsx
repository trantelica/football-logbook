/**
 * Dev-only Phase 10 smoke test harness.
 * Renders nothing in production builds.
 */
import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTransaction } from "@/engine/transaction";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";

interface TestResult {
  label: string;
  pass: boolean;
}

export function Phase10SmokeTest() {
  if (!import.meta.env.DEV) return null;

  const {
    selectedSlotNum,
    clearDraft,
    applySystemPatch,
    aiProposedFields,
    touchedFields,
    updateField,
    lookupInterruptPending,
    clearLookupInterrupt,
    inlineErrors,
    reviewProposal,
    state,
  } = useTransaction();

  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);

  const runTests = useCallback(async () => {
    if (selectedSlotNum === null) return;
    setRunning(true);
    const out: TestResult[] = [];

    const assert = (cond: boolean, msg: string) => {
      out.push({ label: msg, pass: cond });
    };

    // A) clearDraft
    clearDraft();
    // Need to wait for state to settle — use microtask
    await new Promise((r) => setTimeout(r, 50));

    // B) Safe AI patch
    const safeCollisions = applySystemPatch(
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
    assert(safeCollisions.length === 0, "B: Safe patch has no collisions");
    await new Promise((r) => setTimeout(r, 50));

    // Check aiProposedFields — read from transaction context
    // Note: we're reading from the closure so we need fresh refs.
    // Since state updates are async in React, we rely on the fact that
    // applySystemPatch calls setState synchronously within the callback.
    // We'll check after a tick.
    assert(aiProposedFields.has("dn"), "B: aiProposedFields has 'dn'");
    assert(aiProposedFields.has("dist"), "B: aiProposedFields has 'dist'");
    assert(aiProposedFields.has("yardLn"), "B: aiProposedFields has 'yardLn'");
    assert(aiProposedFields.has("rusher"), "B: aiProposedFields has 'rusher'");
    assert(touchedFields.size === 0, "B: touchedFields still empty");

    // C) Promote AI→touched
    updateField("dist", "9");
    await new Promise((r) => setTimeout(r, 50));
    assert(!aiProposedFields.has("dist"), "C: 'dist' removed from aiProposedFields");
    assert(touchedFields.has("dist"), "C: 'dist' added to touchedFields");

    // D) Collision detection
    updateField("dist", "10");
    await new Promise((r) => setTimeout(r, 50));
    const collisionResult = applySystemPatch(
      { dist: "7" },
      { fillOnly: true, evidence: { dist: { snippet: "7 yards" } } }
    );
    assert(collisionResult.length > 0, "D: Collision detected for filled field");

    // E) Lookup interrupt
    applySystemPatch(
      { offForm: "Purple" },
      { evidence: { offForm: { snippet: "formation Purple" } } }
    );
    await new Promise((r) => setTimeout(r, 50));
    assert(lookupInterruptPending != null, "E: lookupInterruptPending is set");
    clearLookupInterrupt();
    await new Promise((r) => setTimeout(r, 50));
    assert(lookupInterruptPending == null, "E: lookupInterruptPending cleared");

    // F) Union validation blocks bad proposal
    applySystemPatch({ dn: "BAD" });
    await new Promise((r) => setTimeout(r, 50));
    reviewProposal();
    await new Promise((r) => setTimeout(r, 50));
    const hasErrors = Object.keys(inlineErrors).length > 0;
    const notProposal = state !== "proposal";
    assert(hasErrors || notProposal, "F: Bad value blocks proposal (errors or state not proposal)");

    setResults(out);
    setRunning(false);

    const passed = out.filter((r) => r.pass).length;
    const total = out.length;
    if (passed === total) {
      toast.success(`Phase 10 Smoke Test: ${passed}/${total} PASSED`);
    } else {
      toast.error(`Phase 10 Smoke Test: ${passed}/${total} passed, ${total - passed} FAILED`);
    }
  }, [
    selectedSlotNum, clearDraft, applySystemPatch, aiProposedFields,
    touchedFields, updateField, lookupInterruptPending, clearLookupInterrupt,
    inlineErrors, reviewProposal, state,
  ]);

  if (selectedSlotNum === null) {
    return (
      <Card className="border-dashed border-amber-500/50">
        <CardContent className="py-3 text-xs text-muted-foreground text-center">
          Select a slot first to run Phase 10 smoke test.
        </CardContent>
      </Card>
    );
  }

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
          <div className="space-y-0.5 text-[11px] font-mono max-h-48 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className={r.pass ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                {r.pass ? "✅" : "❌"} {r.label}
              </div>
            ))}
            <div className="pt-1 border-t border-border/50 font-semibold">
              {results.filter((r) => r.pass).length}/{results.length} passed
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
