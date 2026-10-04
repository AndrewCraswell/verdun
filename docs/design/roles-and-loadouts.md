# Roles and loadouts

The jobs inside a squad, the kinds of squad a player can lead, and the kit they carry, year by year. Part of the
[game design](overview.md). Today every squad is eight riflemen, with a machine gun in one squad in five.

## Principles

- **Squads, not classes.** A player leads a squad of a type, not a single soldier class. Switching between its men is
  how they use its roles: take the bomber for the trench, the gunner for the charge.
- **Kit follows the calendar.** What a squad carries comes from the year being fought. A 1915 bomber has a jam-tin bomb
  and a club; a 1918 storm troop group has light machine guns and stick grenades in sandbags.
- **Choices, not unlocks.** Every loadout is available to a player of the right rank from the start of the season (see
  [ranks](progression-and-community.md#ranks)); nothing is bought or ground for. A loadout trades one thing for another.
- **Caps keep the line honest.** Each sector limits special squads per side, so riflemen hold the line and special
  squads are prized.

## Roles within a squad

Each slot in a squad has a role. Bots fill them by the role's rules; the player takes any of them.

| Role                             | Carries                                                         | Job                                                                                 |
| -------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Leader (NCO, slot 1)             | Rifle or pistol, whistle, flare pistol, wire cutters            | Orders, [rally](morale-and-stamina.md#rally), morale aura, the whistle              |
| Rifleman                         | Rifle and bayonet, rounds, 3 grenades                           | Holds the fire step, shoots, goes over                                              |
| Bomber (_grenadier_)             | 12–20 grenades, pistol or rifle, a club or trench knife         | Clears trench bays and dugouts                                                      |
| Rifle grenadier                  | Rifle with a discharger cup (VB for the French), rifle grenades | Indirect fire into bays and shell holes to 180 m                                    |
| Automatic rifleman               | Chauchat (French, 1916–), MG 08/15 (German, 1917–)              | Fire while advancing; the attack's own machine gun                                  |
| Loader                           | Magazines or belts for the automatic rifle or machine gun       | Keeps the gun fed, takes it over if the gunner falls                                |
| Machine gunner                   | Hotchkiss or MG 08                                              | Holds a sector of fire; sweeps                                                      |
| Ammunition carrier               | Boxes of belts, strips or bombs                                 | Feeds the gun or mortar; runs back to the dump                                      |
| Sniper                           | Scoped rifle, periscope                                         | Kills careless heads at long range, from a hide                                     |
| Pioneer                          | Shovel, wire cutters, stakes and wire, charges                  | [Engineering](armour-and-engineering.md#engineering) and mining                     |
| Signaller                        | Field telephone, cable, lamp                                    | Links an observer to the batteries; repairs lines                                   |
| Stretcher bearer (_brancardier_) | Stretcher, field dressings                                      | Carries badly wounded men back; returns [manpower](logistics.md#reinforcements)     |
| Flamethrower operator            | Flamethrower                                                    | [Burns out](armour-and-engineering.md#flamethrowers) a bay; everyone's first target |
| Anti-tank rifleman               | Tankgewehr (German, 1918)                                       | Knocks out light tanks                                                              |
| Tank crew                        | The tank                                                        | Drives, fires, spots                                                                |

## Squad types

The player picks a type when the squad deploys. Each is eight men unless noted. "Cap" is how many a side may field per
ten squads in a sector.

| Type                              | Slots                                                                           | Cap                   | Years                                            |
| --------------------------------- | ------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| Rifle section                     | Leader, 6 riflemen, 1 bomber (from 1915) or rifle grenadier (from 1916)         | —                     | All                                              |
| Bombing section                   | Leader, 5 bombers, 2 riflemen as bayonet men                                    | 2                     | 1915–                                            |
| Fire team (_demi-section_, 1916–) | Leader, automatic rifleman, loader, 2 rifle grenadiers, 2 bombers, 1 rifleman   | 2                     | 1916– (French Chauchat), 1917– (German light MG) |
| Machine-gun team                  | Leader, gunner, loader, 3 ammunition carriers, 2 riflemen                       | 1                     | All                                              |
| Pioneer section                   | Leader, 6 pioneers, 1 rifleman                                                  | 1                     | All                                              |
| Mortar crew                       | Leader, 3 crew, 4 carriers                                                      | 1                     | 1915–                                            |
| Observer party                    | Leader as forward observer, 2 signallers, 2 riflemen (5 men)                    | 1 per sector          | All                                              |
| Stretcher party                   | Leader, 4 stretcher bearers, 3 riflemen                                         | 1                     | All                                              |
| Sniper pair                       | Sniper and observer (2 men)                                                     | 1                     | All                                              |
| Flamethrower team                 | Leader, 2 operators, 2 assistants, 3 bombers                                    | 1                     | 1915– (French), 1916– (German)                   |
| Storm troop group (_Stoßtrupp_)   | Leader, light machine gun and loader, 3 bombers, flamethrower operator, pioneer | 2                     | 1916– (German, rare until 1918)                  |
| Anti-tank team                    | Leader, 2 Tankgewehr teams of 2, 3 riflemen                                     | 1                     | 1918 (German)                                    |
| Tank section                      | 3 Renault FT, 2 crew each (6 men)                                               | See [armour](#armour) | 1918 (French)                                    |
| Tank crew                         | One Schneider (6) or Saint-Chamond (8), A7V or captured Mark IV                 | See [armour](#armour) | 1917– (French), 1918 (German)                    |
| Cavalry patrol                    | Leader, 7 troopers, mounted, carbines                                           | 2                     | 1914, late 1918                                  |
| Armoured car                      | One car, 3–4 crew                                                               | 1                     | 1914, late 1918                                  |

The observer party is the [forward observer](artillery-and-air.md#who-fires) role; the stretcher party carries the
[wounded](soldier-and-squad.md#wounds-and-evacuation-planned-stage-12) back.

### Armour

Tanks are allotted by the war map, not chosen freely: a sector gets a number of tanks for an operation, and players of
the right rank crew them; the rest are driven by bots. A tank lost is gone from the side's pool until replaced at a
daily turn. See [tanks](armour-and-engineering.md#tanks).

## Loadouts

Within its type, a squad picks a loadout before deploying. Each man has a **weight budget**; every item has a weight,
and weight feeds [stamina](morale-and-stamina.md#stamina-planned): a heavily loaded squad runs out of breath sooner.

| Option                          | Trades                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Extra grenades                  | Fewer rifle rounds; heavier                                                                                  |
| Extra rifle rounds (bandoliers) | Fewer grenades                                                                                               |
| Wire cutters for every man      | A grenade each                                                                                               |
| Shovels                         | Weight; dig in faster after an attack (faster consolidation in the open)                                     |
| Fighting order (light)          | Leave packs behind: more stamina, fewer rounds and grenades, no greatcoats in winter (morale drains in cold) |
| Assault order                   | Sandbags of grenades, wire cutters, shovels: heavy, built for taking and holding a trench                    |
| Gas: second mask or respirator  | Weight; safer in a long gas shoot (from 1917 against Blue and Yellow Cross)                                  |

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

Squad type caps, slot compositions, weight budgets and item weights, carried quantities (see
[ammunition on the man](logistics.md#ammunition-on-the-man-planned)), and each year's kit. The
[balance harness](balance.md#test-harness) runs each year's squads against each other so that no type and no year's kit
dominates.
