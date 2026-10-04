# Sector battle

One sector of the front, fought continuously for the whole season. Part of the [game design](overview.md).

A sector is a stretch of the real Verdun front a few hundred metres wide, with both sides' trench systems facing across
no man's land: the [Fleury sector](../level-design.md#the-fleury-sector) is the first. Its battle never ends and never
resets during a season. Craters pile up, wire is cut and relaid, villages are ground to rubble, and the line moves a
trench at a time.

## The rhythm of a sector

A sector that is all-out assault around the clock is noise. Real trench war alternated long quiet stretches with short,
violent offensives, and that rhythm is what makes the big moments land. The sector has two modes, decided by what each
side's commander is doing:

| Mode          | Share of time | What happens                                                                                |
| ------------- | ------------- | ------------------------------------------------------------------------------------------- |
| **Quiet war** | Most of it    | Sniping, harassing fire, patrols, raids, wire work, digging, mining, gas harassment         |
| **Operation** | A few a day   | A planned attack: preparation, zero hour, the assault, consolidation and the counter-attack |

Quiet war keeps a sector alive for the player who drops in at any hour. Operations are the appointments that gather
players and decide the day.

## Territory

### Control cells

The vision defines the front as ownership of trench segments and grid cells. Concretely:

- **Trench segments**: every fire bay and every traverse-to-traverse stretch of a communication trench, about 10–20 m of
  trench each, derived from the map's trench polylines.
- **Ground cells**: 25 m squares covering everything outside the trenches.

Each segment or cell is in one of four states:

| State             | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Held**          | Belongs to a side, consolidated. Counts toward the day's line                      |
| **Contested**     | Soldiers of both sides inside. Stays with its holder                               |
| **Taken**         | Captured, not yet consolidated. Counts for the battle now, not yet for the war map |
| **No man's land** | Nobody's. Most ground between the lines starts here                                |

**Capture**: a side takes a segment or cell after its soldiers have been inside it for 30 s with no enemy able to fight
there (dead, captured, broken or sheltering men don't count). This extends the built
[objectives](../../packages/sim/src/objectives.ts) rule, which takes an objective when a side has men within its radius
and the enemy has none, to the whole sector.

**Ground left empty stays with its holder.** Nobody captures by walking past.

### Consolidation

Taking a trench is half the work. Holding it until it counts is the other half, and it is when the counter-attack comes.

A **taken** segment becomes **held** when all three are true:

1. It has stayed taken for **30 real minutes**.
2. It is **connected**: a chain of the side's held or taken segments and cells joins it to the side's rear. A pocket cut
   off by the enemy never consolidates.
3. Nobody has retaken it in the meantime; retaking resets the clock.

A [pioneer squad's](soldier-and-squad.md#squad-types-planned-stage-2) _consolidate_ order halves the time on the
segments it works: reversing the fire step, blocking the trench toward the enemy, putting out wire.

Why: consolidation makes the counter-attack (already built: the commander AI goes in about 5 minutes after losing its
front line) into a decisive window, not an afterthought. It also makes the day's line hard to steal: a raid that grabs a
trench at 3am and leaves doesn't move the front.

### The day's line

At the [daily cutoff](war-map-and-season.md#the-daily-turn) the sector reports its **held** ground to the war map.
Ground still taken but not consolidated **reverts to its previous holder**: the line was not held. The front line on the
war map is the boundary of held ground.

The front may move at most **one trench system (about 300 m) per sector per day**, whatever happens. It is a guard
against a collapse at an empty hour, and in practice consolidation and depth should keep moves well under it: Verdun's
gains were counted in hundreds of metres a week.

## Manpower

Each side's sector garrison draws from a **manpower pool** the war map refills daily.

- The **force in the line** is set by the sector, not by how many players turn up: for example 500 soldiers per side in
  stage 2. Players replace bots one squad at a time; they don't add soldiers. See
  [population balance](balance.md#population).
- Every soldier **killed or captured** comes out of the pool. Evacuated wounded put half a man back.
- While the pool is healthy the line stays full. As it runs low, redeploys slow, squads arrive understrength and bot
  squads stop being replaced, so the force in the line shrinks. Attrition is visible on the ground.
- An empty pool never locks a player out: they still deploy, with whatever men can be found, usually 3 or 4.

## Artillery

Guns and shells by year, batteries, observation, counter-battery and the air war are in
[artillery and air](artillery-and-air.md); this section covers how artillery works inside a sector's day.

Built in M5: field and heavy guns with historical dispersion and flight times, HE, shrapnel and gas shells, craters that
reshape the terrain, bombardments, calls for fire, creeping and standing barrages, the defenders' automatic SOS barrage
and the protective barrage beyond a captured objective. Smoke and dust from bursts hide the infantry following a
barrage. HE cuts wire.

What multiplayer adds:

### The shell budget

Each side's sector receives a **daily shell allocation** by type (field HE, shrapnel, heavy HE, gas, later smoke) from
the war map. Every round fired, by anyone, comes out of it. The budget is the sector's most important resource and the
heart of operation planning: three bombardments cut about 39% of Fleury's wire and win the attack where one bombardment
fails (from the built simulation), and three bombardments cost three times the shells.

Unspent shells carry over, up to two days' allocation, so a quiet day banks fire for a big one.

### Who fires

| Fire                | Who orders it                                                                                      | Draws from                                         |
| ------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Operation fire plan | The sector commander, when planning the operation                                                  | The budget, reserved up front                      |
| SOS barrage         | Automatic when attackers enter no man's land; or any defender firing a red signal rocket           | A standing reserve (10% of the day's field shells) |
| Call for fire       | A player with a forward observer, or a squad leader in an observation post, on ground they can see | A per-player ration, then the commander's approval |
| Harassing fire      | The commander AI, on the enemy's communication trenches and dumps at night                         | A small share of the budget                        |
| Counter-battery     | Commander, against batteries an observer or balloon has spotted                                    | Heavy HE                                           |

Two rules stop friendly fire from becoming griefing: calls for fire land only where the caller can see, and every
player's calls come from a small personal ration that refills slowly. Mass fire needs the commander.

### Batteries and observation (stage 2–3)

Batteries are real places behind the lines (Fleury has field guns in sandbagged pits). Observers, **observation
balloons** and later spotting aircraft make fire more accurate; counter-battery fire on spotted batteries silences them
for a time. After an advance the guns are out of range of the new enemy line until the war map moves them up overnight,
so a second day's attack has weaker support than the first. That is how the Western Front's attacks ran down, and it is
the game's main brake on snowballing.

## Operations

An operation is a planned attack with an objective, a zero hour and a fire plan: the game's set piece and the
appointment players log in for. The sector commander plans it within limits (zero hour 30 minutes to 12 hours ahead,
three a day, paid for in shells); players sign up for a wave and deploy into the jump-off trenches in the last half
hour; the defender learns of it from the bombardment, air photographs and prisoners, and can shell the assembly. Then
zero hour, the rush on the lift, the later waves and the race between consolidation and the counter-attack.

Everything about them, from how the commander AI picks an objective to the 1918 infiltration attack, is in
[operations](operations.md).

## Quiet war

What a sector does between operations. Each activity should be worth doing alone or with a few friends at any hour.

| Activity         | What the player does                                                             | What it earns                                      | Stage |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- | ----- |
| Holding the line | Man the fire step, watch no man's land, shoot what shows                         | Kills, citations for a stand                       | Built |
| Sniping          | One soldier with a scoped rifle in a hide, hunting careless heads                | Kills, enemy suppression                           | 2     |
| Patrols          | Crawl into no man's land at night, check the enemy wire, find their gaps         | Reveals wire and gaps on the map for the side      | 2     |
| Raids            | A small party crosses at night, takes prisoners from an enemy bay and comes back | [Intelligence](#raids-and-intelligence), prisoners | 2     |
| Wire work        | Pioneers repair cut wire or lay new belts, by night                              | Defence for tomorrow; consumes stores              | 2     |
| Digging          | Push a sap toward the enemy, or dig a new jump-off trench                        | Shorter crossings for the next operation           | 3     |
| Mining           | Tunnel under the enemy line over several days, charge it, fire it at zero hour   | A huge crater and a destroyed bay                  | 3     |
| Countermining    | Listen for enemy miners, dig to meet them, blow their gallery                    | A wrecked enemy project                            | 3     |
| Gas harassment   | Call gas shells on enemy rear trenches                                           | Masks on, aim spoiled, pace slowed                 | Built |
| Stretcher work   | Carry the wounded back                                                           | Manpower, citations                                | 1–2   |

### Night

The [environment](../../packages/sim/src/environment.ts) closes sight range at night and in fog, rain and snow. Night is
when raids, patrols and wire work happen, and it needs light to be playable:

- **Flares** (Very lights) fired from the trenches light an area for 20–40 s, revealing anyone standing in no man's
  land. Men caught in a flare freeze or drop.
- **Signal rockets** call the SOS barrage.
- Muzzle flashes give away positions.

### Raids and intelligence

Prisoners are the currency of intelligence, as they were in 1916. Each prisoner walked back to the rear reveals one item
about the enemy sector, in order:

1. Which division holds the line, and how fresh it is.
2. Where their reserves wait.
3. Whether an operation is planned in the next 12 hours.
4. Its objective.
5. Its zero hour, to within an hour.

Prisoners already exist in the simulation (men caught below by an attacker, or broken and outnumbered, surrender and
walk to their captors' rear), so a raid is a small operation with a new purpose, not a new system.

## The sector commander

Each side in each sector has one commander.

- **The commander AI** is always there. Built: every 5 s it checks its front line, and when the line is lost it shells
  it and sends the reserves in behind a creeping barrage. Planned: it runs quiet war (harassing fire, wire repair),
  plans its own operations from the budget, answers enemy bombardments by reinforcing, and orders bot squads to support
  where human squads are fighting.
- **A human commander** can take over in stage 2: a player of the right [rank](progression-and-community.md#ranks)
  volunteers, and the AI hands over planning, the budget and the bot squads. They command from the map, not as a
  soldier. If they leave or the side votes them out, the AI takes over again with no gap.
- Players can always **request** support (a fire mission, a bot squad on their flank). The commander decides.

## Fixed sector, moving window

A front line that moves over a season eventually walks off a 400 m map. Each sector is a fixed-width strip of the front
covering the whole depth the season can reach (several kilometres of real IGN ground), but only a **battle window**
around the current line, about 600–800 m deep, is loaded and simulated. At the daily cutoff the window re-centres on the
new line if it has moved far enough. Ground outside the window keeps its craters and ownership in the sector's ledger.

This is an engineering question as much as a design one; see [open questions](../open-questions.md#product).
