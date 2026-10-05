# Asset library

Git holds the code and the docs, and of the assets only what the game ships: the converted level kit
(`.asset-cache/level`, what the asset pack is built from) and the soundtrack (`.asset-cache/music`), through Git LFS.
Everything else, the raw purchases above all, lives in the **asset library**: `E:\Game Assets\Verdun`, a 2 TB USB drive.
The library is the one copy. The checkout's `vendor/` and `.asset-cache/` hold only what's being worked on, copied over
from the library, and are git-ignored ([licensing](licensing.md) forbids sharing the purchases' source files, and they
come to about 140 GB).

## What's there

| In the library                                | What                                                           | If lost                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `vendor/audio/elevenlabs/`                    | The generated voice lines                                      | **Gone**: regenerating costs credits and gives different takes                                  |
| `vendor/audio/music/`                         | The soundtrack, generated                                      | **Gone**, though the version the game plays is in git (`.asset-cache/music`)                    |
| `vendor/audio/boom-world-war-i-firearms/`     | BOOM Library, World War I Firearms                             | Download links expire 3 November 2026; after that, ask BOOM support with order 588658           |
| `vendor/audio/pole-position-warfare-library/` | Pole Position, The Warfare Library 1–3                         | Sonniss allows only a few more downloads of each file (order 473679)                            |
| `vendor/audio/superthump-weapons-of-wwii/`    | Super Thump, Weapons of World War II                           | Re-download from A Sound Effect (order ASFX-203702)                                             |
| `vendor/audio/sonniss-gdc/`                   | Sonniss GDC bundles 2016–2026, curated                         | Re-download free from sonniss.com/gameaudiogdc; the curation is in its README                   |
| `vendor/mixamo/`                              | Mixamo clips on the uploaded soldier ([list](mixamo-clips.md)) | Re-export from Mixamo with the Adobe account; [mixamo-clips.json](mixamo-clips.json) links each |
| `vendor/unity/`                               | The Synty packs, Low Poly War Pack, Pro Sound Collection       | Re-download from the Unity Asset Store (My Assets)                                              |
| `asset-cache/pack/`                           | The encrypted level pack and its key, `level.key.json`         | Rebuilt by `pnpm assets:pack`, but with a new key: the deployed build must use the same one     |
| The rest of `asset-cache/`                    | Animations, Unity imports, weather downloads                   | Rebuilt by the pipeline scripts and `pnpm weather:build`                                        |

Every shipped asset, with its store page and licence, is in the [register](register.md); the library's
`vendor\audio\README.md` has the sound libraries' orders.

## Using it

Copy what a job needs into the checkout, keeping its place under `vendor/` or `.asset-cache/`:

```
pnpm assets:fetch vendor/audio/boom-world-war-i-firearms vendor/audio/elevenlabs
```

When the work is done and the library has it, delete the checkout's copy. The pipeline scripts read from `vendor/` as
before, so they need the folders they use fetched first.

Anything new goes into the library: after buying or generating something, or after `pnpm assets:pack` builds a new pack
and key, run

```
pnpm assets:backup
```

It copies what's new or changed in `vendor/` and `.asset-cache/` to the library (`--to <folder>` or `VERDUN_BACKUP` for
another place). Neither command deletes anything.

The library is a single copy, by choice. A failed or lost drive loses what isn't in git, the generated voices and the
music's masters among it, and the drive is in the same room as the computer.

## Starting afresh

A clone has the level kit and the soundtrack (with Git LFS installed; otherwise `git lfs pull` fetches them), so
`pnpm install` and `pnpm assets:pack` give a playable build without the library. Fetch from the library only what the
work at hand needs.
