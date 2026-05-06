import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  RawInputCollisionDialog,
  type Collision,
} from "@/components/RawInputCollisionDialog";

const noop = () => {};

function setup(collisions: Collision[], overrides: Partial<Parameters<typeof RawInputCollisionDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <RawInputCollisionDialog
      open
      collisions={collisions}
      nonCollisionCount={0}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { onConfirm, onCancel };
}

describe("RawInputCollisionDialog — Slice E AI correction display", () => {
  it("renders unchanged when no rows have ai_correction source (legacy behavior)", () => {
    setup([
      { fieldName: "offForm", currentValue: "Red", proposedValue: "Blue" },
    ]);
    expect(screen.getByText("Raw Input Collision Review")).toBeInTheDocument();
    expect(screen.queryByText("AI suggestion")).not.toBeInTheDocument();
    expect(screen.queryByText(/Accepting updates the draft only/i)).not.toBeInTheDocument();
    // Legacy override copy
    expect(screen.getByRole("button", { name: /override/i })).toBeInTheDocument();
  });

  it("AI-only dialog shows new title, subnote, chip, and suggestion button copy", () => {
    setup([
      {
        fieldName: "offForm",
        currentValue: "Pass From Shiny",
        proposedValue: "Shiny",
        source: "ai_correction",
        note: "AI suggests this fits the transcript better.",
      },
      {
        fieldName: "offPlay",
        currentValue: "Reverse",
        proposedValue: "39 Reverse Pass",
        source: "ai_correction",
      },
    ]);
    expect(screen.getByText("Review suggested updates")).toBeInTheDocument();
    expect(
      screen.getByText(/Accepting updates the draft only\. You'll still review and commit\./i)
    ).toBeInTheDocument();
    expect(screen.getAllByText("AI suggestion")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /suggestion\(s\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Skip suggestions/i })).toBeInTheDocument();
    // Note text rendered when present
    expect(screen.getByText(/AI suggests this fits the transcript better/i)).toBeInTheDocument();
  });

  it("mixed dialog shows chip only on AI rows and keeps override-style button copy", () => {
    setup([
      { fieldName: "offForm", currentValue: "Red", proposedValue: "Blue" },
      {
        fieldName: "offPlay",
        currentValue: "Reverse",
        proposedValue: "39 Reverse Pass",
        source: "ai_correction",
      },
    ]);
    // AI subnote + title still appear (because at least one AI row)
    expect(screen.getByText("Review suggested updates")).toBeInTheDocument();
    // Only one chip (one AI row)
    expect(screen.getAllByText("AI suggestion")).toHaveLength(1);
    // Mixed → keep override button copy (NOT suggestion(s))
    expect(screen.getByRole("button", { name: /override/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Skip suggestions/i })).not.toBeInTheDocument();
  });

  it("cancel/skip path invokes onCancel and never onConfirm", () => {
    const { onCancel, onConfirm } = setup([
      {
        fieldName: "offForm",
        currentValue: "Red",
        proposedValue: "Blue",
        source: "ai_correction",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Skip suggestions/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("apply path forwards selected field set to onConfirm only", () => {
    const { onConfirm, onCancel } = setup([
      {
        fieldName: "offForm",
        currentValue: "Red",
        proposedValue: "Blue",
        source: "ai_correction",
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /suggestion\(s\)/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const selected = onConfirm.mock.calls[0][0] as Set<string>;
    expect(selected.has("offForm")).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("RawInputCollisionDialog — Slice F2.a Lookup Assist grouped rows", () => {
  const assistRows: Collision[] = [
    {
      fieldName: "assist::offForm::Invader",
      currentValue: null,
      proposedValue: "Invader",
      source: "lookup_assist",
      groupKey: "offForm",
      signalLabel: "Sounds like",
    },
    {
      fieldName: "assist::offForm::Vader Tight",
      currentValue: null,
      proposedValue: "Vader Tight",
      source: "lookup_assist",
      groupKey: "offForm",
      signalLabel: "Contains",
    },
    {
      fieldName: "assist::offPlay::26 Punch",
      currentValue: null,
      proposedValue: "26 Punch",
      source: "lookup_assist",
      groupKey: "offPlay",
      signalLabel: "Number match",
    },
  ];

  it("renders 'Pick known values' title, signal labels, and starts unselected", () => {
    const { onConfirm } = setup(assistRows);
    expect(screen.getByText("Pick known values")).toBeInTheDocument();
    expect(screen.getByText(/Tap one per group/i)).toBeInTheDocument();
    expect(screen.getByText("Sounds like")).toBeInTheDocument();
    expect(screen.getByText("Contains")).toBeInTheDocument();
    expect(screen.getByText("Number match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply selected \(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Skip$/ })).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("enforces single-select per group: sibling click deselects prior", () => {
    const { onConfirm } = setup(assistRows);
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // Invader
    fireEvent.click(checkboxes[1]); // Vader Tight (same group → deselects Invader)
    fireEvent.click(checkboxes[2]); // 26 Punch (different group → independent)
    fireEvent.click(screen.getByRole("button", { name: /Apply selected \(2\)/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const selected = onConfirm.mock.calls[0][0] as Set<string>;
    expect(selected.has("assist::offForm::Vader Tight")).toBe(true);
    expect(selected.has("assist::offForm::Invader")).toBe(false);
    expect(selected.has("assist::offPlay::26 Punch")).toBe(true);
  });

  it("Skip calls onCancel and never onConfirm", () => {
    const { onCancel, onConfirm } = setup(assistRows);
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("mixed assist + AI rows: AI title wins, AI chip still rendered", () => {
    setup([
      ...assistRows,
      {
        fieldName: "offPlay",
        currentValue: "Reverse",
        proposedValue: "39 Reverse Pass",
        source: "ai_correction",
      },
    ]);
    expect(screen.getByText("Review suggested updates")).toBeInTheDocument();
    expect(screen.getByText("AI suggestion")).toBeInTheDocument();
  });
});

describe("RawInputCollisionDialog — Slice U3 cueText display", () => {
  it("renders 'Heard:' cue text once per assist group", () => {
    setup([
      {
        fieldName: "assist::offForm::Black",
        currentValue: null,
        proposedValue: "Black",
        source: "lookup_assist",
        groupKey: "offForm",
        signalLabel: "Sounds like",
        cueText: "we run 26 from black formation",
      },
      {
        fieldName: "assist::offForm::Blue",
        currentValue: null,
        proposedValue: "Blue",
        source: "lookup_assist",
        groupKey: "offForm",
        signalLabel: "Contains",
        cueText: "we run 26 from black formation",
      },
    ]);
    const cues = screen.getAllByText(/Heard:/);
    expect(cues).toHaveLength(1);
    expect(cues[0].textContent).toContain("we run 26 from black formation");
  });

  it("renders 'From:' cue text on AI correction rows", () => {
    setup([
      {
        fieldName: "offPlay",
        currentValue: "Reverse",
        proposedValue: "39 Reverse Pass",
        source: "ai_correction",
        cueText: "39 reverse pass to the strong side",
      },
    ]);
    expect(screen.getByText(/From:/)).toBeInTheDocument();
    expect(screen.getByText(/39 reverse pass to the strong side/)).toBeInTheDocument();
  });
});
