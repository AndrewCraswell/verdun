# Roadmap

Build something small and fun first, then grow it. Bots make every stage feel full. The game being built is described in
the [vision](vision.md); the systems behind each milestone are in the [architecture](architecture.md).

## Stages

| Stage                | Humans | Soldiers per sector | Sectors       | Proves                                                        |
| -------------------- | ------ | ------------------- | ------------- | ------------------------------------------------------------- |
| 1. Prototype         | 1      | about 400 (bots)    | 1             | Charging across no man's land while switching soldiers is fun |
| 2. Multiplayer alpha | 10–30  | about 1,000         | 1             | Networking, client prediction, continuous play                |
| 3. Persistent beta   | 50–150 | about 2,000         | 2–3 + war map | Front movement, seasons, bot fill-in                          |
| 4. Full vision       | 300+   | 4,000+              | many          | Only once players show up                                     |

## Stage 1: single-player prototype

One battlefield, one human, bots on both sides. No multiplayer, no accounts, no real elevation data.

Scope:

- One trench map (about 600 × 400 m) with heightmap and line-of-sight fog of war
- The player's squad of 8, with direct control and switching
- Bots on both sides with squad AI and a simple commander AI
- Rifles, one machine gun, an artillery barrage with craters, gas
- Simulation and renderer as separate packages

### Milestones

- [x] **M0 Scaffold**: pnpm monorepo (`sim`, `map`, `client`), Vite, Vitest, oxlint, oxfmt, Turborepo. ECS library
      chosen (bitECS). Babylon scene with camera, procedural terrain and 400 placeholder soldiers driven by the
      simulation.
- [x] **M1 Terrain foundation**: height grid with surface layer, 64 m terrain chunks with per-chunk rebuilds, and a
      placeholder splat material from four CC0 textures. Visual quality is deliberately deferred to the art phase.
- [ ] **M1b Gameplay trenches (greybox)**: trench polylines in the map format, carved into the height grid with a fire
      step and parapet, so they give cover and block sight. Plain geometry, no revetments or props. Soldiers spawn in
      the lines.
- [x] **M2 One soldier**: player-controlled soldier (WASD relative to the camera, mouse aim, camera follow), line of
      sight as Rapier ray casts against a map-wide heightfield, fog of war that darkens unseen ground and hides enemies
      out of sight. Trench floors hide you; the fire step lets you see out.
- [ ] **M3 Squad**: 8 soldiers, orders, switching, death moves control to the next soldier.
- [ ] **M4 Combat and bots**: rifles and MG, suppression, morale, bot squads on both sides, flow-field movement. Profile
      line of sight with 400 soldiers.
- [ ] **M5 Artillery**: barrages, crater stamping, chunk re-meshing and collider rebuilds.
- [ ] **M6 Gas**: density grid, wind, settling, masks.
- [ ] **M7 Crowd**: 400 soldiers with VAT instancing and LODs from the [core kit](assets/shopping-list.md), through the
      full [asset pipeline](assets/pipeline.md) including the encrypted pack.
- [ ] **M8 Asset comparison test**: decimate Albin's Poilu to 15k and 5k triangles on a 2K atlas, place it beside the
      AmeliaTeale Poilu at gameplay zoom. If the difference is invisible, re-texture the crowd packs and stop. If it is
      obvious, commission a base soldier to the [commission spec](assets/art-direction.md#commission-spec).
- [ ] **M9 Playtest build**: deployed to Railway as a static site with a shareable link.

The prototype answers the riskiest question first: is it fun? If not, we change the design before building networking.
Until then everything stays greybox: placeholder terrain, capsule soldiers, plain trench slots.

### Art and level design phase (after the playtest)

Only once the playtest shows the core loop is fun:

- Terrain materials to the quality bar in [art direction](assets/art-direction.md), from purchased and Megascans assets.
- Trench meshes along the trench polylines: revetments, duckboards, sandbags, wire, dugout entrances.
- Level authoring: the in-game editor and Tiled import (see [tooling](tooling.md#editor-plan)), and real elevation data.
- Lighting, smoke, weather and the global colour grade.

## Stage 2 and later

See [architecture](architecture.md#networking-stage-2-and-later) for networking, persistence and services. Real
elevation data (IGN RGE ALTI for the actual Verdun terrain), accounts and the war map come in stages 2–3.

Stage 2 starts by adding the Colyseus server app, then its first performance milestone: a load test with **100 bot
clients, each controlling a squad, fighting over one objective** with real navigation, line of sight, physics and
replication (about 1,000 soldiers). An ECS movement benchmark alone doesn't count. The results set the snapshot rate,
quantization and sector size.
