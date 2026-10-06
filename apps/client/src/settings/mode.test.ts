import { describe, expect, it } from "vitest"
import { battleServer, createModeSettings, defaultMode, multiplayerServer, readMode } from "./mode.ts"

const live = { built: "wss://server.example", development: false, hostname: "game.example" }
const development = { built: "", development: true, hostname: "localhost" }
const builtAlone = { built: "", development: false, hostname: "game.example" }

describe("how the player plays", () => {
  it("is what was chosen, or the default for anything else", () => {
    expect(readMode({ mode: "single" }, "multiplayer")).toEqual({ mode: "single" })
    expect(readMode({ mode: "hotseat" }, "multiplayer")).toEqual({ mode: "multiplayer" })
    expect(readMode(null, "single")).toEqual({ mode: "single" })
    const settings = createModeSettings(null, "multiplayer")
    settings.change({ mode: "single" })
    expect(settings.current.mode).toBe("single")
  })

  it("is multiplayer by default where the game knows a server, and alone in development", () => {
    expect(defaultMode(live)).toBe("multiplayer")
    expect(defaultMode(development)).toBe("single")
    expect(defaultMode(builtAlone)).toBe("single")
  })

  it("plays multiplayer on the build's server, or in development on pnpm server", () => {
    expect(multiplayerServer(live)).toBe("wss://server.example")
    expect(multiplayerServer(development)).toBe("ws://localhost:2567")
    expect(multiplayerServer(builtAlone)).toBeNull()
  })

  it("joins the server ?server names whatever was chosen, and otherwise goes by the choice", () => {
    const none = new URLSearchParams("")
    expect(battleServer(none, "multiplayer", live)).toBe("wss://server.example")
    expect(battleServer(none, "single", live)).toBeNull()
    expect(battleServer(none, "multiplayer", builtAlone)).toBeNull()
    expect(battleServer(new URLSearchParams("server=wss://other.example"), "single", live)).toBe("wss://other.example")
    expect(battleServer(new URLSearchParams("server"), "single", builtAlone)).toBe("ws://game.example:2567")
  })
})
