import React, { useState } from "react";
import { useTransaction } from "@/engine/transaction";
import { useGameContext } from "@/engine/gameContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { downloadDebugJSON, downloadPlaysCSV, copyDebugJSON, downloadNotesCSV } from "@/engine/export";
import { cn } from "@/lib/utils";
import { Download, Clipboard } from "lucide-react";
import { toast } from "sonner";

const STATE_LABELS: Record<string, string> = {
  idle: "No Game",
  candidate: "Draft",
  proposal: "Proposal Review",
  "overwrite-review": "Overwrite Review",
};

export function StatusBar() {
  const { activeGame } = useGameContext();
  const { state, candidate, committedPlays, inlineErrors, commitErrors } =
    useTransaction();

  const errors = { ...inlineErrors, ...commitErrors };
  const errorCount = Object.keys(errors).length;

  // RYG indicator
  const indicator = !activeGame
    ? "bg-muted-foreground"
    : errorCount > 0
      ? "bg-destructive"
      : state === "proposal"
        ? "bg-proposal"
        : state === "candidate"
          ? "bg-candidate"
          : "bg-committed";

  return (
    <footer className="flex items-center gap-3 border-t bg-card px-4 py-1.5 text-xs text-muted-foreground">
      {/* RYG dot */}
      <div className={cn("h-2.5 w-2.5 rounded-full", indicator)} />

      {/* State */}
      <span className="font-medium">{STATE_LABELS[state] ?? state}</span>

      {activeGame && (
        <>
          <span className="text-muted-foreground/60">|</span>
          <span>vs {activeGame.opponent}</span>
          <span className="text-muted-foreground/60">|</span>
          <span>{committedPlays.length} committed</span>

          {candidate.playNum && (
            <>
              <span className="text-muted-foreground/60">|</span>
              <span>Play #{String(candidate.playNum)}</span>
            </>
          )}

          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 text-xs"
              onClick={() => downloadDebugJSON(activeGame.gameId)}
            >
              <Download className="h-3 w-3" />
              JSON
            </Button>
            <CopyDebugButton gameId={activeGame.gameId} />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 text-xs"
              onClick={() => downloadPlaysCSV(activeGame.gameId)}
              disabled={committedPlays.length === 0}
            >
              <Download className="h-3 w-3" />
              CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 text-xs"
              onClick={() => downloadNotesCSV(activeGame.gameId)}
            >
              <Download className="h-3 w-3" />
              Notes
            </Button>
          </div>
        </>
      )}
    </footer>
  );
}

// ── Copy Debug Button with clipboard fallback ──

function CopyDebugButton({ gameId }: { gameId: string }) {
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [jsonContent, setJsonContent] = useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleCopy = async () => {
    try {
      await copyDebugJSON(gameId);
      toast.success("Debug JSON copied to clipboard");
    } catch {
      // Clipboard API failed (iPad) — show fallback modal
      try {
        const { buildDebugExport } = await import("@/engine/db");
        const data = await buildDebugExport(gameId);
        setJsonContent(JSON.stringify(data, null, 2));
        setFallbackOpen(true);
      } catch {
        toast.error("Failed to generate debug export");
      }
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 text-xs"
        onClick={handleCopy}
      >
        <Clipboard className="h-3 w-3" />
        Copy
      </Button>
      <Dialog open={fallbackOpen} onOpenChange={setFallbackOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Debug JSON</DialogTitle>
          </DialogHeader>
          <Textarea
            ref={textareaRef}
            readOnly
            value={jsonContent}
            className="flex-1 min-h-[300px] font-mono text-[10px] leading-tight"
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                textareaRef.current?.select();
              }}
            >
              Select All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFallbackOpen(false)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
