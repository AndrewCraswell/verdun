# Game design overview

How the game plays, from one rifle shot to a whole season of war. The [vision](../vision.md) says what the game is;
these docs say how each mechanic works, why it is fun, and how it stays balanced. Engineering lives in the
[architecture](../architecture.md); timing lives in the [roadmap](../roadmap.md).

Numbers in these docs are **starting values for tuning**, not promises. Where the simulation already implements a
mechanic, the number is the one in the code today.

| Doc                                                       | Covers                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Soldier and squad](soldier-and-squad.md)                 | Direct control, soldier state, weapons, squad types, orders, death, deploy                               |
| [Roles and loadouts](roles-and-loadouts.md)               | Five roles, four squad types, AI services, loadouts and kit by year                                      |
| [Morale and stamina](morale-and-stamina.md)               | Suppression, morale, rally, shell shock, stamina for running, fatigue                                    |
| [Sector battle](sector-battle.md)                         | The continuous battle: territory, consolidation, operations, quiet war                                   |
| [Operations](operations.md)                               | Scheduled attacks: who decides, where men assemble, zero hour, the defender's answer                     |
| [Logistics](logistics.md)                                 | Supply lines, dumps, ammunition, reinforcements, communications                                          |
| [Artillery and air](artillery-and-air.md)                 | Guns and shells by year, batteries, observation, balloons, aircraft                                      |
| [Field works](field-works.md)                             | Digging and building: saps, trenches, repairs, nests, dugouts, bunkers, wire, mining                     |
| [Armour](armour.md)                                       | Tanks, armoured cars and anti-tank                                                                       |
| [War map and season](war-map-and-season.md)               | Sectors on the front, the daily turn, resources, the season arc, victory                                 |
| [Balance](balance.md)                                     | Population, factions, time zones, snowballing, tuning levers, test harness                               |
| [How systems interact](interactions.md)                   | Weather, light, ground, shellfire, gas, supply and the soldier's state acting on each other, with limits |
| [Progression and community](progression-and-community.md) | Onboarding, service record, ranks, veterans, regiments, conduct, rewards                                 |
| [Version 1 scope](version-1.md)                           | What the first release contains (1916 at Verdun) and what comes after                                    |
| [Interface](interface.md)                                 | The designer's brief: HUD, world markers, screen effects, menus, options and screens, by stage           |

## Pillars

Every mechanic should serve at least one of these and contradict none.

1. **Your squad is your life.** Death moves you to the next man, not back to a spawn screen. Losing men costs time, the
   sector's manpower and veterans you came to know. Caution and care are rewarded; suicide charges are a choice with a
   price.
2. **Preparation decides attacks.** Infantry crossing open ground against a machine gun dies (the simulation proves it:
   an attack with no artillery loses 199 of 200 men). Attacks succeed when the wire is cut, the guns are shelled, the
   barrage is timed and the men go in together. Planning is gameplay.
3. **Ground is earned twice.** Once by taking it, again by holding and consolidating it until it counts. Every attack
   invites a counter-attack, and the hours after a capture are as dramatic as the capture.
4. **Every hour matters; no hour decides.** The war is continuous across time zones. The front is measured over the
   whole day, not at a snapshot, and no small group at 4am can undo what hundreds did at 8pm.
5. **Always a full battle.** Bots fill every empty slot on both sides, so a lone player at an off hour still fights in a
   living trench line, and a crowded hour turns bots into humans rather than adding soldiers.
6. **Authentic outcomes, playable rules.** Verdun was attrition: small gains bought at terrible cost, forts lost and
   retaken. The rules should produce that shape without asking players to sit through its tedium. Where fidelity and fun
   conflict, fun wins and the doc says so.

## The four loops

| Loop        | Length                       | The player's question                                    | Pays off in                                        |
| ----------- | ---------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| **Moment**  | Seconds                      | Who do I shoot, where is cover, which man do I take?     | Kills, survival, suppression, a grenade into a bay |
| **Session** | 20–90 minutes                | What does my squad do this tour: hold, raid, go over?    | A trench taken or held, prisoners, a citation      |
| **Day**     | 24 real hours                | Did our sector keep what it took? Where is the line now? | The daily communiqué and the redrawn front         |
| **Season**  | One war year, about 7½ weeks | Who wins the year, and then the war?                     | Victory, the regiment's record, rewards that last  |

A player who drops in for twenty minutes should feel the moment and session loops fully and see their contribution in
the next communiqué. A player who logs in every day should feel the day loop pull them back. A regiment that plays all
season should feel it shaped the war.

## Clocks

The game runs several clocks at once. Keeping them separate is what lets a battle feel continuous while the war moves at
a pace players can follow. The values, and why they were chosen, are in [time and weather](../time-and-weather.md).

| Clock                | Rate                                       | Drives                                                         |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| Simulation tick      | 20 Hz                                      | Movement, fire, shells, gas                                    |
| Battle day and night | One cycle every 117 real minutes           | Light, sight range, raids, flares, night wire work             |
| Daily turn           | One real day, ending at the daily cutoff   | Front update, resource allocation, division relief, communiqué |
| Calendar             | One week of the war per turn               | Weather climate, kit, the year's pressures, the date shown     |
| Season               | One year of the war: 22 to 52 turns        | Who wins the year                                              |
| War                  | Five seasons, August 1914 to November 1918 | Who wins the war                                               |

The 117-minute cycle slips about a third of a cycle against the real clock each day, so someone who always plays at 8 pm
sees day, dusk and night over three evenings, and a long session sees all of them. The date shown stays fixed for a turn
("Week of 21 February 1916"); only the hour moves.

## How the layers connect

```
 Soldier ──fights in──▶ Squad ──deploys into──▶ Sector battle ──reports daily──▶ War map
    ▲                     ▲                         │                               │
    │                     └──── manpower pool ◀─────┤◀──── allocations ◀────────────┤
    └──── veterancy, service record ◀── citations ──┘                               │
                                                     season result ◀── the Balance ─┘
```

- The **war map** gives each sector a daily allocation: manpower, shells by type, engineering stores and a fresh or
  tired division.
- The **sector battle** spends it. Every man killed or captured comes out of the pool; every shell fired comes out of
  the budget. Ground taken and consolidated moves the line.
- At the **daily cutoff** each sector reports its consolidated line, losses and key points to the war map, which updates
  the front, the season's [Balance](war-map-and-season.md#the-balance-winning-a-year) and tomorrow's allocations.
- **Players** carry their squad, rank and regiment through the season, and their service record beyond it.

## Events for sound and presentation

Sound is half the experience ([vision](../vision.md#presentation)), and the client's sound model
(`apps/client/src/audio/battle-sound-model.ts`) reads the simulation without changing it. It relies on the `shot` events
(shooter, from, to, plus weapon kind and side), the `burst` events (shell and position), new entries in
`sim.artillery.shells`, `fallenIds` and the gas mask state. Keep these stable, or tell whoever owns the sound model when
they change.

Every new mechanic that a soldier would hear should emit an event: the whistle at zero hour, grenade throws (`throw`
already exists), wire cut by hand, flares, signal rockets, a mine going up, and the stand-to at the daily turn.

## Status

What the simulation already does, and where everything else lands. Stages are the ones in the
[roadmap](../roadmap.md#stages).

| Mechanic                                                                                | Status                           |
| --------------------------------------------------------------------------------------- | -------------------------------- |
| Direct control, switching, succession on death                                          | Built (M2–M3)                    |
| Squad orders: follow, hold, advance, reserve                                            | Built                            |
| Rifles, machine guns with beaten zone and grazing fire, grenades                        | Built (M4, later)                |
| Suppression, morale, breaking, surrender and prisoners                                  | Built                            |
| Stance: standing, prone, sheltering in dugouts; running                                 | Built                            |
| Artillery: fire missions, bombardments, creeping, standing, SOS and protective barrages | Built (M5)                       |
| Craters, churned ground, ground pace, barrage smoke                                     | Built                            |
| Gas, masks and wind                                                                     | Built (M6)                       |
| Barbed wire, wire cutting by shells, detours through gaps; flow-field navigation        | Built                            |
| Objectives and sector control share                                                     | Built                            |
| Reserves and the commander AI's counter-attack                                          | Built                            |
| Week of the war, 117-minute day and night, weather, sight range                         | Built                            |
| Night fighting: flares and muzzle flashes                                               | Built                            |
| Squad wipe, redeploy from the manpower pool                                             | Built                            |
| Joining by taking over a bot squad                                                      | Stage 1–2, next                  |
| Orders for players                                                                      | Stage 2                          |
| Shell stocks by type                                                                    | In progress (gameplay session)   |
| Wounded and killed, AI stretcher bearers, the aid post                                  | Built                            |
| Stamina, morale additions, rally, shell shock                                           | Stage 1, next                    |
| Territory cells, consolidation, the day's line                                          | Stage 1, headless                |
| Operations: planning, assembly, waves, counter-preparation                              | Stage 1 (single player), stage 2 |
| Small-arms ammunition, dumps, carrying parties                                          | Stage 1–2                        |
| Squad types, roles and loadouts; trench mortars, flamethrowers                          | Stage 2                          |
| Field works: trench stages, repair, blocks, nests, shelters                             | Stage 2                          |
| Raids, patrols, intelligence, signal rockets, telephone lines                           | Stage 2                          |
| Batteries as places, observation, counter-battery                                       | Stage 2                          |
| Balloons, air superiority, reconnaissance, ground attack                                | Stage 2–3                        |
| Sector commander role for humans                                                        | Stage 2                          |
| Tanks, anti-tank weapons, armoured cars                                                 | Stage 3 (the 1917–18 seasons)    |
| War map, daily turn, allocations, supply routes, seasons                                | Stage 3 (headless model earlier) |
| Active sectors opened by population                                                     | Stage 3                          |
| Ranks, service record, veterans, regiments, communiqué                                  | Stage 3                          |
| New trenches and saps at runtime, mining, bunkers, booby traps                          | Stage 3                          |

## Suggested next steps

The line for the first release is drawn in [version 1 scope](version-1.md). In the prototype, next:

1. **Redeploy and the manpower pool**: done. See
   [losing the squad](soldier-and-squad.md#losing-the-squad-and-coming-back).
2. **Stamina**, with the movement overhaul the gameplay session has started.
3. **Joining by taking over a bot squad**: the [join rule](soldier-and-squad.md#joining-the-battle), so a player is in
   the fight within a minute.
4. **Territory cells and consolidation**, headless: run a bots-only sector for a compressed day and check that the line
   moves by plausible amounts and that counter-attacks matter.
5. **The balance harness as a script** with pass and fail bands (see [test harness](balance.md#test-harness)), before
   more mechanics shift the balance.
6. **A headless season**: a war map of three sectors, run turn by turn on bots alone at different population splits, to
   tune allocations and the Balance before any server exists.

Each step answers a design question with numbers before it costs a server.
