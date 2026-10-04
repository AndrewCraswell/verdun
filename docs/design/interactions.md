# How systems interact

How weather, light, ground, artillery, gas, supply, wounds and the soldier's own state change one another. Part of the
[game design](overview.md). Each system's own rules are in its doc; this one is about the joins between them.

Interactions are where realism comes cheap: a soldier already has a pace, stamina, morale, sight and aim, and the world
already has weather, light, mud and shellfire. Letting one nudge the other produces a lot of the war's texture (men
exhausted in the mud, a fog attack, a night spent bringing in the wounded) without adding a single new resource.

## Rules for interactions

An interaction earns its place only if it passes all five:

1. **Visible.** The player can see or hear the cause: rain on the screen, mud on the ground, the sun low ahead, a mask
   on. Every active effect on the controlled soldier shows as an icon in the HUD with a one-line reason.
2. **Explainable in a soldier's sentence.** "Men tire faster in mud." "You can't see into the sun at dawn." If it takes
   a paragraph, it doesn't go in.
3. **A nudge on an existing dial.** Interactions only multiply the [dials](#the-dials) below; they never add a meter to
   manage. There is no hunger, thirst or temperature bar.
4. **Bounded.** However many effects stack, each dial stays within limits (see [stacking](#stacking)), so no combination
   of weather and state leaves a soldier unplayable.
5. **Fair.** It affects both sides by the same rules. Where it favours one side, that's because of a choice someone made
   (attacking in fog, facing the sunrise), not which side they're on.

## The dials

Every interaction moves one or more of these. Most already exist in the simulation.

| Dial              | What it is                                     | Exists                                                         |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Pace              | Walking speed, and running as twice it         | Built                                                          |
| Stamina cost      | What running, climbing and carrying cost       | Planned ([stamina](morale-and-stamina.md#stamina-planned))     |
| Stamina recovery  | How fast stamina comes back                    | Planned                                                        |
| Morale drain      | How much shocks cost                           | Built (casualty shock)                                         |
| Morale recovery   | How fast morale comes back, and its ceiling    | Built (recovery), planned (ceiling)                            |
| Suppression decay | How fast men lift their heads again            | Built                                                          |
| Sight range       | How far a man can make out others              | Built                                                          |
| Accuracy          | Hit chance                                     | Built                                                          |
| Blast reach       | How far a shell's burst is lethal              | Built                                                          |
| Gas persistence   | How long gas lingers                           | Built                                                          |
| Work rate         | How fast men dig and build                     | Planned ([field works](field-works.md#who-works-and-how-fast)) |
| Bleed rate        | How fast the wounded left out die              | Built                                                          |
| Observation       | How accurate artillery is over a place         | Planned ([observation](artillery-and-air.md#observation))      |
| Hearing           | Listening posts and sentries' range for sounds | Planned                                                        |

## At a glance

Which sources move which dials. ● is built, ○ is planned.

| Source ↓ / dial →    | Pace | Stamina | Morale | Sight | Accuracy | Blast | Gas | Work | Bleed | Observation | Hearing |
| -------------------- | ---- | ------- | ------ | ----- | -------- | ----- | --- | ---- | ----- | ----------- | ------- |
| Rain                 |      | ○       | ○      | ●     |          |       | ●   | ○    |       | ○           | ○       |
| Mud                  | ●    | ○       |        |       |          | ●     |     | ○    | ○     |             |         |
| Cold, frost, snow    | ●    | ○       | ○      | ○     |          |       |     | ○    | ○     |             |         |
| Heat                 |      | ○       |        |       |          |       | ○   |      |       |             |         |
| Fog                  |      |         |        | ●     |          |       |     |      |       | ○           |         |
| Wind                 |      |         |        |       |          |       | ●   |      |       | ○           | ○       |
| Night                |      | ○       | ○      | ●     | ●        |       |     |      |       | ○           | ○       |
| Low sun              |      |         |        | ○     | ○        |       |     |      |       |             |         |
| Ground and slope     | ●    | ○       |        |       |          |       | ●   | ○    |       |             |         |
| Trenches and dugouts |      | ○       | ○      | ●     | ●        | ●     | ●   |      |       |             |         |
| Shellfire            |      | ○       | ○      | ●     | ●        |       |     | ○    |       |             |         |
| Gas mask             | ●    | ○       | ○      | ○     | ●        |       |     | ○    |       |             | ○       |
| Supply               |      |         | ○      |       |          |       |     |      |       |             |         |
| The wounded          |      |         | ○      |       |          |       |     |      |       |             |         |
| Aircraft             |      |         | ○      |       |          |       |     |      |       | ○           |         |
| Stamina              |      |         | ○      |       | ○        |       |     | ○    |       |             |         |
| Morale and fatigue   |      | ○       | ○      |       | ○        |       |     |      |       |             |         |

## Weather

The weather and its built effects are in [time and weather](../time-and-weather.md#effects-on-play); what follows adds
its effect on the soldier.

| Condition           | Effect                                                                                                                                 | Status                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rain falling        | Closes sight; washes gas out; beats smoke down                                                                                         | Built                                                                                |
| Rain falling        | Men in the open or in a trench without a dugout recover morale a quarter slower: wet through, no sleep                                 | Planned                                                                              |
| Rain falling        | Halves the hearing range of sentries and listening posts: the night for a raid or a wiring party                                       | Planned                                                                              |
| Rain falling        | Unrevetted trenches slowly slump: a stretch dug in mud loses a [stage](field-works.md#trenches) after a few hours of heavy rain        | Planned                                                                              |
| Sodden ground       | Slows men by up to 45%; smothers shell bursts (30% less reach)                                                                         | Built                                                                                |
| Sodden ground       | Running costs rise by the same factor that pace falls; stretcher bearers slow the same way, so more of the wounded die waiting         | Planned                                                                              |
| Sodden ground       | Machine guns jam more often; tanks bog                                                                                                 | Planned ([logistics](logistics.md#machine-guns), [armour](armour.md#how-tanks-play)) |
| Freezing            | Frozen ground goes like dry                                                                                                            | Built                                                                                |
| Freezing            | Digging at half rate; stamina recovers a quarter slower without greatcoats (the light loadout leaves them behind)                      | Planned                                                                              |
| Freezing at night   | The wounded left out die half as fast again: exposure                                                                                  | Planned                                                                              |
| Wet, cold and tired | Trench foot: a tired squad in a flooded trench in the cold loses men to it, slowly                                                     | Planned ([fatigue](morale-and-stamina.md#fatigue-planned))                           |
| Snow lying          | Slows men by up to a quarter                                                                                                           | Built                                                                                |
| Snow lying, by day  | Dark uniforms stand out: men standing on snow are seen a fifth further away. Footprints show where patrols went                        | Planned                                                                              |
| Heat (above 25 °C)  | Running costs a fifth more; mustard gas gives off more vapour                                                                          | Planned                                                                              |
| Fog                 | Closes sight to tens of metres                                                                                                         | Built                                                                                |
| Fog                 | Artillery observation fails over the fog: fire falls back to map firing, and the SOS barrage comes late because nobody sees the attack | Planned                                                                              |
| Wind                | Carries gas and smoke                                                                                                                  | Built                                                                                |
| High wind           | Balloons come down; aircraft can't spot; sounds carry downwind and are lost upwind                                                     | Planned                                                                              |
| Thunderstorm        | Lightning lights the field like a flare for an instant                                                                                 | Planned                                                                              |

## Light

| Condition                             | Effect                                                                                                                                  | Status                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Night                                 | Sight closes; aim falls with the light; flares and muzzle flashes reveal                                                                | Built                                                                         |
| Night                                 | Stretcher bearers can reach no man's land                                                                                               | Built                                                                         |
| Night, quiet sector                   | Garrisons sleep but for sentries: fatigue falls in the support and reserve lines                                                        | Partial ([routine](../../packages/sim/src/routine.ts) built; fatigue planned) |
| Night                                 | Hearing matters more: sentries and listening posts are the main warning                                                                 | Planned                                                                       |
| Low sun at dawn or dusk               | Looking within 20° of a sun less than 10° up: sight a third shorter and aim worse. An attack out of the sunrise is harder to see coming | Planned (uses [sky.ts](../../packages/sim/src/sky.ts))                        |
| Dawn and dusk                         | Stand-to: every squad mans the parapet                                                                                                  | Built                                                                         |
| Long winter nights, short summer ones | More or fewer hours for raids, wiring and bringing in the wounded                                                                       | Built (by the calendar)                                                       |

## Ground and works

| Condition                       | Effect                                                                                              | Status                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------- |
| Mud, churned ground, slope      | Slower pace                                                                                         | Built                           |
| Mud, churned ground, slope      | Running costs rise by the same factor                                                               | Planned                         |
| Trench, fire step, dugout       | Cover, sight, shelter from blast and gas (dugouts breathe 60% of the air above)                     | Built                           |
| Deep or revetted trench, dugout | Morale recovers faster; fatigue rises slower. Men in a shallow, wet, blown-in trench wear out first | Planned                         |
| Hollows and trench floors       | Gas drains into them and lingers                                                                    | Built                           |
| Shell holes                     | Cover lying down; a start for a [scrape](field-works.md#getting-into-the-ground)                    | Built (cover), planned (scrape) |

## War on the senses

| Condition                     | Effect                                                                                                                                                                   | Status                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Shellfire nearby              | Suppression; garrisons go below                                                                                                                                          | Built                                                         |
| Heavy shells nearby, burial   | Morale drain; shell shock after repeated near misses                                                                                                                     | Planned ([morale](morale-and-stamina.md#shell-shock-planned)) |
| Bombardment through the night | Nobody sleeps: fatigue rises in every line under it                                                                                                                      | Planned                                                       |
| Own barrage falling ahead     | Morale recovers twice as fast during the advance                                                                                                                         | Planned                                                       |
| Gas mask on                   | Aim to 70%, pace to 85%                                                                                                                                                  | Built                                                         |
| Gas mask on                   | Stamina recovers at half rate; sight a fifth shorter (fogged eyepieces); hearing muffled; work at 70%; a masked leader's rally works at half strength (nobody hears him) | Planned                                                       |
| Enemy aircraft low overhead   | Men in the open go to ground; a little morale lost under a strafing pass                                                                                                 | Planned                                                       |
| Own aircraft overhead         | A little morale gained; contact patrols show the commander where the attack has got to                                                                                   | Planned                                                       |

## The soldier's own state

These close the loop between the soldier's meters, so one bad thing leads to another, but never to a spiral nobody can
get out of.

| Condition                                       | Effect                                                                               | Status  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------- |
| Stamina below 25                                | Morale drains a quarter faster: exhausted men break sooner. Aim sways with breathing | Planned |
| Shaken or broken                                | Stamina recovers slower; broken men can't sprint                                     | Planned |
| Fatigue                                         | Caps morale; slows stamina recovery                                                  | Planned |
| Low on ammunition (under a tenth)               | A little morale drain: men who can't fight back feel it                              | Planned |
| Supply route open, rations up at night          | Morale ceiling a little higher for the sector's squads                               | Planned |
| Supply route cut for a day                      | Morale ceiling lower until it reopens                                                | Planned |
| Wounded crying out nearby at night              | A little morale drain for their own side within 50 m; bringing them in stops it      | Planned |
| An objective taken, a counter-attack beaten off | Morale for the men there                                                             | Planned |

## Stacking

Effects multiply, and every dial has floors and ceilings so stacks stay playable:

| Dial             | Combined effect stays between                         |
| ---------------- | ----------------------------------------------------- |
| Pace             | 25% and 100% of walking pace (running stays twice it) |
| Stamina cost     | 100% and 200%                                         |
| Stamina recovery | 25% and 200%                                          |
| Morale recovery  | 25% and 300%                                          |
| Sight range      | The night floor and the clear-day range               |
| Accuracy         | 10% and 100%                                          |
| Work rate        | 25% and 125%                                          |

A soldier masked, in mud, at night, in the rain, tired and shaken is slow, short of breath and half-blind, but he can
still move, see the man next to him and fire. That's the floor.

## In the code

To keep interactions coherent, every soldier's dials should be worked out in **one place**: a conditions step, once a
second, that reads the environment, the ground under him, his gear and his state, and writes a small set of multipliers
(pace, stamina cost, stamina recovery, morale recovery, sight, accuracy, work rate). Movement, combat, morale and
digging read the multipliers instead of each checking the weather themselves. That keeps each interaction a single line
in one table, makes the limits above easy to enforce, gives the HUD its list of active effects with reasons, and lets
tests check any combination directly.

Some of the built effects (ground pace in [ground.ts](../../packages/sim/src/ground.ts), sight in
[sight.ts](../../packages/sim/src/sight.ts)) already work this way per system; folding them into one conditions step is
a refactor for the gameplay session to judge.

## Considered and not chosen

| Idea                                      | Why not                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Hunger, thirst, warmth meters             | A meter to manage for every man fails rule 3; supply's effect on morale stands in for them        |
| Disease, lice, rats as mechanics          | Real and grim, but invisible in play and no decision follows; flavour in sound and the communiqué |
| Morale effects from the dead lying around | Hard to show and it would punish defenders for holding; the wounded crying out is the one kept    |
| Weather changing weapon ballistics        | Too small to see at this scale                                                                    |
| Drowning in flooded shell holes           | Historical (Passchendaele) but out of the player's control; flooded craters slow men instead      |

## Balance levers

Each effect's size, and the stacking limits. The [balance harness](balance.md#test-harness) runs the battle matrix in
fair weather, rain, fog, night and snow; a barrage attack should stay winnable in every condition, and conditions should
shift the result by making attacks costlier or slower, not by flipping who wins.
