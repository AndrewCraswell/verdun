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

### Wounds, stretcher bearers and the aid post

Built in [wounds.ts](../../packages/sim/src/wounds.ts). Still to come: the red-cross rule, aid posts falling back when
overrun, hospital cases coming back at the daily turn (which needs the campaign layer) and veterans rejoining their
squads.

**Three outcomes of being hit.** On the Western Front about three men were wounded for every one killed, so most men
knocked out of the fight are still alive:

- **Lightly wounded**: fights on, slower, with worse aim.
- **Badly wounded**: down and helpless where he fell, out of the fight, slowly bleeding (about 1% chance a minute of
  dying where he lies). The share killed outright depends on what hit him: about 30% for bullets, 25% for shells, 10%
  for gas.
- **Killed**: out for good, and out of the pool.

A badly wounded man with an enemy within 5 m and no friend within 40 m is taken prisoner, wounded. A wounded man counts
as out of the fight for every other rule.

**Stretcher bearers are AI.** Each side has stretcher-bearer teams (six to start), run by the AI for the whole side as
one of the [AI services](roles-and-loadouts.md#ai-services). Players never have to carry stretchers.

- Teams go for the reachable wounded nearest the aid post first, one man per trip, at a slow walk; reaching a man,
  dressing him and lifting him takes about a minute.
- **Inside the trenches they work at any hour. Out in no man's land they only go at night.** By day, walking out for a
  man meant lying beside him, so the wounded of a daylight attack lie out until dark, and some die waiting. Flares at
  night can still catch a team in the open. That makes the [117-minute day](../time-and-weather.md) matter twice: dusk
  attacks leave fewer men to bleed, and each night is when the field is cleared.
- Bearers won't go where an enemy is within 40 m of the man.
- The client draws a team as two figures with a stretcher walking the route, so players see them work.
- A squad can still carry its own man back (a slow, exposed squad order), for a squadmate the bearers can't reach yet.

**The aid post heals men and returns them to the reserves.** Each side has an aid post (_poste de secours_,
_Truppenverbandplatz_), a dugout or tent marked with the red cross in its rearmost fire trench, where a communication
trench meets it (the front line, on a map with only one line; 20 m in from the side's own edge, on a map without
trenches). Bearers carry the wounded there. When a man arrives he's triaged:

| Outcome               | Share | What happens                                                                                                        |
| --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| Patched up            | ~40%  | Back to duty after about 10 real minutes: one whole man added to the side's [reserves](logistics.md#reinforcements) |
| Sent back to hospital | ~50%  | Leaves the sector; at the next daily turn, half of them come back to the reserves (once the campaign exists)        |
| Dies of his wounds    | ~10%  | Out for good                                                                                                        |

- The aid post treats **8 men at once** at full speed; with more, each gets a share of the care (8 ÷ the number being
  treated), so a big attack swamps it. Its size is a [balance lever](balance.md#tuning-levers).
- If the line is overrun the aid post falls back to the next trench, and the men in it are captured (planned).
- **The red cross is respected by the rules**: neither the commander AI nor players' calls for fire can target ground
  within 30 m of an enemy aid post. Shells still land there by accident, but nobody is rewarded for it (next).
- A patched-up veteran rejoins his own squad at its next refill if it's still on the field, so the
  [names](progression-and-community.md#the-squad-roster) players know come back (later).

On average a man brought in is worth about two-thirds of a man to the reserves once hospital cases return at the daily
turn, and 0.4 within a single battle. Every wounded man the bearers reach is manpower saved, and every one left in no
man's land when dawn comes is manpower lost.

**What the player sees**: wounded men stay on the field with a marker, the squad panel shows its men as wounded,
evacuated or returned, the map shows the aid post and how many wait there, and the battle log reports men brought in and
returned to duty. When the soldier the player controls is badly wounded, control passes to the next man as on death.

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

| Role            | French                                       | German                                                      | Stage |
| --------------- | -------------------------------------------- | ----------------------------------------------------------- | ----- |
| Rifle           | Lebel 1886: slower to reload (tube magazine) | Gewehr 98: faster reload (stripper clips)                   | 2     |
| Light automatic | Chauchat (from mid-1916): unreliable, mobile | None in 1916; more machine guns instead                     | 2     |
| Machine gun     | Hotchkiss M1914 (strips, air-cooled)         | MG 08 (belts, water-cooled, heavier)                        | 1–2   |
| Grenade         | F1, plus VB rifle grenades (180 m)           | Stielhandgranate: throws farther                            | 2     |
| Trench mortar   | 58 mm "crapouillot"                          | Minenwerfer                                                 | 2     |
| Assault special | Rifle grenadiers                             | Flamethrower (engineers, used at Verdun from February 1916) | 2     |

Each pair trades something: the Lebel is slower but the French get the Chauchat; the Germans get longer grenade throws
and the flamethrower, the French get rifle grenades that outrange them. The [balance harness](balance.md#test-harness)
checks that the trades come out even.

## Squads

Each player owns **one squad of 8** (the [open question](../open-questions.md#product) between 6, 8 and 10 stands; 8 is
what the prototype uses and these docs assume). One squad per player, one player per squad: groups of friends play as a
platoon of squads, not as one shared squad.

### Squad types (planned, stage 2)

The player picks one of four types when the squad deploys: rifle section, assault section, support weapon team or
engineer section, each built from five roles, with a loadout to choose and a cap per sector so the line doesn't fill
with machine guns. The kit changes with the year. All of it is in [roles and loadouts](roles-and-loadouts.md).

### Orders

Orders go to the squad as a whole; the AI decides who does what. Built:

| Order     | Key              | Behaviour                                                                                                   |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Follow me | F                | Squad keeps with the soldier you control                                                                    |
| Hold      | H                | Stay and fight where they stand; lie down in the open, man the fire step in a trench                        |
| Advance   | E at the pointer | Go to a point, detouring through wire gaps; run if ordered                                                  |
| Reserve   | (AI only today)  | Wait below in the dugouts, sentries up, until sent in                                                       |
| Run to    | Order wheel      | Get to a point fast: everyone runs while his breath lasts, no bounds                                        |
| Suppress  | Order wheel      | Fire into an area at half the usual rate, seen or not: keeps everyone there down, and now and then hits one |
| Withdraw  | Order wheel      | Run back to the nearest trench of ours behind them and hold it; refused with none behind                    |
| Dig in    | Order wheel      | Go to the best cover a few metres around a point and keep low: crouched in a trench, prone in the open      |
| Rally     | Order wheel      | Close up on the leader; the shaken within 30 m of him steady eight times faster; refused with nobody shaken |

Planned:

| Order           | Behaviour                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Bomb along      | Clear a trench toward a point, bay by bay, bombers leading                                                                            |
| Consolidate     | Turn a captured trench: reverse the fire step, block the trench, put out wire; speeds [consolidation](sector-battle.md#consolidation) |
| Carry wounded   | Take the nearest badly wounded man to the aid post                                                                                    |
| Cut or lay wire | Engineers work a belt by hand: slow, silent, deadly if seen                                                                           |

Orders need a fast interface: a radial menu on a held key, plus pings on the map. The squad must obey the way a player
expects, every time; a squad that ignores orders feels worse than one that is weak.

## Joining the battle

The sector's force is fixed and players replace bots (see [population](balance.md#population)), so the fastest and most
honest way in is to **take over a bot squad that's already in the line**. The target: **under a minute from "join" to
seeing the enemy**.

When a player joins a sector, the sector map offers, in this order:

1. **Take over a squad in the line.** Any bot squad of the player's side and of a type their rank allows, with at least
   four men standing, not in contact (no enemy within 30 m) and not in an operation's wave. The player gets those men as
   they are: their positions, wounds, ammunition and morale. The squad's current order holds until the player gives a
   new one. Understrength squads refill when withdrawn to the reserve line.
2. **Join an operation.** If an operation is planned, sign up for a wave. Until its assembly window opens, the player
   takes over a squad in the reserve or support line, and moves into the jump-off trench with the wave.
3. **Bring up a fresh squad.** When no bot squad qualifies (all in contact, or the side's squads are all players'), a
   new squad comes up to the rear trench from the [manpower pool](sector-battle.md#manpower), as after a wipe.

The map shows each option's distance from the fighting, so a player can pick the squad holding a quiet sap or the one at
the crossroads. Taking over a squad is instant; the bots in it simply start following the player's orders.

**Leaving** hands the squad back to the AI under its current order, so the line never loses men because a player logged
off. A player who rejoins within a few minutes is offered the same squad first, if it's still standing.

**Not allowed**, so joining can't be used to dodge losses: taking over a squad while one's own squad is in contact (a
player whose squad is fighting must see it through or lose it), or taking over more than one squad every few minutes.

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
  signed up to it, chosen on the sector map with the [joining](#joining-the-battle) options.
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
