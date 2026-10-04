# Asset licensing

A browser game downloads every model and texture to the player, and glTF opens in any 3D tool. Licenses differ in how
much protection they demand, and that decides which stores are usable. This is not legal advice; get a lawyer's review
before commercial launch. Details and quoted clauses: [research notes](../research/notes/assets/licensing.md).

## Which sources are usable

| Source                                        | Usable in our web build?         | What the license demands                                                                               |
| --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Poly Haven, ambientCG (CC0)                   | Yes, raw files fine              | Nothing                                                                                                |
| Fab Standard (incl. Megascans, UE packs)      | Yes                              | Use "solely as incorporated in the Project in object code"; "must restrict end users from extracting"  |
| Unity Asset Store                             | Yes                              | No standalone redistribution; users must not be able to extract raw files                              |
| Synty one-time purchase                       | Yes                              | No sharing source files; 5 seats; bans "Game Creation Software" (matters if we ship map tools)         |
| Mixamo                                        | Yes                              | Don't redistribute raw animation files as packages                                                     |
| CGTrader Royalty Free                         | Yes, with protection             | "Commercially reasonable measures": proprietary format, password-protected resource file or encryption |
| Legacy Sketchfab Standard                     | Yes, with care                   | Single seat; no standalone access; post anti-reuse terms; no use to "promote... weapons"               |
| CC-BY (Sketchfab free models)                 | Yes, with credit                 | Attribution; must **not** be wrapped in DRM/encryption (CC BY 4.0 "Effective Technological Measures")  |
| TurboSquid                                    | **No**, without written approval | Proprietary formats only; only Unity, Unreal and Lumberyard WebGL pre-approved                         |
| Reallusion (Character Creator, ActorCore)     | **No**, without written approval | Proprietary formats only; bars "embedded content within applications or online services"               |
| CC BY-NC, Editorial, legacy UE-only Megascans | No                               | Non-commercial or Unreal-only                                                                          |

Our Synty packs (the version 1 art) were bought on the Unity Asset Store, so the **Unity Asset Store** row governs them.
Synty's own license excludes Unity Asset Store purchases. Unity confirms its assets may be used in other engines as long
as players can't extract the raw files, which the encrypted pack handles. Don't expose them through an editor that can
export meshes.

Fab notes:

- Buy the **Personal** tier. Professional is only required above $100k digital-content revenue in 12 months (funds
  raised count).
- Never buy the "Reference Only" tier; it has no source files.
- Fab content can't be combined with CC-BY-SA material.
- Fab content must not be exposed through level editors that can export it.

## How we protect shipped assets

1. Never host or commit vendor source files (FBX, .blend, .uasset, source textures). They live in `vendor/`, which is
   git-ignored and backed up to another drive by `pnpm assets:backup` ([asset backup](backup.md)).
2. Pack optimized runtime meshes and KTX2 textures into a custom binary container with a non-standard header. Babylon
   loads glTF from an in-memory ArrayBuffer. The steps are in the [asset pipeline](pipeline.md).
3. Encrypt the pack per build and decrypt it in a worker.
4. Serve packs through short-lived signed URLs (once there is a server).
5. Publish a game EULA that forbids extraction.
6. Keep the [asset register](register.md) current: store, license, tier, date, and how each asset ships.

Draco, Meshopt and KTX2 are open formats: they save size but add no protection. Keep CC0 content outside the encrypted
pack (no need) and CC-BY content outside it too (CC BY 4.0 forbids technological restrictions on it).

## Needs legal review before commercial launch

- How Fab's "object code" wording applies to glTF delivered to a browser.
- Whether our packing and encryption counts as "reasonable measures".
- The Sketchfab "promote weapons" clause, for any legacy Sketchfab purchase.
- Unity Asset Store terms for our Synty packs if we ever ship modding or map tools (Synty's own "Game Creation Software"
  clause covers Synty Store purchases only).
- Any TurboSquid or Reallusion asset (avoid unless the vendor approves in writing).
