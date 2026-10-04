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
