import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A runaway test dies at 4 GB with "heap out of memory" instead of eating the machine: a time limit can't stop a
    // loop that never yields.
    execArgv: ["--max-old-space-size=4096"],
    // Generating the whole Fleury sector takes seconds under coverage, more when every package's tests run at once.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 }
    }
  }
})
