# Armour

Tanks and armoured cars, and how infantry stops them. Part of the [game design](overview.md). None of it is built yet.
Digging, mining, demolitions and flamethrowers are in [field works](field-works.md).

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

A tank is crewed by a **tank squad** (see [squad types](roles-and-loadouts.md#squad-types)). For the small Renault FT, a
player's squad is a section of three tanks with two men each, and switching between tanks works like switching soldiers.
For the big tanks, the squad is one tank's crew, and the player commands the tank.

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

| Answer                               | Who and when    | How it works in game                                                                                                                      |
| ------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Field guns firing directly           | Both, from 1917 | A field gun in the line, or brought forward, knocks out a tank with a hit; the best answer, and a target for the attackers' artillery     |
| K bullets (_SmK_)                    | German, 1917    | Armour-piercing rifle and machine-gun rounds: penetrate early tank armour at close range, and make crews pay                              |
| Tank rifle (_Tankgewehr_ M1918)      | German, 1918    | A 13 mm anti-tank rifle with a two-man team: penetrates FT armour, kicks hard                                                             |
| Bundled grenades (_geballte Ladung_) | Both            | Several grenade heads tied together, thrown under the tracks or onto the roof at a few metres: brave and effective                        |
| Mines                                | Both, from 1918 | Buried shells with pressure fuzes on likely tank approaches (see [demolition and booby traps](field-works.md#demolition-and-booby-traps)) |
| Tank traps                           | Both            | Widened trenches and ditches the tank can't cross, dug by engineers (see [defensive works](field-works.md#defensive-works))               |
| Mortars and artillery                | Both            | A near miss can disable; a direct hit destroys                                                                                            |
| Flamethrowers                        | Both            | Into the vision slits, at very close range (see [flamethrowers](field-works.md#engineer-weapons-flamethrowers))                           |

The point: no single weapon makes tanks useless or unstoppable. They're powerful where the ground is firm, dry and
unprepared, and costly where the defender has guns forward and mud on its side.

## Balance levers

Tank numbers by side and year, speed, crossing limits, breakdown and bogging chances, armour against each threat, and
anti-tank weapon effectiveness. The [balance harness](balance.md#test-harness) should show tanks winning on dry,
unprepared ground and failing in mud against guns placed forward, as they did.
