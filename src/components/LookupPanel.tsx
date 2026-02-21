import React, { useState } from "react";
import { useLookup } from "@/engine/lookupContext";
import { useSeason } from "@/engine/seasonContext";
import { playSchema } from "@/engine/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { LookupConfirmDialog } from "./LookupConfirmDialog";

/** Only season-governed lookup fields appear in Lookup Management UI */
const LOOKUP_FIELDS = playSchema.filter((f) => f.lookupMode === "season");

export function LookupPanel() {
  const { activeSeason } = useSeason();
  const { lookupTables, addValue, removeValue } = useLookup();
  const [open, setOpen] = useState(false);
  const [addInputs, setAddInputs] = useState<Record<string, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    fieldName: string;
    fieldLabel: string;
    value: string;
  } | null>(null);

  if (!activeSeason) return null;

  const handleStartAdd = (fieldName: string, fieldLabel: string) => {
    const val = addInputs[fieldName]?.trim();
    if (!val) return;
    setConfirmDialog({ fieldName, fieldLabel, value: val });
  };

  const handleRemove = async (fieldName: string, value: string) => {
    try {
      await removeValue(fieldName, value);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove value");
    }
  };

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground h-8">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Lookup Management
            <span className="ml-auto font-mono text-[10px] opacity-60">
              rev {activeSeason.seasonRevision}
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          {LOOKUP_FIELDS.map((fieldDef) => {
            const table = lookupTables.find((t) => t.fieldName === fieldDef.name);
            const values = table?.values ?? [];

            return (
              <div key={fieldDef.name} className="space-y-1.5 rounded border border-border/50 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{fieldDef.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {values.length} value{values.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {values.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/50 italic">No values yet. Type to add.</p>
                )}

                <div className="flex flex-wrap gap-1">
                  {values.map((v) => (
                    <Badge key={v} variant="secondary" className="gap-1 text-xs font-mono">
                      {v}
                      <button
                        onClick={() => handleRemove(fieldDef.name, v)}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-1">
                  <Input
                    className="h-7 text-xs flex-1"
                    placeholder={`Add ${fieldDef.label.toLowerCase()}…`}
                    value={addInputs[fieldDef.name] ?? ""}
                    onChange={(e) =>
                      setAddInputs((prev) => ({ ...prev, [fieldDef.name]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleStartAdd(fieldDef.name, fieldDef.label);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    onClick={() => handleStartAdd(fieldDef.name, fieldDef.label)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      {confirmDialog && (
        <LookupConfirmDialog
          open
          fieldName={confirmDialog.fieldName}
          fieldLabel={confirmDialog.fieldLabel}
          value={confirmDialog.value}
          onConfirm={async (attributes) => {
            const { fieldName, value } = confirmDialog;
            try {
              await addValue(fieldName, value, attributes);
              setAddInputs((prev) => ({ ...prev, [fieldName]: "" }));
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Failed to add value");
            }
            setConfirmDialog(null);
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}
