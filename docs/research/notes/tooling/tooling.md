# Babylon.js level and terrain tooling for a solo WW1 (Verdun) trench game (October 2026)

Scope: a browser game on Babylon.js 9.x + TypeScript + ECS (for example bitECS), with a 0.5 m heightmap-grid simulation on a ~600 x 400 m prototype map (1200 x 800 cells, 1201 x 801 vertices) and trench networks authored as polylines that generate meshes. Real-world elevation import is deferred. Checked 2026-10-03. Repo status figures (latest release, last push) come from the GitHub API on that date. Anything marked "(unverified)" could not be confirmed from a primary source.

## 1. Babylon.js first-party tools: which help author battlefields, and which help debug them?

### Takeaway
Babylon.js is at 9.29.0 (1 Oct 2026). The first-party node editors (NGE, NME, NPE, Flow Graph) are good for authoring the *pieces* of a battlefield: procedural trench and revetment geometry, terrain shaders, and shell-burst particles. Inspector v2 is the main debugging tool, and you can extend it with your own panes. The only first-party scene composer is Babylon.js Editor v5 (free, Apache-2.0, v5.5.2 from 29 Sep 2026). It is actively maintained, but it has no terrain sculpting or painting. It also uses its own scene format and works in centimeters, so it suits prop placement and lighting. It is not a good fit for authoring a 0.5 m simulation heightgrid or a trench-polyline map format.

### Cited Findings
**Babylon.js core status**
- Latest Babylon.js release is 9.29.0, published 2026-10-01. Apache-2.0. — [BabylonJS/Babylon.js releases](https://github.com/BabylonJS/Babylon.js/releases)
- Babylon.js 9.0 was announced 26 Mar 2026. Features: clustered lighting, textured area lights, volumetric lighting, the new **Node Particle Editor (NPE)**, particle flow maps and attractors, animation retargeting, and a Frame Graph with a **Node Render Graph Editor**. It also extended Gaussian splat support (.PLY, .splat, .SPZ, .SOG/.SOGS). — [Windows Developer Blog: Announcing Babylon.js 9.0](http://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)
- 9.0 tooling (30 Mar 2026):
  - Inspector v2.
  - Viewer updates.
  - Playground multi-file editing with tabs, ESM imports, npm packages via esm.sh, and local-storage autosave.
  - Geospatial features: floating-origin "large world rendering" with Havok, a geospatial camera, 3D Tiles via 3DTilesRendererJS, and a physically based atmosphere. — [Windows Blog: Babylon.js 9.0 part 2](https://blogs.windows.com/blog/2026/03/30/part-2-babylon-js-9-0-tooling-updates-and-new-geospatial-features/)

**Babylon.js Editor v5 (Julien Moreau-Mathis)**
- v5 was officially released 3 Sep 2025, with a cinematic short made entirely in the Editor. Features include automatic KTX texture compression (11.6 GB down to 3.6 GB in the demo) and import of GLB, FBX and similar formats. — [Babylon forum: Babylon.js Editor v5](https://forum.babylonjs.com/t/babylon-js-editor-v5/60359)
- Release cadence:
  - v5.5.2 (2026-09-29)
  - v5.5.0 (2026-08-29): adds a "scene filter for preload" to `babylonjs-editor-tools`
  - v5.4.0 (2026-04-02): built-in asset Marketplace, Sketchfab login, more PBR inspector properties
  - v5.3.1 (2026-02-19): multi-selection, and physics aggregates cloned with instances
  - v5.3.0 (2026-02-02): node particle system sets — [BabylonJS/Editor releases](https://github.com/BabylonJS/Editor/releases)
- Desktop app for Windows, macOS and Linux (x64 and arm64 AppImage). Apache-2.0. Repo last pushed 2026-10-02, ~1.1k stars. — [BabylonJS/Editor README](https://github.com/BabylonJS/Editor)
- Project templates: `electron`, `nextjs`, `nuxtjs`, `solidjs`, `vanillajs`. — [Editor templates folder](https://github.com/BabylonJS/Editor/tree/HEAD/templates)
- The `vanillajs` template is a **Vite 7.3.5 + TypeScript 7.0.2** project on `@babylonjs/core` 9.27.1 with Havok. It uses `babylonjs-editor-tools` at runtime and `babylonjs-editor-cli pack` as the "generate" (export) step. — [vanillajs/package.json](https://github.com/BabylonJS/Editor/blob/HEAD/templates/vanillajs/package.json)
- Runtime model: `loadScene()` from `babylonjs-editor-tools` loads the exported scene through Babylon's `.babylon` file loader. A generated `scriptsMap` attaches TypeScript scripts to the loaded scene, meshes, transform nodes, lights and cameras. — [vanillajs/src/App.ts](https://github.com/BabylonJS/Editor/blob/HEAD/templates/vanillajs/src/App.ts)
- The docs cover:
  - scripting with decorators: "Common decorators", "Customizing scripts", "Listening events", "Linking assets"
  - the Editor CLI for deploying
  - the Fab plugin
  - texture compression, LOD collisions, shadow optimization
  - Gaussian splatting and the Sprite Manager
  - Node.js 20 LTS is required. — [Editor documentation](https://editor.babylonjs.com/documentation)
- Terrain support: the Ground mesh inspector can rebuild a ground from a heightmap texture (minHeight/maxHeight/subdivisions stored in metadata). It is the only terrain-related editor UI I found. A repo code search for "terrain" returned only MCP and ground-inspector files, with no sculpt, paint or foliage tooling. — [ground.tsx](https://github.com/BabylonJS/Editor/blob/HEAD/editor/src/editor/layout/inspector/mesh/geometry/ground.tsx)
- The Editor ships an MCP server that talks to the running editor over 127.0.0.1:3712. Tools include scene hierarchy, `set_node_transform` ("centimeters, radians"), materials, instancing and attaching TypeScript behaviors. Its stated uses include "lay out a level from modular pieces" and "scatter a forest". — [Editor mcp/manifest.json](https://github.com/BabylonJS/Editor/blob/HEAD/mcp/manifest.json)
- The Editor defaults to centimeter units in places: v5.3.0 changed "node particle system size creation to support centimeters by default". — [BabylonJS/Editor releases](https://github.com/BabylonJS/Editor/releases)

**Inspector v2**
- Inspector v2 is a ground-up React rebuild with a service-oriented, extensible architecture: custom panes, toolbar items, property editors and debug views. Expanding an 8000-node root takes about 2 minutes in v1 and is effectively instant in v2. — [Babylon forum: Introducing Inspector v2](https://forum.babylonjs.com/t/introducing-inspector-v2/60937)
- `@babylonjs/inspector` 8.49.0+ is Inspector V2. The new API is `ShowInspector` (it returns an `InspectorToken`). V1 calls such as `scene.debugLayer.show` still work through a compatibility layer. Extensibility is limited when you use the UMD package, so use the ESM packages. — [Docs: inspector.v2.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/inspector.v2.md)

**Node editors and other web tools**
- **Node Geometry Editor (NGE)**: standalone at nge.babylonjs.com, and also opens from the Inspector for any Node Geometry in the scene. — [Docs: nge.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/nge.md)
- **Node Particle Editor (NPE)**: npe.babylonjs.com. Any regular particle system can be viewed as a Node Particle System. — [Docs: npe.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/npe.md)
- **Smart Filter Editor (SFE)**: a visual tool for building Smart Filters (2D filter graphs) at sfe.babylonjs.com. — [Docs: sfe.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/sfe.md)
- **Flow Graph Editor**: visual logic authoring with run, inspect and breakpoints. — [Docs: flowGraphEditor.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/flowGraphEditor.md)
- `@babylonjs/mcp-servers` provides MCP servers for NME, NGE, Node Render Graph Editor (nrge.babylonjs.com), NPE, GUI Editor, Flow Graph Editor and Smart Filters Editor. AI clients can use them to create, edit, validate, import and export graphs. — [Docs: mcpServers.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/mcpServers.md)
- The official docs tool list includes Inspector, Inspector v2, GUI Editor, NME, NGE, NPE, SFE, Playground, Sandbox, Viewer Configurator and Flow Graph Editor. — [BabylonJS/Documentation toolsAndResources](https://github.com/BabylonJS/Documentation/tree/master/content/toolsAndResources)

### Inferences
- **Useful for authoring battlefields:**
  - NGE: parametric trench pieces such as revetment walls, sandbag rows, duckboards, wire pickets and A-frames, generated from a few inputs.
  - NME: the terrain splat shader (mud, chalk, wetness, crater rims) and trench-wall materials.
  - NPE: shell bursts, mud spray, smoke and gas.
  - Babylon.js Editor: placing props, lighting and post-processing.
  - Flow Graph Editor: simple scripted events, though gameplay logic belongs in ECS systems.
- **Mostly for debugging or iteration:**
  - Inspector v2: add custom panes for ECS state and the sim grid.
  - Playground: minimal repros, now with multi-file and npm support.
  - Sandbox: drag-and-drop glTF preview and checking.
- **Not relevant for level authoring:** the GUI Editor (HUD and menus only), Smart Filters (2D image effects) and the Node Render Graph Editor (pipeline work later, for example volumetric fog).
- The Editor's units and format don't match your plan. It works in centimeters, saves its own project format and exports `.babylon` scenes. Your sim is a 0.5 m grid with a custom map format. If you use the Editor, treat it as a cosmetic prop and lighting layer and convert units on export. Keep the heightgrid and trench polylines in your own format.
- The Editor's MCP server and `@babylonjs/mcp-servers` mean AI coding agents can drive scene composition and node graphs. That may matter for a solo developer who uses Claude Code heavily.

### Gaps
- I found no 2026-specific Sandbox changelog.
- The Editor's undo/redo coverage and the exact project and scene file schema were not checked.
- Whether NGE can take arbitrary external polyline data as a graph input, as opposed to code-side inputs, is unverified.

## 2. Terrain generators for heightmaps and splat masks: craters, erosion, export formats

### Takeaway
At 0.5 m per cell the prototype needs about a 1201 x 801 heightmap. The free tiers of the major generators sit just below that (1024 or 1025 px export caps), are non-commercial, or cannot export at all. **Gaea** (Indie $99, perpetual) is the best fit. It has Crater and Craterfield nodes, erosion, 16- and 32-bit PNG, TIFF, RAW and EXR export, and Gaea 2 is maintained through end-2027. **World Machine "Dragontail Peak"** (Indie $119, perpetual, now on Windows, macOS and Linux) is the strongest alternative. Even so, Verdun-style overlapping shell craters are probably best stamped procedurally in your own TypeScript sim code, since the game needs runtime crater deformation anyway.

### Cited Findings
**Gaea (QuadSpinner)**
- Gaea 2.3 shipped in May 2026 and was covered in mid-June. It added a macro system, 16K baking (16,384 px), a ColorThreshold mask node and a simplified Lake node. It is Windows 10+ only. — [CG Channel: Gaea 2.3](https://www.cgchannel.com/?p=176494)
- Editions, per the same article:
  - Community: free, non-commercial, 1K export cap
  - Indie: $99, 8K build cap
  - Professional: $199
  - Enterprise: $299 — [CG Channel: Gaea 2.3](https://www.cgchannel.com/?p=176494)
- Licenses are perpetual, not subscription. Professional is $199. Gaea 2 will get maintenance "through the end of 2027". Upgrades to Gaea 3 carry a permanent 30% discount. — [QuadSpinner blog: What happens to Gaea 2.0](https://blog.quadspinner.com/what-happens-to-gaea-2-0/)
- The Community Edition lets you create and view terrains up to 4096 x 4096, but exports only up to 1024 x 1024. This comes from a search snippet; the page itself failed with a TLS certificate error, so it is (unverified). — [QuadSpinner FAQ](https://quadspinner.com/FAQ)
- Gaea 3.0 Early Access was planned for July 2026, with stable "around September". It adds vector tools for roads and rivers, sand and snow simulation, and "2.7D displacement". USD/OCIO, versioning and an SDK are Pro/Enterprise only. The schedule slipped after QuadSpinner closed its Dubai office. — [CG Channel: Gaea 2.3 / roadmap](https://www.cgchannel.com/?p=176494); [QuadSpinner blog: What happens to Gaea 2.0](https://blog.quadspinner.com/what-happens-to-gaea-2-0/). An older help article still says "production ready by June 2026", so it is stale. — [QuadSpinner help: When will Gaea 3 be released?](https://help.quadspinner.com/article/124-when-will-gaea-3-be-released)
- Gaea has a **Crater** node (single craters, movable with a gizmo, chainable) and a **Craterfield** node, plus a "Collapsed Crater" quickstart that combines Crater with Erosion. — [Gaea docs: Collapsed Crater quickstart](https://docs.quadspinner.com/Learning/QuickStarts/Collapsed-Crater.html)
- Export formats: OpenEXR (32-bit), TIFF (32/16-bit), PNG (32/16/8-bit) and RAW (32/16-bit). Gaea computes in 32-bit float, and 16-bit export can show stepping on gentle slopes. — [Gaea docs: File Formats](https://docs.quadspinner.com/Guide/Using-Gaea/FileFormats.html)

**World Machine**
- "Dragontail Peak" shipped as build 4059 (18 May 2026), with vector-displacement "true 3D" terrain (overhangs, caves). Build 4065 (25 Jul 2026) added macOS and Linux and a rebuilt UI.
- Editions: Free ($0, non-commercial, max 1025 x 1025), Indie ($119, 4 CPU threads), Professional ($299, no CPU limit, tiled export).
- Exports glTF and OBJ meshes, and EXR, PNG and TIFF for heightmaps and splat maps. — [CG Channel: World Machine Dragontail Peak](https://www.cgchannel.com/2026/07/world-machine-software-ships-world-machine-dragontail-peak/)
- The 2024 "Hurricane Ridge" release added new erosion and thermal-weathering models. This comes from a search summary, so it is (unverified). — [CG Channel: Dragontail Peak preview](https://www.cgchannel.com/2026/05/world-machine-dragontail-peak-preview/)

**World Creator (BiteTheBytes)**
- 2026.4 (28 Apr 2026) added a free **Community Edition** that is "feature-complete, but export-disabled", which makes it effectively an unlimited trial. It also added math expressions in fields, terrain normal blending and decals. It is GPU-based. — [CG Channel tag: World Creator 2026.4](https://www.cgchannel.com/tag/world-creator-2026-4/); [Digital Production](https://digitalproduction.com/2026/04/30/world-creator-2026-4-adds-expressions-and-decals/)
- Pricing per CG Channel (2026.4), with revenue limits:
  - Indie: $99 perpetual or $49/yr, under $100k/yr
  - Professional: $199 or $99/yr, under $200k
  - Studio: $399 or $199/yr, under $1M
  - Enterprise: $1,499 or $799/yr — [CG Channel tag: World Creator 2026.4](https://www.cgchannel.com/tag/world-creator-2026-4/)
- **Conflict:** CG Channel's 2026.3 coverage (18 Mar 2026) says the release "removed revenue caps on the Indie edition". World Creator's own docs say Indie is for individuals with revenue up to $200,000. The revenue terms are inconsistent across sources. — [CG Channel tag (2026.3)](https://www.cgchannel.com/tag/dted/); [World Creator docs: Purchase](https://docs.world-creator.com/getting-started/purchase)

**Instant Terra (Wysilab)**
- Perpetual licenses cost $149 (8K export) or $199 (unlimited). Rentals run from $24.90/mo (Indie, 2K cap) to $550/mo (Enterprise). The page date is unknown. — [Wysilab: perpetual licenses](https://instantterrapro.wysilab.com/instant-terra-releases/perpetual-licenses-now-available)
- The last release I could confirm is 2.3 (9 Jul 2021), which added thermal, multi-scale and "mountain ageing" erosion. Current maintenance status is unclear. — [CGPress: Instant Terra 2.3](https://cgpress.org/archives/instant-terra-2-3.html)

**Houdini (SideFX)**
- Apprentice is free, non-commercial only, with watermarked renders. Indie is for creators under $100K USD/yr, up to 3 licenses per studio, and was re-priced with Houdini 21 (the page shows no figure). — [SideFX: Buy](https://www.sidefx.com/buy/)
- Indie is reported as $269/yr or $399 for two years. This came from search aggregation, not the SideFX page, so it is (unverified). — [CGPress (Houdini Indie)](https://cgpress.org/archives/houdini-indie-now-allows-rendering-up-to-4k-plus-installation-on-a-2nd-computer.html)

**Blender and free tools**
- A.N.T. Landscape ("Another Noise Tool") is now an extension rather than bundled (it was bundled through Blender 4.1). v0.2.0 was released 14 May 2024 and needs Blender 4.2 LTS+. It is GPL-2.0+ and listed with "limited support". — [Blender Extensions: A.N.T. Landscape](https://extensions.blender.org/add-ons/antlandscape/)
- TerreSculptor 2.0 (Jan 2020) is free for personal, academic and commercial use, Windows only. It has erosion and other transform tools, and imports and exports PNG, TIF, OBJ and DEM/GeoTIFF/HGT. — [BlenderNation: TerreSculptor 2.0](https://www.blendernation.com/2020/01/17/check-out-open-use-terrain-editor-terresculptor-2-0/); [CG Channel tag](https://www.cgchannel.com/tag/hgt/)

### Inferences
- **Size fit:** the free tiers of Gaea (1024 export) and World Machine (1025) fall just short of 1201 x 801. You could export 1024 and resample (about 0.59 m per pixel over 600 m), but both are non-commercial, so a shipped game needs Gaea Indie ($99) or World Machine Indie ($119). The World Creator Community Edition cannot export, so it is only useful for evaluation.
- **16-bit precision is ample.** With a 100 m elevation range, 16-bit PNG gives about 1.5 mm per step, far finer than the 0.5 m cell. Use 16-bit PNG or RAW at runtime and 32-bit EXR or TIFF as the pipeline master.
- **Shell-torn ground:** use an external generator for the macro landform (ridges, ravines, the Meuse valley feel), plus erosion and masks for mud, chalk and woods. Generate the dense overlapping crater fields in your own TypeScript sim with a crater "stamp" function. That way the same code drives authored and runtime craters, and crater history stays in your map data.
- **Houdini:** very capable but heavy to learn for one developer. Only worth it if you already know it.

### Gaps
- World Creator's export formats and maximum Indie resolution were not verified.
- The official Houdini Indie 2026 price was not on the SideFX page.
- Instant Terra's current version and Wilbur's status could not be found.
- It is unconfirmed whether Gaea 3.0 actually reached stable by Oct 2026.
- The Gaea Community export cap comes from a search snippet only.

## 3. Using Blender as a level editor (glTF extras, curves to polylines, Babylon import)

### Takeaway
Blender is the lowest-risk external level editor. Custom properties export as glTF `extras`, and Babylon's glTF loader copies `extras` into `node.metadata.gltf.extras` (also for cameras and materials). The main snag is that **curves are not exported**: trench centerlines must be converted to mesh edges, exported as glTF LINES via "Loose Edges", or dumped to your own JSON with a small Python exporter. No maintained Blender-to-Babylon component workflow was found. Bevy's "Skein" (and the older Blenvy) is the pattern to copy.

### Cited Findings
- Blender glTF exporter behavior:
  - Custom properties export from most objects as glTF `extras` when you enable `Include > Custom Properties`.
  - "Curves and other non-mesh data are not preserved, and must be converted to meshes prior to export."
  - The `Loose Edges` option exports loose edges as lines, and `Loose Points` exports glTF points.
  - Instances can use `EXT_mesh_gpu_instancing`.
  - Blender collection exporters write collection custom properties as scene extras.
  - The exporter can be extended with Python user extensions (see `example-addons`). — [glTF-Blender-IO docs (scene_gltf2.rst)](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst)
- glTF-Blender-IO is Apache-2.0 and active (pushed 2026-10-03), with release branches up to `blender-v5.2-release`. — [KhronosGroup/glTF-Blender-IO](https://github.com/KhronosGroup/glTF-Blender-IO)
- Babylon's glTF loader extension `ExtrasAsMetadata` stores glTF extras as `babylonObject.metadata.gltf.extras` for nodes, cameras and materials. — [Babylon.js source: ExtrasAsMetadata.pure.ts](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/loaders/src/glTF/2.0/Extensions/ExtrasAsMetadata.pure.ts)
- Skein is a Bevy plugin plus Blender extension that stores reflected component data in glTF extras and instantiates components on spawn. v0.3.0-rc.1 was released 12 Sep 2025. — [bevy_skein crate info](https://rust-digger.code-maven.com/crates/bevy_skein); [rust-adventure/skein](https://gittrend.io/repo/rust-adventure/skein)
- Blenvy, the earlier Bevy "Blender as editor" toolkit, last released `blenvy_v0.1.0-alpha.1` in Aug 2024 (repo pushed Mar 2026). It is Bevy-specific. — [kaosat-dev/Blenvy](https://github.com/kaosat-dev/Blenvy)
- The general pattern is to put custom properties in Blender, enable the export option, and have the engine loader consume the extras. — [Vulkan docs: Metadata & Physics Extras](https://docs.vulkan.org/tutorial/latest/Advanced_glTF/Scene_Graph_Hierarchy/04_metadata_and_physics_extras.html)

### Inferences
**Suggested Blender workflow:**
- One collection per layer: Trenches, Wire, Dugouts, Spawns, Objectives, Props.
- Empties with custom properties for markers, for example `{ "kind": "spawn", "side": "FR" }`.
- Trench centerlines as edge-only meshes. Use custom properties on the object for trench type and depth, or vertex attributes for per-vertex width.
- Export a `.glb` with Custom Properties and Loose Edges on.
- A Node "map compiler" script in your repo reads the glb and writes your custom map JSON plus the binary heightgrid. Babylon then loads only the cosmetic glb props.

**Cautions:**
- Keep the heightmap as an image (Gaea, World Machine or your own tool), not a Blender mesh. Make Blender import the same heightmap as a displaced grid purely as a reference surface for snapping.
- Blender is Z-up while glTF and Babylon are Y-up. The exporter converts by default, but your compiler must use glTF coordinates consistently.
- The effort is a small Blender add-on (a property panel with fixed enums so you don't typo extras keys) plus a TypeScript schema for extras, validated with a type guard at load time.

### Gaps
- Blender 5.x release dates were not checked (only the exporter's release branches).
- I did not find a maintained three.js or Babylon equivalent of Skein/Blenvy. Community three.js Blender-to-level tools were not verified.
- The status of the legacy Babylon Blender exporter was not researched.

## 4. Unreal, Unity or Godot purely as level editors

### Takeaway
They are feasible for laying out static meshes, but a poor fit for this project. Their terrain systems and splines don't go through glTF, metadata support varies, and each adds a heavy install and a second mental model. If you go this way, Unity with UnityGLTF is the most extensible, Godot is the lightest, and Unreal's exporter has the narrowest coverage for level data.

### Cited Findings
- **Unreal Engine:** the glTF exporter covers Materials, Static and Skeletal Meshes, Animation and Level Sequences, Level Variant Sets, and Scene, Static Mesh, Skeletal Mesh, Camera and Light components. Landscape, foliage, splines, Blueprints and actor tags are not documented as supported. It does not support arbitrary material expressions; complex materials must be baked. — [Epic docs: How the glTF exporter handles UE content](https://dev.epicgames.com/documentation/unreal-engine/how-the-gltf-exporter-handles-unreal-engine-content)
- **Godot 4.7:** export via Scene > Export As > glTF 2.0 Scene. Known limits: no particles, no ShaderMaterials, no 2D scenes. Runtime saving is possible. The docs suggest blocking out a level with CSG and exporting it. — [Godot docs: Exporting 3D scenes](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/exporting_3d_scenes.html)
- **Unity:** UnityGLTF (Khronos, MIT) imports and exports glTF. It has "custom plugins and callbacks" for import and export and supports WebGL export. Latest release 2.20.0 (31 Jul 2026). It can coexist with Unity's glTFast. — [KhronosGroup/UnityGLTF](https://github.com/KhronosGroup/UnityGLTF)

### Inferences
- **Pitfalls:**
  - Handedness and unit conversions (Unreal is centimeters and Z-up).
  - Engine terrains are lost.
  - Metadata needs custom export plugins (Unity) or isn't documented (Godot, Unreal).
  - Materials must be re-authored for Babylon anyway.
  - Two engines' worth of updates to maintain.
- **Better approach:** for a solo developer the export work roughly equals writing a minimal in-browser editor, and the in-browser editor runs on your real sim. Use these engines only if you already know one well.

### Gaps
- Whether Godot exports node metadata as glTF extras was not confirmed.
- Unity's terrain-to-heightmap export path and current Unity licensing were not researched.

## 5. 2D map-layer editors (Tiled, LDtk) for grid layers on a 3D heightmap game

### Takeaway
They are viable, and Tiled is the stronger pick. It is actively released (v1.12.2, May 2026) and has object layers with **polylines**, polygons, points and capsules, custom properties and classes, and JSON export. A top-down Tiled map with a hillshade image of the heightmap as background works well for 2.5D data: trench polylines, zones, spawn areas and surface-type grids. LDtk's IntGrid suits surface types, but it has had no release since January 2024.

### Cited Findings
- **Tiled:** v1.12.2 (2026-05-27), v1.12.1 (2026-03-25), v1.12.0 (2026-03-13). Repo pushed 2026-09-25, ~12.9k stars. — [mapeditor/tiled releases](https://github.com/mapeditor/tiled/releases)
- Tiled object layers support rectangles, points, ellipses, capsules, polygons, **polylines**, tiles and text. "All objects can have custom properties", and objects can use custom classes. Some features are marked "New in Tiled 1.12". — [Tiled manual: Working with Objects](https://doc.mapeditor.org/en/stable/manual/objects/)
- **LDtk:** layer types are IntGrid (grids of integer values, each with a color and optional identifier), Tiles, Entities (free or grid-placed) and Auto layers. Export options include JSON, "Super simple export" and Tiled TMX. — [LDtk docs: Layers](https://ldtk.io/docs/general/editor-components/layers/)
- LDtk's last release is v1.5.3 (2024-01-15). Recent commits (Jul 2026) are CI and library-compatibility fixes. MIT license. — [deepnight/ldtk](https://github.com/deepnight/ldtk)

### Inferences
- Map 1 Tiled tile to one 0.5 m cell (a 1200 x 800 tile layer) for a surface-type layer (mud, chalk, wood, road, water), or use coarser 2 m tiles for zones.
- Use Tiled polylines with custom properties (`trenchType`, `depth`, `revetment`, `fireStep`) for trench centerlines, polygons for wire belts, objective zones and woods, and points for spawns, MGs and dugout entrances.
- Tiled's JSON (TMJ) is easy to convert to your custom format in a build script.
- You lose 3D context while authoring. Mitigate that with a hillshade or contour PNG generated from the heightmap as an image layer, plus hot-reload into the running Babylon game.
- LDtk's IntGrid and auto-layers are nicer for painted grids, but the stalled releases make it the riskier long-term choice.

### Gaps
- Exact LDtk entity field types (point arrays or paths) were not confirmed.
- Tiled's maximum practical map size and performance at 1200 x 800 tiles was not tested.

## 6. Babylon.js terrain options: Dynamic Terrain, chunked ground, NodeMaterial splatting, community editors

### Takeaway
No maintained terrain extension or terrain editor exists for Babylon 9. The community Dynamic Terrain extension's last code change was in April 2024, and it is distributed as a script-tag JS file. For a 1200 x 800 grid the realistic path is a custom chunked mesh rebuilt from the sim heightgrid, with a NodeMaterial or ShaderMaterial splat driven by a surface-type texture. `CreateGroundFromHeightMap` plus the library `TerrainMaterial` (3 textures and an RGB mixmap) is fine for day-one prototyping.

### Cited Findings
- `MeshBuilder.CreateGroundFromHeightMap(name, url, options)` has options including width, height, subdivisions, minHeight, maxHeight and an `onReady` callback. — [Docs: ground_hmap.md](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/creation/set/ground_hmap.md)
- The materials-library `TerrainMaterial` blends 3 diffuse textures (plus optional bump maps) using an RGB mixmap ("texture splatting"). — [Docs: terrainMat.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/assetLibraries/materialsLibrary/terrainMat.md)
- **Dynamic Terrain:** a camera-following ribbon mesh that morphs over a large data map. It is installed by downloading `dynamicTerrain.js` and loading it after Babylon via a script tag. An ES6 TypeScript port exists only as a community gist. — [Docs: dynamicTerrains.md](https://github.com/BabylonJS/Documentation/blob/master/content/communityExtensions/dynamicTerrains.md)
- The latest commit touching `DynamicTerrain` in BabylonJS/Extensions is 2024-04-28 (a terminology change), and the one before that is 2023-05-19. — [BabylonJS/Extensions DynamicTerrain history](https://github.com/BabylonJS/Extensions/commits/master/DynamicTerrain)
- Community editors are dormant or of unclear status:
  - "Realm Crafting", an open-source game editor whose forum thread mentions a heightmap editor with brush drawing and planned undo/redo — [Babylon forum: Realm Crafting](https://forum.babylonjs.com/t/open-source-realm-crafting-game-editor/35639/197)
  - "TerrainEditor V3.0", from about 2020, with heightmap import and 8-texture painting — [Babylon forum: TerrainEditor V3.0](https://forum.babylonjs.com/t/terraineditor-v3-0/9451)
  - GitHub searches for "babylonjs terrain editor" and "terrain babylonjs" found no repo updated in 2025-2026. The only hit was `darrylryan/BabylonTerrain`, last updated 2022. — [GitHub search](https://github.com/search?q=babylon+terrain&type=repositories)
- Babylon 9 also has floating-origin large-world rendering and 3D Tiles. These matter later if real-world elevation import comes back, but not at 600 x 400 m. — [Windows Blog: Babylon.js 9.0 part 2](https://blogs.windows.com/blog/2026/03/30/part-2-babylon-js-9-0-tooling-updates-and-new-geospatial-features/)
- Babylon has crowd navigation docs including a "v2" section, relevant for AI pathing over trenches. — [Docs: crowdNavigation/v2](https://github.com/BabylonJS/Documentation/tree/master/content/features/featuresDeepDive/crowdNavigation/v2)

### Inferences
- **Grid sizing:** 1201 x 801 vertices is about 0.96 M vertices. Chunk it, for example into 64 x 64 m chunks of 128 x 128 cells (about 10 x 7 chunks), so a shell impact re-uploads only 1–4 chunk vertex buffers. Optionally add a coarser LOD for distant chunks.
- **Trench geometry:** trench cuts belong in the heightgrid as lowered cells, or as separate NGE or TypeScript-generated wall meshes along the polylines that sit over a carved channel. Pick one source of truth, the sim grid, and derive meshes from it.
- **Splatting:** use a NodeMaterial (built in NME, then exported as JSON or code) that samples a surface-type or weights texture written by the sim. `TerrainMaterial` caps at 3 layers, too few for mud, chalk, grass, rubble and water, so it is prototype-only.
- **Dynamic Terrain:** skip it. It targets endless terrain, its distribution format fits poorly with ESM, Vite and TypeScript 7, and it is effectively unmaintained.

### Gaps
- No benchmarks were found for chunked dynamic ground updates in Babylon 9 on WebGPU vs WebGL2.
- Babylon docs on GreasedLine (useful for drawing trench polylines in the editor) were not located in the docs tree, so its current status is unverified.

## 7. Building a custom in-game editor: UI, gizmos, undo/redo, ECS inspectors

### Takeaway
Babylon itself provides the hard 3D parts: GizmoManager with position, rotation and scale gizmos, a BoundingBox gizmo, and an extensible Inspector v2. The DOM UI layer is well served by Tweakpane or lil-gui (vanilla) or Leva (React). Dear ImGui now has a maintained WebGPU-capable JS binding, jsimgui. No maintained devtools or inspector exists for bitECS or Koota, so plan to write a small Inspector v2 pane. Undo/redo should be a command or patch log over your map document, not over the ECS world.

### Cited Findings
- `GizmoManager` attaches the enabled gizmo to whatever the pointer selects. You can restrict it with `attachableMeshes`, or drive it with `attachToMesh` and `usePointerToAttachGizmos = false`, and switch to world orientation with `updateGizmoRotationToMatchAttachedMesh = false`. Position, scale and rotation gizmos work on TransformNodes and Bones. `BoundingBoxGizmo` can wrap glTF meshes. — [Docs: gizmo.md](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/mesh/gizmo.md)
- Inspector v2 supports static and dynamic extensions: custom panes, toolbar items and property editors. — [Docs: inspector.v2.md](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/inspector.v2.md); [Babylon forum](https://forum.babylonjs.com/t/introducing-inspector-v2/60937)
- UI library status (GitHub API, 2026-10-03):
  - Tweakpane: latest release 4.0.5 (2024-11-03), repo pushed 2026-03, MIT, ~4.6k stars — [cocopon/tweakpane](https://github.com/cocopon/tweakpane)
  - lil-gui: last push 2025-10, MIT, ~1.6k stars — [georgealways/lil-gui](https://github.com/georgealways/lil-gui)
  - Leva (React): 0.10.1 (2025-10-31), last push 2025-11, MIT, ~6.2k stars — [pmndrs/leva](https://github.com/pmndrs/leva)
  - flyover/imgui-js: last push 2023-07 (stale) — [flyover/imgui-js](https://github.com/flyover/imgui-js)
  - jsimgui: "JavaScript bindings for Dear ImGui. Usable with WebGL, WebGL2 and WebGPU", updated 2026-09-10, about 75 stars, so a small project — [mori2003/jsimgui](https://github.com/mori2003/jsimgui)
- ECS library status (GitHub API, 2026-10-03):
  - **bitECS** (MPL-2.0): the 0.4.0 tag points to a commit dated 2025-08-19. Core, serialization and a legacy 0.3 module; relations. Last main-branch commit 2025-12-06; repo pushed 2026-08. — [NateTheGreatt/bitECS](https://github.com/NateTheGreatt/bitECS); [bitECS 0.4.0 README](https://cdn.jsdelivr.net/npm/bitecs@0.4.0/README.md)
  - **Koota** (pmndrs, ISC): v0.6.6 (2026-08-25), pushed 2026-10-01. Describes itself as "real-time state management for React and TypeScript", with `core`, `react` and `collections` packages. — [pmndrs/koota](https://github.com/pmndrs/koota)
  - **Becsy** (MIT, multithreaded): released 0.16.1 on 2026-10-02. — [lastolivegames/becsy](https://github.com/lastolivegames/becsy)
  - **Miniplex** (MIT): last real code change 2023-10; only dependency chores in Apr 2026; latest tags `v0.8.0-2`. Effectively dormant. — [hmans/miniplex](https://github.com/hmans/miniplex)
- No devtools or browser extension for bitECS or Koota turned up. Older precedents include ECSY DevTools, a browser DevTools tab for ECSY. — [search results incl. Firefox add-ons](https://addons.mozilla.org/uk/firefox/addon/ptahjs-devtools/)

### Inferences
- **Editor architecture for one developer:**
  - The editor is a mode of the game, not a separate app.
  - The "map document" (heightgrid, surface grid, trench polylines, entity placements) is plain serializable data, and the ECS world is rebuilt or patched from it.
  - Undo/redo becomes a stack of document commands (or immutable patches), which avoids snapshotting typed-array ECS stores.
- **Tools:**
  - GizmoManager for props and markers.
  - A custom pointer-ray polyline tool for trenches (pick the ground, append a vertex, drag handles).
  - Heightgrid brushes (raise, lower, smooth, crater stamp) operating on the sim grid, followed by dirty-chunk remesh.
- **UI:** Tweakpane or lil-gui for brush and tool parameters, a small DOM toolbar, and Inspector v2 extensions for an ECS entity and component browser and a sim-grid overlay toggle. Inspector v2 is React-based, so React UI fits if the game shell is React.
- **ECS choice:** bitECS 0.4 is fine, but its release cadence is slow. Koota is the most active choice in the TypeScript ecosystem, though it is React-oriented. Becsy is active but niche.

### Gaps
- No dedicated undo/redo library was evaluated.
- No bitECS 0.4 or Koota devtools were found. If one exists, it isn't discoverable via GitHub or web search.

## 8. Web-native level editors worth considering

### Takeaway
None is Babylon-native apart from the Babylon.js Editor. PlayCanvas Editor (now open-source) and Needle Engine (three.js-based, Unity and Blender integrations) are capable but lock you into another engine. The three.js editor is a generic glTF scene editor. Their only interop with Babylon is glTF, so they add little over Blender or a custom in-game editor.

### Cited Findings
- PlayCanvas Editor is open source: "Browser-based visual editor for building WebGL, WebGPU, WebXR apps", MIT, v2.33.3 (2026-09-28). It is tied to the PlayCanvas engine. — [playcanvas/editor](https://github.com/playcanvas/editor)
- three.js latest is r186 (2026-09-24), MIT. The three.js editor lives in the repo. — [mrdoob/three.js](https://github.com/mrdoob/three.js)
- Needle Engine is built on three.js with Unity and Blender integrations. Its support repo shows release `6.0.0-alpha.4` (2026-10-02). — [Needle Engine docs](https://engine.needle.tools/docs/three); [needle-engine-support releases](https://github.com/needle-tools/needle-engine-support/releases)

### Inferences
- These are only useful as glTF scene composers. Blender does that job better and keeps you engine-neutral.

### Gaps
- Needle Engine pricing (the pricing page didn't render) and PlayCanvas Editor hosted-plan pricing were not verified.

## Recommended starter toolchain

Realistic for one developer, cheapest first. All prices are one-time unless noted.

1. **Engine and debug:** Babylon.js 9.x ESM (`@babylonjs/core`, `@babylonjs/loaders`), Vite and TypeScript. Use **Inspector v2** (`@babylonjs/inspector` 8.49+, `ShowInspector`) from day one, and add a custom pane for ECS entities and the sim grid. Free.
2. **Terrain base:** start with procedural noise plus your own **crater-stamp** brush in TypeScript, writing the 1201 x 801 heightgrid directly.
   - If you want art-directed landforms, buy **Gaea Indie ($99 perpetual)**. Export 16-bit PNG or RAW for runtime and 32-bit EXR as master, and use its masks for the surface-type layer.
   - Use World Machine Indie ($119) instead if you need macOS or Linux.
3. **Rendering terrain:** a custom chunked mesh (about 64 m chunks) rebuilt from the sim grid, with an **NME-authored NodeMaterial** splat driven by a surface-type texture. Use `CreateGroundFromHeightMap` and `TerrainMaterial` only for the first week. Skip Dynamic Terrain.
4. **Map layers and trench polylines:** **Tiled** (free), with a hillshade PNG underlay. Use polylines plus custom properties for trenches, polygons for wire, zones and woods, points for spawns, and a 0.5 m or 2 m tile layer for surface types. A small build script converts TMJ into your custom map format.
5. **3D props and set dressing:** **Blender** (free) with glTF `Include > Custom Properties`. Props come in as `.glb`, and markers as empties with extras that Babylon reads from `metadata.gltf.extras`. Add Loose Edges export only if you'd rather author trenches in 3D than in Tiled.
6. **Procedural trench pieces and effects:** **NGE** for parametric revetments and sandbags, and **NPE** for shell bursts and smoke. Optionally use `@babylonjs/mcp-servers` so an AI agent can edit the graphs.
7. **In-game editor (start in month 1–2):** GizmoManager, a polyline tool and heightgrid brushes, **Tweakpane** or **lil-gui** for parameters, and command-based undo/redo over the map document. This eventually replaces most of steps 4–5.
8. **Optional:** **Babylon.js Editor v5** (free) only as a prop, lighting and post-processing layer. Mind its centimeter units and `.babylon` format. Don't make it the source of truth for the map.
9. **Avoid for now:**
   - Unreal, Unity or Godot as level editors, since terrain and metadata get lost in export.
   - LDtk, which has had no release since Jan 2024.
   - Dynamic Terrain, which is unmaintained.
   - World Creator Community, which cannot export.
   - Houdini, unless you already know it.
