# Direct control overhaul: a proposal

**Status:** built, 5 October 2026, except where [what's left](#whats-left) says otherwise. It answers the playtest
verdict that the game is fun but moving a soldier feels awkward, aiming is hard, it's hard to tell whether you can see
or hit a man, men get stuck, and the rain looks cheap. The developer took the proposal as it stands; the
[decisions](#decisions) record it. Part of the [game design](overview.md).

## Built

| What                                                                                                      | Commit    |
| --------------------------------------------------------------------------------------------------------- | --------- |
| Collide-and-slide controller, solid scenery, men easing apart, bots vaulting, follow as a file, 3 s fence | `35d71df` |
| The player's shot at the man picked out; steadying                                                        | `3d7c7fb` |
| Tests for the trench lines, the sidestep and the corner stop                                              | `445724c` |
| Field view at 55° leaning toward the pointer                                                              | `d2fdc89` |
| WASD held across camera turns                                                                             | `7da47cd` |
| Aim view on the right button                                                                              | `93c1ee8` |
| Picking out the man nearest the pointer, the aim drawn from the page, fog of war on                       | `96272b8` |
| The sight picture: own cover, unseen, too dark, out of range, the ring filling as the aim steadies        | `b453b1f` |
| The sight picture at the screen's centre in the aim view                                                  | `3cee5d2` |
| The ring on the man in the sights as wide as the shot's spread                                            | `de853ca` |
| Climbing a wire fence, keyed on the Synty rig; the Mixamo bone map                                        | `2d641bb` |
| Rain as a camera sees it: GPU streaks round the camera, sheets beyond, ripples, no puffs                  | `eefebe5` |
| The player's soldier moved and turned on the page ahead of the worker                                     | `4e928be` |

Measured after: the sim's step for 520 soldiers took 3.76 ms against 3.70 ms before (four alternating rounds, within
noise). Balance, three bombardments over 15 seeds: the French attack held 47% before and after; the German attack fell
from 40% to 20%, all of it from men no longer standing on one spot (without the easing apart it rose to 80%), so the
stacking was an artefact and Game mechanics is retuning how a stretch counts as held.

## What's left

- **Rain's cost**: the sheets of rain beyond the streaks cover the screen, about 1.4 ms of GPU at 1080p whatever the
  rate, so they're left out in drizzle (under 0.3 mm an hour) and on Low graphics (`48066ab`); in rain proper the new
  rain costs 1.8 to 2.3 ms against the old 0.9 to 1.9. Splashes show on any ground near the camera, not only on
  duckboards and water.
- **Mixamo clips**: in (`ba4345e`, `e92ce5a`, the "Mixamo animations" session): wall scrambles loop Mixamo's climb up a
  slope, and the fence is now crossed in Mixamo's vault, its 1.25 s the climb's length (it was 3 s). A ledge pull-up for
  trench walls is left for later.
- **`clearLine` seeing walls** (section 3) and a stuck monitor with memory: not done. Men on orders climb what they head
  at within 45°, so they rarely box themselves in; when they do they sidestep (`wayOut`).
- **Real rounds** (stage B) and the trench graph: not started, and only if playtests ask for them.
- **Pointer lock** in the aim view was only tried with synthetic events, which browsers don't count as a gesture; try it
  with a real mouse.

## Summary

1. **Men get stuck because walls aren't walls.** Movement takes the input literally and treats anything steeper than 45°
   as a slow scramble, never as something to slide along. In a trench, steering 10° off its line costs a quarter of the
   pace and starts the man up the back wall. Fix: a collide-and-slide character controller in the simulation, with
   deliberate climbing.
2. **The squad's follow order empties the trench.** Follow places are a rigid grid 3 m apart round the leader's facing,
   which the mouse turns. In a 2.2 m trench every place is outside the walls: all seven followers climb out. Fix: follow
   the leader's track in single file, and check every place against the ground.
3. **Aiming has no skill in it and says little.** A shot strikes the nearest enemy within 4° of the facing, by a dice
   roll; where the reticle sits doesn't matter beyond that, holding steady doesn't help, and fog of war starts off, so
   the player sees men his soldier can't. Fix: aim at men rather than ground, a reticle that says why a shot can't go,
   steadying, and a circle that shows the real spread.
4. **The camera does two jobs badly.** Close in it drops to a chase-camera angle (18° above the horizon) without a chase
   camera's mouse look, so aiming at range means pointing at ground that runs off to the horizon. Fix: a field view at
   the designed 55° that leans toward the pointer, and an aim view behind the soldier's shoulder while the right button
   is held.
5. **Rain is drawn to be seen from far off,** so close in it's fat white sticks and glowing puffs. Fix: thin streaks
   drawn on the GPU around the camera, rain sheets for distance, and ripples instead of puffs.

## What's wrong today

### Movement

`movementSystem` (`packages/sim/src/systems/movement.ts`) moves a steered soldier exactly along the input. The ground
ahead only changes his pace: `groundPace` slows him on slopes, and `climbLimit` caps him at 0.6 m/s divided by the grade
where it rises steeper than 45°. A trench wall drops 1.9 m across one 0.5 m height cell, a grade of about 3.8, so
pushing into it climbs it at about 0.14 m/s. Nothing ever turns him along it.

Measured in a straight fire trench on firm ground, 4 s of walking from the trench floor (5.0 m on the trench's line):

| Steering off the trench's line | Toward the parapet                                | Toward the back wall                |
| ------------------------------ | ------------------------------------------------- | ----------------------------------- |
| 10°                            | 3.6 m along, partway up onto the fire step        | 3.7 m along, 0.2 m up the back wall |
| 20°                            | 2.6 m along, on the fire step                     | 2.2 m along, 0.8 m up the back wall |
| 45°                            | 1.4 m along, on the fire step                     | 0.8 m along, 0.9 m up the back wall |
| 90°                            | Nothing along, climbing the parapet from the step | Nothing along, 1 m up the back wall |

WASD is relative to the camera and trenches zigzag, a traverse every few metres, so the input is almost never on a bay's
line. The man grinds into a wall, slows to a crawl and creeps up it, out of the cover the trench gives, without the
player meaning to. That is the "stuck" feeling.

Other findings:

- **The player walks through scenery.** Ruins, walls, trees, guns and bunkers are impassable to the routes bots take
  (`SCENERY_FOOTPRINTS`, `walkCost: Infinity`), but steering never looks at them. Walking at a ruin 10 m ahead, the
  player's man spent 5.75 s inside its footprint; a squadmate on the same advance went round it.
- **Climbing is both implicit and explicit.** Space vaults a wall or fence (`vault.ts`), but pushing into a wall climbs
  it too, slowly.
- **Wire stops a man dead, silently.** Intact wire is 5% of walking pace. That's right, but nothing tells the player
  he's in it or which way is out.
- **Follow empties the trench.** `followSlot` (`squads.ts`) lays the followers in rows of four, 3 m apart, behind the
  leader's _facing_, unchecked against the ground. With the leader walking along a trench and then turning to aim over
  the parapet, all seven followers ended up on open ground 3 to 6 m behind it. Turning the mouse swings the whole squad
  round behind him.
- **Bots walk straight through walls when the line is "clear".** `clearLine` (`navigation.ts`) checks ruins, pools and
  wire, not slopes, so a bot whose target is in sight walks straight at it across trench walls and crater lips at a
  scramble. The route grid's 2 m cells are wider than the 1.45 m trench floor.
- **No one makes room.** Soldiers pass through each other; nothing notices a man who has stopped making progress.

### Aiming and seeing

- **A shot is a dice roll.** `fireAimed` (`combat.ts`) fires at the nearest enemy within about 4° of the facing whom the
  soldier can see, and hits if `rng < hitChance`. Where in the 4° the reticle sits, and for how long, changes nothing.
  Typical chances with a rifle, from `hitChance`: a man walking in the open at 100 m, 5.5%; a head over a parapet at 50
  m, 4%; halve either while you walk. The reticle's pips read "poor" most of the time without saying why.
- **Aim is a bearing from a point on the ground.** The pointer picks the ground (`ground-pick.ts`) and the soldier faces
  it. Close in the camera is low, so the ground under the pointer runs off toward the horizon: zoomed to 14 m, a pixel
  moves the point most of a metre at 70 m, and pointing at the chest of a man 60 m off picks ground about 15 m behind
  him.
- **The aim lags the mouse.** The facing, the aim line, the target ring and the body all come back from the simulation's
  worker: the command waits for the next batch and the next 20 Hz step, comes back a frame later, and the body then
  glides for 50 ms. By the code path that's roughly 100 ms for the body and a few frames for the aim line (worked out,
  not measured).
- **What you see isn't what he sees.** Fog of war starts off (`start-battle.ts`, `enabled: false`), so every enemy is
  drawn; with it on, an enemy shows when any squadmate sees him. Either way the camera is 20 to 60 m up and sees over
  every parapet. The soldier under control often can't see the man under the pointer, and the reticle simply stays gold:
  nothing says "hidden from you", "out of range", "too dark" or "your own parapet's in the way".

### Camera

- `pitchForDistance` drops the camera to 18° above the horizon at 8 m and 37° at the starting 60 m: well below the
  55–60° in the [vision](../vision.md#presentation). It's a chase camera's angle without a chase camera's mouse look.
- Three leads pull the view at once: ahead along the walk (`WALK_LEAD`), toward the pointer while the right button is
  held (`AIM_LEAN`), and ahead along the view close in (`LOOK_AHEAD`). The pointer edge-pans after 0.35 s, and turning
  the camera turns WASD with it mid-stride.

### Rain

`precipitation.ts` was built to show from far above (as [time and weather](../time-and-weather.md) records: "drawn wider
than real drops so they show from above"):

- **Drops** are stretched billboards 9 to 14 cm wide and 10 to 16 times as long, at 45% opacity, from a soft round
  sprite: fat white sticks. A real drop is 1 to 4 mm across, and its streak in a sixtieth of a second about 15 cm.
- **Splashes** are soft round sprites 6 to 12 cm across that grow 2.2 times as they fly up and fall back over a quarter
  of a second at 55% opacity: glowing white puffs on the ground, the "smoke".
- Every drop is equally bright, lit only by the hour; real rain all but vanishes except against a dark background or lit
  from behind.
- The rain falls in a box 110 m across round the camera's _target_, simulated on the CPU (6,000 drops and 1,500
  splashes), so from the starting 60 m the drops you see are mid-distance ones made big enough to show.

## Prior art

From a research pass in October 2026; sources are linked, and anything only seen in search snippets is left out.

**Camera and aim in the closest games**

| Game                      | Camera and aim                                                                                                                                                                                                                                                                                         | Seeing                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Running With Rifles       | Top-down; the pointer toward a screen edge extends the view that way by about 80%, more with a scope; accuracy is the weapon's times a stance factor (running 0.3, standing 0.85, prone 0.93); bullets fly                                                                                             | No fog for the player; the AI is gated by sight lines, and crouching or lying shortens how far it spots you                                   |
| Foxhole                   | Right button aims, no hip fire; a cone from the muzzle whose spread is set by stability (0 to 1), which drawing the weapon zeroes, moving and turning spend, and standing still, lying and cover restore; an orange line drops from the aim point to the ground because height is ambiguous from above | Sight lines through terrain and structures; men hidden behind objects drawn as coloured silhouettes; cover shown as one to three shield icons |
| Gates of Hell: Ostfront   | Direct control from the top-down camera (E), or third person on T; the middle button orders the squad meanwhile; the crosshair's dot is green for a clear line of fire and red when something is in the way or it's out of range                                                                       | As the RTS view                                                                                                                               |
| Alien Swarm (source code) | The pointer's screen ray picks a target, preferring the one nearest the marine along the line through the pointer; the aim height then snaps to the target's, which is how a top-down game aims at men on different levels                                                                             | A sight-line check from the weapon before the target counts                                                                                   |
| XCOM, Valkyria Chronicles | A top-down view for moving and orders; choosing a shot swings the camera behind the shooter's shoulder at the target, with the chance and the cover shown                                                                                                                                              | Cover as shield icons                                                                                                                         |
| Phoenix Point             | Free aim: an outer circle every shot falls in and an inner circle holding half of them; each round is flown, so a man inside the circle can still be missed through a gap                                                                                                                              | First person from the shooter while aiming                                                                                                    |

Sources: [RWR vision](https://runningwithrifles.fandom.com/wiki/Line_of_Sight,_Vision),
[RWR weapons](https://runningwithrifles.fandom.com/wiki/How_to_create_new_weapons),
[Foxhole stability](https://foxhole.wiki.gg/wiki/Stability),
[Foxhole devblog 48](https://www.foxholegame.com/post/devblog-48), [Foxhole cover](https://foxhole.wiki.gg/wiki/Cover),
[Foxhole vision](https://foxhole.wiki.gg/wiki/Vision),
[Gates of Hell manual](https://cdn.akamai.steamstatic.com/steam/apps/400750/manuals/CtA_-_GoH_Game_manual_1.0.pdf),
[Alien Swarm input](https://github.com/ReactiveDrop/reactivedrop_public_src/blob/HEAD/src/game/client/swarm/asw_input.cpp),
[Phoenix Point combat](https://phoenixpoint.wiki.fextralife.com/Combat). Foxhole's stability numbers are the most
concrete settling model found: it recovers about 37% a second standing, 1.43 times that crouched, 2.7 times lying, and
up to twice as fast again in full cover.

**Moving and climbing**

- **Collide-and-slide.** Quake III's `PM_SlideMove` bumps up to four times, slides along the crease where two walls
  meet, and stops dead at three; `PM_StepSlideMove` steps up and back down for stairs; ground counts as walkable up to
  about 45°. Fauerby's paper is the general form.
  ([Quake III](https://github.com/id-Software/Quake-III-Arena/blob/master/code/game/bg_slidemove.c),
  [Fauerby](http://www.peroxide.dk/papers/collision/collision.pdf))
- **Rapier's character controller** does the same (autostep, slope limits, snapping to the ground, sliding) in the
  version we ship, but the standard build is only deterministic on one machine; a slower cross-platform deterministic
  build exists. ([Rapier](https://rapier.rs/docs/user_guides/javascript/character_controller))
- **Vaulting** is a key in Running With Rifles, Hell Let Loose and PUBG; PUBG and Battlefield 2042 decide between
  climbing onto and vaulting over from the obstacle's depth.
  ([PUBG](https://www.invenglobal.com/datalab/articles/3549/pubg-pbe-all-about-vaulting-and-climbing),
  [Battlefield 2042](https://www.ea.com/able/resources/battlefield-2042/pc/mouse-and-keyboard))

**Crowds and getting unstuck**

- **Supreme Commander 2's flow-field tiles** (Emerson, Game AI Pro chapter 23): 1 m cells in 10 × 10 sectors, a
  line-of-sight pass so men inside it walk straight at the goal, rebuilds of only the sectors that changed, and men who
  push each other and slide along walls physically: the field gives the way, the body does the last metre.
  ([chapter](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf))
- **Context steering** (Fray, Game AI Pro 2 chapter 18): interest and danger maps over a ring of directions, mask the
  dangerous ones, take the most interesting.
  ([chapter](http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter18_Context_Steering_Behavior-Driven_Steering_at_the_Macro_Scale.pdf))
- **Stuck units:** the Recoil engine (Beyond All Reason) counts a unit idle when it neither turns nor closes on its
  waypoint, re-routes it, gives up after 16 checks, and widens the arrival radius as the idle count grows so a crowd at
  the goal counts as arrived; 0 A.D. alternates short and long route searches, widens the short search with each failure
  and adds a back-up waypoint away from the obstruction. Detour's crowd has no such check.
  ([Recoil](https://github.com/beyond-all-reason/RecoilEngine/blob/master/rts/Sim/MoveTypes/GroundMoveType.cpp),
  [0 A.D.](https://github.com/0ad/0ad/blob/master/source/simulation2/components/CCmpUnitMotion.h))
- **Navigation meshes** (recast-navigation-js, and Babylon's navigation plugin built on it) run in browsers and Node
  with crowds and moving obstacles, but carry cost by area type, not cell by cell.
  ([recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js))

**Rain**

- **Why rain looks thin** (Garg and Nayar, "Vision and Rain"): a drop crosses a pixel in about a millisecond of a
  frame's thirty, so at a frame's exposure it's a faint transparent streak; it is brighter than what's behind it and
  shows most against dark backgrounds. A 2 mm drop falls at about 6.5 m/s, a 10 cm streak in a sixtieth of a second.
  ([paper](https://www.cs.columbia.edu/CAVE/publications/pdfs/Garg_IJCV07.pdf))
- **Rain round the camera:** NVIDIA's rain sample animates drops on the GPU in a volume round the camera; "GPU Rainfall"
  (Rousseau and others) wraps drops leaving a 100 m box to its other side, so none are born or die, and finds 10 to 20
  thousand enough; Crysis 3 and Remember Me add layers of scrolling streak texture on cones or cylinders round the
  camera for distance. Tatarchuk's ToyShop composited a scrolling rain texture over the screen and biased it toward
  white because true rain is too faint.
  ([NVIDIA](https://developer.download.nvidia.com/whitepapers/2007/SDK10/RainSDKWhitePaper.pdf),
  [GPU Rainfall](https://classes.cs.uchicago.edu/archive/2022/fall/23700-1/papers/gpu-rain.pdf),
  [Crysis 3](https://archive.org/download/crytek_presentations/fmx2013_c3_art_tech_donzallaz_sousa.pdf),
  [ToyShop](https://advances.realtimerendering.com/s2006/Chapter3-Artist-Directable_Real-Time_Rain_Rendering_in_City_Environments.pdf))
- **Splashes:** a crown splash lasts 10 to 20 ms and shows for a frame or two, and only on a film of water; on other
  ground a drop throws a few droplets with no crown (Garg, Krishnan and Nayar). Our splashes live 120 to 280 ms.
  ([paper](https://www.cs.columbia.edu/CAVE/publications/pdfs/Garg_EGSR07.pdf))
- **Ripples** (Lagarde, Remember Me): a precomputed texture of rings (distance, direction, a random start time),
  animated as a damped wave, in four layers that switch on with each quarter of rain intensity, for about 0.15 ms.
  ([blog](https://seblagarde.wordpress.com/2013/01/03/water-drop-2b-dynamic-rain-and-its-effects/))

## Proposal

### 1. A character controller that slides (simulation)

Replace the "move along the input, slowed by the ground" step with collide-and-slide on the height grid and the scenery,
the technique behind Quake's `PM_SlideMove` and every kinematic character controller since. It stays pure and
deterministic in `packages/sim`, so bots, the worker and the server all get it.

- **The man is a disc** 0.3 m across his middle, probed ahead at his centre and either shoulder, not a point.
- **Ground ahead falls into three kinds,** by how much it rises within a stride:

  | Rise ahead      | Examples                                                   | What happens                                                                              |
  | --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
  | Up to 0.45 m    | Duckboards, a fold in the ground, a gentle crater side     | Walked, slowed by the slope as now                                                        |
  | 0.45 m to 1.2 m | The fire step from the floor, a crater lip, a low parapet  | Pushing into it for a quarter of a second while heading at it climbs it; otherwise slides |
  | More than 1.2 m | A trench wall from the floor, the back wall, a ruin's wall | A wall: slides along it; Space vaults it where `vault.ts` allows                          |

- **Sliding** removes the part of the step that goes into the wall and keeps the part along it, at full pace, two or
  three times per step for corners. A 40-line sketch of it on the same height grid, run against the measurements above:
  steering 45° into a fire trench's wall carries him 3.6 m along the trench in 4 s (71% of his pace, against 16 to 28%
  today) and he never leaves the floor. Holding one diagonal key for a minute along a communication trench of six bays
  at 45° to each other, the sketch walks him the length of it on the floor; today's movement leaves the trench at the
  first bend and ends 23 m away on open ground, on the floor 23% of the time.
- **Scenery** with impassable footprints (ruins, walls, trees, guns, bunkers, stores) becomes discs he slides round, the
  same rule the routes already use. A man found inside one is pushed out.
- **Climbing is deliberate.** Nothing above 1.2 m is climbed by pushing; Space vaults it, with the prompt shown when he
  stands at a climbable wall. Low ledges are climbed by heading into them; PUBG and Battlefield 2042 likewise judge
  climbing onto against vaulting over from the obstacle.
- **Men make room.** Men closer than 0.6 m ease apart a little each step (the spatial hash in `spatial.ts` finds them);
  bots step aside for a player's man, never the reverse.
- **Wire says so.** The ground under the pointer, the soldier card and a footstep sound tell the player he's in wire,
  and the cheapest way out is drawn faintly on the ground while he's in it.

### 2. Squads that move like men in a trench (simulation)

- **Follow is a file.** The leader leaves a track, a point every half metre for the last 40 m. Follower _n_ heads for
  the point on it _n_ × 2 m behind him in a trench and _n_ × 4 m in the open, so in a trench the squad files along it,
  as trench traffic did, and in the open it follows his path round wire and craters rather than cutting across.
- **Places are checked.** A place for any order (follow, advance, creep) must be walkable ground, out of the wire, and
  in a trench if the leader is in one; otherwise the nearest that is. `coverNear` already finds the best hollow nearby.
- **Facing doesn't move the squad.** Formations orient by the way the leader walks, never by where he aims.
- **Standing to.** When the leader steps up onto a fire step and stops, the followers take the fire step along the same
  bay, a man every 2 m, facing out.

### 3. Navigation: keep flow fields, fix the local layer (simulation)

The flow fields (`navigation.ts`) suit this game: hundreds of men sent to a few objectives over ground whose cost
changes with mud, wire and craters, as Supreme Commander 2's flow-field tiles were built for. A navigation mesh
(Recast/Detour) would need rebuilding under every crater and can't carry the wire's cost cell by cell. What fails is the
local layer:

- **`clearLine` checks for walls,** so a bot only walks straight where the ground lets him.
- **The controller does the last metre.** Bots get the same sliding, mantling and making room as the player, so a route
  that clips a wall corner slides round it instead of stopping.
- **Stuck men notice.** Each squad think, a man with a move order who has made less than 0.3 m of progress in 3 s
  escalates: vault if a wall or fence is in front of him, then re-route with the cell he's stuck on made dear for 30 s,
  then step aside toward the best of 16 directions scored by the field and the obstacles (context steering).
- **Later, if still needed:** 1 m cells in and around trenches, or a graph of the trench network built from the map's
  trench lines (bays, traverses, junctions, exits), so routes that start and end in the trenches travel them like a
  rail.

### 4. Aiming: aim at men, and show the spread (client, a little simulation)

In two stages. The first keeps the combat model and balance as they are; the second changes them, and only if the first
leaves shooting feeling like a lottery.

**Stage A: honest dice.**

- **Aim at men, not ground.** The pointer picks the nearest enemy on the screen within about 28 px of it (scaled with
  the marker size), and keeps him until another is clearly nearer: the target magnetism twin-stick and top-down shooters
  use. The ground is the fallback. The shot goes at the man picked, not the nearest one in a cone.
- **Draw the aim at once.** The aim line, the target ring and the body's turn come from the pointer on the page, not
  back from the worker; the simulation gets the facing as now.
- **Say why a shot can't go.** The reticle has states the player can read without words: on target; blocked (the line
  from his eye meets his own parapet or the ground first, drawn to where it strikes, as Gates of Hell's red dot says);
  can't see him from here (a squadmate can: the man is drawn, ghosted); out of range; too dark or too much smoke.
- **Steady your aim.** Today's `hitChance` becomes the steadied chance. A snap shot at a man just swung onto gets half
  of it, rising to all of it over about a second and a half still on him, faster lying down or resting on a parapet, and
  falling back as soon as he moves, is shaken or switches target: Foxhole's stability and Arma's resting. A rifle's bolt
  takes 3 s, so a player who stays on his man between shots always fires steadied. Bots, who fire every few seconds at a
  man they've watched, keep today's numbers, so the balance holds.
- **Show the spread.** A ring on the target, drawn at his distance, whose area is his exposed area divided by the
  chance: a head over a parapet sits small in a wide ring, a man in the open fills a tight one, and the ring tightens as
  the aim steadies. The pips stay, as the [interface](interface.md#h8-cursor-and-aim) asks: never a percentage.
- **Fog of war on by default,** with three looks for an enemy: seen by you (drawn plainly), seen only by a squadmate
  (drawn ghosted, with a tick toward the man who sees him), and last seen (a fading mark where he was, for 10 s).

**Stage B: real rounds (optional).** A shot is a ray from the muzzle within a cone of spread, against the man's head,
chest and legs and against the ground and parapet, rather than a roll. The cone comes from the same things `hitChance`
weighs, fitted so a bot's snap shot at a man's chest reproduces today's chances; a steadied, braced player does up to
about twice as well, and a head over a parapet has to be aimed at. It needs a 3D aim point in the `face` command, a
balance A/B, and care that the covered cases (which the dice put at 35% of the exposed chance) come out close.

### 5. Camera: a field view and an aim view (client)

Two views on one rig, plus the command view the rig already has:

- **Field view, the home.** Top-down at the vision's 55° (pitch no lower than about 45° above the horizon before the
  zoom passes 12 m), centred on the soldier and leaning toward the pointer by about a third of the way, always, as
  Running With Rifles extends the view toward the pointer; that replaces the walking lead, the aim lean and the
  look-ahead. No edge panning here. Turning the camera keeps WASD's meaning until the movement keys are let go, as
  third-person games hold the stick's direction across a camera cut.
- **Aim view, while the right button is held.** The camera eases in a quarter of a second to behind the soldier's
  shoulder at his eye height and looks along his aim, with the field of view narrowed for the weapon (about two times
  for a rifle, five for a scoped rifle). The mouse turns the aim with the pointer locked, the left button fires, and he
  walks rather than runs. The player sees exactly what his man sees, his own parapet included. Letting go swings back.
  This is XCOM's targeting camera, Valkyria Chronicles' action mode and Arma's third-person to sights, in real time.
- **Command view** stays as built: arrows, Shift + middle-drag, the wheel past about 60 m, and the war map past 150 m.
  Space or Home goes back to the field view.

The vision says the camera is top-down and "a close over-the-shoulder view may come later". The aim view is that view,
but only while aiming: the battlefield, the fog, the ground marks and the orders stay top-down. Going wholly
third-person, as Gates of Hell's T key offers, is the alternative if playtesters live in the aim view.

### 6. Rain (client)

- **Streaks on the GPU, round the camera.** A fixed set of thin quads whose places wrap in a box about 30 m across round
  the camera itself, moved in the vertex shader from the time, wind and camera position: no particles to emit or age,
  nothing on the CPU each frame. As many are drawn as the rate asks.
- **Streaks as a camera sees them.** Each is as long as a drop falls in a sixtieth to a thirtieth of a second (10 to 20
  cm for a 2 mm drop at 6.5 m/s) and as wide as the drop, drawn at least a pixel wide with its opacity cut by how much
  of the pixel it covers: the same trick the tracers use. Opacity 0.1 to 0.25, lit by the sky and brighter lit from
  behind, by the sun, a flare or a burst.
- **Rain sheets for distance.** Two or three layers of streak texture scrolling on cylinders round the camera, as in
  Crysis 3 and Remember Me, plus a little more haze in the height fog; from the field view's height that's most of what
  reads as rain.
- **No puffs.** Splashes become tiny sharp crowns (2 to 4 cm, shown for a frame or two, not growing, not thrown up),
  only within 15 m of the camera and only on duckboards and water. On mud and in puddles rain shows as rings: proper
  expanding ripple rings in the puddle shader `weather-surface-plugin.ts` already has, in place of its drifting noise.

## Order of work

Each step is verified in the built-in browser and by `pnpm verify`; the simulation changes also by a `pnpm perf` run and
a balance A/B over 15 seeds, since they change how bots move.

| Step | What                                                                                                        | Where      | Size   |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| 1    | Controller: slide, step, mantle, scenery discs, making room; Space-only climbing of walls                   | Simulation | Large  |
| 2    | Follow along the leader's track; places checked against the ground; `clearLine` sees walls; stuck men       | Simulation | Medium |
| 3    | Aim at men; aim drawn from the pointer; reticle states; fog on with seen-by looks                           | Client     | Medium |
| 4    | Steadying and the spread ring (stage A)                                                                     | Both       | Small  |
| 5    | Field view: pitch, pointer lean, WASD held across turns; aim view behind a setting, then playtest           | Client     | Medium |
| 6    | Rain: GPU streaks round the camera, sheets, ripples, crowns                                                 | Client     | Medium |
| 7    | If needed: real rounds (stage B), the trench graph, moving the player's man on the page ahead of the worker | Both       | Large  |

Tests to write first, from the measurements above: a man steered 45° into a trench wall keeps at least 60% of his pace
along the trench and stays in it; no follower leaves a trench the leader is in; the player's man never stands inside an
impassable footprint; a bot sent past a ruin arrives.

## Decisions

Taken by the developer with the proposal, 5 October 2026:

1. **An aim view behind the shoulder while the right button is held** (a setting, on by default). It revisits the
   vision's "not a shoulder camera" for aiming only.
2. **Walls block.** Pushing never climbs anything over 1.3 m; Space does. Ledges up to 1.3 m are climbed by heading
   straight at them.
3. **Follow is single file in a trench,** along the trench's centre line rather than a remembered track, which would
   have to go into saves.
4. **Stage A:** the dice stay, shown honestly and steadied. Stage B waits on playtests.
5. **Fog of war on by default.**
6. **Rain that is truer but fainter:** wet ground, ripples, haze and fine streaks near the lens, not visible drops
   everywhere.
