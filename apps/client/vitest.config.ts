import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Babylon's NullEngine renders nothing but builds real scenes, so scene code is tested in Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A runaway test dies at 4 GB with "heap out of memory" instead of eating the machine: a time limit can't stop a
    // loop that never yields.
    execArgv: ["--max-old-space-size=4096"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts, the dev tools, browser input, the HUD and the debug overlay need a real browser; they are verified in the browser instead.
      exclude: [
        "src/**/*.test.ts",
        "src/main.ts",
        "src/dev/**",
        "src/control/browser-input.ts",
        "src/audio/battle-sounds.ts",
        "src/audio/mixer.ts",
        "src/hud/hud.ts",
        "src/control/camera-rig.ts",
        "src/ui/menu.ts",
        "src/debug/dock.ts",
        "src/debug/stats.ts"
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 }
    }
  }
})
