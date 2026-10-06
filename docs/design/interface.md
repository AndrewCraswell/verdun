# Interface

Every HUD element, world marker, screen effect, menu and screen the game needs, from the prototype to version 1: what
each one shows, where its data comes from, how it behaves and when it is needed. Part of the [game design](overview.md).

This is the brief for the designer. It decides **content and behaviour**; the designer decides **look, layout within the
zones below, type, iconography and motion**. Where this doc proposes a key, a size or a colour, it is a starting value
the designer may change, with the reasons kept. Numbers are tuning values, as in the rest of the design docs.

## How to read it

Every element has an ID (H for HUD, E for screen effects, W for world markers, S for screens and menus, N for
notifications), a **stage** and a **kind**.

| Stage | Means                                                                                      |
| ----- | ------------------------------------------------------------------------------------------ |
| Now   | Exists in the client today, usually as plain text; needs designing, not inventing          |
| P     | Needed for the prototype playtest ([M8](../roadmap.md#milestones)); its data mostly exists |
| 1     | Stage 1, next: lands with stamina, joining, consolidation and ammunition                   |
| 2     | Stage 2, multiplayer alpha: other players, orders for players, operations, squad types     |
| 3     | Stage 3, persistent beta: accounts, war map, communiqué, progression                       |

| Kind    | Means                                                                       |
| ------- | --------------------------------------------------------------------------- |
| Overlay | Flat UI over the battlefield (DOM over the canvas)                          |
| World   | Drawn on the ground or over a soldier in 3D, scaled with the camera         |
| Effect  | Changes the whole picture or the sound: vignette, blur, muffling            |
| Screen  | Takes the screen, or most of it, over a battle that keeps running behind it |

"Data" names the field in the simulation (`packages/sim/src`) or the client function that already computes it. **Needs
data** marks what doesn't exist yet; the [data gaps](#data-gaps) table collects them for the developer.

## What the designer needs to know first

- **The game.** Massively multiplayer WW1 trench warfare at Verdun, in the browser. Each player leads a squad of eight
  and fights as one of them at a time, switching freely; when that man falls, control passes to the next. The battle
  never stops: bots fill every empty place, and the front moves a little each real day. See the [vision](../vision.md)
  and the [pillars](overview.md#pillars).
- **The camera is top-down**, tilted about 55° like Company of Heroes (lower only under 12 m), zooming from 8 to 450 m.
  It is not a first-person camera. The **pointer is the aim point** on the ground, drawn as a reticle over the
  battlefield: the soldier faces wherever it is, and left-click fires. An enemy the player can see within about 28
  pixels of the pointer is picked out (kept until another is clearly nearer): the soldier faces him exactly, and the
  shot goes at him. Holding the right button swings the camera behind his shoulder in a quarter of a second (the aim
  view, magnified for his sights; a setting turns it off): the pointer locks, the mouse turns his aim, he walks, and the
  middle of the screen is the aim point. Following him, the view leans a third of the way toward the ground under the
  pointer, as Running With Rifles does; screen edges pan only once the view is off him. E orders the squad to the ground
  under it. So the middle of the screen belongs to the battlefield, and anything on the HUD that the pointer has to
  cross gets in the way of aiming.
- **The player is two people at once**: a soldier (move, aim, fire, throw, lie down) and the squad's leader (orders,
  artillery, who to be next). Later some players are also commanders. The HUD has to serve the man and the squad without
  crowding either.
- **The battle never pauses online.** Every menu opens over a live battle, and the player's squad keeps fighting under
  its last order. The prototype's P pause is single-player only.
- **Desktop browsers, keyboard and mouse.** Nothing for touch or gamepad. Minimum 1280×720; design at 1920×1080; it must
  hold at 2560×1440, 3840×2160 and 21:9.
- **The background changes completely.** White snow by day, near-black nights, the glare of a flare, a yellow-green gas
  cloud, brown mud, smoke. Every overlay needs its own backing so it reads on all of them.
- **Fast load**: a link click reaches the battle in under 10 seconds. Every player, the first time too, opens on the
  front door, which loads none of the battle: it loads once they choose the battle to join
  ([first session](progression-and-community.md#first-session)), so the ten seconds run from "Join the battle".
- **Tone.** Over 700,000 men were killed, wounded or captured at Verdun. The interface is sober and respectful: no kill
  feed, no points popping off men, no medals for killing. See [principles](#principles).

## What exists today

The battle HUD's first design is built, in `apps/client/src/hud/` (see [how it's built](#how-its-built)): the soldier
card, roster, order, effects, the clock and compass, objectives, strength, the artillery board, the log, banners, the
handover, the squad-lost panel, prompts, screen effects, the aim cursor, marks on the ground and the war map's view. It
follows [at rest, overview and the war map](#at-rest-overview-and-the-war-map). Type is Archivo and Bodoni Moda;
colours, sizes and timings are tokens.

The grenade throw (H9, W7) is built too: hold Q for the arc, reach, scatter and blast, and the grenade itself is drawn
from the hand to where it bursts.

The menus are built too, in `apps/client/src/ui/`. The game opens on a front door (a first cut of S13), from a small
bundle of its own that loads none of the battle, since at the front door which battle the player will join isn't known
yet: "Join the battle", "War map", "Options" and "Credits", nothing more, with "Fight for: French or German" over them
(S14's first cut: kept between visits; the battle loads for the side chosen, so a change once it's loading starts it
again). A German player defends against the playtest's French attack and, as a defender of 1916 would, isn't told its
hour or where it will fall: the join screen gives orders to hold, and the report reads Held, A footing lost or Line
lost. "Join the battle" (or the war map's way into Fleury) starts the battle loading, under the loading screen (S6), and
then opens the join screen (S8): the sector's plan with every squad pinned where it stands and the attack ahead beside
it, and **Start**, which goes straight into the battle. Esc opens the list over the battle (S1): "Resume", the sector
map (S4), the squad book (S5), the battle log's history (H14), the war map (a first cut of S15: the Western Front in
each season, the theatres each season opens, Verdun's sectors, Fleury playable), the options (S3, with the keys and
their rebinding, S2, as a tab), "Restart" and "Leave the battle". M and U open the sector map and the squad book on
their own over the running battle. `?play` goes straight into the line behind the loading screen; `?debug` past both.

The orders wheel (H7: held, point at an order, let go: Advance, Run to, Suppress, Dig in, Withdraw, Rally, Hold and
Follow, one the squad can't take now greyed with the reason under the wheel), the shot's chance on the cursor (H8: three
pips for good, two for fair, one for poor, never a number; the hitChance setting) and the call previews (H10: hold V or
X for the footprint, the margin a burst kills in and the delay, a second call needed when our men are under it) are
built too, and the attackers see their stretch of the enemy's front line bracketed in brass on the war map and in the
overview. Our aid post is marked on the ground (W9), and where a wiped squad's replacements come up on the take-over map
(W10).

The battle's text was cut back at the developer's asking (October 2026): banners are a kicker and a headline with
nothing under them; the log's feed leaves out what a banner has just said and the weather turning, which wait in its
history; the order plate and the clock no longer list keys; the soldier card no longer says "Ready" or "Mask off"; the
hold marker is the shield without its word.

Still to come: operations, tasks and chat (H19-H21), and the rest of stage 2-3's screens.

## Principles

1. **Morale before health.** A soldier is out of the fight because he is pinned, broken or sheltering long before he is
   dead ([soldier state](soldier-and-squad.md#soldier-state)). Show states in words and shapes (Steady, Shaken, Broken,
   Pinned, Wounded), never a hit-point bar or a number.
2. **Never take control away, and say why.** The player's soldier always goes where he is steered
   ([morale and stamina](morale-and-stamina.md)). When something limits him (can't run, aim sways, the squad won't
   advance), the interface says why in a soldier's sentence, so it never reads as a bug.
3. **Every order is acknowledged, every time.** A squad that ignores orders feels worse than one that is weak. Each
   order and call shows where it went, that it was taken, and what is happening because of it: on the ground, on the
   HUD, and (once voices land) aloud.
4. **Every active effect has a reason.** Each effect on the controlled soldier shows as an icon with a one-line reason
   ([rules for interactions](interactions.md#rules-for-interactions)). No hidden modifiers.
5. **Show what a soldier of 1916 could know.** Enemies show only when someone in the squad can see them (built fog of
   war); no floating enemy icons, no exact enemy strength, no zero hour for the defender, never a speed ratio for time
   ([what players see](../time-and-weather.md#what-players-see)). Intelligence is earned.
6. **Small in battle, rich out of it.** The battle HUD is small, sits in the corners and fades when nothing changes. Out
   of battle (maps, the communiqué, the squad book, the service record) the interface can be generous and period in
   feel: documents, maps and registers.
7. **No glory loop.** No kill feed, no score popups, no XP bars, no kill streaks. Casualties have names. The fallen go
   into the squad book and the season's memorial.
8. **Colour is never the only signal.** Every state, side and alarm has a shape, word or pattern as well
   ([accessibility](#accessibility)).
9. **Plain words, period names.** "Replacements up in the rear trench: 8 men". English sentences; French and German only
   for names and terms of the time (ranks, _poste de secours_, _nettoyeurs_), each with an English gloss on first sight.

## Screen layout

The prototype already shares the screen out by corner, and the elements below keep that split
([worklog](../worklog/2026-10-04-overnight.md)). At 1920×1080, with 16 px margins:

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [dev dock, F3,         [H15 banner: stand-to, operation, wiped]       [H11 date, hour,│
│  dev builds only]      [H14 battle log, 3–6 lines, fades]              weather, wind] │
│                                                                       [H19 operation] │
│                                                                       [H20 your task] │
│                                                                       [H12 objectives]│
│                                                                       [H13 strength]  │
│                                                                                       │
│                                   battlefield                                         │
│                         (cursor = aim point; W markers live here)                     │
│                                                                                       │
│                              [H7 order radial, at the cursor]                         │
│                                                                                       │
│                              [H18 prompt / hint line]                                 │
│ [H6 squad order]                                                                      │
│ [H5 squad roster: 8 slot tiles in a row]                         [H10 fire support]   │
│ [H1 soldier card + H2 effects + H3 stamina + H4 weapon]          [menu hint: Esc]     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **Bottom left: the man and his squad.** The things the player checks most, in one glance.
- **Top right: the sector.** Time, weather, objectives, strength: checked every minute or so.
- **Top centre: what just happened.** The log and banners, which fade.
- **Bottom right: the guns and the menu hint.**
- **Top left: dev tools only.** Nothing player-facing goes there, so dev builds don't collide with it.
- **Centre: the battlefield.** Only transient things: the radial, the reticle, prompts, the succession card.

Every overlay zone should collapse to its smallest useful state when nothing in it changes for a while (an "at rest"
look), and expand on change or on hover. The player can hide each zone in the [options](#s3-options).

### At rest, overview and the war map

Screen space goes to what matters now. The HUD has three states:

- **At rest**: the soldier card, the roster and the order with its keys (follow, hold, advance: the squad's commands are
  always to hand), effects when something acts on the man, missions while our guns are firing, and a compact clock: the
  hour, the compass with the wind, and the overview key. Everything else stays away. A part comes up by itself for a few
  seconds when what it shows changes: the objectives when one changes hands, the clock in full when the light or the
  weather turns, the artillery board when guns are called.
- **Overview**: hold **I** for the sector in full (the hour, week, light, weather and war turn; the objectives with
  their bearings; reserves and losses; the artillery board with its stocks). Tap I to keep it up, tap again to put it
  away. Marks on the ground show in full: firing footprints hatched, every objective named.
- **The war map's view**: pulling the camera back past about 150 m fades in a trench map over the ground, complete at
  230 m: 100 m squares lettered as on the period maps, every trench in its side's colour (French blue, German red), our
  men as dots in our colour and the squad in brass, and the enemy in theirs, only the men our side can see now (the fog
  of war's rule: while fog is off, all of them). The overview's panels come up with it.

Firing footprints at rest are a thin red edge with their countdown, since the shells' own bursts and smoke carry the
picture; pending ones stay a dashed amber outline, as a warning.

## Screen flow

```
Stage 1 (now)    link ──▶ S13 front door ──▶ S6 loading ──▶ S8 join ──▶ battle (HUD) ◀──▶ S1 menu ──▶ S2, S3, S15
                                                                               │  ▲
                                                                               ▼  │
                                                                     S4 sector map (M), S5 squad book (U)

Stage 2          link ──▶ S6 loading ──▶ S8 join (sector map) ──▶ S9 squad type and loadout ──▶ battle
                                            ▲                                                   │
                                            └────── S10 operations, S11 orders board ◀──────────┤
                                                                                                ▼
                                                                         squad wiped ──▶ H17 redeploy

Stage 3          S13 landing ──▶ S22 sign in ──▶ S14 side ──▶ S15 war map ──▶ S16 communiqué
                                                                   │
                                                                   ▼
                                                       S8 join a sector ──▶ battle
                                   S18 service record, S19 regiment, S20 memorial, S17 main effort vote
```

Every player opens on the front door, the first time too; the battle loads once they join it, and an account is offered
after their first operation.

## Soldier and squad state: the vocabulary

The same words, icons and colours mean the same thing everywhere: the soldier card, the roster, the markers over men,
the squad book and the log. One vocabulary, designed once.

| State                           | Group    | Meaning and threshold                                              | Data                                                                  | Stage |
| ------------------------------- | -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ----- |
| Steady                          | Morale   | Morale 0.6–1                                                       | `morale.value`                                                        | P     |
| Shaken                          | Morale   | Morale 0.25–0.6: slower to obey, aim sways                         | `morale.value`                                                        | P     |
| Broken                          | Morale   | Morale below 0.25 (`BROKEN_MORALE`): won't advance, may surrender  | `morale.value`                                                        | P     |
| Pinned                          | Fire     | Suppression 0.6 or more (`PINNED`): head down, not firing          | `suppression.value`                                                   | Now   |
| Under fire                      | Fire     | Suppression above about 0.2 but below pinned                       | `suppression.value`                                                   | P     |
| Winded                          | Breath   | Stamina below 25: can't run                                        | `stamina.value`, `canRun`                                             | Now   |
| Spent                           | Breath   | Ran out: walks at three-quarters pace until back to 25             | `stamina.spent`                                                       | P     |
| Lightly wounded                 | Wounds   | Hit, still fighting, slower, worse aim                             | `health.value` below 1                                                | Now   |
| Badly wounded                   | Wounds   | Down where he fell, out of the fight, waiting for bearers          | `dead` + `wounded` tags                                               | P     |
| Being carried                   | Wounds   | Bearers have him                                                   | Needs data (bearer assignment)                                        | 1     |
| At the aid post                 | Wounds   | Being treated                                                      | `evacuated`, `casualty.treatment`                                     | P     |
| Returned to duty                | Wounds   | Patched up, back in the reserves                                   | `returned-to-duty` event                                              | P     |
| Sent to hospital                | Wounds   | Left the sector                                                    | Needs data (triage outcome kept per man)                              | 1     |
| Killed                          | Fate     | Includes died of wounds                                            | `dead` without `wounded`; `died-of-wounds` event                      | Now   |
| Captured                        | Fate     | Prisoner, walked to the enemy's rear                               | `captured`                                                            | Now   |
| Masking                         | Gas      | Pulling the mask on, 5–12 s                                        | `mask.state` Donning, `mask.at`                                       | Now   |
| Masked                          | Gas      | Mask on: aim to 70%, pace to 85%                                   | `mask.state` On                                                       | Now   |
| Gassed                          | Gas      | Dose past about half of his tolerance (warning before it disables) | `gasDose.value`, `gasTolerance`                                       | P     |
| Standing, crouching, lying down | Stance   | Posture                                                            | `stance.value`                                                        | Now   |
| In a dugout                     | Stance   | Sheltering below, unseen                                           | `stance.value` Sheltering                                             | Now   |
| Climbing out                    | Stance   | Racing up from the dugout when the shelling lifts                  | `shelter.emergeAt`                                                    | P     |
| Over the parapet                | Exposure | Head up on the fire step: seeing out, and seen                     | `seesOverParapet`                                                     | Now   |
| In a flare's light              | Exposure | Lit at night: visible to the enemy                                 | `flareLight`                                                          | P     |
| Low on rounds, out of rounds    | Supply   | Below a quarter, none                                              | Needs data ([ammunition](logistics.md#ammunition-on-the-man-planned)) | 1     |
| No grenades                     | Supply   | None left                                                          | `grenades.count`                                                      | Now   |
| Veteran I–III                   | Record   | Survived operations                                                | Needs data ([roster](progression-and-community.md#the-squad-roster))  | 3     |
| Shell-shocked                   | Wounds   | Out like the badly wounded                                         | Needs data ([shell shock](morale-and-stamina.md#shell-shock-planned)) | 1     |

**Priority**, when only one state can show (a roster tile at a glance, a marker at far zoom): Killed › Captured › Badly
wounded › Broken › Pinned › Masking › Gassed › Shaken › Spent › Lightly wounded › Low on rounds. Everything else shows
only where there is room (the soldier card, the squad book).

## Battle HUD

### H1 Soldier card

**Stage** Now (redesign), P (additions). **Kind** Overlay. **Zone** bottom left.

Who you are and how you are. Today: "Squad 7 of 8", the stance, a line about the parapet, a stamina bar, then alarm
lines (gas mask, pinned, wounded), grenades and reserves (`hud.ts:75-85`, `hud-model.ts`).

Shows:

- **Name, rank and role**: "Cpl. Dubois, rifleman". The squad's leader (slot 1) is marked as the leader. _Needs data:_
  names and ranks ([roster](progression-and-community.md#the-squad-roster)), roles
  ([roles](roles-and-loadouts.md#roles)). Until then, "Slot 3, rifleman" or "machine gunner" (`weapon.kind`).
- **Slot number** (the key that selects him).
- **Morale state** (Steady, Shaken, Broken) and **fire state** (Under fire, Pinned).
- **Wounds**: unhurt or lightly wounded. No bar, no number.
- **Stance and exposure**: standing, crouching, lying down, in a dugout, climbing out; over the parapet or below it.
- **Gas**: masking (with a progress ring for the 5–12 s), masked, gassed (warning).
- H2, H3 and H4 attach to it.

Behaviour:

- Updates live. A state that changes for the worse pulses once (a short motion, no flashing).
- Clicking the card centres the camera on the soldier (same as Home). Hover shows H2's reasons in full.
- When the soldier falls, the card hands over through [H16](#h16-succession-card).

### H2 Active effects

**Stage** P. **Kind** Overlay. **Zone** a row beside or under H1.

Every condition currently changing the controlled soldier's dials, each an icon with a one-line reason, as the
[interactions rules](interactions.md#rules-for-interactions) require. Reasons are in a soldier's words:

| Effect             | Reason line                         | Dial                      | Data                                                        |
| ------------------ | ----------------------------------- | ------------------------- | ----------------------------------------------------------- |
| Mud                | "Deep mud: slow going"              | Pace                      | Ground pace ([ground.ts](../../packages/sim/src/ground.ts)) |
| Snow lying         | "Snow underfoot: slow going"        | Pace                      | `weather.snowCover`, ground pace                            |
| Wire               | "Caught in the wire"                | Pace                      | `wireAt`, `wirePace`                                        |
| Uphill             | "Climbing"                          | Pace, stamina             | Slope (navigation costs)                                    |
| Night              | "Dark: you see little, aim worse"   | Sight, aim                | `environment.illuminance`, `aimInLight`                     |
| Fog, rain, snow    | "Fog: sight closes in"              | Sight                     | `environment.sightRange`, `weather.pattern`                 |
| Flare overhead     | "Lit by a flare: you can be seen"   | Exposure                  | `flareLight`                                                |
| Gas mask on        | "Mask on: hard to aim and breathe"  | Aim 70%, pace 85%, breath | `mask.state`                                                |
| Gas here           | "Gas: mask on or breathe it"        | Dose                      | `concentrationAt`                                           |
| Under fire         | "Rounds landing close: aim spoiled" | Aim                       | `suppression.value`                                         |
| Shaken             | "Shaken: hands unsteady"            | Aim, breath recovery      | `morale.value`                                              |
| Broken             | "Broken: can't make himself run"    | Can't run, aim            | `morale.value`                                              |
| Winded             | "Out of breath: can't run"          | Can't run                 | `stamina.value`                                             |
| Lightly wounded    | "Wounded: slower, aim worse"        | Pace, aim                 | `health.value`                                              |
| Over the parapet   | "Head up: seeing out, and seen"     | Sight, exposure           | `seesOverParapet`                                           |
| Low sun ahead      | "Sun in your eyes"                  | Sight                     | Planned ([interactions](interactions.md))                   |
| Cold, no greatcoat | "Cold: spirits sink"                | Morale                    | Planned (loadouts)                                          |
| Tired squad        | "Tired: slow to recover"            | Morale, stamina           | Planned ([fatigue](morale-and-stamina.md#fatigue-planned))  |

Behaviour: a new effect shows its icon **with its reason** for about 4 s, then the icon alone. At most six icons; past
that, the least severe fold into "+2". Hover or the soldier card shows every reason. Good effects (in a dugout,
recovering faster; the barrage ahead) can show too, in a quieter style.

_Needs data:_ the [conditions step](interactions.md#in-the-code) that lists active effects with reasons in one place.
Until it exists, the client derives them as the HUD model does today.

### H3 Stamina

**Stage** Now (redesign). **Kind** Overlay. **Zone** under H1.

A thin bar under the soldier's status, as [stamina](morale-and-stamina.md#how-these-show-to-the-player) asks. Today a
140×4 px bar, pale `#d9cfa8`, orange when winded (`hud.css:74-91`).

- Full is 100 (`FULL_STAMINA`); a tick mark at 25 (`WINDED`), below which he can't run.
- States: recovering, draining (running, crawling, climbing out), winded (below 25), spent (`stamina.spent`, walking
  slowly until back to 25).
- Shape or pattern changes with the state, not only colour.
- Fades almost out when full and still; comes back when it moves.

### H4 Weapon and ammunition

**Stage** Now (grenades), 1 (rounds). **Kind** Overlay. **Zone** beside H1.

- **Weapon**: rifle or machine gun today (`weapon.kind`); later the side's actual weapon (Lebel, Gewehr 98, Hotchkiss,
  MG 08, Chauchat, rifle grenades, flamethrower; see [weapons](soldier-and-squad.md#weapons)).
- **Ready to fire**: a small ring or tick filling over the reload (`weapon.cooldown`, 3 s for a rifle). Today a click
  during reload is silently ignored; this is the fix.
- **Grenades**: "3 of 3" today (`grenades.count`, `GRENADES_CARRIED`). Shown as three marks, not a number.
- **Rounds** (stage 1): by clip or charger, not by round: a Lebel's tube, a Gewehr 98's five-round chargers, a machine
  gun's belts or strips. Low below a quarter, out at none. _Needs data:_
  [ammunition on the man](logistics.md#ammunition-on-the-man-planned). **Built** for the magazine (ammunition itself is
  unlimited for now): rounds left of what it holds beside the ready ring ("6/8"), amber when low, red when out; while
  reloading, "Reloading 4 s" in its place, the ring filling over the whole reload (`reloadSeconds`, longer in mud and
  rain). Bolt work between shots shows on the ring alone.
- **Machine gun** (stage 1): stoppage and clearing it, ammunition left for the team.

### H5 Squad roster

**Stage** P. **Kind** Overlay. **Zone** bottom left, a row of eight tiles above or beside H1.

The squad at a glance, and the way to choose who to be. Today the HUD shows only "Squad 7 of 8", and slots 1–8 can be
selected without being shown.

Each tile:

- **Slot number** (its key, 1–8) and a **role icon** (leader, rifleman, bomber, gunner, engineer; today rifleman or
  machine gunner).
- **Short name** when there's room (stage 3 names; "Slot 3" until then).
- **The one state** that matters most, by the [priority](#soldier-and-squad-state-the-vocabulary) above.
- **Small marks**: lightly wounded, low on rounds or grenades, masked, spent.
- **Distance** from the man you control, when he's far (more than 30 m, where the
  [leader's effect](morale-and-stamina.md#squad-cohesion-partial) stops).
- The tile of the man you control is clearly marked; the leader's tile is marked.

States of a tile: controlled, fit, in trouble (shaken, pinned, wounded), out (badly wounded, killed, captured). Out
tiles stay in place, dimmed and marked, so slot numbers never move; a killed man's tile keeps his name until
replacements arrive.

Behaviour:

- **Click** a tile to take that man (as 1–8). **Hover** shows his full state and kit.
- A tile flashes once (no repeated flashing) when its man goes down or breaks.
- Selecting an out tile does nothing and says why ("Pvt. Martin is down").
- Data: `squad.members` in slot order, `squad.leader` for the man you control; each man's components as in the
  vocabulary.

### H6 Squad order

**Stage** P. **Kind** Overlay + World. **Zone** above H5.

What the squad is doing now. **Built** (`elements/order-plate.ts`): the order's mark, its words and who can't obey; the
keys are on the orders wheel and in the controls, not listed on the plate.

| Order     | Shown as                                                                                             | World marker                                        | Stage    |
| --------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------- |
| Follow me | "Following you"                                                                                      | None, or a faint leash on stragglers                | Now      |
| Hold      | "Holding here"                                                                                       | The held spot ([W5](#w5-hold-marker))               | Now      |
| Advance   | "Advancing to the crater line, 40 m" (running if ordered)                                            | Destination and route ([W4](#w4-order-destination)) | Now      |
| Reserve   | "In reserve, below in the dugouts"                                                                   | None                                                | Now (AI) |
| Creep     | "Following the barrage"                                                                              | Barrage line ([W6](#w6-artillery))                  | Now (G)  |
| Raid      | "Raiding: going out", "coming back"                                                                  | Raid target                                         | Now (AI) |
| Planned   | Suppress, bomb along, consolidate, carry wounded, cut or lay wire, withdraw, dig in, resupply, rally | Each its own marker                                 | 1–2      |

Behaviour:

- When an order is given, the indicator updates at once and the [world marker](#w4-order-destination) appears; a short
  shouted line plays when voices exist ([sound](../sound.md)), with a caption.
- When men can't obey (pinned, broken), the indicator says so: "Advancing: 3 men pinned". This is what keeps a weak
  squad from feeling broken.

### H7 Order radial

**Stage** 1. **Kind** Overlay. **Zone** at the cursor.

The fast interface the [orders](soldier-and-squad.md#orders) call for: a radial menu on a held key, plus the current
one-key shortcuts (F, H, E).

- **Hold** the orders key (proposed E): the radial opens around the cursor; the battle keeps running. Move the pointer
  toward a wedge, release to give it. Release in the middle to cancel. Esc cancels. **Built** on the middle mouse button
  at the developer's asking: a middle click (a press that doesn't drag, so middle-drag still turns the camera) opens it
  where it was clicked; point at a wedge and click to give it, click in the middle, right-click or Esc to give nothing.
  The orders key (Y) still works held, for a mouse without a middle button.
- **Wedges** (eight at most): Follow, Hold, Advance (to the point under the cursor at opening), Run to, Suppress (an
  area), Withdraw, Dig in, Rally. Stage 2 adds Bomb along, Consolidate, Carry wounded, Cut or lay wire, Resupply. Orders
  the squad can't take (no engineers to consolidate, no bombers left) show greyed with the reason.
- Each wedge shows its shortcut key.
- **Ground orders preview** where they go: Advance and Suppress show the target on the ground while the wedge is
  highlighted, snapped to a trench bay, fire step or crater rim when one is near (as Full Spectrum Warrior's cursor
  snapped to cover).
- A hold-or-toggle option for players who can't hold a key ([accessibility](#accessibility)).

### H8 Cursor and aim

**Stage** P. **Kind** Overlay + World. **Zone** the pointer.

Built (`aim-cursor.ts`, `sight-picture.ts`, `soldier-marker.ts`): the pointer picks out the enemy drawn nearest it on
the screen (`target-pick.ts`), the soldier faces him exactly, and the cursor says whether a shot can go and, if not,
why. In the aim view (right button) the pointer is locked and the same marks sit at the screen's centre. In the world,
the man in the sights is ringed as wide as the shot's spread at him (`spreadRadius`): tight on a man in the open close
by, wide on a head over a parapet, narrowing as the aim steadies.

| State        | When                                                                                     | Data                          |
| ------------ | ---------------------------------------------------------------------------------------- | ----------------------------- |
| Aiming       | Nobody picked out                                                                        | —                             |
| On target    | A shot would strike the man picked out: a red ring that fills as the aim steadies        | `aimedTarget`, `aim.since`    |
| Chance       | Optional: pips for a coarse hit chance, steadiness counted (good, fair, poor; never a %) | `hitChance`, `shotSteadiness` |
| Own cover    | His own parapet or crater lip blocks the first 3 m: a bar under the mark (step up)       | `sightPicture`                |
| Unseen       | Something further off hides the man; a squadmate sees him: a grey dashed ring            | `sightPicture`                |
| Too dark     | In his line of sight but too far for the light, or behind smoke: a dotted ring           | `sightReach`, smoke           |
| Reloading    | Weapon not ready: a ring fills                                                           | `weapon.cooldown`             |
| Pinned       | Aim spoiled: the cursor spreads or sways                                                 | `suppression.value`           |
| Out of range | Beyond the weapon's reach, or a grenade's or a call's in those modes                     | `WEAPONS`, `GRENADE_RANGE`    |
| Off the map  | Pointer over sky or HUD: nothing will happen                                             | Ground pick                   |
| Order mode   | Holding the radial, or a call preview (H9, H10)                                          | —                             |
| Menu pointer | Over HUD or a menu: the normal pointer                                                   | —                             |

Steadying: a snap shot at a man just swung onto gets half of `hitChance`, rising to all of it over 1.5 s still on him,
twice as fast lying, faster kneeling or resting on a parapet; moving, switching target or changing stance unsettles it.
Bots keep `hitChance` as it is. See the [direct control proposal](direct-control-proposal.md).

The cursor must stay readable on snow, at night and inside a gas cloud: an outline or dual-tone mark, at a size the
player can set.

### H9 Grenade throw

**Stage** P. **Kind** World. **Zone** the pointer.

**Built** (`hud/elements/throw-preview.ts`, from `hud/throw-preview.ts`): held, Q shows the arc from the hand and its
shadow on the ground, a ring as far as the man can throw from where he stands and how (32 m standing, 85% kneeling, 55%
lying, half from cover; `throwReach`), the scatter, and the blast where the grenade would come to rest. If the arc would
strike the ground short (the trench wall in front of a man too low to throw clear, a parapet, a crater's rim), a red
cross marks where, with the roll back from there ("Won't clear"). Out of reach, the stretch of the ring the throw runs
up against lights amber, a dashed line runs on to a hollow mark where the pointer is, and the label says how far too far
and where it will land. Release throws. The grenade then flies its arc, rolls and lies where it came to rest until it
bursts (`effects/grenades.ts`). Below: the spec as first written.

Today Q throws at once at the pointer, or does nothing (silently) if the pointer is off the map or out of grenades.

- **Hold Q**: show the arc from the soldier, the landing point, the **scatter** (1 m + 6% of the distance) and the blast
  (about 3 m) on the ground, and the range ring (6–25 m, `GRENADE_RANGE`). Release to throw; right-click while held
  cancels. A tap throws at once, as today.
- Out of range: the landing clamps to 25 m and shows it.
- Friendly men inside the blast: the blast circle warns ("Our men in the blast") but doesn't stop the throw; friendly
  fire stays on ([conduct](progression-and-community.md#conduct)).
- No grenades: the cursor says "No grenades" for a moment.
- After the throw: the grenade's landing shows briefly (4.5 s fuse).

### H10 Fire support

**Stage** P (prototype calls), 2 (rations and observers). **Kind** Overlay + World. **Zone** bottom right.

Artillery is the game's biggest lever, and today it is four silent keys: B bombards the enemy line, V calls high
explosive on the pointer, X calls gas on the pointer, G sends every squad over behind a creeping barrage. Each press
queues more fire with no limit but the side's shells, and nothing on screen says anything has happened until shells land
5–30 s later.

The panel:

- **Calls available**: B, V, X, G with their keys, each greyed with a reason when it can't be used (no shells of that
  type, nobody can see the target, ration spent, a mission already firing).
- **Ration** (stage 2): pips for the player's personal ration of calls that refills slowly
  ([who fires](sector-battle.md#who-fires)); "ask the commander" past it.
- **Missions in progress**: each as a line: what, where, and its phase. "High explosive on the sap head: rounds in 22
  s", "Bombardment: 1 min 20 s left", "Barrage lifting in 40 s". Data: `sim.artillery.missions` (`startTick`, `delay`,
  `duration`, `creep`).
- **Shells left by type** (field HE, shrapnel, heavy HE, gas), only when low or when the panel is open. Shown in the
  sector panel today ("Shells: 7,420 field, …"); for a squad leader it belongs here.
- **SOS barrage**: whether it has been called and is falling (`sosCalledAt`).

Calling, with a preview (proposed; the keys stay as they are):

- **Hold V** (or X): the **footprint** shows on the ground at the pointer (60 m wide for V, 100 × 40 m for X) with the
  delay ("about 30 s"). Release to call, right-click to cancel. Friendly men inside the footprint: a strong warning
  ("Our men in the beaten zone") and a second press to confirm.
- **B and G** (built: press twice within 3 s, the question standing bottom centre; off in the options) are sector-wide
  and fire for minutes: a confirmation step (hold for a moment, or press twice) so they can't be fired by a slip. These
  are the prototype's stand-ins for [operations](operations.md); in stage 2 they move to the commander.
- After calling: the footprint stays on the ground as pending, then firing ([W6](#w6-artillery)), and a line goes to the
  log. Later, a period signal: a rocket going up for the SOS, a runner or field telephone for a call (as Tannenberg made
  calls physical), each with its delay.
- Today calls aren't limited to ground anyone can see; the [rule](sector-battle.md#who-fires) is that they will be. The
  preview shows unobserved ground as such.

### H11 Date, hour, weather and wind

**Stage** Now (date and hour), P (weather and wind). **Kind** Overlay. **Zone** top right, first block.

Today: "Day 25 of 52, 1916", "Next communiqué in 5 h 12 min", "Week of 20 June 1916", "07:12" (`calendar.ts`; see
[what players see](../time-and-weather.md#what-players-see)).

- **The week**, "Week of 20 June 1916" (`weekLabel`), and **the hour**, "07:12" (`battleHour`, French civil time).
- **The turn**, "Day 25 of 52, 1916" (`turnLabel`), and the **countdown** to the next communiqué (`countdownLabel`).
  Smaller; these matter to the day loop, not the fight.
- **Light**: dawn, day, dusk or night, and time to the next change ("Dusk in 12 min"). Stand-to at dawn and dusk is
  worth flagging ([routine](../../packages/sim/src/routine.ts): `isStandTo`, `isNight`). Never a speed ratio.
- **Weather now**: pattern (clear, fair, overcast, fog, drizzle, rain, storm), temperature, and visibility when it is
  short ("Fog: 80 m"). Data: `sim.environment.weather`.
- **Wind**: direction and strength as an arrow that turns with the camera, because the camera turns and gas goes with
  the wind (`weather.wind`). With it, a **north mark**, so the player always knows which way the enemy is.
- **Outlook** on hover: the next days (`outlookLabel`, `weekOutlook`).

### H12 Objectives and control

**Stage** Now (redesign), 1 (control and consolidation). **Kind** Overlay. **Zone** top right.

Today one line per objective: "Fleury crossroads: French", orange when contested (`sim.objectives`). Fleury has five:
Fleury, Fleury crossroads, the mine craters, Ravin de la Dame, Ravine head.

- Each objective: **name**, **holder** (ours, theirs, no one) by shape and side colour, **contested**, and distance and
  direction from the controlled soldier (so the list doubles as a compass to it).
- **Sector control**: the share of the sector each side holds (`sectorControl`).
- Stage 1: **taken but not consolidated** ground and its clock ("Ravine head: taken, holds in 22 min"), from
  [consolidation](sector-battle.md#consolidation). _Needs data:_ control cells and the consolidation clock. There is no
  capture progress in the simulation today; capture is instant when one side is present and the other isn't.
- Collapsed at rest to a row of objective marks; expands when one changes hands.

### H13 Strength

**Stage** Now (redesign). **Kind** Overlay. **Zone** top right, last block.

Today: "Reserves: 160 men" (in the soldier panel), losses per side ("French: K killed, W wounded, C captured") and
shells by type.

- **Our reserves**: men left in the [manpower pool](sector-battle.md#manpower) (`reinforcements.pool`), with how full it
  is against the day's allotment (`reinforcements.full`). The enemy's pool isn't shown: it isn't something a soldier
  would know (intelligence may reveal it later).
- **Losses today**, both sides: killed, wounded, captured, and prisoners taken. Probably on hover, or in the
  [sector map](#s4-sector-map), rather than always on screen.
- **Shells** move to [H10](#h10-fire-support).

### H14 Battle log

**Stage** Now (redesign). **Kind** Overlay. **Zone** top centre.

Today: up to six lines, each for 20 s of battle time, centred, alarms in orange (`createBattleLog`). It reports
objectives taken, counter-attacks, replacements, batteries out of shells, prisoners, surrenders and the gas alarm. The
full list of messages is in [notifications](#notifications).

- Three to four lines visible, newest at the bottom or top (designer's choice), each fading after about 15 s.
- **Kinds**: alarm (gas, counter-attack, our men surrendering), squad (our men down, replacements), sector (objectives,
  prisoners), fire (calls and missions), and later chat and orders. Each kind with its own mark, not only colour.
- Repeated messages merge ("4 prisoners taken" rather than four lines).
- A **history** of the last hour, opened from the menu or the sector map, because messages scroll away during the busy
  moments when they matter most.
- No kill feed. A man of your own squad falling is reported by name ("Pvt. Martin killed"); enemy deaths are not
  reported one by one.
- **Built**: what a banner has just said (zero hour, objectives, the enemy's counter-attack, gas, stand-to,
  replacements, a squad taken over, the operation's end) and the weather turning are kept for the history but left off
  the feed.

### H15 Banners

**Stage** Now (stand-to), P, 2. **Kind** Overlay. **Zone** top centre, above the log.

Big, rare, short messages that change what everyone is doing. **Built** as a kicker and a headline ("Zero hour", "Over
the top!"), nothing under them: what to do about it shows on the order plate, the ground and the men. Only the war's
wait, at the daily turn or between seasons, keeps a line under it, saying when the battle goes on.

| Banner                  | Text, for example                                                                       | Stage    |
| ----------------------- | --------------------------------------------------------------------------------------- | -------- |
| Stand-to at the cutoff  | "Stand-to. The communiqué is coming in", then "The communiqué is out" with a link to it | Now      |
| Between seasons         | "The 1916 season is over. 1917 begins in 6 days"                                        | Now      |
| Paused (offline only)   | "Paused. P to carry on"                                                                 | Now      |
| Zero hour               | "Zero hour in 2 minutes", then "Over the top!" with the whistle                         | P (G), 2 |
| Gas                     | "Gas! Masks on" (today a log line)                                                      | P        |
| Counter-attack          | "Counter-attack coming on the lost trench"                                              | P        |
| Squad wiped out         | See [H17](#h17-squad-wiped-and-redeploy)                                                | Now      |
| Objective taken or lost | "Fleury crossroads taken"                                                               | P        |

One banner at a time; a newer, more urgent one replaces an older one. They never cover the centre of the screen.

### H16 Succession card

**Stage** P. **Kind** Overlay + Effect. **Zone** centre.

When the man you control falls (killed or badly wounded, or captured), control passes to the next living man
([direct control](soldier-and-squad.md#direct-control)). Today it happens instantly with no feedback beyond the ring
moving. It is the game's signature moment and needs a short, dignified beat:

1. The picture dims and desaturates for about a second; the sound muffles.
2. A card: "Cpl. Dubois is down, badly wounded" (or "killed", "taken prisoner").
3. The camera glides to the next man; the card turns to "You are Pvt. Martin, slot 4, rifleman", with his state.
4. Under a second and a half in all, and skippable by any key, because the fight goes on.

Never a respawn screen, never a timer, never the word "respawn".

### H17 Squad wiped and redeploy

**Stage** Now (text), P (design). **Kind** Overlay. **Zone** centre-bottom, small.

When the last man falls, replacements come up from the [pool](soldier-and-squad.md#losing-the-squad-and-coming-back) to
the rear trench after 30 to 90 s. Today: "Squad wiped out: replacements in N s" in the soldier panel, then "Replacements
up in the rear trench: 8 men" in the log.

- A quiet panel, not a death screen: "Your squad is gone. Replacements reach the rear trench in 0:42. 8 men are coming
  up; 152 left in reserve."
- When the pool is empty: "No reserves left: 3 men scraped together from the cooks and runners".
- The camera stays free to watch the battle, and offers to follow the arrival point.
- The fallen men's names, in a short list, before the new names arrive (stage 3; names need data).
- Stage 2: a choice of where to come back ([deploy points](soldier-and-squad.md#losing-the-squad-and-coming-back)), and
  of squad type ([S9](#s9-squad-type-and-loadout)).

### H18 Prompts and hints

**Stage** P. **Kind** Overlay. **Zone** bottom centre.

**Removed** (October 2026): the developer took the prompt card out. It was mostly teaching the controls, and the
contextual prompts that matter now show where they apply (the action key over the soldier, the keys on the order plate
and on each order's wedge). The spec below is kept for if first-session teaching comes back.

Teaching by doing, with no tutorial level ([first session](progression-and-community.md#first-session)): short prompts
with key caps, one at a time, in order, each cleared when the player does it.

1. "W A S D to move. The pointer aims; left-click fires."
2. "Z to lie down. Men in the open live longer lying down."
3. "Tab or 1–8 to take another man. Take the one with the best view."
4. "F: the squad follows you. H: hold here. E: advance to the pointer."
5. "Q, held, to throw a grenade into the bay."
6. "The whistle blows at zero hour. Walk behind the barrage; run when it lifts."

Plus contextual hints the first time something happens: the first gas ("Gas: your men mask up on their own"), the first
time pinned ("Pinned. Crawl, or wait for the fire to lift"), the first time winded, the first man down. Each shows once,
can be turned off, and is listed in the menu.

### H19 Operation

**Stage** 2 (P as the G attack). **Kind** Overlay. **Zone** top right, under H11.

[Operations](operations.md) are the game's appointments. When one is planned and the player is in it:

- Name and objective: "Operation on the Fleury crossroads".
- **Zero hour** and a countdown; the player's **wave** and its jump-off trench; the **assembly window** (the last 30
  minutes) and whether the squad is in place.
- After zero hour: the phase (barrage creeping, rush on the lift, later waves, consolidating) and the
  [consolidation](sector-battle.md#consolidation) clock.
- For the defender: nothing about the zero hour, only the [signs](operations.md#what-the-defender-sees) the side has
  seen ("Heavy bombardment on our wire since 04:10").
- **Built**, the assembly (`operation-state.ts`): before zero hour the attackers see our own front line over the stretch
  in brass dashes, labelled "Assembly" on the war map and drawn in the overview, where the squads beside it close in
  (`operation.assembling`). While any are still on their way the countdown's note says so in one line, "3 squads
  assembling", ahead of "Our guns are firing". Both go at zero hour.

### H20 Your task

**Stage** 2. **Kind** Overlay + World. **Zone** top right.

The one [order for players](sector-battle.md#orders-for-players) the squad has taken: "Repair the blown-in stretch at
bay 14", with its marker in the world, its progress ("held 12 of 20 min") and expiry. One line; details on the
[orders board](#s11-orders-board).

### H21 Chat and pings

**Stage** 2. **Kind** Overlay + World. **Zone** bottom left above the squad, or left edge.

[Text chat](progression-and-community.md#communication) by squad, platoon, sector and side, in a period style; and **map
pings**, the fastest and language-independent way to coordinate.

- Chat: Enter to open; channel shown; fades when unused; mutes and reports per player.
- Pings: a few kinds (look here, enemy, go here, need help, gas), on the ground and on the sector map, from a ping key
  or a ping wedge in the radial. Limited per minute.

## Screen effects

How the controlled soldier's state feels, beyond the HUD
([how these show](morale-and-stamina.md#how-these-show-to-the-player)). Each has an intensity setting and an off switch
in the [options](#s3-options).

| ID  | Effect             | Trigger                                 | Look and sound                                                                           | Today                      | Stage |
| --- | ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- | ----- |
| E1  | Under fire, pinned | `suppression.value`, strongest from 0.6 | Screen edges darken in, slight shake, aim sway; panting                                  | Panting only               | P     |
| E2  | Close burst        | A burst within 15 m                     | A jolt, dust, a moment of blur; ears ring and the battle muffles for about 3 s           | Ringing and muffle (sound) | P     |
| E3  | Gas mask           | `mask.state` On                         | The view narrows to two round lenses' worth, a little fogged; breathing through the mask | Breathing (sound)          | P     |
| E4  | Gas without a mask | `concentrationAt` above detection       | A yellow-green tint at the edges, coughing                                               | —                          | P     |
| E5  | Shaken, broken     | `morale.value`                          | Colour drains a little; heartbeat under the mix; at broken, muffled sound                | —                          | P     |
| E6  | Wounded            | `health.value` below 1                  | A slow pulse at the edges, a little slower to recover                                    | —                          | P     |
| E7  | Winded             | Stamina below 25                        | Breathing, aim sways with it                                                             | —                          | 1     |
| E8  | Succession         | The controlled man falls                | See [H16](#h16-succession-card)                                                          | —                          | P     |
| E9  | Fog of war         | Ground no squadmate sees                | Darkened ground; enemies drawn only when seen                                            | Built, on by default (O)   | Now   |

All of them are subtle: the player has to aim through them. No red screen, no blood on the lens, no flashing. Effects on
squadmates show on their markers and tiles, never on the screen.

## World markers

Drawn in the 3D scene, so they sit on the ground and move with the camera. They need to stay readable from 8 m to 450 m
of zoom: past about 150 m single men are a few pixels, so markers switch to **squad-level icons** (as Company of Heroes
does) and the men's own markers drop away.

### W1 The man you control

**Stage** Now. A pale gold ring under him and a 4 m facing line that stretches to the target (`soldier-marker.ts`). Keep
the idea; design the shape. It must stand out from everything else on the ground, including on snow.

### W2 Your squad

**Stage** Now (rings), P (states). Thin khaki rings under the other living men today. Add:

- The **slot number** over each man while the orders radial is open, and over one man while the pointer is on his roster
  tile.
- The man's **one state** from the [priority](#soldier-and-squad-state-the-vocabulary) as a small glyph over him when
  it's bad (pinned, broken, wounded, masking).
- Fallen men of your squad keep a small marker where they lie: **badly wounded** men waiting for bearers distinctly from
  **killed** (stage P), so the player knows whom the bearers may still reach.
- At far zoom, one squad icon with its order and a count of men standing.

### W3 Target

**Stage** Now. A red ring under the enemy a shot would hit right now, scaled to keep its size on screen. Keep; design.
It must not read like a spotted-enemy marker: it appears only under the aim.

### W4 Order destination

**Stage** P. Where an Advance (or Run, Suppress, Withdraw) is going: a marker at the point, a faint route along the
[flow field](../../packages/sim/src/navigation.ts), and the men's slots around it. It stays until they arrive, then
fades. The preview while choosing is the same marker, lighter.

### W5 Hold marker

**Stage** P. A small mark where the squad was told to hold. Shown faintly, brighter when the squad is drawn away from
it. **Built**: the shield in a ring, without a word over it; the order plate names the order.

### W6 Artillery

**Stage** P. Every fire mission the player's side has called, on the ground:

- **Pending**: the footprint outlined, with time to the first rounds.
- **Firing**: the footprint marked as dangerous (and the shells' own bursts).
- **Creeping barrage**: the line where it is falling and where it lifts to next, with a lift countdown, so the infantry
  can keep 70 m behind it. The attackers' own position against it matters most.
- **Standing and protective barrages**: their lines.
- **SOS**: the line it falls on.
- Enemy fire is not marked: you learn of it by the shells.

### W7 Grenade

**Stage** P. The arc, landing point, scatter and blast from [H9](#h9-grenade-throw), and the landed grenade until it
goes off.

### W8 Objectives

**Stage** P. Each objective's area (`radius`), name and holder on the ground, readable at every zoom. Contested and
taken-not-consolidated states show here as well as in H12. Today objectives aren't marked in the world at all.

### W9 Aid post and bearers

**Stage** P. The side's aid post with the red cross (`aidPost`) and how many wait there. Stretcher-bearer teams are
already meant to be visible as men with a stretcher; a light marker helps find them at far zoom. **Built**
(`hud/rear.ts`, `elements/world-marks.ts`): the red cross on a dark disc, with the number of our men being treated there
under it, shown in the overview and within 80 m; the bearers' marker isn't.

### W10 Arrival point

**Stage** P. Where replacements come up (the rearmost fire trench behind the squad's stretch), while the squad is wiped
or replacements are on their way. **Built** on the take-over map (`elements/take-over-marks.ts`): "Replacements" in a
dashed brass pill at the middle of the places they'll arrive at (`arrivalPoint` in the simulation), while they're on
their way, and the camera's framing takes it in with where the squad fell and the squads on offer.

### W11 Later markers

| Marker                                                                                                         | Stage |
| -------------------------------------------------------------------------------------------------------------- | ----- |
| Control cells and trench segments: held, contested, taken, no man's land (an overlay toggled with the map key) | 1     |
| Forward dumps and their stock                                                                                  | 1–2   |
| Other players' squads: name and squad type; bots' squads unnamed                                               | 2     |
| Task markers ([H20](#h20-your-task))                                                                           | 2     |
| Pings ([H21](#h21-chat-and-pings))                                                                             | 2     |
| Works in progress: a trench stage, a nest, wire ([field works](field-works.md))                                | 2     |
| Wire known from patrols, gaps found                                                                            | 2     |
| Jump-off positions and waves                                                                                   | 2     |

## Screens and menus

### S1 Menu

**Stage** Now (redesign). **Kind** Screen.

**Built** (`ui/menu.ts`), simplified at the developer's asking: Esc opens a list down the left over the darkened battle:
Resume, Sector map, Squad book, Battle log, War map, Options, Restart and Leave the battle. Pages open beside the list,
the maps full width; Esc closes a page, then the menu. The front door has Join the battle, War map, Options and Credits,
and shows the loading under Join the battle until the battle is ready. Below: the spec as first written.

Today Esc opens a dimmed backdrop and a panel listing the controls with "Back to the battle" (`menu.ts`). The battle
carries on behind it, and the menu takes key presses away from the game while open.

Contents:

- **Back to the battle** (Esc again).
- **Controls** ([S2](#s2-controls)), **Options** ([S3](#s3-options)).
- **Sector map** ([S4](#s4-sector-map)), **Squad book** ([S5](#s5-squad-book)), **Battle log history**.
- **Hints**: the list of prompts seen, to read again.
- Stage 2: **Leave the sector** (hands the squad back to the AI; says so). Stage 3: **To the war map**, **Sign out**.
- Prototype only: Pause (P) and a **restart the skirmish** action.
- A footer with the build version and a link to report a problem.

The panel must make clear that the battle goes on behind it, and the squad's state should stay visible (H5 can stay on
screen above the backdrop).

### S2 Controls

**Stage** Now (list), P (rebinding). **Kind** Screen, inside the menu.

Today a two-column list grouped as Your soldier, Your squad, Artillery and the attack, Camera, Screen, and dev-only
groups (`apps/client/src/ui/bindings.ts`, the single registry of keys). Keys are read by physical position
(`KeyboardEvent.code`), so labels must show the key as printed on the player's own layout.

Add **rebinding**: click an action, press a key; conflicts shown and resolved; reset per group and for all. Show both
the key and mouse bindings. The current list:

| Group             | Keys and actions                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Your soldier      | W A S D move (camera-relative); Shift run; mouse aim; right button held aim over the shoulder; left-click fire (hold on a machine gun); Q grenade; C crouch; Z lie down; Space climb the trench wall, wooden fence or low wall ahead (never wire), or crouched or prone cut the wire (Space again stops), or man the gun beside you or in a nest (again to leave it); R reload |
| Your squad        | Tab next man; 1–8 a slot; F follow; H hold; E advance to the point under the pointer; middle-click (or hold Y) the orders wheel                                                                                                                                                                                                                                                |
| Artillery, attack | B bombard the enemy line for 2 min; V artillery on the pointer; X gas on the pointer; G whistle: every squad attacks behind a creeping barrage                                                                                                                                                                                                                                 |
| Camera            | Arrows pan (screen edges too, once off your man); Shift + middle-drag grab the ground; middle-drag or Shift + Left/Right turn and tilt; wheel zoom to the pointer; Home or L back to your man                                                                                                                                                                                  |
| Screen            | Esc menu; P pause (offline); O fog of war; F3 debug; F4 save frame timings                                                                                                                                                                                                                                                                                                     |
| Dev builds only   | K kill your man; \` Inspector; [ ] hour; Shift + [ ] week; N weather; J death map; F7 sound mixer                                                                                                                                                                                                                                                                              |

Proposed new keys, for the developer to confirm (E, I, L, R, T, U and Y are free today): **E** orders radial (H7), **M**
sector map (S4; the dev sound mixer moves elsewhere), **R** rally (when built; or reload, if ammunition needs one),
**T** ping, **Enter** chat, **I** squad book. Avoid Alt and Ctrl chords: browsers take Alt for their menu bar, and
Ctrl+W closes the tab.

### S3 Options

**Stage** P (first set), later as noted. **Kind** Screen, inside the menu. Settings persist in the browser (local
storage today; on the account in stage 3) and apply at once where they can.

**Built** (`ui/options.ts`), the settings that exist: graphics (low, high) and renderer (automatic, WebGL), each on
reload; render scale and full screen at once; the five volumes; interface scale, backing and the prompts (with "show
them again"); colour vision, high contrast and screen effects' strength. Since added: the frame-rate cap, brightness
with a test image, each zone of the HUD, the clock, marker size, hold or toggle for run, crouch, lie down and the
grenade, edge panning, pan speed and the drag's direction, captions (off, voices, or voices and warnings), and
confirming sector-wide fire.

**Display**

| Setting                                                   | Values                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Renderer                                                  | Automatic, WebGPU, WebGL (needs a reload; `?webgl` today)                                                                           |
| Quality preset                                            | Low, medium, high, and custom below                                                                                                 |
| Render scale                                              | 50–100% (and above, for high-density screens)                                                                                       |
| Shadows, terrain detail, particle density, soldier detail | Each low to high                                                                                                                    |
| Frame-rate cap                                            | Off, 30, 60, 120, 144                                                                                                               |
| Brightness                                                | A slider with a period-appropriate test image (a dark trench, a mark that should be just visible): nights must be dark but playable |
| Full screen                                               | On, off (the browser's own)                                                                                                         |

**Sound** (the mixer buses already exist: battle, ambience, ears; `audio/mixer.ts`)

| Setting                                     | Values                                                           |
| ------------------------------------------- | ---------------------------------------------------------------- |
| Master, battle, ambience, voices, interface | 0–100%                                                           |
| Ear ringing and muffling                    | Full, reduced, off                                               |
| Sound when the tab is in the background     | On, off                                                          |
| Captions                                    | Off, voices, voices and sounds ([accessibility](#accessibility)) |

**Controls**

| Setting                  | Values                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Rebinding                | [S2](#s2-controls)                                                                                                                         |
| Hold or toggle           | Run, crouch, lie down, orders radial, grenade and call previews: each hold or toggle                                                       |
| Edge panning             | On, off; edge width; speed                                                                                                                 |
| Camera                   | Pan, turn and zoom speeds; invert drag; zoom toward the pointer on or off; camera follows your man on or off; aim view on the right button |
| Confirm sector-wide fire | On (default), off                                                                                                                          |

**Interface**

| Setting              | Values                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Interface scale      | 75–200%                                                                                             |
| Text size            | Separate from scale, 100–200%                                                                       |
| Backing opacity      | 0–100% behind HUD text                                                                              |
| Each zone            | Always, when it changes, hidden: soldier card, squad roster, sector panel, log, fire support, hints |
| Marker size          | 75–200% for world markers and the cursor                                                            |
| Hit chance on target | On, off (H8)                                                                                        |
| Hints                | On, off, reset                                                                                      |
| Clock                | 24-hour (default, as the army kept it), 12-hour                                                     |

**Accessibility** (see [accessibility](#accessibility))

| Setting           | Values                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| Colour vision     | Default, deuteranopia, protanopia, tritanopia palettes for state and side colours |
| High contrast     | Solid backings, stronger outlines, 7:1 text contrast                              |
| Plain font        | Swaps any period display face for the plain one everywhere                        |
| Screen effects    | Each of E1–E7: full, reduced, off                                                 |
| Camera shake      | Full, reduced, off                                                                |
| Flashes           | Reduce the brightness of muzzle flashes, bursts and flares                        |
| Visual sound cues | Show incoming heavy shells, the gas gong and whistles as screen-edge marks        |

**Language** (stage 3): English first; French and German interfaces later. Voice lines stay in their own language
whatever the interface; captions follow the interface language.

**Account** (stage 3): name shown to others, side and regiment (read only here), privacy, sign out.

### S4 Sector map

**Stage** P (first version), 1–2 (more layers). **Kind** Screen over the live battle (proposed M).

**Built** (`ui/sector/`): M opens it full width while the battle goes on, or the menu's list beside it. The ground in
contours and shading from the survey, 100 m squares lettered as the trench maps did, trenches French blue and German
red, communication trenches, wire, ruins, trees, the field railway and our aid post; live, the squad in brass with the
man under control ringed and its order's pin, our men, the enemy the side sees now, objectives ringed in their holder's
colour (dashed when contested) and our side's fire missions, pending dashed and firing filled. The panel lists the
order, the objectives with bearing and distance, and the missions. Click looks there, right-click sends the squad there.
Not yet: control cells, dumps, other players. Below: the spec as first written.

A full-screen map of the sector that doesn't stop the fight; the squad keeps its order while the player looks. In the
manner of a French _plan directeur_ (the 1:20,000 trench maps drawn from air photographs), simplified for reading at a
glance.

- **Base**: the ground, trenches by kind (fire, support, reserve, communication, saps), named features (Fleury, the
  crossroads, Ravin de la Dame), woods, ruins, roads, wire belts. A **grid** for callouts (lettered squares, in the
  period manner; see the
  [trench map squaring](https://www.longlongtrail.co.uk/battlefields/how-to-read-a-british-trench-map)), and north.
- **Live**: the player's squad and its order; the man under control; objectives and holders; artillery footprints of our
  side's missions; the aid post; the arrival point; known enemy positions (only what the side currently sees).
- **Stage 1–2**: control cells (held, contested, taken, no man's land), consolidation clocks, dumps, other players'
  squads, tasks, pings, operations' objectives and jump-offs, known wire and gaps.
- **Actions**: click to pan the camera there; right-click to order the squad to advance there; ping (stage 2).
- **Side colours**: the French in blue and the Germans in red, whichever side the player is on, as the plans directeurs
  drew them; blue against red holds up for most colour-blind players. A German player's own lines are red. Holders also
  have patterns (hatching for taken, dots for contested) and labels.

### S5 Squad book

**Stage** P (roster), 3 (names and history). **Kind** Screen.

**Built** (`ui/squad-book.ts`): U opens it over the running battle. A nominal roll of the eight, with slot, rank and
name, job and weapon, state in words with its marks, grenades and distance; "Take him" for any man who can be taken.
Below, the fallen and the men brought in, kept as the battle goes, with the week and the place ("Killed near Fleury
crossroads, week of 20 June 1916"), and the ranks glossed in English. Below: the spec as first written.

The squad as a nominal roll: every man, his state, and what happened to him. It gives the
[eight named men](progression-and-community.md#the-squad-roster) a face.

- **Each man**: name, rank, hometown (stage 3), role and kit, veterancy marks, state in full (all of the
  [vocabulary](#soldier-and-squad-state-the-vocabulary) that applies), distance and direction.
- **Kit**: what he carries (weapon, rounds, grenades, mask, tools), read only in battle; changed in the
  [loadout](#s9-squad-type-and-loadout) at the reserve line.
- **The fallen**: men killed, captured or evacuated this season, with the date and place ("Killed at Fleury crossroads,
  week of 20 June 1916"), and those returned to duty. This is a page of record, not a scoreboard.
- Selecting a man takes him (same as 1–8), if he can be taken.

### S6 Loading

**Stage** P. **Kind** Screen.

**Built** (`ui/loading.ts`): from "Join the battle" while the battle comes up (then the join screen), and again as the
player goes in, the sector and the week, the line of what happened at Verdun that week (`ui/front/verdun-1916.ts`, from
[the research note](../research/notes/history/verdun-1916.md)), the loading's steps and its bar, and a quiet line when
the game is drawing with WebGL. It gives way once the battle has drawn its first frame. Below: the spec as first
written.

The link to the battle in under ten seconds, so the loading screen is brief. Show progress honestly (assets, the
battlefield, the war's weather), the sector's name and the week ("Fleury, week of 20 June 1916"), and one line of
context about that week at Verdun, checked against the [research notes](../research/notes/). If WebGPU isn't available,
say quietly that the game is drawing with WebGL.

### S7 First session and the account offer

**Stage** P (first session), 3 (offer). **Kind** Overlay, then Screen.

The first session opens on the front door like any other; in the battle, the [H18 prompts](#h18-prompts-and-hints) teach
the controls. After the player's first operation (stage 3), a single screen offers an account: "Keep your squad, your
record and your side". Skippable, and offered again later, never in the middle of a fight.

### S8 Join

**Stage** 2. **Kind** Screen.

**Built**, simplified at the developer's asking (`ui/join-map.ts`, `ui/join.ts`): "Join the battle" opens the sector's
plan with every squad of the player's side pinned where it stands, the one held for them in brass, the first wave marked
with an arrow, reserves square, squads that can't be taken grey; and the stretch of their line the operation attacks
shaded. Beside it, the attack in three lines counted in minutes from the start (never a clock time: nobody knows the
server's hour), and the chosen squad in a sentence ("8 men, in the front line in square B3, 145 m from the enemy. Goes
over at 8 min."), with one button, **Start**. Choosing another squad swaps it with the one held for the player (the
simulation's `join-squad` command). Below: the spec as first written.

How a player gets into a sector in under a minute ([joining the battle](soldier-and-squad.md#joining-the-battle)). A
sector map with the choices, in this order:

1. **Take over a squad in the line**: every eligible bot squad of the player's side (type allowed by rank, at least four
   men standing, not in contact, not in an operation's wave), each with its men, state, order, place and **distance from
   the fighting**. A quiet sap or the crossroads.
2. **Join an operation**: planned operations, their objective, zero hour and waves with places left.
3. **Bring up a fresh squad**: from the pool, to the rear trench, with the wait.

Shows why a squad isn't available ("in contact"). Rejoining within a few minutes offers the old squad first. Instant:
choosing a squad starts the battle.

### S9 Squad type and loadout

**Stage** 2. **Kind** Screen.

When a squad deploys or refills at the reserve line ([squad types](roles-and-loadouts.md#squad-types),
[loadouts](roles-and-loadouts.md#loadouts)).

- **Type**: rifle section, assault section, support weapon team, engineer section; each with its eight roles, what it is
  for, the year's kit, and whether the sector's **cap** allows another (cap per ten squads; "2 of 2 assault sections in
  the line"). Types the player's rank doesn't allow show why ([ranks](progression-and-community.md#ranks)).
- **Loadout**: presets per type (for example fighting order, assault order), then **slot by slot**: each man's items
  against his **weight budget**, with the effect on stamina shown ("Heavy: out of breath sooner"). The trades in the
  [loadouts table](roles-and-loadouts.md#loadouts): extra grenades against rounds, wire cutters against a grenade,
  shovels, a second mask, greatcoats in winter.
- An **eight-slot strip** like the HUD's roster, so the squad looks the same here and in battle.
- Inventory is a list per man with weights, not a grid to pack: eight men's grids would be a chore.
- Stage 3: the roster's names and veterans in their slots.

### S10 Operations board and briefing

**Stage** 2. **Kind** Screen.

**Built** for the [playtest operation](operations.md#the-playtest-operation) (`ui/operation-report.ts`,
`ui/operation-pages.ts`): the briefing is the join screen's side panel (above), not a page of its own; at the end, the
report comes up by itself over the battle: the result, how long it lasted, both sides' losses, ours by cause, the
objectives as they changed hands, German machine gunners put down and the squad's own tally, with _Fight again_ and
_Front door_. `?free` plays without the operation. Below: the spec as first written, for stage 2's board.

Planned [operations](operations.md) for the side in this sector: objective, zero hour, waves and their jump-off
trenches, places left, the fire plan in outline (bombardments, the creeping barrage), and what the side knows of the
enemy there. **Sign up** for a wave. The briefing is a period order: a map extract, the objective, the timings and the
wave's task, written plainly.

### S11 Orders board

**Stage** 2. **Kind** Screen (or a tab of the sector map).

The sector commander's [orders for players](sector-battle.md#orders-for-players): job, place, size, how it ends, expiry,
reward (record and citations, never power). Ranked by need, top one first. Take one for the squad; it becomes
[H20](#h20-your-task).

### S12 Commander

**Stage** 2. **Kind** Screen.

The [sector commander's](sector-battle.md#the-sector-commander) view for a human commander: a planning map, the shell
budget, bot squads, operations to plan ([planning](operations.md#planning): objective, frontage, zero hour, fire plan
with its cost per item, waves, mines, consolidation), orders to post, requests from players, and the AI's advice. This
is a design project of its own, closer to a strategy game's interface; this doc only lists its content. Brief it
separately when stage 2 starts.

### S13 to S22: the war (stage 3)

| ID  | Screen           | Contents                                                                                                                                                                                                                                                                         |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S13 | Landing          | For returning players: today's communiqué headline, the war map, "Join the battle" (to S8), the player's squad and regiment. First-time players see it too                                                                                                                       |
| S14 | Side             | The season's side choice, locked for the season; the smaller side offered first with its reward; switching once with a 48-hour wait and the loss of the season's rank ([sides](balance.md#sides))                                                                                |
| S15 | War map          | The [front](war-map-and-season.md#the-war-map) as a chain of sectors: the line, active sectors and their battles (players, operations), key points, salients, supply routes and railheads, the [Balance](war-map-and-season.md#the-balance-winning-a-year) of the year, the date |
| S16 | Communiqué       | The [daily communiqué](war-map-and-season.md#the-communiqué), written from the side's own headquarters: the front map with the day's changes, each sector's gains and losses, key points, citations, the date and the weather to come, war events. Typeset as a period bulletin  |
| S17 | Main effort vote | Pick the sector that gets 30% more tomorrow ([allocation](war-map-and-season.md#allocation)); see the side's current tally                                                                                                                                                       |
| S18 | Service record   | The season's and lifetime [record](progression-and-community.md#service-record): days in the line, operations, ground taken and held, prisoners, wounded carried, wire, kills and men lost, citations, decorations, rank and what it unlocks                                     |
| S19 | Regiment         | Its name, members, chat, record, colours on the war map, its sector request                                                                                                                                                                                                      |
| S20 | Memorial         | The season's fallen of the player's squads and regiment, by name and place. Quiet, plain, unranked                                                                                                                                                                               |
| S21 | Season states    | Stand-to (the battle paused for about ten minutes at the cutoff; today a banner), between seasons, the war over: what happened, and what comes next                                                                                                                              |
| S22 | Sign in          | Accounts (Clerk or Better Auth, [architecture](../architecture.md)); the provider's screens styled to match                                                                                                                                                                      |

### S23 Errors and edge cases

**Stage** P (offline), 2 (online). **Kind** Screen or Overlay.

**Built**, offline: a browser with neither WebGPU nor WebGL 2 is told what it needs, and any other failure while the
battle comes up says so with a reload, in place of a blank page (`menu.fail`); a battle that runs under 24 frames a
second for 20 s suggests a lower setting once, with a way to the options (`ui/frame-watch.ts`); and "Click or press a
key for sound" shows while the browser keeps sound off. Below: the spec as first written.

- Browser not supported, or WebGPU and WebGL both unavailable: say what's needed, plainly.
- Low frame rate for a while: suggest a lower preset, once.
- Audio blocked until the first click (today audio starts on the first key or click): a quiet "Click for sound".
- Stage 2: connecting, reconnecting (the squad is in AI hands meanwhile; say so), disconnected, server full, the sector
  closed at the daily turn, a new version available.

## Notifications

Every message the game sends the player, with its channel. Today's log lines are marked Now; the rest need designing
and, where noted, data. "Log" is [H14](#h14-battle-log), "Banner" [H15](#h15-banners), "World" a marker, "Sound" a cue
or voice line.

| ID  | Event                                         | Text, for example                                              | Channels              | Data                                                    | Stage |
| --- | --------------------------------------------- | -------------------------------------------------------------- | --------------------- | ------------------------------------------------------- | ----- |
| N1  | Objective taken by us                         | "Fleury crossroads taken"                                      | Log, banner, world    | `objective-taken`                                       | Now   |
| N2  | Objective taken by the enemy                  | "Fleury crossroads lost"                                       | Log (alarm), banner   | `objective-taken`                                       | Now   |
| N3  | Enemy counter-attack coming                   | "The enemy is shelling the lost trench: counter-attack coming" | Log (alarm), banner   | `counter-attack`                                        | Now   |
| N4  | Our counter-attack                            | "Counter-attack ordered"                                       | Log                   | `counter-attack`                                        | Now   |
| N5  | Replacements arrive                           | "Replacements up in the rear trench: 8 men"                    | Log, world (W10)      | `reinforcement`                                         | Now   |
| N6  | Batteries out of a shell type                 | "The batteries are out of gas shells"                          | Log (alarm), H10      | `out-of-shells`                                         | Now   |
| N7  | Prisoners taken                               | "4 prisoners taken"                                            | Log                   | `capture`                                               | Now   |
| N8  | Our men surrendered                           | "2 of ours surrendered"                                        | Log (alarm)           | `capture`                                               | Now   |
| N9  | Gas alarm                                     | "Gas! Masks on"                                                | Log, banner, sound    | Mask Donning                                            | Now   |
| N10 | Squad man wounded                             | "Pvt. Martin wounded"                                          | Log, H5               | `wounded`                                               | P     |
| N11 | Squad man badly wounded or killed             | "Pvt. Martin is down" / "killed"                               | Log, H5, H16 if yours | `fallen` (with cause)                                   | P     |
| N12 | Squad man captured                            | "Pvt. Martin taken prisoner"                                   | Log, H5               | `capture`                                               | P     |
| N13 | Squad man brought in                          | "Pvt. Martin reached the aid post"                             | Log, S5               | `arrived-at-aid-post`                                   | P     |
| N14 | Squad man returned to duty                    | "Pvt. Martin is back on duty"                                  | Log, S5               | `returned-to-duty`                                      | P     |
| N15 | Squad man died of wounds                      | "Pvt. Martin died of his wounds"                               | Log, S5               | `died-of-wounds`                                        | P     |
| N16 | Squad man broke                               | "Pvt. Martin has broken"                                       | H5, world             | `morale.value`                                          | P     |
| N17 | Squad wiped                                   | See H17                                                        | H17                   | `squad.leader` -1, `arrivalOf`                          | Now   |
| N18 | Order given                                   | "Advancing to the crater line"                                 | H6, world, voice      | `squad-order` command                                   | P     |
| N19 | Fire called                                   | "High explosive called on the sap head: rounds in 30 s"        | Log, H10, world       | `fire-mission` command                                  | P     |
| N20 | Fire mission ends                             | "Bombardment ended"                                            | Log, H10              | `missions[].finished`                                   | P     |
| N21 | Zero hour, the whistle                        | "Over the top!"                                                | Banner, sound         | `barrage-attack`; needs an event ([sound](../sound.md)) | P     |
| N22 | Barrage lifting                               | "Barrage lifting in 10 s"                                      | H10, world            | Creep `lift`, `interval`                                | P     |
| N23 | SOS barrage called                            | "Red rocket: the SOS barrage is coming down"                   | Log, world            | `sosCalledAt`                                           | P     |
| N24 | Flare up                                      | (no text; the light is the message)                            | World                 | `flare`                                                 | Now   |
| N25 | Stand-to at dawn or dusk                      | "Stand-to"                                                     | Log, sound            | `isStandTo`                                             | P     |
| N26 | Stand-to at the cutoff                        | "Stand-to. The communiqué is coming in"                        | Banner                | `WarClock.paused`                                       | Now   |
| N27 | Communiqué out                                | "The communiqué is out"                                        | Banner, link to S16   | Daily turn                                              | 3     |
| N28 | Weather turns                                 | "Fog coming down"                                              | Log                   | `weather.pattern` change                                | P     |
| N29 | Wire cut                                      | (silent; seen in the world)                                    | —                     | `wire-cut`                                              | —     |
| N30 | Taken ground consolidated                     | "Ravine head is held"                                          | Log, H12              | Needs data                                              | 1     |
| N31 | Operation scheduled, assembly, zero hour near | "Assembly opens in 5 min: move to the jump-off trench"         | H19, banner           | Needs data                                              | 2     |
| N32 | Task taken, done, expired                     | "Bay 14 repaired"                                              | Log, H20              | Needs data                                              | 2     |
| N33 | Chat, pings                                   | —                                                              | H21, world            | Needs data                                              | 2     |
| N34 | Citation                                      | "Your squad was mentioned in dispatches"                       | S16, S18              | Needs data                                              | 3     |

Not reported: individual shots, enemy deaths one by one, kills credited to the player.

## Icons

The icon set the designer delivers, each in one style, legible at 16 px and good at 48 px, with a shape that doesn't
depend on colour.

| Group            | Icons                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Morale and fire  | Steady, shaken, broken, under fire, pinned                                                                                                                                                 |
| Breath           | Winded, spent                                                                                                                                                                              |
| Wounds           | Lightly wounded, badly wounded (down), being carried, at the aid post, returned to duty, hospital, killed, died of wounds, captured, shell-shocked                                         |
| Gas              | Masking, masked, gassed, gas here                                                                                                                                                          |
| Stance           | Standing, crouching, lying down, in a dugout, climbing out, over the parapet                                                                                                               |
| Roles            | Leader, rifleman, bomber, gunner, engineer; kit variants: forward observer, sniper, rifle grenadier, flamethrower                                                                          |
| Weapons and kit  | Rifle (Lebel, Gewehr 98), machine gun (Hotchkiss, MG 08), Chauchat, grenade (F1, Stielhandgranate), rifle grenade, trench mortar, flamethrower, wire cutters, shovel, mask, flare pistol   |
| Supply           | Rounds (clip, charger), low, none; grenades; machine-gun belt or strip                                                                                                                     |
| Orders           | Follow, hold, advance, run, reserve, creep, raid, suppress, bomb along, consolidate, carry wounded, cut wire, lay wire, withdraw, dig in, resupply, rally                                  |
| Fire             | Field HE, shrapnel, heavy HE, gas, smoke; bombardment, creeping barrage, standing barrage, SOS, call for fire, ration pip                                                                  |
| Effects          | Mud, snow, wire, uphill, night, fog, rain, flare, low sun, cold, tired, shaken, wounded, masked                                                                                            |
| Sector           | Objective (ours, theirs, no one, contested, taken-not-held), aid post (red cross), dump, arrival point, jump-off, battery                                                                  |
| Time and weather | Dawn, day, dusk, night; clear, fair, overcast, fog, drizzle, rain, storm, snow; wind arrow; north                                                                                          |
| Map              | Ping kinds (look, enemy, go, help, gas), task, operation                                                                                                                                   |
| Record           | Veterancy marks I–III; ranks for both sides (Soldat to Capitaine, Soldat to Hauptmann); Croix de guerre with palms and stars, Médaille militaire, Iron Cross 2nd and 1st class; fourragère |
| Interface        | Menu, close, back, settings, map, squad book, log, chat, keyboard key caps, mouse buttons                                                                                                  |

The red cross is a protected emblem: use it only for the aid post and bearers, as the game's
[red-cross rule](soldier-and-squad.md#wounds-stretcher-bearers-and-the-aid-post) intends, and check its use in games
with the developer before shipping.

## Visual language

Direction, for the designer to develop and decide.

- **Two registers.** In battle: small, quiet, legible, close to ink on a field card over the picture, with very little
  chrome. Out of battle: period documents (the communiqué as a typeset bulletin, maps as plans directeurs, the squad
  book as a nominal roll, briefings as written orders). Avoid pastiche that hurts reading: aged paper and stains belong
  to the out-of-battle screens at most, and lightly.
- **Palette.** The world is desaturated mud and chalk, with horizon blue (French, `#7d93ad`) and feldgrau (German,
  `#6a6f5c`) as its only saturated accents ([art direction](../assets/art-direction.md)). These two are close in
  lightness and poor as UI colours on their own; in the interface the **French are blue and the Germans red**, as on the
  period maps and whichever side the player is on, with shape and label to back them up. Code names them ours and theirs
  (`--hud-ours`, `--ui-ours`, `--paper-ours`), which take the French or German colour from the side played (`data-army`
  on the page).
- **State colours.** A neutral for steady, a warm amber for caution (shaken, under fire, winded), a strong warm for
  danger (pinned, broken, gas), and a muted grey for out. Today's cream `#f2ede0` and orange `#ffb27a` are a starting
  point. Never red against green.
- **Type.** One plain, legible face for everything that has to be read in battle, with tabular figures and full French
  and German accents (é, è, ç, ß, ä, ö, ü). A period display face (French army stencil lettering, or a Didone of the
  communiqués) may serve headings out of battle, never body text, and the [plain-font option](#s3-options) replaces it.
  Fonts must be licensed for web embedding (the SIL Open Font License is the easy case) and go in the asset
  [register](../assets/register.md).
- **Motion.** Short and purposeful: a fade, a single pulse on a change for the worse. No bouncing, no looping animation,
  no flashing.
- **Tokens.** Deliver colours, type sizes, spacing, radii and backing opacity as named tokens (CSS custom properties),
  with the colour-vision and high-contrast variants as alternative token sets, so the options switch tokens, not
  components.

## Accessibility

Requirements, drawn from the [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/) and
Xbox's text and contrast guidance
([XAG 101](https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md),
[XAG 102](https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-102-contrast.md)):

- **Text**: body text at least 18 px at 1080p by default, scalable to 200%; a plain-font option; plain language.
- **Contrast**: 4.5:1 for text and essential marks against their backing, 3:1 for large text; 7:1 in high contrast.
  Every overlay has a backing with adjustable opacity.
- **Colour**: no information by colour alone; colour-vision palettes for state and side colours.
- **Captions**: every voice line captioned, with the speaker and its meaning in the interface language (the voices are
  French and German, `scripts/voice-lines.json`): "Sgt. Dubois: Gas! Masks on!" Optional captions for important sounds
  (incoming shell, whistle, gas gong) and visual cues for them. Built (`ui/captions.ts`), off by default and kept short
  at the developer's asking: one line each, an arrow for the direction tinted by side, a name only for the player's own
  squad ("Vincent: Follow me!"), and the meaning of the take that played. "What matters" captions gas, grenades, take
  cover and the squad's own orders; "Everything" adds the rest and the warning sounds. Two at most, for 2.5 s.
- **Input**: every key rebindable; every hold also available as a toggle; no fast repeated presses required; the radial
  usable without precise mouse work.
- **Motion and light**: screen effects, shake and flashes each reducible or off; nothing flashes more than three times a
  second.
- **Layout**: every HUD zone can be resized, hidden or set to show only on change.
- **Menus**: keyboard navigable, focus visible, proper roles and labels (the current menu is already a labelled dialog).

## Text and localisation

- English first; French and German interfaces later (stage 3). Allow 30–40% expansion for both.
- Ranks, units and period terms are named in the side's own language ("Caporal", "Gefreiter", "poste de secours"),
  glossed in English in the squad book and on first sight.
- Each side's texts are written from its own side: "our lines", "the enemy", and in the communiqué each headquarters'
  own account ([communiqué](war-map-and-season.md#the-communiqué)).
- Dates in the day-month-year form, "21 February 1916"; times on the 24-hour clock, French civil time.
- Names of men (stage 3) come from period records of each side's recruiting regions.

## How it's built

The HUD in `apps/client/src/hud/`, as built:

- **One state, many elements.** `hud-state.ts` works out everything the HUD shows from the simulation, ten times a
  second, as one plain object (`HudState`); its parts live beside it (`soldier-state.ts`, `sector-state.ts`,
  `fire-support.ts`, `battle-log.ts`, `banners.ts`, `succession.ts`, `hints.ts`, `squad-order.ts`, `attention.ts`) and
  are tested in Node. Elements only draw that state.
- **Each element is swappable.** Every element is one module and one stylesheet in `hud/elements/`, built by a factory
  that gets the HUD's context and returns `{ id, zone, root, update(state), frame?(state) }` (`element.ts`).
  `registry.ts` lists them in the order each zone stacks them. A redesign is a new module and a changed line in the
  registry; in a dev build `verdun.hud.swap(id, factory)` swaps one into the running game.
- **Zones** are the corners and layers of [screen layout](#screen-layout): `top-right`, `bottom-left` and so on,
  `centre` for cards, `screen` for the effects under everything and `world` for marks over the ground.
- **DOM over the canvas.** Panels are HTML and CSS; marks on the ground are one SVG layer projected through the camera
  each frame after the battlefield is drawn; the war map is one 2D canvas. The HUD ignores the pointer except where it
  must be clicked or hovered (roster tiles, the effects column, the artillery board), because the pointer is the aim.
  The aim cursor is drawn as the browser's own cursor, so it never lags.
- **Tokens and icons.** `tokens.css` names every colour, face, size and timing, with colour-vision and high-contrast
  sets; `icons.ts` is the icon set as one SVG sprite. Elements use nothing else.
- **Keys and labels.** Key caps come from the controls list in `ui/bindings.ts` (`keys.ts`), so they follow the game's
  bindings; a test checks each is still found. The overview key is the HUD's own, registered in the controls list.
- **Settings.** `interface-settings.ts`: HUD scale, effects strength, backing, colour vision, high contrast and the
  prompts, kept in the browser; `hud.configure(settings)` applies them, until the options screen exists.
- **No Fluent UI.** A UI library for menus and the war map is an [open question](../open-questions.md#technical),
  leaning shadcn/ui restyled to this direction; the in-battle HUD stays custom and minimal.
- **Performance.** The game shares the frame with 500 soldiers: no blur behind panels (`backdrop-filter`), no continuous
  CSS animation, text and attributes written only when they change, and the war map drawn only while it shows.

## Data gaps

What the design above needs that the simulation or client doesn't provide yet. For the developer.

| Need                                                  | For                     | Where                                                                      | Stage              |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- | ------------------ |
| Names, ranks, hometowns per man                       | H1, H5, H16, S5, logs   | [Roster](progression-and-community.md#the-squad-roster)                    | P (placeholder), 3 |
| Roles per slot                                        | H1, H5, S9              | [Roles](roles-and-loadouts.md#roles)                                       | 2                  |
| Active effects with reasons in one place              | H2                      | [Conditions step](interactions.md#in-the-code)                             | P                  |
| Rifle rounds, machine-gun ammunition, jams            | H4, H5                  | [Ammunition](logistics.md#ammunition-on-the-man-planned)                   | 1                  |
| An event or callback for squad orders and the whistle | H6, N18, N21, voices    | `player-control.ts`, `skirmish.ts` ([sound](../sound.md))                  | P                  |
| A per-player ration and observation check for calls   | H10                     | [Who fires](sector-battle.md#who-fires)                                    | 2                  |
| Fire missions named by who called them                | H10, W6                 | `sim.artillery.missions`                                                   | P                  |
| Capture progress, control cells, consolidation clock  | H12, W11, S4            | [Territory](sector-battle.md#territory)                                    | 1                  |
| Bearer assignment, triage outcome per man             | Vocabulary, S5          | [wounds.ts](../../packages/sim/src/wounds.ts)                              | 1                  |
| Veterancy, shell shock, rally, fatigue                | Vocabulary, H7, H2      | [Morale and stamina](morale-and-stamina.md)                                | 1–3                |
| Operations, waves, orders for players, chat, pings    | H19, H20, H21, S10, S11 | [Operations](operations.md), [orders](sector-battle.md#orders-for-players) | 2                  |
| Settings storage                                      | S3                      | Client                                                                     | P                  |

## Deliverables

What to hand back, in order of need. The first group makes the prototype playtest ([M8](../roadmap.md#milestones))
readable; the rest can follow its stage.

1. **Foundations**: tokens (colour, type, spacing, backing) with colour-vision and high-contrast sets; the type choice;
   the state vocabulary's icons and colours; key caps.
2. **Battle HUD for the playtest**: H1–H6, H8–H11, H14–H18, the screen effects E1–E8 as motion notes, world markers
   W1–W10, at 1920×1080 and 1280×720, over day, night, snow, gas and a flare; each element at rest, changing and
   alarmed.
3. **Menu, controls, options and the sector map**: S1–S4, S6, S23.
4. **Squad book**: S5.
5. **Stage 1–2**: H7 radial, H19–H21, S8–S11, W11, the rest of the icons.
6. **Stage 3**: S13–S22, with the communiqué and war map as the showpieces.

For each: layouts at the sizes above, every state, the motion, redlines or a component spec, and SVG icons. Mock real
content: Fleury's objectives, French and German names, long German words, a squad half down.

## Open questions

For the designer and developer to settle, then fold into the sections above.

- **Interactive HUD.** Clicking roster tiles takes the pointer off the aim. Fine at the corners, or should every HUD
  action have a key and the HUD stay click-through?
- **Hit chance** on the target (H8): coarse words, or nothing, leaving it to feel?
- **Calls for fire**: hold-to-preview (proposed) or a period form and a runner, as Tannenberg made them physical? The
  form is authentic but slow; a ration and a delay may carry the period weight instead.
- **Minimap**: none is proposed (the camera zooms out to 450 m, and S4 opens on a key). Playtest whether players miss
  one.
- **The red cross** in a game: check the emblem's protected status before shipping, or use the period _poste de secours_
  sign without it.
- **Keys** for the radial, the map, rally, ping and the squad book (S2).
- **UI library** for menus and the war map ([open questions](../open-questions.md#technical)).
