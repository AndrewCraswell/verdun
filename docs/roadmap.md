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
- [x] **M3 Squad**: squads of 8 with follow, hold and advance orders; switching soldier (Tab, 1–8); the fallen stay on
      the field and control passes to the next living squadmate. Enemies show when any squadmate sees them. Deaths come
      from a dev-only kill key until combat (M4).
- [x] **M4 Combat and bots**: rifles and machine guns firing along Rapier sight lines; hit chance from range, cover,
      movement, suppression and morale; casualties shake squad morale and broken soldiers stop advancing. Every soldier
      not under a player's control picks and engages targets on their own, holding fire on covered targets beyond 100 m
      so quiet lines stay quiet. The whistle (G) sends the French over the top. 400 soldiers in combat hold 60 fps.
      Flow-field navigation is still to come: soldiers walk straight lines.
- [x] **M5 Artillery**: field and heavy guns with historical dispersion and flight times; bombardments, calls for fire,
      creeping and standing barrages, and the defenders' SOS barrage. Craters reshape the terrain, its meshes and the
      sight lines. Soldiers lie prone in the open, garrisons shelter in dugouts under shellfire and race back to the
      parapet when it lifts, and men caught below or broken and outnumbered surrender. A barrage attack on the prototype
      sector takes the German trench for about half the attackers, with most of the garrison captured.
- [x] **M6 Gas**: field gas shells (Green Cross, French No. 5) release phosgene into a 4 m density grid that the wind
      carries, turbulence spreads and gravity drains into trenches and craters, where it lingers. Soldiers smell it,
      raise the alarm and mask up in 5-12 s; masks let 3% through, slow men and spoil their aim. Breathing past about
      1,600 mg·min/m³ disables. A 240-shell gas bombardment mostly forces masks, as at Fleury in June 1916. Drawn as a
      ground tint and a low cloud. A key to call gas fire waits on `main.ts`.
- [ ] **M7 Crowd**: 400 soldiers with VAT instancing and LODs from the
      [Synty soldiers](assets/art-direction.md#version-1-synty-polygon), through the full
      [asset pipeline](assets/pipeline.md) including the encrypted pack.
- [ ] **M8 Playtest build**: deployed to Railway as a static site with a shareable link.

The prototype answers the riskiest question first: is it fun? If not, we change the design before building networking.
Until then everything stays greybox: placeholder terrain, capsule soldiers, plain trench slots.

### Art and level design phase (after the playtest)

Only once the playtest shows the core loop is fun. Version 1 uses the
[Synty packs](assets/art-direction.md#version-1-synty-polygon) throughout.

Started early: the prototype battlefield is now the authored [Fleury sector](level-design.md), with Synty ground
textures, the trench kit along every trench, wire, craters, ruins, woods and emplacements, in dev builds only until the
encrypted asset pack (M7) exists. Still to come:

- Level authoring: the in-game editor and Tiled import (see [tooling](tooling.md#editor-plan)), and real elevation data.
- Lighting, smoke, weather and the global colour grade. Started: a day and night every 117 real minutes and a week of
  the war each real day, the sun and moon follow the 1914–1918 calendar, the weather cycles through seasonal patterns
  with rain, snow, fog and thunderstorms, and night and fog limit sight in combat (see
  [architecture](architecture.md#time-of-day-and-weather)). Since then: history's weather of 1914–1918, flares and
  muzzle flashes in night fighting, mud, the trench routine of stand-to, sentries, raids and wiring parties, cloud
  shadows and lying snow (see [time and weather](time-and-weather.md)).

## After version 1: art remaster

Version 1 is the full game on Synty art. Once it is finished, the art is redone toward the
[remaster target](assets/art-direction.md#remaster-target-muted-documentary-realism):

- **Asset comparison test**: decimate Albin's Poilu to 15k and 5k triangles on a 2K atlas, place it beside the
  AmeliaTeale Poilu at gameplay zoom. If the difference is invisible, re-texture the crowd packs and stop. If it is
  obvious, commission a base soldier to the [commission spec](assets/art-direction.md#commission-spec).
- Buy the realistic kit in the [shopping list](assets/shopping-list.md#remaster-realistic-kit) and Megascans trenches.
- Replace terrain, trench, prop and soldier art; the simulation and map format don't change.

## Stage 2 and later

See [architecture](architecture.md#networking-stage-2-and-later) for networking, persistence and services. Real
elevation data (IGN RGE ALTI for the actual Verdun terrain), accounts and the war map come in stages 2–3.

Stage 2 has begun with the sector server, so the war carries on between visits: it runs the battle on the real clock and
keeps it in SQLite across restarts (see [the sector server](architecture.md#the-sector-server) for what comes next:
joining and leaving squads, the client playing over the network, client-side prediction, hosting). Then its first
performance milestone: a load test with **100 bot clients, each controlling a squad, fighting over one objective** with
real navigation, line of sight, physics and replication (about 1,000 soldiers). An ECS movement benchmark alone doesn't
count. The results set the snapshot rate, quantization and sector size.
