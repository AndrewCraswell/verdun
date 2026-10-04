# Game vision

Working title: **Verdun** (codename only; see [open questions](open-questions.md) on naming).

A massively multiplayer WW1 trench warfare game in the browser. Hundreds of players on each side fight continuous
battles across sectors of the Verdun front. Each player commands a squad and fights as its soldiers. Front lines move
slowly over a season of several weeks until one side breaks.

How it's built is in the [architecture](architecture.md); what gets built when is in the [roadmap](roadmap.md).

## Core loop: the squad

- Each player owns a squad of 6–10 soldiers (exact size is an [open question](open-questions.md)).
- The player **directly controls one soldier** (WASD to move, mouse to aim and fire). The rest are run by AI following
  the player's last order: follow me, hold this trench, suppress that machine gun.
- **Switching** is instant. The soldier you leave returns to AI with the current order.
- **Death moves you to the next living soldier.** That is the respawn mechanic: losing men costs something real.
- **Squad wiped**: a new squad arrives from the rear trench after a delay, drawn from the side's reinforcement pool for
  that sector.
- **Logging off**: the squad withdraws to reserve or becomes a bot squad, so the battle continues.

## Battlefields

- The front is split into **sectors**. Each sector is **one continuous battle** running 24/7 for the whole season.
- **Bots fill every empty squad slot.** A sector with 15 humans still has hundreds of soldiers in it, and each side
  keeps a fair force at 4am.
- A **commander AI** per side per sector decides where bot squads attack and defend when no humans are leading.
- **Front line** = ownership of trench segments and grid cells. Capturing requires holding ground over time, so empty
  hours can't be farmed.
- Sectors report territory changes and casualties to the **war map**, which adjusts each sector's reinforcement pools
  and supply.
- The front line is **published daily**. A season lasts weeks, until one side loses.

## Warfare mechanics

- **Trenches**: fire trenches, support and reserve lines, communication trenches, saps, dugouts. Depth gives cover.
- **Line of sight and fog of war**: each soldier sees in a cone blocked by trench walls, crater rims and smoke. Inside a
  trench you see the trench; looking over the parapet shows no man's land but exposes you.
- **Artillery**: timed area barrages that dig craters into the terrain. After a week of shelling the sector becomes a
  moonscape, on its own.
- **Gas**: a density grid that spreads with the wind and settles into trenches and craters. Gas masks.
- **Combat**: rifle and machine-gun fire traced against terrain and cover, with accuracy falling with range, movement
  and suppression.
- **Morale and suppression** as the main stats, more than hit points.
- **Charges**: going over the top as a coordinated mass, across wire and craters.

## Presentation

- **3D rendering, top-down gameplay**: angled top-down camera (about 55–60° tilt) with zoom, like Company of Heroes. A
  close over-the-shoulder view may come later but isn't planned around.
- **Muted documentary realism**: see [art direction](assets/art-direction.md).
- **Sound** is half the experience: artillery, whistles, rifles, machine guns.

## Platform and constraints

- **Desktop browsers only.** Mobile would need different controls and UI; out of scope.
- **Fast load**: a link click should reach gameplay in under 10 seconds.
- **Solo developer.** Buy assets, use hosted services, keep infrastructure simple. Scale up only when players arrive.

## Closest references

- **Foxhole**: persistent weeks-long war, top-down, hundreds of players per region. Closest existing game; study its
  design write-ups. Our difference is the squad with rotating direct control.
- **Company of Heroes, Men of War / Gates of Hell**: squad-level control and direct-control modes.
- **Verdun, Isonzo, Tannenberg** (M2H/Blackmill): WW1 authenticity from research.
