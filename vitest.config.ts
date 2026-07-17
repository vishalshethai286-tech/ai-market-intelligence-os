import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The real package throws "cannot be imported from a Client Component"
      // unconditionally under Vitest's module resolution; swap in its no-op
      // build (normally only used for the "react-server" export condition).
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts"],
    // These are DB-integration tests sharing one real Postgres instance, and
    // some (src/lib/discovery/service.test.ts) scan/act across ALL
    // workspaces, not just their own — running test files in parallel risks
    // one file's in-flight fixture data being swept up by another file's
    // global query. Sequential is slower but deterministic.
    fileParallelism: false,
  },
});
