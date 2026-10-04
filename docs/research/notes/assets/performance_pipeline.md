# Performance Considerations and Asset Pipeline for Realistic 3D at Scale in Babylon.js (WebGL2 and WebGPU)

Scope: hundreds of animated, realistic (not low-poly) WW1 soldiers plus a large deformable trench battlefield, angled top-down camera, Babylon.js 9.x, as of October 2026. Numbers marked **[ESTIMATE]** are my own engineering estimates or arithmetic derived from cited facts, not measured benchmarks.

---

## 1. Baked Vertex Animation (VAT) and alternatives for instanced skinned meshes

### Takeaway
Babylon.js VAT bakes bone matrices (not per-vertex positions) for every frame into one small RGBA float/half-float texture, then lets every instance or thin instance play its own clip and time offset through a per-instance `Vector4`. That makes hundreds to thousands of independently animated soldiers practical. The costs are no blending between clips, no interpolation between baked frames, and per-vertex texture-fetch cost in the vertex shader. Ordinary instances of a skinned mesh are not a substitute because they cannot hold per-instance poses, so a hybrid approach works best: VAT for the crowd, plus a few fully skinned "hero" soldiers near the camera.

### Cited Findings
- VAT "frees the CPU, with the trade-off that you need to perform this initial baking step", and it needs extra texture storage and GPU memory. — [Babylon.js docs: Baked Texture Animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations) ([raw source](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/animation/baked_texture_animations.md))
- Classes: `VertexAnimationBaker` generates the texture. It has an async `bakeVertexData(ranges)` and a sync `bakeVertexDataSync(ranges, halfFloat)`, and the HalfFloat option on devices with `textureHalfFloat` support halves storage. `BakedVertexAnimationManager` holds the texture and the playback parameters `Vector4(fromFrame, toFrame, offset, fps)`. Several clips live in one texture as `{from, to}` frame ranges. — [Babylon.js docs: Baked Texture Animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations)
- Per-instance control: for regular instances, `mesh.registerInstancedBuffer("bakedVertexAnimationSettingsInstanced", 4)`. For thin instances, `thinInstanceSetBuffer("bakedVertexAnimationSettingsInstanced", Float32Array, 4)`, with 4 floats per instance and a documented `computeOffset()` helper that syncs offsets to the manager's global time. — [Babylon.js docs: Baked Texture Animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations)
- Documented limitations: "you cannot blend animations to play simultaneously". Animations "may not be as smooth" because "there is no interpolation between frames", so smoothness depends on the baked frame count. — [Babylon.js docs: Baked Texture Animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations)
- Offline baking is supported. `serializeBakedVertexDataToJSON()` exports the baked data and `loadBakedVertexDataFromJSON()` restores it at runtime, so you avoid baking at runtime. — [Babylon.js docs: Baked Texture Animations](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations)
- The source code shows the texture is `RawTexture.CreateRGBATexture` with width `(boneCount + 1) * 4` texels and height equal to the number of baked frames. It stores `(bones + 1) * 16` floats per frame (one 4x4 matrix per bone) and is typed `TEXTURETYPE_FLOAT` (Float32Array) or `TEXTURETYPE_HALF_FLOAT` (Uint16Array). Frames are sampled as discrete integers (`for (let f = Math.floor(range.from); f <= Math.floor(range.to); f++)`). — [Babylon.js source: vertexAnimationBaker.ts](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/BakedVertexAnimation/vertexAnimationBaker.ts)
- Forum benchmark (July 2022): one user got only about 2,000 VAT instances before dropping below 60 FPS, against a reference WebGL demo (Lusion "Abduction") with 8,192 to 262,144 instances. Later testing (November 2022) reported 60 FPS at 20,000 instances with CPU bone calculation, 50 to 51 FPS at 10,000 instances with shader-based bones read from a texture, and on Safari 60 FPS at 10K and 36 FPS at 20K. Chrome on a Mac with a Radeon GPU was notably slower than on Windows. Evgeni_Popov (Babylon team) diagnosed that the mesh was "really bound by the vertex shader", not by texture throughput, with each bone influence costing 4 texture reads to rebuild a 4x4 matrix. He noted GPU differences matter a lot (3080Ti vs integrated) and suggested trying `useTextureToStoreBoneMatrices = false`. The thread's low-poly mesh and mixed hardware mean these numbers are not directly comparable to realistic soldiers. — [Babylon forum: Baked animation performance](https://forum.babylonjs.com/t/baked-animation-performance/32023)
- Standard skeletal (GPU) skinning: up to 4 bone influences per vertex by default (3 on low-end hardware, up to 8 maximum). By default bone matrices are stored in a texture to save uniforms. Setting `skeleton.useTextureToStoreBoneMatrices = false` brings back a hard limit on bone count set by the available vertex-shader uniforms. — [Babylon.js docs: Bones and Skeletons](https://doc.babylonjs.com/features/featuresDeepDive/mesh/bonesSkeletons)
- Instanced skinned meshes: GPU skinning does "16 texture reads per vertex per instance per frame" (32 with more than 4 influences). CPU skinning transforms the vertices once per frame, so its cost does not grow with instance count, and at some instance count CPU skinning becomes faster. CPU bone computation does not work with morph targets. — [Babylon.js docs: Bones and Skeletons](https://doc.babylonjs.com/features/featuresDeepDive/mesh/bonesSkeletons)
- Regular instances share the root mesh's material. Each can vary position, rotation and scaling, plus custom per-instance attributes through `registerInstancedBuffer()`. When combining instances with LOD, the root must be hidden. The instances docs do not cover skeletons. — [Babylon.js docs: Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances)
- Thin instances "don't create new objects, so you don't incur any penalty on the JavaScript side by having thousands of them". However, "either all thin instances are drawn (if the mesh is deemed visible) or none are. It's all or nothing", so there is no per-instance frustum culling. They suit mostly static sets, and regular instances may be better when only a few are visible or instances are added and removed continuously. Buffers are static by default and must be flagged updatable. — [Babylon.js docs: Thin Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)
- Babylon.js 9.0 (March 26, 2026) added Animation Retargeting, which applies an animation made for one character to a different skeleton by remapping bone transforms. — [Windows Developer Blog: Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)

### Inferences
- **VAT memory is small [ESTIMATE, arithmetic from the source formula].** For a 65-bone rig (Mixamo/UE4-mannequin class), the width is 66 × 4 = 264 texels. With 10 clips × 60 frames = 600 rows, that is 158,400 texels: about 2.4 MiB at RGBA32F or about 1.2 MiB at half-float. A 100-bone rig with 1,800 frames (20 clips × 3 s × 30 fps) needs about 11.6 MiB at float or 5.8 MiB at half-float. Memory is not the constraint. Vertex-shader cost and maximum texture height are. Rows = total frames, so very long libraries may exceed the GPU's max texture dimension (WebGL2 guarantees only 2048; desktop GPUs commonly allow 8192 to 16384). In that case use separate textures per unit type or clip set.
- **The per-vertex cost dominates.** With 4 influences, VAT reads 4 matrices × 4 texels = 16 fetches per vertex. For 400 soldiers × about 3k vertices on average that is about 19M fetches per pass, roughly doubled with a shadow pass [ESTIMATE]. This is why LOD (fewer vertices) and limiting influences (2 to 4 in LOD1+) matter more than instance count.
- **Bake at 30 to 60 fps.** Without interpolation, a 30 fps bake shows each pose for 2 frames at 60 Hz. At a top-down distance that is usually acceptable, but bake at 60 fps for close-camera clips.
- **Workarounds for blending:** (a) author short transition clips (idle-to-run, run-to-prone) and switch at matching frames; (b) quantize state changes to clip boundaries; (c) use real skinned meshes with `AnimationGroup` blending for the few soldiers closest to the camera ("animation LOD": skeletal for LOD0 heroes, VAT for LOD1+).
- Regular (non-VAT) instances of a skinned mesh share one skeleton and therefore one pose. Per-soldier poses need either VAT or separate clones with their own skeletons, which cost CPU per skeleton. Budget tens, not hundreds, of fully skinned clones [ESTIMATE].
- **Choosing between instances and thin instances for hundreds of soldiers:** regular `InstancedMesh` plus the VAT instanced buffer gives per-instance frustum culling and inherited `addLODLevel` behaviour at modest JS cost, which suits a few hundred soldiers. Thin instances are better for thousands but need manual CPU-side bucketing per LOD mesh (rewriting `thinInstanceSetBuffer` each frame or every N frames), as in the NVIDIA approach in section 7.
- The LOD meshes of one soldier share the same skeleton, so they can probably share the same VAT texture/manager. I did not verify this in the docs.

### Gaps
- I found no official Babylon.js benchmark of VAT with realistic 5k to 20k triangle characters on integrated GPUs. The only numbers found are forum tests from 2022 on low-poly meshes.
- The docs do not say whether `BakedVertexAnimationManager` works with `addLODLevel` on instances, or whether one manager can safely be shared across LOD meshes. Test this in a playground.
- I could not confirm the exact uniform-based bone limit when `useTextureToStoreBoneMatrices = false`. It depends on the GPU's `MAX_VERTEX_UNIFORM_VECTORS`.
- I did not confirm whether Babylon 9.x added VAT frame interpolation or blending. Nothing in the 9.0 announcement mentions it.

---

## 2. Realistic budgets: triangles per LOD, scene triangles, draw calls, VRAM, download size

### Takeaway
There are no authoritative, modern triangle-throughput benchmarks for WebGL2/WebGPU on integrated GPUs, so triangle and VRAM budgets must be engineering estimates validated by profiling on target hardware. Download size does have hard published constraints: CrazyGames allows at most 50 MB initial download (at most 20 MB for mobile homepage eligibility) and at most 250 MB total. Draw-call count, not raw triangles, usually limits integrated GPUs first, which favors instancing.

### Cited Findings
- CrazyGames technical requirements: "initial download size ≤ 50MB"; at most 20 MB to be eligible for the mobile homepage; "total file size of 250MB"; a 1,500-file limit; "time it takes to reach gameplay (≤ 20 seconds)"; and games may be disabled on Chromebooks "if they do not work smoothly on a 4GB RAM device". — [CrazyGames Docs: Technical requirements](https://docs.crazygames.com/requirements/technical)
- Poki reportedly requires an initial download under 8 MB. This comes from a secondary guide and was not verified on a Poki-owned page. — [Cinevva: How to Get Your Game on Poki (2026)](https://app.cinevva.com/guides/publish-game-poki)
- Older WebGL data point (2010-era): a MacBook Pro with "a fairly average GPU" reached about 280k triangles before falling below 60 fps. This is badly outdated and shows the low end of what WebGL could historically handle, not modern capability. — [Khronos public_webgl mailing list](https://www.khronos.org/webgl/public-mailing-list/public_webgl/1005/msg00257.php)
- In the VAT thread, performance degraded at about 10 million faces/vertices on a laptop, implying total vertex count is a main factor, and LOD was recommended when zoomed out. This comes from a search-result summary of the thread and is low confidence. — [Babylon forum: Baked animation performance](https://forum.babylonjs.com/t/baked-animation-performance/32023)
- Integrated-GPU guidance (secondary, low authority): draw calls, triangle count and post-processing determine whether integrated laptops cope, and "a scene with hundreds of individually lit props chokes an integrated GPU long before the triangle count does". — [Gamer AI Nexgen: lightweight browser games for old laptops](https://gamer-ai-nexgen.duckdns.org/blog/lightweight-browser-games-for-old-laptops)
- Babylon's optimization docs recommend instances for identical geometry (one draw call per group), `material.freeze()`, `scene.freezeActiveMeshes()`, `mesh.freezeWorldMatrix()`, `scene.skipPointerMovePicking`, `scene.blockMaterialDirtyMechanism`, `mesh.alwaysSelectAsActiveMesh`, `doNotSyncBoundingInfo`, and the `performancePriority` Intermediate and Aggressive modes. — [Babylon.js docs: Optimize your scene](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene)
- The NVIDIA skinned-instancing whitepaper splits 10,000 characters into batches of 819 instances (a constant-buffer limit), giving 13 draw calls. It notes "there is often little effective difference in final framerate between 1 and 13 draw calls", while 13 vs 819 matters a lot. — [NVIDIA: Skinned Instancing whitepaper (2007)](https://developer.download.nvidia.com/SDK/10/direct3d/Source/SkinnedInstancing/doc/SkinnedInstancingWhitePaper.pdf)
- Khronos KTX examples: the StainedGlassLamp model dropped from 96 MB to 21 MB of GPU memory with KTX (−78%), and the Duck from 1.5 MB to 277 KB with ETC1S (−82%). — [Khronos KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)

### Inferences
Proposed budgets **[ALL ESTIMATES]**, for an RTS-style angled top-down camera, 1080p, targeting 60 fps on recent discrete GPUs and at least 30 fps on 2022+ integrated GPUs (Intel Iris Xe / Arc iGPU, AMD 680M-class, Apple M1):

| Item | Budget | Notes |
|---|---|---|
| Soldier LOD0 (closest about 5 to 10% of soldiers, zoomed in) | 10k–20k tris | Realistic uniform, webbing, helmet, rifle. Normal map carries detail. 4 bone influences. |
| Soldier LOD1 | 4k–6k tris | Typical gameplay zoom. Maximum 4 influences, ideally 2 to 3. |
| Soldier LOD2 | 1.5k–2.5k tris | Weapon merged, fingers fused. |
| Soldier LOD3 | 300–800 tris | Silhouette only, 1 to 2 influences. |
| Impostor / null LOD | 2 tris or culled | Octahedral or billboard impostors for very far soldiers, or `null` LOD. |
| Soldiers total (400 visible) | about 1.0M–1.6M tris | Average about 2.5k–4k per soldier after LOD distribution. |
| Terrain (visible chunks) | 0.5M–1M tris | See section 5. |
| Props, trenches, wire, craters | 0.5M–1M tris | Instanced. |
| Total per main pass | about 2M–3.5M tris | Shadow cascades re-render casters, so plan about 1.5–2.5x geometry cost overall. |
| Draw calls (WebGL2) | 150–400 per frame | Instancing keeps soldiers to about (LODs × variants × materials), around 20–50 calls. |
| Draw calls (WebGPU + snapshot rendering) | Several hundred to 1,000+ | CPU-side savings only, see section 6. |
| VRAM (integrated GPU target) | 512 MB–1 GB total | Textures, about 300–500 MB. Render targets/shadows, about 100–200 MB. Geometry, about 50–150 MB. |
| Initial download | ≤ 20–30 MB (portal) or ≤ 50 MB | Stream additional unit types, maps and high-res texture mips after gameplay starts. |
| Total download | ≤ 250 MB | CrazyGames cap. A self-hosted game can exceed it but should stream. |

- **Texture VRAM arithmetic [ESTIMATE, from standard block-compression bit rates: BC1/ETC1 = 4 bpp, BC7/ASTC 4x4 = 8 bpp; mipmaps add about 33%]:** a 2048² RGBA8 texture uses about 21.3 MB with mips. As BC7/ASTC4x4 (UASTC target) it uses about 5.3 MB, and as BC1/ETC1 (ETC1S target) about 2.7 MB. One shared soldier atlas set (base color ETC1S + normal UASTC + ORM UASTC) at 2048² is therefore about 13 MB on GPU, versus about 64 MB uncompressed.
- Use a single shared texture set or atlas for all infantry variants, and vary them with per-instance tint and decal channels (instanced buffer) or a texture array of base-color variants. Every distinct material multiplies draw calls across all LODs.
- The 4 GB-RAM Chromebook rule on CrazyGames implies a hard ceiling of roughly 1 to 1.5 GB of combined JS heap and GPU memory on low-end devices [ESTIMATE].

### Gaps
- I found no rigorous 2025–2026 benchmark of WebGL2 or WebGPU triangle throughput, draw-call throughput or texture memory on specific integrated GPUs. Budgets above must be validated with Babylon's Inspector, Spector.js or the `SceneInstrumentation`/`EngineInstrumentation` counters on real target hardware.
- I did not verify Poki's 8 MB requirement against a Poki-owned page.
- I found no published per-LOD triangle budgets from shipped RTS/war games (e.g., Total War, Company of Heroes) in accessible sources.

---

## 3. Texture compression (KTX2/Basis), mesh compression (Draco vs Meshopt), and gltf-transform workflows

### Takeaway
Use KTX2/Basis textures (ETC1S for base color, UASTC for normal and ORM maps) and Meshopt (`EXT_meshopt_compression` + `KHR_mesh_quantization`) for geometry and animation. Babylon.js loads both from glTF without extra setup. Meshopt beats Draco here because it also compresses animation and decodes much faster when there are many meshes. gltf-transform (or gltfpack) can drive the whole optimization pass from the CLI.

### Cited Findings
- Babylon KTX2: ETC1S is the "original low/medium quality mode, produces lower file sizes" and suits albedo/color data. UASTC is the "high quality mode, can be used on any type of texture, even for non-color data maps", with optional Zstandard supercompression that shrinks files but not GPU memory. Babylon prefers the Universal Texture Transcoders (UTT) and falls back to the MSC Basis transcoder. The KTX2 decoder is "less than 22kb" minified. glTF integration uses `KHR_texture_basisu`, and usage is the same as any `Texture` URL. — [Babylon.js docs: KTX2 Compressed Textures](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/ktx2Compression)
- Khronos artist guidance: use ETC1S for base color and emissive with large solid or monochrome areas, and UASTC for prominent, color-varied base color. Use UASTC for normal maps and ORM because channels differ strongly. The recommended base-color command is `--t2 --encode etc1s --clevel 4 --qlevel 255 --genmipmap`. For normals it is `--t2 --encode uastc --uastc_quality 4 --uastc_rdo_l .25 --uastc_rdo_d 65536 --zcmp 22 --genmipmap --assign_oetf linear --assign_primaries none`. "Texture dimensions still must be multiples of 4 to work with KHR_texture_basisu", and power-of-two sizes are recommended. Avoid JPEG sources because "KTX is going to amplify those errors". — [Khronos KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)
- Babylon.js supports `EXT_meshopt_compression` "in version 5.0+ without further setup". gltfpack applies `KHR_mesh_quantization` by default (Babylon 4.1+ compatible). gltfpack flags: `-c` and `-cc` (meshopt compression, `-cc` extra), `-tc` (KTX2/BasisU textures), `-tw` (WebP), `-si R` (simplify to ratio R). gltfpack "quantizes and resamples animations to reduce animation size". — [meshoptimizer gltf/README](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)
- gltf-transform CLI commands: `optimize` ("Optimize model by all available methods"; example `gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp`; the docs warn defaults "may not be ideal for all scenes"), `draco` ("Compress geometry with Draco"), `meshopt` ("Compress geometry and animation with Meshopt"), `quantize`, `weld`, `simplify`, `reorder`, `join`, `dedup`, `prune`, `instance` ("Create GPU instances from shared mesh references"), `flatten`, `palette`, `resize`, `etc1s`, `uastc`, `webp`, `avif`. — [glTF Transform CLI docs](https://gltf-transform.dev/cli)
- Draco vs Meshopt (secondary blog, not a controlled benchmark): Meshopt typically reduces size by 30–60% against Draco's 50–80%, but decodes 5–10x faster. Draco wins for 1 to 3 hero models, and Meshopt wins for scenes with 50+ meshes. With gzip/Brotli on top, Meshopt can approach Draco's ratios. — [svilenkovic.com: meshopt compression](https://svilenkovic.com/3d/meshopt-compression)
- Meshopt compresses geometry, morph targets and animation, while Draco compresses only geometry. — [glTF Transform CLI docs](https://gltf-transform.dev/cli); [svilenkovic.com](https://svilenkovic.com/3d/meshopt-compression)

### Inferences
- **Recommended per-asset pipeline [ESTIMATE / illustrative; check flags with `gltf-transform <cmd> --help`]:**
  1. Blender: clean the FBX import (see section 8), apply transforms, limit to 4 influences, normalize weights, author LOD0–LOD3 (or generate them, see section 4), export in-place animation clips as glTF/GLB.
  2. `gltf-transform dedup` → `prune` → `weld` → `resize --width 2048 --height 2048` (soldier atlas) or 1024 (props).
  3. Textures: `gltf-transform etc1s` on baseColor/emissive slots and `gltf-transform uastc` on normal/ORM slots. Both use slot filters and need KTX-Software (`ktx`/`toktx`) installed on the build machine.
  4. Geometry: `gltf-transform meshopt` (implies quantization), or gltfpack `-cc -tc`.
  5. Static environment props: `gltf-transform instance` to turn repeated meshes (sandbags, wire pickets, duckboards) into `EXT_mesh_gpu_instancing`. Babylon's glTF loader supports that extension (from memory; verify).
  6. Bake VAT data offline with `VertexAnimationBaker` + `serializeBakedVertexDataToJSON()` in a Node/headless build step, then compress the JSON or binary with Brotli. Better still, store it as a binary half-float buffer rather than JSON text.
- Avoid `join`/`flatten`/`palette` on skinned soldier files, because merging skinned meshes or flattening hierarchies can break skin bindings. Use them for static props only. This is not verified in the docs.
- For the terrain splat layers, prefer UASTC (or ETC1S at high `qlevel`) and a texture array or atlas, so one terrain material can sample 6 to 8 layers in a single draw call.
- Serve `.glb`/`.ktx2` with Brotli or gzip at the CDN. Meshopt data is designed to compress further this way, which closes most of the size gap with Draco.

### Gaps
- I found no rigorous, recent head-to-head benchmark of Draco vs Meshopt decode time in Babylon specifically. The ratios cited come from a secondary blog.
- I did not verify exact gltf-transform flag names and defaults (e.g., `--slots`, `--compress`, `--texture-compress ktx2`, `--simplify-ratio`) on the fetched CLI page. It listed commands only.
- I did not confirm Babylon's support for `EXT_mesh_gpu_instancing`, `KHR_texture_basisu` combined with Meshopt in one file, or a texture-array loader (`RawTexture2DArray`) in the docs this session.

---

## 4. LOD tooling: Babylon built-in LOD, auto-simplification, meshoptimizer, Simplygon/InstaLOD, impostors

### Takeaway
Babylon's `addLODLevel` supports distance or screen-coverage switching and a `null` level for culling, and instances inherit LOD from their source mesh. Runtime `mesh.simplify()` exists, but LODs for skinned soldiers should be generated offline (meshoptimizer via gltfpack or gltf-transform, or Blender Decimate plus hand cleanup) so skin weights and UV seams stay intact. For the farthest soldiers, use impostors or `null` LOD.

### Cited Findings
- `addLODLevel(distance, mesh)` switches meshes by camera distance. Setting `useLODScreenCoverage = true` turns values into a 0–1 screen-area ratio, where larger values mean more detail. Passing `null` "disable[s] rendering of the current mesh when it is viewed beyond the indicated distance". `removeLODLevel()` removes a level. Instances automatically inherit the parent's LOD settings. — [Babylon.js docs: Level of Detail](https://doc.babylonjs.com/features/featuresDeepDive/mesh/LOD)
- When combining instances with LOD, the root object must be hidden. — [Babylon.js docs: Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances)
- Runtime auto-LOD: `mesh.simplify(settings[], parallelProcessing, simplificationType, callback)` runs asynchronously, where each setting has `quality` (0–1) and `distance`, with optional `optimizeMesh`. The default algorithm is `QuadraticErrorSimplification`. It works poorly on simple geometry, on meshes combining distant objects, and on meshes with submeshes. — [Babylon.js docs: Simplifying Meshes](https://doc.babylonjs.com/features/featuresDeepDive/mesh/simplifyingMeshes)
- meshoptimizer simplification is exposed in gltfpack as `-si R` (ratio 0–1). — [meshoptimizer gltf/README](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md). gltf-transform exposes `simplify` ("Simplify mesh, reducing number of vertices"). — [glTF Transform CLI](https://gltf-transform.dev/cli)
- A three.js crowd demo (InstancedMesh2, 3,000 animated instances) "generates geometry LODs with meshoptimizer (5 LODs here)". It also animates only instances in the frustum, sets each instance's animation fps from 0 to 60 by camera distance, and updates fewer bones for distant instances. — [three.js forum: Animated Instanced Skinned Meshes](https://discourse.threejs.org/t/animated-instanced-skinned-meshes-gltf/41958?page=2); [demo](https://instanced-mesh-skinning-demo.vercel.app/)
- NVIDIA's approach: per-instance LOD chosen on the CPU every frame by distance, with 4 LOD groups. Distant characters skip normal-map sampling and complex lighting, and LOD also reduces geometric aliasing. — [NVIDIA: Skinned Instancing whitepaper](https://developer.download.nvidia.com/SDK/10/direct3d/Source/SkinnedInstancing/doc/SkinnedInstancingWhitePaper.pdf)
- Academic crowd work: image-based impostors render distant characters as a textured polygon, and per-joint impostors support real-time rendering of thousands of agents. — [Efficient rendering of animated characters through optimized per-joint impostors](https://core.ac.uk/display/41768424); see also [Kavan et al., I3D 2008 (Polypostors)](https://dcgi.fel.cvut.cz/home/zara/papers/KavanEtAll-I3D08.pdf)

### Inferences
- With a top-down camera, prefer `useLODScreenCoverage = true` over raw distance. Zoom level and FOV then work automatically, and thresholds map cleanly to pixel heights. Approximate starting thresholds [ESTIMATE]: LOD0 > 0.02, LOD1 > 0.005, LOD2 > 0.0015, LOD3 > 0.0004, below that `null` or impostor. Tune visually.
- Animated impostors (pre-rendered sprite sheets of walk/fire cycles from 8 to 16 directions) are the cheapest far-field option. On a high top-down camera, though, soldiers are rarely tiny enough to need them. A 300 to 800 tri LOD3 with VAT may look better and avoid extra texture memory [ESTIMATE].
- Reduce bone influences on lower LODs (4 → 2 → 1) and drop finger and face bones from the VAT bake for LOD2+. Fewer bones means a narrower VAT texture and fewer fetches.
- Simplygon and InstaLOD both produce production-quality skinned LODs. In a free indie pipeline, meshoptimizer (gltfpack/gltf-transform) plus Blender's Decimate (Collapse, with "Symmetry" and vertex-group weighting to protect face and hands) is the realistic choice.

### Gaps
- I did not research or confirm the current (2026) licensing or pricing of Simplygon and InstaLOD for indie or web use.
- The docs do not say whether Babylon's runtime `simplify()` preserves skin weights or bone indices. Treat it as unsafe for skinned meshes until tested.
- I found no Babylon-native impostor or octahedral-impostor system in the docs reviewed.

---

## 5. Terrain: large heightmap terrain with runtime deformation, splatting, and decals

### Takeaway
Babylon has no first-party CDLOD or clipmap terrain. The options are (a) the community **Dynamic Terrain** extension (a large float height map plus a camera-following updatable mesh), (b) your own chunked `GroundMesh` grid with per-chunk vertex updates, or (c) GPU displacement from a height texture you write into at runtime. Built-in `TerrainMaterial` is limited to 3 layers (`MixMaterial` to 8), so a realistic battlefield needs a custom NodeMaterial or ShaderMaterial splat shader. `MeshUVSpaceRenderer` decal maps can paint persistent scorch and crater marks into terrain textures.

### Cited Findings
- Dynamic Terrain design: rather than chunking, it uses "a map of data (or several), that can be as large as wanted as it's only a pool of floats, and an updatable mesh, called the terrain, depicting how is the terrain at the current camera location". `BABYLON.DynamicTerrain.CreateMapFromHeightMapToRef` builds map data from heightmap images. New chunks can be attached to the map data for infinite terrain, and `getHeightFromMap(x, y, normalRef)` queries height and normal. — [Babylon forum: Dynamic Terrain extension, infinite terrain](https://forum.babylonjs.com/t/dynamic-terrain-extension-how-to-make-infinite-terrain/1939)
- Known issue: the same height value can produce different in-game heights with different heightmap sizes (e.g., 129×129 vs 2049×2049). — [Babylon forum: Dynamic Terrain height inconsistency](https://forum.babylonjs.com/t/dynamic-terrain-height-inconsistency-with-different-sizes-of-heightmaps/1779)
- `TerrainMaterial` supports only 3 diffuse textures, blended by the R/G/B channels of a `mixTexture`. `MixMaterial` supports up to 8. Extending them means copying the shader into a `ShaderMaterial` or rebuilding it in Node Material. A community "PBR texture splatting (up to 64 textures)" solution exists, and the community has asked for a modernized terrain material with triplanar sampling. — [Babylon forum: PBR texture splatting (up to 64 textures)](https://forum.babylonjs.com/t/pbr-texture-splatting-up-to-64-textures/1994); [Babylon forum: MixMaterial and Shader](https://forum.babylonjs.com/t/mixmaterial-and-shader/39988)
- `MeshUVSpaceRenderer` renders into a mesh's UV space and is used for decal maps (available since 5.49.1). It is still in `@babylonjs/core@9.18.0`. — [unpkg: @babylonjs/core 9.18.0 meshUVSpaceRenderer d.ts](https://app.unpkg.com/@babylonjs/core@9.18.0/files/Meshes/meshUVSpaceRenderer.pure.d.ts)
- For decal maps, set `optimizeUVAllocation` to false if you rotate or offset the texture. A user-supplied decal texture must be a render target texture. UV seams show at island splits, and `uvEdgeBlending = true` applies a post-process to hide them. — [Babylon forum: User texture for decalMap](https://forum.babylonjs.com/t/user-texture-for-decalmap/53777); [Babylon forum: Drawing a decal shows a UV seam](https://forum.babylonjs.com/t/drawing-a-decal-shows-a-uv-seam/45845)

### Inferences
- **Recommended trench-battlefield architecture [ESTIMATE / design proposal]:**
  - **Height data:** an authoritative CPU `Float32Array` height grid at about 0.5 m resolution (a 1 km² map at 2,000² = 4M floats = 16 MB) for gameplay, line of sight, pathing and physics. It is mirrored to a GPU R16F/R32F height texture.
  - **Rendering:** a grid of chunks (e.g., 64 × 64 m, each a 129² vertex `GroundMesh` with `updatable: true`), with chunk-level LOD of 129² / 65² / 33² by screen coverage. Simple stitching or skirts hide cracks. With an angled top-down camera the visible area is bounded, so a CDLOD/clipmap system is optional.
  - **Deformation:** on an artillery impact, stamp a crater kernel into the CPU height grid, then update only affected chunk vertices (`updateVerticesData` on positions and normals) or the matching region of the GPU height texture. WebGPU compute shaders can do the stamp and normal recompute on GPU.
  - **Trenches:** heightfields cannot represent vertical or undercut trench walls well. Carve a coarse trench "V" into the heightmap, then place modular instanced trench-wall meshes (revetments, sandbags, duckboards, firesteps) along spline paths.
  - **Surface:** a custom NodeMaterial splat shader with 6 to 8 layers (mud, wet mud, churned earth, grass, chalk, water, scorched) from a KTX2 texture array or atlas, with height-blending and optional triplanar sampling on steep crater walls. Splat weights live in an RGBA control texture (2 control textures for 8 layers) that can also be painted at runtime by render-to-texture when shells land.
  - **Decals:** use `MeshUVSpaceRenderer` decal maps for persistent scorch marks on chunk textures, plus projected decals or a "crater" splat channel for many impacts. Avoid one projected-decal mesh per crater, since each adds a draw call.
- Water in shell holes can be done cheaply as small instanced planes with a shared water material at a local "water table" height.

### Gaps
- I did not fetch the Dynamic Terrain extension's own documentation, so I could not confirm whether it is maintained for Babylon 9.x, how runtime map-data updates perform, or how it handles LOD.
- I found no Babylon-official CDLOD/clipmap terrain sample, and no benchmark of runtime ground-vertex update cost per chunk.
- I did not verify Babylon's current `CreateGroundFromHeightMap` / `GroundMesh` APIs for partial vertex updates, or a built-in texture-array terrain material.

---

## 6. WebGPU vs WebGL2 in Babylon.js (2025–2026 status)

### Takeaway
WebGPU now ships by default in Chrome/Edge (113+), Safari 26 (macOS Tahoe / iOS 26), and Firefox (Windows from 141, Apple Silicon macOS Tahoe from 145). Firefox on Linux and Android lags. Babylon runs the same scene on both backends. WebGPU's main wins are CPU-side (render bundles / snapshot rendering) and compute shaders (Frame Graph, volumetrics, custom GPU culling or terrain deformation), not raw GPU throughput. Ship WebGPU-first with an automatic WebGL2 fallback.

### Cited Findings
- caniuse reports WebGPU at about 87% global usage (85.72% full + 1.63% partial). Chrome and Edge are supported from 113, Safari is partial in 26.0+, iOS Safari is supported from 26.0, and Samsung Internet from 24. caniuse lists Firefox as "disabled by default", which conflicts with the Mozilla shipping announcements below and likely reflects Linux/Android or caniuse's partial-platform policy. — [caniuse: WebGPU](https://caniuse.com/webgpu)
- Firefox enabled WebGPU on Windows in Firefox 141 (released July 22, 2025). — [Simon Willison: Shipping WebGPU on Windows in Firefox 141](https://simonwillison.net/2025/Jul/16/webgpu-firefox). Mozilla announced an intent to ship WebGPU on macOS Tahoe for ARM64. — [Mozilla dev-platform: Intent to ship WebGPU on macOS Tahoe for ARM64](https://groups.google.com/a/mozilla.org/g/dev-platform/c/4m_SnGAGkEU/m/PdrQftcCBAAJ). Secondary sources say Firefox 145 extended support to Apple Silicon Macs on macOS Tahoe 26, with Linux in progress and Android targeted for late 2026. — [gpuweb implementation status wiki](https://github.com/gpuweb/gpuweb/wiki/implementation-status); [Cinevva: WebGPU vs WebGL for Games (2026)](https://app.cinevva.com/guides/webgpu-vs-webgl-games)
- Safari shipped WebGPU on macOS Tahoe 26, iOS 26, iPadOS 26 and visionOS 26 (September 2025). — [Cinevva: WebGPU vs WebGL for Games (2026)](https://app.cinevva.com/guides/webgpu-vs-webgl-games) (secondary)
- Babylon.js 9.0 (March 26, 2026) features: Clustered Lighting ("hundreds or even thousands of lights"; WebGPU and WebGL 2); Frame Graph ("substantial GPU memory savings (we've seen 40% or more in some cases!)", using WebGPU compute shaders); Volumetric Lighting (uses WebGPU compute shaders, with WebGL 2 fallbacks); Animation Retargeting; OpenPBR (alpha); Gaussian-splat shadows. — [Windows Developer Blog: Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)
- Current version: npm/unpkg shows `@babylonjs/core@9.18.0`, and a gamedev.net news item is titled "BabylonJS 9.21.0 released". — [unpkg @babylonjs/core 9.18.0](https://app.unpkg.com/@babylonjs/core@9.18.0/files/Meshes/meshUVSpaceRenderer.pure.d.ts); [gamedev.net: BabylonJS 9.21.0 released](https://gamedev.net/news/5070-babylonjs-9210-released/)
- Snapshot rendering is WebGPU-only (Babylon 5.0+). It records draw calls in one frame and replays them. STANDARD mode still updates uniform buffers. FAST mode updates only the scene UBO automatically, so mesh and material UBOs need manual updates. `SnapshotRenderingHelper` (v7.32.0+) offers `updateMesh()` and `fixMeshes()`, the latter supporting bone animations. Adding or removing meshes requires `snapshotRenderingReset()`, and a mesh not displayed during recording will not be drawn. The docs say the JS-side frame time improves substantially while "GPU performance remains comparable". — [Babylon.js docs: WebGPU Snapshot Rendering](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering)
- Each mesh takes about 6 to 10 WebGPU API calls to draw, and render bundles wrap them. A secondary source claims "10x CPU-side speedups for static geometry" (unverified). — [Cinevva: Babylon.js 7 news](https://app.cinevva.com/news/2024-03-28-babylonjs-7)
- Early forum reports (2021) found the WebGPU backend slower than WebGL in some scenes, so WebGPU is not automatically faster. — [Babylon forum: Why WebGPU backend is slower?](https://forum.babylonjs.com/t/why-webgpu-backend-is-slower/24091)

### Inferences
- In this scene, soldiers are already instanced (few draw calls), so WebGPU's CPU savings mostly help the static environment (thousands of props, trench pieces, wire). Snapshot rendering (STANDARD, or FAST with `SnapshotRenderingHelper`) is the natural fit, with a reset when terrain chunks or prop sets change.
- Compute shaders open up GPU-side per-instance frustum culling, LOD bucketing (writing per-LOD instance buffers for thin instances, as NVIDIA did on the CPU), crater stamping and normal recompute, and GPU particles for artillery smoke. Keep a CPU or WebGL2 fallback path for each.
- Clustered lighting (9.0) suits many short-lived lights such as muzzle flashes, flares and explosions without forward-lighting light-count limits.
- Fallback strategy: `await WebGPUEngine.IsSupportedAsync`, then create a `WebGPUEngine`, otherwise use `Engine` (WebGL2). Test on Firefox Linux, older Intel Macs and Android Firefox, which still fall back.

### Gaps
- I found no Babylon-published, numbers-backed WebGPU vs WebGL2 benchmark for skinned/VAT crowds.
- I could not confirm Firefox's exact 2026 platform status (Linux shipped or not, Android) from a Mozilla primary page this session.
- I did not find a Babylon built-in GPU-driven culling or indirect-draw path for thin instances.

---

## 7. Case studies: web and real-time crowds with many characters

### Takeaway
The classic reference (NVIDIA skinned instancing, 2007) shows about 10,000 independently animated characters at 30 fps using an animation texture of bone matrices, per-instance animation offsets, per-instance CPU LOD bucketing, sub-mesh variation and about 13 draw calls. Modern web demos (Babylon VAT forum tests, three.js InstancedMesh2 with 3,000 animated instances) use the same recipe. I found no public, realistic-art web game with hundreds of soldiers that publishes its budgets.

### Cited Findings
- NVIDIA Skinned Instancing (Bryan Dudash, 2007): "almost ~10,000 characters, independently animating with different animations and differing meshes at 30fps on an Intel Core 2 Duo GeForce 8800GTX". It encodes "all frames of all animations into a texture" (3 texels per bone matrix plus a pad texel) so "each character can be in a different frame of each animation". Per-instance data is 5 float4s (3-row world matrix, color, animation data) indexed by `SV_InstanceID`, and the batch is 819 instances per draw, so 13 draw calls for 10,000. Variation comes from splitting characters into sub-meshes (heads, armor, weapons) bound to the same skeleton and instanced separately. LOD has 4 groups chosen per instance per frame on the CPU, with CPU frustum culling. Distant LODs skip normal maps and complex lighting. Conditional branching skips zero-weight bone fetches. — [NVIDIA: Skinned Instancing whitepaper](https://developer.download.nvidia.com/SDK/10/direct3d/Source/SkinnedInstancing/doc/SkinnedInstancingWhitePaper.pdf)
- three.js InstancedMesh2: a 3,000-animated-instance demo with frustum culling, 5 meshoptimizer LODs, animation only for in-frustum instances, distance-scaled animation fps (0 to 60), and fewer bones updated when far. The thread does not publish FPS or hardware. — [three.js forum](https://discourse.threejs.org/t/animated-instanced-skinned-meshes-gltf/41958?page=2); [demo](https://instanced-mesh-skinning-demo.vercel.app/); [library](https://github.com/agargaro/instanced-mesh)
- Babylon VAT forum tests: 10K to 20K low-poly instances at 36 to 60 FPS depending on browser and GPU (see section 1). The cited reference WebGL demo (Lusion "Abduction") renders 8,192 to 262,144 instances. — [Babylon forum: Baked animation performance](https://forum.babylonjs.com/t/baked-animation-performance/32023)
- Academic per-joint impostors and polypostors target thousands of agents in real time. — [core.ac.uk: per-joint impostors](https://core.ac.uk/display/41768424); [Kavan et al. I3D08](https://dcgi.fel.cvut.cz/home/zara/papers/KavanEtAll-I3D08.pdf)

### Inferences
- Copy NVIDIA's sub-mesh variation for WW1 infantry: base body + 3 to 4 head variants + helmet types (Brodie, Adrian, Stahlhelm, cap) + kit and weapon variants. Each piece is a VAT-driven instanced mesh sharing one skeleton, one VAT texture and one texture atlas. Draw calls equal pieces × LODs, independent of soldier count [ESTIMATE: about 6 pieces × 4 LODs = 24 calls, doubled for shadows].
- A distance-scaled animation update rate (as in InstancedMesh2) maps directly onto VAT: lower-LOD soldiers can use clips baked at a lower fps, or a lower per-instance fps value, to save VAT rows.

### Gaps
- I found no Babylon.js showcase or published post-mortem for a realistic-art web game with hundreds of animated characters that states poly or texture budgets.
- I did not research PlayCanvas crowd demos or GDC talks (e.g., Total War, Assassin's Creed Unity crowds) because of the tool-call budget. Accessible primary sources for those budgets were not found.

---

## 8. Converting marketplace assets (UE .uasset/FBX → glTF): materials, ORM, skeleton scale, root motion

### Takeaway
`.uasset` files cannot be converted directly. Assets must be exported from the Unreal Editor to FBX, cleaned in Blender (unit scale, bone axes, leaf bones, root bone, materials) and re-exported to glTF. Scale is the most common failure: Unreal works in centimeters and glTF in meters. Root and armature bone scale problems break animations. Expect to rebuild materials as glTF PBR and to export in-place animations (root motion stripped) for VAT and instancing.

### Cited Findings
- Blender FBX round-trip settings for UE: Selected Objects on, Apply Unit on with Apply Scalings = "FBX All" (or set scene Unit Scale to 0.01), Smoothing = Face, Add Leaf Bones off, Primary Bone Axis Y / Secondary X, Bake Animation on. Rename the armature object "root", because Unreal turns that object into the root bone. — [Sarah Hyperdense: Blender to UE5, the complete export pipeline](https://sarahhyperdense.substack.com/p/blender-to-ue5-the-complete-export)
- Root-bone scale bug: when an exporter scales all bones rather than only the root, the root-bone scale in animations stays at 1 while the mesh is scaled 100x, so characters look 100 times too small in animations even though Persona shows them correctly. — [Unreal Engine forums: Skeleton root bone scale incorrectly set to 1](https://forums.unrealengine.com/t/skeleton-root-bone-scale-incorrectly-set-to-1-in-animations-after-imported-bone-transform-is-different-error-resulting-in-smaller-bigger-meshes-in-animation/395788)
- Using a 0.01 unit scale in Blender as a workaround "messes up physics, viewport navigation, creating primitives" and other parts of Blender. — [BlenderArtists: GYAZ Export Tools](https://blenderartists.org/t/gyaz-export-tools-seamless-blender-to-unreal-unity-fbx/1121132)
- Babylon.js 9.0 Animation Retargeting can apply animations authored for one skeleton (e.g., the UE mannequin) to a different character skeleton. — [Windows Developer Blog: Announcing Babylon.js 9.0](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)
- Babylon's VAT bakes discrete frames from `AnimationRange`s of one skeleton, so all clips must be on the same skeleton and in frame ranges before baking. — [Babylon.js source: vertexAnimationBaker.ts](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/BakedVertexAnimation/vertexAnimationBaker.ts)

### Inferences
- **Practical conversion checklist [from general practice; not each item verified this session]:**
  1. In Unreal Editor, right-click the asset, then Asset Actions → Export → FBX (skeletal mesh + each AnimSequence). Export textures as TGA/PNG. Materials do not transfer.
  2. Import into Blender with the FBX importer, using "Automatic Bone Orientation" off and checking that scale is 0.01 (cm → m). Apply scale on the armature and meshes before adding animation. Fix the "root" or armature-object scale issue described above.
  3. **Materials and ORM:** UE packs ORM as R = AO, G = Roughness, B = Metallic. glTF's `metallicRoughnessTexture` reads roughness from G and metallic from B, and `occlusionTexture` reads R, so one UE ORM texture can usually serve both glTF slots unchanged. This is per the glTF 2.0 spec and was not fetched this session. UE normal maps are DirectX-style (green down) while glTF expects OpenGL-style (green up), so flip the green channel. UE master-material features (layered blends, detail normals, vertex-color masks, subsurface) must be baked into plain PBR textures.
  4. **Root motion:** VAT and instanced soldiers move by instance matrix, so export in-place clips. Zero the root bone's horizontal translation in Blender, and store per-clip root velocity in a side JSON file for game logic. Keep root-motion versions only for the few skeletal "hero" soldiers if needed.
  5. **Skeleton hygiene for crowds:** remove IK, twist, facial and finger bones not needed at crowd distance (or bake them into the parent) to shrink the VAT width, and limit influences to 4.
  6. Export glTF/GLB from Blender (+Y up, apply modifiers, skin weights normalized), then run the gltf-transform pipeline (section 3).
- Check each marketplace license for web or engine-agnostic redistribution, since some Fab/UE marketplace content is restricted to Unreal Engine. Not researched here.

### Gaps
- I did not fetch the glTF 2.0 spec or a Babylon doc confirming channel conventions (ORM, normal-map Y orientation) this session. They are listed as inferences.
- I found no Babylon-specific guidance on root-motion extraction or in-place conversion.
- I did not research Fab / UE Marketplace license terms for use outside Unreal Engine.
- I did not verify whether Unreal's own glTF Exporter plugin (which would skip Blender) handles skeletal animation well enough in UE 5.x.
