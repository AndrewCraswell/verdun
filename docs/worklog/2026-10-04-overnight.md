# Overnight work log, 4 October 2026

Autonomous session while the developer slept. Each entry says what changed, why, and any problem worked around.

## Starting point

- Artillery (M5) was committed in `eb6f3aa`, but a headless 10-minute battle showed the attack was unrealistic: a
  2-minute bombardment killed 84 of 200 dug-in Germans, then German rifles killed 141 of the 200 attacking French while
  they stood waiting behind the creeping barrage, and French shells killed 45 of their own men. Only 1 Frenchman was
  left; nobody reached the German trench.
- Diagnosis, by attributing every death to its cause: defenders had no dugouts, attackers never went prone, and there
  was no standing barrage on the enemy trench while the creeping barrage approached.

## Issues worked around

- Another agent changed `pnpm-lock.yaml`, `apps/client/package.json` and `vite.config.ts` without installing, so every
  `pnpm` script stops at `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`. I ran checks with
  `pnpm --config.verify-deps-before-run=false` rather than run an install underneath the other agent.
- The level-design agent is mid-change in `packages/map` (map format 4, Fleury sector, scenery, wire). Two
  `trenches.test.ts` tests fail on their uncommitted work. I don't touch those files and commit only my own.
- The level-design agent's trench dressing (`Env_Trench_Deep_Intersection_02` clones in `apps/client/src/level/`) draws
  more thin instances than its buffer holds, so WebGPU rejects every frame and the game shows only grey. Not my code, so
  I left it; to verify in the browser I hid those meshes from the console (`isVisible = false`) for my session only.
  Worth a look by that agent: each clone's thin-instance buffer has one matrix fewer than `thinInstanceCount`.
- The dev server reloads every few minutes as other agents edit files; browser checks were re-run after each reload.

## Realistic combat: stance, dugouts, surrender

Committed as "Add stance, dugouts and surrender". In `packages/sim`:

- **Stance** (`stance.ts`): standing, prone or sheltering. Squads lay their men down whenever they stop in the open or
  are pinned, and get them up to move. Prone men are 30% as easy to hit, have half the shell-fragment radius, a third of
  the shrapnel exposure, eyes at 0.45 m (so folds of ground hide them) and crawl at a quarter speed. The player's
  soldier keeps whatever stance the player picks: **Z** toggles prone.
- **Pinned soldiers stop**: a soldier with a move order waits while suppression is at or above 0.6.
- **Dugouts**: a trench garrison goes below when shells burst within the shell's suppression radius; each squad's leader
  stays up as sentry. Men below can't be seen or shot and take a fifth of the blast radius. They climb back up 15 s
  after the last close burst, plus 6-20 s to climb (the race to the parapet); a sentry seeing attackers within 40 m
  brings them up as soon as shells have stopped for 3 s. An order to move gets men up whatever is falling.
- **Standing barrage**: a barrage attack also shells the objective trench (field guns plus a fifth as many heavies)
  until the creeping barrage is one lift short of it.
- **Rush on the lift**: attackers go for the objective the moment the creeping barrage lifts past it, instead of waiting
  a full lift 70 m out. The barrage now opens 70 m ahead and the infantry follow 70 m behind (it was 40/60).
- **Surrender** (`capture.ts`): men caught below by an attacker within 8 m surrender 75% of the time, otherwise come up
  fighting; broken men surrender when enemies within 15 m outnumber friends. Prisoners walk to their captors' rear and
  are drawn in a faded uniform.
- **SOS barrage** fix: "attackers in no man's land" now means out of every trench and between the lines. On the zigzag
  Fleury lines, men in forward bays had triggered both sides' SOS barrages at the first tick.
- Snapshots are version 6 (stance, shelter timers, prisoners).

Headless 10-minute battles (2-minute bombardment, then the whistle), before and after:

| Map            | French lost     | German killed | German captured | French killed by own shells |
| -------------- | --------------- | ------------- | --------------- | --------------------------- |
| Prototype, M5  | 199 of 200      | 138           | 0               | 45                          |
| Prototype, now | 94 (4 captured) | 89            | 110             | 23                          |
| Fleury, now    | 78 (8 captured) | 87            | 108             | 17                          |

Without the bombardment the attack still succeeds (136 captured). That's defensible, since the creeping barrage was the
1916 breakthrough, but the bombardment's real job was cutting wire, and there is no wire mechanic yet. Next once the
level-design agent's `WireBelt` lands in the committed map format: uncut wire stops or slows infantry, and HE shells cut
it.

## CI fix

CI had failed on both artillery commits: the HE casualty test builds 120 Rapier heightfields and timed out at 5 s under
coverage instrumentation (about 7 s on the runner, 0.8 s locally). `packages/sim/vitest.config.ts` now allows 30 s per
test. CI is green from `acabf87`.

## Gas (M6)

Committed as "Add gas: phosgene shells, drifting clouds and masks".

- **Grid** (`packages/sim/src/gas.ts`): 4 m cells of concentration in mg/m³ in a 2 m layer near the ground, stepped at 5
  Hz. Semi-Lagrangian wind advection, turbulent diffusion (3 m²/s), drainage toward lower neighbours (so gas fills
  trenches and craters), and decay with a 4-minute half-life in the open and 15 minutes in hollows. It costs nothing
  while the field is clear. Craters refresh the grid's ground.
- **Shells**: `Shell.FieldGas`, 0.6 kg of agent with a small burster.
- **Masks**: a soldier smells gas at 10 mg/m³, shouts the alarm (friends within 60 m start masking), loses some morale
  and gets the mask on in 5-12 s. A mask lets 3% through, cuts accuracy to 70% and walking pace to 85%, and comes off
  after a minute of clean air. Men in dugouts breathe 60% of the air above.
- **Casualties**: dose in mg·min/m³; past about 1,600 (±40% per man) the soldier chokes and is out within a minute.
- **Wind** is part of the simulation (default 2 m/s from the west, slightly north) and a `wind` command sets it.
  Snapshots are version 7 (gas grid, wind, masks, doses).
- **Client**: `effects/gas-cloud.ts` tints the ground and draws a low, jittered, translucent cloud where gas is
  dangerous. The battlefield scene creates and redraws it itself, so `main.ts` needed no change.
- **Calibration**: German Green Cross on the French front line, 120 rounds a minute for 2 minutes (240 shells). It
  killed no one by gas (7 by bursters); masks went on in time and about 250 men were still masked 5 minutes later.
  Historically the 22 June 1916 Fleury bombardment caused about one casualty per 70 shells, so the order of magnitude is
  right: gas shells harass and blind more than they kill.

**Not done: a key to call gas fire.** Wiring a new command into `main.ts` would mean editing a file the level-design
agent has uncommitted changes in. Until then, from the dev console:
`verdun.sim.pendingCommands.push({ type: "fire-mission", plan: { side: 0, shell: 3, fromX: 250, toX: 350, z: 280, band: 30, roundsPerMinute: 60, delay: 0, duration: 60 } })`.

## Ground, smoke, running and the protective barrage

Committed as "Add ground pace, barrage smoke, running and the protective barrage".

- **Ground pace** (`packages/sim/src/terrain.ts`): grass full pace, chalk 95%, mud 60%, shell-churned ground 50%,
  duckboarded trench floors 90%. Slopes cost 2.5× their grade uphill and a little downhill. A trench wall is a scramble
  of several seconds. Craters churn the ground, so bombarded no man's land is slow going.
- **That broke the attack.** Crossing churned ground at 0.7 m/s, the French lost the race to the parapet every time
  (1-34 of 200 left). Slowing the barrage (50 m per 120 s, 50 m standoff) made it worse: more time in the open.
- **Barrage smoke** (`packages/sim/src/smoke.ts`): every burst releases smoke and dust into a second cloud grid
  (half-life 25 s, no drainage). Sight lines sum the smoke along their track; optical depth dims hit chance by `exp(-τ)`
  and above 3 blocks sight altogether. A barrage measures τ ≈ 2-5 across its band, a moving curtain that hides the
  infantry following it. The client draws the smoke as a tall grey-brown haze (`createSmokeCloud`).
- **Running**: move orders can be run at twice walking pace. Squads run for the objective once the barrage lifts off it.
- **Protective barrage**: off the objective, the creeping barrage's first lift lands a full lift beyond it (it had
  landed as little as 17 m beyond, among the attackers rushing in), then it jumps to a protective line 150 m beyond and
  holds for four lifts.
- Fixed along the way: tests that relied on full walking pace now build their maps on firm ground (`createFlatMap`
  defaults to mud).

Headless battles (2-minute bombardment, then the whistle; 10 minutes):

| Map, seed       | French left | Germans captured | Germans left | French killed by own shells |
| --------------- | ----------- | ---------------- | ------------ | --------------------------- |
| Prototype, 1916 | 88          | 59               | 10           | 14                          |
| Prototype, 7    | 104         | 85               | 3            | 14                          |
| Fleury, 1916    | 111         | 71               | 10           | 8                           |
| Fleury, 7       | 105         | 70               | 14           | 10                          |

A well-run barrage attack now takes the trench at about 45-55% casualties, with most of the garrison captured or killed,
and own shells cause 10-15% of the attackers' losses. That is in line with successful French attacks at Verdun in
late 1916.

### Notes for the level-design agent and the developer

- The level-design agent owns `README.md`, `docs/roadmap.md` and `docs/architecture.md` until it commits, so the roadmap
  doesn't mention ground pace, smoke and running yet. M5 and M6 are already ticked in the committed roadmap.
- `docs/architecture.md` says smoke and gas block sight "through their" grids: that's now true.

## Grenades

Committed as "Add hand grenades".

- `Shell.Grenade`: about a 3 m radius for half casualties in the open, 0.8 m behind earth, so trench traverses shield
  the next bay. Thrown, not fired: a 4.5 s fuse, scatter of 1 m plus 6% of the distance, 25 m maximum.
- Every soldier carries 3. AI soldiers bomb the nearest enemy 6-25 m away whom they can't shoot properly (in a trench
  bay, behind a parapet, flat in a shell hole), unless a friend is within 8 m of the target or nearer to it than the
  thrower. Without that second rule, men running into a trench were killed by their comrades' bombs (up to 28 a battle);
  now it's 2-8. **Q** throws the player's grenade at the pointer. Snapshots are version 9.
- Battle matrix after grenades: French 100-136 of 200 left, Germans 89-104 captured and 0-8 left.

## Fog of war for props

The level-design agent asked for `createFogOfWar(..., { materials })`: extra materials, such as props, darkened like the
ground and toggled with it. Done; `fog.plugins` lists every plugin. They'll pass the level's materials from `main.ts`,
which they own.

## Machine guns, rifle accuracy and a determinism bug

Committed as "Make machine guns sweep, rifles fire like men under fire, and soldier order deterministic".

- **Beaten zone**: a machine-gun round that misses its target can still hit the man nearest it within a strip 3 m wide
  and 5 m + 8% of the range long either side of the aim point, at 60% of a direct hit's chance.
- **Grazing fire**: machine guns engage men lying in the open at any range; riflemen still ignore covered targets beyond
  100 m, and nobody wastes fire on men in a trench.
- **MG crews climb first**: 3-8 s out of a dugout instead of 6-20 s. A tally showed German MGs spent about 92% of a
  barrage attack below ground.
- **Rifle accuracy** under fire: 0.45 at point blank, falling by e every 100 m (was 0.55 / 150 m). Hit rates fell from
  9.6% to 4.3% of shots.
- **Determinism bug fixed**: `soldierIds`, `fallenIds` and `capturedIds` now return ids in ascending order. The ECS
  query order changes as soldiers die and differs after a snapshot restore, so systems drawing random numbers per
  soldier diverged between a game and its restored save. A combat determinism test caught it after the accuracy change.

Results: an attack with no artillery at all is wiped out in two minutes (1 of 200 French left, 2 Germans dead; MGs 37
kills, rifles 158). Barrage attacks: French 94-126 of 200 left, 83-118 Germans captured.

## Reserves and the counter-attack

Committed as "Add reserves and the counter-attack".

- **Reserves**: the skirmish mans each side's support line (the second fire trench back) with 64 reserves per side, in a
  new `reserve` squad order: they wait below in the dugouts, sentries up, until sent in. The French reserves go over
  with the whistle as a second wave.
- **Commanders** (`packages/sim/src/commander.ts`): every 5 s each side checks its front line. It's lost when at least 8
  enemies are within 15 m of it and outnumber the defenders left there 3 to 1. Three minutes later (the German Gegenstoß
  came in minutes, not hours) the guns pound the lost trench for 2 minutes. Then the reserves leave their dugouts and go
  in behind a creeping barrage. One counter-attack per side. Snapshots are version 10.
- **Load-order bug**, reported by the level-design agent: the dev build didn't boot
  (`Cannot access 'TICK_RATE' before initialization`), because `commander.ts` computed a constant from `TICK_RATE` at
  module load and it and `simulation.ts` import each other. In Node the same constant silently came out `NaN`, so the
  commander never ran. Fixed by converting at the point of use. I checked the rest of the sim for the same pattern and
  found none.
- Result: the counter-attack goes in about 5 minutes after the front falls. The preparation kills about 25 of the 150
  French holding the captured trench. The 56-62 reserves then fail against them, outnumbered over 2 to 1, at a cost of
  15-25 more French.

## Barbed wire, front-line spans and wire detours

Committed as "Add barbed wire, front-line spans and detours through the gaps". The level-design agent committed map
format 4 (wire belts, knife rests, objectives) in `98032ed`.

- **Wire** (`packages/sim/src/wire.ts`): the map's belts are staked on a 1 m grid, about 3.4 m deep, plus knife rests.
  Getting through intact wire costs 95% of walking pace (about a minute a belt). Shells cut it clean within half their
  cut radius and partly out to its edge: 5 m for heavy HE, 2.5 m for field HE, 1.2 m for shrapnel, 0.8 m for a grenade.
  A `wire-cut` event tells renderers, and snapshots (version 11) carry only the cut cells.
- **Detours**: when a squad sends a soldier somewhere and the straight way crosses intact wire, he goes for the nearest
  crossing within 80 m (a patrol gap, a belt's end, or a lane cut by shells) and through it, then on.
- **Front-line spans**: Fleury's front lines zigzag 40-50 m deep (the German front trench runs from z 242 to 282), so
  the average z misplaced everything. `frontLineSpan` gives each line's forward and rear edges. The creeping barrage now
  opens 70 m beyond our most forward bays, the standing barrage covers the enemy trench's whole depth, and attackers
  rush only once the barrage has lifted past its rear. The SOS barrage and the commander use the edges too. Barrage
  attacks take an `objectiveDepth`.
- **Wire-cutting bombardment**: B now also sweeps the belts 15-45 m in front of the enemy line at 600 rounds a minute,
  standing in for days of wire-cutting. One bombardment cuts about 15% of the wire, and the attack on Fleury fails
  (50-65 of 264 French left). Three bombardments cut about 39% and open 74-82 m of lanes, and the attack succeeds
  (109-129 left, 80-90 Germans captured). How long to prepare is now a real decision.
- **Determinism**: `Math.hypot` in artillery replaced with `Math.sqrt`, which is correctly rounded on every engine.
- **For the crowd renderer** (the level-design agent's M7 work): `view.useSoldierRenderer({ sync })` in
  `battlefield-scene.ts` hands soldier drawing to animated models and hides the capsules. There's also a new `throw`
  event when a grenade is thrown.

**Not pushed.** The level-design agent's commits `98032ed` and `723e184` are under mine, and their user asked them not
to push yet, so my commits wait locally until they say so.

## Objectives and a HUD

Committed as "Add objectives and a heads-up display".

- **Objectives** (`packages/sim/src/objectives.ts`): the map's objectives start with whichever side's lines they lie
  behind, or no one in no man's land. Every 2 s, a side with men within the radius and no enemy there takes one (an
  `objective-taken` event). With both there it's contested and stays with whoever held it; ground left empty stays held.
  `sectorControl(sim)` gives each side's share. Snapshots are version 12.
- **HUD** (`apps/client/src/hud/`): bottom left, the soldier you control (stance, gas mask, pinned, wounded, grenades)
  and the squad's strength; top right, the sector's objectives with holders and both sides' killed and captured; top
  centre, a battle log of changes of hands, counter-attacks, prisoners, surrenders and the gas alarm. The model is pure
  and unit-tested; the DOM view is checked in the browser. **Not yet in `main.ts`**: the level-design agent owns it and
  has been asked to add `createHud(document.body, sim, playerSquad, TICK_RATE)`, with `hud.record(sim.events)` after
  each step and `hud.update(frameSeconds)` each frame. Until then it can be tried from the dev console (see the commit
  for the snippet).

## Debug statistics (asked for by the developer)

Committed as "Add a debug statistics overlay". `apps/client/src/debug/`: F3 shows or hides a monospaced overlay in the
bottom right, in every build, so playtesters can report numbers too. It shows:

- frame rate, average and worst frame time over the last second
- render time and simulation time per frame
- draw calls, active meshes, WebGPU or WebGL2, render size
- the battle clock and soldiers, fallen and prisoners by side
- fire missions and shells in flight, gas and smoke cells, wind, JS heap (Chrome)

Babylon's `SceneInstrumentation` runs only while the overlay is shown. The overlay needs a few lines in `main.ts`, which
the level-design agent owns; they've been asked to add them: `createDebugStats(document.body, engine, view.scene, sim)`,
wrap the step loop in `stats.time("simulation", ...)`, and `stats.update()` after `scene.render()`. Checked in the
browser by loading it from the console: 57 fps, 17.4 ms average and 31.7 ms worst frame, 1.2 ms render, 263 draw calls
on Fleury with 526 soldiers.

## Coordination: weather agent in packages/sim

A "Day/night and weather" session is editing `commands.ts`, `combat.ts`, `simulation.ts`, `snapshot.ts` and `index.ts`
(adding `sim.environment`, sky and weather). To avoid two agents in the same files, I shelved my next sim change,
artillery ammunition budgets (saved as a patch in my scratchpad), until they commit. It's ready to reapply.

## Camera (asked for by the developer)

`apps/client/src/control/camera-rig-model.ts` (pure, tested) and `camera-rig.ts` (input) replace Babylon's stock camera
inputs:

- **Pan**: arrow keys, the pointer at a screen edge, or Shift + middle-drag to grab the ground. Pan speed scales with
  zoom, so it feels the same close in and far out, and eases in and out rather than starting and stopping dead.
- **Turn and tilt**: middle-drag, or Shift + Left and Right arrows.
- **Zoom**: the wheel, 8 to 450 m. When panning freely it zooms toward the point under the pointer, as a map does. The
  view tips toward overhead as it pulls back and drops toward the ground close in, within ±0.3 rad of tilt the player
  sets.
- **Follow**: the camera follows the soldier under control until the player pans away. Space, moving the soldier with
  WASD, or switching soldier brings it back.
- Everything is damped exponentially, so it moves the same at 30 or 144 fps (a test checks this). The camera never goes
  below the ground behind it (it tips toward overhead to clear a ridge), and the view stays on the map. The ground under
  the focus is averaged over a few metres, so the view glides over craters instead of bobbing.
- Anything else that sets the camera's radius, such as `main.ts` framing the start, is taken as the player's zoom.

## Screen layout, debug dock and the menu (asked for by the developer)

- **Layout**: each corner has an owner. The soldier and squad are bottom left, the sector top right, the battle log top
  centre, debug panels top left, and the menu hint bottom right.
- **Debug dock** (`apps/client/src/debug/dock.ts`): one column in the top left that every debug panel appends to. F3
  shows or hides the whole dock, and the debug statistics now live in it. The weather agent's panel sat on top of the
  HUD's soldier panel; they've been asked to move it into the dock.
- **Controls registry** (`apps/client/src/ui/bindings.ts`): the single list of keys and what they do, grouped. A test
  checks that every key the input handlers act on is listed. Modules outside the game's own input (the weather keys, the
  death map) add theirs with `registerBindings`.
- **Menu** (`apps/client/src/ui/menu.ts`): Esc opens it over a dimmed battlefield, listing the controls in two columns
  with a "Back to the battle" button. The battle carries on behind it, as it will online. While open it takes key
  presses away from the game (key releases still get through, so held keys don't stick). It needs
  `createMenu(document.body, { development: import.meta.env.DEV })` in `main.ts`; the level-design agent has been asked.

## Pathfinding

`packages/sim/src/navigation.ts` gives every move a route, the way RTS games move big formations:

- **Cost grid**: 2 m cells costed from walking pace by surface and duckboards, the map's scenery as obstacles (ruins,
  walls, bunkers, guns, wrecks and trees impassable; rubble, logs, machine-gun pits and flooded shell holes slow), and
  wire (averaged across the cell, so a lane shows as passable). It's rebuilt when shells have cut wire, at most every 10
  s.
- **Flow fields**: one per destination (a creeping-barrage line, an advance point, a follow point snapped to an 8 m
  grid) by Dijkstra over the grid, with uphill grades dear and steep drops a little dear. Up to 12 are cached and shared
  by every soldier heading there, so the cost doesn't grow with the number of soldiers.
- **Steering**: a soldier walks straight when the line is clear of obstacles and wire, checked at the wire's own 1 m
  grain. Otherwise he heads for the furthest point along the field he can walk to in a straight line, starting from the
  middle of his own cell, so he never clips a gap's tangles. It replaces the earlier wire-gap detour.
- **Known limit**: fields are caches derived from the ground. A restored save rebuilds them from the ground as it is, so
  routes can differ from the original game until the next rebuild. Within a run everything is deterministic.
- Results: three bombardments then the whistle on Fleury: 130-137 of 264 French left, 46-50 Germans captured. Cost is
  about 2.5 ms a step for 528 soldiers on Fleury, up from about 1.6 ms before the night's later systems; profiling is
  next.
- `Squad.members` is now mutable, for the Game mechanics session's squad redeploy.
