import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The AI functions are Deno code and import the Claude SDK by its npm:
      // address. Tests load those files directly, so they get a stand-in.
      "npm:@anthropic-ai/sdk@1.4.0": path.resolve(__dirname, "./src/test/stubs/anthropicSdk.ts"),
    },
  },
});
