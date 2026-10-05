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

| Layer                         | Choice                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering                     | Babylon.js 9 (WebGPU first, WebGL2 fallback)                                                                                                        |
| ECS                           | bitECS 0.4 (see [ECS decision](#ecs-decision))                                                                                                      |
| Physics                       | Rapier (`@dimforge/rapier3d-compat`), static colliders for line of sight and fire (see [physics](#physics))                                         |
| Random numbers                | In-house Mulberry32 (`packages/sim/src/rng.ts`); its whole state is one integer that saves with the world                                           |
| Validation                    | Zod for orders, loadouts, map and weapon config; small hand-written checks for per-tick input                                                       |
| Build                         | Vite                                                                                                                                                |
| Tests                         | Vitest                                                                                                                                              |
| Monorepo                      | pnpm workspaces + Turborepo                                                                                                                         |
| Lint, format                  | oxlint, oxfmt                                                                                                                                       |
| UI overlay                    | React for menus, HUD and war map (library to decide; no Fluent UI); Tweakpane for dev tools                                                         |
| Server                        | Node 24 (see [the sector server](#the-sector-server)); Colyseus 0.18 for players, on `ws` for now (see [networking](#networking-stage-2-and-later)) |
| Sector saves                  | SQLite through Node's own `node:sqlite`; Postgres once the war map needs one database (see [persistence](#persistence))                             |
| Hosting                       | Railway                                                                                                                                             |
| Auth (later)                  | Clerk or Better Auth                                                                                                                                |
| War map (stage 3)             | Web service + Postgres, through Drizzle                                                                                                             |
| Sector coordination (stage 3) | Colyseus Redis presence and driver, once sectors run in separate processes                                                                          |

Dependencies are installed when code first uses them, not when they are chosen: Rapier arrives with line of sight (M2),
Zod with the first validated config or order.

## Repository layout

```
apps/
  client/              Babylon.js game client (Vite): renderer, camera, input, fog of war, HUD
  server/              the sector server: runs the battle on the real clock and saves it to SQLite; later the Colyseus
                       sector room (lag compensation, area of interest, snapshots)
  warmap/              (stage 3) front state, seasons, accounts
packages/
  sim/                 game rules: ECS, commands, fixed step, snapshots; later physics, line of sight, flow fields, gas, combat, AI
  map/                 versioned map format, height sampling, trench tracing, the Fleury sector; later Tiled import
  net/                 the messages between the sector server and its players, their encoding, and what a player may
                       command; later relevance filtering and the Schema mirror of the controlled soldier
  typescript-config/   shared tsconfig bases: `pure` (no DOM, no Node) for sim and map, `vite` for the client
  oxlint-config/       shared lint rules
```

Dependency direction: `client -> sim -> map`, and `server -> sim -> map`. `sim` and `map` compile against `ES2024` only,
with no DOM or Node types, so an accidental browser or Node import fails type checking. Internal packages export
TypeScript source directly (`"exports": "./src/index.ts"`) and import with `.ts` extensions, so Vite bundles them and
Node 24 runs them as-is on the server.

The editor starts inside the client (see the [editor plan](tooling.md#editor-plan)). Load-test bot clients
(`@colyseus/loadtest`) come with the server.

### The sector server

The war carries on whether anyone is playing: players join and leave, and bots fight on in their place. So the battle
runs on a server (`apps/server`, `pnpm server`), ahead of the rest of stage 2. It builds the same battle the client does
(`setupSkirmish`, the playtest's operation), hands every squad to the AI until a player takes one (the
`squad-controller` command), and steps it at 20 Hz on the real clock, keeping the war's calendar (`createWarClock`):
through the stand-to after each daily cutoff, the battle waits. It runs with Rapier's sight lines, at about 3 ms a step
for 400 men.

Players join over Colyseus (`apps/server/src/room.ts`) and the client plays under `?server` (`?server&play` against
`pnpm server`; `?server=wss://…` for another address); without it the client runs its own battle in the worker as
before, for development and `pnpm perf`.

- **Joining**: a player gets the free squad of their side nearest the middle of its line, as the local game picks, and
  leads it until they leave; then the bots take it back (`squad-controller`). The join screen's choice of squad
  (`join-squad`) swaps men with a squad of bots, never with another player's.
- **The battle on the page**: the client's third `SimHost` (`sim/server-host.ts`) mirrors the server's simulation as the
  worker's is mirrored: the server sends `SimSync` ten times a second (every second step), and a player joining late is
  sent the whole battle, with how far shells have moved the ground. The war's calendar is the server's. The menu doesn't
  pause the battle. What the squad sees is worked out on the page, from the ground.
- **Encoding** (`packages/net`): each message is only what changed since the last (`delta.ts`): the fields of state,
  runs of each soldier array (apart, by `soldierArrayLayout`), the wire and the clouds, and lists that only lose
  elements and gain new ones at the end (the shells in flight) as just that. It goes as MessagePack that keeps typed
  arrays (msgpackr's `moreTypes`), deflated once for every player (fflate). A joining player is welcomed to the battle
  as of the last message, and every message after builds on it. Players get soldiers' positions to the centimetre and
  their facing, morale, suppression and breath to the hundredth, so a value that ebbs a little every step is sent only
  when it has changed enough to tell. Gas and smoke go as a byte a cell on a log scale (about 7% a step), and a cell
  moves a step only once the cloud has moved it two, so cells on the edge between steps don't flicker. The ground a late
  joiner gets is how far shells have moved each sample, in millimetres, against the map they generate themselves.
  Commands go in Colyseus's own encoding.
- **Commands are checked** (`playerCommand`): a player moves, aims and fires only their own squad's men, orders only
  their squad, and calls only their own side's guns; each command is rebuilt from the fields it should have. The dev
  keys' commands (kill, clock, wind) go through only on a server started with `--dev`, as `pnpm server` does. Ranges
  aren't checked yet (a call for fire could ask for any number of rounds a minute; the side's ammunition still caps it).
- **Bandwidth**, measured over the battle's first six minutes, bombardments and all: about 16 KB/s a player (25 KB/s at
  the worst minute), no message over about 6 KB, and a late joiner's welcome about 220 KB. Sending the whole battle
  every time, it was 1.4 to 2.8 MB/s and 1.75 MB. Encoding takes about 4 ms a message, once for every player. What's
  left: smoke drifting (about 6 KB/s), all the soldiers' arrays together (5), shells and fire missions (2), craters
  (1.3).
- **Relevance filtering isn't done.** Every player is sent the whole battle. Sending far soldiers less often would save
  only part of the soldiers' 5 KB/s at this sector's 500 men, and would end the one encoding shared by every player:
  each player would need what they've been sent kept apart. It earns its place when the stage 2 load test, with its
  1,000 men, shows soldiers' data dominating. Visibility filtering (sending only what a player's men can see) waits on
  fog of war being on.
- **A hidden tab** draws no frames, so it sends no commands and plays out no steps; its mirror stays up to date, and it
  keeps only the last two seconds of steps to play on coming back (`server-host.ts`).
- **Transport**: Colyseus's `ws` transport. `@colyseus/uwebsockets-transport` installs uWebSockets.js from GitHub, which
  pnpm's supply-chain policy (`blockExoticSubdeps`) refuses; swapping it in is one line in `main.ts` once that's
  settled.

- **Client-side prediction** (`apps/client/src/sim/prediction.ts`): the soldier the player controls moves on the page at
  once, not a round trip later. The page counts its own steps at the simulation's rate and sends each batch of commands
  with its step (`CommandBatch`); the server acknowledges the tick that applied it (`MESSAGE.ack`), which ties the
  page's steps to the server's ticks. From the server's last position for the soldier, the page replays the steering the
  server hasn't applied yet with the simulation's own arithmetic (`steeredPosition`), and shows him facing where the
  player last aimed. Each sync starts it afresh, so where the server moved him otherwise (a wall, the wire) the page
  follows within a message. An empty batch on joining ties the steps together before the first move. Measured with 200
  ms of round trip (`COLYSEUS_LATENCY=200`): the soldier moves the frame after the key, and stopping corrects him by
  millimetres. Only the controlled soldier is predicted; his stance, fire and grenades wait for the server.

In order, what comes next:

1. The stage 2 load test, which decides whether relevance filtering is needed.
2. Hosting on Railway, with the database on a volume.

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

### Where it runs

- The simulation runs in a **Web Worker** ([sim-worker.ts](../apps/client/src/sim/sim-worker.ts)), so a slow step (sight
  lines rebuilt after craters, a burst of route searches when big orders land) delays the battle a moment instead of
  dropping frames. `?inline` steps it on the page instead, for debugging.
- The page keeps a **mirror**: a `Simulation` made the same way and never stepped
  ([sync.ts](../packages/sim/src/sync.ts)). After each batch of steps the worker sends what changed (the soldier arrays
  up to the highest soldier, component membership, the rest of the state as plain data, each step's events, the wire
  when cut, the ground craters reshaped) and the mirror takes it in place. Everything on the page reads the mirror as it
  would the simulation, and queues commands on it; the host ([sim-host.ts](../apps/client/src/sim/sim-host.ts)) forwards
  them with the next batch.
- This is the shape networking takes later: a server stepping the simulation, clients mirroring it.

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
  Props are thin instances batched by piece and 128 m cell, with distance LODs per batch; around trenches the ground is
  drawn under the kit rather than at the simulation's heights. See [level design](level-design.md).
- `MeshUVSpaceRenderer` decal maps for persistent scorch marks.
- Fog of war from a visibility texture computed from line of sight.
- Gas as low-lying fog driven by the density grid, plus particles.
- Crowds via VAT instancing; the player's squad fully skinned. Details in the
  [asset pipeline](assets/pipeline.md#crowd-rendering).
- **Daylight** (`apps/client/src/environment/`): the key light follows the sun, or the moon at night, coloured by
  Babylon's physically based `Atmosphere` add-on; night drawn dim and blue; fog thinned for the camera's height; rain
  and snow around the camera; wet ground; lightning. See [time and weather](time-and-weather.md#rendering).
- **Gunfire** (`apps/client/src/effects/tracers.ts`): every round a faint streak flying out at 750 m/s to where it
  stops, and every fourth machine-gun round a bright tracer that blooms at night; a flash at each muzzle, bigger for
  machine guns, and a wisp of smoke; dirt kicked up where a miss strikes the ground. A miss scatters past its man, most
  of them low into the ground round his feet, from a hash of the shot rather than the simulation's dice, so a machine
  gun's fire shows its beaten zone. Streaks and flashes are camera-facing thin instances at least a couple of pixels
  wide; smoke and dirt are lit by the air like the level's other particles and kicked up only near the camera. A point
  light flashes at the nearest muzzle after dark (`level/night-light.ts`). A miss is followed along its whole flight: it
  stops where it first meets the ground, and hits the wire of any belt it crosses within a metre of the ground, throwing
  sparks; striking within 2.5 m of a trench's edge it bursts the parapet's sandbags in pale dust. Machine guns heat a
  round at a time and cool at four rounds a second: past 60 rounds of steady fire a German MG 08's water jacket boils
  and steams, and a French Hotchkiss, air-cooled, smokes faintly from its barrel (`heat`). Each strike is told to
  listeners with what it hit (`onStrike`: ground, wire or parapet), for its sound.
- Clustered lighting (Babylon 9) for flares and muzzle flashes.
- WebGPU first with automatic WebGL2 fallback. WebGPU saves CPU, not GPU, so it won't rescue an over-budget crowd.

## Networking (stage 2 and later)

- **Server-authoritative.** Lockstep breaks when hundreds of players join and leave mid-battle.
- **Colyseus 0.18, one room per sector.** Sector rooms are created at boot and never auto-dispose. Transport is
  uWebSockets.js through `@colyseus/uwebsockets-transport` (for now `ws`: see [the sector server](#the-sector-server));
  WebTransport only if packet loss becomes a measured problem.
- **The room wraps the simulation**: it feeds commands into `sim` and reads snapshots out. `sim` never imports Colyseus.
- **Three kinds of entities**:

| Entity                       | Per sector  | Networking                                                                                               |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| Directly controlled soldiers | 300–500     | Client prediction and reconciliation of movement; lag compensation (server rewind) for rifle shots       |
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

## Persistence

- Each sector saves its battle every minute, and when the server is stopped (Railway sends SIGTERM before a deploy); a
  crash loses at most a minute. A restart takes the battle up from its latest save; the time it was down passes without
  it.
- A save is the simulation's snapshot (`takeSnapshot`, gzipped JSON) and the ground shells have reshaped, kept as how
  far each height sample has moved since the map was generated, so craters land on the new ground when a build changes
  the terrain. The sector's war schedule is kept from the first time it opened. The last 20 saves are kept.
- SQLite for now (`apps/server/src/store.ts`, `VERDUN_DB` names the file), behind a small store interface, so Postgres
  replaces it without touching the sector.
- Versioned state format so new builds load old battles. Until older formats have migrations, a save this build can't
  read begins a new battle on the same calendar.
- Sector servers are stateful long-running processes: one sector per process, not serverless.
- War map service applies sector reports to the front and publishes it daily.
- Player data (accounts, unlocks, match results) lives in Postgres, separate from sector state. Per-tick soldier state
  never goes to the database.

## Known risks

- **Replication budget is unmeasured.** Bandwidth and encode time for about 1,000 soldiers across 100 clients decide the
  snapshot rate, quantization and relevance rules. The stage 2 load test in the [roadmap](roadmap.md) measures it.
- **Prediction is hand-rolled, not Colyseus's.** Colyseus's reconciler predicts Schema state, which would need a Schema
  mirror of the soldier's ECS components; predicting one soldier's steering with the simulation's own movement
  arithmetic needed neither. Whatever moves a steered soldier must go through `steeredPosition`, or prediction and
  server part ways (the movement test checks the two agree).
- **Line-of-sight cost.** Thousands of soldiers casting sight rays at 2–5 Hz is the main physics load. Profile it at M4
  with 400 soldiers.
- **Grid navigation is 2.5D.** Dugouts under trenches and fort interiors may need portal links between grid layers, or
  the Recast fallback below.
- **Trenches dug during a battle.** [Field works](design/field-works.md#engineering-in-the-code) need trench polylines
  carved into the height grid at runtime, with the sight heightfield, navigation and trench kit rebuilt locally. Trench
  stages on existing trenches are cheap; new trenches need a spike on local rebuild cost.
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
