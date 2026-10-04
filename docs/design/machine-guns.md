# Machine guns

The weapon that defined the Western Front, and the tactical problem every attack has to solve. Part of the
[game design](overview.md).

**The goal:** a machine gun with a clear field of fire makes open ground impassable, so attackers have to find it, blind
it, keep its crew down, flank it or destroy it before they can cross. Knocking out a gun should be one of the most
satisfying things a squad does.

## How it is today

Built in [combat.ts](../../packages/sim/src/combat.ts): a Hotchkiss or MG 08 fires a round every 0.15 s (400 rounds a
minute), hits with 0.1 at point blank falling by a factor of e every 220 m, engages men lying in the open at any range
(grazing fire), and its misses can hit the nearest other man in a beaten zone 3 m wide. Crews climb out of their dugouts
in 3–8 s, faster than riflemen. In the skirmish the last man of every fifth squad carries one: 7 guns a side.

Measured with the [balance harness](balance.md#battle-matrix-built), machine guns cause only **2–8% of attackers'
losses** in every scenario, including infantry advancing with no artillery at all; rifles cause 50–70%. Sampling every
German gunner through an infantry-only attack showed where the guns' time goes:

| A gun's time in an infantry-only attack                               | Share |
| --------------------------------------------------------------------- | ----- |
| In its dugout, sent down by its own side's SOS barrage landing nearby | 36%   |
| Enemies in range, none in sight (craters, folds of ground, smoke)     | 19%   |
| Crew out of the fight                                                 | 18%   |
| Idle with standing enemies in plain sight                             | 15%   |
| Firing                                                                | 10%   |
| Pinned                                                                | 2%    |

When it does fire, a gun hits with about 1% of its rounds. Its own fire pins its target, the target goes flat, a flat
man is 30% as easy to hit, and the gun keeps firing at him instead of traversing to the next man standing. It picks
targets only among the 6 nearest enemies, often men hidden in shell holes.

## Numbers are not the problem

By mid-1916 a German battalion had its own machine-gun company of about six heavy guns and held roughly a kilometre of
front; the French gave each battalion a company of about eight. The skirmish's 7 guns on each side's 600 m match or
exceed that per metre of front. What made real guns deadly was how they were used:

- **Siting**: guns were placed to fire along the front of the wire (enfilade), not straight out, so a line of attackers
  crossed the whole beaten zone. Wire was laid to funnel attackers into gaps the guns covered.
- **The beaten zone**: a gun's cone of fire lays a long strip of ground under fire, 50–100 m long at 500 m. Every man in
  it is at risk, not only the one aimed at.
- **Volume**: once an attack came, a water-cooled MG 08 could fire belt after belt for as long as its crew lived and its
  water lasted.
- **Fixed lines**: at night guns were laid on fixed lines along the wire and fired blind at any alarm.

## Design

### What a gun does

| Rule                  | Design                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target choice         | Prefers men standing or moving in the open over men lying down; traverses to the next standing man when its target drops                                            |
| Grazing fire          | Men lying flat on open ground are only half as safe from a gun as from a rifle; shell holes, trenches and folds of ground still protect                             |
| Beaten zone           | Misses fall along a strip that lengthens with range, endangering the men in it                                                                                      |
| Field of fire         | Each emplacement has an arc; guns sited to fire along the wire cover its gaps                                                                                       |
| Fixed lines           | At night, a gun fires along its fixed line when a flare goes up or the sentry raises the alarm, without needing to see                                              |
| Crew                  | The gunner, a loader and carriers; when the gunner falls the loader takes over after a few seconds; with the crew gone the gun is silent until someone else mans it |
| Ammunition            | Belts or strips carried by the crew, resupplied from dumps (see [logistics](logistics.md#machine-guns))                                                             |
| Under its own barrage | Crews stay on the gun under their own side's SOS barrage; under the enemy's shells they go below like everyone else and race back up when it lifts                  |

### Finding the gun

A gun gives itself away when it fires: the noise, and at night the muzzle flash. Every enemy soldier who hears or sees
it marks it, and a **spotted gun** shows on the side's map for a while after it last fired. That is what turns a gun
into a target players can plan around.

### Knocking it out

Every answer the war found should work, each with a cost:

| Answer                            | How it works                                                                           | Cost                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| The barrage                       | A creeping and standing barrage keeps the crew below until the infantry arrive (built) | Shells, and the race to the parapet when it lifts     |
| A call for fire on a spotted gun  | An observer who can see it brings a battery down on it                                 | The observer's exposure, the delay, a personal ration |
| Trench mortars and rifle grenades | Indirect fire into the nest from cover, at 50–180 m                                    | Getting close enough; the crew's ammunition           |
| Bombers working along the trench  | Clear the bays toward the gun from a flank                                             | Getting into the trench first                         |
| Dead ground                       | Approach where the gun can't see, as the Ravin de la Dame is laid out to allow         | Finding it; the gun sited to cover it                 |
| Smoke                             | Blind the gun for a crossing                                                           | Shells, and wind                                      |
| Snipers                           | Kill the gunner, then the loader                                                       | Time; the gun's revenge                               |
| Night                             | Darkness hides men from aimed fire, but not from fixed lines                           | Flares                                                |
| Tanks (1917–18)                   | Bullets don't stop them                                                                | See [armour](armour.md)                               |

### Balance targets

Measured by the harness:

| Scenario                             | Target                                                               |
| ------------------------------------ | -------------------------------------------------------------------- |
| Infantry advancing with no artillery | Machine guns cause 40–60% of the attackers' losses; the attack fails |
| Barrage attacks                      | Machine guns cause 15–30%: the barrage's job is to keep them down    |
| Rifles                               | Never more than half of any attack's losses                          |

## Experiments

Each change applied alone or in combination to a clean copy of the code, measured with the balance harness (Fleury,
French attacking, five seeds). Shares are of the attackers' losses.

**Round 1** (`b96de98`), one lever at a time:

| Change                                                | Infantry-only: guns | Three bombardments: held, losses |
| ----------------------------------------------------- | ------------------- | -------------------------------- |
| None (today)                                          | 5%                  | 4 of 5, 58%                      |
| Target choice: 24 nearest, prefer men standing        | 9%                  | 5 of 5, 53%                      |
| Grazing fire: prone in the open 0.6 against guns      | 7%                  | 4 of 5, 61%                      |
| Wider beaten zone                                     | 6%                  | 4 of 5, 60%                      |
| Gun crews stay up under their own side's shells       | 6%                  | 3 of 5, 60%                      |
| One gun in every third squad instead of every fifth   | 14%                 | 2 of 5, 68%                      |
| Rifle accuracy falling off over 70 m instead of 100 m | 6%                  | 4 of 5, 61%                      |

No single lever comes close, and weakening rifles at range does nothing: defenders' rifles hit 7–10% per shot at 25–100
m, where the fighting happens, against a gun's 2% a round. A firing gun is worth only four or five riflemen;
contemporary rules of thumb put it at 60–80.

**Round 2** (`42a5c37`), lethality and rifles together:

| Change                                                          | Infantry-only: guns / rifles | Barrage only: guns / rifles | Three bombardments: held, losses, guns |
| --------------------------------------------------------------- | ---------------------------- | --------------------------- | -------------------------------------- |
| Gun accuracy 0.25, rifle 0.25                                   | 15% / 58%                    | 20% / 46%                   | 5 of 5, 55%, 15%                       |
| The same, with target choice, grazing fire and crews staying up | 27% / 38%                    | 32% / 34%                   | 4 of 5, 68%, 37%                       |
| **Gun accuracy 0.35, rifle 0.20, with the same three**          | **42% / 28%**                | **40% / 27%**               | **4 of 5, 61%, 36%**                   |
| Gun accuracy 0.35, rifle 0.25, with the same three              | 36% / 35%                    | 27% / 38%                   | 4 of 5, 61%, 32%                       |

The bold combination puts guns inside their target for infantry-only attacks and halves the rifles' share, and every
unprepared attack still fails. Prepared attacks still win four times in five, slightly bloodier than the band, with guns
causing more of the losses than the barrage-attack target. Faster soldiers, which the gameplay session is adding, should
bring both down by shortening the time attackers spend in the open. The gameplay session owns the combat code and is
tuning from this starting point.

Not yet tried: a crew that takes over the gun when the gunner falls (18% of a gun's time is lost to a dead crew), fixed
lines at night, fields of fire from emplacements, and spotted guns on the map.
