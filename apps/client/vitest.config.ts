import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Babylon's NullEngine renders nothing but builds real scenes, so scene code is tested in Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts and the dev tools need a real browser canvas and GPU; they are verified in the browser instead.
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/dev/**"],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 }
    }
  }
})
