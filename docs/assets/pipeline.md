# Asset pipeline

From a purchased pack to an encrypted runtime pack loaded by Babylon.js. Why the pack is encrypted is in
[licensing](licensing.md#how-we-protect-shipped-assets); what to buy is in the [shopping list](shopping-list.md);
terrain rendering is in the [architecture](../architecture.md#rendering). Tools to install are in
[tooling](../tooling.md). Background and sources:
[performance research](../research/notes/assets/performance_pipeline.md),
[full report](../research/realistic-ww1-assets-report.md).

## Flow

```
Unity Asset Store (Synty, version 1) / Fab / CGTrader / Mixamo / CC0
        |
        |  Unity packs: Package Manager download, then scripts/extract-unitypackage.mjs
        v
vendor/            raw purchases (git-ignored, backed up separately)
        |
        |  Unreal Engine 5: open UE-only packs, export glTF (static, skeletal, animations)
        v
Blender            fix scale, rebake UDIM to one atlas, strip extra bones, make LODs, retarget, export glTF
        |
        v
gltf-transform     dedup, prune, weld, resize, KTX2 (ETC1S/UASTC), Meshopt
        |
        |  VAT bake for crowd soldiers (Babylon VertexAnimationBaker, offline)
        v
build pack         custom binary container, encrypted per build
        |
        v
Babylon.js client  decrypt in a worker, load glTF from ArrayBuffer
```

## Unpacking Unity Asset Store packs

The Asset Store only delivers through the Unity Editor. Unity 6 LTS with an empty shell project (outside the repo) is
enough: Window → Package Management → My Assets → **Download** (not Import). Downloads land in
`%APPDATA%\Unity\Asset Store-5.x\<publisher>\`. Then:

```
pnpm assets:unpack
```

It unpacks every downloaded package into `vendor/unity/<package name>/`, keeping FBX/OBJ models, textures and audio and
skipping Unity materials, prefabs, scenes and scripts. Synty packs colour most meshes from one small palette texture
(for example `PolygonWarMap_01_A.png`, with `_B` and `_C` colour variants), so one material per pack replaces the Unity
materials. Vehicles and a few props have their own textures.

The script also writes `unity-materials.json` per package: which material each mesh's prefab uses, and each material's
texture and colour. FBX files reference the artist's original texture paths, so the converter rebuilds materials from
this file instead:

```
blender -b --factory-startup -P scripts/convert-unity-models.py -- "vendor/unity/<package>" ".asset-cache/unity/<package>"
```

It writes one GLB per FBX (collision meshes skipped, animation clips kept), mirroring the package layout. An optional
third argument filters by file name. Blender can't read old ASCII or FBX 6.1 files (Farm's `Characters.fbx`, the War
Pack's 30 flag models); they are reported and skipped. Re-export them from the Unity shell project if needed.

## Exporting Unreal-only packs

Epic's glTF exporter handles static meshes, skeletal meshes and animation sequences, and bakes materials to
metal-roughness PBR. Limits and gotchas:

- Exports **one LOD only** and **no collision**. Make LODs in Blender or with meshoptimizer.
- Nanite packs export at full resolution; reduce first.
- Custom shader effects (wetness, rain) don't survive.
- Unreal uses centimetres; glTF uses metres. Check scale.
- Watch for the root-bone scale bug that shrinks characters in animations.
- Flip the green channel of DirectX-style normal maps.

## Skeleton and animation

- **Version 1 skeleton**: the Synty humanoid rig shared by every Synty character. The soldiers play Mixamo clips
  ([which ones](mixamo-clips.md)), which `scripts/retarget-animations.py` bakes onto it; it takes polyperfect's Low Poly
  War Pack clips too (both of polyperfect's rigs share core bone names), which the soldiers played before.

  1. Write the soldier for Mixamo's auto-rigger, the French body and helmet in T-pose with no skeleton, and keep it in
     the library (`pnpm assets:backup`):
     `blender -b --factory-startup -P scripts/retarget-animations.py -- --mixamo-upload .asset-cache/level/soldier.glb .asset-cache/animations/French_Soldier_Mixamo.fbx`
  2. Upload it to Mixamo and let the auto-rigger fit its skeleton. Download each clip as FBX, without skin, 24 fps, **In
     Place** for walks, runs, crawls and strafes, into `vendor/mixamo/`, saved as its description in the list in kebab
     case (`rifle-walk-forward.fbx`): Mixamo names every download after the clip's name, and the names repeat.
     [mixamo-clips.json](mixamo-clips.json) has a link to each.
  3. Retarget the clips the game plays, `scripts/soldier-clips.txt` of all those in the folder:

     ```
     blender -b --factory-startup -P scripts/retarget-animations.py -- \
       ".asset-cache/unity/POLYGON - War Map WWI - Art by Synty/Synty/PolygonWarMap/Models/Characters_WW1.glb" \
       .asset-cache/animations/synty-soldier.glb vendor/mixamo scripts/soldier-clips.txt
     ```

     Each clip is named after its file in snake case (`rifle_walk_forward`). Mixamo clips lose their travel across the
     ground, since the simulation moves the man, but keep the hips' rise and fall and their turn. The vault with both
     hands planted becomes `climb_over`, over a wooden fence or low wall in the 1.25 s the simulation takes (vault.ts).
     The script keys `hands_up` and `hands_up_walk` itself, a prisoner's, from the idle and the walk with the arms
     raised: Mixamo has no one giving himself up.

  4. `blender -b --factory-startup -P scripts/build-level-kit.py -- .asset-cache/unity vendor/unity .asset-cache/level soldier`
     rebuilds `soldier.glb`; commit it.

  The game bakes more on load (soldiers/soldier-kit.ts): the aimed walks in eight directions, standing and crouched,
  from each walk's legs under the upper body of Mixamo's aimed walk, which comes only ahead, back and to the sides; and
  how far each clip turns a man round, for the turns on the spot. 82 clips and the 16 made come to about 5,000 rows of
  the animation texture, within WebGPU's 8,192.

- **Remaster skeleton**: the Epic/UE4 mannequin. AmeliaTeale, FieriaGold, TalkingDrums and DarkTide packs already use
  it.
- Retarget Mixamo, Kevin Iglesias and captured clips onto it (UE5 IK Retargeter or Blender). Export **in-place** clips
  (zero root translation) as named tracks.
- Strip IK, twist and finger bones to keep the VAT texture narrow.
- Babylon 9 `AnimatorAvatar.retargetAnimationGroup()` can retarget at load time for hero soldiers; stopping a retargeted
  clip snaps to rest pose, so keep a looping idle running.

## Crowd rendering

- **VAT (baked vertex animation textures)** for the crowd: `VertexAnimationBaker` bakes bone matrices per frame into one
  texture; `BakedVertexAnimationManager` gives each instance its own clip and offset. Bake offline and serialize.
- VAT **can't blend clips or interpolate frames**: author short transition clips and bake at 30–60 fps.
- **Fully skinned hero soldiers** near the camera (the player's squad) get real blending.
- Instance heads, helmets, kit and weapons separately on the shared skeleton for variety.
- Use `InstancedMesh` (per-instance culling), not thin instances.
- LOD switching by screen coverage (`useLODScreenCoverage`). Generate skinned LODs offline with meshoptimizer or Blender
  Decimate, not Babylon's runtime `simplify()`.

## Compression

- **Textures**: KTX2. ETC1S for base colour, UASTC for normal and ORM maps. Dimensions must be multiples of 4.
- **Meshes**: Meshopt (`EXT_meshopt_compression`), not Draco. Meshopt also compresses animation and decodes faster.
  Babylon loads it with no setup.
- **gltf-transform** commands to script the pass: `dedup`, `prune`, `weld`, `resize`, `etc1s`, `uastc`, `meshopt`,
  `instance`. Requires KTX-Software for KTX2.

## Budgets (estimates; validate on target hardware)

| Item                         | Budget                      | Note                                    |
| ---------------------------- | --------------------------- | --------------------------------------- |
| Soldier LOD0 (closest)       | 10k–20k tris                | 4 bone influences                       |
| Soldier LOD1 (gameplay zoom) | 4k–6k tris                  | 2–4 influences                          |
| Soldier LOD2 / LOD3          | 1.5k–2.5k / 300–800 tris    | LOD2 merges the weapon; LOD3 silhouette |
| 400 visible soldiers         | about 1.0M–1.6M tris        | across LODs                             |
| Terrain plus props           | about 1M–2M tris            | props instanced                         |
| Draw calls (WebGL2)          | 150–400                     | soldiers about 20–50 via instancing     |
| VRAM (integrated GPU)        | 512 MB–1 GB                 | textures 300–500 MB                     |
| Prop textures                | 512–1K                      | Megascans ship far higher               |
| Download                     | 50 MB initial, 250 MB total | CrazyGames limits as a yardstick        |
