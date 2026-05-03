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
