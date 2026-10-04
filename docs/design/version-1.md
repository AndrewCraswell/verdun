# Version 1 scope

What the first full release contains, and what waits. Part of the [game design](overview.md). The other design docs
describe the whole game; this one draws the line a solo developer can ship. It proposes the line; the developer decides
(see [open questions](../open-questions.md#product)).

## The test

Version 1 has to deliver the [pillars](overview.md#pillars) and nothing more:

- fighting as a squad, switching between its men, where losses cost something;
- attacks that succeed through preparation, and ground that has to be held to count;
- a front that moves every day and a season someone wins;
- a full battle at any hour, with bots.

Everything that doesn't serve one of those waits, however good it is.

## One year: Verdun, 1916

Version 1 is **one season, 1916, on Verdun's right bank**. The war is that one year until more years are built; each
later year arrives as its own update, and once all five exist the war runs 1914–1918 as designed in
[seasons and the war](war-map-and-season.md#seasons-and-the-war).

1916 is the right first year: the battle the game is named after, the sector already built (Fleury), both sides
attacking in turn, trench warfare at its most typical, and no tanks or aircraft to build first. It needs only 1916 kit.

- **Sectors**: three at launch (Fleury, Douaumont, Vaux), opened as players arrive (see
  [active sectors](war-map-and-season.md#active-sectors)), up to the six on the right bank.
- **Sides**: French and German.

## In version 1

| Area              | In                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Soldier and squad | Direct control, switching, orders (follow, hold, advance, dig in, consolidate, resupply), [joining by taking over a bot squad](soldier-and-squad.md#joining-the-battle), redeploy from the pool   |
| State             | Suppression, morale with rally, stamina, fatigue, wounds with AI stretcher bearers and the aid post                                                                                               |
| Squads            | The four types: rifle, assault, support weapon (machine gun or trench mortar), engineer                                                                                                           |
| Weapons           | 1916 kit: rifles, machine guns, grenades, rifle grenades, the Chauchat, trench mortars, flamethrowers                                                                                             |
| Artillery         | Everything built, shell stocks with the daily allotment, observation from posts and balloons (abstract), calls for fire with rations                                                              |
| Gas               | Phosgene, masks, wind (built)                                                                                                                                                                     |
| Field works       | Trench stages, repair, blocks, reversing, nests, posts, shelters to deep dugouts, wire, and saps and new trenches if the [runtime digging spike](field-works.md#engineering-in-the-code) succeeds |
| Sector battle     | Territory cells, consolidation, operations with planning, assembly and counter-preparation, raids, patrols, sniping, wire work, [orders for players](sector-battle.md#orders-for-players)         |
| Logistics         | Shell stocks, small-arms ammunition and grenades, dumps, AI carrying and working parties                                                                                                          |
| Command           | The commander AI, and human commanders                                                                                                                                                            |
| Weather and light | Everything built: the week of the war, the 117-minute day, weather, night, flares                                                                                                                 |
| Interactions      | The core set: mud and slope on stamina, masks, night, rain on morale, fatigue, low sun                                                                                                            |
| War map           | Daily turn, communiqué, allocations and the main-effort vote, key points, salients, the Balance                                                                                                   |
| Players           | Accounts, side lock, service record, ranks that unlock responsibility, squad roster with veterans, regiments, citations                                                                           |

## After version 1

In roughly this order, each a content update that adds a year or deepens a system:

1. **1917**: French tanks (Schneider, Saint-Chamond), Blue and Yellow Cross gas, light machine guns and K bullets, air
   spotting and contact patrols, the Chemin des Dames.
2. **Mining and countermining**, concrete pillboxes, booby traps.
3. **1918**: storm troops and infiltration, Renault FT swarms, anti-tank rifles and mines, the Marne.
4. **1915**: the first gas, the Adrian helmet, mine warfare in the Argonne and Les Éparges.
5. **1914**: the war of movement, which needs cavalry, armoured cars and open-field maps.
6. **The air war in full**: ground attack, bombing, air superiority as a war-map system.
7. Later, if players want them: British and American sectors, a pilot role.

## Not planned

Hunger, thirst and warmth meters; disease; drowning; player-crewed field batteries; player-run logistics beyond the
decisions in [logistics](logistics.md). See [considered and not chosen](interactions.md#considered-and-not-chosen).

## How it maps to the roadmap

| Roadmap stage             | Mechanics it proves                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Stage 1 prototype (now)   | The fight: switching, squads, artillery, gas, wire, redeploy; next stamina, joining, consolidation, a headless day |
| Stage 2 multiplayer alpha | Players together in one sector: joining, orders, operations, human commanders, field works steps 1–2               |
| Stage 3 persistent beta   | The war: the daily turn, war map, communiqué, accounts, progression, runtime trenches                              |
| Version 1                 | Stage 3 polished, on Synty art, with the 1916 season complete                                                      |
