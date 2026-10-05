# Mixamo clips

The clips to download from Mixamo to replace the polyperfect set the soldiers play now (see
[soldier-animation.ts](../../apps/client/src/soldiers/soldier-animation.ts)), and to cover what the game does that has
no clip yet. Chosen from the whole Mixamo catalogue (2,452 clips and 32 packs, October 2026).

Mixamo reuses names ("Firing Rifle" is five different clips), so every clip below is given as **name**, then the
description Mixamo shows under it. Search for the description to find the right one.

**Upload** `French_Soldier_Mixamo.fbx` (the French body and helmet in T-pose, no skeleton) and let the auto-rigger fit
its skeleton. **Download** FBX, without skin (one with skin for reference), 24 fps (the rate the game bakes at), and
tick **In Place** on every walk, run, crawl and strafe.

**Downloaded** on 5 October 2026: all 169 clips below, from the uploaded soldier, into `vendor/mixamo/` (61 MB, in the
[asset library](backup.md)), each named after its description in kebab case (`rifle-walk-forward.fbx`).
[mixamo-clips.json](mixamo-clips.json) lists every file with its Mixamo name, description, id, whether it came in place,
and a link that finds it on Mixamo again. Mixamo has no In Place for four of the clips asked for in place: the crouched
aimed walk, the idle to crouched walk, the clumsy run and carrying someone. Each was checked against its preview before
download; two were dropped for not showing what they say (a hands-and-knees climb for the low crawl, and a standing wave
for the wounded calling for help).

Priority: **1** replaces a clip the game uses now or a stand-in; **2** fills a gap in what the game already shows; **3**
is for behaviour the game doesn't have yet.

## Packs

| Priority | Pack               | What it gives                                                                                                                                                                                                              |
| -------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Pro Rifle Pack** | 49 clips: walk, run and sprint in 8 directions, crouched walk in 8 directions, standing and crouched idle and aim, turns, jumps and 6 deaths. The backbone. ("Rifle 8-Way Locomotion Pack" is the same 49 clips; get one.) |
| 2        | Male Injured Pack  | 20 clips: an injured walk, run and idles, for walking wounded and men going back to the aid post.                                                                                                                          |

The pack's walks and runs carry the rifle up at the ready, not shouldered: a soldier on the move with it raised. The
clips made for walking while aiming have the stock at the cheek.

## Standing

| Priority | Situation                         | Clip                                                                                                                                       |
| -------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | At ease                           | **Idle**, Rifle Standing Idle (pack)                                                                                                       |
| 2        | At ease, variety                  | **Rifle Idle**, Two Hand Lowered Gun Rifle Idle; **Rifle Idle**, Idle Holding A Rifle While Shaking Legs; **Inspecting**, Looking At Rifle |
| 2        | Sentry, watching over the parapet | **Rifle Idle**, Rifle Idle Looking Around                                                                                                  |
| 1        | Aiming (right click, or a target) | **Rifle Aiming Idle**, Rifle Standing Aiming Idle (or the pack's **Idle Aiming**)                                                          |
| 1        | Firing                            | **Firing Rifle**, Firing A Rifle While Standing                                                                                            |
| 3        | Reloading                         | **Reloading**, Reloading Rifle While Standing                                                                                              |
| 1        | Hit                               | **Hit Reaction**, Hit Reaction While Holding A Rifle; **Hit Reaction**, Left Reaction To Front Hit Holding A Rifle                         |
| 2        | Debris, a shell close by          | **Rifle Shielding Face**, Rifle Shielding Face From Debris; **Rifle Rubbing Eyes**, Rifle Rubbing Debris From Eyes                         |
| 1        | Turning on the spot               | **Rifle Turn**, 45, 90, 135 and 180 Degree Left and Right Turn (seven clips); the pack has 90 left and right                               |
| 2        | Turning while aiming              | **Turn Left 45 Degrees**, Turn Left 45 Degrees While Aiming Rifle; **Turning Right 45 Degrees**, 45 Degree Right Turn While Aiming A Rifle |
| 2        | Turning while aiming              | **Turning Right 90 Degrees**, 90 Degree Right Turn While Aiming A Rifle; **Turn Left**, Turn Left While Aiming                             |

## Moving

| Priority | Situation                      | Clip                                                                                                                                                                                                                                          |
| -------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Walk, 8 directions             | Pack: **Walk Forward**, **Walk Forward Right**, **Walk Right**, **Walk Backward Right**, **Walk Backward**, **Walk Backward Left**, **Walk Left**, **Walk Forward Left**                                                                      |
| 1        | Run, 8 directions              | Pack: **Run Forward** and the seven other Run directions                                                                                                                                                                                      |
| 2        | Sprint, 8 directions           | Pack: **Sprint Forward** and the seven other Sprint directions, if a run order should look harder than the run key                                                                                                                            |
| 1        | Crouched walk, 8 directions    | Pack: **Walk Crouching Forward** and the seven other Walk Crouching directions (replaces the crouch the bake fakes now)                                                                                                                       |
| 1        | Aiming while walking           | **Walking**, Walking While Aiming Rifle; **Walking Backwards**, Walking Backwards While Aiming Rifle; **Strafe Left**, Rifle Walk Strafe Left; **Strafe Right**, Rifle Walk Strafe Right                                                      |
| 1        | Aiming while crouched walking  | **Crouch Walking**, Crouched Walking While Aiming Rifle; **Crouch Walking Backwards**, Crouched Walking Backwards While Aiming Rifle; **Crouch Walk Strafe Left** and **Crouch Walk Strafe Right**, Crouched Rifle Walk Strafe Left and Right |
| 3        | Firing on the move             | **Firing Rifle**, Repeatedly Firing While Walking With Rifle; **Firing Rifle**, Repeatedly Firing A Rifle While Crouch Walking                                                                                                                |
| 2        | Walking with the rifle lowered | **Walk With Rifle**, Walking With Rifle At Waist Level (forward only: men coming up a communication trench)                                                                                                                                   |
| 1        | Hit while moving               | **Walking Hit Reaction**, Hit Reaction When Walking While Aiming Rifle; **Hit Reaction**, Hit Reaction When Running With Rifle                                                                                                                |

Aimed walking comes in four directions only (forward, back, left, right), standing and crouched. The crowd picks the
nearest of eight and can't blend, so either the diagonals use the nearest of the four, or the bake builds all eight by
laying the aiming idle's arms, spine and head over the pack's 8-way legs, the way it fakes the crouched walk now.

## Crouching and kneeling

| Priority | Situation                    | Clip                                                                                                |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| 1        | Crouched, still              | **Idle Crouching**, Rifle Crouched Idle (pack)                                                      |
| 1        | Crouched, aiming, pinned     | **Idle Crouching Aiming**, Rifle Crouched Idle Aiming (pack)                                        |
| 1        | Crouched, firing             | **Fire Rifle**, Fire Rifle While Crouched                                                           |
| 3        | Crouched, reloading          | **Reload**, Reload Rifle While In Crouch Position                                                   |
| 1        | Crouched, hit                | **Hit Reaction**, Hit Reaction From Rifle Crouched                                                  |
| 1        | Crouched, turning            | Pack: **Crouching Turn 90 Left** and **Right**; **Rifle Crouch Turn**, 45, 135 and 180 Degree turns |
| 2        | Kneeling, still and aiming   | **Rifle Kneel Idle**, Rifle Kneeling Idle; **Rifle Kneel To Aim**, Rifle Kneeling And Aiming        |
| 1        | Machine gunner at the tripod | **Rifle Kneel Idle**, Rifle Kneeling Idle. Mixamo has no tripod gunner; this is the nearest.        |

## Prone

| Priority | Situation         | Clip                                                                                                      |
| -------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| 1        | Lying still       | **Prone Idle**, Lying Down Prone With Rifle                                                               |
| 1        | Aiming and firing | **Prone Firing Rifle**, Firing A Rifle While Prone (its first frame is the aim)                           |
| 1        | Crawling forward  | **Prone Forward**, Moving Forward While In Prone Position                                                 |
| 2        | Crawling back     | **Moving Backward In Prone Position**, Moving Backward In Prone Position With Rifle                       |
| 2        | Turning           | **Prone Left Turn**, Turning Left While Prone Game Blend; **Prone Right Turn**, Turning Right While Prone |
| 2        | Rolling aside     | **Prone Roll**, Rifle Prone Rolling Right                                                                 |
| 1        | Hit               | **Rifle Prone Hit Reaction**, Rifle Prone Hit Reaction                                                    |
| 3        | Reloading         | **Prone Reloading**, Reloading Rifle In Prone                                                             |

There's no aimed crawl: a man aiming lies still, and crawls with the rifle down.

## Grenades

| Priority | Situation          | Clip                                                                                     |
| -------- | ------------------ | ---------------------------------------------------------------------------------------- |
| 1        | Standing           | **Toss Grenade**, Throwing Something Holding Rifle Aimed (rifle stays in the other hand) |
| 2        | Standing, overarm  | **Throw**, Throwing An Object From A Standard Pose                                       |
| 1        | Crouched, kneeling | **Grenade Throw**, Throwing A Grenade While Kneeling Pulling Pin With Teeth              |
| 1        | Prone              | **Throw Grenade**, Throw Grenade While In Prone Position                                 |
| 2        | Walking            | **Grenade Throw**, Throwing A Grenade While Walking                                      |
| 2        | Running            | **Run And Throw Grenade**, Throw Grenade While Running                                   |

## Getting away from a grenade or shell

| Priority | Situation                    | Clip                                                                                           |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| 3        | Jumping clear, standing      | **Jump Away**, Jumping Away To Avoid Explosion                                                 |
| 3        | Diving clear, with the rifle | **Dive Roll**, Dive Roll While Holding Rifle                                                   |
| 3        | Diving clear from a run      | **Run To Dive**, Diving From A Run Pose; **Running Dive Roll**, Rifle Run Dive Roll To Stopped |
| 3        | Ducking                      | **Ducking**, Ducking For Cover From Standing Idle                                              |
| 3        | Crouched, ducking down       | **Hiding**, Crouched Hiding To Ducking                                                         |

For later: the simulation has no dodge yet, so these wait until it does (see
[below](#what-the-game-needs-besides-the-clips)).

## Climbing and vaulting

| Priority | Situation                            | Clip                                                                                                      |
| -------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1        | Up the trench wall, over the parapet | **Climbing**, Pulling Up To A Ledge; **Climbing Up Wall**, Climbing Up A Wall                             |
| 1        | Up a crater's lip, a steep bank      | **Climbing**, Climbing Up A Slope                                                                         |
| 1        | Vaulting a fence, wire or a low wall | **Jumping**, Male Jumping Over An Obstacle With 2 Hands Planted; **Jumping**, Step Up To Jump Over Object |
| 2        | Over and ready to fight              | **Jumping Over Into Combat**, Jumping Over Obstacle Getting Ready To Fight                                |
| 2        | Through a fence, dropping down       | **Climbing Down**, Climb Through Fence And Jump Down                                                      |
| 1        | Dropping into a trench               | **Jumping Down**, Jump Down With Two Feet While Holding Rifle; pack **Jump Down**, Rifle Jump Down        |
| 3        | Up a trench ladder                   | **Climbing To Top**, Climbing Up A Ladder To Standing                                                     |

The climbs are unarmed: the game keeps the rifle in the right hand when the hands part, as it does for a throw.

## Bayonet and close fighting

| Priority | Situation      | Clip                                                                                                       |
| -------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| 3        | Bayonet thrust | **Bayonet Stab**, Advancing And Stabbing With Rifle Bayonet Or Spear                                       |
| 3        | Bayonet slash  | **Slash Advance**, Slashing Forward With A Bayonet                                                         |
| 3        | Rifle butt     | **Rifle Punch**, Advancing And Punching With Butt Of A Rifle; **Smash**, Smash With Back Of Rifle Or Staff |
| 3        | Parry          | **Rifle Block**, Blocking With A Rifle                                                                     |

For later: the simulation has no hand-to-hand fighting yet and the rifle model has no bayonet, so these wait until it
does (see [below](#what-the-game-needs-besides-the-clips)).

## Stance changes

The crowd can't blend, so a change of stance snaps unless a clip carries it.

| Priority | Situation             | Clip                                                                                                       |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| 2        | Standing to kneeling  | **Rifle Stand To Kneel**, Rifle Standing To Kneeling; **Rifle Kneel To Stand**, Rifle Kneeling To Standing |
| 2        | Kneeling to prone     | **Rifle Kneel To Prone**, Rifle Kneeling To Prone; **Rifle Prone To Kneel**, Rifle Prone To Kneeling       |
| 2        | Standing to crouching | **Rifle Idle To Crouch**, Rifle Idle To Crouch Walk; **Crouch To Stand**, Crouch To Stand With Rifle       |
| 2        | Prone to crouching    | **Prone To Crouch Transition**, Transition From Prone To Crouch                                            |

## Fear and breaking

| Priority | Situation                | Clip                                                                                                      |
| -------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1        | Broken, cowering         | **Terrified**, Being Terrified While Standing; **Gunplay**, Duck And Look Around Apprehensively           |
| 2        | Broken, getting away     | **Evading A Threat**, Clumsily Running To Evade A Threat; **Walk Backwards**, Slowly Backing Away In Fear |
| 2        | Broken, prone            | **Crawl Backwards**, Crawling Backwards In Fear                                                           |
| 2        | Under shellfire, nervous | **Look Around**, Look Around Nervously                                                                    |

## Deaths

| Priority | Situation              | Clip                                                                                                                                                                                                       |
| -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Standing               | Pack: **Death From The Front**, **Death From The Back**, **Death From Right**, **Death From Front Headshot**, **Death From Back Headshot**; **Rifle Death**, Dying Reaction While Standing Holding A Rifle |
| 2        | Standing, to the knees | **Dying**, Dying Shot To The Chest Falling On Two Knees; **Dying**, Death Hit From The Back Falling On One Knee                                                                                            |
| 1        | Crouched               | Pack: **Death Crouching Headshot Front**; **Crouch Death**, Dying From A Crouched Position; **Rifle Kneel Hit To Back**, Rifle Kneeling Getting Hit To Back                                                |
| 1        | Prone                  | **Prone Death**, Dying From A Prone Position                                                                                                                                                               |
| 2        | Moving                 | **Rifle Run To Dying**, Getting Shot While Running With An Aimed Rifle; **Walking To Dying**, Walking While Aiming Rifle To Dying                                                                          |
| 2        | Shell blast            | **Flying Back Death**, Dying Flying Backward; **Dying**, Explosion From Behind                                                                                                                             |

## Wounded and gassed

| Priority | Situation                          | Clip                                                                                                                                            |
| -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2        | Lying wounded, waiting for bearers | **Writhing In Pain**, Laying On Back Writhing In Pain; **Laying Moaning**, Laying Squirming And Moaning                                         |
| 2        | Dying where he lies                | **Dying**, Laying On The Ground Dying                                                                                                           |
| 2        | Gassed                             | **Laying Severe Cough**, Laying Coughing Severely                                                                                               |
| 3        | Walking wounded                    | Male Injured Pack: **Injured Walk**, **Injured Idle**, **Injured Hurting Idle**                                                                 |
| 3        | Stretcher-bearers                  | **Carrying**, Carrying Someone Idle; **Running**, Running While Carrying Someone; **Being Carried**, Injured And Being Carried To A Safer Place |

## Officers and the trench routine

| Priority | Situation          | Clip                                                                                                      |
| -------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| 3        | Over the top       | **Charge**, Pointing Onward Charge; **Yelling Out**, Stepping Forward And Yelling Out                     |
| 3        | Hand signals       | **Military Signaling**, Military Signaling "Follow" While Crouched (and "Stay Back", "Move Slow", "Look") |
| 3        | Digging in         | **Digging**, Digging Hole With Shovel                                                                     |
| 3        | Asleep in a dugout | **Sleeping Idle**, Sleeping Deeply                                                                        |

## Not in Mixamo

- **Hands up** for a man giving himself up, and for prisoners standing and walking. Nothing in the catalogue raises both
  arms. Pose the arms up in Blender and lay them over the idle and the walk, the way the bake fakes the crouched walk.
- **Pulling on a gas mask.** Nothing close.
- **Working a rifle's bolt.** Mixamo's firing clips have a modern rifle's kick and nothing more. The bolt could be added
  by hand to the end of each firing clip.
- **A gunner behind a tripod machine gun**, sitting or lying. The kneeling idle stands in.

## What the game needs besides the clips

**With the animation work**, as the new clips go in:

- **Aiming with the right click.** The crowd draws a man aiming only when he has an enemy in his sights
  (`soldiers.target`), so the soldier the player aims with never looks it. He needs an aiming flag that reaches the
  crowd, for his aimed idles and aimed walks to show standing, crouched and prone.
- **Turning on the spot.** The crowd turns a body smoothly today. The turn clips need a rule for when they play: a man
  standing still whose facing swings further than some angle, by the nearest of 45, 90, 135 and 180 degrees.
- **A bone map for Mixamo.** The retargeting script maps polyperfect's bone names onto Synty's; Mixamo's
  (`mixamorig:Hips` and so on) need a map of their own.

**Later**, once the simulation has them; their clips can wait until then:

- **Jumping clear of a grenade.** A man near a grenade doesn't react to it before it bursts. He needs a rule to see it
  land and throw himself away from it or flat, in time or too late.
- **Bayonet fighting.** There's no hand-to-hand fighting, and the rifle model has no bayonet to fix.
