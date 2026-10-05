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
      // The process's own wiring and the Colyseus room around players.ts and relay.ts: run by hand (`pnpm server`).
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/room.ts"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 }
    }
  }
})
