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

- **Version 1 skeleton**: the Synty humanoid rig shared by every Synty character. Retarget Mixamo clips onto it.
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
