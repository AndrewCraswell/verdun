# Open questions

Decisions still to make. Move each to the relevant doc once decided.

## Product

- **Name.** "Verdun" is the title of an existing commercial WW1 game (M2H/Blackmill, 2015). Check trademarks before
  using it publicly; treat it as a codename until then.
- **The daily turn.** Proposed in [sector battle](design/sector-battle.md#consolidation): only ground held and
  consolidated for 30 minutes counts at the cutoff, the front moves at most one trench system per sector per day, and a
  10-minute stand-to at about 05:00 UTC applies the turn. Confirm the model and pick the hour from stage 2 telemetry.
- **Operations and zero hour.** Proposed in [sector battle](design/sector-battle.md#operations): planned attacks with a
  zero hour 30 minutes to 12 hours ahead, a fire plan from a daily shell budget, players signing up for waves, and at
  most three per side per sector per day.
- **Human sector commanders.** Stage 2 or later, and how a side chooses and removes them; the commander AI always stands
  in. See [the sector commander](design/sector-battle.md#the-sector-commander).
- **Moving battle window.** A front that moves for weeks walks off a 600 × 400 m map. Proposed: sectors as fixed strips
  several kilometres deep with only a 600–800 m window around the line loaded, re-centred at the daily turn. Needs an
  engineering spike on streaming terrain and persisting craters outside the window.
- **Side lock and population caps.** Proposed in [balance](design/balance.md#population): side locked per season (one
  switch allowed), equal forces per sector with humans replacing bots, and a human cap of the other side's humans ×
  1.5 + 20 per sector.
- **War-map allocation.** Proposed: the AI allocates, players steer it with a daily main-effort vote. Alternative: a
  player staff of senior ranks.
- **Prototype the day loop in stage 1?** Redeploy from a manpower pool is built; consolidation and a headless season
  harness need no networking either. See [suggested next steps](design/overview.md#suggested-next-steps).
- **Britain and the other Allies.** The war runs on the whole Western Front, but the sides are French and German. The
  British held the line from Ypres to the Somme, and the Americans fought in 1918. Leave their sectors out, show them
  only in the communiqué, or add them later as part of the Allied side? See
  [the years](design/war-map-and-season.md#the-years).
- **Playable aircraft.** Aircraft and balloons are AI and an air-superiority value per sector
  ([the air war](design/artillery-and-air.md#the-air-war)). Flying them would be a second game with its own controls,
  camera and scale. Leave it out, or add a pilot role after launch?
- **Version 1 scope.** Proposed in [version 1 scope](design/version-1.md): one season, 1916 on Verdun's right bank, with
  the other years as updates after release. Confirm, or pick a different first year.
- **Sector authoring at scale.** Every year adds sectors, each needing real terrain and laid-out trenches. Hand-building
  them won't scale for one developer: lay trenches automatically over IGN terrain, guided by historical trench maps, and
  hand-polish only key sectors? Needs a spike.
- **Readability.** A top-down view of a thousand soldiers in drab uniforms: telling the player's squad, friendly bots
  and the enemy apart at a glance, and showing morale, stamina and orders without clutter. A design pass before the art
  goes further.
- **Colonial troops.** The French army at Verdun included Moroccan, Senegalese and Algerian regiments (the Régiment
  d'infanterie coloniale du Maroc retook Douaumont in October 1916). How to represent them accurately and respectfully,
  rather than leave them out.
- **Business model.** One-off purchase, free with cosmetics, or subscription. Whatever it is, nothing sold may change a
  soldier's fighting strength ([progression](design/progression-and-community.md#rewards-that-last-beyond-a-season)).
- **Squad size.** 6, 8 or 10 soldiers ([vision](vision.md#core-loop-the-squad) says 6–10; the prototype uses 8). Affects
  bot count and server budget.

## Technical

- **UI library for menus, HUD and war map.** No Fluent UI. The HUD and the first menus (front door, options, controls,
  war map) are plain DOM and CSS on the HUD's tokens, with no library, which has been enough so far. Revisit
  **shadcn/ui** (Radix + Tailwind) or Mantine when stage 3's screens (communiqué, service record, regiment) need tables,
  forms and dialogs in quantity.
- **Terrain resolution.** 0.5 m cells for the simulation is the working assumption
  ([architecture](architecture.md#world)); confirm with line-of-sight and crater tests.
- **Map authoring.** Tiled first, in-game editor later ([editor plan](tooling.md#editor-plan)). Confirm Tiled polylines
  are good enough for trench layout.

## Assets

- **Synty German helmet.** Check whether War Map WWI's German helmet reads as a 1916 Stahlhelm at gameplay zoom, or
  needs reshaping in Blender.
- **Version 1 animations.** Retargeted polyperfect clips cover locomotion, idles, deaths, hit reactions and machine-gun
  aim, fire and reload. Still missing: going prone, crawling, climbing out of trenches, bolt-action reloads and grenade
  throws. Mixamo, or Synty's ANIMATION packs?
- **Remaster (after version 1):** commission or not (decided by the asset comparison test in the
  [roadmap](roadmap.md#after-version-1-art-remaster)); which WW1 motions to capture with Uthana; whether an AmeliaTeale
  German helmet is a 1916 Stahlhelm, otherwise use the Davicolt M16.

## Legal (before commercial launch)

- Lawyer review of Fab's "object code" clause for web delivery and of our asset protection measures. See
  [licensing](assets/licensing.md).
