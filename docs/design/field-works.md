# Field works

Digging and building: saps, new trenches, repairs, machine-gun nests, dugouts, bunkers, wire, mines and demolitions.
Part of the [game design](overview.md). Wire is built; the rest is planned.

The trench network is alive. Today it's fixed when the map is made, and only shellfire changes the ground. In the full
game both sides dig it, improve it, lose it to shellfire, repair it, capture it and turn it round. **Engineers** do most
of it (see [roles](roles-and-loadouts.md#roles)), but every soldier carries an entrenching tool and digs a little.

## Why digging matters

- **It's how ground is held.** Taking a trench is half the work; joining it to your own lines and turning it to face the
  enemy is what makes it count (see [consolidation](sector-battle.md#consolidation)).
- **It's how attacks are prepared.** Saps shorten the crossing, assembly trenches decide how many men can attack (see
  [where the men assemble](operations.md#where-the-men-assemble)), galleries put mines under the enemy.
- **It's the quiet war's main work.** A sector between operations is shellfire knocking trenches in and working parties
  putting them back at night. A squad can spend a session building a machine-gun nest that decides the next attack.
- **It makes the front a place players shaped.** A trench line a regiment dug and held for a season is on the map, in
  the communiqué and in the memorial.

## How work works

Every work has a **cost in man-minutes**, a **materials cost** from the sector's stores, and a **place** laid out on the
map. Men assigned to it work it down; when the cost is paid, the work is done and the map changes.

### Who works, and how fast

| Worker                                       | Rate (man-minutes per minute) | Can build                                                                           |
| -------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| Engineer                                     | 1                             | Everything                                                                          |
| Any soldier with a shovel (a loadout option) | 0.5                           | Scrapes, linking shell holes, repairs, blocks, sandbagging, wire, saps and trenches |
| Any soldier with only his entrenching tool   | 0.25                          | Scrapes, linking shell holes, repairs, blocks                                       |

- **Pinned men don't dig**, and men under fire dig at half rate. Digging in no man's land by day is close to suicide;
  digging there by night, under flares, is the job.
- **Ground**: mud is quick to dig and collapses without revetting; chalk is slow (× 0.7) and stands up well; wet ground
  floods.
- **Engineers lead**: a work with an engineer on it gets everyone's rate × 1.25.
- Costs are compressed to the game's clock: real digging took about four man-hours per metre of fire trench; here it's
  about a twelfth, matching the [12-to-1 day](../time-and-weather.md).

### Laying out and assigning

- **Small works** (a scrape, a block, a repair, sandbagging a bay) a squad does where it stands: a squad order, **dig
  in**, or a held key for the player's soldier.
- **Planned works** (saps, trenches, nests, dugouts, bunkers, galleries) are laid out on the planning map as a taped
  outline, as working parties laid white tape by night. The sector commander plans them; an engineer squad's leader can
  plan small ones in his own stretch.
- Bot squads in the support and reserve lines become **working parties** at night, as resting infantry did. Players pick
  up a work from the map and get [citations](progression-and-community.md#citations-and-the-communiqué) for it.

### Materials

Works draw on the sector's **stores**, allotted daily and brought forward to dumps (see
[logistics](logistics.md#dumps-planned)): sandbags, timber, corrugated iron, wire and stakes, and concrete. A work can
start without materials but can't finish without them, so a big build needs carrying parties first. Engineers carry a
small amount themselves.

### Being seen

- Fresh spoil shows. New works appear on the enemy's
  [air photographs](artillery-and-air.md#reconnaissance-and-photography) at the next daily turn, and men digging in the
  open are seen like anyone else.
- Digging is loud: enemy listening posts hear working parties within about 50 m at night.
- Working parties are what harassing fire is for. Digging well means digging where and when the enemy can't see or reach
  you.

## The works

Starting costs per item; the [balance harness](balance.md#test-harness) tunes them.

### Getting into the ground

| Work                | Cost                                  | Materials | What it gives                                                                |
| ------------------- | ------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| Shell scrape        | 2 man-minutes                         | —         | A shallow hole: a man lying in it is as covered as in a shell hole           |
| Linking shell holes | 5 man-minutes per metre between holes | —         | A crawl trench joining craters. At Verdun the front line was often just this |

Men caught in the open after an attack scrape in; a line of linked shell holes, dug through a night, is the start of a
trench.

### Trenches

A trench is built in **stages**, each a deeper, better version of the last. Saps and new lines start at the first stage
and are improved from there.

| Stage           | Depth | Cost per metre | Materials                | What it gives                                                                    |
| --------------- | ----- | -------------- | ------------------------ | -------------------------------------------------------------------------------- |
| Crawl trench    | 0.9 m | 5 man-minutes  | —                        | Cover for men lying or crawling; sight blocked for anyone in it                  |
| Fighting trench | 1.4 m | +7 man-minutes | —                        | Cover kneeling; men stand to fire                                                |
| Fire trench     | 1.9 m | +8 man-minutes | Some sandbags            | The full profile: fire step, parapet, traverses (the same as a map trench today) |
| Revetted        | 1.9 m | +5 man-minutes | Timber, iron, duckboards | Resists collapse from near misses; duckboards keep the floor at 90% pace in mud  |

The kinds of trench differ in shape, not in how they're built:

| Kind                   | Shape                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Sap                    | Narrow (half the cost per metre), pushed from a trench toward the enemy; often ends in a listening post or bombing post |
| Russian sap            | A shallow tunnel, roof left on; invisible from the air; opened at zero hour (engineers only, double cost)               |
| Fire trench (new line) | Crenellated, with bays and traverses, facing the enemy                                                                  |
| Communication trench   | Zigzag, linking lines front to rear; carries supply and reinforcements                                                  |
| Assembly trench        | A straight trench for an operation's jump-off, often abandoned afterwards                                               |

### Repairing

Shellfire knocks trenches in: a crater that lands in a trench fills it with earth (the client already draws this as
blown-in sections) and, in the simulation, drops that stretch back down the stages, from fire trench to fighting trench
or worse. Repairing restores it:

| Work                        | Cost                             | Materials |
| --------------------------- | -------------------------------- | --------- |
| Clearing a blown-in stretch | Half the cost of the stages lost | Sandbags  |
| Rebuilding a parapet        | 3 man-minutes per metre          | Sandbags  |

Revetted trenches lose fewer stages to a near miss. Repair after every bombardment is the default night's work for the
commander AI's working parties, and the race between a bombardment and the repairs is part of preparing an attack.

### Defensive works

| Work                       | Cost                           | Materials        | What it gives                                                                                                                                 |
| -------------------------- | ------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Trench block               | 5 man-minutes                  | Sandbags         | A barricade across a trench; the first step of consolidating a captured stretch                                                               |
| Reversing a trench         | 10 man-minutes per metre       | Sandbags         | A fire step and parapet on the other side: a captured trench that faces the enemy                                                             |
| Bombing post               | 15 man-minutes                 | Sandbags         | A sandbagged bay at a sap head or trench block, with grenade stores                                                                           |
| Machine-gun nest           | 2 man-hours                    | Sandbags, timber | A sandbagged emplacement with loopholes and a little overhead cover: the gun and crew are much harder to hit and suppress, and splinter-proof |
| Concealed machine-gun nest | +1 man-hour                    | Timber, netting  | As above, and hidden from the air and from enemy observers until it fires                                                                     |
| Observation post           | 1 man-hour                     | Timber, iron     | A concealed post with a periscope: [observation](artillery-and-air.md#observation) for the side's guns over the ground it sees                |
| Listening post             | 30 man-minutes                 | Sandbags         | At a sap head in no man's land: hears movement and digging at night                                                                           |
| Wire belt                  | 10 man-minutes per 10 m        | Wire, stakes     | Built today as map data; at runtime laid by night in front of a line                                                                          |
| Wire repair                | 3 man-minutes per cut cell     | Wire             | Closes lanes cut by shellfire                                                                                                                 |
| Knife rest                 | Carried, 1 man-minute to place | —                | Plugs a gap in the wire fast                                                                                                                  |
| Tank trap                  | 1 man-hour per 5 m             | —                | A ditch too wide for tanks to cross                                                                                                           |

### Shelters

| Work                                 | Cost                                       | Materials                      | Protects against                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Funk hole                            | 10 man-minutes                             | —                              | Fragments, for one man in the trench wall                                                                                                                                      |
| Splinter-proof shelter               | 1 man-hour                                 | Timber, iron, sandbags         | Fragments and shrapnel; field shells nearby                                                                                                                                    |
| Deep dugout                          | 8 man-hours, engineers only                | Timber                         | Everything but the heaviest shells; a squad below 6–10 m of earth. German dugouts were deeper, which is why bombardments failed to kill their garrisons                        |
| Concrete shelter or pillbox (_MEBU_) | 16 man-hours over two days, engineers only | Concrete (a lot), timber, iron | Field guns entirely, most heavies; firing slits that flamethrowers and bombers go for. The French concrete shelters at Thiaumont and Froideterre, the German pillboxes of 1917 |

Built today: every trench garrison shelters in dugouts under shellfire, as if every trench had them. With field works,
shelter becomes what was built: men in a trench with no dugout lie flat in it, men in a deep dugout are safe but slow to
climb out, men in a pillbox fight from it.

### Mining

Mine warfare was its own front: Vauquois, Les Éparges, the Argonne, and the mine craters already in Fleury's no man's
land. It's a slow, secret, multi-day project with a huge payoff.

- **A gallery** is a planned work from a shaft in the own line toward an enemy position, advancing about 3 m per real
  hour while engineers work it. It needs suitable ground: chalk and clay dig well, wet ground floods and stops it.
- When it's under its target the chamber is charged from the sector's stores; the mine is **ready**, and the commander
  fires it at [zero hour](operations.md#zero-hour) minus 30 s, or at any time.
- **Firing** stamps a crater 20–40 m across into the terrain, destroys the bay above, kills or buries men in it, and
  shakes everyone within a few hundred metres. The crater's lip is a new objective both sides race to occupy.
- **Listening**: engineers in their own galleries with geophones hear enemy digging within about 30 m, which shows
  roughly on the commander's map.
- **Camouflet**: a small charge near an enemy gallery collapses it and kills its miners without breaking the surface.
  Galleries that meet are both blown; there's no underground fighting.

### Demolition and booby traps

| Work              | Cost                    | Materials | What it does                                                                                                                                                             |
| ----------------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Demolition charge | 5 man-minutes           | Explosive | Destroys a dugout, nest, bunker, bridge, gun or tank; collapses a trench stretch                                                                                         |
| Booby trap        | 10 man-minutes          | Explosive | In a dugout or store about to be abandoned: kills the first men in, until engineers clear it. The Germans trapped the ground they gave up in their March 1917 withdrawal |
| Clearing traps    | 10 man-minutes a dugout | —         | Engineers make captured dugouts safe                                                                                                                                     |
| Improvised mine   | 10 man-minutes          | A shell   | A buried shell with a pressure fuze on a tank approach (1918)                                                                                                            |

## Engineer weapons: flamethrowers

German flamethrowers were pioneer (engineer) weapons, used at Verdun from its first day in February 1916; the French had
the Schilt from 1915. In game they're an engineer section's kit:

- A two-man team: the operator with the fuel tanks, a second man with the nozzle or as cover.
- 20–40 m range, a few long bursts per load; burning fuel lingers in a trench bay for a few seconds.
- Kills or routs everyone in a bay, and shakes everyone who sees it (−0.3 morale within 30 m).
- The operator is the most hated man on the field: every enemy in sight targets him first, and a hit on the tanks can
  set him alight.

## The daily turn's overnight works

At each [daily turn](war-map-and-season.md#the-daily-turn) the sector's remaining stores pay for bulk works done by the
rear-area troops nobody plays: repairing blown-in trenches behind the front line, relaying wire in front of newly held
ground, extending communication trenches to captured lines, and moving the guns up. Players' and bots' works during the
day come first; the overnight works fill in what's left.

## Limits

Digging must not let a side turtle into an impregnable line:

- **Stores cap building**: a sector can only build what its daily allotment of sandbags, timber and concrete pays for.
- **Artillery undoes it**: heavy shells drop trenches down the stages, collapse dugouts and crack bunkers.
- **Cost rises with depth of position**: deep dugouts and concrete take days, during which the enemy sees them on air
  photographs and can plan for them.
- **The trench network has a budget** per sector for performance (total trench length and structures), checked by the
  [balance harness](balance.md#test-harness) and the profiler.

## Engineering in the code

Today the trench network is fixed in the map: polylines carved into the height grid when the map is made, dressed with
the trench kit, and turned into Rapier colliders and navigation costs at load. Field works need it to change during a
battle:

1. **Trench stages and repair on existing trenches**: per-segment depth stored in the simulation, carved and restored in
   the height grid, the sight heightfield and navigation updated locally, as craters already do. Snapshots carry each
   segment's stage. The cheapest step and the most gameplay per line of code.
2. **Structures as scenery**: blocks, nests, posts, shelters and bunkers placed at runtime as scenery objects with cover
   and sight colliders. Scenery already blocks sight.
3. **New trenches at runtime**: new polylines carved into the grid, traced to the trench kit's rules (straight runs and
   right-angle turns), dressed by the client, linked into navigation. Needs a spike on local rebuild cost.
4. **Galleries**: underground, so nothing visible until fired; a mine is a crater stamp with a big radius.

Steps 1 and 2 fit stage 2. Steps 3 and 4 are stage 3, and step 3 is the main engineering risk (see
[architecture](../architecture.md#known-risks)).

## Balance levers

Work rates by worker and ground, costs per work, materials per work and the daily stores allotment, how much a near miss
drops a trench, listening ranges, gallery dig rate, mine crater size, flamethrower range and morale shock, the network
budget per sector.
