# Operations

Scheduled attacks: who decides them, where the men assemble, how zero hour runs and how the defender answers. Part of
the [game design](overview.md); the operation's place in a sector's day is in [sector battle](sector-battle.md).

An operation is a planned attack with an objective, a time and a fire plan. It is the game's set piece and its
appointment: the thing players log in for. Built so far: the barrage attack (the whistle, G), the preparatory and
wire-cutting bombardment (B), the defenders' SOS barrage, and the commander AI's counter-attack.

## Kinds of operation

| Kind                | Size                                               | Preparation                                                   | When                           | Years         |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | ------------- |
| Raid                | 1–3 squads                                         | A short box barrage, or none                                  | Night                          | All           |
| Local attack        | One objective, 5–20 squads                         | One to three bombardments                                     | Dawn or dusk usually           | All           |
| Set-piece offensive | A sector's whole frontage, several sectors at once | Days of wire-cutting and bombardment, ordered on the war map  | Dawn                           | 1915–18       |
| Counter-attack      | The sector's reserves                              | Immediate (built), or prepared within hours                   | Within the half hour of a loss | All           |
| Gas attack          | A sector's frontage                                | Cylinders dug into the front line, waiting for the right wind | Night or dawn                  | 1915–16       |
| Mine attack         | Any                                                | A gallery dug over several days                               | Zero hour                      | 1915–17       |
| Infiltration        | Storm troop groups                                 | A short hurricane bombardment of hours, not days, with gas    | Dawn, often in fog             | 1918 (German) |

## Who decides

Each side's [sector commander](sector-battle.md#the-sector-commander), AI or human, plans the sector's operations. Above
it, the war map decides where a side's offensives go:

1. **The war map sets the posture.** The daily [main effort vote](war-map-and-season.md#allocation) and the year's arc
   give some sectors an offensive allotment: extra shells and fresh divisions. Sectors without one can still raid and
   make local attacks within their ordinary budget.
2. **The sector commander picks the objective and the hour**, within the limits below.
3. **Players choose whether to join**: they sign up for a wave, or keep doing what they were doing.

### How the commander AI decides

Every few minutes the AI scores candidate objectives in its sector:

| Factor         | Raises the score                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Value          | Key points, objectives, straightening a salient, high ground                                                    |
| Enemy weakness | Known garrison size and freshness (from [intelligence](sector-battle.md#raids-and-intelligence)), recent losses |
| Wire state     | Share of the enemy wire cut in front of the objective                                                           |
| Own strength   | Fresh squads available, pool size                                                                               |
| Shells         | Enough in stock for the fire plan the objective needs                                                           |
| Players        | Players on its side online, and signed up in recent operations                                                  |
| Conditions     | Fog, dusk, a favourable wind for gas                                                                            |

When the best objective clears a threshold and the budget allows, the AI plans an operation, schedules the zero hour for
the next dawn or dusk inside the planning window (or the next half hour on the hour, if that's sooner and its players
are online), and starts the preparation. The threshold rises with each operation it has launched that day, so it doesn't
spend everything at once.

When a human commander takes the sector, the AI's candidate list stays visible to them as advice.

### Limits

- Zero hour at least **30 real minutes** and at most **12 hours** ahead, so players can gather and defenders get a
  chance to notice.
- At most **three operations per side per sector per day**; raids don't count, but they cost shells and men like
  anything else.
- The fire plan is paid for up front from the [shell stock](logistics.md#sector-the-daily-allotment). No shells, no
  operation.

## Planning

The commander sets, on a planning map:

- **Objective and depth**: a stretch of enemy trench or a named objective, and how far beyond it to go.
- **Frontage**: the stretch of the own line the attack goes from.
- **Zero hour**.
- **Fire plan**: wire-cutting (how many bombardments), the preparatory bombardment, the standing barrage on the
  objective, the creeping barrage's start, lift and pace, smoke on the flanks, gas on enemy batteries and reserves. Each
  item shows its cost in shells.
- **Waves**: how many, how far apart, and what each does (see below).
- **Mines**: any galleries ready under the objective, fired at zero hour minus 30 s.
- **After**: where the carrying parties set up the forward dump, which engineers consolidate, which reserves stay back
  for the enemy's counter-attack.

Built today as fixed recipes (B, G); the planning screen comes with operations proper.

## The frontage and who goes

An attack goes in on a **stretch** of the enemy line, not the whole sector. Local attacks at Verdun went in on a few
hundred metres; the guns of a whole division were laid on that stretch while the rest of the line held and fired in
support. The game does the same: the frontage defaults to 200 m of the sector's 600.

### Choosing the stretch

The commander slides a window of the frontage's width along the enemy's front line, 20 m at a time, and scores each
place by four things it can know:

| Factor        | Weight | What it measures                                                                     |
| ------------- | ------ | ------------------------------------------------------------------------------------ |
| Value         | 2      | An objective the enemy holds on or close behind the stretch                          |
| Odds          | 2      | Our men opposite against his garrison there, his machine guns counting four men each |
| Wire          | 1      | How much of his wire in front of the stretch the guns have cut                       |
| No man's land | 1      | How narrow it is: 50 m scores best, 200 m and more scores nothing                    |

The highest score wins, with a small random nudge so a defender can't always tell where the blow will fall. Until
[raids and intelligence](sector-battle.md#raids-and-intelligence) exist, the AI knows the enemy garrison's true
strength; later it will know only what patrols and prisoners have told it. A human commander picks the stretch on the
planning map, with the AI's scores shown as advice.

### Who goes

- **The first wave** is every squad of the attacking side in its front line opposite the stretch, with 10 m to spare
  each side, that still has four men fit to go. It is worked out at zero hour, so squads that were wiped out, taken over
  or joined since the plan are counted as they stand then.
- **The player's squad** is put in the first wave: if it isn't opposite the stretch, it swaps men with the nearest squad
  that is, the same swap as [joining the battle](soldier-and-squad.md#joining-the-battle). The briefing says where.
- **The second wave** is the two reserve squads nearest the stretch. Three minutes after zero hour they leave the
  support line and make for the enemy's front line on the stretch, to help hold what the first wave took.
- **Everyone else holds** and fires on what they can see. The rest of the reserves stay back for the enemy's
  counter-attack.

### The fire plan on the stretch

The bombardments, the standing barrage and the creeping barrage cover the stretch and 20 m beyond each flank. They keep
the same weight of fire per metre of front as the [balance](balance.md#battle-matrix-built) runs set for the whole
sector, so a narrower attack uses fewer shells, not denser ones. The enemy's line either side of the stretch is not
shelled, so his men there can fire into the attack's flanks: smoke on the flanks is the answer once it's built.

### The defender's answer

The defender's counter-attack goes in where its line was lost: the commander finds the stretch held by the enemy (at
least eight of them, outnumbering what's left of the garrison three to one, over any 100 m), joins it to any lost line
next to it, shells it and sends the reserves nearest it in behind a barrage on that stretch alone. A whole-front attack
loses the whole line, and the whole line is counter-attacked, as before.

## Where the men assemble

Before zero hour the attacking squads gather in **jump-off positions**. Where and how is the operation's biggest risk.

### Jump-off positions

| Position                                   | What it is                                                                                                     | Holds                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| The front line                             | The ordinary fire trench, bays and fire step                                                                   | About 1 man per metre         |
| Assembly trenches (_parallèles de départ_) | Extra trenches dug in front of or behind the front line for an attack; the French dug them for every offensive | About 1 man per metre each    |
| Saps and Russian saps                      | Saps pushed toward the enemy; Russian saps are shallow tunnels whose roofs are broken open at zero hour        | A few squads, much closer     |
| Tapes in no man's land                     | Lines laid out by night, men lying along them before dawn                                                      | As many as fit, fully exposed |
| Support-line dugouts                       | For the later waves, safe until they move up                                                                   | The reserves                  |

So the size of an attack is limited by what can be dug in front of it: **massing more men means digging more assembly
trenches first**, an engineers' job over the days before (see [field works](field-works.md#trenches)). A big offensive
is visible on the enemy's air photographs well before it starts (see [artillery and air](artillery-and-air.md)).

### The assembly window

- Squads move into the jump-off positions during the **last 30 minutes** before zero hour, up the communication
  trenches. Congestion is real: a communication trench passes about one squad a minute.
- **Players who signed up deploy straight into their wave's jump-off trench** during the window: the operation's
  [deploy point](soldier-and-squad.md#losing-the-squad-and-coming-back).
- Men in the jump-off trenches are packed close. A shell there is a disaster.

### Counter-preparation

The defender's answer to an assembly is to shell it. The French called it _contre-préparation_ and fired it whenever
they suspected an attack. When the defender knows an attack is coming (a bombardment heard, assembly trenches spotted,
prisoners talking), its commander can fire on the enemy's jump-off positions and communication trenches in the last half
hour. It costs the defender shells on a guess; guessed right, it breaks the attack before it starts.

## What the defender sees

The defender isn't told the zero hour. They learn what a soldier of the time would:

| Sign                                      | Tells them                                                      | Can it be avoided?                                                                      |
| ----------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Wire-cutting and bombardment              | An attack is coming, roughly where                              | Only by not cutting wire: tanks (1917–18) or a short hurricane bombardment              |
| New assembly trenches on air photographs  | Where, and how big                                              | Dig at night, camouflage, or deny the air (see [air](artillery-and-air.md#the-air-war)) |
| Registration shots on new targets         | Batteries are laying on something new                           | Predicted fire, from 1917–18                                                            |
| Prisoners from raids                      | That an operation is planned, then its objective, then its hour | Keep raids out of your line                                                             |
| Men massing, seen from posts and balloons | Imminent                                                        | Assemble at night, in fog, behind smoke                                                 |
| Listening posts and miners' geophones     | Movement, galleries                                             | Silence                                                                                 |

This keeps surprise possible (a hurricane bombardment, a night attack, an attack in fog) at the cost of a weaker
preparation. That trade is the operation's central decision.

## Zero hour

The sequence, most of it built for the barrage attack:

1. **Final bombardment** on the objective; the standing barrage holds the garrison below (built).
2. **Mines** fire at zero minus 30 s.
3. **The whistle**: every squad in the first wave goes over; the creeping barrage opens 70 m beyond the most forward
   bays and the infantry follow 70 m behind it (built). Men gain morale from the whistle and the barrage ahead.
4. **The rush**: when the barrage lifts past the objective, attackers run for it (built), spending
   [stamina](morale-and-stamina.md#stamina-planned) they saved by walking.
5. **Later waves** follow at set intervals (2–5 minutes): the second wave to pass through, then the **_nettoyeurs de
   tranchées_**, the French trench cleaners who bomb out the dugouts the first wave passed over, then carrying parties
   with grenades, wire and sandbags.
6. **The protective barrage** holds beyond the objective (built) while the attackers consolidate.
7. **Signals**: green rockets to lift the barrage early, red for the SOS barrage; contact aircraft overhead see the
   attackers' flares and show the commander where his men are.

## After the assault

The operation ends when the objective is taken or the attackers are back in their own lines. Then:

- The [consolidation](sector-battle.md#consolidation) clock runs, faster where engineers work and a forward dump is up.
- The defender's counter-attack comes in: immediate (built: the commander AI shells the lost trench and sends its
  reserves in about five minutes later), or prepared within the half hour with fresh shells.
- The communiqué reports it at the next daily turn, with citations for the squads that did best.

## The playtest operation

The prototype's first goal, for the [playtest build](../roadmap.md#milestones): one scripted operation of under half an
hour that a player can win or lose. It reuses what's built (the bombardment, the barrage attack, the commander's
counter-attack, objectives, takeover) and adds a start, a clock and an end. The simulation runs it, so the balance
harness plays the same operation the player does.

**The plan**: the French attack a 200 m stretch of the German front line the commander chooses (see
[the frontage and who goes](#the-frontage-and-who-goes)), behind three bombardments and a creeping barrage on that
stretch. The player's squad goes in the first wave with the squads opposite it; two reserve squads follow as the second
wave; the rest of the line holds and fires in support.

| Clock | What happens                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------- |
| 0:00  | The battle runs. The briefing is done; the HUD counts down to zero hour.                                  |
| 1:30  | The bombardment opens: three two-minute bombardments of the German front line and its wire, back to back. |
| 8:00  | **Zero hour.** Whistles; the first wave goes over behind the creeping barrage.                            |
| 8–18  | The assault: into the German line and onto the objectives.                                                |
| 18–28 | The hold: the German counter-thrusts and counter-attack, about five minutes after the line falls.         |
| 28:00 | **The end.** The result is judged and the report shown.                                                   |

**The result**, judged at the end:

- **Taken**: the French hold the stretch of German front line they attacked, by the commander's own test of a lost line
  (at least eight men in it, outnumbering what's left of the garrison there three to one).
- **A footing**: the stretch isn't held, but the French are in it with at least four men, or hold an objective on it the
  Germans held at the start.
- **Repulsed**: neither. The operation ends early as repulsed once, from four minutes after zero hour, no French soldier
  has been beyond his own front line for a minute.

**The report** tallies, from the plan to the end: each side's killed, wounded and captured; the French losses by cause
(as the balance harness counts them, own shells apart); prisoners taken; objectives taken and when; German machine
gunners put down; the player's squad's losses and the enemy it shot or bombed down, whichever squads the player led.

**For the player** (built by the HUD and menus):

- **Briefing**, before the battle runs: the date and hour, the plan in three lines, the stretch on the sector map and
  the objectives on it, the player's squad in the first wave, zero hour eight minutes after going in, and what counts as
  taken.
- **In battle**: the countdown to zero hour, then to the end; a banner and whistles at zero hour; the objectives as they
  change hands.
- **The end**: the report with the result, and _Fight again_ or _Front door_.

The whistle (G) and bombardment (B) keys are for free play: during an operation the plan fires them. Free play stays for
development (`?free`, through `BattleSetup.free`).

The screens read `sim.operation`, mirrored from the worker like the rest of the state: `zeroHourAt` and `endsAt`
(steps), `bombardmentsFired`, `wentOver`, `result` and `endedAt` once it's over, and `tally`. The `zero-hour` and
`operation-over` events mark the two moments.

## The 1918 infiltration attack

German storm troop tactics are their own kind of operation and a real asymmetry for the 1918 season: a hurricane
bombardment of a few hours, gas on the batteries, then small groups with light machine guns, flamethrowers and grenades
pushing through the weak points and bypassing strongpoints for the following waves. In game terms: no wire-cutting
warning, assembly in fog where possible, and squads ordered to go around rather than through. The French answer was
defence in depth, with a lightly held front line; the game should let a well-prepared French sector absorb it the same
way.

## Balance levers

Planning window, operations per day, assembly window length, jump-off capacity per metre, counter-preparation cost, wave
intervals, the AI's scoring weights and threshold. The [balance harness](balance.md#test-harness) runs prepared and
unprepared operations on every map to keep the bands.
