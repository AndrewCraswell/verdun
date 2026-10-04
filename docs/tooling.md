# Tooling

Software, services and AI tooling for development and asset work. How the asset tools fit together is in the
[asset pipeline](assets/pipeline.md); prices for paid tools are tracked in the [shopping list](assets/shopping-list.md).

## Software to install

| Software                                                                                     | Why                                                                                                       | Cost                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ |
| [Epic Games Launcher](https://store.epicgames.com/download) + **Unreal Engine 5**            | Most Fab packs ship in Unreal format. Unreal is only used to export them as glTF. Needs 60–100 GB of disk | Free                     |
| [Blender](https://www.blender.org/download/) (latest LTS)                                    | Cleaning up assets, generating LODs, rebaking textures, retargeting animation                             | Free                     |
| [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases)                        | Compresses textures to KTX2. gltf-transform needs its `ktx` tool on the PATH                              | Free                     |
| [Tiled](https://www.mapeditor.org/)                                                          | Drawing trench lines, zones, spawn areas and surface layers                                               | Free (pay what you want) |
| [Substance 3D Painter](https://store.steampowered.com/search/?term=substance%203d%20painter) | Re-texturing uniforms to consistent horizon blue and feldgrau                                             | Paid, see shopping list  |
| [uv](https://docs.astral.sh/uv/getting-started/installation/)                                | Required by the Blender MCP server                                                                        | Free                     |
| Node 24, pnpm 11, Git, VS Code                                                               | Development. gltf-transform and Babylon.js install per project through pnpm                               | Free                     |

### Optional, only if needed

| Software                                              | When                                                    | Cost                    |
| ----------------------------------------------------- | ------------------------------------------------------- | ----------------------- |
| [Gaea](https://quadspinner.com/) Indie                | Art-directed landforms with crater and erosion tools    | Paid, see shopping list |
| [Cascadeur](https://cascadeur.com/plans) Indie        | Cleaning up captured animation (hand-to-rifle contact)  | Paid, see shopping list |
| [Babylon.js Editor](https://editor.babylonjs.com/) v5 | Placing props and lighting. It has no terrain sculpting | Free                    |

## Web services

| Service                                                                          | Use                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Fab](https://www.fab.com/)                                                      | Buying assets; free Megascans                                      |
| [Mixamo](https://www.mixamo.com)                                                 | Free base animations (needs an Adobe account)                      |
| [Uthana](https://uthana.com/pricing)                                             | Video-to-motion capture for WW1-specific animations ($0.05/second) |
| [Poly Haven](https://polyhaven.com/textures), [ambientCG](https://ambientcg.com) | CC0 textures                                                       |
| [Railway](https://railway.com)                                                   | Playtest hosting, and later sector servers                         |

## Babylon.js built-in tools

**Inspector v2**: press the backquote key (`` ` ``) in the dev build to open or close it. It is built on Fluent UI,
which is acceptable for a dev-only tool: it lives in `apps/client/src/dev/` and is imported lazily inside an
`import.meta.env.DEV` branch, so it never reaches the production bundle. Closing it logs two harmless "Keyborg" errors
from Fluent's own cleanup. The dev build also exposes `window.verdun` (`engine`, `sim`, `view`) in the browser console.

| Tool                   | Use                                                 |
| ---------------------- | --------------------------------------------------- |
| Node Material Editor   | Terrain splat material, uniform and mud shaders     |
| Node Particle Editor   | Smoke, gas, shell bursts, muzzle flashes            |
| Node Geometry Editor   | Parametric trench pieces (revetments, sandbag rows) |
| Playground and Sandbox | Quick experiments and checking exported glTF files  |

## MCP servers

### Recommended

**Babylon.js MCP servers** (official). Lets Claude build node materials, particles, geometry and GUI in Babylon's
editors and save them as JSON in the repo.
[Announcement](https://forum.babylonjs.com/t/babylon-js-mcp-servers-are-out/63591),
[docs](https://github.com/BabylonJS/Documentation/blob/master/content/toolsAndResources/mcpServers.md).

```bash
claude mcp add babylonjs-nme -- npx -y @babylonjs/mcp-servers nme
```

```bash
claude mcp add babylonjs-npe -- npx -y @babylonjs/mcp-servers npe
```

```bash
claude mcp add babylonjs-nge -- npx -y @babylonjs/mcp-servers nge
```

Other servers in the package: `nrge` (Node Render Graph), `gui`, `flow-graph`, `smart-filters`.

**MCP for Blender** ([ahujasid/blender-mcp](https://github.com/ahujasid/blender-mcp)). Lets Claude drive Blender: reduce
models to lower detail levels, combine multi-tile textures, fix scale, batch-export glTF. Requires uv.

```bash
uvx mcp-for-blender install-addon
```

Then in Blender: Edit, Preferences, Add-ons, enable "MCP for Blender". In the 3D viewport press N, open the "MCP for
Blender" tab and click Start MCP Server. Then:

```bash
claude mcp add blender uvx mcp-for-blender
```

Security: its `execute_blender_code` tool runs any Python in Blender, and the add-on's socket has no authentication.
Keep it on localhost, only use it with project files, and save before using it.

**Context7** ([upstash/context7](https://github.com/upstash/context7)). Current library documentation, useful because
Babylon.js 9 is newer than most model training data.

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

### Optional

**Unreal MCP**, for example [UEMCP](https://pypi.org/project/uemcp/), which uses Unreal's built-in Python remote
execution and needs no plugin. Only useful for batch-exporting Fab packs to glTF. A plain Unreal Python export script
does the same job, so add it only if exports become tedious.

### Already available in Claude Code desktop

- Built-in browser, for playtesting and checking UI changes.
- Railway MCP, for deploys.
- GitHub through the `gh` CLI.

Fab, Mixamo, Tiled and Gaea have no useful MCP servers. Tiled maps are JSON, so Claude reads and writes them directly.

## Editor plan

No off-the-shelf tool authors trenches, so the battlefield editor grows inside the game client
([architecture](architecture.md#repository-layout)). Whether Tiled is good enough for trench layout is an
[open question](open-questions.md#technical).

1. **Start**: Tiled for trench polylines, zones and surface layers; a build script converts them to our map format.
   Generated or Gaea heightmap for landforms.
2. **Grow**: dev-mode in-game editor with Babylon gizmos, a trench polyline tool, height and crater brushes, Tweakpane
   controls and command-based undo.
3. **Eventually**: the in-game editor replaces Tiled. The map format is ours from day one, so this is a tooling change,
   not a data migration.
