# Art direction

The visual target behind the [vision](../vision.md#presentation)'s "muted documentary realism". Polygon, texture and
draw-call budgets are in the [asset pipeline](pipeline.md#budgets-estimates-validate-on-target-hardware).

## Muted documentary realism

At an angled top-down camera with hundreds of soldiers, every soldier ends up around 4k triangles at gameplay zoom.
Realism on screen comes from materials, animation, lighting and smoke, not mesh density.

- **Palette**: desaturated mud and chalk. Horizon blue (French) and feldgrau (German) are the only saturated accents.
- **Light**: overcast, height fog, smoke. Flares and muzzle flashes light the night (Babylon 9 clustered lighting).
- **One global colour grade** over everything, to unify assets from different sellers.
- **Readability**: faction reads from helmet silhouette (Adrian vs Stahlhelm) and uniform hue. Faces don't matter.
- **Shapes over detail**: big readable shapes, materials that clearly read as wood, metal, mud.

## References

- **Foxhole**: closest precedent. Angled top-down, Unreal 4, started with 7 people and one modeler. Artists aimed for
  "tabletop miniatures" with tuned noise and detail so things read clearly.
- **Company of Heroes**: about 4,000-triangle infantry; realism in reactions, dirt and insignia.
- **Verdun, Tannenberg, Isonzo** (small studios): authenticity came from research (battlefield visits, diaries,
  photographs), not budget.

## Mixing sources

- Re-texture purchased uniforms in Substance 3D Painter with one shared mud-and-wear stack so all soldiers match.
- Megascans photoscans are far more detailed than needed: decimate and cut textures to 512–1K.
- Don't mix Synty's flat-shaded style with photoscans.
- AI generation (Meshy, Tripo) is fine for static clutter (crates, carts, field telephones, rubble), not soldiers.
  Disclose AI content if shipping on Steam. Never feed purchased assets into AI tools.

## Commission spec

Only if the asset comparison test (M8 in the [roadmap](../roadmap.md#milestones)) shows realistic soldiers matter.
Commission a modular base soldier built for this camera:

- Body-only skeleton matching the Epic mannequin. No facial rig or blendshapes.
- One shared texture set. LOD0 at or under 20k triangles, plus LODs.
- Modular parts: base body, greatcoat, puttees, webbing, Adrian and Stahlhelm M16 helmets.
- Estimate: $800–2,500 per base, $300–600 per variant. A French and a German base with a few variants comes to about
  $3k–7k.
- Sellers with existing WW1 base meshes (for example Albin) are natural candidates.
- Contract: work-for-hire plus a "hereby assigns" backup assignment, moral-rights waiver and originality warranty,
  signed before work starts.
