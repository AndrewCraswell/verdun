# Time and weather

How the game keeps time, decides the weather, and lights the battlefield, with the values chosen and why. The game
design behind the campaign clock is in the [design overview](design/overview.md#clocks); this doc is the reference for
the systems that implement it. A summary is in [architecture](architecture.md#time-of-day-and-weather).

## At a glance

| What                | Value                                                          | Where                                     |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| One real day        | One week of the war (one campaign turn)                        | Campaign (to come); `clock` command       |
| One season          | One year of the war, 1914 to 1918                              | [Design](design/war-map-and-season.md)    |
| One day and night   | 117 real minutes                                               | `DEFAULT_MINUTES_PER_DAY`                 |
| Darkness each cycle | 30 real minutes in June to 70 in December                      | Follows from the two above                |
| What players see    | "Week of 21 February 1916" and the hour by the French clock    | `apps/client/src/environment/calendar.ts` |
| Weather             | Seeded cycle of seven patterns, by season; historical later    | `packages/sim/src/weather.ts`             |
| Sun and moon        | astronomy-engine, for Fleury (49.19° N, 5.43° E)               | `packages/sim/src/sky.ts`                 |
| Sight at night      | About 35 m without a moon, 130–150 m by a full moon            | `sightRange` in `sky.ts`                  |
| Default start       | Week of 23 June 1916 (the attack on Fleury), 07:00 French time | `DEFAULT_WEEK`, `DEFAULT_ELAPSED`         |

## The clocks

Players live by two clocks, and each is simple on its own:

- **The week of the war** moves on once a real day, at the campaign's daily turn. It is the date players see: "Week of
  21 February 1916". It decides the season, the length of the day, the moon's phase and the weather's climate.
- **The hour** turns a full day and night every 117 real minutes, so an evening's play sees dawn, day, dusk and night.

| Clock                | Rate                             | Drives                                                  |
| -------------------- | -------------------------------- | ------------------------------------------------------- |
| Simulation tick      | 20 Hz                            | Movement, fire, shells, gas                             |
| Day and night        | One cycle every 117 real minutes | Sun, moon, light, sight range, the weather's hour       |
| Week (campaign turn) | One real day                     | The date shown, the season's climate, historical events |
| Season               | One year of the war              | The campaign's arc and its result                       |

### One real day is one week of the war

A whole war at one week a day would take about 7½ months, too long for one season, so each year of the war is its own
season, with the front and the war's state carried over between them:

| Season | Weeks of war                            | Turns (real days) | Real length    |
| ------ | --------------------------------------- | ----------------- | -------------- |
| 1914   | 4 August to 31 December                 | 22                | About 3 weeks  |
| 1915   | The whole year                          | 52                | About 7½ weeks |
| 1916   | The whole year                          | 52                | About 7½ weeks |
| 1917   | The whole year                          | 52                | About 7½ weeks |
| 1918   | 1 January to the armistice, 11 November | 45                | About 6½ weeks |

How each season is won, and how one year's result carries into the next, is in the
[design](design/war-map-and-season.md).

Alternatives considered:

| Option                                                 | Season length             | Why not                                                                                                        |
| ------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The whole war in one season, a week a day              | About 7½ months           | Too long to hold players                                                                                       |
| The whole war in one season, a month a day             | About 7½ weeks            | One turn would swallow Verdun's opening or the first weeks of the Somme                                        |
| A varying pace: a week in offensives, a month in lulls | About 5½ months           | Too long, and the hardest of all to explain                                                                    |
| The date running with the hours, no turns              | 130 real days for the war | The date would change every two hours; day length must divide the real day, so night falls at fixed real hours |

### Why 117 minutes

A day and night must be short enough that one evening sees all of it, and long enough that the night is worth having:
raids, wiring parties and reliefs need half an hour or more of darkness. It must also **not divide the real day**, or
night would fall at the same real hours every day and someone who always plays at 8 pm would always play in the same
light. What matters is the remainder of 1440 real minutes divided by the cycle: how far the cycle slips against the real
clock each day.

| Day length  | Cycles a real day | Slip each real day               | What a player who comes on at 8 pm every evening sees |
| ----------- | ----------------- | -------------------------------- | ----------------------------------------------------- |
| 120 min     | 12                | 0                                | The same phase every day (the old default: a bug)     |
| 115 min     | 12.5              | 60 min, about half a cycle       | Only two phases, alternating                          |
| 110 min     | 13.1              | 10 min                           | The same phase several evenings running               |
| **117 min** | 12.3              | 36 min, about a third of a cycle | Day, dusk and night over three evenings               |

Darkness (the sun more than 6° below the horizon, past civil twilight) at Fleury, in real minutes of a 117-minute cycle:

| Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 68  | 62  | 54  | 44  | 35  | 30  | 33  | 40  | 50  | 59  | 66  | 70  |

Winter is night-heavy, which suits raids and wire work. If playtests find winter nights too long, shorten the nights
rather than the whole cycle.

### How the clock is stored

`WorldClock` in `packages/sim/src/environment.ts` holds three numbers:

- `week`: 00:00 UTC on the first day of the week being fought, in milliseconds since 1970 (negative before 1970).
- `elapsed`: game time since the week began, in milliseconds. Each tick adds `seconds × 1440 / minutesPerDay`.
- `minutesPerDay`: real minutes a day and night takes.

The moment the sky and weather show is `week + (elapsed mod 7 days)` (`clockMoment`). Each new day of battle shows the
week's next date, so the moon, the length of the day and, later, the historical weather follow the week; after the
seventh date the week's dates start again. About 12 days of battle pass in a turn, so each date is fought over about
twice. Players never see these dates, only the week and the hour.

Where the sky's date jumps (the seventh day wrapping to the first, or a new week), the weather eases from the old to the
new over one game hour (`WEATHER_BLEND`, `blendWeather`) instead of changing at once.

### Commands

Everything that moves the clock is a command, so a server, the campaign, tests and dev tools all use the same path:

| Command field                      | Effect                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `{ type: "clock", week }`          | The daily turn: a new week; the hour carries on, the days start again, the weather eases |
| `{ type: "clock", at }`            | Jumps to a moment; the week becomes the one starting that day. Tests and dev tools       |
| `{ type: "clock", shift }`         | Moves the hour on or back by that much game time. Dev tools                              |
| `{ type: "clock", minutesPerDay }` | Changes the cycle length; time stays continuous                                          |
| `{ type: "forecast", forecast }`   | Changes where the weather comes from                                                     |
| `{ type: "wind", x, z }`           | Holds the weather as it is, with that wind                                               |

## What players see

- **The week**, on the communiqué and in the HUD: "Week of 21 February 1916" (`weekLabel`).
- **The hour**, as a small clock in the HUD: "07:12" (`battleHour`).
- Once the campaign exists: the turn within the season ("Day 23 of 52, 1916") and a countdown to the next communiqué.
- **Never a speed ratio** such as "12× time". "One real day is one week of the war" and the hour are all anyone needs.

The hour is French civil time, read through the browser's time-zone data for Europe/Paris, which has the history:
Greenwich time through 1915, then summer time an hour ahead from 14 June 1916, 24 March 1917 and 9 March 1918, each
until early October. The German army kept Berlin time, an hour or two ahead of the French; the game shows the French
clock to both sides, since the battlefield is in France.

## Sun, moon and light

- **Positions**: [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT, accurate to about an arcminute)
  gives the sun's and moon's altitude and azimuth, refraction included, and the moon's phase and magnitude, for the
  battlefield's latitude, longitude and height. A sample costs about 0.1 ms, taken once a real second.
- **Light on open ground** under a clear sky, in lux (`skyAt`):
  - the sun and twilight from the US Naval Observatory's tables: about 730 lux as the sun touches the horizon, 3 lux at
    the end of civil twilight, under 0.01 at the end of nautical twilight, 100,000 at a summer noon;
  - the moon from its magnitude (a full moon gives about 0.26 lux overhead), its altitude and the air it shines through;
  - starlight and airglow, 0.002 lux.
- **Cloud** dims it by Kasten and Czeplak's law: a full overcast lets through about a quarter, a half cover nearly all.
- **Sight range** (`sightRange`): how far a man can be made out, from the light and the weather's visibility.

| Light               | Lux        | Sight range          |
| ------------------- | ---------- | -------------------- |
| Moonless night      | 0.002      | About 30 m           |
| Full moon           | 0.25       | About 150 m          |
| Late civil twilight | 3          | About 500 m          |
| Daylight            | 300 and up | Not limited by light |

Fog, rain and snow cap it at 0.6 of the visibility, since a soldier is a small, drab target and visibility is measured
against large dark landmarks: a 150 m fog bank hides men beyond about 90 m.

### Seeing at night

Sight is decided per man by the light where he stands (`packages/sim/src/sight.ts`), and both combat and the player's
fog of war use the same rule (`canMakeOut`, `sightReach`):

- **The light on him**: the sky's, through the cloud, plus any **flare** overhead (`lightAt`). Reach is
  `sightRange(light, visibility)` from the table above, so a man under a flare can be seen from a few hundred metres
  while the ground around him stays dark.
- **His muzzle flash**: for 1.5 s after firing in the dark (`FLASH_SECONDS`), a shooter can be seen from up to 800 m
  (`FLASH_REACH`), capped by the visibility. Whoever saw the flash can fire back at it.
- **Aim** falls with the light on the target (`aimInLight`): full by day and in twilight, about a third by a full moon,
  0.3 by starlight or at a muzzle flash, most of daylight's under a flare.
- **The player's view** (`apps/client/src/fog/fog-of-war.ts`) shows enemies by the same rule, and lights the ground only
  as far as the sight range, but never less than 30 m around the viewer.

**Flares** (`packages/sim/src/flares.ts`) are Very lights. When it is dark (under 3 lux, past civil twilight), squad
leaders standing in a trench act as sentries:

- A sentry who hears an enemy moving in front of him (walking within 150 m, crawling within 40 m) sends a flare up over
  him, unless a flare already lights the spot.
- On a quiet night each sentry sends one up over the ground in front about every three minutes, 70–140 m out.
- At most six of a side's flares are in the air at once.
- A flare rises to 60 m in 1.5 s, then sinks at 3 m/s and drifts with the wind, burning 8 s in all. It lights the ground
  within 70 m of the point beneath it, up to 2 lux at the centre (`FLARE`).
- By day nothing happens and no random numbers are drawn, so daytime battles are unchanged.
- The renderer draws flares from `sim.flares` with `flarePosition(flare, tick)`; a `flare` event marks each launch.

## Weather

### Forecasts

Where the weather comes from is plain data (`ForecastSpec`) saved with the world, and swapped with the `forecast`
command without touching anything else:

- **cycle**: a seeded succession of patterns, below. The default in the game.
- **steady**: one weather held. The default for tests and headless battles, so their outcomes don't drift with the
  weather; also the dev tools and the `wind` command.
- **records** (to come): the historical weather of 1914–1918. See [the cutover](#historical-weather).

Every forecast is a pure function of time: the same moment always gives the same weather. Weather never draws from the
simulation's random number generator, so it doesn't disturb the combat's random sequence, and clients can compute it
themselves from the spec and the clock.

### The cycle

Seven patterns, each a spell lasting hours to days:

| Pattern  | Cloud   | Rain (mm/h)                | Visibility | Wind                        | Gas and shell smoke drift with it; the bots shell with gas by night only when the wind blows toward the enemy |                                             |
| -------- | ------- | -------------------------- | ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Clear    | 0–15%   | 0                          | 20–40 km   | 1–3 m/s from the NE         | 12–60 h                                                                                                       | Warm in summer, cold in winter; morning fog |
| Fair     | 25–55%  | 0                          | 15–30 km   | 1.5–4 m/s from the W        | 8–36 h                                                                                                        | Morning fog sometimes                       |
| Overcast | 85–100% | 0                          | 6–15 km    | 1.5–5 m/s from the SW       | 6–36 h                                                                                                        | Mild in winter                              |
| Fog      | 100%    | 0                          | 80–400 m   | Calm                        | 4–30 h                                                                                                        | Winter only                                 |
| Drizzle  | 100%    | 0.1–0.25                   | 3–6 km     | 1.5–4 m/s from the SW       | 3–12 h                                                                                                        | More in winter                              |
| Rain     | 100%    | 0.4–1.6                    | 5–10 km    | 3–7 m/s from the SW         | 3–14 h                                                                                                        | A passing front                             |
| Storm    | 90–100% | 3–8, peaking at twice that | 4–8 km     | 5–10 m/s, gusty, from the W | 1–3 h                                                                                                         | Summer thunderstorms, lightning             |

- **Succession**: a Markov chain: fronts clear to fair skies, fair skies cloud over, and so on, weighted by the season
  (no thunderstorms in winter, no all-day fog in summer, drizzle mostly in winter, clear spells mostly in summer).
- **Changes** arrive over 90 minutes of game time, like a front's leading edge.
- **Temperature**: Verdun's monthly normals (1.8 °C in January to 18.3 °C in July), the spell's departure from them, and
  a day-night swing of 5 °C in winter to 12 °C in summer, damped by cloud. Coldest before dawn, warmest mid-afternoon.
- **Rain and snow**: rain comes and goes in showers; it falls as snow below about 1.5 °C. Rain and snow cut the
  visibility (about 10 km in light rain, about 1 km in light snow).
- **Morning fog** forms in the small hours under clear and fair skies, mostly in the cool season, thickest at sunrise,
  and burns off through the morning.
- **Wind** gusts and veers over minutes. It is the wind at a man's height, about three quarters of the 10 m wind.
- **The ground** integrates the last four days: rain wets it, sun and wind dry it (in about a day in summer, three in
  winter), and snow lies until it thaws.
- **Calibration**: over a simulated year about 975 mm of rain, close to Verdun's usual 900–1,000 mm, westerly winds on
  average, January between −5 and 6 °C, July between 11 and 27 °C.
- **Range**: the chain starts on 1 January 1914, so every week of the war has weather.

## The ground in the weather

`packages/sim/src/ground.ts` turns the weather's ground wetness into going underfoot:

- **Sodden**: wetness beyond 0.3, the dampness fair weather leaves, scaled to 0–1 (`sodden`). Frozen ground (below −2
  °C) counts as dry. Fair weather changes nothing.
- **Pace** (`weatherPace`): sodden mud and churned ground take up to 45% off a man's pace, a flooded trench 25%, grass
  and chalk 15%; deep snow (20 mm of water lying, about 20 cm) up to a quarter more. On top of the surfaces' own paces,
  slopes, wire and gas masks.
- **Shell bursts** (`burstReach`): in sodden mud a shell buries itself before it bursts and the mud swallows its
  fragments: up to 30% off its lethal reach, as men found at Verdun and Passchendaele.
- **Gas and smoke**: rain washes phosgene out of the air (an extra half-life of 5 minutes in 1 mm/h of rain, shorter in
  heavier) and beats down shell smoke (2 minutes); snow a third as well.

## The night routine

Both armies kept the same routine, and the bots now keep it too (`packages/sim/src/routine.ts`, `commander.ts`):

- **Stand-to** at dawn and dusk, while the sun is between 10° below the horizon and 2° above it (`isStandTo`): every man
  up on the fire step, since these were the hours attacks came. About an hour of game time each.
- **Night** proper (`isNight`): dark and not stand-to. In every bot squad holding a trench, all but the sentry (the
  squad's leader) and one other man go down the dugouts to sleep (`restsTonight`). They come up for stand-to, or when
  the sentry sees enemies close, as under shellfire. A player's squad stays up.
- **Raids**: about once a night per side (a 1-in-40 chance every 5 s once dark, then not again for a day of battle), the
  bot squad of the front-line garrison nearest the enemy, at least four strong, raids the nearest bay of his fire trench
  (`raid` squad order). The raiders crawl out to the edge of his wire (25 m short), rush in to bomb, kill and take
  prisoners (sleepers caught below surrender), and after a minute crawl home. They turn back once half are down, or if a
  phase takes over 15 minutes; a raid still out at dawn keeps coming home.
- **Wiring parties**: every 5 s at night each side re-stakes up to 3 square metres of cut wire nearest its own front
  line, on its own half of no man's land, where friends are within 60 m and no enemy within 30 m (`mendWire`). Enough to
  close most of a night's gaps.
- **Gas** by night: at most once a night per side, and only when the wind blows toward the enemy at 1 m/s or more, no
  faster than 5 m/s, with no rain (`gasWeather`): 5 minutes of field-gun gas shells on 200 m of the enemy's front line.

## Effects on play

| Condition   | Now                                                                                                                                                                                                                                 | Planned                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Night       | Sight range closes to tens of metres; flares light the ground and muzzle flashes give shooters away; aim falls with the light; the player sees only what his men can; garrisons sleep but for their sentries; raids, wiring parties | Reliefs, rations and ammunition come up only at night                                       |
| Dawn, dusk  | Stand-to: every bot squad mans the parapet                                                                                                                                                                                          | Attacks timed for dawn                                                                      |
| Fog         | Sight range closes to tens of metres                                                                                                                                                                                                | Cover for surprise attacks, as at Douaumont on 24 October 1916; artillery observation fails |
| Rain, mud   | Sodden mud slows men by up to 45% (trenches 25%, grass and chalk 15%); shells bursting in it lose 30% of their reach; rain washes gas out (half-life 5 min in 1 mm/h) and beats smoke down                                          | Routes that avoid the worst mud                                                             |
| Wind        | Gas and shell smoke drift with it                                                                                                                                                                                                   | Gas attacks wait for a wind toward the enemy                                                |
| Snow, frost | Snow falls and lies, drawn on level ground; deep lying snow slows men by up to a quarter; frozen ground goes like dry                                                                                                               | Tracks give patrols away                                                                    |

## Rendering

In `apps/client/src/environment/`:

- **Key light** (`daylight.ts`): the sun, or the moon when it is up and brighter, shining from its true direction.
  Babylon's physically based `Atmosphere` add-on (`@babylonjs/addons`, experimental) colours sunlight through the air,
  white at noon to red at sunset; where it can't run, a table by the sun's altitude does. The camera never looks at the
  sky, so the add-on's sky, aerial perspective and globe aren't drawn (rendering groups set to −1).
- **Night** is drawn dim and blue on a log scale of lux, not physically dark: the renderer can't show a range of ten
  million to one, and players must still read the ground.
- **Fill light, fog and shadows** follow the light level and the cloud: overcast softens shadows away.
- **Fog density** comes from the visibility (Koschmieder: exp2 fog reaches 5% contrast at 1.73 / density), thinned for
  the camera's distance so at least 35% of the ground where it looks still shows. Babylon's fog is by distance from the
  camera, but real fog lies near the ground, and the camera looks down through it from 50–260 m.
- **Rain and snow** (`precipitation.ts`): particles falling around the camera's target, blown by the wind, as dense as
  the rate, drawn wider than real drops so they show from above.
- **Wet ground and props** darken and catch the light; **thunderstorms** flash, and `onLightning` reports each strike's
  distance (1.5–8 km) so thunder can follow at 3 s a kilometre; the level's **smoke and mist** drift on the weather's
  wind, and mist thickens as visibility falls (`environment-view.ts`).
- **Cloud shadows and lying snow** (`weather-surface-plugin.ts`): a material plugin on the ground and every prop, in
  GLSL and WGSL. A tileable cloud pattern, about 700 m to a cell and generated on the CPU, drifts with the wind aloft
  (three times the ground wind, at least 3 m/s) and darkens the ground beneath it by up to 45% when the sun is up and
  the sky half cloudy; a clear or an overcast sky throws none. Snow lies on level ground and the tops of things, patchy
  at first and covering the field from about 8 mm of water; its brightness follows the light, blue-grey by moonlight.
  All are uniforms, so the weather changes without recompiling a shader.

## Saves and networking

- A snapshot carries the clock, the forecast's spec, and the weather and sky as last read, plus any weather blend in
  progress, so a restore resumes exactly, mid-way between readings.
- Weather and sky are read once a real second (`ENVIRONMENT_INTERVAL`), always on the same ticks.
- On a server, clients need only the clock and the forecast's spec to compute the same weather themselves.

## Tuning knobs

| Constant                               | File                                      | Value                   | Effect                                               |
| -------------------------------------- | ----------------------------------------- | ----------------------- | ---------------------------------------------------- |
| `DEFAULT_MINUTES_PER_DAY`              | `sim/src/environment.ts`                  | 117                     | Length of a day and night                            |
| `DEFAULT_WEEK`, `DEFAULT_ELAPSED`      | `sim/src/environment.ts`                  | 23 June 1916, 06:00 UTC | Where a battle starts without a campaign             |
| `WEATHER_BLEND`                        | `sim/src/environment.ts`                  | 1 game hour             | How long the weather takes to ease after a date jump |
| `ENVIRONMENT_INTERVAL`                 | `sim/src/environment.ts`                  | 20 ticks                | How often weather and sky are read                   |
| `SIGHT_BY_LIGHT`, `SOLDIER_VISIBILITY` | `sim/src/sky.ts`                          | See above               | How far men can be seen by each light and in fog     |
| `PATTERNS`, `FOLLOWS`, `seasonWeight`  | `sim/src/weather.ts`                      | See above               | What each pattern is like, and what follows what     |
| `MEAN_TEMPERATURE`, `DAILY_RANGE`      | `sim/src/weather.ts`                      | Verdun normals          | The climate                                          |
| `BLEND_HOURS`                          | `sim/src/weather.ts`                      | 1.5 h                   | How long a change of pattern takes to arrive         |
| `DRYING_DAYS`                          | `sim/src/weather.ts`                      | 3 winter, 1 summer      | How fast wet ground dries                            |
| `lightLevel`, night colours            | `client/src/environment/daylight.ts`      | Log of lux              | How bright night and twilight are drawn              |
| `GROUND_SHOWING`                       | `client/src/environment/daylight.ts`      | 35%                     | How much ground the thickest fog leaves showing      |
| `RAIN`, `SNOW`                         | `client/src/environment/precipitation.ts` | See file                | Drop counts, sizes and speeds                        |

## Historical weather

The weather of 1914–1918 can be rebuilt 3-hourly for Fleury from the 20th Century Reanalysis (CC-BY 4.0), corrected by
Météo-France's daily station records for Metz, Nancy, Bar-le-Duc and Sainte-Menehould (Licence Ouverte 2.0), with fog
inferred from humidity, wind and the hour and overrides for documented events. Sources, licences and the pipeline are in
the [research notes](research/notes/weather/historical_weather_1916.md).

The cutover: generate an hourly table offline, add a `records` kind to `ForecastSpec` that reads it (interpolating, and
adding the same seeded gusts and showers), and switch the game's forecast to it. The clock already steps the sky through
each week's real dates, so the records' weather plays out over the turn. Nothing else changes. Whether and when is an
[open question](open-questions.md).

## Dev tools and tests

- **Keys** (dev builds): `[` and `]` move the hour, `Shift` with them the week (the daily turn), `N` holds each weather
  in turn and then returns to the cycle. F3 opens the debug dock, which shows the week, the hour, the date the sky
  shows, the weather, the sun and moon, the sight range and the wind.
- **Tests**: `packages/sim/src/environment.test.ts` (the clocks, the turn, the night drift, sight in the dark, saves),
  `sky.test.ts` (sunrise and the noon sun in June 1916, full and new moons, light, sight range), `weather.test.ts`
  (determinism, the climate, the seasons, fog, wetness, the whole war), and in the client `environment-view.test.ts` and
  `calendar.test.ts`.
