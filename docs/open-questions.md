# Open questions

Decisions still to make. Move each to the relevant doc once decided.

## Product

- **Name.** "Verdun" is the title of an existing commercial WW1 game (M2H/Blackmill, 2015). Check trademarks before
  using it publicly; treat it as a codename until then.
- **Season length and win condition.** How many weeks; what "one side loses" means on the war map. Proposed in
  [war map and season](design/war-map-and-season.md#victory-the-balance): six weeks, one daily turn per week of 1916,
  won on a tug-of-war Balance fed by key points, ground, losses and operations, or by the Germans taking Verdun.
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
- **Prototype the day loop in stage 1?** Redeploy from a manpower pool, consolidation and a headless season harness need
  no networking. See [suggested next steps](design/overview.md#suggested-next-steps).
- **Business model.** One-off purchase, free with cosmetics, or subscription. Whatever it is, nothing sold may change a
  soldier's fighting strength ([progression](design/progression-and-community.md#rewards-that-last-beyond-a-season)).
- **Squad size.** 6, 8 or 10 soldiers ([vision](vision.md#core-loop-the-squad) says 6–10; the prototype uses 8). Affects
  bot count and server budget.

## Technical

- **Historical weather.** The weather cycles through seasonal patterns from a seed. The weather of 1914–1918 can be
  rebuilt 3-hourly from the 20th Century Reanalysis corrected by Météo-France station records, both licensed for
  commercial use ([research notes](research/notes/weather/historical_weather_1916.md)). Cut over by adding a `records`
  forecast kind fed by a generated table; nothing else in the simulation changes
  ([time and weather](time-and-weather.md#historical-weather)). Decide when it's worth the pipeline.
- **UI library for menus, HUD and war map.** No Fluent UI. Leaning **shadcn/ui** (Radix + Tailwind): we own the
  component source, so it can be restyled to the period art direction instead of looking like a web app. Mantine is the
  faster, batteries-included alternative. The in-game HUD itself should stay custom and minimal. Decide when the first
  HUD lands (M2–M3); nothing is installed until then.
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
