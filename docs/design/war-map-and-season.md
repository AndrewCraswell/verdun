# War map and season

How sector battles add up to a war, and how a war ends. Part of the [game design](overview.md). Arrives in stage 3; the
model can be built and tuned headless earlier (see [next steps](overview.md#suggested-next-steps)).

## The war map

The war map is the Western Front where French and German armies faced each other, as a chain of sectors on the real
ground, each one a [sector battle](sector-battle.md). Each [season](#seasons-and-the-war) opens the sectors where that
year's battles were fought. The first built is Verdun's right bank, where the 1916 battle was decided; the left bank (Le
Mort-Homme, Hill 304) follows.

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
3. The war map redraws the front, applies salients and key points, and moves the [Balance](#the-balance-winning-a-year).
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

## Seasons and the war

One game is the whole war on the Western Front, from 4 August 1914 to the armistice on 11 November 1918. **Each real day
is one week of the war**, and **each year of the war is a season**, so four years and five months make five seasons. The
front, the craters, the divisions and their fatigue all carry over from one season to the next; only the Balance starts
again. Season lengths, the 117-minute day and night, and how the clocks are stored are in
[time and weather](../time-and-weather.md#one-real-day-is-one-week-of-the-war).

### The calendar

The daily turn moves the date on one week. Players see it as the week being fought ("Week of 21 February 1916") on the
communiqué and in the HUD, with the hour of the battle beside it; the date doesn't change during a turn. The date sets
the weather's climate (winter fog and snow, summer storms), the light, the kit each side has, and the year's pressures
below.

### The years

Each season has its own character, theatre and arc, taken from the real war, without its outcome being fixed. The
sectors open in a season are where that year's battles were fought.

| Season | Turns | Character                                                                                                                                                                                                                                                             | Sectors                                       |
| ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1914   | 22    | The war of movement ends in the first trenches. Shallow trenches, little wire, kepis and no gas masks; the French in red trousers until the year's end. By autumn both sides run short of shells                                                                      | The Marne, the Aisne, the Argonne, Verdun     |
| 1915   | 52    | French offensives against German lines that dig deeper each month. Gas arrives in April, the Adrian helmet in the autumn. Mine warfare under Les Éparges and the Argonne                                                                                              | Artois, Champagne, the Argonne, Les Éparges   |
| 1916   | 52    | Verdun: the German offensive from February, the forts and Fleury in June, the Somme drawing German guns away from July, the French counter-offensive in the autumn (see [the 1916 arc](#the-1916-arc))                                                                | Verdun's right bank, then the left; the Somme |
| 1917   | 52    | The Germans fall back to the Hindenburg Line in March. The Nivelle offensive on the Chemin des Dames fails in April, and the French army's mutinies cut French allocations and morale through June. Limited French attacks at Verdun and Malmaison in the second half | The Chemin des Dames, Verdun, Malmaison       |
| 1918   | 45    | German storm troops and the spring offensives break the line and reach the Marne; from July the French, with the Americans arriving, push back in the Hundred Days                                                                                                    | The Chemin des Dames, the Marne, the Argonne  |

The years swing the initiative: the French attack in 1915, the Germans in early 1916 and early 1918, the French again in
late 1916 and late 1918. Players on both sides get years to attack and years to hold, and a side that gained early in a
year has to hold what it took when the pressure turns.

### The 1916 arc

Within a season the calendar shifts each side's allocations. 1916, the first season to be built:

| Weeks | 1916             | Pressure                                                                                                                                             |
| ----- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–7   | January–February | The quiet before Verdun: raids and wiring, the German build-up behind the lines                                                                      |
| 8–17  | February–April   | German offensive. Germans start with a huge shell stockpile and fresh divisions. French manpower ramps up as the Voie Sacrée and the noria get going |
| 18–26 | May–June         | The battle for the forts and Fleury. Allocations near parity; phosgene arrives for the Germans                                                       |
| 27–39 | July–September   | The Somme (from 1 July) and the Brusilov offensive in the east draw German guns and men away; their daily allocations fall                           |
| 40–52 | October–December | French counter-offensive: French heavy artillery (the 400 mm railway guns that smashed Douaumont) and the best French allocation of the year         |

The other years get arcs of their own as their sectors are built.

### War events

A deck of events, drawn on a schedule that varies from war to war, gives a side a temporary capability or pressure.
Examples: _Green Cross_ (the Germans get phosgene shells for three days), _the Voie Sacrée closes_ (French manpower
halved for two days, a sudden thaw), _the 400 mm guns_ (French super-heavy fire for one operation). Events appear in the
communiqué a day before they take effect, so both sides can plan.

## Victory

### The Balance: winning a year

Each season is a tug of war on one bar, **the Balance**, from −100 (French collapse) to +100 (German collapse). Each
daily turn moves it by:

| Factor          | Moves the Balance toward the side that…                     |
| --------------- | ----------------------------------------------------------- |
| Key points held | Holds them at the cutoff, weighted by kind (forts heaviest) |
| Ground gained   | Gained held ground that day                                 |
| Losses          | Lost fewer men relative to its own daily reinforcement      |
| Operations      | Achieved its operations' objectives                         |

The losses term is attrition made into a rule. In 1916 it is Falkenhayn's strategy at Verdun, to bleed the French army
white: a German side that trades well can win the year without taking Verdun, and a French side that holds ground but
spends men recklessly can still lose it.

The Balance starts each season at 0, or 10 points toward last year's winner. A good year helps the next one without
deciding it, so every season is worth playing.

**A season is decided** when:

- the Balance reaches ±100: a **collapse**. The losing side's line falls back one trench system in every open sector
  overnight and the year is a decisive victory for the winner. The Balance returns to 0 and the year plays on to its
  last week, its result already settled; or
- a side takes the year's **strategic objective**, a decisive victory: Paris in 1914 and 1918, Verdun itself in 1916
  (every fort of the inner ring, then the citadel); or
- the year's last week ends and the Balance decides: beyond ±50 a decisive victory, beyond ±15 a victory, and in between
  a stalemate, which is what history recorded for most years.

The Balance is public all season, so both sides always know how the year stands and what a good day is worth.

### Winning the war

Each season's result scores for the war: 2 for a decisive victory, 1 for a victory, nothing for a stalemate. When the
armistice comes on 11 November 1918, the side with more points wins the war. A tie goes to the side whose line stands
further forward than at the end of 1914. History is a guide, not a script: a German side that wins 1916 and 1918
decisively wins the war.

## Between seasons

- A week off between seasons: the year's memorial (every regiment's record, the fallen), rewards, and the next year's
  announcement, with its theatre and new kit.
- Players keep their regiment and service record from year to year. They choose a side again for each season, with the
  [smaller side's reward](balance.md#sides) on offer.
- **Wars vary**: once the armistice is signed, a new war starts from August 1914 with a new war-event schedule and
  weather seed. Nothing from one war carries into the next except the players' records.
