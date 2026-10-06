# Sector editor

The tool for making sectors at scale: from the whole Verdun front down to a single trench bay. It runs in the browser on
the game's own renderer (`apps/client/editor.html`, served by the dev server only), so what it shows is what the game
draws. The sector file (a Tiled map, see [level design](../level-design.md#sector-files)) stays the one source of truth:
the editor reads and writes it, and Tiled can still open it.

What the user asked for, 2026-10-05: a real level editor (pick models from the library and place them, draw trenches of
different kinds, multilevel among them), the LiDAR and historical maps laid over the ground, the whole battlefield
rendered section by section with pre-war maps and the front lines and battles of chosen dates over it, sectors whose
size and place can be changed, and the editing UX level editors generally have.

## Two views

**Theatre**: the whole front, about 26 km by 22 km round Verdun.

- The ground from IGN's LiDAR HD, streamed in 1 km tiles, finer near the camera.
- Base maps draped over it, chosen from a list, streamed from IGN's map service through the dev server, which caches
  each tile (`.asset-cache/geo`): the Carte d'état-major (1820–1866) and Cassini for the country before the war, the
  SCAN 50 of 1950 and aerial photographs of 1950–65 and today, Plan IGN, and the LiDAR hillshade.
- Historical overlays chosen by date, our own data in the repository, each line citing its source: the front line on the
  battle's key dates (21 and 25 February, 7 and 23 June, 11 July, 24 October, 15 December 1916 and so on), battles and
  events as dated markers, and 1916 trench maps georeferenced from public-domain scans (see
  [historical maps](../historical-maps.md)).
- Places marked: the forts and ouvrages, the villages destroyed in the battle, Verdun, the roads.
- Each sector drawn where it lies, as a rectangle to move and resize; changing it fetches the sector's ground afresh.

**Sector**: one sector, generated and dressed as the game draws it, for editing.

## Editing, as level editors do it

- **Viewport**: right-button fly with WASD, middle-button pan, Alt-orbit, wheel to the cursor, F to frame (done).
- **Selection**: click, Shift or Ctrl to add and toggle, drag a box; the selection outlined in the viewport.
- **Outliner**: everything the file holds as a tree by layer (trenches, positions, objectives, woods, roads, railways,
  landmarks, placed models), each with its visibility and lock; selecting there selects in the viewport.
- **Inspector**: the selection's properties as a form, from the classes the reader takes its defaults from (the same
  table the Tiled project is made from), several objects edited at once where they share a property.
- **Gizmos**: move, rotate and scale (W, E, R), in world or local space, with snapping to a grid, to angles, to the
  ground, and for trenches to the trench kit's grid and right angles; points of a line dragged one by one.
- **Commands**: undo and redo (Ctrl+Z, Ctrl+Y) for every change, cut, copy, paste and duplicate (Ctrl+D), delete; save
  (Ctrl+S) writing the sector file through the dev server, with a mark while there are unsaved changes; the generator
  rebuilds what changed.
- **Asset browser**: the level kit's pieces with rendered thumbnails, searchable, dragged into the viewport to place
  them. Pieces from the asset library on E: come in through the asset pipeline first.
- **Trench tool**: click out a trench's course, the kit's rules shown as you draw, with its kind: fire, communication,
  sap, and kinds yet to come (shallow, breastwork, multilevel). A kind with a new profile changes what the simulation
  carves and sees, so it is agreed with Game mechanics and Character controller first.
- **Overlays**: the generated preview, what each side's lines and guns see, dead ground, the debus points' exposure.
- **Play**: open the game on the sector as it stands.

## Data the editor needs

- A sector's place: its south-west corner in Lambert-93 (EPSG:2154), now only in scripts/fetch-elevation.mjs.
- Placed models: a layer of kit pieces with position, heading, scale, and whether they block movement and sight.
- Trench kinds, once their profiles are agreed.
- Front lines and events by date: a data file of lines and points in Lambert-93, each with its date and source.
- The maps to trace them from: `packages/map/data/battle-map-library.json` lists the scans gathered, fetched into the
  asset library by `pnpm map:battle-maps` (one request at a time, a few seconds apart on each archive). French: the
  official history's 1916 maps (AFGG, Mémoire des hommes, Licence Ouverte), the 1917–18 plans directeurs at 1:20 000
  (Texas, Leventhal, Truman: public domain), dated sketch maps on Commons, and the Marne archives' cleaner plans
  directeurs, for reference only (their scans need a licence to trace for the game). German: the Bavarian Kriegsarchiv's
  Alpenkorps files (CC0) for Fleury, Thiaumont, Souville and Vaux in 1916. No 1916 plans directeurs are online; the
  Bundesarchiv's German position maps (PH 3-KART) aren't scanned and have to be ordered. Maps are fitted to the ground
  one by one into `battle-maps.json`. A map with the army's printed kilometre grid (Nord de Guerre) is fitted by it:
  `scripts/fit-battle-map-grid.py` traces every line, pins each crossing to its kilometre, fits only the old datum's
  offset (about 100 m) to a few forts, and the crossings are fitted `exact`, taking up the paper's folds.

## Order

1. Sector view with the survey and maps laid over (done), the editor camera (done).
2. Theatre view: the ground streamed, base maps, the sector outlined, places marked.
3. Historical overlays by date: front lines, events, georeferenced trench maps.
4. Editing: selection, outliner, inspector, gizmos, undo and redo, save.
5. Asset browser and placed models.
6. Trench tool and trench kinds.
7. Sectors placed and resized from the theatre; analysis overlays; play.
