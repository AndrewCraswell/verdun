# Verdun

Massively multiplayer WW1 trench warfare in the browser. Each player commands a squad and fights as its soldiers in
continuous battles along the Verdun front, while the front line moves over a season of several weeks.

"Verdun" is a working codename (see [open questions](docs/open-questions.md)).

**Status:** stage 1 (single-player prototype). Milestone M0 (scaffold) is done; next is M1, terrain and trenches.

## Development

Requires Node 24 and pnpm 11.

> **Most assets aren't in git.** Git holds the level kit and the soundtrack the game ships (through Git LFS). The raw
> purchases (`vendor/`) and the rest of the pipeline's output, with the pack's key, live in the asset library on E:, and
> some can't be downloaded again. `pnpm assets:fetch` copies what a job needs into the checkout, and
> `pnpm assets:backup` stores anything new in the library. See [asset library](docs/assets/backup.md).

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm verify
```

`pnpm dev` serves the game at http://localhost:5173. `pnpm verify` runs the format check, lint, type check, knip, tests
with coverage, and the production build.

Every push to `main` that passes CI deploys itself: CI packs the level kit, builds the client and uploads it with
`deploy/` (Caddy) to the `client` service of the `verdun` project on Railway, at
https://client-production-d977.up.railway.app. It needs the repository secret `RAILWAY_TOKEN`, a project token for that
project's production environment; without it CI skips the deploy.

The battlefield's Synty art comes from the level kit, built from the purchased packs in `vendor/` (see
[level design](docs/level-design.md#level-kit)). Without it the game runs as greybox.

```bash
blender -b --factory-startup -P scripts/build-level-kit.py -- .asset-cache/unity vendor/unity .asset-cache/level
```

| Path                         | Contents                                                 |
| ---------------------------- | -------------------------------------------------------- |
| `apps/client`                | Babylon.js game client (Vite)                            |
| `apps/server`                | Sector server: the battle on the real clock, in SQLite   |
| `packages/net`               | Messages between the server and its players              |
| `packages/sim`               | Pure, deterministic simulation (bitECS)                  |
| `packages/map`               | Versioned map format, height sampling, the Fleury sector |
| `packages/typescript-config` | Shared tsconfig bases                                    |
| `packages/oxlint-config`     | Shared lint rules                                        |

### Controls (prototype)

| Input                           | Action                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| W A S D                         | Move the soldier you control, relative to the camera                                                    |
| Mouse                           | Aim at the man nearest the pointer, or the ground; the view leans toward it                             |
| Left-click                      | Fire                                                                                                    |
| Right button, held              | Aim over the soldier's shoulder: the mouse turns him, and he walks                                      |
| Arrow keys                      | Pan the camera; once it's off your man, screen edges pan too                                            |
| Shift + middle-drag             | Grab and drag the ground                                                                                |
| Middle-drag, Shift + Left/Right | Turn and tilt the camera                                                                                |
| Mouse wheel                     | Zoom, toward the pointer                                                                                |
| Home, L                         | Back to the soldier you control (moving them or switching soldier does it too)                          |
| Tab, 1–8                        | Switch to the next soldier, or to a squad slot                                                          |
| F, H                            | Squad order: follow me, hold                                                                            |
| E                               | Squad order: advance to the point under the pointer                                                     |
| G, twice                        | Whistle: every French squad attacks behind a creeping barrage                                           |
| B, twice                        | Bombard the German front line for two minutes                                                           |
| V                               | Call artillery onto the point under the pointer                                                         |
| O                               | Turn fog of war off or on                                                                               |
| M                               | The sector map; the battle goes on while you look                                                       |
| U                               | The squad book: every man, and the fallen                                                               |
| Esc                             | The menu: the war map, options, controls; the battle waits                                              |
| Z                               | Lie down and crawl, or get back up                                                                      |
| C                               | Crouch, or stand back up                                                                                |
| Space                           | Climb the trench wall, wooden fence or low wall ahead; at wire, crouched or prone, cut it; or man a gun |
| Q                               | Throw a grenade at the pointer                                                                          |
| F3                              | Debug statistics                                                                                        |
| K                               | Dev builds only: kill the soldier you control                                                           |
| [ ]                             | Dev builds only: move the clock an hour back or forward                                                 |
| Shift + [ ]                     | Dev builds only: move to the week before or after (the daily turn)                                      |
| N                               | Dev builds only: hold each weather in turn, then history's again                                        |
| J                               | Dev builds only: mark where soldiers have fallen                                                        |
| \`                              | Dev builds only: open Babylon's Inspector                                                               |

The game opens on its front door, with the battle loading behind it; `?play` goes straight into the line behind the
loading screen, and `?debug` past both, for measuring. Every battle is the playtest operation, a scripted French attack
with a briefing before and a report after; `?free` plays without it. Dev builds also read the address: `?webgl` draws
with WebGL instead of WebGPU, `?war=1916-02-21` puts today's turn in the war's week of that date (`?war=reset` forgets
it), and `?standto=0` plays straight through the stand-to after each daily cutoff. See
[time and weather](docs/time-and-weather.md#the-wars-calendar).

## Credits

Terrain of the Fleury sector: © IGN, LiDAR HD, under
[Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).

Weather of 1914–1918: NOAA-CIRES-DOE [20th Century Reanalysis version 3](https://psl.noaa.gov/data/20thC_Rean/), under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Support for the Twentieth Century Reanalysis Project version
3 dataset is provided by the U.S. Department of Energy, Office of Science Biological and Environmental Research (BER),
by the National Oceanic and Atmospheric Administration Climate Program Office, and by the NOAA Earth System Research
Laboratory Physical Sciences Laboratory. Corrected with Météo-France daily station records, under
[Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).

The map of the Western Front: [Natural Earth](https://www.naturalearthdata.com), in the public domain.

Type: [Archivo](https://github.com/Omnibus-Type/Archivo), © 2020 The Archivo Project Authors, and
[Bodoni Moda](https://github.com/indestructible-type/Bodoni), © 2020 The Bodoni Moda Project Authors, both under the
[SIL Open Font License 1.1](https://openfontlicense.org).

## Documentation

### Design

| Doc                                      | Contents                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| [Vision](docs/vision.md)                 | Game design: squads, sectors, mechanics, platform                                     |
| [Game design](docs/design/overview.md)   | Every mechanic in detail: squad, sector battle, war map, season, balance, progression |
| [Roadmap](docs/roadmap.md)               | Stages and prototype milestones                                                       |
| [Level design](docs/level-design.md)     | The Fleury sector, trench kit and level kit                                           |
| [Open questions](docs/open-questions.md) | Decisions still to make                                                               |

### Engineering

| Doc                                          | Contents                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Architecture](docs/architecture.md)         | Stack, packages, simulation, physics, rendering, networking, known risks, options not chosen |
| [Time and weather](docs/time-and-weather.md) | The clocks and their values, what players see, sun and moon, weather, sight, rendering       |
| [Tooling](docs/tooling.md)                   | Software to install, web services, MCP servers, editor plan                                  |

### Assets

| Doc                                           | Contents                                                     |
| --------------------------------------------- | ------------------------------------------------------------ |
| [Art direction](docs/assets/art-direction.md) | Visual target and commission spec                            |
| [Shopping list](docs/assets/shopping-list.md) | What to buy, with links and prices                           |
| [Licensing](docs/assets/licensing.md)         | Which stores are usable for a web game and how we comply     |
| [Asset library](docs/assets/backup.md)        | What lives outside git, on E:, and how to fetch and store it |
| [Historical maps](docs/historical-maps.md)    | The trench maps of 1916 sectors are traced from, and how     |
| [Pipeline](docs/assets/pipeline.md)           | Export, optimization, compression, crowd rendering, budgets  |
| [Register](docs/assets/register.md)           | Every shipped third-party asset and its license              |

### Research

Background for the docs above. Decisions live in the docs above, not here.

| Doc                                                               | Contents                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| [Research report](docs/research/realistic-ww1-assets-report.md)   | Full realistic-assets research with sources          |
| [Sound effects report](docs/research/ww1-sound-effects-report.md) | WW1 sound libraries, gaps and licensing with sources |
| [Research notes](docs/research/notes/)                            | Raw research notes with sources, by topic            |

## Stack at a glance

TypeScript 7, Babylon.js 9, bitECS, Rapier (from M2), Vite 8, Vitest 5, pnpm + Turborepo, oxlint + oxfmt, hosted on
Railway. Later: Colyseus 0.18 on uWebSockets.js (stage 2), Postgres and Clerk or Better Auth (stages 2–3).
