# Balance

How the game stays fair between sides, populations and time zones, and how we measure it. Part of the
[game design](overview.md).

## Principles

1. **Symmetric in strength, asymmetric in flavour.** French and German kit differ, and the season's
   [years](war-map-and-season.md#the-years) swing the initiative from side to side, but over a war neither side should
   be favoured by the rules.
2. **Population is not power.** A sector's force is set by the war map, not by head count. More players on a side means
   more soldiers under human control, not more soldiers.
3. **Defence wins locally, preparation wins attacks.** A dug-in defender beats an unprepared attack every time, and a
   well-prepared attack beats a dug-in defender most of the time. Neither should be a sure thing.
4. **Advances get harder as they go.** The attacker outruns his guns, his supply and his fresh men. No mechanic rewards
   the side that is already winning with more of what won.
5. **Every lever is data.** Weapon numbers, allocations, timers and caps live in configuration, so balance changes are
   data changes, tested by the [harness](#test-harness) before they ship.

## Population

The largest risk to a persistent war game is one side outnumbering the other. Foxhole's wars are often decided by
population, and players feel it.

### Sides

- **Side is chosen per season** and locked for it. Switching mid-season is allowed once, with a 48-hour wait and the
  loss of the season's rank. This stops bandwagoning onto the winning side and spying.
- **New players are offered the smaller side** first, with a small, visible reward for taking it (a cosmetic and a
  service-record mark). The choice stays theirs.

### Sectors

- **Force caps**: each side fields the same number of soldiers in a sector (500 each in stage 2, more later). Humans
  replace bots within the cap.
- **Human caps**: a side's humans in one sector may not exceed the other side's humans × 1.5 + 20. Over the cap, a
  player is offered the sectors with room, or a short queue. The +20 lets a sector fill when few are online.
- **Bots on the outnumbered side** get the squads with the best positions and veterans, and the commander AI gives them
  priority for fire support, so the human advantage is in judgement, not numbers.

### Bots

Bots set the floor of the game. Targets, measured by the harness:

| Situation                                    | Target                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Bots against bots, same preparation          | Either side's operation succeeds 40–60% of the time                                                                   |
| One human squad in a bot sector              | The human squad causes 1.5–2.5 times the casualties of a bot squad in the same role, at no more than equal losses     |
| A human side against a bot side, equal force | The human side wins most operations, but a well-prepared bot defence still costs it 30%+ casualties                   |
| Bots defending at an empty hour              | A human attack of up to 20 squads cannot take more than one trench line in an hour against bots in prepared positions |

## Time zones

The war runs round the clock; players don't.

- **The day's line counts held ground only** (see [consolidation](sector-battle.md#consolidation)). Ground taken in the
  last 30 minutes before the cutoff can't count that day.
- **Operations need warning**: at least 30 minutes between planning and zero hour, and a preparatory bombardment that
  the defender hears. The defender's commander AI reinforces a threatened sector as soon as a bombardment starts.
- **Operations per sector per day are capped** (three per side), and above all limited by shells, which the war map
  hands out daily, not hourly. A side that spends its budget at 4am has nothing at 8pm.
- **The front moves at most one trench system per sector per day.**
- **Zero hours spread across the day**: the commander AI schedules its own operations at varied hours, and the daily
  2-hour day-night cycle means night falls at different real hours each day.

## Snowballing

A side that wins early shouldn't win automatically. Brakes, from most to least important:

1. **Guns lag the advance.** After an advance, the side's batteries are out of range of the new enemy line until they
   move up overnight; the second day's attack has weaker support.
2. **Defence in depth.** Each side has three fire trenches and wire belts; taking the first line puts the attacker in
   front of the second, which is untouched.
3. **Supply distance.** Sectors further from the side's supply nodes receive less of their allocation.
4. **Salients.** A sector pushed past its neighbours takes fire from three sides (see
   [neighbours](war-map-and-season.md#neighbours)).
5. **The arc.** The calendar shifts resources to the side that was weaker early.

There is no direct pity mechanic. Comebacks come from these rules and from the arc, so they feel earned.

## Tuning levers

The numbers that tune the game, where they live, and their values today. Each system's own levers (morale and stamina,
logistics, operations, artillery and air, armour, squad types) are listed at the end of its doc. "Built" values come
from the simulation; the rest are starting values in these docs.

| Lever                                  | Value today                                                          | Tunes                                       |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| Rifle hit chance                       | 0.45 at point blank, × 1/e per 100 m (built)                         | Lethality of fire, value of closing in      |
| Rifle hold-fire range on covered men   | 100 m (built)                                                        | How quiet quiet lines are                   |
| Machine-gun beaten zone                | 3 m wide, 5 m + 8% of range long, 60% chance (built)                 | Machine guns against charges                |
| Prone exposure                         | 30% as easy to hit (built)                                           | Value of going to ground                    |
| Pinned threshold                       | Suppression 0.6 (built)                                              | How long attacks stall under fire           |
| Grenade radius                         | 3 m in the open, 0.8 m behind earth (built)                          | Trench fighting                             |
| Mask leakage, donning time             | 3%, 5–12 s (built)                                                   | Gas lethality                               |
| Gas casualty dose                      | 1,600 mg·min/m³ ± 40% (built)                                        | Gas lethality                               |
| Wire pace                              | 5% of walking pace (built)                                           | Value of wire cutting                       |
| Ground pace on churned ground          | 50% (built)                                                          | Cost of crossing a bombarded field          |
| Counter-attack delay                   | 3 minutes, then a 2-minute bombardment (built)                       | Defender's answer                           |
| Capture time                           | 30 s                                                                 | How fast ground changes hands               |
| Consolidation time                     | 30 minutes, halved by engineers                                      | Counter-attack window, night raids          |
| Redeploy delay                         | 30 s, rising to 90 s as the pool empties (built)                     | Cost of dying                               |
| Stretcher-bearer teams per side        | 6 (built)                                                            | How many wounded are saved                  |
| Aid post capacity and triage           | 8 at full speed; 40% back in 600 s, 50% to hospital, 10% die (built) | Manpower returned from the wounded          |
| Force per side per sector              | 500 in stage 2                                                       | Server budget, battle density               |
| Bot replacement floor                  | A quarter of the pool kept for players (built)                       | How fast the line thins as reserves run out |
| Skirmish pool                          | 160 men a side (built)                                               | Attrition in the prototype                  |
| Daily allocations                      | Set by the calendar                                                  | The season's arc                            |
| Operations per side per sector per day | 3                                                                    | Pace of the war                             |
| Main-effort vote bonus                 | 30%                                                                  | Player influence on the war                 |
| Front move cap                         | One trench system a day                                              | Safety net against collapses                |
| Balance weights                        | To tune with the season harness                                      | How the war is won                          |

## Test harness

Balance is tested, not argued. Two harnesses, both headless and deterministic (seeded) because the simulation is pure.

### Battle matrix (exists informally, stage 1)

The [overnight work log](../worklog/2026-10-04-overnight.md) already balances by running 10-minute headless battles on
several maps and seeds and attributing every casualty to its cause. That becomes a script and a set of **acceptance
bands** that a balance change must stay inside:

| Scenario (Fleury, French attacking)                      | Band                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| No artillery                                             | Fails on every seed                                        |
| One wire-cutting bombardment, then a creeping barrage    | Fails on most seeds                                        |
| Three bombardments, then a creeping barrage              | Succeeds on 60–90% of seeds, at 35–60% attacker casualties |
| Own-shell casualties in a barrage attack                 | 5–15% of the attackers' losses                             |
| Counter-attack without preparation                       | Fails on most seeds                                        |
| The same scenarios with sides swapped (German attacking) | Within 15 points of the French result                      |

Runs nightly in CI once it is fast enough; a change that moves a scenario out of its band needs a reason in its commit.

### Season harness (stage 1–3)

The war map is pure logic too. The season harness plays whole seasons turn by turn, with each sector's day resolved by a
fast statistical model fitted to the battle matrix (simulating every sector tick by tick for 42 days would take too
long). It answers:

| Question                                   | Target                                    |
| ------------------------------------------ | ----------------------------------------- |
| Equal populations, 100 seeds               | Each side wins 40–60% of seasons          |
| One side with twice the players            | The bigger side wins no more than 75%     |
| Seasons ending in collapse before December | 10–30%; most wars should run their course |
| The front's total movement over a season   | A few kilometres at most, as at Verdun    |

### Telemetry (stage 2 and later)

Every sector logs, per hour: humans and bots per side, operations and outcomes, casualties by cause and range, ground
changing hands, shells spent by type, time to consolidation, and where soldiers die (heat maps). Balance changes are
judged against it, and the season harness is refitted to it.
