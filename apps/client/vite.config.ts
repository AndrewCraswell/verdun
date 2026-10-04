import { defineConfig } from "vite"

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // Test coverage reports land in coverage/; writing them shouldn't reload the game.
    watch: { ignored: ["**/coverage/**"] }
  },
  optimizeDeps: {
    // The dev-only Inspector is imported lazily; pre-bundle it at startup so opening it doesn't reload the page.
    include: ["@babylonjs/inspector"]
  },
  build: {
    target: "es2024"
  }
})
