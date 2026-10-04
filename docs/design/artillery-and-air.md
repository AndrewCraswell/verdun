# Artillery and air

The guns, which caused most of the war's casualties, and the aircraft and balloons that told them where to fire. Part of
the [game design](overview.md).

## Artillery

### What's built

[artillery.ts](../../packages/sim/src/artillery.ts): field and heavy guns firing HE, shrapnel and gas, with historical
dispersion and flight times; fire missions, bombardments, calls for fire, creeping, standing, SOS and protective
barrages; craters that reshape the ground, its meshes and the sight lines; smoke and dust that hide what's behind them;
wire cut by bursts; men buried in dugouts by heavy shells. Batteries fire from off the map, about 4 km behind each
side's line. Shell stocks by type are being added by the gameplay session (see
[logistics](logistics.md#sector-the-daily-allotment)).

### Guns by year

Gun types arrive and leave with the calendar. Each class shares the simulation's behaviour for its shell; the numbers
(calibre, burst radius, dispersion, rate) come from the historical guns.

| Class                 | French                                               | German                                    | Role                                            |
| --------------------- | ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------------- |
| Field gun             | 75 mm M1897: very fast, flat trajectory              | 7.7 cm FK 96 n.A., FK 16                  | Barrages, shrapnel on the open, wire-cutting    |
| Light howitzer        | Few until 1917 (75s did the work)                    | 10.5 cm leFH 98/09, 16                    | Plunging fire into trenches                     |
| Medium howitzer       | 155 mm Rimailho, 155 C 1917                          | 15 cm sFH 02, 13                          | Smashing trenches and dugouts                   |
| Heavy and super-heavy | 220, 270, 280 mm mortars; 400 mm railway guns (1916) | 21 cm Mörser, 30.5 cm, 42 cm "Big Bertha" | Forts, deep dugouts, counter-battery            |
| Trench mortar         | 58 mm "crapouillot", 150 mm, 240 mm                  | 7.58, 17 and 25 cm Minenwerfer            | Short-range demolition, wire, crewed by players |

The French have more field guns firing faster; the Germans have more heavy howitzers, early. That shapes each side's
fire plans: French barrages are dense and quick, German bombardments crush. Both build up heavy artillery as the war
goes on.

### Shells by year

| Shell                               | Effect                                                                                                         | Arrives                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| HE (built)                          | Blast and fragments; craters; buries; cuts wire                                                                | 1914                                   |
| Shrapnel (built)                    | Balls over open ground; poor against trenches                                                                  | 1914, fading from 1916                 |
| Phosgene (built)                    | Choking gas cloud (Green Cross, French No. 5)                                                                  | 1915–16                                |
| Tear gas                            | Masks on, aim spoiled, no casualties                                                                           | 1915                                   |
| Blue Cross                          | Arsenical smoke that gets through masks and makes men tear them off, mixed with Green Cross ("coloured shoot") | 1917 (German)                          |
| Mustard gas (Yellow Cross, Yperite) | Lingers in the ground for days, burns skin; masks don't stop the burns                                         | July 1917 (German), June 1918 (French) |
| Smoke                               | A screen, using the built smoke grid                                                                           | 1916                                   |
| Instantaneous fuzes                 | Burst on the surface: cut wire without cratering the ground for the attackers                                  | 1917                                   |

### Batteries

- **Batteries are places**, behind each side's lines on the war map and, close up, on the sector map (Fleury has field
  guns in sandbagged pits). Each has guns of one class, a range, a rate, a stock and a crew.
- **Range matters.** After an advance the enemy's new line can be out of range until the war map moves the guns up, over
  the next turn or two. That's the main brake on [snowballing](balance.md#snowballing).
- **Counter-battery fire**: heavy guns fire on enemy batteries they've located; a hit battery is silenced for a time and
  may lose guns or its dump. Locating batteries: aircraft, balloons, and from 1917 **sound ranging** and **flash
  spotting**, which find a battery each time it fires. A battery that fires more is found faster.
- **Barrels wear.** Sustained fire loosens a battery's accuracy until it rests; a long bombardment drifts.

### Observed and predicted fire

- **Observed fire**: an observer who can see the target corrects the fall of shot; it is accurate but needs
  [observation](#observation) and a link back to the battery (a [telephone line](logistics.md#communications-planned), a
  runner, a wireless aircraft).
- **Registration**: until 1917 a battery laying on a new target fires ranging shots first, which tells the enemy what's
  coming.
- **Predicted fire** (1917–18): with surveyed positions and weather corrections, batteries fire accurately without
  registering. Bruchmüller's 1918 German bombardments were built on it: surprise, at the price of a little accuracy.

### Who fires

| Fire                 | Who orders it                                                                | Paid from                                        |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Operation fire plans | The sector commander, when planning an [operation](operations.md#planning)   | The stock, reserved up front                     |
| SOS barrage          | Automatic when attackers enter no man's land (built), or a red signal rocket | A standing reserve                               |
| Counter-preparation  | The commander, on suspected assembly                                         | The stock                                        |
| Calls for fire       | A forward observer or squad leader, on ground they can see                   | A personal ration, then the commander's approval |
| Harassing fire       | The commander AI: communication trenches, roads and dumps at night           | A small share of the stock                       |
| Counter-battery      | The commander, on located batteries                                          | Heavy HE                                         |
| Trench mortars       | Their crews, directly                                                        | The crew's carried bombs                         |

Calls for fire land only where the caller can see, and each player's calls come from a small ration that refills slowly,
so friendly fire stays a responsibility rather than a griefing tool.

Players don't crew field batteries. Trench mortars are the artillery players aim themselves; the forward observer is the
artillery role players play.

### Observation

Accuracy depends on who's watching. Each fire mission takes the best observation available over its target:

| Observation                          | Accuracy  | Notes                                                              |
| ------------------------------------ | --------- | ------------------------------------------------------------------ |
| None (map firing on old coordinates) | Poor      | The default for harassing fire and for targets nobody can see      |
| Forward observer in the line         | Good      | Needs line of sight and a telephone line or runner                 |
| Observation post on high ground      | Good      | Key points like the Douaumont crest serve neighbouring sectors too |
| Balloon                              | Good      | See below                                                          |
| Spotting aircraft with wireless      | Very good | From 1917; only in flying weather                                  |

## The air war

Aircraft and balloons serve the war on the ground: they find targets, correct fire, photograph the enemy's preparations,
and from 1917 attack trenches directly. They are **not flown by players at launch**: flying is a different game, with
different controls, camera and scale (see [open questions](../open-questions.md#product)). They are visible overhead,
can be shot at, and change what each side knows and how well its guns shoot.

### Air superiority

Each sector has an **air superiority** value per side for each hour, set by the squadrons the war map assigns and by the
weather:

- Rain, low cloud and fog ground most flying; night grounds all but bombers.
- Superiority swings with the year: German Fokker monoplanes in late 1915, French squadrons massed over Verdun from
  spring 1916, German "Bloody April" over Arras in 1917, Allied numbers in 1918.
- The communiqué reports the air war as it happened: aces, losses, balloons burned.

Superiority decides how often each side's aircraft get through to do the jobs below, and how often enemy aircraft are
driven off.

### Balloons

Each side keeps observation balloons (French Caquot, German Drachen) a few kilometres behind its lines.

- A balloon up gives its side **balloon observation** over the sector: better accuracy for its guns, and it sees men
  massing in jump-off trenches and batteries firing.
- Balloons go up by day in flying weather and come down in high wind.
- Fighters attack balloons; balloons are defended by anti-aircraft guns and machine guns. When one burns, its observers
  jump by parachute, and the side loses that observation until a new balloon goes up, an hour or two later.

### Reconnaissance and photography

Photographic aircraft fly over enemy lines and their pictures are read overnight. At each daily turn, a side with
reconnaissance flights over a sector learns:

- New trenches dug, including **assembly trenches** for an offensive.
- Dumps and battery positions.
- Wire repaired and laid.

This is intelligence at the war's pace: the enemy's preparations show a day late, and denying the air buys secrecy.

### Artillery spotting

From 1917, wireless-equipped aircraft correct fire during operations and counter-battery shoots: "very good" observation
for missions in their sector while they're overhead.

### Contact patrols

During an attack, a contact aircraft flies low over the advance; the infantry light flares or lay panels to show where
they've reached. The commander's map then shows the attackers' positions, which otherwise come back only by runner, late
and incomplete. Without it, the commander is planning the barrage blind.

### Ground attack (1917–18)

German _Schlachtstaffeln_ and French Breguet 14 squadrons strafed and bombed trenches in support of attacks. A ground
attack is a support mission the commander can call when the side has superiority: a pass of two to six aircraft along a
trench, with machine-gun fire and small bombs. It suppresses heavily, kills some, and the aircraft can be shot down by
rifle and machine-gun fire from below, especially from men who aren't pinned.

### Bombing

Night bombers attack railheads, dumps and batteries behind the lines: a war-map effect at the daily turn (supply route
capacity reduced, a dump lost), not something seen in the sector.

### Anti-aircraft

Anti-aircraft guns near batteries and balloons, machine guns on high mounts, and riflemen firing volleys bring aircraft
down. In the sector, a machine-gun team can be ordered to fire at aircraft instead of the enemy line; a low
ground-attack pass is the easiest target.

## Balance levers

Gun counts by class and year, rates, dispersion by observation quality, registration and predicted fire, counter-battery
effect and duration, observation sources and their accuracy, air superiority by side and year, balloon recovery time,
ground-attack strength and frequency. The [balance harness](balance.md#test-harness) should keep barrage attacks inside
their bands for every year's kit, not only 1916's.
