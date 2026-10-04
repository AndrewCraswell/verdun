# Armour and engineering

Tanks and armoured cars, how infantry stops them, and the engineers' war: mines and mining, wire, digging, demolitions
and flamethrowers. Part of the [game design](overview.md). None of this is built yet, apart from wire.

## Tanks

### When and who

Tanks arrive late and mostly on one side, which makes them one of the war's biggest asymmetries. The game keeps it, and
balances it with the other side's answers.

| Tank                             | Side   | First used                                    | Crew | Character                                                                            |
| -------------------------------- | ------ | --------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| Schneider CA1                    | French | 16 April 1917, Berry-au-Bac, Chemin des Dames | 6    | A box with a 75 mm gun on the side: poor at crossing trenches, its fuel tanks burned |
| Saint-Chamond                    | French | 5 May 1917                                    | 8    | Long and heavy, with a 75 mm gun in front: overhangs dug into crater lips            |
| Renault FT                       | French | 31 May 1918                                   | 2    | Small, turreted, made by the thousand: used in swarms with infantry                  |
| A7V                              | German | 21 March 1918                                 | 18   | Only 20 built; big, slow and poor across broken ground                               |
| Captured Mark IV (_Beutepanzer_) | German | 1918                                          | 8–12 | Captured British tanks, repaired: rhomboid, good at crossing trenches                |

British tanks fought from September 1916, but British sectors are out of scope (see
[open questions](../open-questions.md#product)). In game terms: **the French have tanks from the 1917 season and many
from 1918; the Germans have a handful in 1918**, and better anti-tank answers from 1917.

### How tanks play

A tank is crewed by a **tank squad** (see [roles and loadouts](roles-and-loadouts.md#armour)). For the small Renault FT,
a player's squad is a section of three tanks with two men each, and switching between tanks works like switching
soldiers. For the big tanks, the squad is one tank's crew, and the player commands the tank.

| Property   | Rule                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Speed      | 1–2 m/s on firm ground, much less over churned ground; slower than walking infantry across a shelled field                                |
| Crossing   | Each type has a trench width and a crater depth it can cross. Schneiders bog in big shell holes and ditch at wide trenches                |
| Mud        | Ground [wetness](../time-and-weather.md) multiplies bogging; in a wet week, tanks are as likely to bog as to arrive                       |
| Breakdowns | Each minute moving has a chance of a breakdown, high for early types; a broken-down tank is a pillbox until recovered                     |
| Wire       | Crushes wire flat in its track: a lane for the infantry behind without wire-cutting fire, which is what makes surprise possible           |
| Armour     | Stops rifle and machine-gun ball ammunition; vulnerable to the answers below                                                              |
| Sight      | Poor: vision slits, noise, fumes. A tank sees much less than infantry and depends on them to spot targets and threats                     |
| Crew       | Heat, fumes and noise drain the crew's stamina; a long action leaves them spent                                                           |
| Fire       | Early French tanks catch fire when hit hard (exposed fuel tanks), killing their crews                                                     |
| Morale     | A tank in sight shakes infantry that haven't learned to fight them (see [morale](morale-and-stamina.md#what-drains-it-planned-additions)) |

Infantry and tanks need each other. Tanks crush wire and silence machine-gun nests; infantry keep enemy bombers off the
tanks and spot for them. A tank that outruns its infantry gets knocked out; infantry without tanks are back to cutting
wire with shells.

## Armoured cars

Armoured cars fought in the war of movement: French Peugeot and Renault cars with machine guns or 37 mm guns, a few
German cars. On roads they're fast and dangerous; off roads, and anywhere near trenches and shell holes, they're
useless. They appear in the **1914 and late 1918** seasons, when the front moves, as a scouting and raiding squad type
restricted to roads and firm ground.

## Anti-tank

The Germans met tanks first and developed most of the answers; the French will need them too against 1918's few German
tanks.

| Answer                               | Who and when    | How it works in game                                                                                                                  |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Field guns firing directly           | Both, from 1917 | A field gun in the line, or brought forward, knocks out a tank with a hit; the best answer, and a target for the attackers' artillery |
| K bullets (_SmK_)                    | German, 1917    | Armour-piercing rifle and machine-gun rounds: penetrate early tank armour at close range, and make crews pay                          |
| Tank rifle (_Tankgewehr_ M1918)      | German, 1918    | A 13 mm anti-tank rifle with a two-man team: penetrates FT armour, kicks hard                                                         |
| Bundled grenades (_geballte Ladung_) | Both            | Several grenade heads tied together, thrown under the tracks or onto the roof at a few metres: brave and effective                    |
| Mines                                | Both, from 1918 | Buried shells with pressure fuzes on likely tank approaches (see [mines](#land-mines-and-booby-traps))                                |
| Tank traps                           | Both            | Widened trenches and ditches the tank can't cross, dug by pioneers                                                                    |
| Mortars and artillery                | Both            | A near miss can disable; a direct hit destroys                                                                                        |
| Flamethrowers                        | Both            | Into the vision slits, at very close range                                                                                            |

The point: no single weapon makes tanks useless or unstoppable. They're powerful where the ground is firm, dry and
unprepared, and costly where the defender has guns forward and mud on its side.

## Mining

Mine warfare was its own front: Vauquois, Les Éparges, the Argonne, and the mine craters already in Fleury's no man's
land. It's a slow, secret, multi-day project with a huge payoff.

### Digging a mine

- A **gallery** is a sector project started by the commander from a shaft in the own line toward an enemy position. It
  advances a few metres per real hour while pioneers work it (bots, or a player's pioneer squad, which digs faster).
- It needs suitable ground: chalk and clay dig well; wet ground floods and stops it.
- When it's under its target, the chamber is charged with explosives from the sector's stores; the mine is **ready**.
- The commander fires it at zero hour minus 30 s (see [zero hour](operations.md#zero-hour)), or at any time.

### Firing a mine

A crater 20–40 m across, stamped into the terrain like a huge shell; the bay above destroyed, men in it killed or
buried, and everyone within a few hundred metres shaken. The crater's lip becomes a new objective that both sides race
to occupy (mine craters at Fleury are already one of the sector's objectives).

### Countermining

- **Listening**: pioneers in the own galleries with geophones hear enemy digging within about 30 m: the enemy gallery
  shows on the commander's map, roughly.
- **Camouflet**: a small charge fired near an enemy gallery collapses it and kills its miners, without breaking the
  surface.
- Galleries can meet. Underground fighting is out of scope; meeting galleries means both are blown.

Mining is the deepest long-term play a sector offers: a gallery dug over three days, kept secret from enemy listeners,
fired under a strongpoint at dawn. It should feel like that.

## Land mines and booby traps

Land mines in the modern sense barely existed. What there was:

- **Improvised anti-tank mines** in 1918: shells buried nose-up with pressure fuzes, laid by pioneers on tank
  approaches. Invisible until a tank or a man finds them; pioneers can find and lift them slowly.
- **Booby traps** in abandoned positions: the Germans left them throughout the ground they gave up in their March 1917
  withdrawal to the Hindenburg Line. A side abandoning trenches can have its pioneers trap dugouts and stores; the side
  occupying them takes casualties until its pioneers have cleared them.

## Engineering

Pioneers (see [roles](roles-and-loadouts.md#squad-types)) do the war's building and breaking:

| Work                      | Status  | What it does                                                                                                                     |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Wire                      | Built   | Belts in front of the trenches; shells cut it; men take about a minute per belt                                                  |
| Cutting wire by hand      | Planned | Wire cutters at night: slow, silent, deadly if a flare catches them                                                              |
| Laying and repairing wire | Planned | By night, from the sector's stores; the overnight works do it in bulk                                                            |
| Consolidating             | Planned | Reversing a captured trench: halves [consolidation](sector-battle.md#consolidation) time                                         |
| Digging saps and trenches | Planned | Extends the trench network at runtime: saps toward the enemy, assembly trenches before an operation, new lines behind an advance |
| Dugouts                   | Planned | Deeper dugouts protect against heavier shells; built over days                                                                   |
| Tank traps                | Planned | Widened trenches and ditches                                                                                                     |
| Demolition                | Planned | Charges to destroy dugouts, bridges, guns and tanks; blowing captured dugouts before giving ground back                          |
| Roads and light railways  | Planned | Repair shelled routes; extend the light railway behind an advance (war-map effect)                                               |

Digging at runtime changes the map's trench network, which today is fixed when the map is made. That needs new
engineering in `packages/map` (carving a trench into the height grid during a battle, rebuilding sight and navigation
locally), and is a stage 3 item.

## Flamethrowers

The Germans used flamethrowers at Verdun from its first day in February 1916; the French had their own (Schilt)
from 1915.

- A two-man team: the operator with the fuel tanks, a second man with the nozzle or as cover.
- 20–40 m range, a few long bursts per load; burning fuel lingers in a trench bay for a few seconds.
- Kills or routs everyone in a bay, and shakes everyone who sees it (−0.3 morale within 30 m).
- The operator is the most hated man on the field: every enemy in sight targets him first, and a hit on the tanks can
  set him alight.

## Balance levers

Tank numbers by side and year, speed, crossing limits, breakdown and bogging chances, armour against each threat,
anti-tank weapon effectiveness, flamethrower range and morale shock, gallery dig rate, listening range, mine crater
size. The [balance harness](balance.md#test-harness) should show tanks winning on dry, unprepared ground and failing in
mud against guns placed forward, as they did.
