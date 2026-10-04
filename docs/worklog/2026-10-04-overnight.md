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
