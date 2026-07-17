import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Separate config from vitest.config.ts (node environment, *.test.ts library
 * tests) because component tests need a browser-like DOM (jsdom) and JSX
 * transform — mixing environments in one Vitest config isn't supported
 * cleanly, so `npm test` runs this as a second pass. See
 * src/components/**\/*.test.tsx.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.component.setup.ts"],
    include: ["src/**/*.test.tsx"],
  },
});
