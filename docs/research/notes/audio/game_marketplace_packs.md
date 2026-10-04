# WW1 / WW2-era sound effect packs on game asset marketplaces

Research date: 2026-10-03. Scope: game-asset marketplaces and game-audio stores selling WW1 (and usable WW2-era) weapon,
artillery and battlefield audio. Licensing is covered only briefly here (another researcher covers it in depth).

Overall headline: no game-asset marketplace pack found covers the core Verdun 1916 French/German arsenal by name
(Lebel 1886, Berthier, Gewehr 98, Chauchat, Hotchkiss M1914, MG 08, St. Etienne, 75mm/77mm field guns, 15cm howitzers).
The highest-quality WW1-relevant material sits with professional SFX publishers (BOOM Library, Watson Wu, GCRadix)
rather than with Unity/Fab "game packs", and even those cover mostly American/British/Russian/Austrian WW1 small arms.

## 1. Fab (fab.com): WW1/WWI/trench/artillery/historical weapons audio, and Fab Standard License for non-Unreal web use

### Takeaway
Fab has very little WW1-specific audio: the only explicitly WW1-tagged listing found is a generic "151 World War Sound
Effects" pack (WW1 and WW2 tags) plus generic weapon packs; the Fab Standard License is stated to allow use in any
engine/tool, so a Babylon.js web game is permitted in principle, but raw-WAV delivery and per-listing details could not
be verified because fab.com returned HTTP 403 to fetches.

### Cited Findings
- "151 World War Sound Effects" (Fab): 151 sound effects covering weapons, vehicles and explosions; tagged Soldier, WW1,
  War, Weapon, WW2; listing links a SoundCloud preview. Seller, price, format and model names not retrievable (page
  returned 403). — [Fab listing](https://www.fab.com/listings/468deb2f-7479-46d3-b692-eca5593690c7)
- "Weapons Sound Pack" (Fab): bundle of 8 sound libraries with more than 1000 weapon sounds, including a "Rifle SFX"
  library. — [Fab listing](https://www.fab.com/listings/15dd6c12-61b3-456a-b849-501f56df08e3?lang=en)
- "Rifle SFX" (Fab): 112 rifle sounds covering three unnamed rifles: shots, distant shots, bolt pulls, bolt back/forward,
  clip in/out, clip hits. Bolt actions make it potentially usable for bolt-action rifle handling, but rifles are not
  identified as WW1 models. — [Fab listing](https://www.fab.com/listings/5d654aea-fe16-42b8-85dc-4c05597c5f3a)
- Generic Fab weapon packs found (no WW1 model naming): "Weapon Sound Pack" Volume 1 through 6 bundles, "370+ WEAPONS
  BUNDLE PACK!", "Combat Sounds Pack - Lite Edition". —
  [Vol 1-6](https://www.fab.com/listings/22a20b8e-a35b-4941-92e8-d19131bb426c),
  [370+ bundle](https://www.fab.com/listings/a619460c-ea7b-4343-a8dc-3e929319d750),
  [Combat Sounds Lite](https://www.fab.com/listings/8288f4c3-d447-4f9a-b909-872086f1e704),
  [Fab weapons SFX category](https://www.fab.com/category/audio/sound-effects--weapons?lang=en)
- Deprecated listing: "WW2 WEAPONS SFX" on the old Unreal Engine Marketplace was reported as not migrated to Fab by its
  seller and only available in the Epic Games Launcher vault for prior owners (i.e. not purchasable now). —
  [UE Marketplace legacy page](https://www.unrealengine.com/marketplace/en-US/product/ww2-weapons-sfx) (fetch returned
  403; status from search-result snippet only)
- Fab Standard License: assets may be used in any game engine or CG tool, commercially distributed when incorporated
  into a project; not limited to Unreal. — [CG Channel on Fab launch](https://www.cgchannel.com/2024/11/epic-games-to-share-new-free-assets-on-fab-every-two-weeks);
  [Unreal Engine blog: Fab launch](https://www.unrealengine.com/blog/fab-epics-new-unified-content-marketplace-launches-today?lang=en-US);
  [Fab content license page](https://www.fab.com/cla)

### Inferences
- Fab is not a good primary source for this project: WW1 coverage is a single generic pack of unknown provenance.
- Because Fab audio listings for Unreal are often shipped as Unreal project content (.uasset) with or without source
  WAVs, buyers should check each listing's "included formats" before purchase; this is a known risk for non-Unreal use.

### Gaps
- Could not confirm the seller, price, sample rate or whether raw WAVs are included for the "151 World War Sound
  Effects" pack (fab.com blocked automated fetches with 403).
- Could not verify whether Fab audio listings generally ship raw WAV alongside Unreal assets; the license text permits
  non-Unreal use, but the deliverable format must be checked per listing.

## 2. Unity Asset Store: WW1/WW2 weapon and artillery audio, ratings and reviews

### Takeaway
The Unity Asset Store has no dedicated WW1 audio pack found; the strongest period-adjacent option is SoundFX Studio's
WWII Weapons Sound System (Parts 1-3, $99.99 each, all-in-one ~EUR 248), which is new (2026) and has too few ratings to
judge; artillery packs are cheap and generic.

### Cited Findings
- "WWII Weapons Sound System Part 1" (SoundFX Studio): $99.99, 223.2 MB; rifles, pistols, MGs, SMGs, shotguns; v1.1
  released 2026-06-23; "not enough ratings", 5 favorites; Single Entity license under standard Unity Asset Store EULA. —
  [Unity Asset Store](https://assetstore.unity.com/packages/audio/sound-fx/weapons/wwii-weapons-sound-system-part-1-326501)
- Part 2 ($99.99, 207.5 MB) and Part 3 ($99.99, 223.8 MB) and "WWII Weapons ALL-IN-ONE Sound System" (EUR 248.40,
  698.5 MB) from the same publisher. —
  [Part 2](https://assetstore.unity.com/packages/audio/sound-fx/weapons/wwii-weapons-sound-system-part-2-350390),
  [Part 3](https://assetstore.unity.com/packages/audio/sound-fx/weapons/wwii-weapons-sound-system-part-3-374908),
  [All-in-one](https://assetstore.unity.com/packages/audio/sound-fx/weapons/wwii-weapons-all-in-one-sound-system-376006)
- The same publisher's own-store "WWII Weapons Sound FX Library - Part I" (likely the source content of Unity Part 1):
  $109.99 (reduced from $159), 529 files, WAV 48 kHz/24-bit, 35m51s; 12 weapons: PPS-43, Mosin-Nagant, MG-42, SKS,
  Mauser C96, StG-44, Browning Auto-5, Gewehr 43, Suomi KP-31, Walther P38, MAS-49, Sten Mk II. Contains both
  "Construction Kit" (raw recordings) and "Designed" versions (designed versions described as processed via Unreal
  Engine effects); close one-shots, distant one-shots, loops and tails. No WW1 weapons. —
  [SoundFX Studio shop](https://soundfx.studio/shop/sfx-for-games/weapons/wwii-weapons-sound-fx-library-part-i/)
- "Gun Sound Pack" (Gamemaster Audio): $19, 53.8 MB, 18 reviews, 506 favorites, last updated 2016-03-31; generic rifles,
  sniper, pistols; no historical models. Stale (10 years without update). —
  [Unity Asset Store](https://assetstore.unity.com/packages/audio/sound-fx/weapons/gun-sound-pack-59420)
- Other generic packs: "Weapon Sound Pack - Volume 1 + 2" (Catastic, $30.99), "Weapons SFX_Pack" (cplomedia, $10). —
  [Catastic](https://assetstore.unity.com/packages/audio/sound-fx/weapons/weapon-sound-pack-volume-1-2-147548),
  [cplomedia](https://assetstore.unity.com/packages/audio/sound-fx/weapons-sfx-pack-309908)
- Artillery: "Artillery Assault Sound Pack" (Shape of Sound Ltd, about EUR 4.59) and "Artillery Sound FX" (cplomedia,
  $10). — [Artillery Assault](https://assetstore.unity.com/packages/audio/sound-fx/weapons/artillery-assault-sound-pack-8069),
  [Artillery Sound FX](https://assetstore.unity.com/packages/audio/sound-fx/weapons/artillery-sound-fx-332520)
- WW1 items on the Unity store found in searches were 3D environments (World War Trenches, Bunkers & Trenches Pack, World
  War 1 Pack, World War 1: WarZone), not audio. —
  [World War Trenches](https://assetstore.unity.com/packages/3d/environments/historic/world-war-trenches-152381),
  [WW1 WarZone](https://assetstore.unity.com/packages/3d/environments/world-war-i-313921)
- Note: the Catastic "Weapon Sound Pack" series also appears on Fab (Volume 1+2, 1+2+3, 1-6 bundles), so same content
  is cross-listed. — [Fab Vol 1+2](https://www.fab.com/listings/8dddc664-111f-437d-80d2-3632777a792d)

### Inferences
- For a web game, buying the SoundFX Studio content from its own store (single-user royalty-free license) likely gives
  cleaner WAV delivery and licence terms than the Unity Asset Store version; the MG-42, Mosin-Nagant, Mauser C96 and
  Browning Auto-5 could stand in partially for WW1 equivalents (MG 08 and MG-42 have very different cyclic rates, so
  the MG-42 is a poor substitute for a Maxim-pattern MG 08).
- Cheap artillery packs at EUR 5-10 are unlikely to meet the "high quality" bar.

### Gaps
- No user review text was retrievable for the Unity packs; quality signals limited to rating counts and favorites.
- Weapon lists for SoundFX Studio Parts 2 and 3 not retrieved.

## 3. Other marketplaces: GameDev Market, itch.io, Humble Bundle, Sonniss, A Sound Effect, Epidemic Sound, Envato, Splice, Soundly

### Takeaway
A Sound Effect and Sonniss are where the professional WW1/WW2 libraries are sold; itch.io and GameDev Market only have
generic low-cost "war" packs; no WW1-specific pack was found on Envato/AudioJungle or Epidemic Sound; several "free WW1"
sources are AI-generated or of unknown provenance.

### Cited Findings
- A Sound Effect carries BOOM Library "World War I Firearms", Watson Wu "Rifles & Pistols of The World Wars", 344 SFX
  "Historical Weapons Bundle"/"Historical Weapons Vol. 1", "Battle Rifles and Pistols"; licenses are royalty-free with
  the number of users selected at checkout. —
  [WWI Firearms](https://www.asoundeffect.com/sound-library/world-war-i-firearms/),
  [Rifles & Pistols of the World Wars](https://www.asoundeffect.com/sound-library/rifles-pistols-of-the-world-wars/),
  [Historical Weapons Bundle](https://www.asoundeffect.com/sound-library/historical-weapons-bundle/),
  [Historical Weapons Vol. 1](https://www.asoundeffect.com/sound-library/historical-weapons-vol-1/)
- Sonniss sells GCRadix "Firearm Foley & Mechanics: WW2" (details in section 4) and has a howitzer tag page. —
  [Sonniss WW2 foley](https://sonniss.com/sound-effects/firearm-foley-mechanics-ww2/),
  [Sonniss howitzer tag](https://sonniss.com/sound-effects-tag/howitzer/)
- GameDev Market: only generic military packs found, e.g. "Military Air/Sky Warfare Vehicles mini pack" (180 files, 60
  original sounds) and "Military Land & Sea Warfare Vehicles mini pack"; nothing WW1-specific. —
  [Air pack](https://gamedevmarket.net/asset/military-air-sky-warfare-vehicles-mini-pack-jets-helicopters-planes-air-force-sound-effects),
  [Land/sea pack](https://gamedevmarket.net/asset/military-land-sea-warfare-vehicles-mini-pack-jeeps-trucks-ships-submarines-sound-effects-pack)
- itch.io: generic war packs (e.g. Delusiondrive "Sounds of War" with 250+ sounds in MP3 format; Fusehive "Combat
  Warfare MINI PACK" and "Modern Warfare Bundle"; touati "Weapon and war sound effects pack"); itch.io's World War I
  game-asset tag had about 36 results, mostly visual. MP3-only delivery is a quality red flag. —
  [Sounds of War](https://delusiondrive.itch.io/sounds-of-war-full-audio-effects-pack-in-mp3-format),
  [Fusehive mini pack](https://fusehive.itch.io/sniper-rifle-scopes-knives-marching-war-ambiences-sound-effects-library-combat),
  [touati](https://touati.itch.io/weapon-sfx),
  [itch WWI tag](https://itch.io/game-assets/tag-world-war-i)
- itch.io "Army Voice Pack" (raketenfaust): 155 vocal sound effects of a WW2 soldier, $4.49 (English voice; relevance
  to French/German troops doubtful). — [itch.io](https://raketenfaust.itch.io/army-voice-pack/purchase)
- Humble Bundle: past "Music & Sound Effects" and "Sound Effects & Audio" bundles were general-purpose (music, explosions,
  UI); no current WW1-themed Humble audio bundle found. —
  [GameFromScratch](https://gamefromscratch.com/humble-music-sound-effects-bundle/),
  [Epic Bundle](https://www.epicbundle.com/humble-sound-effects-audio-software-bundle/)
- Envato AudioJungle / Epidemic Sound: no dedicated WW1 trench pack found; Epidemic has military vehicle categories and
  individual "bolt action" gunfire tracks (subscription licence). —
  [Epidemic military](https://www.epidemicsound.com/fr/sound-effects/categories/vehicles/military/),
  [Epidemic bolt action SFX](https://www.epidemicsound.com/sound-effects/tracks/25eb5760-a0f5-42eb-9ce1-62143fcd863d/)
- Media Music Now sells individual "Warfare WWI World War One Battlefield" ambiences (distant fighting, guns/explosions/
  screams, whistle charge with gunshots and explosions). — [Media Music Now WW1 tag](https://www.mediamusicnow.co.uk/royalty-free-sound-effects-tags/ww1)
- Musehub "Vintage Battle & War Sounds" claims authentic WWI and WWII recordings of artillery and tanks. —
  [Musehub](https://www.musehub.com/loops-and-audio/vintage-battle-war-sounds)
- Sound Ideas "Sounds of War": 75 authentic historic WW2 recordings (weapon fire, equipment, aircraft, battle
  sequences). — [Sound Ideas](https://sound-ideas.com/products/sounds-of-war-sound-effects-library)
- FLAG (AI-generated): ElevenLabs hosts "World War" sound effects pages and invites users to generate their own;
  these are AI generated. — [ElevenLabs world war SFX](https://elevenlabs.io/sound-effects/world-war)
- FLAG (unknown provenance / free aggregator): Pixabay lists thousands of results for "World War 1" (user uploads,
  including "World War 1 Trench warfare battlefield sounds"); audio.com "WW1 Sound Effects" collection by Sonicfableforge;
  quality and source unverified. —
  [Pixabay WW1 trench](https://pixabay.com/sound-effects/world-war-1-trench-warfare-battlefield-sounds-6744/),
  [audio.com collection](https://audio.com/sonicfableforge/collections/ww1-sound-effects)
- Imperial War Museum holds archival First World War sound compilations (gunfire, horses, marching, orders, troops
  singing) and "First World War Battle Sounds"; archive, not a game asset (licensing would need IWM terms). —
  [IWM Trench Warfare](https://www.iwm.org.uk/collections/item/object/80000964),
  [IWM Battle Sounds](https://www.iwm.org.uk/collections/item/object/80021020)

### Inferences
- The best "store" for this project is A Sound Effect (aggregates BOOM, Watson Wu, 344 SFX with user-count licensing),
  plus Sonniss for GCRadix foley. Game-asset stores (Unity, Fab, itch, GameDev Market) add little beyond generic packs.
- Many "WW1 sound effects" on the open web are re-labelled modern recordings or synthesised; treat any pack without
  named weapon models and recording notes as unverified.

### Gaps
- Splice SFX and Soundly were not searched in depth (time budget); no WW1-specific packs surfaced for them in general
  searches.
- No current (Oct 2026) Humble Bundle containing period weapon audio was found; Humble bundles rotate, so this should be
  rechecked at purchase time.

## 4. Notable creator packs: real names, links, contents, quality

### Takeaway
The best real WW1 recording available is BOOM Library's "World War I Firearms" ($139, 4,594 sounds, 24-bit/96 kHz,
genuine period guns, close/mid/far in two environments), but its weapon list is American/British/Russian/Austrian/
Belgian with only the Luger P08 and Mauser C96 on the German side and no French weapons and no machine guns; Watson Wu's
"Rifles & Pistols of The World Wars" and GCRadix's WW2 foley library are the best complements.

### Cited Findings
- BOOM Library "World War I Firearms": Bundle 571 files / 4,594 sounds / 15.41 GB; Construction Kit 499 files / 4,162
  sounds / 13.96 GB; Designed 72 files / 432 sounds / 1.45 GB; all WAV 24-bit/96 kHz; listed at $139 per edition on the
  page fetched. Close/mid/far mics in two acoustic environments. —
  [BOOM Library](https://www.boomlibrary.com/sound-effects/world-war-i-firearms/)
- BOOM "World War I Firearms" weapon list: revolvers Colt New Service, M1917, Webley Mk VI, Nagant M1895; pistols Steyr
  M1912, Colt M1911, FN Highpower, Mauser C96, P08 Luger; rifles M1917 Enfield, Mosin-Nagant 1891 and M1907, Springfield
  M1903 / M1903 A4, Steyr 1895, Krag-Jorgensen; shotguns Browning Auto 5, Winchester M1887. No Lebel, Berthier, Gewehr
  98, Chauchat, Hotchkiss or MG 08. — [BOOM Library](https://www.boomlibrary.com/sound-effects/world-war-i-firearms/)
- BOOM states all are genuine WWI-era firearms (no replicas), recorded outdoors; captures cocking, reloading, dryfires,
  misfires and handling; available in Stereo, Ambisonics and ORTF3D. —
  [A Sound Effect listing](https://www.asoundeffect.com/sound-library/world-war-i-firearms/) (search snippet);
  [Sound On Sound news](https://www.soundonsound.com/news/boom-library-release-world-war-firearms)
- BOOM "Historical Firearms": 17 weapons (muzzle-loaders, muskets, carbines, pistols, cannons, breechloaders, revolvers);
  Construction Kit 366 files / 2,270 sounds / 11.9 GB at 24-bit/192 kHz; Designed 74 files / 296 sounds at 96 kHz; from
  $139. Pre-WW1 era; cannons possibly useful for artillery layers. —
  [BOOM Library](https://www.boomlibrary.com/sound-effects/historical-firearms/)
- BOOM "World War II Firearms" Bundle: 25 WW2 firearms. — [BOOM Library](https://boomlibrary.com/sound-effects/world-war-ii-firearms)
- Watson Wu "Rifles & Pistols of The World Wars": 12 authentic WW1 and WW2 weapons, 587 files (107 foley, 480 firing);
  rifles include Enfield, M1 Carbine, M1 Garand, Mauser, Mosin Nagant; pistols include Webley revolver, Colt 1911, German
  Luger, Smith & Wesson revolvers; recorded over a large pond with 10 variations per perspective for game use. Wu's
  credits include Call of Duty: Modern Warfare and Assassin's Creed. —
  [A Sound Effect listing](https://www.asoundeffect.com/sound-library/rifles-pistols-of-the-world-wars/);
  [A Sound Effect weapon recording article](https://www.asoundeffect.com/weapon-sound-effects-recording/) (search snippet)
- GCRadix "Firearm Foley & Mechanics: WW2" (Sonniss): $119 (from $199), 486 files, 4,000+ sounds, 5.28 GB, 24-bit/96
  kHz stereo, minimum 8 variations per action; MP40, Thompson M1A1, K43, M1 Garand, Mosin-Nagant, G43, Mauser 98K,
  Walther P38, Luger P08, Colt M1911, Zastava M72, M260, StG 44, Marushin M500 (the last is a replica/airsoft brand,
  so not all items are real firearms). Mauser 98K and Luger handling are close to Gewehr 98 / P08 WW1 handling. —
  [Sonniss](https://sonniss.com/sound-effects/firearm-foley-mechanics-ww2/)
- SoundFX Studio WWII libraries: see section 2 (12 WW2 weapons per part, raw and designed, 48 kHz/24-bit). —
  [SoundFX Studio](https://soundfx.studio/shop/sfx-for-games/weapons/wwii-weapons-sound-fx-library-part-i/)
- 344 SFX "Historical Weapons Bundle" / "Historical Weapons Vol. 1": listed on A Sound Effect; weapon list, price and
  format not retrievable. — [A Sound Effect](https://www.asoundeffect.com/sound-library/historical-weapons-bundle/)
- Gamemaster Audio "Gun Sound Pack": generic, $19, not updated since 2016 (section 2). —
  [Unity Asset Store](https://assetstore.unity.com/packages/audio/sound-fx/weapons/gun-sound-pack-59420)

### Inferences
- The French side (Lebel 1886, Berthier, Chauchat, Hotchkiss M1914, St. Etienne M1907, Ruby pistol, Lebel revolver) is
  absent from every commercial pack found; the German side is limited to Luger P08 and Mauser handguns, plus Mauser 98K
  (close cousin of Gewehr 98). Machine guns of the Maxim pattern (MG 08) and the 75mm/77mm field guns are not covered.
  Plan for substitution (Mosin/Steyr/Enfield for bolt actions, slowed/edited MG recordings for MG 08/Hotchkiss) or
  commissioning a custom recording session.
- A practical "buy" short list for high quality: BOOM World War I Firearms (Bundle), GCRadix WW2 Foley & Mechanics,
  Watson Wu Rifles & Pistols of the World Wars; artillery, gas and ambience will need separate libraries.
- No packs named exactly "WW1 Weapons Sound Pack", "Great War Weapons", "World War I Soundscape" or "Trench Warfare SFX"
  were found on the marketplaces searched; those names appear not to exist as products.

### Gaps
- Exact current prices per license tier (A Sound Effect user tiers) and release dates for BOOM WWI Firearms and Watson
  Wu's library not retrievable (pages load dynamically).
- Exact model of Watson Wu's "Mauser" rifle (Gewehr 98 vs Kar98k) not confirmed.
- No "Sound Ex Machina" or "Dmitry" WW1 packs were found; could not confirm they exist.
- No demo-video or forum review assessments retrieved for these libraries.

## 5. Shipped WW1 games: sound designers and libraries

### Takeaway
The M2H/BlackMill WW1 series (Verdun, Tannenberg, Isonzo) uses Dutch studio Game Audio Squad for sound design (Isonzo
won Dutch Game Awards Best Audio 2023), but they do not sell a library; Battlefield 1 (DICE) recorded its own weapons
with substitutes and is the best documented; no evidence found that any of these teams sell their WW1 libraries.

### Cited Findings
- Game Audio Squad did sound design for Isonzo (released Sept 2022), has worked with the WW1 series team since 2017 on
  Verdun, Tannenberg and Isonzo; Isonzo won Dutch Game Awards "Best Audio 2023". No libraries for sale and no recording
  details listed on the project page. — [Game Audio Squad: Isonzo](https://www.gameaudiosquad.com/projects/isonzo)
- Bart Delissen is composer for the series. — [Wikipedia: Verdun](https://en.wikipedia.org/wiki/Verdun_(video_game));
  [Wikipedia: Isonzo](https://en.wikipedia.org/wiki/Isonzo_(video_game))
- Isonzo reviews praise its sound design. — [TechRadar NL review](https://global.techradar.com/nl-nl/reviews/isonzo-review)
- Battlefield 1: audio director Bence Pajor; lead sound designers Andreas Almström and Mari Saastamoinen Minto; Pole
  Position Production recorded vehicles; Criterion Games did transport vehicle sound design. Weapons recorded in Sweden,
  California and Idaho in forests, fields, mountains, trenches, barns and urban areas at varying distances; core mechanics
  recorded in deserts to avoid reverb; substitutes with similar action/materials used when originals unavailable;
  explosions layered with shrapnel, shockwave, environmental report and debris; ambiences used personal field recordings
  from France plus archive from earlier Battlefield titles; Frostbite assembled sounds from components dynamically by
  distance, environment, angle and fire rate. — [A Sound Effect: Battlefield 1 sound](https://www.asoundeffect.com/battlefield-1-sound/)

### Inferences
- Battlefield 1's layered approach (component-based gunshots and multi-layer explosions varying with distance) is a
  useful design reference for a top-down mass-battle game, where distance layers and tails matter more than close
  mechanical detail.
- Since Game Audio Squad does not sell a library, the realistic way to get their quality is to commission them or a
  similar studio.

### Gaps
- No sound designer credits found for Beyond the Wire, Holdfast: Nations at War, Foxhole or Valiant Hearts in searches;
  their in-game credits/MobyGames would need checking.
- No evidence found of which commercial libraries (if any) Verdun/Tannenberg/Isonzo used.
