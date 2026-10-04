# Morale and stamina

What keeps a soldier going, and what stops him. Part of the [game design](overview.md). Morale and suppression already
decide most fights in the simulation; stamina and fatigue are planned.

The rule that governs everything here: **these systems never take the player's soldier out of the player's hands.** A
broken bot runs or surrenders; a broken soldier under the player's control shakes, aims badly and can't sprint, but
still goes where the player steers. Taking control away feels like a bug, however realistic it is.

## The layers

| Layer          | Timescale       | Lives on      | Status  | Question it answers                          |
| -------------- | --------------- | ------------- | ------- | -------------------------------------------- |
| Suppression    | Seconds         | Each soldier  | Built   | Can he lift his head right now?              |
| Stamina        | Tens of seconds | Each soldier  | Planned | Can he run, and how far?                     |
| Morale         | Minutes         | Each soldier  | Built   | Will he advance, hold, run or give up?       |
| Squad cohesion | Minutes         | Each squad    | Partial | Does the squad act together?                 |
| Fatigue        | Hours           | Each squad    | Planned | How long can a squad stay in the front line? |
| Division state | Days            | Each division | Planned | How fresh is the sector's garrison?          |

Each layer feeds the next: suppression that lasts drains morale, running under fire drains stamina, a tired squad
recovers morale and stamina slower, and a tired division starts its men lower. See
[divisions and relief](war-map-and-season.md#divisions-and-relief) for the top layer.

## Suppression (built)

- From 0 to 1. Every round fired at a soldier, and every burst near him, adds to it; it decays by 0.12 a second, slowly
  enough that defenders stay down for a while after a barrage lifts. That race to the parapet decided many attacks.
- It spoils aim. At 0.6 a soldier is **pinned**: hugging the bottom of the trench or crater, not firing, and a soldier
  with a move order waits.
- A player's soldier can be pinned too: the camera shakes, the aim sways wide, and the screen darkens at its edges. The
  player can still move him, slowly.

## Morale (built, to be extended)

From 1 (steady) to 0 (broken). Built today: each member of a squad loses 0.15 when a squadmate falls; morale recovers by
0.02 a second; below **0.25** a soldier is broken: he stops advancing and only defends himself, and broken men surrender
when nearby enemies outnumber their friends (see [capture](../../packages/sim/src/capture.ts)). Gas costs morale when
it's smelled.

### States

| State  | Morale     | Bot behaviour                                                                                                | Player's soldier                            |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Steady | 0.6–1      | Obeys orders at once, advances under fire                                                                    | No effect                                   |
| Shaken | 0.25–0.6   | Slower to obey; won't leave cover under fire unless a leader is within 15 m                                  | Aim sway, slower stamina recovery           |
| Broken | Below 0.25 | Stops advancing, defends itself, crawls back toward the nearest friendly trench, surrenders when outnumbered | Can't sprint, heavy aim sway, muffled sound |

### What drains it (planned additions)

| Cause                                                     | Morale lost                                  |
| --------------------------------------------------------- | -------------------------------------------- |
| A squadmate falls (built)                                 | 0.15                                         |
| Any friend falls within 10 m                              | 0.05                                         |
| A heavy shell bursts within 25 m                          | 0.05, 0.1 if buried by it                    |
| Pinned for more than 10 s                                 | 0.01 a second while pinned                   |
| Gas smelled (built)                                       | A little                                     |
| Flamethrower within 30 m                                  | 0.3                                          |
| A tank in sight, before the side has trained against them | 0.1 once, then 0.01 a second while it closes |
| Seeing the enemy outnumber us within 30 m                 | 0.02 a second                                |
| The squad leader falls                                    | A further 0.1 for the squad                  |

### What restores it

| Cause                                                                                    | Morale gained                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Time out of danger (built)                                                               | 0.02 a second                                     |
| A leader within 15 m (the squad's NCO, an officer)                                       | Recovery doubled                                  |
| Below ground in a dugout                                                                 | Recovery doubled                                  |
| Own barrage falling ahead during an attack                                               | Recovery doubled, no drain from being outnumbered |
| An objective taken by the squad                                                          | 0.2                                               |
| Prisoners taken by the squad                                                             | 0.05 each                                         |
| The whistle at zero hour                                                                 | Up to 0.8 for every man going over                |
| The rum ration before an operation (a squad in a jump-off trench in the last 15 minutes) | 0.1                                               |
| A leader's rally (see below)                                                             | 0.3 for men within 20 m, once a minute            |

### Rally

A squad leader, or a player's soldier who is the squad's leader, can **rally**: a held key, 3 s standing up and exposed,
after which shaken and broken men within 20 m gain 0.3. It's a deliberate risk: the rallying man is the most visible man
on the field. Officers in later stages rally a whole platoon.

### Shell shock (planned)

A soldier who takes three heavy bursts within 25 m in five minutes, or is buried, may be **shell-shocked**: out of the
fight like a badly wounded man and evacuated the same way, returning a fraction to the
[manpower pool](sector-battle.md#manpower). Shell shock was one of Verdun's defining injuries; it makes heavy
bombardments wear a garrison down even when they kill few.

## Squad cohesion (partial)

Casualties already shake the whole squad. Planned on top:

- **The leader matters.** The squad's NCO (slot 1) doubles recovery around him; when he falls, the next man takes over
  (built for control, as succession) and the squad takes an extra shock.
- **Spread**: men more than 30 m from the leader recover no faster than alone, and are slower to take orders. Keeping a
  squad together is part of leading it.
- **Veterans**: each [veterancy mark](progression-and-community.md#the-squad-roster) adds 0.05 to a man's starting
  morale and cuts the shocks he takes by a tenth.

## Stamina (planned)

Energy for running, climbing and carrying, from 100 down to 0.

### Spending and recovering

| Action                                                             | Cost or gain per second           |
| ------------------------------------------------------------------ | --------------------------------- |
| Running (2× walking pace, built)                                   | −4                                |
| Climbing out of a trench, over a parapet                           | −15 once                          |
| Crawling                                                           | −1                                |
| Carrying a load (ammunition box, machine gun, wire, a wounded man) | Every cost × 1.5, recovery halved |
| Walking                                                            | +2                                |
| Standing or lying still                                            | +5                                |
| In a dugout                                                        | +8                                |

Mud, churned ground and uphill slopes, which already slow men down, raise running costs by the same factor. A gas mask
halves recovery: breathing through it was hard work.

### Effects

- Below 25, a soldier **can't run** and his aim sways with his breathing.
- At 0 he walks at three-quarters of walking pace until he has recovered to 25.
- Bots manage their own stamina: they walk behind a barrage and save the sprint for the rush.

### Why

From full, a man can run for about 25 s, roughly 70 m. A no man's land 150 m wide can't be sprinted. That makes the
built creeping barrage tactics the right answer: walk 70 m behind the barrage, then rush the last stretch when it lifts.
Stamina turns the decision of when to run into a real choice, makes ground pace and distance matter, and keeps players
from sprinting everywhere.

The HUD shows the controlled soldier's stamina as a thin bar under his status; the squad panel marks men who are spent.

## Fatigue (planned)

Hours in the front line wear a squad down: little sleep, constant stand-to, shellfire, wet feet.

- Each squad's fatigue rises while it's in the front line or a forward sap, holds steady in the support line, and falls
  in the reserve line.
- Fatigue lowers the morale ceiling (at most 1 − fatigue ÷ 2) and slows stamina recovery.
- A player who withdraws a tired squad to the reserve line comes back with men in better shape: rotation is worth it,
  and it pulls players through the trench system instead of piling them into the front bay.
- In winter, wet trenches add **trench foot**: a tired squad in a flooded trench in the cold loses men to it, slowly, as
  sick evacuated rather than wounded.

## How these show to the player

- The controlled soldier: suppression as screen-edge darkening and camera shake; morale as aim sway and a heartbeat
  under the mix; stamina as the bar.
- The squad: each man's state as a small icon on the squad panel and his marker: steady, shaken, broken, pinned, spent.
- Bots' morale is readable from their behaviour too: broken men crawl back, shaken men stay down.

## Balance levers

The constants live with the simulation; the [balance doc](balance.md#tuning-levers) lists the ones that tune fights. The
targets: a creeping barrage attack keeps most attackers steady to the enemy parapet; a failed attack breaks within a
minute of the barrage running away; a heavy bombardment leaves a garrison shaken but not broken unless it's caught above
ground.
