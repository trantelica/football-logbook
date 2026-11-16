/**
 * Stand-in for the Claude SDK when the AI functions are loaded under Vitest.
 * Tests set `claudeStub.respond` to choose what messages.create returns or
 * throws, and read `claudeStub.calls` to see what was sent.
 */
class StubAPIError extends Error {
  status: number | undefined;
  constructor(status: number | undefined, message: string) {
    super(message);
    this.status = status;
  }
}

interface ClaudeStub {
  calls: { options: Record<string, unknown>; params: Record<string, unknown> }[];
  respond: (params: Record<string, unknown>) => unknown;
  APIError: typeof StubAPIError;
}

// Kept on globalThis: tests reset the module registry before loading each
// function, and the test and the function must still share one stub (and one
// error class, or `instanceof` would not match).
const holder = globalThis as { __claudeStub?: ClaudeStub };
holder.__claudeStub ??= {
  calls: [],
  respond: () => ({ content: [], stop_reason: "end_turn" }),
  APIError: StubAPIError,
};
export const claudeStub: ClaudeStub = holder.__claudeStub;

export default class Anthropic {
  static APIError = claudeStub.APIError;
  messages: { create: (params: Record<string, unknown>) => Promise<unknown> };
  constructor(options: Record<string, unknown>) {
    this.messages = {
      create: async (params) => {
        claudeStub.calls.push({ options, params });
        return claudeStub.respond(params);
      },
    };
  }
}
