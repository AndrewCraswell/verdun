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
