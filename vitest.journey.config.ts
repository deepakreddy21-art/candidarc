import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/** Vitest config that includes FastAPI-backed journey suites excluded from the default unit run. */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/e2e/**", "**/dist/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@server": path.resolve(__dirname, "./server"),
    },
  },
});
