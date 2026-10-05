import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Babylon's NullEngine renders nothing but builds real scenes, so scene code is tested in Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A runaway test dies at 4 GB with "heap out of memory" instead of eating the machine: a time limit can't stop a
    // loop that never yields.
    execArgv: ["--max-old-space-size=4096"],
    // Building terrain and dressing the level take seconds under coverage on CI's slower machines, past the 5 s default.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts, the dev tools, browser input, the HUD's views and the debug overlay need a real browser; they are verified in
      // the browser instead. The HUD's state, which the views draw, is tested.
      exclude: [
        "src/**/*.test.ts",
        "src/main.ts",
        "src/start-battle.ts",
        // Only carries messages between the page and sim-runner.ts, which is tested.
        "src/sim/sim-worker.ts",
        "src/dev/**",
        "src/control/browser-input.ts",
        "src/audio/battle-sounds.ts",
        "src/audio/mixer.ts",
        "src/audio/music.ts",
        "src/hud/hud.ts",
        "src/hud/dom.ts",
        "src/hud/icons.ts",
        "src/hud/elements/**",
        "src/control/camera-rig.ts",
        "src/ui/menu.ts",
        "src/ui/options.ts",
        "src/ui/controls.ts",
        "src/ui/credits.ts",
        "src/ui/fields.ts",
        "src/ui/front/front-map.ts",
        "src/ui/sector/sector-map.ts",
        "src/ui/loading.ts",
        "src/ui/squad-book.ts",
        "src/ui/log-page.ts",
        "src/ui/join-page.ts",
        "src/debug/dock.ts",
        "src/debug/stats.ts"
      ],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 }
    }
  }
})
