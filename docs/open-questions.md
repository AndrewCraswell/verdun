# Open questions

Decisions still to make. Move each to the relevant doc once decided.

## Product

- **Name.** "Verdun" is the title of an existing commercial WW1 game (M2H/Blackmill, 2015). Check trademarks before
  using it publicly; treat it as a codename until then.
- **Season length and win condition.** How many weeks; what "one side loses" means on the war map.
- **Squad size.** 6, 8 or 10 soldiers ([vision](vision.md#core-loop-the-squad) says 6–10; the prototype uses 8). Affects
  bot count and server budget.

## Technical

- **UI library for menus, HUD and war map.** No Fluent UI. Leaning **shadcn/ui** (Radix + Tailwind): we own the
  component source, so it can be restyled to the period art direction instead of looking like a web app. Mantine is the
  faster, batteries-included alternative. The in-game HUD itself should stay custom and minimal. Decide when the first
  HUD lands (M2–M3); nothing is installed until then.
- **Terrain resolution.** 0.5 m cells for the simulation is the working assumption
  ([architecture](architecture.md#world)); confirm with line-of-sight and crater tests.
- **Map authoring.** Tiled first, in-game editor later ([editor plan](tooling.md#editor-plan)). Confirm Tiled polylines
  are good enough for trench layout.

## Assets

- **Commission or not.** Decided by the asset comparison test (M8) in the [roadmap](roadmap.md#milestones).
- **Animation capture.** Which WW1 motions to capture with Uthana, and who acts them.
- **AmeliaTeale German helmets.** Confirm one is a 1916 Stahlhelm; otherwise use the Davicolt M16.

## Legal (before commercial launch)

- Lawyer review of Fab's "object code" clause for web delivery and of our asset protection measures. See
  [licensing](assets/licensing.md).
