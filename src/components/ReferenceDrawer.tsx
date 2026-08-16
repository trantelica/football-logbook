/**
 * ReferenceDrawer — season reference data, on demand.
 *
 * Lookup vocabulary and roster are reference material: consulted when something
 * is missing or wrong, not on every play. They previously sat in the main
 * scrolling column between the work surface and the plays table, taking
 * permanent vertical space for occasional use.
 *
 * The UX spec (§19) also asks that maintenance be visually separate from
 * logging. A drawer does that structurally — you are either logging or you are
 * maintaining reference data, and the surface makes clear which.
 *
 * The panels themselves are unchanged; only where they live has moved.
 */

import { useState } from "react";
import { Library } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LookupPanel } from "./LookupPanel";
import { RosterPanel } from "./RosterPanel";
import { useSeason } from "@/engine/seasonContext";

export function ReferenceDrawer() {
  const { activeSeason } = useSeason();
  const [open, setOpen] = useState(false);

  if (!activeSeason) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Library className="h-3.5 w-3.5" />
          Reference
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[440px] max-w-[92vw] overflow-y-auto sm:max-w-[440px]">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-sm">Season Reference</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Vocabulary and roster for {activeSeason.label}. Changes here apply to the
            season, not to plays already committed.
          </p>
        </SheetHeader>

        <div className="space-y-3">
          <LookupPanel />
          <RosterPanel />
        </div>
      </SheetContent>
    </Sheet>
  );
}
