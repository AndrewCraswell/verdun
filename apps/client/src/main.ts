import { startMenuMusic } from "./audio/music.ts"
import "./style.css"
import { createMenu } from "./ui/menu.ts"

/**
 * The game's entry: the menus first, small and quick to load, then the battle in a module of its own, loaded behind the
 * front door while the player looks round it (./start-battle.ts).
 *
 * The front door the game opens on; ?play goes straight into the line, behind the loading screen, and ?debug past both,
 * for measuring straight away (scripts/perf.mjs).
 */
async function start(): Promise<void> {
  const address = new URLSearchParams(location.search)
  const frontDoor = !address.has("play") && !address.has("debug")
  const build: unknown = import.meta.env.VERDUN_BUILD
  const menu = createMenu(document.body, {
    development: import.meta.env.DEV,
    frontDoor,
    loadingScreen: !address.has("debug"),
    build: typeof build === "string" ? build : "dev"
  })
  // The theme plays at the front door, and fades as the player goes into the line.
  if (frontDoor) {
    void startMenuMusic().then((theme) => menu.entered.then(() => theme?.stop()))
  }
  menu.progress("Loading the battle", 0.02)
  try {
    const { startBattle } = await import("./start-battle.ts")
    await startBattle(menu, { frontDoor })
  } catch (error) {
    // Said on the screen, plainly, rather than left as a blank page and a line in the console (S23).
    console.error(error)
    menu.fail(error)
  }
}

start().catch((error: unknown) => {
  console.error(error)
})
