# Free Trenches, Scarce Poilus Shape Browser Verdun

A realistic Verdun can be built in Babylon.js for **under $300 of core assets**, but the market is lopsided: the battlefield is effectively solved and the French soldier is not. Quixel's **free "Military Trenches" collection** covers the environment. It holds 160 photoscanned trench walls, sandbags, duckboards, wire, craters and burnt trees, released in December 2025 and downloadable as glTF/GLB under the Fab Standard License. CC0 mud, rust and plank textures from Poly Haven and ambientCG fill in the ground, and French 75s, German 77 mm guns, Lebels, Gewehr 98s and Hotchkiss guns cost $5 to $40 each. No marketplace sells a **realistic, rigged, LOD'd, crowd-weight Poilu**. The only three realistic French soldiers are a 79k-polygon UDIM model, a MetaHuman outfit kit and a Character Creator outfit. That gap matters less than it looks. With hundreds of soldiers under an angled top-down camera, every soldier has to come down to **roughly 4k triangles at gameplay zoom**, the same weight as the existing "low-poly but realistically textured" WW1 packs. Realism on screen therefore comes from materials, animation, lighting and smoke, not mesh density.

The recommended path has three tiers:

1. **Core kit, about $270.** AmeliaTeale's French and German packs as the crowd, Albin's rigged Poilu as the realism benchmark, Manuel Rivas weapons, FieriaGold and Formix artillery, and Mixamo plus Kevin Iglesias animation baked to vertex-animation textures.
2. **Optional upgrades, about $620.**
3. **A commission, estimated at $3k to $7k,** for a matched French/German base soldier once the prototype proves fun.

Licensing is the hidden constraint. Because the browser downloads every glTF, avoid TurboSquid and Reallusion content outright, ship Fab, CGTrader and Unity assets packed and obfuscated, and serve only CC0 content as raw files. Synty is not meaningfully faster here: its WWI map has no French soldier, depends on the $99.99 War Pack, and ships no animations.

## Only three realistic Poilus exist, and none fits a crowd

The French side is the binding constraint.

**Albin Merle's SOLDIER WWI French Rigged** is the most complete realistic model:

- Greatcoat, backpack and Adrian helmet.
- **79,291 polygons with 4K PBR textures on UDIM UVs.** It is about three times a crowd budget, and the UDIM layout must be rebaked onto a single 0–1 atlas before glTF export.
- A Blender rig plus a rigged FBX. No animation ships with it; the preview video uses Mixamo mocap.
- **$60 on CGTrader** ($42 in a 30% sale on the research date). One buyer warns it is "not to standard Unreal proportions" ([CGTrader](https://www.cgtrader.com/3d-models/military/military-character/soldier-wwi-french-rigged)).
- RenderHub and TurboSquid also sell it at $60 ([RenderHub](https://www.renderhub.com/albin/soldier-wwi-french-rigged)). Buy it on CGTrader, because TurboSquid's license blocks glTF web delivery (see the licensing section). RenderHub's terms were not reviewed.

**DarkTide Studios' French WW1 type 1 – MetaHuman Kit** ($25.99 Personal / $60.99 Professional):

- The only French option explicitly dressed for "Middle war 1916".
- The only one that ships **4 LODs**, with a 30,973-vertex outfit at LOD0.
- Compatible with the UE mannequin skeleton ([Fab](https://www.fab.com/listings/09e6076f-6ba3-49fe-93d9-deac7876d258)).
- Since June 2025 Epic allows MetaHumans in other engines ([CG Channel](https://www.cgchannel.com/2025/06/you-can-now-sell-metahumans-or-use-them-in-unity-or-godot/)). The kit still needs a MetaHuman body and an Unreal export pass.

**Pixe4Fiction's Great War French Soldier Outfit** for Character Creator ($29.50 list):

- The most historically detailed: capote Poiret greatcoat, puttees and Brodequin 1916 boots.
- The Adrian helmet is sold separately.
- It carries Reallusion's license, which blocks web delivery ([Reallusion](https://www.reallusion.com/contentstore/pack/character-creator/3d-cloth/great-war-french-soldier-outfit)).

The Museum of the Second World War's "French Soldier from Verdun" scan on Sketchfab is display-only ([Sketchfab](https://sketchfab.com/3d-models/french-soldier-from-verdun-wwi-3b8aa87e861f46c982ce83f2f69aefd5)).

Crowd-weight French soldiers exist only at the low-poly end. AmeliaTeale's **WW1 low poly British/French pack** ($14.99) holds 116 meshes: two uniforms, two web-gear sets, seven hats, two gas masks, five heads, 13 beards, 13 mustaches and ten weapons. Characters are **3.6k–3.9k vertices with 1k textures**, skinned to the UE4 skeleton ([Fab](https://www.fab.com/listings/07831ff9-9019-4c58-8026-65c7e74530d0)). Batuhan Ceyhan's **Stylized WW1 Characters** ($9.99/$14.99) includes a French soldier among six nations at ≤5.1k vertices, but in a hand-painted style that fights a realistic direction ([Fab](https://www.fab.com/listings/5bdd5ebb-72eb-4dec-8c86-86ba199d655c)). Whichever mesh wins, the uniform must read as horizon blue, the colour of French metropolitan troops from 1915 to 1921 ([Wikipedia](https://en.wikipedia.org/wiki/Horizon_blue)).

### German infantry is better served, but skews early-war or WW2

**Crowd-weight German packs:**

- **AmeliaTeale's Low poly WW1 German pack** ($14.99) mirrors the French pack: 108 meshes, three helmets, 30 hairstyles and a 3.6k-vertex character. It adds **20 animations** retargeted from Epic's starter pack. The listing does not name the helmets, so check the screenshots for a Stahlhelm before buying ([Fab](https://www.fab.com/listings/dd5cc155-efdf-4bc3-8ab5-6d57c7f4c062)).
- **Studio FieriaGold's Soldiers WW1** ($39.99) is the most realistically textured crowd-weight option. It has five German and four British soldiers at **3k–9k vertices with 2K–4K textures**, plus ten headwear pieces. The listing contradicts itself ("Rigged: No" and "Rigged to Epic skeleton: Yes"), and there is no French soldier ([Fab](https://www.fab.com/listings/2b135e0e-d17a-4cb4-9834-de0c74b190c6)).

**The realistic German models are either cinematic or early-war:**

- MoonyState's Pickelhaube uniform is 390,108 triangles and unrigged ([Fab](https://www.fab.com/listings/5cfb0a94-ef4d-48e2-96e1-46d5793c9e8f)).
- DarkTide's German MetaHuman kit is an "early war 1914" outfit at 134,135 LOD0 vertices ([Fab](https://www.fab.com/listings/c33d7dca-7423-4322-9d38-34dbb4ca2b97)).

**Kitbash parts for a 1916 silhouette:**

- Davicolt's **Stahlhelm M16**, $9.99 ([Fab](https://www.fab.com/listings/52834819-8a4e-4bfd-a8de-6b66cffe2c23)).
- Vasikle's 1,946-triangle Feldrock tunic, $16.99 ([Fab](https://www.fab.com/listings/d433af06-5ffd-4cec-a8e7-778a72157764)).
- TalkingDrums' WW2 **German Soldier WWII** ($74.99), the best-engineered realistic German body on Fab. It has 22,000 vertices, 2048 textures, a recolour-and-camouflage material system, and 4.5–4.6 stars from 13–14 reviews ([Fab](https://www.fab.com/listings/64615c63-6a32-4e99-b46e-69b132f76a9f)). With an M16 helmet and a feldgrau recolour it makes a plausible 1916 rifleman at RTS distance. Enthusiasts will still spot the WW2 boots, webbing and rifle.

These packs share one useful trait. AmeliaTeale, FieriaGold, Batuhan Ceyhan, TalkingDrums and DarkTide all target the **Epic/UE4 mannequin skeleton**, so one retargeted animation library can drive both armies. Only DarkTide states LOD support.

| Asset | Side | Weight | Textures | Rig / LODs | Price | Role |
|---|---|---|---|---|---|---|
| [AmeliaTeale WW1 British/French pack](https://www.fab.com/listings/07831ff9-9019-4c58-8026-65c7e74530d0) | FR/UK | 3.6–3.9k verts | 1k | UE4 skeleton / none stated | $14.99 | Crowd tier now |
| [AmeliaTeale WW1 German pack](https://www.fab.com/listings/dd5cc155-efdf-4bc3-8ab5-6d57c7f4c062) | DE | 3.6k verts | 1k | UE4 skeleton, 20 anims | $14.99 | Crowd tier now |
| [FieriaGold Soldiers WW1](https://www.fab.com/listings/2b135e0e-d17a-4cb4-9834-de0c74b190c6) | DE/UK | 3–9k verts | 2–4K | Epic (listing contradictory) | $39.99 | More realistic German crowd |
| [Albin SOLDIER WWI French Rigged](https://www.cgtrader.com/3d-models/military/military-character/soldier-wwi-french-rigged) | FR | 79,291 polys | 4K UDIM | Blender rig / none | $60 | Hero and benchmark; decimate |
| [DarkTide French WW1 MetaHuman Kit](https://www.fab.com/listings/09e6076f-6ba3-49fe-93d9-deac7876d258) | FR (1916) | 30,973-vert outfit LOD0 | not stated | UE mannequin / 4 LODs | $25.99 | Realism experiment |
| [TalkingDrums German Soldier WWII](https://www.fab.com/listings/64615c63-6a32-4e99-b46e-69b132f76a9f) | DE (WW2) | 22,000 verts | 2048 | Epic legacy | $74.99 | Realistic kitbash base |
| [Pixe4Fiction Great War French Outfit](https://www.reallusion.com/contentstore/pack/character-creator/3d-cloth/great-war-french-soldier-outfit) | FR | CC outfit | not stated | CC4 | $29.50 | Avoid for web (license) |
| [MoonyState German WW1 Uniform](https://www.fab.com/listings/5cfb0a94-ef4d-48e2-96e1-46d5793c9e8f) | DE (Pickelhaube) | 390k tris (high + low poly) | up to 8K | none | $19.99 | Reference only |

### Synty's WWI map is a greybox, not a shortcut

Synty's only WW1 product, **POLYGON – War Map – WWI** ($24.99), contains 98 prefabs:

- One British and one German soldier.
- 14 attachments, including French helmets.
- 15 vehicles and artillery pieces.
- 63 trench, crater and wire pieces.
- Four weapons.
- Delivered for Unity and Unreal, plus FBX/OBJ source.

It **requires the $99.99 POLYGON War Pack** and has **no French soldier and no animations** ([Synty Store](https://syntystore.com/products/polygon-war-map-wwi); [War Pack](https://syntystore.com/products/polygon-war-pack)). A War Pack bundle appeared at $62.49 on sale, though that price came from search snippets ([Synty bundle](https://syntystore.com/products/polygon-war-and-wwi-map-bundle)).

Its license is clean for the web: engine-agnostic, with five seats per purchase ([Synty EULA](https://syntystore.com/pages/end-user-licence-agreement)). Its native FBX also skips the Unreal export step that the AmeliaTeale packs need. That one pipeline advantage does not outweigh the problems for a Verdun game: no Poilu, one generic soldier per side, and a flat-shaded look that clashes with photoscanned trenches. Use it, if at all, to greybox layout and test camera readability.

The real "realistic-stylized" middle ground is the AmeliaTeale and FieriaGold tier: human proportions, period-correct kit and a few thousand vertices. UNIGAME.ASSET's 14,075-triangle WW2 German also fits; it is pitched as "a balance between historical recognition and stylized performance" ([Fab](https://www.fab.com/listings/5607f9b0-7270-4a11-bacf-e66d3134507e)). Everything below that tier is openly stylized: Batuhan Ceyhan, Toony Tiny WW1 ([Fab](https://www.fab.com/listings/cdae1ac7-2b40-4414-bdca-ef90cc7cb95e)), and Misixin's 325-asset Stylized World War 1 – Western Front ([Fab](https://www.fab.com/listings/7272bcab-5097-457e-922e-b335805409a2)). No side-by-side visual comparison was done for this report, so check each listing's screenshots and videos against the target look before buying.

## Free photoscans solve the trenches; $5–$40 packs cover the guns

**Quixel Megascans' "Military Trenches"** collection is the single most valuable find. It was published on Fab on 18 December 2025 as **160 free listings** ([Fab search](https://www.fab.com/search?q=Military%20Trenches)):

- 47 walls (wood, dirt, corrugated metal, torn sandbag).
- 18 equipment pieces (duckboards, ladders, stakes, wooden obstacles).
- Nine sandbag barriers.
- Five burnt trees, four tunnel entrances and three craters.
- Roof frames, a barbed-wire set, ground patches and decals.

Each piece downloads as **FBX, glTF, GLB and USDZ** under the Fab Standard License. A free Unreal sample level assembles 179 of the meshes with LODs and is rated 4.53 from 17 reviews ([Fab](https://www.fab.com/listings/f18c343f-b771-47b0-a02a-129771fd9804)).

The catch is excess fidelity. A single duckboard has **3,431 px/m texel density and a 194 MB ZBrush source** ([Fab](https://www.fab.com/listings/ede585a5-4e75-48e2-9b7c-6c3ec0b429ad)), so every piece needs decimation and 512–1K textures before it ships. The listings do not give per-asset triangle counts or say whether the glTF downloads include LODs. Wattle and French A-frame revetments are also absent.

**Paid environment packs fill specific gaps:**

- **Karamai's Sandbag Walls** ($24.99): 8k–13k-triangle LOD0, rated 5.0 from 22 reviews ([Fab](https://www.fab.com/listings/d11a4ff5-41f9-4d7e-9e62-8df679791de2)).
- **Karamai's Barbed Wire Pack** ($19.99): hand-made LODs and a shared wire atlas ([Fab](https://www.fab.com/listings/196d56d3-9b8a-453f-9243-c568a95b07ab)).
- **Red Blue Pixel's World War 1 | Warzone** ($69.99): the widest WW1-specific coverage, with 111 meshes at 164–23k vertices covering trenches, no-man's-land, ruined villages, wire entanglements and craters ([Fab](https://www.fab.com/listings/4a92e959-e5d6-438c-b9a8-e739b5efd927)).

**Packs to skip:**

- Katanalevy's Great War Trenches (rated 4.2) averages about **80,000 vertices per Nanite mesh**, too heavy for the web without major reduction ([Fab](https://www.fab.com/listings/924f8386-c146-4abf-84dd-44b821ebc96d)).
- Ultima Store's AI-generated trench props list 40,478,167 vertices and no LODs ([Fab](https://www.fab.com/listings/c0735e60-5a55-4c99-bd15-d28333be96f7)).

Verdun's concrete forts have no commercial model. The Fort Douaumont photogrammetry on Sketchfab is CC BY-NC, so it is usable only as reference ([Sketchfab](https://sketchfab.com/models/9c55f163f61045e9a27805be858fc7e4)). Ruined-village pieces have to come from WW2 sets. Leartes' $129.99 WW2 Warzone Environment Megapack ships a Unity version ([Fab](https://www.fab.com/listings/ace921c5-c82d-477c-9e54-daa35fa2c756)).

**Small arms are cheap and already close to crowd weight:**

- Manuel Rivas sells a **Lebel 1886** ($9.99, 3,115 faces), **Gewehr 98** ($9.99, 3,016 faces) and **Hotchkiss M1914** ($12.99, 3,592 faces) as FBX/Blend with 4K textures ([Lebel](https://www.fab.com/listings/ffc71f49-5603-40ca-b6dc-b1a8bcdf414c); [G98](https://www.fab.com/listings/19c0dcc1-8677-43a9-8f94-eac930bbd934); [Hotchkiss](https://www.fab.com/listings/47ebb6b5-eb2d-40db-82a4-445d8d6e2360)).
- Ovidiu Barat's WW1-era grenade line ships GLB at $3.99 each ([Fab](https://www.fab.com/listings/4c0067d0-0ac8-4881-b131-2f692e160cc1)).
- Studio FieriaGold's **Weapon WW1 (pack 2)** ($51.99) is the only single purchase that covers the Lebel, Chauchat, Gewehr 98 and MG 08/15 together. It is Unreal-only, has no LODs, runs 7k–33k vertices and has a single 2-star review ([Fab](https://www.fab.com/listings/aa39b43e-daa1-4096-a00d-b9245fa03922)).
- Outside that pack, the Chauchat exists only as free CC-BY Sketchfab models, such as TastyTony's 9,373-face low-poly version ([Sketchfab API](https://api.sketchfab.com/v3/search?type=models&q=chauchat&downloadable=true)).
- An MG08 at 9,200 triangles is listed on ArtStation for $25; this was not verified ([ArtStation](https://www.artstation.com/marketplace/p/kx5M/mg08-german-machine-gun)).

Two weapon gaps need custom work. No WW1 flamethrower (Wex, Kleif or Schilt) was found on any marketplace checked ([Fab search](https://www.fab.com/search?q=flamethrower)). Fab's stick grenades include models explicitly labelled M24 rather than the 1915–16 pattern ([Fab search](https://www.fab.com/search?q=stielhandgranate)).

**Artillery is similarly well covered:**

- FieriaGold's **Cannons WW1** ($39.99) is the only pack with both signature Verdun field guns, the **French 75 (75mm1897)** and the **German 77 mm 1896 (FK 96)**. It also includes the 150 mm 1902 and the de Bange 155 mm 1877, at 20k–30k vertices per gun with 4096 textures and no LODs ([Fab](https://www.fab.com/listings/8f7195fb-1b68-4fc3-830b-dc8a86f8495a)).
- Formix sells German heavies individually at **$4.99** each as Blend/FBX/OBJ: the FK 96, 15 cm Kanone 16, 21 cm Mörser 10 and Big Bertha. Its ten-gun collection at $39.99 ships **GLB and glTF directly** ([FK 96](https://www.fab.com/listings/4ef2ecbd-02bf-4a24-aaa2-de3b98b896c9); [Collection](https://www.fab.com/listings/b049e9b8-5eb2-4004-a724-1e107d4a3765)).
- Neither seller says whether its FK 96 is the shielded "n.A." variant used in 1916, so check the previews.
- No game-ready French 155 mm Rimailho or Schneider, and no German 15 cm sFH 13, was found.
- The French 58 mm trench mortar exists as a free CC-BY Sketchfab model at 11,606 faces ([Sketchfab](https://sketchfab.com/models/9e9ce35f12764ecfb01a0a57f6b33fb3)).

**Terrain materials are the cheapest category:**

- **Poly Haven's 864 CC0 textures** include brown_mud_02/03, muddy_tracks (8K, with a ready glTF download), burned_ground_01, excavated_soil_wall, rusty_corrugated_iron, and hessian_230/380 for sandbags ([Poly Haven API](https://api.polyhaven.com/assets?type=textures); [muddy_tracks](https://api.polyhaven.com/info/muddy_tracks)).
- **ambientCG's 2,140 CC0 materials** add about 40 mud-tagged grounds, Ground050 (mud with puddles), Footsteps001 and 39 wet-stain decals ([ambientCG API](https://ambientcg.com/api/v2/full_json?type=Material,Decal&limit=2000)).
- Megascans surfaces are no longer free in bulk. Singles start at $0.99, including Moist Chunky Mud ([Fab](https://www.fab.com/listings/80b01ee6-81a3-48c8-92eb-979f9aebcdb8); [CG Channel](https://www.cgchannel.com/2024/10/epic-games-has-made-megascans-free-to-all-but-only-until-the-end-of-2024/)).
- Verdun's chalk-marl patches have no obvious Megascans surface. Tint a CC0 rock texture, or buy Dekogon's $5.99 chalk material ([Fab search](https://www.fab.com/search?q=megascans%20chalk)).
- For craters, Kins'Art sells 20 crater meshes with 4K heightmaps for $5.99, and LDN127 sells Crater Decals for $10.99 ([Fab search](https://www.fab.com/search?q=crater)).

With these, a paid texture subscription such as Textures.com's $13/month indie plan is optional ([Textures.com](https://www.textures.com/pricing/indie)).

## Mixamo covers most infantry states; WW1 gestures need capture

**Mixamo remains free and royalty-free for commercial games** ([Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)). A live query of its 2,446 motions returned 229 rifle clips, 43 prone, 117 dying, 31 injured, eight grenade and two bayonet clips ([Mixamo](https://www.mixamo.com/#/?type=Motion&query=rifle)). That covers most of a Verdun infantry state machine:

- Rifle walk, run and crouch-walk.
- Kneel and prone transitions.
- Prone crawl, fire, reload and death.
- Grenade throws, including one that pulls the pin with the teeth.
- An advancing bayonet stab and rifle-butt strikes.
- Injured locomotion and carrying a casualty.
- "Shielding face from debris" reactions for shellfire.

The gaps are exactly the WW1-specific ones. Mixamo's seven reloads are magazine-style, not bolt-action or stripper-clip ([Mixamo](https://www.mixamo.com/#/?type=Motion&query=reload)). Its ladder and ledge climbs are unarmed, and it has nothing for machine-gun crews. Adobe's terms bar redistributing raw animation files as asset packages ([Adobe Community](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775)). A game that bakes the clips into its own GLBs or VAT textures complies.

No vendor sells a WW1 animation pack; a Fab search for "ww1 animations" returns only models ([Fab](https://www.fab.com/search?q=ww1%20animations)). The options:

- **Kevin Iglesias' Human Soldier Animations** ($30, 538 files) is the best-value supplement. It adds prone crawling, military and wounded idles, grenade throws and reloads in Unreal, Unity and Blender formats, though no melee or climbing ([itch.io](https://kevdev.itch.io/human-soldier-animations)).
- **Kubold's Rifle Crouch And Prone Pro** is $15 on the Unity Asset Store. The full Rifle Animset Pro is $59.99 on Fab, in Unreal format only ([Unity](https://assetstore.unity.com/search#q=rifle%20animset%20pro); [Fab](https://www.fab.com/listings/e0eed5c5-54a6-41cc-bfa9-62b26c309bca)).
- **MoCap Online's Rifle pack** is large (390 animations, $5.99 to $149.99 tiers) but omits prone, crawl, grenade and melee, and uses a proprietary skeleton ([MoCap Online](https://mocaponline.com/products/rifle)).
- **Gamma Studio's Kar 98 pack**, the only bolt-action set found, is first-person only ([Fab](https://www.fab.com/listings/57eaacef-eff0-4438-a4f1-b362b927f50a)).

The missing gestures are cheap to capture: bolt cycling, stepping up onto the fire step, climbing over a parapet with a rifle, wire cutting and MG belt feeding.

- **Uthana's video-to-motion costs $0.05 per second**, with commercial use included and GLB/FBX export ([Uthana](https://uthana.com/pricing)). Ten minutes of a stand-in actor with a broom-handle rifle costs about $30.
- Move.ai's Move One starts at $15/month ([Move.ai](https://docs.move.ai/knowledge/move-one-pricing)).
- Cascadeur Indie ($8/month billed annually) cleans up hand-to-rifle contact ([Cascadeur](https://cascadeur.com/plans)).
- The CMU mocap database is free for commercial products but raw and short on combat moves ([jMonkeyEngine hub](https://hub.jmonkeyengine.org/t/found-perfect-resource-for-character-animation-motion-capture-data/9485)).
- Bandai Namco's 3,000-move dataset is CC BY-NC-ND and cannot ship in a commercial game ([GitHub](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset/blob/master/README.md)).

Pick one canonical skeleton early. The candidate crowd packs already share the Epic mannequin rig, so the simplest choice is to retarget Mixamo, Iglesias and captured clips onto it. Do this in UE5's IK Retargeter while the packs are open for export anyway, or in Blender, and export in-place clips as named tracks. For crowds this is mandatory: Babylon's VAT baker reads frame ranges from a single skeleton ([Babylon.js source](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/BakedVertexAnimation/vertexAnimationBaker.ts)).

For a few hero soldiers, Babylon.js 9's `AnimatorAvatar.retargetAnimationGroup()` retargets glTF clips at load time. It supports bone-name mapping (for Mixamo's `mixamorig:` prefix) and keeps feet planted with a ground-reference option ([Babylon.js forum](https://forum.babylonjs.com/t/introducing-animation-retargeting/62547)). Users report two problems. Stopping a retargeted clip snaps the character to its rest pose ([forum](https://forum.babylonjs.com/t/after-anim-retarget-stopping-current-animation-jumps-to-rest-pose/63379)). The usual Mixamo-to-Blender issues also apply: duplicate armatures and the T-pose bleeding into clips ([forum](https://forum.babylonjs.com/t/mixamo-blender-babylon-workflow-unable-to-remove-t-pose-from-animations/35680)).

## Downloadable glTF turns every license into an extraction question

A browser game hands every player its model and texture files, and glTF is an open format that Blender and every web engine open directly. A Babylon team member concedes that "as soon as it is on the web… the asset is out there" ([Babylon.js forum](https://forum.babylonjs.com/t/keeping-assets-safe-on-behalf-of-asset-providers/39205)). A Khronos glTF contributor says a determined user "will always be able to download that 3D data" ([Khronos](https://community.khronos.org/t/asset-protection-for-gltf/106080)). Licenses differ sharply in how much protection they then demand, and that, not engine compatibility, decides which stores are usable. A single-player prototype changes nothing, because the client still downloads the assets.

| Source | Usable in a Babylon/glTF web build? | What the license demands |
|---|---|---|
| Poly Haven, ambientCG (CC0) | Yes; raw files are fine | Nothing ([Poly Haven](https://polyhaven.com/license); [ambientCG](https://docs.ambientcg.com/license/)) |
| Fab Standard (Megascans, UE-only packs) | Yes | Content used "solely as incorporated in the Project in object code"; you "must restrict end users from extracting" it ([Fab EULA](https://www.fab.com/eula)) |
| Unity Asset Store | Yes | No standalone redistribution; users must not be able to extract raw files ([Unity Support](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines)) |
| Synty one-time purchase | Yes | Engine-agnostic; no sharing of source files; 5 seats per licence ([Synty](https://syntystore.com/pages/end-user-licence-agreement)) |
| Mixamo | Yes | No redistribution of raw files as packages ([Adobe Community](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775)) |
| CGTrader Royalty Free | Yes, with protection | "Commercially reasonable measures", such as a proprietary format, a password-protected resource file or encryption ([CGTrader](https://www.cgtrader.com/pages/terms-and-conditions)) |
| Legacy Sketchfab Standard | Yes, with care | Single seat; no standalone access; must post anti-reuse terms; must not use the asset to "promote… weapons" ([Sketchfab](https://sketchfab.com/licenses)) |
| TurboSquid | **No, without written approval** | Only Unity, Unreal and Lumberyard WebGL builds are pre-approved; bans "any other open format or format encrypted with decryptable open standards" ([TurboSquid](https://blog.turbosquid.com/turbosquid-3d-model-license/)) |
| Reallusion (CC store, ActorCore) | **No, without written approval** | Models must be "contained in proprietary formats"; bars "embedded content within applications or online services" and in-app purchases ([Reallusion EULA](https://www.reallusion.com/Content/EULA/EULA.htm)) |
| Editorial-tagged, CC BY-NC, legacy UE-plan Megascans | No | Non-commercial or Unreal-only ([Epic Content License](https://www.unrealengine.com/eula/content)) |

**Fab.** The Fab Standard License covers most of the recommended kit. It is engine-neutral and expressly treats making a project "available on a network" as distribution, but it gives no technical standard for "restrict" ([Fab EULA](https://www.fab.com/eula)).

- Buy the **Personal tier**. It carries the same rights as Professional for anyone with under $100,000 in digital-content revenue over the past 12 months, counting funds raised ([Epic](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab)).
- Never buy the Reference-Only tier, which provides no source files.
- Fab forbids combining Standard content with CC-BY-SA material.
- It also forbids exposing assets through level editors that can export them.

**TurboSquid and Reallusion are the two to avoid.** TurboSquid requires models to be "contained in proprietary formats so that they cannot be opened or imported in a publicly available software application or framework", and pre-approves only engine-exported WebGL. Reallusion's EULA carries the same clause. Its license policy page also contradicts itself on whether a Standard license covers more than one character in a game ([Reallusion](https://www.reallusion.com/license/content.html)). Without written clearance from the vendor, that rules out Albin's TurboSquid listing, Carrara1's 2013 WW1 soldiers, and the Character Creator Poilu route.

**Protecting what you ship.** A defensible posture combines technical friction with legal cover. CGTrader's examples are the only benchmark a license actually endorses.

1. Never host vendor source files (FBX, .blend, source textures).
2. Pack the optimized runtime meshes and KTX2 textures into a custom binary container with a non-standard header. Babylon can load glTF from an in-memory ArrayBuffer ([Babylon.js forum](https://forum.babylonjs.com/t/load-gltf-from-arraybuffer-or-blob/2163)).
3. Encrypt the pack per build and decrypt it in a worker.
4. Serve it through short-lived signed URLs.
5. Publish a game EULA that forbids extraction. Sketchfab's license requires this outright.
6. Keep an internal register mapping every shipped asset to its store, license version and tier, and credit CC-BY authors.

Draco, Meshopt and KTX2 are open standards with public decoders, so they save size but add no protection. Keep CC0 content outside the encrypted pack, since it needs no protection. Keep CC-BY content outside it too, because the CC BY 4.0 legal code bars applying "Effective Technological Measures" that restrict recipients' rights ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode)).

No court or vendor has defined "reasonable measures" for WebGL. Before commercial release, have a lawyer review the Fab "object code" clause and any TurboSquid or Reallusion use.

## At RTS distance, realism lives in materials, not polygons

The closest visual precedent is **Foxhole**, an Unreal 4 war game with an axonometric top-down camera. Its team started with seven people, one of them a modeler ([Wikipedia](https://en.wikipedia.org/wiki/Foxhole_(video_game))). Its artists aimed for the feel of "tabletop miniatures". They tuned "the shape language, the level of detail, the amount of noise, and the on screen size of objects" so things read clearly rather than "noisy and muddy", with materials that "read as metals" or "read as wood" ([Sketchfab](https://sketchfab.com/blogs/community/game-studio-spotlight-clapfoot/)).

Other precedents point the same way:

- The original Company of Heroes used **4,000-triangle infantry** ([Polycount](https://polycount.com/discussion/comment/688734)).
- StarCraft II's art lead describes RTS units built from "bigger shapes rather than small details like nuts and bolts" so they read from a three-quarter view ([Blizzplanet](https://www.blizzplanet.com/blog/comments/eurogamer_interviews_samwise_didier)).
- The game Verdun earned its authenticity because its small studios walked the battlefields and studied diaries and photographs, not because of budget ([Cliqist](https://cliqist.com/2017/06/26/little-indie-verdun-stands-multi-million-dollar-battlefield-1/)).

The implication for this game is a **"muted documentary realism"**:

- A desaturated mud-and-chalk palette, with horizon blue and feldgrau as the only saturated accents.
- Overcast light, height fog and smoke.
- A single global grade. One practitioner calls post-processing "the great equalizer" for assets from mixed sources ([Wayline](https://www.wayline.io/blog/developer-checklist-fixing-asset-pack-art-clashes)).

Faction reads from helmet silhouette and uniform hue. Faces are irrelevant.

The budgets below are engineering estimates derived from arithmetic and precedent, not measured benchmarks. No published 2025–2026 benchmark of realistic crowds on integrated GPUs exists, so validate them on target hardware.

| Item | Budget (estimate) | Note |
|---|---|---|
| Soldier LOD0 (closest 5–10%) | 10k–20k tris | 4 bone influences, normal-mapped |
| Soldier LOD1 (gameplay zoom) | 4k–6k tris | At most 4 influences, ideally 2–3 |
| Soldier LOD2 / LOD3 | 1.5k–2.5k / 300–800 tris | LOD2: weapon merged; LOD3: silhouette only |
| 400 visible soldiers | ~1.0M–1.6M tris | Averaged across LODs |
| Terrain plus props | ~1M–2M tris | Props instanced |
| Draw calls (WebGL2) | 150–400 | Soldiers about 20–50 via instancing |
| VRAM (integrated GPU) | 512 MB–1 GB | Textures about 300–500 MB |
| Download | ≤50 MB initial, ≤250 MB total | CrazyGames limits as a yardstick ([CrazyGames](https://docs.crazygames.com/requirements/technical)) |

### Crowd animation: VAT for the many, skeletons for a few heroes

Hundreds of independently animated soldiers need **baked vertex animation textures (VAT)** ([Babylon.js docs](https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations)):

- Babylon's `VertexAnimationBaker` writes the bone matrices for every frame into one RGBA float or half-float texture.
- `BakedVertexAnimationManager` lets each instance play its own clip and time offset through a per-instance `Vector4`.
- The bake can be serialized offline, so nothing is baked at runtime.
- The texture is small. By the source's width formula, a 65-bone rig with 600 frames needs about 2.4 MiB at full float (an estimate).
- VAT **cannot blend clips and does not interpolate between frames.** Author short transition clips, bake at 30–60 fps, and keep full skeletal blending for a handful of hero soldiers near the camera.

Vertex count, not soldier count, dominates the cost. Plain instances of a skinned mesh all share one pose, and GPU skinning costs "16 texture reads per vertex per instance per frame" ([Babylon.js docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/bonesSkeletons)). Forum tests in 2022 reached 10,000–20,000 low-poly VAT instances at 36–60 fps depending on browser and GPU, with the vertex shader as the bottleneck ([Babylon.js forum](https://forum.babylonjs.com/t/baked-animation-performance/32023)).

How to set up the crowd:

- **Instancing.** Use regular `InstancedMesh` with an instanced VAT buffer, which gives per-instance frustum culling. Thin instances are drawn "all or nothing" ([Babylon.js docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)).
- **Variation.** Follow NVIDIA's skinned-instancing recipe: instance heads, helmets, kit and weapons separately on one shared skeleton. NVIDIA drew 10,000 characters in 13 draw calls this way ([NVIDIA](https://developer.download.nvidia.com/SDK/10/direct3d/Source/SkinnedInstancing/doc/SkinnedInstancingWhitePaper.pdf)). Six pieces across four LODs comes to about 24 draw calls before shadows.
- **LOD switching.** Drive LOD with `useLODScreenCoverage` so zoom works automatically ([Babylon.js docs](https://doc.babylonjs.com/features/featuresDeepDive/mesh/LOD)).
- **LOD generation.** Generate skinned LODs offline with meshoptimizer or Blender Decimate. Avoid Babylon's runtime `simplify()`, whose handling of skin weights is undocumented.

### Compression makes realistic assets browser-sized

- **Textures.** Encode base colour as **KTX2 ETC1S**, and normal and ORM maps as **UASTC**, following Khronos' guidance ([Khronos](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)). Khronos' own lamp sample fell from 96 MB to 21 MB of GPU memory. By block-compression arithmetic, a shared 2048² soldier atlas set drops from about 64 MB to about 13 MB.
- **Geometry.** Use **Meshopt rather than Draco**. Meshopt also compresses animation, decodes faster when a scene holds many meshes, and Babylon loads `EXT_meshopt_compression` without setup ([meshoptimizer](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md); [svilenkovic](https://svilenkovic.com/3d/meshopt-compression)).
- **Scripting.** gltf-transform's `dedup`, `prune`, `weld`, `resize`, `etc1s`, `uastc`, `meshopt` and `instance` commands script the whole pass ([glTF Transform](https://gltf-transform.dev/cli)).

### Exporting Unreal-only packs

Most recommended packs are Unreal-only, so the pipeline starts in a free UE 5 project. Epic's glTF Exporter writes static meshes, skeletal meshes and animation sequences to GLB and bakes complex materials to metal-roughness PBR. It exports **only a single LOD and no collision**, and Nanite packs export at full resolution unless reduced first ([Epic](https://dev.epicgames.com/documentation/unreal-engine/how-the-gltf-exporter-handles-unreal-engine-content)). Custom shader effects, such as Karamai's wetness or Katanalevy's rain, do not survive the export.

Then, in Blender:

- Watch for Unreal's centimetre scale.
- Watch for the root-bone scale bug that shrinks characters in animation ([Unreal forums](https://forums.unrealengine.com/t/skeleton-root-bone-scale-incorrectly-set-to-1-in-animations-after-imported-bone-transform-is-different-error-resulting-in-smaller-bigger-meshes-in-animation/395788)).
- Flip the green channel of DirectX-style normal maps.
- Strip IK, twist and finger bones to narrow the VAT texture.
- Zero root translation to make clips in-place.

### Terrain and WebGPU

Babylon has no first-party large-terrain system, and its `TerrainMaterial` blends only three layers (`MixMaterial` blends eight). A battlefield needs:

- A custom NodeMaterial splat shader over 6–8 KTX2 layers ([Babylon.js forum](https://forum.babylonjs.com/t/pbr-texture-splatting-up-to-64-textures/1994)).
- A chunked heightfield that shell impacts stamp craters into.
- Coarse trench cuts lined with instanced Megascans revetments placed along splines.
- `MeshUVSpaceRenderer` decal maps for persistent scorch marks ([unpkg](https://app.unpkg.com/@babylonjs/core@9.18.0/files/Meshes/meshUVSpaceRenderer.pure.d.ts)).

WebGPU now reaches about 87% of global users, per caniuse ([caniuse](https://caniuse.com/webgpu)). Babylon.js 9.0 (March 2026) added clustered lighting for "hundreds or even thousands of lights", which suits muzzle flashes and flares. It also added a Frame Graph that saved 40% or more GPU memory in Babylon's tests ([Windows Developer Blog](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)). WebGPU's snapshot rendering cuts CPU time for thousands of static props, but "GPU performance remains comparable" ([Babylon.js docs](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering)). Ship WebGPU-first with an automatic WebGL2 fallback, and do not expect WebGPU to rescue an over-budget crowd.

## Commission the silhouette, kitbash the variants, generate the clutter

**Commissioning is the only route to a realistic Poilu built for this camera.** Vendor price bands:

- A basic rigged character costs **$1,000–$5,000**; photoreal studio work costs $4,000–$20,000+ ([VSQUAD](https://vsquad.art/blog/how-much-does-a-3d-character-cost-vsquad)).
- Typical turnaround is 3–6 weeks. Regional rates run from $15–$40/hour in Southeast Asia to $80–$150/hour in North America ([Rocketbrush](https://rocketbrush.com/blog/how-much-does-3d-modeling-cost-rates-and-budget-management-tips)).
- Both sources are outsourcing vendors, so their figures lean high.

Specifying to the camera strips out the costliest line items: a body-only skeleton matching the Epic mannequin, no facial rig or blendshapes, one shared texture set, and LOD0 at or under 20k triangles. On that basis the estimate is **$800–$2,500 for a first realistic RTS-scale base**, with uniform and role variants at $300–$600 each.

- Commission a modular system: a base body plus greatcoat, puttees, webbing, and Adrian and Stahlhelm helmets. Variants then take hours instead of weeks.
- Sellers who already own WW1 base meshes, such as Albin, are natural candidates for custom variants.
- Platform fees: Upwork charges clients 5% (3% for eligible US bank payments) ([goLance](https://golance.com/blogs/upwork-fees-explained-2026)); Fiverr charges 5.5% plus $3.50 on small orders ([Vaultleap](https://vaultleap.com/blog/fiverr-fees-explained-2026)).
- Payment alone does not transfer copyright. Before work starts, sign a contract that combines a work-for-hire designation, a present-tense "hereby assigns" backup assignment, further assurances, a moral-rights waiver and an originality warranty ([Legal Moves](https://legalmoveslawfirm.com/work-for-hire-agreement/)).

**Customization tools are affordable, but should feed a Blender-and-Substance path, not Reallusion.**

- Character Creator 5 costs $299 perpetual on Windows ([CG Channel](https://www.cgchannel.com/2025/08/reallusion-releases-character-creator-5/)), but its store content carries the web-hostile EULA described above.
- Substance 3D Painter is a one-time ~£168 (~$200) on Steam ([gg.deals](https://gg.deals/gb/application/substance-3d-painter-2026/)). It is the practical tool for re-dyeing AmeliaTeale's or Albin's uniforms into a consistent horizon blue and feldgrau with a shared mud-and-wear stack.
- Marvelous Designer costs $39/month or $280/year, with an application-only indie tier since January 2026 ([Digital Production](https://digitalproduction.com/2026/01/12/marvelous-designer-adds-indie-pricing-quietly/)). It is worth it only for one or two greatcoat simulations baked into low-poly meshes.
- MetaHumans are licensed for any engine and free under $1M revenue ([MetaHuman](https://www.metahuman.com/news/metahuman-leaves-early-access-with-a-feature-packed-new-release)), but their facial rigs and mesh density are wasted at RTS distance.

**AI generation is ready for clutter, not soldiers.** The live tools:

| Tool | Price | Notes |
|---|---|---|
| Meshy Pro | ~$20/month | Exclusive ownership of private assets; the free tier is CC BY 4.0 ([Meshy](https://www.meshy.ai/pricing)) |
| Tripo Pro | $19.90/month | Auto-rigs with Mixamo bone naming; rated stronger on hard-surface items ([Ludo.ai](https://ludo.ai/compare/meshy-alternatives); [Ziva](https://ziva.sh/blogs/best-ai-3d-asset-generators)) |
| Rodin Creator | $30/month | Most detailed characters, but no rigs ([Hyper3D](https://hyper3d.ai/pricing)) |
| Hunyuan3D | Hosted: 20 free generations/day | The open-weights 2.x license excludes the EU, UK and South Korea ([Hugging Face](https://huggingface.co/tencent/Hunyuan3D-2/blob/main/LICENSE)) |
| TRELLIS.2 (Microsoft) | Free, self-hosted | MIT license ([Cinevva](https://app.cinevva.com/guides/ai-3d-model-generators)) |

CSM's Cube shut down in January 2026 after Google acquired the company ([Gunderson Dettmer](https://www.gunder.com/en/news-insights/client-news/gunderson-dettmer-represents-common-sense-machines-in-acquisition-by-google)).

AI topology "lacks the edge loops animation requires", so AI characters need manual retopology. Static props are "genuinely production-usable" ([Cinevva](https://app.cinevva.com/guides/ai-3d-model-generators)). The right targets are ammo crates, broken carts, field telephones, shell casings and rubble.

Three rules apply to AI output:

- Raw AI output is not copyrightable in the US.
- Steam has required disclosure of shipped AI content since January 2026 ([Promise Legal](https://blog.promise.legal/ai-game-assets-copyright-steam-disclosure-2026/)).
- Never use purchased packs as AI inputs. Synty's license, for example, forbids uploading its source files to 3D-generation services ([Synty](https://syntystore.com/pages/end-user-licence-agreement)).

| Route | Cash (estimate) | Time | Verdict |
|---|---|---|---|
| Buy and kitbash (this report's kit) | ~$270–$890 | Weeks | Start here |
| Commission a matched French/German base plus variants | ~$3k–$7k | 3–6 weeks per base | After the prototype proves fun |
| Fully commissioned set (2 factions, ~8 variants, ~10 weapons, ~40 props, ~30 trench modules, 2–3 guns) | ~$25k–$60k | 3–6 months | Unnecessary, given free Megascans and cheap guns |
| AI-generated props | ~$20–$60/month | Days; cleanup dominates | Clutter only |

## A $270 core kit puts a credible Verdun on screen

Start with the low-poly but realistically proportioned crowd. Prove the VAT pipeline with 400 soldiers on a real battlefield. Then use Albin's Poilu as a yardstick to decide whether a commission is needed. In order:

1. Install UE 5, Blender and gltf-transform.
2. Export AmeliaTeale's French and German soldiers and the FieriaGold guns from Unreal.
3. Retarget the Mixamo and Iglesias clips onto the shared skeleton and bake VAT.
4. Assemble one trench sector from Megascans pieces over a CC0 splat terrain.
5. Render it in Babylon at gameplay zoom.
6. Decimate Albin's model to 15k and 5k triangles on a rebaked 2K atlas, and place it beside the AmeliaTeale Poilu.
7. If the difference is invisible at gameplay zoom, re-texture the crowd packs and stop. If it is obvious, commission.

| Tier | Item | Role | Price |
|---|---|---|---|
| Core | [AmeliaTeale WW1 low poly British/French pack](https://www.fab.com/listings/07831ff9-9019-4c58-8026-65c7e74530d0) | French crowd, heads, kit, gas masks | $14.99 |
| Core | [AmeliaTeale Low poly WW1 German pack](https://www.fab.com/listings/dd5cc155-efdf-4bc3-8ab5-6d57c7f4c062) | German crowd plus 20 animations | $14.99 |
| Core | [Albin SOLDIER WWI French Rigged (CGTrader)](https://www.cgtrader.com/3d-models/military/military-character/soldier-wwi-french-rigged) | Realism benchmark and hero Poilu | $60.00 |
| Core | [Davicolt Stahlhelm M16](https://www.fab.com/listings/52834819-8a4e-4bfd-a8de-6b66cffe2c23) | 1916 German helmet swap | $9.99 |
| Core | Manuel Rivas [Lebel](https://www.fab.com/listings/ffc71f49-5603-40ca-b6dc-b1a8bcdf414c), [Gewehr 98](https://www.fab.com/listings/19c0dcc1-8677-43a9-8f94-eac930bbd934), [Hotchkiss M1914](https://www.fab.com/listings/47ebb6b5-eb2d-40db-82a4-445d8d6e2360) | Rifles and French heavy MG | $32.97 |
| Core | [Ovidiu Barat WW1-era grenades](https://www.fab.com/listings/4c0067d0-0ac8-4881-b131-2f692e160cc1) ×2 | Grenades (GLB) | $7.98 |
| Core | [FieriaGold Cannons WW1](https://www.fab.com/listings/8f7195fb-1b68-4fc3-830b-dc8a86f8495a) | French 75, 77 mm FK 96, 155 mm | $39.99 |
| Core | Formix [FK 96](https://www.fab.com/listings/4ef2ecbd-02bf-4a24-aaa2-de3b98b896c9), [15 cm K16](https://www.fab.com/listings/adc67a2d-f5ad-41d7-b9c4-48d9a77147ae), [Mörser 10](https://www.fab.com/listings/4b473bbb-425f-4881-8d5f-72a95a458ba5) | German field and heavy guns | $14.97 |
| Core | [Kins'Art 20 Craters + Heightmaps](https://www.fab.com/search?q=crater) | Crater stamps for terrain | $5.99 |
| Core | [Megascans mud surfaces](https://www.fab.com/search?q=megascans%20mud) ×5 | Ground layers | ~$4.95 |
| Core | [Kevin Iglesias Human Soldier Animations](https://kevdev.itch.io/human-soldier-animations) | Prone, wounded, grenade, reload | $30.00 |
| Core | [Uthana](https://uthana.com/pricing) video-to-motion (~10 min) | Bolt cycle, over the top, wire cutting | ~$30 |
| Core | Megascans Military Trenches and sample level, Poly Haven, ambientCG, Mixamo, CC-BY Sketchfab Chauchat and 58 mm mortar, UE 5, Blender, gltf-transform | Environment, textures, base animation, tools | $0 |
| | **Core total** | | **≈ $267** |
| Upgrade | [FieriaGold Soldiers WW1](https://www.fab.com/listings/2b135e0e-d17a-4cb4-9834-de0c74b190c6) | More realistically textured German crowd | $39.99 |
| Upgrade | [DarkTide French WW1 MetaHuman Kit](https://www.fab.com/listings/09e6076f-6ba3-49fe-93d9-deac7876d258) | 1916 Poilu with LODs (experiment) | $25.99 |
| Upgrade | [TalkingDrums German Soldier WWII](https://www.fab.com/listings/64615c63-6a32-4e99-b46e-69b132f76a9f) | Realistic German kitbash base | $74.99 |
| Upgrade | [FieriaGold Weapon WW1 (pack 2)](https://www.fab.com/listings/aa39b43e-daa1-4096-a00d-b9245fa03922) | Chauchat, MG 08/15 | $51.99 |
| Upgrade | Karamai [Sandbag Walls](https://www.fab.com/listings/d11a4ff5-41f9-4d7e-9e62-8df679791de2) and [Barbed Wire Pack](https://www.fab.com/listings/196d56d3-9b8a-453f-9243-c568a95b07ab) | Hero sandbags and wire with LODs | $44.98 |
| Upgrade | [Red Blue Pixel World War 1, Warzone](https://www.fab.com/listings/4a92e959-e5d6-438c-b9a8-e739b5efd927) | Ruined village, craters, wider coverage | $69.99 |
| Upgrade | [Kubold Rifle Crouch And Prone Pro](https://assetstore.unity.com/search#q=rifle%20animset%20pro) | Extra prone set | $15.00 |
| Upgrade | [Cascadeur Indie](https://cascadeur.com/plans), 1 year | Animation cleanup | $96 |
| Upgrade | [Substance 3D Painter (Steam)](https://gg.deals/gb/application/substance-3d-painter-2026/) | Uniform re-texturing | ~$200 |
| | **Upgrade total** | | **≈ $619** |

Prices are Fab Personal-tier and store prices as of 3 October 2026.

**Budget:**

| Item | Cost |
|---|---|
| Fully equipped prototype (core plus upgrades) | ≈ $886 |
| Commissioned French/German base soldiers with a few variants, if the comparison shows they matter (estimate) | $3k–$7k |
| Meshy or Tripo for clutter (optional) | $20–$60/month |

**Do not buy:**

- Anything from TurboSquid, including Albin's TurboSquid copy and Carrara1's soldiers.
- Reallusion store content or ActorCore motions for the web build.
- Katanalevy's 80k–300k-vertex Nanite packs.
- LiquidPixel's 20-soldier British pack, which its seller labels "Not game-ready" ([Fab](https://www.fab.com/listings/4d8bf56a-1a97-41fe-bb13-2aaa279fbc07)).
- MoonyState's high-poly uniforms.
- Ultima Store's AI-generated trench props.
- Bandai Namco's mocap data.
- The CC BY-NC Douaumont scans.
- Sketchfab uploads that are ripped game assets, such as the War Thunder MG08 ([Sketchfab search](https://sketchfab.com/search?q=mg08&type=models)).

## Conclusion

The question "realistic or Synty low-poly?" has a false premise at this camera distance. Once hundreds of soldiers must fit a browser, realistic meshes get decimated to the same ~4k triangles that the AmeliaTeale and FieriaGold packs already have. The real choice is texture fidelity, shading, animation and art direction. What the developer actually rejects in Synty is its flat-shaded look, not its polycount, and realistically proportioned low-poly packs deliver Synty-level speed without that look. Money that would buy "realistic" meshes is better spent on a re-textured shared atlas, captured WW1 gestures, smoke, lighting and one global grade.

The scarce asset is a 1916 French soldier, and the scarce discipline is license hygiene. The first commission dollar belongs to a Poilu, not to trenches or guns, which are already cheap or free. Asset packing and encryption belong in the pipeline from day one, because retrofitting compliance onto hundreds of exposed `.glb` URLs is far harder than building it in. Three uncertainties remain:

- No side-by-side visual comparison of the candidate packs was done.
- No benchmark exists for VAT crowds of realistic soldiers on integrated GPUs.
- No one has defined what "restrict extraction" means for glTF in a browser.

The prototype answers the first two within weeks. The third needs a lawyer before commercial launch.
