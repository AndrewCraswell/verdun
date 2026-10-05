# Paid sound sources for footsteps and soldier movement (boots, mud, water, duckboards, crawling, kit)

Research date: 2026-10-04. Scope: footsteps and soldier-movement foley to buy for Verdun 1916. The bar is real
recordings by professional recordists at 24-bit, 48 kHz or higher, natural and dry or lightly roomed. Designed or
synthesized stand-ins and AI-generated sound are out. Surfaces in priority order: wet duckboards (hollow wood over mud
or water), deep sucking mud, shallow water, wet earth, gravel and rubble, snow, stone and cobbles, dugout wood floors.
We also need crawling, body falls and kit (rifle sling, webbing, canteen and mess tin, wool greatcoat). Prices are list
prices seen on vendor pages on the research date. Licence summaries reuse
[licensing, archives and delivery](licensing_archives_delivery.md).

How the facts were gathered:
- Track lists and metadata sheets were downloaded and read for every library ranked below. A Sound Effect pages were
  read from the page's embedded data. Sonniss blocks repeated fetches, so a few Sonniss facts come from its product
  API or search summaries.
- Vendor prose is paraphrased; file names and track names are copied exactly.
- The user auditioned Epic Stock Media's Game Footsteps and rejected it. No other demo was listened to. Quality
  judgements are from specs, track lists and vendor descriptions only.

## The three original candidates

### Takeaway
- **Pro Sound Effects, Game Audio Collection: Footsteps** is the best structural fit found anywhere. Boots get every
  movement type on mud, hollow wood, dirt, gravel, stone and snow, as left and right one-shots at 24/96. There are
  also hand crawls on mud, dirt and water. Three things are wrong with it:
  - PSE never says how or where it was recorded.
  - The mud steps are short squelches with no pull-out.
  - PSE's licence is sync-only and never names games.

  Buy it only after PSE confirms in writing that it covers an interactive web game, and after auditioning the
  previews on PSE's site.
- **Medartimus, Soldier Footsteps** is not good enough. It is 120 files recorded on a Zoom H4n handheld, with five
  steps per action and no mud or left/right split.
- **Epic Stock Media, Game Footsteps** was rejected by the user after listening. ESM's **Designed Game Footsteps**
  is designed by its own description, so it is out too.

### Cited Findings

**1. Pro Sound Effects, Game Audio Collection: Footsteps (credited to 344 Audio)**
- **Price and licence:** $299, one user, lifetime. Released September 2025. Also included in the CORE 7 Pro and
  Complete bundles. — [PSE](https://www.prosoundeffects.com/libraries/game-audio-collection-footsteps)
- **Size and format** (from the [metadata spreadsheet](https://prosoundeffects.blob.core.windows.net/metadata/PSE_GACF-metadata.xlsx)):
  - 10,695 files, 12.59 GB: 9,500 footsteps, 495 hand impacts, 400 cloth, 300 armour.
  - Every row is 96 kHz, 24-bit, **mono**.
  - The page's track count was confirmed against the sheet.
- **Footwear:** boots, dress shoes, heels, trainers, barefoot, "knight" and "neutral". No hobnails or period boots.
- **Surfaces:** concrete, dirt, grass long and short, gravel, metal dense and hollow, mud, sand, snow (plus a separate
  "Snow Creak"), stone, water shallow/medium/deep, wood full (tagged oak) and wood hollow.
  - Wood hollow's tags are pine, dry, old, resonance, interior, floor. That is a hollow floor, not wet planks over
    water.
  - Water has no footwear variants: 300 files across three depths.
- **Movements:** walk, run, sprint, sneak, sidestep, back, scuff, slide, get up, land light and land heavy.
  - Steps come as left/right one-shots, five per foot per action. Boots have 100 files on each surface.
  - Example: `FOLYFeet_Mud Boots Walk Left 001`. Its tags are wet, squelch, squash, squish, liquid, soil, exterior.
- **Mud step length:** the ten boots-walk-on-mud files are 0.50–0.65 s long, so they are a squelch, not a sucking
  pull-out.
- **Hands:** `Hands Mud Crawl`, `Hands Dirt Crawl`, `Hands Water Shallow Crawl/Push/In/Out`, and hand crawls on hollow
  wood, gravel and snow, about 10 files each.
  - These are hand impacts only, with no knee or body drag.
- **Cloth:** cotton, denim, leather and nylon, 100 each, matched to the same movements (`Leather Run Right 003`). No
  wool, no webbing, no canteen.
- **No body falls.** "Get Up" and "Land Heavy" are the nearest.
- **Recording method: not stated** on the product page, the launch blog or the launch video.
  - 344 Audio's own studio in Manchester has a built-in concrete foley pit with timber, oak, redwood and soil floors.
    It uses Sennheiser MKH 50s for close and distant foley.
  - The "oak" and "pine" tags fit that pit, but this is inference.
  - — [344 Audio studios](https://344audio.com/studios); [PSE launch blog](https://blog.prosoundeffects.com/introducing-the-game-audio-collection-video); [launch video, 15 Sep 2025](https://www.youtube.com/watch?v=dLqZSRA8TJs)
- **Overlap with 344 Audio's own packs looks low.** Their packs are stereo walk cycles with different file names, and
  lack the mud, water and hollow-wood boots sets.
- **Reviews:** none found on forums or review sites.
- **Licence problem:**
  - PSE's Individual EULA (last updated October 2024) is still sync-only. Asynchronous use needs a Custom Application
    License, and the EULA has the strictest anti-extraction duty of any vendor we reviewed.
  - That conflicts with a library PSE markets as built for game engines.
  - — [PSE Individual EULA](https://www.prosoundeffects.com/individual-end-user-license-agreement); [licensing note](licensing_archives_delivery.md)

**2. Medartimus Sounds, Soldier Footsteps**
- **Price:**
  - A Sound Effect: $34.99 on sale, list $50, per-workstation licence.
  - Sonniss: $25.
  - — [A Sound Effect](https://www.asoundeffect.com/sound-library/soldier-footsteps/); [Sonniss](https://sonniss.com/product/soldier-footsteps)
- **Format:** 120 files, 45.6 MB, 24-bit/96 kHz **stereo**. Sonniss names the gear as a **Zoom H4n**.
- **Contents** (from the [track list](https://asoundeffect.com/wp-content/uploads/2015/03/SoldierFootsteps_Tracklist.xlsx)):
  - 8 surfaces: concrete board, wood floor, water, metal board, ground, grass, gravel, snow.
  - 3 actions each: crouch, walk, run.
  - 5 single steps per action, with no left/right split.
  - The sheet's header is a leftover from the vendor's "Civilian Footsteps Collection", which is a near-identical
    120-file sibling.
- **Footwear:** army boots, with weapon and ammo-pack rattle mixed into each step.
- **Not covered:** mud, jumps, scuffs and crawling.
- **Reviews:** none on either store.

**3. Epic Stock Media, Game Footsteps and Designed Game Footsteps**
- **Game Footsteps:** $33 (list $39). 1,655 footsteps across 22 surfaces and shoe styles, studio foley at 96/24.
  **Rejected by the user after listening.** — [A Sound Effect](https://www.asoundeffect.com/sound-library/game-footsteps/)
- **Designed Game Footsteps:** $99; 5,442 files, including robotic and creature steps. It is designed, not raw, so
  it is out. — [Sonniss](https://sonniss.com/sound-effects/designed-game-footsteps-sound-library/)

### Inferences
- PSE's library is the only one found that gives boots × mud × hollow wood × water × stone × snow as clean left/right
  one-shots, with get-up, slide and land, and with matching hand crawls. A footstep system can use it as shipped.
- Its two weaknesses are a missing deep-mud pull-out and dry interior hollow wood. Both can be layered from other
  libraries (see below).
- Its licence must be settled before money is spent. Email PSE describing exactly what we do:
  - a browser game;
  - sounds triggered by the engine, not synced to picture;
  - files shipped in an encrypted runtime pack.

  Ask whether the standard licence covers this or whether a Custom Application License is needed, and at what cost.
- Medartimus is a hobby-grade recording and is skipped.

### Gaps
- PSE's recording method and mic distance are unconfirmed.
- PSE's previews were not auditioned.

## Wider search by surface

### Takeaway
Nobody sells WW1 trench footsteps:
- no hobnails;
- no duckboards over water;
- no long boot pull-out from deep mud in leather boots;
- no full-body crawl.

The good partial matches are:
- **Mechanical Wave, Footsteps Session V2.0**, $32: outdoor covered wooden bridge, muddy road, muddy water in boots,
  dirty wet gravel.
- **The Recordist, Ultimate Mud HD Pro**, $79: a real mud bog with rubber boots, a move-out-of-mud file and suction
  textures.
- **Tovusound, Real Outdoor Footsteps**, $59: boots outdoors on dirt, deep dirt, grass-mud, wet gravel and rocks.
- **Sound Ideas, Ultimate Foley Collection**, $395: boots on mud and hollow wood for one man up to large groups, plus
  soldiers' kit rattle and uniform cloth. It is long takes, and its masters are 48 kHz.
- **WOW Sound, Essential Footsteps Sound Effects Pack**, $129: leather-boot one-shots on hollow wood, puddles and
  ankle-deep water. This is the fallback backbone if PSE's licence can't be settled.

The best-known premium name, the **Ultimate Foley Collection's "Ultimate Footsteps"** ($299), turns out to be weak
for us once its track list is read.

### Cited Findings

**Duckboards and hollow wood**
- **Mechanical Wave, Footsteps Session V2.0**
  - **Price:** $32 at [A Sound Effect](https://www.asoundeffect.com/sound-library/footsteps-session-v2-0/) and
    [Sonniss](https://sonniss.com/sound-effects/footsteps-sessions-v2-0/).
  - **Format:** 1,104 files, 24/96: 290 long outdoor takes and 814 isolated steps.
  - **Track list (wood):**
    - about 12 `Covered Wooden Bridge` files: walk, slow walk, run, scuff, jump and land;
    - `Footstep Walk Wood Dock` and `Wood Deck`.
  - **Track list (wet ground):** `Muddy Road Footsteps Walk` (tagged wet, mud, sticky),
    `Muddy Light Water Foosteps Walk 01–05` and `Muddy Dirty Water Footsteps Walk` (tagged boots, drenched), and
    `Dirty Wet Gravel` walk, jog, run, scuff, jump and land.
  - **Recording and footwear:** mics are not stated. Most files are tagged shoes; only the water files are tagged
    boots.
  - **Red flag:** one file name contains "GATED".
  - Track list: [Footstep V2 listing sheet](https://www.asoundeffect.com/wp-content/uploads/2019/12/Footstep-V2-Sound-Effect-Listing-Sheet.pdf).
- **The Ultimate Foley Collection, Ultimate Footsteps** (Joshua Reinhardt and Lara Dale)
  - **Price and format:** $299 complete, $160 for the Exteriors or Interiors half. 1,528 mono files, 48 kHz.
    Neumann KMR81 and Sennheiser 416, recorded to a metronome, as long multi-step takes.
  - **Boots:** the [track list](https://cdn.sonniss.com/storage/2025/06/THE-ULTIMATE-FOOTSTEP-COLLECTION-Sheet1.pdf)
    shows boots on 16 `BOOT HW5_DOCK` files (a wooden dock), on hardwood, dirt, grass and hard interior floors.
  - **Sneakers only:** puddle, water shallow and deep, gravel, rocks, snow and wood creak exist only as sneaker
    "SWEET" (sweetener) files.
  - **Red flag:** about 211 of the exterior files (all dirt, grass, gravel, rocks, snow, puddle and water) are listed
    at **44.1 kHz**. The puddle and water sweeteners share their exact durations with the boot-on-dirt takes, so they
    look like layers performed to the same metronome.
  - **Recording:** Reinhardt describes long sessions in a studio dirt pit for the "outdoor" surfaces.
  - **Same recordings resold:** the same team and recordings became Tovusound's Edward Ultimate instrument.
  - — [Sonniss](https://sonniss.com/sound-effects/ultimate-footstep-collection/); [A Sound Effect: Edward Ultimate story](https://www.asoundeffect.com/edward-ultimate-footstep-sound-effects/)
- **WOW Sound, Essential Footsteps Sound Effects Pack**
  - **Price and format:** $129. 3,263 mono one-shots, 24/96, plus 581 armour, gear and cloth files.
  - **Coverage** (from the [track list](https://cdn.sonniss.com/storage/2025/02/Essential-Footsteps-Sound-Effects-Pack.pdf)):
    - boot and leather boot each on hollow wood, solid wood, water puddle, dirt, grass, concrete and hollow metal,
      about 70–100 steps per combination;
    - 100 ankle-deep puddle steps;
    - 229 `FOLEY_Gear` files.
  - **Origin:** the page says it is edited from Rock The Speakerbox's library, so it is the same recordings under
    another name. Recording method not stated.
  - — [Sonniss](https://sonniss.com/sound-effects/essential-footsteps-sound-effects-pack/)
- **Sound Ideas, Ultimate Foley Collection** (Patti Tauscher and Chase Keehn, Fantasy Studios, Berkeley)
  - **Price:** $395, about 2,300 effects.
  - **Hollow wood in boots:** 10 files each of walking, running and shuffling. Each set covers one person and two
    people (close and distant mic) plus small and large groups. — [CSV track list](https://portal.sound-ideas.com/CSVexport/product=446)
  - **Format red flag:** the masters are 24-bit/48 kHz, but a 96 kHz download is sold, so that version is upsampled.
    Everything is long sequences. — [Sound Ideas](https://sound-ideas.com/products/ultimate-foley-sound-effects-collection)
- **344 SFX, Footsteps Vol. 3**: $20; 192/24 stereo; foley pit. It has a `Boardwalk` built from wooden pallets
  (walks, run, jumps, hops, scuffs and a board break), tagged trainers and boots. — [Sonniss](https://sonniss.com/sound-effects/footsteps-vol-3/)
- **Soundsnap** has Pole Position Production hollow-wood and rubble steps (24/96 mono, five characters, walk, run,
  crouch, jump/land) and Twisted Signals boots on a hollow porch (24/48). These are files on a $199/yr subscription
  whose sounds stay licensed after it ends, not a library to buy. — [Soundsnap pricing](https://www.soundsnap.com/products)

**Deep mud and pull-out**
- **The Recordist, Ultimate Mud HD Pro**
  - **Price and format:** $79. 84 files holding 464+ sounds, 24/96, stereo and mono.
  - **Recording:** outdoors in a mud bog on his ranch. Sound Devices 702 with Sanken CSS-5, MKH-416, AT835ST and a
    Sony PCM-D1. Footwear is rubber mud boots.
  - **Footsteps:** 19 files, from the [file list](https://therecordist.com/soundbox_pro/ultimate_mud/The_Recordist_Ultimate_Mud_File_List_PDF.pdf):
    - `Wet Splashy Rubber Boots` slow walking, fast walking, fast running, `Jump In Out`, `Movement Out Of Mud` and
      `Single Steps`;
    - `Walking In Muddy Water`;
    - `Wet Squishy Rubber Boots Slimy Sticky`.
  - **Other mud sounds:** many suction, slime and impact files.
  - **Licence:** single user, and games are allowed.
  - — [The Recordist](https://therecordist.com/product/ultimate-mud-hd-pro/); [EULA](https://therecordist.com/company/eula/)
- **Sound Ideas, Ultimate Foley Collection**: boots on mud, walking, running and shuffling, 10 files each, from one
  man up to large groups. — [CSV](https://portal.sound-ideas.com/CSVexport/product=446)
- **PSE Game Audio Collection: Footsteps**: 100 boot-on-mud one-shots, but short (see above).
- **Pasi Pitkänen, Footsteps Two**: $20; 24/96; outdoors in northern Finland on Sony PCM-D50/D100 handhelds.
  - Wet swamp walk, stomps, scuffs and squishes.
  - Footwear not stated, and each surface is one long take.
  - — [A Sound Effect](https://www.asoundeffect.com/sound-library/footsteps-two/); [recording story](https://www.asoundeffect.com/footstep-sound-effects-library-recording)
- **SmartsoundFX, Footsteps 02**: $59; 24/48.
  - `Mud Slow Normal`, `Mud Walk`, `Stony Mud Squish`, plus `Military March Heavy/Regular` and leather combat boots
    on stone and wood floors.
  - Recording method not stated.
  - — [A Sound Effect](https://www.asoundeffect.com/sound-library/footsteps-2-2/)
- **Swamp Footsteps – Wet, Muddy Surface**: $6.49; 43 files at 48/24. Boots in thick mud, but the steps are 0.2–0.5 s
  and the vendor calls them crafted. Below the bar. — [Sonniss](https://sonniss.com/sound-effects/swamp-footsteps-wet-muddy-surface/)
- **Soundsnap** has the only explicit pull-out files found (`SHOE PULL OUT MUD`), but they are 16-bit/44.1 kHz. CA
  Sound's group marching in mud is 24/96.

**Shallow water and wading**
- **PSE**: water shallow, medium and deep, 100 one-shots per depth (footwear unspecified).
- **WOW Sound**: boot and leather-boot puddle one-shots plus 100 ankle-deep steps.
- **Pasi Pitkänen, Footsteps Two**: `Water Deep Wade`, `Water Shallow Walk/Stomps/Scuffs`, outdoors.
- **Silent State Studio, Natural Human Footsteps**
  - $14 on sale (list $20); 24/96 mono; interior foley studio with an MKH 416.
  - Boots on puddle, dirt, gravel, rock, stones, sand, concrete and tiles, 12 performances each (walks, run, stops,
    jump/land).
  - Light noise reduction only. Long takes.
  - — [A Sound Effect](https://www.asoundeffect.com/sound-library/natural-human-footsteps/)
- **Mechanical Wave V2**: muddy water walks in boots (above).

**Wet earth, gravel and rubble**
- **Tovusound, Real Outdoor Footsteps**
  - **Price:** $59 for the WAV version on A Sound Effect; $79 as an Edward instrument expansion.
  - **Format and recording:** 24/96. Recorded outdoors at up to 2,500 m in the Sierra Nevada and the Swiss Alps,
    with an MKH 416 and a KMR 81i into Sound Devices recorders.
  - **Boots on:** asphalt, dirt, deep dirt, grass long, grass-mud mix, gravel mix, gravel wet, leaves, rocks and wood
    mix.
  - **Performances:** walk speeds, stop, land, scuffs. Long takes.
  - — [Tovusound](https://www.tovusound.com/real-outdoor-footsteps); [A Sound Effect](https://www.asoundeffect.com/sound-library/real-outdoor-footsteps/)
- **PSE**: 100 boot one-shots each on dirt, gravel and stone.
- **Mechanical Wave V2**: dirty wet gravel and piles of rocks.
- **Periscope Post & Audio, The Shoe Collection: Dirt – Combat Boot Size 10**
  - $12; 22 files with 406 steps; 24/192.
  - A leather combat boot on dirt: walk, jog, run, sprint, stomp, scuff, stops, jump/land.
  - Mono MKH-60 slightly further out, stereo MKH 8050 plus MKH 30 close.
  - — [A Sound Effect](https://www.asoundeffect.com/sound-library/the-shoe-collection-dirt-combat-boot-size-10/)
- **Rubble (broken brick and stone): no library names it.** The nearest are Pole Position's rubble steps on Soundsnap
  and gravel/rocks sets.

**Snow**
- **PSE**: boots on snow plus "Snow Creak", 100 files each.
- **Matt R. Sherman, Cold Feet – Snow Footsteps Vol 1**
  - $50; 104 mono files at 24/96.
  - Foley artists walking on real snow in Canada, with about 45 boot files on packed, icy and crunchy snow.
  - MKH 416 and Schoeps MK41.
  - — [Sonniss](https://sonniss.com/sound-effects/cold-feet-snow-footsteps-vol-1/)
- **Filmsoundlibrary, Footsteps icy snow**
  - $30; 173 mono files at 24/96.
  - Performed at −12 °C on an open field at night: sneak, walk, run, sprint, jumps, scuffs, slides. Footwear not
    stated.
  - MKH 60, Audio Developments AD146, Pro Tools.
  - — [Sonniss](https://sonniss.com/sound-effects/footsteps-icy-snow/); [metadata](https://cdn.sonniss.com/storage/2026/09/FSL_FOLYFeet_icy_snow_metadata-FSL_FOLYFeet_icysnow.pdf)
- **The Recordist, Ultimate Snow 1 HD Pro**: $59, 24/96. Arctic boots on hard pack, deep snow and slush, plus a body
  fall on snow. The vendor mentions mild limiting. — [The Recordist](https://therecordist.com/product/ultimate-snow-1-hd-pro/)

**Stone, cobbles and wood floors**
- **PSE**: boots on stone (tagged smooth natural rock), wood full (oak) and wood hollow (pine), 100 files each.
- **SmartsoundFX Footsteps 02**: leather combat boots on a stone floor and a wood floor, about 20 files, 24/48.
- **Periscope Post & Audio, The Shoe Collection: Soft Hardwood – Combat Boot**: $12, 24/192, boot on a wooden floor.
  — [Sonniss](https://sonniss.com/sound-effects/shoe-collection-soft-hardwood-combat-boot-size-10/)
- **Krampfstadt Studio, Footsteps + Kontakt & Battery presets**: $65; 2,056 single steps at 32-bit/192 kHz, each
  labelled left or right leg.
  - Boots on dirt, gravel, wood, grass, sand and tiles, plus snow.
  - The vendor says no foley pit was used and room sound was kept, so it is roomed, not dry. No mud or water.
  - — [A Sound Effect](https://www.asoundeffect.com/sound-library/footsteps-kontakt-battery-sampler-presets/)
- **No cobbles** were found as a named boot surface anywhere.

**Rejected or below the bar**

| Library | Reason |
|---|---|
| Studio 23, Ultimate Footstep Collection ($99.99, a different library with the same name) | No mud, water or dirt. Its Unreal edition is 44.1/16. |
| GfxSoundsStudios Footsteps SFX Bundle | Mud only with shoes and heels. Processed with RX and FabFilter; listed as designed. |
| Fusehive Footsteps Foley and Stomping Footsteps | 44.1/16 and "mastered". |
| Quietsub FX | Listed as designed. |
| Sonic Bat Videogame Foley Essentials | Volume-normalised. |
| Sound Armoury | Sneakers only; cornstarch snow. |
| The Sound Guild; Justin Jet Zorbas packs | Zoom recorders. |
| Footstep Loops / Loops II | 30 s loops only, no one-shots. |
| Gamemaster Audio Footstep and Foley Sounds ($10) | Footwear and recording not disclosed; ships both 16/48 and 24/96. |
| Glitched Tones Foley Suite: Footsteps | Partly in household rooms with room reverb; no specs. |
| BOOM, Virtual Foley Artist – Footsteps ($269) | Most content is locked in a Kontakt instrument; only 43 WAVs; no mud. |
| PSE Odyssey Foley Effects | About 73% is 16/48; same PSE licence. |
| Soundly | Licence covers only versions made while subscribed. |
| Audiokinetic Strata Human Movement | Subscription only (made by BOOM). |
| Fab "Footsteps Pack" (cplomedia) | AI-assisted. |
| Fab "Ultimate Footstep Collection Vol.09 – Water" | 44.1/16. |

— [A Sound Effect footsteps](https://www.asoundeffect.com/shop/category/foley/footsteps/); [Sonniss footstep tag](https://sonniss.com/sound-effects-tag/footstep/); [BOOM VFA](https://www.boomlibrary.com/sound-effects/virtual-foley-artist-footsteps/); [Soundly EULA](https://getsoundly.com/assets/Soundly-EULA.pdf); [Fab cplomedia](https://www.fab.com/listings/005b98c9-ae08-4b4c-a739-d849977f145d)

**Vendors with no footstep library:** Tonsturm, Hzandbits, Articulated Sounds, SoundBits, Rabbit Ears Audio, Mattia
Cellotto, SoundMorph, Sound Response, Detunized, and Chuck Russom FX (now Sound Effects Monkey). BOOM has no boot
footsteps outside Virtual Foley Artist. Its Horses library has hooves on mud and water, and Close Combat has body falls
on shallow and deep water.

### Inferences
- For an interactive game, single steps with left/right variation matter more than long takes.
  - PSE, WOW and the Krampfstadt and Periscope packs are true one-shots.
  - Mechanical Wave, Tovusound, Sound Ideas, Ultimate Footsteps, Silent State, PPSFX and The Recordist ship long
    takes that we would cut ourselves. That is real but bounded work: an afternoon per library.
- "Outdoor" in footstep libraries usually means a studio dirt pit (Ultimate Footsteps, 344, PSE). Only Tovusound,
  Mechanical Wave, PPSFX, The Recordist and Filmsoundlibrary are actually recorded outside. Outdoor takes match a
  trench exterior better, but carry some ambience.
- **Building the duckboard step:** layer a hollow-wood boot step with a wet splash.
  - Hollow wood: PSE wood hollow, WOW hollow wood, Mechanical Wave bridge, or Sound Ideas hollow wood.
  - Splash: PSE water shallow, or WOW puddle.
  - This is a design workaround, not a recording of the real thing.
- **Building the deep-mud pull-out:** a boot squelch from PSE or Sound Ideas, followed by a suction tail from
  Ultimate Mud (its "Movement Out Of Mud" and suction files).
  - Rubber boots in The Recordist's set will sound slightly different from leather. Under mud the difference is small.
- **Groups:** Sound Ideas' group passes on mud, hollow wood and gravel are the only real multi-man boot recordings
  found. They suit a charge or a squad moving past better than stacking single-man steps. Sound Ideas requires
  sounds to be embedded and not extractable, which our encrypted runtime pack satisfies.

### Gaps
- Mechanical Wave's mics and footwear, WOW and Rock The Speakerbox's recording method, and Tovusound's per-file
  footwear are unconfirmed.
- Whether Ultimate Footsteps delivers its KMR81 channel as a separate file is unconfirmed; its track list shows only
  the `_416.L` files.
- Soundsnap supplier files can't be traced to named libraries.
- Most Fab listings returned 403.

## Period boots (hobnails) and archive recordings

### Takeaway
No commercial library has hobnailed boots. The only real recordings of studded or nailed boots are in the BBC
archive. Those are 16-bit/44.1 kHz stereo transfers of 1960s–70s tape, long takes, and licensed commercially only
through PSE. Use them as a reference for what hobnails on gravel and in mud sound like, not as game assets.

### Cited Findings
- **French:** the Mle 1916/1917 *brodequin* had thick leather soles fitted with boot nails and metal tips on heel and
  toe. — [Cartalana](https://cartalana.com/002-14.php)
- **German:** the Marschstiefel (M1866) was a laceless mid-calf boot, issued hobnailed with heel irons. — [IMA, original WWI Marschstiefel](https://www.ima-usa.com/products/original-imperial-german-wwi-m1866-hobnailed-marschstiefel-enlisted-issue-trench-boots-with-pull-up-straps); [Wikipedia: Jackboot](https://en.wikipedia.org/wiki/Jackboot)
- **BBC Sound Effects archive**, found through its search API. Each file checked is a 16-bit/44.1 kHz stereo WAV.
  - `07018159`–`07018163`: soldiers marching and shambling on gravel and on a soft surface, troops wearing studded
    boots.
  - `07018150` and `07063115`: World War I army drill, troops moving through mud (1967).
  - `07018158` and `07063116`: a soldier walking in a flooded trench (1970).
  - `07072051`: four men walking in nailed boots.
  - `07033079` and others: men crawling along a small passage.
  - Licensing: the free BBC site is RemArc (personal/educational only); commercial use goes through PSE.
  - — [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk/); [licensing note](licensing_archives_delivery.md)
- **Everything else:** every other "hobnail" search result was AI-generated (ElevenLabs) and is excluded.

### Inferences
- **The hobnail sound:** a hobnailed leather sole on stone, cobbles, brick rubble or duckboards gives a metallic
  click and scrape on every step. A modern rubber-soled boot gives nothing like it. On mud, snow and soft earth the
  nails barely show. So the nails matter most for the village, the dugout steps and the duckboards.
- **Rescuing modern recordings:** one partial fix is a short metal tick layered on hard-surface steps. A real
  recording is better.
- **Reproduction boots:** reproduction French brodequins and German Marschstiefel are sold to re-enactors. Prices
  weren't researched.

### Gaps
- Whether PSE still sells the BBC library, and at what price, is unconfirmed (see the licensing note).
- No source documents the British ammunition boot's stud pattern in this pass.

## Crawling, body falls and kit

### Takeaway
- **Body falls:** Red Libraries' **Bodyfall Vol 3 (Dirt)** at $35 is the professional pick.
- **Crawling:** only hand impacts exist (PSE). No library has a full-body crawl through mud.
- **Kit:** Bonson's **MOVES** ($89) has a WW2 soldier gear set: gear, ammo belt, iron helmet, rifle and body falls.
  The Ultimate Foley Collection's **Cloth** half ($90) has wool and heavy coats and army gear. 344 SFX's **Water
  Canteen** ($10) adds a canteen.
- **Not found anywhere:** webbing, mess tins, entrenching tools and bayonet scabbards.

### Cited Findings
- **Red Libraries, Bodyfall Vol 1–4**
  - $35 per volume, $140 for all four. Vol 3 is dirt and hardwood floor.
  - Foley artist Florian Fabre at the Hiventy studio near Paris.
  - Chest, feet, knees and hands are recorded separately, each at close, mid and distant positions and three
    strengths.
  - U87 MS pair, Sanken CO-100K and an AKG C411 contact mic; 24/96.
  - — [Sonniss](https://sonniss.com/sound-effects/bodyfall/); [A Sound Effect](https://www.asoundeffect.com/sound-library/bodyfall-vol-1-4/)
- **Javier Zúmer, Essential Bodyfalls**: $24; dirt, gravel, sand, concrete, metal, grass, wood; MKH 416 at 24/96.
  — [A Sound Effect](https://www.asoundeffect.com/sound-library/essential-bodyfalls/)
- **BOOM Close Combat** (from $139): body falls on gravel, sand, snow, wood, grass and shallow and deep water. No mud.
  — [BOOM](https://www.boomlibrary.com/sound-effects/close-combat/)
- **Bonson (Michel Marchant), MOVES**
  - $89; 772 game-workflow files at 24-bit/192 kHz.
  - The cinema list ([track list](https://www.asoundeffect.com/wp-content/uploads/2018/12/Bonson-Moves-Cinema-Workflow-192-kHz-UCS.xls))
    has 17 World War II soldier files, each holding several takes:
    - `Soldier World War II Gear` walk, run, stealth, stop, impact and `BODYFALL x09`;
    - `Bullet Shells` belt run and stop;
    - `Iron helmet` walk and run;
    - `Rifle` walk, run and impacts.
  - Recording method not stated. The vendor presents it as a budget aid rather than a replacement for a foley artist.
  - — [A Sound Effect](https://www.asoundeffect.com/sound-library/moves/)
- **The Ultimate Foley Collection, Ultimate Prop and Cloth Collection**
  - $90 per half, $180 for both; 24/48.
  - Cloth includes `coat wool` and `heavy coat`. Props include a rifle, a leather backpack, dog tags and army gear,
    performed to the same tempo as Ultimate Footsteps.
  - Separate files for the 416, the KMR81 and a C414 room mic.
  - — [Sonniss](https://sonniss.com/sound-effects/ultimate-cloth-prop-collection/)
- **344 SFX, The Foley Vault: Water Canteen** and **Leather Movement**: $10 each; 24/96; foley stage with an MKH 50.
  — [A Sound Effect](https://www.asoundeffect.com/sound-library/the-foley-vault-water-canteen/)
- **Sound Ideas, Ultimate Foley Collection**: `Group Rattling Movement of Soldiers Walking/Running`,
  `Group Soldiers Running with Rattling Equipment` and `Group Cloth Movement of Uniformed Soldiers`, about 30 s each.
  Groups only. — [CSV](https://portal.sound-ideas.com/CSVexport/product=446)
- **GCRadix, Firearm Foley & Mechanics: WW2**
  - $119 on sale (list $199); 486 files, 24/96.
  - Mauser 98K and Mosin-Nagant handling, one `Mauser 98K Leather Strap Adjustment` file, military backpack straps,
    and cotton, nylon and denim cloth. No webbing, canteen or wool.
  - Mostly a weapon-handling buy.
  - — [Sonniss](https://sonniss.com/sound-effects/firearm-foley-mechanics-ww2/); [metadata](https://cdn.sonniss.com/storage/2025/05/GCRadix_FirearmFoleyMechanics_WW2_Metadata.pdf)
- **Black Edge, 1940 Military Gear**: $99. Ammo boxes, cases and jerry cans; nothing worn by a soldier.
- **PSE Game Audio Collection: Footsteps**: hand crawls on mud, dirt, shallow water, hollow wood, gravel and snow
  (above). The BBC archive has crawling in caves and drainpipes only.

### Inferences
- **Running soldier:** a footstep, plus a MOVES WW2 gear or rifle layer, plus a cloth layer gets close.
  - Wool: Ultimate Cloth, or PSE leather/cotton.
  - The canteen-and-mess-tin rattle has no source. The French *bidon* and *gamelle* and the German *Kochgeschirr*
    clank differently from any modern kit.
- **Crawl:** PSE's mud hand crawls plus a slow wool/cloth drag plus knee impacts from Bodyfall Vol 3 make a
  passable crawl. A real full-body crawl in kit through mud is better and easy to record.

### Gaps
- MOVES' recording method and room are unknown. Audition it first.
- No library was found for 1914–18 webbing, leather cartridge pouches, mess tins, entrenching tools, bayonet frogs,
  or Adrian or Stahlhelm helmets.

## Shopping list (ranked)

1. **Pro Sound Effects, Game Audio Collection: Footsteps**: $299, one user. **Buy only after PSE confirms in writing**
   that the licence covers an interactive browser game with an encrypted sound pack, and after auditioning previews.
   - **Why:** the only library with boots × mud × hollow wood × water × dirt × gravel × stone × snow as left/right
     one-shots at 24/96. It has sneak, run, sprint, scuff, slide, land and get-up, plus hand crawls on mud and water.
     It is the backbone of the footstep system.
   - **Leaves uncovered:** wet planks over water, mud pull-outs, hobnails, wool, kit, body falls, rubble, cobbles.
     Recording method unknown.
2. **Mechanical Wave, Footsteps Session V2.0**: $32.
   - **Why:** real outdoor wet surfaces at 24/96: a covered wooden bridge, muddy road, muddy water in boots, dirty wet
     gravel, plus 814 isolated steps. The nearest thing to an outdoor duckboard and a churned trench floor, and very
     cheap.
   - **Leaves uncovered:** mostly shoes rather than boots; mics unknown; long takes to cut.
3. **The Recordist, Ultimate Mud HD Pro**: $79.
   - **Why:** real mud bog, 24/96. Boot steps, jump in and out, a move-out-of-mud file and many suction textures. This
     is the layer that turns short squelches into a sucking pull-out. Clear game licence.
   - **Leaves uncovered:** rubber boots; long takes; no leather boots.
4. **Bonson, MOVES**: $89.
   - **Why:** the only WW2-soldier kit set found: gear, ammo belt, helmet, rifle and body falls, at 24/192.
   - **Leaves uncovered:** canteen, mess tin, webbing specifics; recording method unknown.
5. **Red Libraries, Bodyfall Vol 3 (Dirt & Hardwood)**: $35.
   - **Why:** professional French foley stage with separated chest, knee, hand and feet layers at three distances.
     Body falls and crawl knee hits.
   - **Leaves uncovered:** mud and water falls (layer Ultimate Mud impacts).
6. **Tovusound, Real Outdoor Footsteps**: $59.
   - **Why:** boots recorded outdoors on dirt, deep dirt, grass-mud mix, wet gravel and rocks, MKH 416 plus KMR 81i,
     24/96. Fills wet earth and gravel with genuinely exterior steps.
   - **Leaves uncovered:** mud, water, rubble; long takes.
7. **Sound Ideas, Ultimate Foley Collection**: $395. Buy when we build squads and charges.
   - **Why:** the only real group recordings: boots on mud, hollow wood, gravel and snow from one man to large
     groups, plus soldiers' kit rattle and uniform cloth.
   - **Leaves uncovered:** one-shots; masters are 24/48 (skip the upsampled 96 kHz version).
8. **The Ultimate Foley Collection, Ultimate Prop and Cloth – Cloth half**: $90.
   - **Why:** wool coat and heavy coat cloth movement for the greatcoat layer, plus army gear.
   - **Leaves uncovered:** 48 kHz; long takes.
9. **344 SFX, The Foley Vault: Water Canteen**: $10. A cheap canteen layer from a foley stage.
10. **If PSE's licence can't be settled: WOW Sound, Essential Footsteps Sound Effects Pack**, $129, instead of item 1.
    - **Why:** boot and leather-boot one-shots on hollow wood, puddle, ankle-deep water, dirt and solid wood at
      24/96, plus gear foley.
    - **Leaves uncovered:** no mud, gravel, stone or snow; no left/right labels; Rock The Speakerbox origin and
      method unstated. Audition first.
11. **Optional:**
    - **Snow:** Cold Feet ($50) if snow maps matter. PSE's snow boots may be enough.
    - **Wading and swamp:** Pasi Pitkänen's Footsteps Two ($20), outdoor.
    - **Boot one-shots on dirt and wood:** Periscope combat boot packs ($12 each).
12. **Skip:**
    - Medartimus Soldier and Civilian Footsteps (Zoom H4n).
    - Epic Stock Media Game Footsteps (rejected by ear) and Designed Game Footsteps (designed).
    - The Ultimate Foley Collection's Ultimate Footsteps ($299): boots aren't on the wet surfaces, and the exteriors
      are 44.1 kHz sneaker sweeteners.
    - Studio 23 Ultimate Footstep Collection.
    - The rejected-libraries table above.

Core spend for items 1–6: about **$593**. Add Sound Ideas for groups: about **$988**.

### What no library covers: our own foley session
These need a one-day session, outdoors or in a pit, at 24/96 with a close and a medium mic, recorded as single steps
with left and right feet:
- **Hobnailed boots.** Reproduction French Mle 1916/17 brodequins and German Marschstiefel with nails and heel irons,
  on:
  - stone and cobbles;
  - broken brick rubble;
  - gravel;
  - duckboards;
  - dugout timber steps.
- **Duckboards over water.** Slatted boards on bricks over a mud and water trough, so each step has the hollow knock
  and the slosh underneath, dry and wet.
- **Deep mud in leather boots.** Sink, hold and pull out, from slow to struggling, plus a slip and recovery.
- **Full-body crawl.** In wool and kit through wet earth and mud: elbows, knees, the rifle dragged, belly slides.
- **Body falls into mud and puddles in full kit.**
- **Period kit.** A wool greatcoat, leather cartridge pouches and belt, canteen, mess tin, entrenching tool,
  bayonet in scabbard, rifle sling swivels and an Adrian or Stahlhelm helmet. Record them rattling at walk, run and
  dive-to-ground.

A local recordist costs about £350–500 a day (from the [licensing note](licensing_archives_delivery.md)). Repro boots
and kit are extra; their prices weren't researched. Those recordings would be ours outright, and the hobnails and
duckboards can't be had any other way.
