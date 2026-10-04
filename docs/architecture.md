# Architecture

How the game is built. What it plays like is in the [vision](vision.md); what gets built when is in the
[roadmap](roadmap.md).

## Principles

1. **TypeScript everywhere.** One simulation package shared by client and server.
2. **The simulation is pure**: no DOM, no rendering, no networking. It runs in the browser for the prototype and on the
   server later, unchanged. It never imports Babylon or Colyseus.
3. **Fixed timestep** and deterministic random rolls within a tick, so client prediction and replays work later.
4. **Everything is a command** (move, aim, fire, switch soldier, order squad), whether it comes from the keyboard, the
   AI or the network. Bots and humans use the same path.
5. **World state saves to and loads from a versioned file** from the start. Continuous battles need crash recovery and
   deploys that don't wipe the battle.
6. **ECS (entity-component-system)** with data in typed arrays, for thousands of soldiers.
7. **Craters are events.** One crater-stamp function runs on client and server; heights are never sent over the network.

## Stack

| Layer                         | Choice                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Rendering                     | Babylon.js 9 (WebGPU first, WebGL2 fallback)                                                                |
| ECS                           | bitECS 0.4 (see [ECS decision](#ecs-decision))                                                              |
| Physics                       | Rapier (`@dimforge/rapier3d-compat`), static colliders for line of sight and fire (see [physics](#physics)) |
| Random numbers                | In-house Mulberry32 (`packages/sim/src/rng.ts`); its whole state is one integer that saves with the world   |
| Validation                    | Zod for orders, loadouts, map and weapon config; small hand-written checks for per-tick input               |
| Build                         | Vite                                                                                                        |
| Tests                         | Vitest                                                                                                      |
| Monorepo                      | pnpm workspaces + Turborepo                                                                                 |
| Lint, format                  | oxlint, oxfmt                                                                                               |
| UI overlay                    | React for menus, HUD and war map (library to decide; no Fluent UI); Tweakpane for dev tools                 |
| Server (stage 2)              | Node + Colyseus 0.18 on uWebSockets.js (see [networking](#networking-stage-2-and-later))                    |
| Hosting                       | Railway                                                                                                     |
| Auth (later)                  | Clerk or Better Auth                                                                                        |
| War map (stage 3)             | Web service + Postgres, through Drizzle                                                                     |
| Sector coordination (stage 3) | Colyseus Redis presence and driver, once sectors run in separate processes                                  |

Dependencies are installed when code first uses them, not when they are chosen: Rapier arrives with line of sight (M2),
Zod with the first validated config or order.

## Repository layout

```
apps/
  client/              Babylon.js game client (Vite): renderer, camera, input, fog of war, HUD
  server/              (stage 2) Colyseus sector room: 20 Hz loop, lag compensation, area of interest, snapshots
  warmap/              (stage 3) front state, seasons, accounts
packages/
  sim/                 game rules: ECS, commands, fixed step, snapshots; later physics, line of sight, flow fields, gas, combat, AI
  map/                 versioned map format, height sampling, trench tracing, the Fleury sector; later Tiled import
  net/                 (stage 2) binary snapshot protocol, relevance filtering, Schema mirror of the controlled soldier
  typescript-config/   shared tsconfig bases: `pure` (no DOM, no Node) for sim and map, `vite` for the client
  oxlint-config/       shared lint rules
```

Dependency direction: `client -> sim -> map`. `sim` and `map` compile against `ES2024` only, with no DOM or Node types,
so an accidental browser or Node import fails type checking. Internal packages export TypeScript source directly
(`"exports": "./src/index.ts"`) and import with `.ts` extensions, so Vite bundles them and Node 24 can run them as-is on
the server later.

The editor starts inside the client (see the [editor plan](tooling.md#editor-plan)). Load-test bot clients
(`@colyseus/loadtest`) come with the server.

### Why no server app yet

Stage 1 is single-player: the client runs the simulation in the browser. Vitest already runs the simulation headless in
Node, which proves it stays pure. The Colyseus server app is added in stage 2, when there is networking to build.

### ECS decision

**bitECS 0.4**, chosen at M0 with a benchmark (5,000 entities, movement plus a second system, 2,000 ticks, Node 24):

| Library                   | Per tick |
| ------------------------- | -------- |
| bitECS                    | 14.8 µs  |
| Koota, `useStores` (SoA)  | 13.6 µs  |
| Koota, `updateEach` (AoS) | 505 µs   |

Raw speed is equal when Koota uses its low-level stores; its ergonomic API is about 35x slower. bitECS wins on fit:
components are plain typed arrays we own, it has built-in snapshot and delta serialization (`bitecs/serialization`) for
saves and networking, and it has no framework assumptions. Koota's strength, React integration, matters only for the
HUD, which can read simulation state through small selectors. bitECS releases are slow, but the library is small enough
to fork.

### Toolchain decision

oxlint + oxfmt + Turborepo, matching the agency repo. **Vite+** (VoidZero's unified `vp` toolchain) bundles the same
tools but is still pre-1.0 (1.0.0-rc.1 as of October 2026), and its task runner overlaps Turborepo. Revisit after 1.0.

## Simulation

### World

- **Heightmap grid at 0.5 m cells** with layers:
  - height (physics heightfield, movement, cover, terrain mesh)
  - surface: mud, grass, chalk, shattered wood, water (movement speed, footsteps, texture blend)
  - trench network: polylines with type (fire, communication, sap), carved into height
  - objects: bunkers, wire, MG nests, sandbags, ruins (physics colliders, cover)
- Trenches can't be pure heightmap (no vertical walls): carve a rough shape into the grid for the simulation, and
  generate a mesh along the polyline for rendering (revetment walls, duckboards, fire step, parapet, zigzag traverses).
  Dugouts are entrances only at first.
- **Craters** stamp into the height grid; movement costs update locally; that chunk's physics collider and terrain mesh
  rebuild.
- **Gas** is a density grid that spreads with wind and settles in low ground. Smoke uses the same kind of grid.
- Prototype map: about 600 × 400 m, two trench lines 150–250 m apart.

### Physics

- **Rapier holds static colliders**: the terrain as **one heightfield for the whole map** at the 0.5 m simulation
  resolution, plus colliders for structures from the objects layer. Per-chunk heightfields were tried at M2 and dropped:
  with Rapier 0.21, rays entering a chunk's heightfield through its side sometimes missed the ground, letting soldiers
  see through hills (a regression test covers it). A crater rebuilds the whole heightfield, about a million heights on
  the 600 × 400 m map; measure that cost at M5 and revisit if barrages make it hurt.
- **Fog of war is presentation only**: the client sweeps a radial viewshed over the height grid a few times a second
  into a 2 m texture that darkens unseen ground. Whether an enemy is visible, and later whether a shot can land, is
  always a Rapier sight line.
- **Line of sight and line of fire are ray casts** against those colliders. Smoke and gas block sight through their
  density grids, not through colliders.
- **Soldiers are not physics bodies.** They move on the grid in plain TypeScript. That keeps WebAssembly out of the
  predicted step and avoids a shape cast per soldier per tick.
- Grenades are the only dynamic bodies.
- Rapier initializes asynchronously (`await RAPIER.init()`) before the simulation is created.

### Soldiers

- **Movement**: flow fields per objective, shared by every unit heading there (not per-unit A\*). Per-squad A\* only for
  one-off routes. Craters, wire, mud and exposure to fire are cost layers on the grid, so terrain changes only update
  cell costs.
- **Local avoidance**: steering and separation using the spatial grid.
- **Spatial grid**: uniform grid sharing the terrain chunks. Broad search for nearby enemies, explosion victims,
  perception candidates and client relevance; precise checks follow.
- **Combat**: rifle and machine-gun shots are rays with spread from range, movement and suppression. A ray stops at the
  first terrain or structure collider; soldiers along it (candidates from the spatial grid) are tested as capsules.
- **Artillery**: timed area events.
- **Morale and suppression** as primary stats.
- **AI**: squad AI follows player orders with utility scoring plus state machines (follow, assault, suppress, retreat,
  reload, cover selection, cover-slot reservations), keeping decision state in ECS components. Commander AI per side
  directs bot squads. AI decisions run staggered at 2–5 Hz; movement updates every tick.

### Tick

- Simulation tick: 20 Hz.
- Phases in order: commands, AI, navigation, movement, physics queries, combat, damage, cleanup, snapshots.
- Reloads and other deadlines are counted in ticks.

### Time of day and weather

The simulation owns the clock and the weather (`environment.ts`, `sky.ts`, `weather.ts`), because they decide who can
see whom and where gas drifts, and every client and the server must agree on them. The full reference, with the values
and the reasons for them, is [time and weather](time-and-weather.md).

- **Two clocks**: the week of the war, which moves on once a real day at the campaign's turn (a `clock` command with
  `week`), and the hour, a full day and night every 117 real minutes (`minutesPerDay`), chosen so night falls about a
  third of a cycle later each real day. The clock stores the week and the game time elapsed in it; the sky shows the
  week's dates in turn, one per day of battle.
- **Sun and moon**: [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT) for the battlefield's latitude
  and longitude, so day length, twilight and the moon follow the real calendar; light on the ground in lux from daylight
  tables, the moon's magnitude, starlight and cloud.
- **Sight range** from the light and the weather's visibility; combat never engages beyond it.
- **Forecast**: where weather comes from, saved as plain data (`ForecastSpec`) and swapped with the `forecast` command:
  a seeded **cycle** of seven patterns by season from 1914 to 1918, a **steady** weather for tests and dev tools, and
  later the historical **records**. Every forecast is a pure function of time, so clients can compute it.
- **Wind**: the weather sets `sim.wind` once a second, so gas and smoke drift with it.
- Weather and sky are read once a real second and never draw from the simulation's random number generator, so they
  don't disturb the combat's random sequence.

### Scale target (full game)

A few hundred players with squads of 6–10 means 2,000–5,000 soldiers per sector, plus shells, gas and craters. The
server CPU budget goes mostly to AI and line of sight. Line of sight already runs in Rapier's WebAssembly; AI is the
first candidate for Rust/WebAssembly if profiling demands it.

## Rendering

- Angled top-down camera with zoom.
- **Terrain**: chunked heightfield meshes (32–64 m) rebuilt from the simulation grid; craters re-mesh only their chunk.
  Custom NodeMaterial splat shader over 6–8 KTX2 layers (Babylon's `TerrainMaterial` blends only 3).
- **Trench walls**: Synty trench kit pieces instanced along trench polylines (Megascans revetments in the remaster).
  Every prop is an `InstancedMesh` with a frozen world matrix and distance LODs; around trenches the ground is drawn
  under the kit rather than at the simulation's heights. See [level design](level-design.md).
- `MeshUVSpaceRenderer` decal maps for persistent scorch marks.
- Fog of war from a visibility texture computed from line of sight.
- Gas as low-lying fog driven by the density grid, plus particles.
- Crowds via VAT instancing; the player's squad fully skinned. Details in the
  [asset pipeline](assets/pipeline.md#crowd-rendering).
- **Daylight** (`apps/client/src/environment/`): the key light follows the sun, or the moon at night, coloured by
  Babylon's physically based `Atmosphere` add-on; night drawn dim and blue; fog thinned for the camera's height; rain
  and snow around the camera; wet ground; lightning. See [time and weather](time-and-weather.md#rendering).
- Clustered lighting (Babylon 9) for flares and muzzle flashes.
- WebGPU first with automatic WebGL2 fallback. WebGPU saves CPU, not GPU, so it won't rescue an over-budget crowd.

## Networking (stage 2 and later)

- **Server-authoritative.** Lockstep breaks when hundreds of players join and leave mid-battle.
- **Colyseus 0.18, one room per sector.** Sector rooms are created at boot and never auto-dispose. Transport is
  uWebSockets.js through `@colyseus/uwebsockets-transport`; WebTransport only if packet loss becomes a measured problem.
- **The room wraps the simulation**: it feeds commands into `sim` and reads snapshots out. `sim` never imports Colyseus.
- **Three kinds of entities**:

| Entity                       | Per sector  | Networking                                                                                               |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| Directly controlled soldiers | 300–500     | Colyseus client prediction and reconciliation; lag compensation (server rewind) for rifle shots          |
| AI soldiers                  | 3,000–5,000 | Server-only; custom binary snapshots, interpolated on the client                                         |
| Artillery, gas, craters      | many        | Server events; shells are slow, so no lag compensation. Craters replay through the shared stamp function |

- **Replication is split.** Colyseus Schema carries small state: players, objectives, scores, squad-private data.
  Soldiers and projectiles go as compact binary snapshots sent as raw bytes. Colyseus's per-client `StateView` isn't
  used for them: its docs say it is ["not optimized"](https://docs.colyseus.io/state/view) for large datasets, and each
  view adds an encoding pass.
- **Area of interest**: nearby entities at full rate, distant ones at 2–5 Hz, ranked by priority. Sending everything
  would be about 400 KB/s per player; area of interest brings it to 20–30 KB/s.
- **Visibility filtering**: clients only receive what their soldiers can see. Saves bandwidth, defeats wallhacks.
- References: [Colyseus client prediction](https://docs.colyseus.io/netcode/client-prediction), Gabriel Gambetta's
  "Fast-Paced Multiplayer" articles.

## Persistence (stage 3 and later)

- Snapshot each sector's state every few minutes; a crash loses at most a few minutes.
- Versioned state format so new builds load old battles.
- Sector servers are stateful long-running processes: one sector per process, not serverless.
- War map service applies sector reports to the front and publishes it daily.
- Player data (accounts, unlocks, match results) lives in Postgres, separate from sector state. Per-tick soldier state
  never goes to the database.

## Known risks

- **Replication budget is unmeasured.** Bandwidth and encode time for about 1,000 soldiers across 100 clients decide the
  snapshot rate, quantization and relevance rules. The stage 2 load test in the [roadmap](roadmap.md) measures it.
- **Prediction works on Schema objects, not ECS.** Colyseus's reconciler predicts Schema state, so the player's soldier
  needs a Schema mirror of its ECS components. Prove this seam early in stage 2.
- **Line-of-sight cost.** Thousands of soldiers casting sight rays at 2–5 Hz is the main physics load. Profile it at M4
  with 400 soldiers.
- **Grid navigation is 2.5D.** Dugouts under trenches and fort interiors may need portal links between grid layers, or
  the Recast fallback below.
- **One room is one thread.** A sector's whole simulation shares one Node event loop, so the stage 2 load test sets the
  sector size.

## Considered and not chosen

| Option                                    | Why not                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Koota                                     | See [ECS decision](#ecs-decision)                                                                                                                                                             |
| Miniplex                                  | Effectively dormant since 2023                                                                                                                                                                |
| Recast (`recast-navigation`), Navcat      | Navmeshes are built from fixed geometry, so every shell would mean a tile rebuild and re-planned routes. Recast is the fallback for multi-level spaces. Navcat (same author) is still pre-1.0 |
| Havok                                     | A second physics engine. Babylon's physics plugin isn't used                                                                                                                                  |
| Rapier character controllers for soldiers | Puts WebAssembly physics into the predicted step and costs a shape cast per soldier per tick                                                                                                  |
| Hand-rolled uWebSockets.js protocol       | Colyseus supplies the fixed-step input handling, prediction, reconciliation and lag compensation on the same transport                                                                        |
| `@colyseus/database`                      | Ties durable player data to the game server                                                                                                                                                   |
| `pure-rand`                               | The in-house Mulberry32 already saves its whole state as one integer                                                                                                                          |
| Yuka, Mistreevous                         | Generic AI building blocks; the tactical design is game-specific either way                                                                                                                   |
