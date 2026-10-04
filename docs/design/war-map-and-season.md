# War map and season

How sector battles add up to a war, and how a war ends. Part of the [game design](overview.md). Arrives in stage 3; the
model can be built and tuned headless earlier (see [next steps](overview.md#suggested-next-steps)).

## The war map

The war map is the Verdun front as a chain of sectors on the real ground, each one a [sector battle](sector-battle.md).
The first season uses the right bank of the Meuse, where the 1916 battle was decided; the left bank (Le Mort-Homme,
Hill 304) is a later expansion.

| Sector (right bank)   | Key points                                    | Character                                            |
| --------------------- | --------------------------------------------- | ---------------------------------------------------- |
| Bois des Caures       | The wood, Driant's redoubts                   | Woods and broken sight lines; the battle's opening   |
| Douaumont             | Fort Douaumont, the village                   | The great fort on the crest: shelter and observation |
| Vaux                  | Fort Vaux, the village, the pond              | A smaller fort, ravines on either side               |
| Thiaumont–Froideterre | The Thiaumont work, the Froideterre ridge     | Concrete shelters on open ridges                     |
| Fleury                | The village, the crossroads, Ravin de la Dame | Ruins where the lines close; the first built sector  |
| Souville              | Fort Souville                                 | The last ridge before Verdun                         |

Stage 3 opens with two or three adjacent sectors (Fleury first, then Douaumont and Vaux) and grows as players arrive.

### Key points

Some places matter beyond their sector. Holding them at the daily cutoff gives the holder a war-map effect:

| Kind        | Example                      | Effect while held                                                                 |
| ----------- | ---------------------------- | --------------------------------------------------------------------------------- |
| Fort        | Douaumont, Vaux, Souville    | Deep shelter: the garrison is immune to field guns. Weighs heavily on the Balance |
| Observation | Douaumont crest, Froideterre | Artillery more accurate in this sector and both neighbours                        |
| Village     | Fleury, Vaux, Douaumont      | Weighs on the Balance; the press reports it                                       |
| Supply node | A road junction, a railhead  | More of the side's allocation reaches the sectors it serves                       |

### Neighbours

A sector doesn't fight alone. At the daily turn:

- A sector whose line **bulges past both neighbours** is a salient. Fire comes from three sides: the enemy gets extra
  shells there and the salient's supply is reduced. The French held the Verdun salient itself in 1916 at great cost.
- A sector whose neighbour has advanced well past it is **outflanked**: its enemy gets observation over it.

This makes the front coordinate. Pushing one sector far ahead of the others costs more than it gains.

## The daily turn

Every real day ends at the **daily cutoff**, a fixed time chosen for the fewest players online (05:00 UTC is the working
assumption; stage 2 telemetry decides). At the cutoff the war has its "stand-to", about 10 minutes:

1. Each sector stops capture and consolidation, and reverts unconsolidated ground (see
   [the day's line](sector-battle.md#the-days-line)).
2. Each sector reports its held ground, key points, losses (killed, captured, wounded evacuated), prisoners taken and
   shells spent.
3. The war map redraws the front, applies salients and key points, and moves the [Balance](#victory-the-balance).
4. **Overnight works** happen in every sector, paid for from the day's stores: cut wire is repaired and new belts laid
   in front of newly held ground, captured trenches are turned to face the enemy, guns move up behind an advance, and
   the battle window re-centres if needed.
5. The war map sets tomorrow's **allocations** and relieves tired divisions.
6. The **communiqué** is published.

Players can stay connected through the stand-to; the battle pauses and resumes on the same ground. It is also the
natural window for server deploys.

### The communiqué

The daily result, published as a period communiqué from each side's headquarters, and the thing players open first each
day:

- The front map with the day's changes.
- Each sector's gains and losses, losses on both sides and prisoners.
- Key points that changed hands.
- **Citations**: players and regiments mentioned in dispatches (see
  [progression](progression-and-community.md#citations-and-the-communiqué)).
- The calendar date in 1916, the weather to come, and any [war event](#war-events).

Each side's version is written from its own side: what one calls a strategic withdrawal, the other calls a breakthrough.

## Resources and allocation

Each side has a war-level economy, refilled daily:

| Resource           | Arrives as                                    | Spent on                                                    |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------- |
| Manpower           | Reinforcements per day, fixed by the calendar | Sectors' [manpower pools](sector-battle.md#manpower)        |
| Shells             | Production per day, by type                   | Sectors' [shell budgets](sector-battle.md#the-shell-budget) |
| Engineering stores | Per day                                       | Overnight works, players' wire and digging                  |
| Divisions          | A fixed roster with strength and fatigue      | Holding sectors; relieved to recover                        |

### Allocation

The side's **high command** splits each day's resources across its sectors. The AI does it by default: weight to sectors
under attack, sectors planning operations and sectors holding key points. Players influence it through a daily **main
effort vote**: every player of the side who fought that day picks a sector, and the winner gets 30% more than the AI
would give it, taken from the others. It is simple, social and gives every player a voice in the war.

### Divisions and relief

Each sector is held by a division with a **fatigue** that rises with days in the line and with casualties. A tired
division's soldiers (bots and the recruits in players' squads alike) start with lower morale. Relief swaps in a fresh
division overnight, if the side has one.

This is Pétain's _noria_: the French rotated most of their army through Verdun so no division broke, while German
divisions stayed in the line far longer. The French get more divisions to rotate; the Germans start fresher and better
supplied. It is flavour players see in the communiqué ("the 37th Division relieves the 14th"), and a lever on morale.

## The season

A season is one battle of the war, played out over about **six weeks** (see
[open questions](../open-questions.md#product)). The first is Verdun, 1916.

### The calendar

Each daily turn advances the calendar about a week, so 42 turns run from 21 February to mid-December 1916. The date sets
the weather's climate (winter fog and snow, summer storms), the light, and the historical pressures below.

### The arc

The season should have the shape of the real battle without its outcome being fixed:

| Turns | 1916             | Pressure                                                                                                                                             |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–10  | February–April   | German offensive. Germans start with a huge shell stockpile and fresh divisions. French manpower ramps up as the Voie Sacrée and the noria get going |
| 11–19 | May–June         | The battle for the forts and Fleury. Allocations near parity; phosgene arrives for the Germans                                                       |
| 20–30 | July–September   | The Somme (from 1 July) and the Brusilov offensive in the east draw German guns and men away; their daily allocations fall                           |
| 31–42 | October–December | French counter-offensive: French heavy artillery (the 400 mm railway guns that smashed Douaumont) and the best French allocation of the season       |

The arc gives each side a phase to attack and a phase to hold, so both sides' players get both kinds of game, and it
creates comebacks: a German side that gains early must hold through autumn; a French side that loses ground early has
its chance later.

### War events

A deck of events, drawn on a schedule that varies from season to season, gives a side a temporary capability or
pressure. Examples: _Green Cross_ (the Germans get phosgene shells for three days), _the Voie Sacrée closes_ (French
manpower halved for two days, a sudden thaw), _the 400 mm guns_ (French super-heavy fire for one operation). Events
appear in the communiqué a day before they take effect, so both sides can plan.

## Victory: the Balance

The war is a tug of war on one bar, **the Balance**, from −100 (French collapse) to +100 (German collapse), starting
at 0. Each daily turn moves it by:

| Factor          | Moves the Balance toward the side that…                     |
| --------------- | ----------------------------------------------------------- |
| Key points held | Holds them at the cutoff, weighted by kind (forts heaviest) |
| Ground gained   | Gained held ground that day                                 |
| Losses          | Lost fewer men relative to its own daily reinforcement      |
| Operations      | Achieved its operations' objectives                         |

The losses term is the Germans' 1916 strategy made into a rule: Falkenhayn meant to bleed the French army white. A
German side that trades well can win without taking Verdun, and a French side that holds ground but spends men
recklessly can still lose.

**The season ends** when:

- the Balance reaches ±100, a collapse; or
- the Germans take Verdun itself (every fort of the inner ring, then the citadel), a decisive German victory; or
- the calendar reaches December, and the Balance decides: beyond ±50 a decisive victory, beyond ±15 a victory, and in
  between a stalemate, which is also what history recorded.

The Balance is public all season, so both sides always know how the war stands and what a good day is worth.

## Between seasons

- A week off between seasons: the war memorial for the season (every regiment's record, the fallen), rewards, and the
  next season's announcement.
- **Seasons vary**: new war-event schedule, the weather's seed, which sectors are open, and later different battles (the
  Somme 1916, the Chemin des Dames 1917, the spring offensives of 1918), each with its own arc and asymmetries. Players
  keep their side, regiment and service record across seasons, and choose a side again for each.
