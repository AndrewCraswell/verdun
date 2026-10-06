# Supply, works and ground

**Status: proposal for review (5 October 2026), not decided.** It ties the planned [logistics](logistics.md),
[field works](field-works.md) and [territory](sector-battle.md#territory) designs into one loop and adds what they lack:
lorries on the map, observation that decides where fire lands, and ground that pays while it's held. Mechanics marked
**New** aren't in any other doc yet.

## What it's for

The sector is a persistent battle all season (see [sector battle](sector-battle.md)), but today nothing in it lasts or
accumulates: trenches never wear out, shells appear at the guns, and the only reason to take ground is the ground. Three
aims:

1. **More realistic.** Trench war was a cycle: the guns smash the line by day, working parties put it back by night,
   lorries and carrying parties feed both, and the side that sees the other's roads starves them. Verdun was decided by
   that cycle as much as by assaults: the French lived on one road, and the Germans could see most of it.
2. **More ways to win and to balance.** Attrition, supply and observation as well as ground, each a lever that doesn't
   touch the real terrain.
3. **A reason to attack.** Every objective gives something concrete while held, so an operation is "take the crest so
   our guns can see their road", not "take trench 3".

And the test of all of it: a player who joins at any hour has something worth doing besides waiting on the fire step.

## Built on the real ground

The game's draw is that it's fought on the real battlefield: the surveyed terrain, the 1916 trench lines traced from the
trench maps (see [level design](../level-design.md)), the real roads, villages and works. This proposal leans on that
everywhere, and never bends it for balance:

- **Every holding is a real place.** Observation posts are where the real ground sees: crests and ruins with height,
  found from the surveyed elevation, not placed for play. Roads, junctions, dumps and works are the 1916 ones on the
  sector's sources: the Fleury crossroads, the Thiaumont work, the Poudrière, the ravines.
- **Sight comes from the terrain.** Who can see a road, a debus point or a dump is worked out from the real elevation
  and the ruins on it (as Level design already does for debus points), so the reasons to take a crest are the reasons
  men died for it in 1916.
- **History is the starting position; play is the departure.** Each season opens on the real lines of its date: trench
  lines, wire and works as the maps show them. What players dig, repair, lose and take is the departure from history,
  recorded in the communiqué.
- **Asymmetry is history, and so is its answer.** Where the real ground favours one side (the German heights see the
  whole French rear at Fleury), the counterweight comes from history too: the French Voie Sacrée's lorries, the noria of
  fresh divisions, the concrete shelters. Never a moved hill or an invented wood.
- **Names are right.** Every wood, ravine, road and work carries its 1916 name, checked against the sources.

## The loop

1. **Lorries** bring men, shells and stores up the rear roads to each side's debus point.
2. **Dumps** hold what they bring: the batteries fire only what their dump holds, engineers build only with what the
   stores dump holds.
3. **The guns** smash trenches, cut wire, and shell whatever their observers can see, including the enemy's lorries and
   dumps.
4. **Engineers and working parties** repair, wire and dig by night, with materials the lorries brought.
5. **Ground** decides who sees what: holding a crest or an observation post makes your fire accurate and his blind, and
   puts his road under your guns.
6. Back to 1: a side whose road is watched loses lorries, runs short of shells, and must fight for the ground that
   blinds the watcher.

## 1. Lorries and the road (New)

Built on the map's rear roads and debus points (`map.roads`, `map.debus`, map format 7).

- **Lorries are driven by the simulation** for now (decided). Players driving them comes later, with tanks and the other
  vehicles of 1917–18.
- **A lorry carries one load**: a replacement squad (8 men), or shells (about 300 field rounds or 60 heavy rounds, a
  3-ton lorry's worth), or engineering stores (wire, stakes, sandbags, timber), or small-arms ammunition and grenades.
- **It drives in** from the side's rear edge of the map along its road at about 20 km/h (slower over shelled road), to
  the debus point, unloads in about 20 s, and drives back out.
- **One lorry on the road at a time per side**, from a queue. Replacement squads join the queue when wiped out, players'
  squads at its head; supply loads join on a schedule set by the day's allotment (see below). So a side gets a load
  every minute or so, and a fight that wipes out squads faster than that thins the line.
- **Where the allotment waits.** The day's allotment from the war map no longer appears at the guns at the daily turn:
  it waits at the railhead, off the map, and comes up by lorry through the day. Unspent loads still carry over, up to
  two days' worth.
- **Lorries can be hit.** A lorry within a shell's lethal radius is destroyed with its load: shells go up in a secondary
  burst, men are casualties. A crater on the road stops lorries until an engineer party fills it (a few man-minutes).
- **Lorries can be seen.** A lorry in daylight within sight of an enemy observer is reported, and the enemy can call
  fire on the road ahead of it. The debus point's `seenBy` is how exposed its last stretch is.
- **Running at night.** A side whose road is watched can hold its lorries for the dark, as the French did on the last
  leg to the front: safe, but the day's loads must fit into the night.

Scale, from the current fire plans: one bombardment of a 200 m stretch fires about 500 field and 20 heavy rounds, so two
lorries of field shells and part of one of heavy. Three bombardments are most of an hour's deliveries, which is what
makes preparation a commitment the enemy can see coming.

Fleury's real ground already gives the asymmetry: the German heights see the whole French rear (the French debus point
is seen from about 11 places, the German one from 2). History gives the counterweight: the French road was the Voie
Sacrée, about 3,500 lorries a day, so French lorries come more often. Both are true, and they balance each other.

## 2. Dumps and batteries

Mostly designed in [logistics](logistics.md#dumps-planned); what changes:

- **Battery dumps** (New): each side's shell stock (`sim.artillery.ammunition`) is what its battery dumps hold, filled
  by shell lorries rather than at the daily turn. A battery dump hit by a heavy shell goes up, as dumps do.
- **The stores dump**, near the debus point, holds what engineers build with. Carrying parties take stores and grenades
  forward to forward dumps, as designed.
- **Captured dumps** give their contents to the taker, at a fraction for the wrong calibre, as designed.

## 3. Observation: what you can see, you can hit (New)

Today a shoot's accuracy depends only on light and weather (`observation` in artillery.ts): a corrected shoot in clear
daylight, an uncorrected one, with the large steady errors already built, in fog or at night. New: it also depends on
whether the side can **see the target**.

- **Observers**: men in an observation post, and sentries in the side's front line, see out to the day's sight range.
  Later, balloons and aircraft (see [artillery and air](artillery-and-air.md)).
- **Observation posts** are places that see far: crests, ruins with height, concrete works. Each has a viewshed worked
  out when the map loads. A post is the side's while its men are in it.
- **Observed fire** on a target an observer can see is corrected (today's dispersion). Fire on ground nobody of the side
  can see keeps the uncorrected errors, even in daylight. Harassing fire on a road behind a crest the side can't see is
  a waste of shells.
- **What observation is used for**: called fire, counter-battery fire (gun flashes seen, already partly built), fire on
  lorries and dumps, and the commander AI's choice of where to shell at night.

This is the main reason to take ground on the real map: at Fleury the crests and the Thiaumont work were fought over
because of what could be seen from them.

## 4. Field works in play

Designed in detail in [field works](field-works.md). What this proposal adds is making them the loop's night work, fed
by lorries:

- **Trench condition** (field works step 1): every trench segment has a stage, shellfire knocks it down, working parties
  restore it. A long bombardment leaves real ruin that takes a night to mend, and a side that can't get sandbags forward
  can't mend it.
- **Wire**: cut by shells and by players' cutters (built), laid and repaired by night from the stores dump.
- **Digging**: linking shell holes, saps toward the enemy, new trenches to hold captured ground.
- **Fortifications**: blocks, sandbagged nests, observation posts, shelters, then concrete.
- **Mines**: both kinds. Tunnelled mines under the enemy line (designed, stage 3), and **surface mines** (decided):
  buried charges laid by engineers, by night, in front of a line or on an approach, set off by men or vehicles crossing
  them, found and cleared by engineers. Historically surface mines barely existed before improvised anti-tank mines in
  1918; a later **tech tree** will say when each weapon becomes available, so surface mines are built now and dated
  then. The tech tree is deferred.
- **The commander AI's working parties** do this every night by default: repair what was shelled, relay cut wire, and
  carry stores forward. Players take works from the map for citations and to get them done sooner or where they choose.

## 5. Holdings: ground that pays (New)

Each holding gives its effect while held (men in it, no enemy able to fight there, as objectives work today). On the war
map, holding it at the daily cutoff counts as a [key point](war-map-and-season.md#key-points) where it is one.

| Holding                     | While held in the sector                                                                          | At Fleury                         |
| --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| Observation post            | Observed fire over its viewshed; enemy lorries and dumps there reported                           | The crest, ruins with height      |
| Road junction, road stretch | Your lorries use the shorter route; the enemy's are forced onto a longer or more exposed one      | The crossroads, the lateral road  |
| Dump                        | Its stock taken, or blown                                                                         | The rear dumps                    |
| Concrete work               | Shelter its garrison from field guns entirely; a telephone hub that brings calls for fire sooner  | The Thiaumont work (neighbouring) |
| Battery position            | Reached in a deep raid: its guns spiked, its dump blown                                           | The batteries behind each line    |
| Village ruins               | Weighs on the [Balance](war-map-and-season.md#the-balance-winning-a-year); the communiqué says so | Fleury                            |

The player sees holdings on the map with what they give, in a few words, and the communiqué names who took them.
Citations for taking and holding them come from [progression](progression-and-community.md).

## 6. Ways to win, and levers to balance with

The [Balance](war-map-and-season.md#the-balance-winning-a-year) already scores key points, ground, losses and
operations. This proposal adds no new term to it: supply and observation work through what they do in the sector (fewer
shells, blinder guns, more losses), and that shows up in the existing terms. A side can win a year by:

- **Attrition**: trading men well (the losses term; Falkenhayn's plan for Verdun).
- **Starving the other**: watching his roads and dumps until his operations can't be fed.
- **Seeing**: holding the ground that sees, and fighting a blinder enemy.
- **Ground and key points**: as designed.

Levers, none of which touch the real terrain:

| Lever                                        | What it moves                                          |
| -------------------------------------------- | ------------------------------------------------------ |
| Lorry interval per side, and load sizes      | How fast a side recovers from losses and spends shells |
| Day or night running per side                | Exposure against throughput                            |
| Daily allotment per side (war map, calendar) | The season's arc                                       |
| Observation range, post viewsheds            | How much seeing is worth                               |
| Uncorrected fire's errors                    | How much blind fire is wasted                          |
| Engineer and working-party rates             | How fast ruin is mended                                |
| Manpower pool per side                       | How long a side can trade men                          |

## 7. Something to do at any hour

| Job                                     | When  | Done by default by         | What a player gains                    |
| --------------------------------------- | ----- | -------------------------- | -------------------------------------- |
| Observe and call fire on lorries, dumps | Day   | Commander AI, sentries     | Starving the enemy; citations          |
| Counter-battery spotting                | Day   | Commander AI               | Quieter enemy guns                     |
| Sniping                                 | Day   | Snipers (built)            | Kills, enemy kept down                 |
| Repairing trenches                      | Night | Working parties            | The line ready for tomorrow            |
| Wiring and cutting                      | Night | Working parties, players   | Defence, or a lane for an attack       |
| Carrying forward                        | Any   | Carrying parties           | Grenades and stores where the fight is |
| Digging saps and new trench             | Night | Engineers                  | A shorter crossing, held ground        |
| Patrols and raids                       | Night | Commander AI (raids built) | Intelligence, prisoners                |
| Filling cratered road                   | Any   | Engineers                  | Lorries moving again                   |
| Holding a post                          | Any   | Garrison                   | The holding's effect for the side      |

## 8. Build order

Each step is playable alone, and each has a harness check before it ships.

1. **Lorries**: replacement squads and shell loads up the road one at a time, battery stock filled by lorries, lorries
   destroyed by shells. Check: a side that fires three bombardments runs short within the hour unless it waits for
   lorries; replacements arrive at most one squad a minute.
2. **Observation per target and observation posts.** Check: holding a post measurably tightens that side's fall of shot
   over its viewshed, and fire on unseen ground scatters as uncorrected fire does today.
3. **Trench condition and night repair**, with stores carried by lorry. Check: a bombarded stretch is back to a fire
   trench by morning when stores are there, and isn't when they aren't.
4. **Holdings and their effects**, shown on the map. Check: an operation on an observation post changes the next day's
   deliveries.
5. **Digging, structures and mines**, from field works steps 2 to 4.

## 9. Scores for players (New)

Every player has an account (stage 3), and its [service record](progression-and-community.md#service-record) counts what
they did. What's missing is how that becomes a score: the number [ranks](progression-and-community.md#ranks) are earned
by, citations are chosen from and regiments are compared on. Call it **merit**.

### Principles

- **Score what the war needed, not only killing.** A night spent wiring, carrying or mending trench should earn about
  what a firefight does. Otherwise nobody does the loop's work, and the score glorifies the wrong thing (see "Respect
  the dead" in [progression](progression-and-community.md#principles)).
- **Credit is shared.** Ground, holdings and operations are won by many: their merit is split among everyone of the side
  who was there, so no one farms it alone.
- **Effects, not activity.** Merit comes when something happened (a lorry destroyed, a stretch repaired, a man brought
  to the aid post), not for holding a key down.
- **Hard to farm.** Each kind of merit tapers off after a daily amount, and ground retaken back and forth pays only once
  an hour.
- **Nothing is lost by missing a day**, and losing men costs a little, never a lot.

### What earns merit

Starting values, to be tuned so that an hour of each kind of play earns roughly the same:

| Deed                                                         | Merit                | Attributed to                          |
| ------------------------------------------------------------ | -------------------- | -------------------------------------- |
| An hour in the line (front or support trench)                | 10                   | The player                             |
| A trench segment or ground cell taken                        | 20, shared           | Everyone of the side inside it         |
| The same segment consolidated (held)                         | 40, shared           | Everyone who held it through the clock |
| A holding taken; held at the daily cutoff                    | 50 shared; 25 shared | Those in it                            |
| An operation's objective taken, as part of its waves         | 30 each              | Every player in the operation          |
| A wounded man carried to the aid post                        | 15                   | The carrier                            |
| A prisoner taken and walked back                             | 10                   | The captor                             |
| A lorry or dump destroyed by fire you called                 | 25 (a dump 60)       | The caller                             |
| An enemy battery silenced by counter-battery fire you called | 40                   | The caller                             |
| Wire: 10 m laid, or a lane cut before an operation           | 10                   | The worker                             |
| Trench: a stretch repaired, or 5 m of sap or trench dug      | 10                   | The worker                             |
| A load carried to a forward dump                             | 10                   | The carrier                            |
| An enemy put out of the fight (killed, wounded, captured)    | 5                    | The shooter, thrower or caller         |
| One of our men hit by your shells or grenades                | −20                  | The thrower or caller                  |

- **A player's squad counts.** What bots of the player's own squad do under the player's orders earns the player half
  merit: a squad well led is the player's doing.
- **Fire you called** is credited to you for what it hits, and debited for what it hits of ours.
- **Tapering**: past 100 merit of one kind in a day, that kind earns half; past 200, a quarter. Variety pays.

### What merit is for

- **Rank**: each rank needs a season's merit, set from telemetry so that about half the side's regular players reach
  Caporal in their first week and few reach Capitaine.
- **Citations**: each day's communiqué cites the top players in each kind of deed (most carried, most wired, the first
  into the enemy trench), not the top total, so the quiet jobs get their dispatches.
- **Public leaderboards** (decided): by season and for life, for merit in total and for each kind of deed, for players
  and for regiments.
- **Regiments**: a regiment's merit is its members' total, shown in the communiqué and the season memorial.
- **The service record** keeps the raw counts behind it, per season and for life.

Scores are never shown in the battle itself: the record and the communiqué are where a player reads them.

### In the code

Merit is tallied by the server from the simulation's events, never by the client. Most events already say who did what
(`fallen` names its cause, captures name the captor); deeds without an actor yet (wire cut, carried to the aid post,
lorry destroyed, called fire) need one added. The tally is per account per season, saved with the battle.

## 10. Decisions and questions

Decided (5 October 2026):

- **Driving** lorries is deferred; players drive vehicles later, tanks among them.
- **Art**: the War Pack's WW2 lorries stand in, retextured so their markings match the era.
- **Surface mines** are built; when each weapon becomes available is for a tech tree, deferred.
- **Public leaderboards** are planned.
- **Merit's deeds and values** are a good start, kills at 5 merit included: the starting values, to tune from telemetry.

Still open:

1. **Holdings on the HUD**: how much to show, given the battle should stay light on text: a mark and a few words on the
   map, nothing in the battle view?
2. Should supply count on the **Balance** directly, or only through its effects, as proposed?
