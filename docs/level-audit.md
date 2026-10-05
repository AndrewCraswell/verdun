# Level audit: Fleury, October 2026

An audit of the Fleury sector against a AAA bar, from a placement analysis of the generated map and a camera tour of the
running game (close up, at gameplay zoom, and zoomed out), followed by the overhaul it calls for. Findings are in order
of how much they cost the picture.

## Findings

### The world ends at the table's edge

Zoomed out, the sector is a 600 m × 400 m slab floating in grey: the terrain stops in a cliff at every edge, and the
village's eastern houses stand on the brink. Nothing tells the eye that the battlefield goes on to the horizon.

### Things don't sit in the ground

Nothing is sculpted into the terrain; every building and emplacement stands on the raw survey and the shell holes
stamped into it.

| Scenery      | Placed | Ground under it more than a quarter of its radius uneven | Worst relief |
| ------------ | -----: | -------------------------------------------------------: | -----------: |
| Ruins        |     26 |                                                       11 |        3.1 m |
| Machine guns |      7 |                                                        7 |        1.8 m |
| Field guns   |      7 |                                                        5 |        1.0 m |
| Walls        |     16 |                                                       10 |        1.9 m |
| Stores       |     18 |                                                        8 |        1.6 m |

Ruins' floors are pierced by humps of ground and their walls sink into slopes on one side and stand on air on the other;
guns stand on the open ground instead of in pits; machine guns perch on the spoil. 28 of 473 wire fence pieces hang over
hollows more than 0.8 m deep.

### Craters look stamped

Every shell hole is the same clean bowl with a crisp circular rim. The big mine crater's walls are near vertical, and
the terrain's fixed triangle diagonal turns them into a saw-toothed staircase; steep walls stripe with the sideways
texture lookup. Real Verdun craters overlap, slump and erode, and most hold water.

### The ground is one colour

No man's land at gameplay zoom is uniform brown: no wet crater bottoms, no lighter dry crests, few pools. Chalk crater
rims are the one accent, and they glare like snow. Crater bowls and the bases of walls lack contact darkening, so relief
reads only where the sun's shadow falls.

### The village is a row of dollhouses

The cutaway house ruins show clean, bright interior walls in identical rows; nothing marks the streets, plots or
foundations; ruins meet the ground with a hard line.

### No man's land and the woods are empty

Between the craters there is nothing: no debris, kit, timber, iron, screw pickets or tracks. The woods are one dead-tree
model at even spacing on bare ground, with pale, clean logs.

### Parapets are pillows

Close up, the spoil lips beside the trenches are smooth, bulbous mounds; only half the bays carry sandbags.

### Smaller things

- The depth of field focused on the camera the level was created with, not the one drawing (fixed).
- Lighting reads murky in overcast; that belongs to the weather session's daylight model.

## Overhaul

In order, each verified in the browser and committed on its own:

1. **Sculpt the ground for what stands on it** (map generator, so sight and movement agree with the art): pads under
   ruins, the landmark, stores and wrecks blended into the slope; gun pits with spoil berms; machine-gun scrapes; earth
   banked against bunkers; limestone rubble aprons round the ruins; the village kept off the map's edges; wire fences
   broken where they would span a deep hollow.
2. **Craters that look shelled**: overlapping, slumped, eroded profiles with ragged ejecta, a slope limit so no wall
   stands vertical, and triangles split along the shorter diagonal so steep ground doesn't staircase.
3. **The ground's colour and depth**: cavity occlusion baked into the terrain (crater bowls darker, crests lighter),
   contact darkening round everything standing, wet crater bottoms, more pools, and chalk toned down to scattered,
   muddied spatter.
4. **The world beyond the sector**: the real ground round Fleury to the horizon, from IGN's survey at a coarser grid,
   fading into haze, so the battlefield sits in a landscape instead of on a table.
5. **Ruins**: composed from parts (walls, chimney stacks, fallen beams, roof tiles, hearths, cellars), dirtied, varied,
   and seated on their plots.
6. **Dressing**: debris across no man's land and in the woods, tree variety (shattered, leaning, fallen), parapets
   broken up with sandbags, timber and spoil.

## Progress

- **Done**: the ground worked for what stands on it (1); shelled craters, slumping and the better triangle split (2);
  cavity and contact shading, greyer chalk (3); the world beyond the sector, with its woods (4); and the shell bursts
  rebuilt (see [level design](level-design.md#shellfire)), which the audit hadn't covered.
- **Done since**: ruins composed from parts, most razed to a chimney stack over mounds of rubble (5); the litter of
  battle across no man's land, woods stripped and felled by the shelling with deadwood under them, and parapets broken
  up with sandbag courses, breaches and the clutter of a lived-in line (6).
- **Performance**: the 14,500 props are drawn as about 700 thin-instance batches instead of one mesh each, which cut the
  time Babylon spends choosing visible meshes from about 20 ms a frame to under 3 ms (see
  [level design](level-design.md#level-kit)). Then, with the game measured as GPU-bound: shadow casters culled to each
  cascade and the backdrop kept out of the shadows (twelve million shadow triangles a frame to under three), and the
  backdrop's woods thinned with distance and cut into cells (3.8 million of the frame's 6.3 million triangles to 0.87
  million, the scene pass from about 35 ms to 17 ms at 1080p on an integrated GPU).
- **Performance, the ground's pixels**: the ground's shader fetched all four layers three ways, and their normal maps,
  on every pixel; it now looks up only the layers present there, and sideways only on steep ground. On a quiet machine
  (Radeon 860M, 1080p, `pnpm perf`), day went from 27 to 32–36 fps and the GPU frame from 33–34 ms to 23–28 ms; the low
  graphics setting saves about 5 ms more by drawing one sample with FXAA. What's left in the 24–26 ms GPU frame, by
  switching each part off: the ground about 8 ms, shadow receiving about 4 ms (not its filtering: low or no PCF saves
  nothing), the depth of field 3 ms, bloom 2 ms, grain 1 ms, the soldiers 1.5 ms; the far woods, the trench kit and
  particles are lost in the noise. A 0.75 render scale saves about 5.5 ms; the game keeps 1.0. KTX2 ground textures (BC7
  on the GPU) were tried and measured no faster, the ground's fetches mostly hitting the cache: they're kept on the
  branch `perf/ktx2-ground` in case GPU memory, 33 MB of it, becomes the limit. Babylon's own work on the page (drawing,
  render targets, choosing meshes: about 16 ms) is next once the GPU drops much further.
- **Performance, an audit**: eight agents read the client and the simulation for waste, two reviewers tried to refute
  each of their 94 findings, and the 27 left became work packages (the rendering ones landed together on 5 October
  2026). On WebGPU Babylon passes every shadow-receiving pixel four cascades' positions for the sun's two (fixed in
  `render/cascade-varyings.ts`, about 2-3 ms). Measured in one page, each against the battle as it was
  (`pnpm perf --ab`, the median of paired 20th percentiles of GPU time): the squad's markers no longer clearing depth
  mid-frame, which split the multisampled pass, 1.3 ms; the soldiers left out of the shadow cascade nearest the camera
  when their shadows can't reach it, 0.8 ms; idle particle systems paused, 0.6 ms; the depth of field's depth map drawn
  only when the view or the ground changes, up to 0.4 ms. The low setting's lighter depth of field, without grain, with
  the rest measured 3.4 ms faster on Low. Others remove hitches or bugs a quiet battle doesn't show: craters rebuilt a
  chunk a frame nearest the camera, in place; puddle basins in kept buffers, and not at all on Low; idle effect meshes
  no longer drawn at the sector's corner; the sun's shadows off in the overview; soldiers skinned from only the bones
  they use. With the machine quiet, the close view then ran at 51 fps, 17.6 ms of GPU a frame. Hand-offs to the
  simulation and the HUD (worker round trips, cached soldier lists, the aimed target worked out once a step) went to
  their owners.
- **Performance, the night and the pipeline's targets**: by night every flare that tinted the fog moved the grade's
  exposure, and Babylon had every material walk every mesh to mark it for checking again: an exposure change each frame
  cost 27.4 ms of the page's time (`pnpm perf --ab`, paired, on a loaded machine), and nights ran at 15-16 fps. The
  materials now keep image processing settings of their own (`render/material-grade.ts`): 0.0 ms, and 23-28 fps on the
  same nights. The bloom's first pass had kept the four samples Babylon gave it while it was the pipeline's first, a
  second multisampled target of 63 MB written and resolved every frame on High for an identical picture: without it, day
  frames 1.0 ms faster, a barrage 0.6 ms, the picture identical to the bit (so the earlier 'bloom 2 ms' included it).
  Drawing the scene in 11-11-10 floats instead of half floats measured 1.5-2.2 ms faster on High, but the Radeon 860M
  truncates rather than rounds as it writes and blends the format: twelve thin layers of mist left blue at 0.31 rather
  than 0.37, a visible darkening and tint. It's kept on the branch `perf/rg11b10`, for GPUs that round.
- **Performance, the page's share**: by day the main thread now sets the frame by a few milliseconds, and under fire by
  6-8 ms; at night the GPU does. Encoding the GPU's commands is only about 3 ms of the page's 20; Babylon working
  through the scene (choosing meshes, the shadow casters, materials' checks and binding, sorting) is about 16 ms, and a
  barrage's particles add about 4 ms. Keeping each draw as a render bundle (Babylon's non-compatibility mode, on the
  branch `perf/bundles`) saved 0.6 ms of the page's time by day and none under fire, and cost the GPU 0.6-0.9 ms: not
  kept. With bundles on, `pnpm perf`'s draw count would see only the bundles, not the draws in them. Switching the sun's
  shadows off saves 148 draws and 4.6 ms of GPU a frame by day, the costliest single part after the scene itself.
  `pnpm perf --budget` now holds what each scenario draws to `scripts/perf-budget.json`, recorded on 5 October 2026.
- **Performance, shadow casters out of sight**: a shadow pass drew everything in its light's view, and the sun's far
  cascade's view and a flare's light (149 degrees, some 280 m) take in far more than the camera's: ground, trees and
  sandbags shading ground nobody sees, the ground alone 41 draws in the far cascade and 59 under a flare. The passes now
  leave out a caster whose shadow, swept from its bounds down to the map's lowest ground, can't reach the camera's view
  (`render/shadow-reach.ts`), and the crows cast none: 64-67 fewer draws a frame by day, at night and under a barrage,
  0.5-0.7 ms of GPU, and the picture identical to the bit by day, at dawn, under a flare and in the overview.
