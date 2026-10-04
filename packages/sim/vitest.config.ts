import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Artillery and sight-line tests run dozens of trials, each building a Rapier heightfield: seconds under coverage.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 }
    }
  }
})
