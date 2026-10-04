# Art direction

Version 1 of the game ships with **Synty POLYGON art**: stylized, flat-shaded low-poly packs we already own. The whole
game is built on it. Once version 1 is finished we remaster the art toward "muted documentary realism"; that target, the
realistic shopping list and the commission spec are kept below for then. Polygon, texture and draw-call budgets are in
the [asset pipeline](pipeline.md#budgets-estimates-validate-on-target-hardware).

## Version 1: Synty POLYGON

Packs owned (Unity Asset Store, January 2021; listed in the [shopping list](shopping-list.md#owned-synty-packs)):

- **POLYGON War Map WWI**: modular deep-trench kit, firesteps, dugouts, bunkers, craters, barbed wire, dead trees,
  British and German soldiers, helmet and gas-mask attachments (including a French Adrian helmet), rifles, heavy MGs,
  artillery, tanks, planes. Requires the War Pack.
- **POLYGON War Pack**: WW2 base pack. Sandbags, bunkers, farmhouses, ruins, crates, more soldiers and weapons.
- **POLYGON Farm** and **Nature**: French countryside behind the lines, woods, rocks, fields.
- **POLYGON Prototype**: greybox kit for blocking out maps.

Rules:

- **Synty only on screen.** Don't mix in photoscans, Megascans or realistic soldiers; they clash with flat shading.
  Other low-poly assets are fine if they match (flat colour, palette texture, similar silhouettes).
- **Terrain matches the packs**: flat palette colours for mud, chalk and grass, not photographic textures.
- **Keep the muted palette.** Desaturated mud and chalk, with horizon blue and feldgrau as the saturated accents.
  Recolour by editing the pack's palette texture, and use one global colour grade.
- **Readability**: faction reads from helmet silhouette (Adrian vs Stahlhelm) and uniform hue.
- **French soldiers**: Synty has none. Recolour the British soldier in horizon blue and give him the French helmet
  attachment.
- **Animations**: the packs have none. Use Mixamo clips retargeted to the Synty humanoid rig.
- Light, smoke and weather still carry the mood: overcast, height fog, flares and muzzle flashes at night.

## Remaster target: muted documentary realism

For the art remaster after version 1. At an angled top-down camera with hundreds of soldiers, every soldier ends up
around 4k triangles at gameplay zoom. Realism on screen comes from materials, animation, lighting and smoke, not mesh
density.

- **Palette**: desaturated mud and chalk. Horizon blue (French) and feldgrau (German) are the only saturated accents.
- **Light**: overcast, height fog, smoke. Flares and muzzle flashes light the night (Babylon 9 clustered lighting).
- **One global colour grade** over everything, to unify assets from different sellers.
- **Readability**: faction reads from helmet silhouette (Adrian vs Stahlhelm) and uniform hue. Faces don't matter.
- **Shapes over detail**: big readable shapes, materials that clearly read as wood, metal, mud.

## References (remaster)

- **Foxhole**: closest precedent. Angled top-down, Unreal 4, started with 7 people and one modeler. Artists aimed for
  "tabletop miniatures" with tuned noise and detail so things read clearly.
- **Company of Heroes**: about 4,000-triangle infantry; realism in reactions, dirt and insignia.
- **Verdun, Tannenberg, Isonzo** (small studios): authenticity came from research (battlefield visits, diaries,
  photographs), not budget.

## Mixing sources (remaster)

- Re-texture purchased uniforms in Substance 3D Painter with one shared mud-and-wear stack so all soldiers match.
- Megascans photoscans are far more detailed than needed: decimate and cut textures to 512–1K.
- Don't mix Synty's flat-shaded style with photoscans: the remaster replaces the Synty art rather than mixing with it.
- AI generation (Meshy, Tripo) is fine for static clutter (crates, carts, field telephones, rubble), not soldiers.
  Disclose AI content if shipping on Steam. Never feed purchased assets into AI tools.

## Commission spec

For the remaster, and only if the asset comparison test in the [roadmap](../roadmap.md#after-version-1-art-remaster)
shows realistic soldiers matter. Commission a modular base soldier built for this camera:

- Body-only skeleton matching the Epic mannequin. No facial rig or blendshapes.
- One shared texture set. LOD0 at or under 20k triangles, plus LODs.
- Modular parts: base body, greatcoat, puttees, webbing, Adrian and Stahlhelm M16 helmets.
- Estimate: $800–2,500 per base, $300–600 per variant. A French and a German base with a few variants comes to about
  $3k–7k.
- Sellers with existing WW1 base meshes (for example Albin) are natural candidates.
- Contract: work-for-hire plus a "hereby assigns" backup assignment, moral-rights waiver and originality warranty,
  signed before work starts.
