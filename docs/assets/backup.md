# Asset backup

Git holds the code and the docs, and of the assets only what the game ships: the converted level kit
(`.asset-cache/level`, what the asset pack is built from) and the soundtrack (`.asset-cache/music`), through Git LFS.
The raw purchases in `vendor/` and the rest of the pipeline's output in `.asset-cache/` are git-ignored
([licensing](licensing.md) forbids sharing the purchases' source files, and they come to about 90 GB). **Deleting this
checkout and cloning it again loses them.** Some can't be had again at all.

## What's there

| Where                                         | What                                                     | If lost                                                                                     |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `vendor/audio/elevenlabs/`                    | The generated voice lines                                | **Gone**: regenerating costs credits and gives different takes                              |
| `vendor/audio/music/`                         | The soundtrack, generated                                | **Gone**, though the version the game plays is in git (`.asset-cache/music`)                |
| `vendor/audio/boom-world-war-i-firearms/`     | BOOM Library, World War I Firearms                       | Download links expire 3 November 2026; after that, ask BOOM support with order 588658       |
| `vendor/audio/pole-position-warfare-library/` | Pole Position, The Warfare Library 1–3                   | Sonniss allows only a few more downloads of each file (order 473679)                        |
| `vendor/audio/superthump-weapons-of-wwii/`    | Super Thump, Weapons of World War II                     | Re-download from A Sound Effect (order ASFX-203702)                                         |
| `vendor/audio/sonniss-gdc/`                   | Sonniss GDC bundles 2016–2026, curated                   | Re-download free from sonniss.com/gameaudiogdc; the curation is in its README               |
| `vendor/unity/`                               | The Synty packs, Low Poly War Pack, Pro Sound Collection | Re-download from the Unity Asset Store (My Assets)                                          |
| `.asset-cache/pack/`                          | The encrypted level pack and its key, `level.key.json`   | Rebuilt by `pnpm assets:pack`, but with a new key: the deployed build must use the same one |
| `.asset-cache/level/`, `.asset-cache/music/`  | The converted kit and the soundtrack the game ships      | In git, through Git LFS                                                                     |
| The rest of `.asset-cache/`                   | Animations, Unity imports, weather downloads             | Rebuilt by the pipeline scripts and `pnpm weather:build`                                    |

Every shipped asset, with its store page and licence, is in the [register](register.md); `vendor/audio/README.md` has
the sound libraries' orders.

## Backing up

```
pnpm assets:backup
```

copies `vendor/` and `.asset-cache/` to `E:\Game Assets\Verdun`, the 2 TB USB drive, a separate disk from the one this
checkout is on (`--to <folder>` or `VERDUN_BACKUP` for another place). Each run copies only what's new or changed, by
size and modification time, and never deletes from the backup, so a file deleted here by mistake is still there. Run it
after buying or generating anything, and after `pnpm assets:pack` builds a new pack and key.

The drive is in the same room as the computer: a fire or a theft takes both. An off-site copy (a cloud bucket) would
cover that; not set up yet.

## Restoring

A clone has the level kit and the soundtrack (with Git LFS installed; otherwise `git lfs pull` fetches them), so
`pnpm install` and `pnpm assets:pack` give a playable build without the backup. For the rest, copy the backup's
`vendor\` to the checkout's `vendor\` and its `asset-cache\` to `.asset-cache\`: the pack's key is there, and the
pipeline's inputs for rebuilding the kit.
