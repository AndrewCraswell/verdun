# AGENTS.md

Guidance for coding agents working in this repository. Read [README.md](README.md) and the docs it links before making
changes; they record decisions already made. Don't re-litigate them; propose changes in
[open questions](docs/open-questions.md).

## Project

Browser-based massively multiplayer WW1 trench warfare game (Verdun). Solo developer. Currently stage 1: single-player
prototype, one battlefield, one human plus bots. See [roadmap](docs/roadmap.md).

## Conventions

- **TypeScript everywhere.** pnpm (>=11) on Node (>=24), Turborepo for tasks.
- **Lint:** oxlint (not eslint). **Format:** oxfmt (not prettier). **Test:** Vitest. **Build:** Vite.
- **Renderer:** Babylon.js 9. Use ES module imports from `@babylonjs/*`.
- **Simulation is pure:** `packages/sim` has no DOM, rendering or networking imports. Fixed timestep, deterministic
  within a tick, everything driven by commands, world state serializable and versioned.
- **ECS:** game state lives in components (typed arrays); systems are functions over queries.
- **Narrow with type guards, not `as`.**
- **Verify UX changes in the built-in browser** before calling them done; tests alone aren't enough. The dev build
  exposes `window.verdun` (`engine`, `sim`, `view`, `control`, `fog`, `lineOfSight`, `trace`) for inspecting the running
  game, and the backquote key toggles Babylon's Inspector. The game opens on its front door, which pauses the battle:
  load `?play` to go straight into the line.
- **No dots as separators in copy.** Player-facing text never strings facts together with a middle dot (·), bullet (•)
  or similar, as in "8 men · Holding": write it as words ("8 men, holding"), split it over lines, or lay it out with
  space or a rule in the design.
- **No Fluent UI in our own UI.** Babylon's Inspector v2 uses Fluent internally; that's acceptable because it is a
  dev-only tool that never ships to players.
- **Babylon imports are deep** (`@babylonjs/core/Meshes/mesh`), never the `@babylonjs/core` barrel, which defeats
  tree-shaking.
- **Only install a dependency when code uses it**; knip fails the verify loop on unused dependencies and exports.

## Commands

- `pnpm dev`: run the client at http://localhost:5173
- `pnpm server`: run the sector server, which steps the battle on the real clock and saves it every minute to
  `apps/server/data/verdun.db` (`VERDUN_DB` moves it). No players connect to it yet.
- `pnpm verify`: format check, lint, types, knip, tests with coverage, build. Must pass before finishing.
- `pnpm format`: apply oxfmt
- `pnpm perf`: build HEAD, play it in an off-screen Chrome at 1920×1080 and report fps, the tracer's CPU hot spots and
  each GPU pass's milliseconds, per scenario (`--only "day;night"`, `--shots dir`, `--eval expr`). The app's own pane
  and background windows run at 30 fps, so measure here. One run at a time on the machine; check `--shots`, since a
  setting changed at runtime can leave a blank frame that measures fast.
- `pnpm lockfile:normalize`: this machine's VPN forces npm through a Microsoft package feed, which writes feed tarball
  URLs and SHA-1 hashes into `pnpm-lock.yaml`. CI installs from public npm and rejects them. The pre-commit hook runs
  this automatically whenever the lockfile is staged; never commit a lockfile containing `tarball:` feed URLs.
- Git hooks (lefthook): pre-commit runs `oxlint --fix` and `oxfmt` on staged files; pre-push runs `check:types`. Don't
  use `--no-verify`.

## Shared working tree

Several agents work in this checkout at once, all on `main`.

- **Commit only your own changes.** Stage by path, never `git add -A` or `git add .`.
- **Never partially stage a file another agent is also editing.** Lefthook hides unstaged changes as a patch while the
  hooks run; if a hook then reformats the staged part, the patch can't reapply and the other agent's edits vanish from
  the working tree. Leave such files for their owner, or coordinate.
- **Don't stash, reset, check out or restore files you didn't change.**
- **Push your verified commits without waiting to be asked**: `git fetch`, rebase if `main` moved, then push. Other
  sessions' commits under yours are finished work and go out with them, so never amend or rewrite a commit once it's
  made; fix it with a new one.
- **Share the machine's CPU and GPU.** Every session's browser pane is a full copy of the game rendering flat out, so
  open the game only to check a change and close the tab straight after. Don't leave test runs or dev servers going in
  the background once you're done with them. Measure frame rates only with every other copy of the game closed, one
  session at a time, and say what else was running.

## Assets

- **Never commit vendor source files.** Raw purchases live in `vendor/` (git-ignored).
- **The level kit and the soundtrack the game ships are committed**, through Git LFS: `.asset-cache/level` (what the
  asset pack is built from) and `.asset-cache/music`. Commit their files with the change that rebuilds them. The rest of
  `.asset-cache/` and all of `vendor/` stay out of git: they live in the asset library on E:, and the checkout holds
  copies of only what's being worked on (`pnpm assets:fetch`; see [asset library](docs/assets/backup.md)). The
  repository must stay private.
- **Never ship raw glTF/textures from paid stores.** Paid assets go through the [pipeline](docs/assets/pipeline.md) into
  the encrypted runtime pack. Only CC0 may ship raw; CC-BY ships raw with credit.
- **Never use TurboSquid or Reallusion assets.** See [licensing](docs/assets/licensing.md).
- **Add every shipped third-party asset to the [register](docs/assets/register.md).**
- Never upload purchased assets to AI generation services.

## MCP servers

See [tooling](docs/tooling.md). Babylon.js MCP servers for node materials, particles and geometry; MCP for Blender for
asset processing (it runs arbitrary Python: only use it on project files); Context7 for current Babylon.js docs.
