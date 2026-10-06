import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A runaway test dies at 4 GB with "heap out of memory" instead of eating the machine: a time limit can't stop a
    // loop that never yields.
    execArgv: ["--max-old-space-size=4096"],
    // Artillery and sight-line tests run dozens of trials, each building a Rapier heightfield, and the battle tests play
    // minutes of a fight: up to 25 s apiece under coverage here, and slower again on CI's runners, where a 30 s limit
    // failed passing tests and held up deploys. A plain local run keeps the tighter limit, so a test that has grown slow
    // is still caught where it's written.
    testTimeout: process.env["CI"] || process.argv.includes("--coverage") ? 90_000 : 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 }
    }
  }
})
