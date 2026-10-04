# Logistics

Supply lines, ammunition and reinforcements: how men and materiel reach the fighting, and how cutting them decides
battles. Part of the [game design](overview.md).

**The design rule: logistics creates decisions, not chores.** Foxhole shows how deep player-run logistics can be, and
also how much of a war it turns into hauling. Here bots run the supply chain by default, and it keeps the front playable
whether or not anyone helps. Players touch logistics where it's a decision (where to put a dump, whether to shell the
enemy's roads, when to send men back for grenades) and can choose to lead supply work for recognition, never because the
front stalls without them.

## The supply chain

Supply flows down four levels, each with its own clock:

| Level   | What it holds                                     | Fed by                                         | Clock      | Can be hurt by                        |
| ------- | ------------------------------------------------- | ---------------------------------------------- | ---------- | ------------------------------------- |
| War map | Each side's production and reserves               | The calendar (factories, the year's pressures) | Daily turn | War events, bombing of railheads      |
| Sector  | The day's allotment: men, shells, stores          | The war map, along supply routes               | Daily turn | Supply distance, salients, cut routes |
| Dump    | Ammunition, grenades, wire, sandbags, in trenches | Carrying parties from the sector stock         | Minutes    | Shellfire (dumps explode), capture    |
| Soldier | What a man carries                                | Dumps, the fallen                              | Seconds    | Firing, throwing, dropping it to run  |

### War map: routes and railheads

Each side's sectors are fed from **railheads** by **supply routes**: roads, standard-gauge railways and narrow-gauge
light railways, drawn on the war map. A route's daily capacity sets how much of a sector's allotment arrives.

- **The Voie Sacrée.** The French at Verdun were fed through one road from Bar-le-Duc, about 3,500 trucks a day, with
  territorial divisions shovelling stone into its surface around the clock. The Germans had railways to the front. So
  the French supply is one fragile, high-capacity route that a thaw or a war event can choke; the German supply is
  sturdier and harder to grow. Each year's theatre has routes of its own.
- **Weather**: a thaw or heavy rain cuts road capacity by up to half for a turn; frost hardens roads.
- **Distance**: sectors further from a railhead lose a share of their allotment on the way (see
  [snowballing](balance.md#snowballing)). An advance moves the front away from its railheads until the war map extends
  the routes, a few turns later.
- **Supply nodes** held as [key points](war-map-and-season.md#key-points) raise the capacity of the routes through them.

### Sector: the daily allotment

At the [daily turn](war-map-and-season.md#the-daily-turn) each sector receives:

- **Men** into its [manpower pool](sector-battle.md#manpower), through `allotReinforcements` (built).
- **Shells by type** into each side's stock: `sim.artillery.ammunition`, drawn by every round fired (being built by the
  gameplay session; a mission stops with an `out-of-shells` event when its type runs out). The daily turn adds to it.
- **Small-arms ammunition and grenades** into the sector's main dumps.
- **Engineering stores**: wire, stakes, sandbags, timber, used by the overnight works and by engineers'
  [field works](field-works.md).

Unspent shells and stores carry over, up to two days' allotment.

### Dumps (planned)

Dumps are physical places in the sector: Fleury already has supply dumps in its rear areas.

- **Main dumps** in the reserve line, filled by the daily allotment.
- **Forward dumps** in the support and front lines, filled by **carrying parties**: bot squads (or a player's squad that
  takes the job) walking boxes up the communication trenches. A forward dump holds a few hundred grenades, some
  thousands of rounds, wire and sandbags.
- **Dumps explode.** A heavy shell landing on a dump sets it off: a big burst and a crater, and the stock is gone. The
  explosion in Fort Douaumont on 8 May 1916 killed hundreds of German soldiers. Where to put dumps, and how many, is a
  real decision for the sector commander.
- **Captured dumps** can be used by the side that takes them, at a fraction of their contents (the wrong calibre, the
  wrong fuzes); their grenades always work.

### Supply lines in the sector

A forward dump is supplied along its **route**: the communication trenches back to a main dump.

- Carrying parties walk the route at the pace of loaded men (stamina costs × 1.5, see
  [stamina](morale-and-stamina.md#stamina-planned)).
- **Shellfire on a communication trench** slows and kills carrying parties; the commander AI's harassing fire at night
  aims exactly there.
- **A route through enemy-held ground is cut.** A trench taken in an attack has no dump until carrying parties set one
  up, which is part of [consolidation](sector-battle.md#consolidation): ground that can't be supplied can't be held for
  long.
- Gas lying in a communication trench forces carrying parties into masks and slows them further.

This is the mechanism behind many failed WW1 attacks: the first wave took the trench, the bombers ran out of grenades,
and the counter-attack came in before the carrying parties got across no man's land. The game should produce that story,
and reward the side that brings its supplies forward.

## Ammunition on the man (planned)

Today rifles and machine guns never run dry and each man has 3 grenades with no resupply. Planned:

| Item                   | Carried                                                                         | Used by                        |
| ---------------------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Rifle rounds           | 120 (French), 150 (German)                                                      | Riflemen; 1 round a shot       |
| Machine-gun ammunition | 3,000 rounds a team: belts (MG 08) or strips (Hotchkiss), spread among the crew | The gun's crew                 |
| Light automatic rounds | 250–400 in magazines                                                            | Chauchat gunner and his loader |
| Hand grenades          | 3 a man (built); bombers carry 12–20                                            | Everyone                       |
| Rifle grenades         | 6–10 per rifle grenadier                                                        | Rifle grenadiers               |
| Trench mortar bombs    | A few dozen per crew, carried by the crew's carriers                            | Mortar crews                   |
| Flares                 | A pistol and 12 cartridges per squad                                            | The squad leader or sentry     |
| Wire, sandbags         | Engineers only                                                                  | Wiring and consolidation       |

Running low changes behaviour, not just a counter:

- Below a quarter of his rounds, a bot **husbands** ammunition: he fires only at clear targets inside 200 m.
- With none left, he **scavenges** from the fallen within 10 m (rounds and grenades of his own side's kind, a minute's
  work, exposed), then fights with the bayonet and grenades. A player's soldier can scavenge with a held key.
- A squad with men low on ammunition and a forward dump within 150 m sends **two men back to fetch** for everyone: a
  squad order the player can give too (**resupply**), and the AI's default when the squad isn't in contact.

The HUD shows the controlled soldier's rounds and grenades, and marks squad members who are low.

### Machine guns

Machine guns are the biggest consumers. A team that fires its 3,000 rounds in an attack goes quiet until its carriers
come back, which gives attackers a window and makes the carriers real targets. MG 08 belts and Hotchkiss strips also
jam; a team needs a few seconds to clear a stoppage, longer when the gun is wet or muddy.

## Reinforcements

Men are logistics too. Built: each side's [manpower pool](soldier-and-squad.md#losing-the-squad-and-coming-back), drawn
on when squads are wiped out, refilled by the daily allotment. Planned:

- **Arrival path**: replacements come up from the railhead, march to the reserve line, and appear there, as today. When
  the supply route is choked (a thaw on the Voie Sacrée), replacements arrive later.
- **Relief**: whole divisions change over at night at the [daily turn](war-map-and-season.md#divisions-and-relief). In
  the sector a relief is a dangerous hour: communication trenches packed, the line briefly held by both. The enemy's
  harassing fire on a relief is a target worth shelling, if they know it's happening (prisoners and listening posts tell
  them).
- **Wounded and sick** carried to the [aid post](soldier-and-squad.md#wounds-stretcher-bearers-and-the-aid-post) come
  back to the pool through `returnToPool`: the patched up within minutes, half of those sent to hospital at the next
  daily turn.
- **Prisoners** taken are counted on the war map and come out of the enemy's manpower for the season.

## Communications (planned)

Orders and calls for fire travel physically, and the enemy can cut them:

- **Field telephones** link the front line to battalion headquarters and the batteries. Lines run along the
  communication trenches; shellfire cuts them. A cut line delays calls for fire from 30 s to 2–3 minutes until a
  linesman (a bot, or a player) repairs it.
- **Runners** carry messages when lines are cut: slow and often killed.
- **Signal rockets and flares** call the SOS barrage and lift the creeping barrage, instantly but with only a few fixed
  meanings.
- **Pigeons, dogs and signal lamps** are flavour on the same model: slower or faster runners.
- **Wireless** arrives in 1917–18, mostly for aircraft spotting artillery; see
  [artillery and air](artillery-and-air.md).

## What players do in logistics

| Activity                        | Who does it by default  | What a player gains by doing it             |
| ------------------------------- | ----------------------- | ------------------------------------------- |
| Carrying parties                | Bot squads              | Faster forward supply, citations            |
| Placing forward dumps           | Commander (AI or human) | Supply where the attack will need it        |
| Repairing telephone lines       | Bot linesmen            | Calls for fire arrive on time               |
| Shelling enemy routes and dumps | Commander AI at night   | Starving the enemy's front before an attack |
| Scavenging and fetching         | Squads' own men         | Keeping the squad in the fight              |

## Balance levers

Shell stocks per type and the daily allotment; route capacities; dump sizes; carried rounds and grenades; carrying party
size and pace; telephone repair time. The [balance harness](balance.md#test-harness) should show attacks that outrun
their supply failing more often than those that bring dumps forward, and a side with its routes shelled at night running
short within a day.
