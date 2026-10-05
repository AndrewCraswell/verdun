import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each sector test generates the Fleury sector and builds its Rapier heightfield: seconds, more under coverage.
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The process's own wiring, the Colyseus room around players.ts and relay.ts, and the worker thread around
      // sight.ts: run by hand (`pnpm server`) and by the load test.
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/room.ts", "src/sight-thread.ts", "src/sight-worker.ts"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 }
    }
  }
})
