# Roles and loadouts

The jobs inside a squad, the kinds of squad a player can lead, and the kit they carry, year by year. Part of the
[game design](overview.md). Today every squad is eight riflemen, with a machine gun in one squad in five.

## Principles

- **Few roles, many kits.** Five roles cover every man a player controls. Specialisms (rifle grenadier, sniper, forward
  observer, anti-tank rifleman, flamethrower) are kit a role carries, not roles of their own.
- **Four kinds of squad.** A player leads a rifle, assault, support weapon or engineer squad. Everything else is a
  loadout of one of those, or a vehicle in the years it fought.
- **The AI runs the services.** Stretcher bearers, carrying parties, linesmen, gun crews and the air war are worked by
  bots for the whole side (see [AI services](#ai-services)). Players fight and dig; they never have to haul or carry
  stretchers to keep the front going.
- **Switching is how roles are used.** Take the bomber for the trench, the gunner for the charge, the engineer for the
  night's digging.
- **Kit follows the calendar**, and every loadout is open to a player of the right rank from the start of the season;
  nothing is bought or ground for (see [ranks](progression-and-community.md#ranks)).
- **Caps keep the line honest.** Each sector limits special squads per side, so riflemen hold the line.

## Roles

| Role                               | Does                                                                                            | Kit variants                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Leader** (the NCO, slot 1)       | Orders, the whistle, flares, [rally](morale-and-stamina.md#rally); steadies the men near him    | Forward observer: a field telephone and calls for fire beyond the personal ration (from Adjudant or Feldwebel rank) |
| **Rifleman**                       | Holds the fire step, shoots, goes over                                                          | Sniper: scoped rifle and periscope                                                                                  |
| **Bomber** (_grenadier_)           | Clears bays and dugouts with grenades                                                           | Rifle grenadier: VB discharger, to 180 m (from 1916)                                                                |
| **Gunner**                         | Works the squad's heavy weapon; the next man on it takes over if he falls                       | Machine gun, automatic rifle (Chauchat 1916–, MG 08/15 1917–), trench mortar (1915–), anti-tank rifle (German 1918) |
| **Engineer** (_sapeur_, _Pionier_) | Digs, builds, repairs, lays and cuts wire, demolishes, mines: the [field works](field-works.md) | Flamethrower (French 1915–, German 1916–)                                                                           |

Every man can scrape into the ground and repair a trench with his entrenching tool at a quarter of an engineer's rate,
or half with a shovel in his loadout. Engineers build properly.

Vehicles are crewed, not roled: a tank or armoured car squad's men are its crew (see [armour](armour.md)).

## Squad types

The player picks a type when the squad deploys. Each is eight men. "Cap" is how many a side may field per ten squads in
a sector.

| Type                    | Men                                                                                                                          | Cap | Years               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --- | ------------------- |
| **Rifle section**       | Leader, 6 riflemen, 1 bomber                                                                                                 | —   | All                 |
| **Assault section**     | Leader, 4 bombers, 1 gunner with an automatic rifle (from 1916–17), 2 riflemen                                               | 2   | 1915–               |
| **Support weapon team** | Leader, gunner, 6 riflemen who feed and carry for the weapon; one machine gun, trench mortar, or (1918) two anti-tank rifles | 2   | All (mortars 1915–) |
| **Engineer section**    | Leader, 6 engineers, 1 rifleman                                                                                              | 2   | All                 |

The familiar specialist squads are loadouts of these four:

| Specialist squad                | Is                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Bombing section                 | An assault section with every slot on grenades                                     |
| Fire team (_demi-section_)      | An assault section built round its Chauchat and rifle grenadiers                   |
| Storm troop group (_Stoßtrupp_) | An assault section in German 1918 kit, with a light machine gun and a flamethrower |
| Flamethrower team               | An engineer section with two flamethrowers                                         |
| Observer party                  | Any squad whose leader carries the forward observer's kit                          |
| Sniper pair                     | Two riflemen with sniper kit, sent out from any squad on a "sniper" order          |

Mounted and armoured squads, for the years they fought:

| Type               | Men                                                                                                             | Years                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Cavalry patrol** | Leader and 7 troopers, mounted, with carbines; fight dismounted                                                 | 1914, late 1918               |
| **Armoured car**   | One car, 3–4 crew; roads and firm ground only                                                                   | 1914, late 1918               |
| **Tank**           | A section of 3 Renault FT (2 crew each), or one Schneider, Saint-Chamond, A7V or captured Mark IV with its crew | 1917– (French), 1918 (German) |

Tanks are allotted by the war map, not chosen freely: a sector gets a number for an operation, players of the right rank
crew them, and bots drive the rest. A tank lost is gone from the side's pool until replaced at a daily turn.

## AI services

The jobs that keep a sector running but aren't fun to play are done by bots for the whole side. Players see them at work
and benefit from them, and what they do makes the services better or worse, but they never have to do them:

| Service              | What the bots do                                                                                        | What players influence                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Stretcher bearers    | Go out to badly wounded men, carry them to the aid post, return [manpower](logistics.md#reinforcements) | Holding ground so they can reach the wounded; a squad can still carry its own man back |
| Carrying parties     | Bring ammunition, grenades and stores from main dumps to forward dumps                                  | Where the commander puts dumps; keeping communication trenches open                    |
| Linesmen and runners | Repair cut telephone lines, carry messages when lines are down                                          | Shelling the enemy's lines; where posts are                                            |
| Working parties      | Repair trenches and relay wire at night from the support and reserve lines                              | Engineers' planned works come first; players can join                                  |
| Gun crews            | Serve the batteries                                                                                     | Calls for fire, fire plans, counter-battery                                            |
| The air war          | Balloons, reconnaissance, spotting, ground attack                                                       | Anti-aircraft fire; the main effort vote                                               |

## Loadouts

Within its type, a squad picks a loadout before deploying. Each man has a **weight budget**; every item has a weight,
and weight feeds [stamina](morale-and-stamina.md#stamina-planned): a heavily loaded squad runs out of breath sooner.

| Option                          | Trades                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Extra grenades                  | Fewer rifle rounds; heavier                                                                                                       |
| Extra rifle rounds (bandoliers) | Fewer grenades                                                                                                                    |
| Wire cutters for every man      | A grenade each                                                                                                                    |
| Shovels                         | Weight; every man digs at half an engineer's rate instead of a quarter (see [field works](field-works.md#who-works-and-how-fast)) |
| Fighting order (light)          | Leave packs behind: more stamina, fewer rounds and grenades, no greatcoats in winter (morale drains in cold)                      |
| Assault order                   | Sandbags of grenades, wire cutters, shovels: heavy, built for taking and holding a trench                                         |
| Gas: second mask or respirator  | Weight; safer in a long gas shoot (from 1917 against Blue and Yellow Cross)                                                       |

Presets per squad type cover the common choices; the player can adjust slot by slot.

## Kit by year

Uniform and kit change what the soldiers look like and, in small ways, how they fight.

| Year | French                                                                                               | German                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1914 | Blue coats and red trousers, kepi; Lebel rifle; Hotchkiss MGs; no grenades to speak of               | Field grey, _Pickelhaube_; Gewehr 98; MG 08; some grenades                     |
| 1915 | Horizon blue from spring; Adrian helmet from September; improvised then F1 grenades; first gas masks | Ball and disc grenades, then the stick grenade; first gas masks; flamethrowers |
| 1916 | Adrian helmet for all; Chauchat; VB rifle grenades; better masks (M2)                                | Stahlhelm from February at Verdun; Green Cross gas; storm troop battalions     |
| 1917 | Schneider and Saint-Chamond tanks; ARS mask late in the year                                         | MG 08/15 light MG; K bullets; Blue and Yellow Cross gas                        |
| 1918 | Renault FT; Americans alongside in the Argonne                                                       | Storm troop tactics everywhere; Tankgewehr; A7V and captured tanks             |

Effects in play: helmets reduce head wounds from shrapnel and fragments (fewer killed, more wounded, from 1915–16);
better masks cut gas leakage; red trousers make a 1914 Frenchman easier to see at range.

## Balance levers

Squad type caps, slot compositions, the AI services' strength, weight budgets and item weights, carried quantities (see
[ammunition on the man](logistics.md#ammunition-on-the-man-planned)), and each year's kit. The
[balance harness](balance.md#test-harness) runs each year's squads against each other so that no type and no year's kit
dominates.
