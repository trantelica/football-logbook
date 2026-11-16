/**
 * Walks the AI setup screen the way a coach would: pick a provider, paste a
 * key, watch the check, save. Network calls are replaced; storage is real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const listModels = vi.fn();
const checkAiSetup = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));
vi.mock("@/engine/aiSetup", async (orig) => ({
  ...(await orig<typeof import("@/engine/aiSetup")>()),
  listModels: (...a: unknown[]) => listModels(...a),
}));
vi.mock("@/engine/aiSetupCheck", () => ({
  SAMPLE_PLAY_TEXT: "Run to the left for a gain of four yards.",
  checkAiSetup: (...a: unknown[]) => checkAiSetup(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AiSetupDialog } from "@/components/AiSetupDialog";
import { getAiSetup, saveAiSetup } from "@/engine/aiSetup";

const KEY = "AIzaSy-test-key-0123456789";
const MODELS = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

const open = () => render(<AiSetupDialog open onOpenChange={() => {}} />);
const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const paste = (value: string) => fireEvent.change(screen.getByLabelText("Paste your key here"), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  listModels.mockReset();
  checkAiSetup.mockReset();
});

describe("AI setup screen", () => {
  it("guides a first-time coach from nothing to a saved, checked key", async () => {
    listModels.mockResolvedValue({ ok: true, models: MODELS });
    checkAiSetup.mockResolvedValue({ ok: true, reading: "Result: Rush, Gain: 4" });
    open();

    expect(screen.getByText("AI assist is off on this device")).toBeInTheDocument();
    click("Set up my key");

    // Step 1: Gemini is preselected, so "Next" is enough.
    expect(screen.getByRole("radio", { name: /Google Gemini/ })).toHaveAttribute("aria-checked", "true");
    click("Next");

    // Step 2: plain steps, a link to the right page, and nothing to check until a key is pasted.
    expect(screen.getByRole("link", { name: /Open Google AI Studio/ })).toHaveAttribute("href", "https://aistudio.google.com/apikey");
    expect(screen.getByRole("button", { name: "Check my key" })).toBeDisabled();
    paste(`  ${KEY}\n`);
    click("Check my key");

    // Step 3: both checks pass and the fast model is preselected.
    await screen.findByText("Google accepted the key");
    await screen.findByText("Read a sample play");
    expect(screen.getByText(/Result: Rush, Gain: 4/)).toBeInTheDocument();
    expect(listModels).toHaveBeenCalledWith("gemini", KEY);
    expect(checkAiSetup).toHaveBeenCalledWith({ provider: "gemini", apiKey: KEY, model: "gemini-2.5-flash" });
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("gemini-2.5-flash");
    expect(getAiSetup()).toBeNull(); // nothing is saved before the coach says so

    click("Save and finish");
    expect(getAiSetup()).toMatchObject({ provider: "gemini", apiKey: KEY, model: "gemini-2.5-flash" });
    expect(await screen.findByText("AI assist is using your Google Gemini key")).toBeInTheDocument();
    // The key itself is never shown back in full.
    expect(screen.queryByText(KEY)).not.toBeInTheDocument();
    expect(screen.getByText("••••6789")).toBeInTheDocument();
  });

  it("says what to do when the key is rejected, and saves nothing", async () => {
    listModels.mockResolvedValue({ ok: false, reason: "key", message: "Google did not accept that key. Copy it again." });
    open();
    click("Set up my key");
    click("Next");
    paste(KEY);
    click("Check my key");

    expect(await screen.findByRole("alert")).toHaveTextContent("Google did not accept that key");
    expect(checkAiSetup).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save and finish" })).not.toBeInTheDocument();
    expect(getAiSetup()).toBeNull();
  });

  it("offers a different model when the chosen one cannot read the sample", async () => {
    listModels.mockResolvedValue({ ok: true, models: MODELS });
    checkAiSetup
      .mockResolvedValueOnce({ ok: false, reason: "model", message: "Pick a different model below and check again." })
      .mockResolvedValueOnce({ ok: true, reading: "Result: Rush" });
    open();
    click("Set up my key");
    click("Next");
    paste(KEY);
    click("Check my key");

    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gemini-2.5-pro" } });
    await screen.findByText("Read a sample play");
    expect(checkAiSetup).toHaveBeenLastCalledWith({ provider: "gemini", apiKey: KEY, model: "gemini-2.5-pro" });
    click("Save and finish");
    expect(getAiSetup()?.model).toBe("gemini-2.5-pro");
  });

  it("notices a key pasted under the wrong provider and offers to switch", () => {
    open();
    click("Set up my key");
    click("Next");
    paste("sk-ant-api03-test-key-0123456789");
    expect(screen.getByText("This looks like a Claude (Anthropic) key.")).toBeInTheDocument();
    click("Switch to Claude (Anthropic)");
    expect(screen.getByText("Get your Claude (Anthropic) key")).toBeInTheDocument();
    expect(screen.queryByText(/This looks like/)).not.toBeInTheDocument();
  });

  it("lets a coach remove a saved key, after confirming", async () => {
    saveAiSetup({ provider: "openai", apiKey: "sk-test-key-0123456789", model: "gpt-5-mini" });
    open();
    expect(screen.getByText("AI assist is using your ChatGPT (OpenAI) key")).toBeInTheDocument();
    click("Remove");
    expect(getAiSetup()).not.toBeNull();
    click("Remove key");
    await waitFor(() => expect(getAiSetup()).toBeNull());
    expect(screen.getByText("AI assist is off on this device")).toBeInTheDocument();
  });
});
