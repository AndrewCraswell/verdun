# Verdun

Massively multiplayer WW1 trench warfare in the browser. Each player commands a squad and fights as its soldiers in
continuous battles along the Verdun front, while the front line moves over a season of several weeks.

"Verdun" is a working codename (see [open questions](docs/open-questions.md)).

**Status:** stage 1 (single-player prototype). Milestone M0 (scaffold) is done; next is M1, terrain and trenches.

## Development

Requires Node 24 and pnpm 11.

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

| Path                         | Contents                                                  |
| ---------------------------- | --------------------------------------------------------- |
| `apps/client`                | Babylon.js game client (Vite)                             |
| `packages/sim`               | Pure, deterministic simulation (bitECS)                   |
| `packages/map`               | Versioned map format, height sampling, procedural terrain |
| `packages/typescript-config` | Shared tsconfig bases                                     |
| `packages/oxlint-config`     | Shared lint rules                                         |

### Controls (prototype)

| Input                  | Action                                               |
| ---------------------- | ---------------------------------------------------- |
| W A S D                | Move the soldier you control, relative to the camera |
| Mouse                  | Aim                                                  |
| Mouse wheel, left-drag | Zoom, rotate the camera                              |
| Tab, 1–8               | Switch to the next soldier, or to a squad slot       |
| F, H                   | Squad order: follow me, hold                         |
| Right-click            | Squad order: advance to that point                   |
| K                      | Dev builds only: kill the soldier you control        |
| \`                     | Dev builds only: open Babylon's Inspector            |

## Documentation

### Design

| Doc                                      | Contents                                          |
| ---------------------------------------- | ------------------------------------------------- |
| [Vision](docs/vision.md)                 | Game design: squads, sectors, mechanics, platform |
| [Roadmap](docs/roadmap.md)               | Stages and prototype milestones                   |
| [Open questions](docs/open-questions.md) | Decisions still to make                           |

### Engineering

| Doc                                  | Contents                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| [Architecture](docs/architecture.md) | Stack, packages, simulation, physics, rendering, networking, known risks, options not chosen |
| [Tooling](docs/tooling.md)           | Software to install, web services, MCP servers, editor plan                                  |

### Assets

| Doc                                           | Contents                                                    |
| --------------------------------------------- | ----------------------------------------------------------- |
| [Art direction](docs/assets/art-direction.md) | Visual target and commission spec                           |
| [Shopping list](docs/assets/shopping-list.md) | What to buy, with links and prices                          |
| [Licensing](docs/assets/licensing.md)         | Which stores are usable for a web game and how we comply    |
| [Pipeline](docs/assets/pipeline.md)           | Export, optimization, compression, crowd rendering, budgets |
| [Register](docs/assets/register.md)           | Every shipped third-party asset and its license             |

### Research

Background for the docs above. Decisions live in the docs above, not here.

| Doc                                                             | Contents                                    |
| --------------------------------------------------------------- | ------------------------------------------- |
| [Research report](docs/research/realistic-ww1-assets-report.md) | Full realistic-assets research with sources |
| [Research notes](docs/research/notes/)                          | Raw research notes with sources, by topic   |

## Stack at a glance

TypeScript 7, Babylon.js 9, bitECS, Rapier (from M2), Vite 8, Vitest 5, pnpm + Turborepo, oxlint + oxfmt, hosted on
Railway. Later: Colyseus 0.18 on uWebSockets.js (stage 2), Postgres and Clerk or Better Auth (stages 2–3).
