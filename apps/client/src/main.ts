import { startMenuMusic } from "./audio/music.ts"
import { openKitFiles } from "./level/kit-files.ts"
import "./style.css"
import { sideSettings } from "./settings/side.ts"
import { createMenu } from "./ui/menu.ts"

/**
 * The game's entry: the menus first, small and quick to load, then the battle in a module of its own, loaded once the
 * player joins it (./start-battle.ts).
 *
 * The front door the game opens on; ?play and ?debug go straight into the line (?debug for measuring, scripts/perf.mjs),
 * behind the loading screen: nothing of the battle shows until it's drawing.
 */
async function start(): Promise<void> {
  const address = new URLSearchParams(location.search)
  const frontDoor = !address.has("play") && !address.has("debug")
  const build: unknown = import.meta.env.VERDUN_BUILD
  // The side the player fights for colours the interface: the French blue and the Germans red, whichever is ours.
  document.documentElement.dataset.army = sideSettings().current.side
  const menu = createMenu(document.body, {
    development: import.meta.env.DEV,
    frontDoor,
    build: typeof build === "string" ? build : "dev"
  })
  // The theme plays at the front door, and fades as the player goes into the line.
  if (frontDoor) {
    void startMenuMusic().then((theme) => menu.entered.then(() => theme?.stop()))
  }
  // Nothing of the battle loads until the player asks to join it: at the front door, which battle isn't known yet.
  await menu.joining
  menu.progress("Loading the battle", 0.02)
  // The level kit's asset pack, most of what the battle downloads, sets off at once, beside the battle's own code.
  const kitFiles = openKitFiles()
  try {
    const { startBattle } = await import("./start-battle.ts")
    await startBattle(menu, { frontDoor, kitFiles })
  } catch (error) {
    // Said on the screen, plainly, rather than left as a blank page and a line in the console (S23).
    console.error(error)
    menu.fail(error)
  }
}

start().catch((error: unknown) => {
  console.error(error)
})
