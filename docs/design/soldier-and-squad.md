# Soldier and squad

The moment-to-moment game: fighting as one soldier while commanding the rest of the squad. Part of the
[game design](overview.md).

## Direct control

Built in M2–M3.

- The player controls **one soldier**: WASD relative to the camera, mouse to aim, left-click to fire, Z to go prone, Q
  to throw a grenade. The camera is the angled top-down view from the [vision](../vision.md#presentation).
- **Switching is instant** (Tab, or 1–8 for a squad slot). The soldier you leave returns to the AI under the squad's
  current order.
- **Death moves you to the next living squadmate.** The fallen stay on the field.
- Fog of war shows what any squadmate can see. Inside a trench you see the trench; the fire step lets you see out and
  exposes you.

Why it is fun: switching turns the squad into a set of lives you spend deliberately. Take the man with the best angle,
the one still holding grenades, the machine gunner when the charge comes. The decision of who to be is the game's
signature, and nothing else in the genre has it.

## Soldier state

Morale and suppression matter more than health. A soldier is usually out of the fight because he is pinned, broken or
sheltering long before he is dead.

| State       | Range                       | What changes it                                                             | What it does                                                                                                           |
| ----------- | --------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Health      | 1 (unhurt) to 0             | Bullets, fragments, shrapnel, gas                                           | Below thresholds: wounded (slower, worse aim), down, dead                                                              |
| Suppression | 0 to 1                      | Fire landing near, bursts close by; decays when it stops                    | Spoils aim; at 0.6 or more a soldier with a move order waits                                                           |
| Morale      | 1 (steady) to 0 (broken)    | Casualties nearby, gas, being outnumbered; recovers with officers and quiet | Broken men stop advancing, may surrender when outnumbered                                                              |
| Stance      | Standing, prone, sheltering | Player (Z), squad AI, shellfire                                             | Prone: 30% as easy to hit, eyes at 0.45 m, quarter speed. Sheltering: in a dugout, unseen, a fifth of the blast radius |
| Gas mask    | Off, donning, on            | Smelling gas, a comrade's alarm                                             | 5–12 s to don; lets 3% through, aim to 70%, pace to 85%                                                                |
| Gas dose    | mg·min/m³                   | Breathing gas                                                               | Past about 1,600 (±40% per man) the soldier is a casualty                                                              |
| Grenades    | Count, 3 at start           | Throwing; resupply at dumps (planned)                                       | Bombing men a rifle can't reach                                                                                        |

### Wounds and evacuation (planned, stage 1–2)

Today a wounded soldier fights on until health runs out. The planned model gives casualties three outcomes:

- **Lightly wounded**: fights on, slower, with worse aim. Most hits.
- **Badly wounded**: down and helpless, bleeding out over a few minutes. A squadmate, or a stretcher party, can carry
  him to an aid post in a support trench. An evacuated man returns **half a man** to the sector's
  [manpower pool](sector-battle.md#manpower) (half of the evacuated recover in time for the season), and his squad slot
  refills with a recruit at the next resupply. Abandoned, he dies.
- **Killed**: out for good, and out of the pool.

Carrying the wounded is slow, exposed work for no kills. It pays off in manpower and in
[citations](progression-and-community.md#citations-and-the-communiqué), which is how the game rewards it.

## Weapons

What is built, then the 1916 kit each side gets. Sides are **symmetric in strength and asymmetric in flavour**: no
weapon should give one side an edge it can't answer.

| Weapon       | Status | Behaviour today                                                                                                                                                                        |
| ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rifle        | Built  | Hit chance 0.45 at point blank under fire, falling by a factor of e every 100 m; spoiled by movement, suppression, smoke and cover. Riflemen hold fire on covered targets beyond 100 m |
| Machine gun  | Built  | Sweeps; a missed round can hit the man nearest its aim point within a beaten zone 3 m wide and 5 m + 8% of the range long. Engages men lying in the open at any range                  |
| Hand grenade | Built  | 4.5 s fuse, 25 m throw, scatter of 1 m + 6% of the distance; about 3 m radius for half casualties in the open, 0.8 m behind earth, so traverses shield the next bay                    |
| Field guns   | Built  | Off-map batteries; HE, shrapnel and gas shells; see [artillery](sector-battle.md#artillery)                                                                                            |
| Heavy guns   | Built  | Off-map; heavy HE that cuts wire within 5 m and buries men in dugouts                                                                                                                  |

Planned, by side:

| Role            | French                                       | German                                                     | Stage |
| --------------- | -------------------------------------------- | ---------------------------------------------------------- | ----- |
| Rifle           | Lebel 1886: slower to reload (tube magazine) | Gewehr 98: faster reload (stripper clips)                  | 2     |
| Light automatic | Chauchat (from mid-1916): unreliable, mobile | None in 1916; more machine guns instead                    | 2     |
| Machine gun     | Hotchkiss M1914 (strips, air-cooled)         | MG 08 (belts, water-cooled, heavier)                       | 1–2   |
| Grenade         | F1, plus VB rifle grenades (180 m)           | Stielhandgranate: throws farther                           | 2     |
| Trench mortar   | 58 mm "crapouillot"                          | Minenwerfer                                                | 2     |
| Assault special | Rifle grenadiers                             | Flamethrower (pioneers, used at Verdun from February 1916) | 2     |

Each pair trades something: the Lebel is slower but the French get the Chauchat; the Germans get longer grenade throws
and the flamethrower, the French get rifle grenades that outrange them. The [balance harness](balance.md#test-harness)
checks that the trades come out even.

## Squads

Each player owns **one squad of 8** (the [open question](../open-questions.md#product) between 6, 8 and 10 stands; 8 is
what the prototype uses and these docs assume). One squad per player, one player per squad: groups of friends play as a
platoon of squads, not as one shared squad.

### Squad types (planned, stage 2)

The player picks a type when the squad deploys: rifle section, bombers, machine-gun team, pioneers, mortar crew,
stretcher party and more, each with roles inside it, a loadout to choose and a cap per sector so the line doesn't fill
with machine guns. The kit changes with the year. All of it is in [roles and loadouts](roles-and-loadouts.md).

### Orders

Orders go to the squad as a whole; the AI decides who does what. Built:

| Order     | Key             | Behaviour                                                                            |
| --------- | --------------- | ------------------------------------------------------------------------------------ |
| Follow me | F               | Squad keeps with the soldier you control                                             |
| Hold      | H               | Stay and fight where they stand; lie down in the open, man the fire step in a trench |
| Advance   | Right-click     | Go to a point, detouring through wire gaps; run if ordered                           |
| Reserve   | (AI only today) | Wait below in the dugouts, sentries up, until sent in                                |

Planned:

| Order           | Behaviour                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Suppress        | Fire on an area, not a target: keep a machine gun or a bay's heads down                                                               |
| Bomb along      | Clear a trench toward a point, bay by bay, bombers leading                                                                            |
| Consolidate     | Turn a captured trench: reverse the fire step, block the trench, put out wire; speeds [consolidation](sector-battle.md#consolidation) |
| Carry wounded   | Take the nearest badly wounded man to the aid post                                                                                    |
| Cut or lay wire | Pioneers work a belt by hand: slow, silent, deadly if seen                                                                            |
| Withdraw        | Fall back to a named trench, covering each other                                                                                      |

Orders need a fast interface: a radial menu on a held key, plus pings on the map. The squad must obey the way a player
expects, every time; a squad that ignores orders feels worse than one that is weak.

## Losing the squad and coming back

Built: [reinforcements.ts](../../packages/sim/src/reinforcements.ts). Death passes control along the squad; when the
last man falls or is captured, the squad is sent for from the sector's [manpower pool](sector-battle.md#manpower):

1. Its men leave the pool at once: 8, or fewer if the pool can't spare 8. A player's squad is always replaced; when the
   pool is empty it comes back with 3 men scraped together from cooks, runners and the lightly wounded, so nobody is
   ever refused a squad.
2. The replacements reach the side's **rearmost fire trench**, behind the stretch of front the squad held, after a
   delay: 30 s while the pool is full, growing to 90 s as it empties. Then they walk up the communication trenches. The
   walk is part of the cost: dying far forward means a long way back.
3. The squad keeps its slots and weapons (a machine-gun slot comes back with a machine gun). A player's squad arrives
   holding, waiting for orders. A bot squad arrives on the _reserve_ order, below in the dugouts, where the
   [commander AI](sector-battle.md#the-sector-commander) can send it into a counter-attack.
4. Bot squads are replaced only while the pool is above a quarter of its allotment; the last quarter is kept for squads
   players lead. The line thins as the reserves run out.

The HUD shows the reserves left, counts down to the replacements while the squad is wiped out, and logs their arrival.
In the skirmish each side holds 160 men back; in a headless barrage attack on the prototype sector the Germans bring up
15 squads and keep their last 40 men, and the French still take the front line at the same moment.

Still to come:

- **Deploy points**: the support line when it is connected to the rear, and an operation's jump-off trench for squads
  signed up to it, chosen on a deploy screen.
- **Refilling survivors**: a squad that withdraws to the reserve line refills to 8 there, at the pool's cost, without a
  delay. Today only a wiped squad is replaced.
- **Daily allotments** from the war map, through `allotReinforcements`, in place of the skirmish's fixed pool.

Logging off withdraws the squad to the reserve, or hands it to the AI if it is in contact, so the battle goes on.

## Bots

Bots use the same commands and rules as players. They:

- Pick and engage targets on their own, hold fire on covered targets beyond 100 m so quiet lines stay quiet, bomb men
  they can't shoot, go prone in the open, shelter from shellfire and race back to the parapet when it lifts. Built.
- Follow their squad's order. A player's squad is bots under the player's orders; a bot squad is bots under the
  [commander AI's](sector-battle.md#the-sector-commander) orders.
- Must be **good enough that a side of bots holds a fair line at 4am**, and **weak enough that a human-led squad
  matters**. The [balance targets](balance.md#bots) put numbers on both.
