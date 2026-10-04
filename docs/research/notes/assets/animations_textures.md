# Realistic soldier animation sources and terrain/material texture sources for a browser-based WW1 (Verdun 1916) game (Babylon.js, glTF, angled top-down camera, hundreds of soldiers)

Research date: 2026-10-03. Prices are USD and exclude tax. "Verified" means the figure was read directly from the live listing/API in this session (Oct 2026). Anything taken only from a third-party aggregator, an old article, or memory is marked **(unverified)** or **(dated)**.

---

## A1. Mixamo: which military/rifle animations exist, current status, and license (2026)

### Takeaway
Mixamo is still online, still free, and still allows royalty-free use in commercial video games. It holds about 2,446 motions and a surprisingly complete WW1-usable rifle set: prone crawl/fire/reload/death, kneel, crouch-walk, grenade throws (including prone and pulling the pin with the teeth), a bayonet stab, rifle-butt strikes, injured locomotion, and carrying a casualty. It has no bolt-action reload, no "over the top" trench exit and no MG-mounting clips. The product is effectively frozen (no updates). The license forbids redistributing raw animation files, so a web build has to bundle clips inside the game rather than expose them as standalone downloads.

### Cited Findings
- Adobe's official FAQ: "Mixamo is available free and does not require any additional purchases or subscriptions." It also says: "You can use both characters and animations royalty free for personal, commercial, and non-profit projects including: … Create video games." Auto-rigger and library are "for bipedal humanoids only." The FAQ page shows "Last updated on Sep 14, 2021". [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) (read via browser, Oct 2026)
- Adobe community licensing FAQ: you may not "create blueprints, templates, or asset packages for video game engines which redistribute character or animation raw files as the product". Use in games is allowed when the content is integrated, not redistributed standalone. [Adobe Community – Mixamo FAQ: licensing, royalties, ownership, EULA and TOS](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775)
- Status: StatusGator reported Mixamo "up and operational" as of May 13, 2026. Not officially discontinued. [StatusGator – Mixamo](https://statusgator.com/services/adobe-creative-cloud/mixamo). A 2026 alternatives guide says Mixamo "has barely changed in years", requires an Adobe ID, and has occasional outages. [Cinevva – Free Character Animations and Auto-Rigging: Mixamo and Its Alternatives (2026)](https://app.cinevva.com/guides/free-character-animations-rigging); [MoCap Online – Best Mixamo Alternatives 2026](https://mocaponline.com/blogs/mocap-news/mixamo-alternatives) (vendor blog, so not neutral)
- **Library size and contents (queried live from Mixamo's site search API, `mixamo.com/api/v1/products`, Oct 3 2026):** 2,446 total motions. Query hit counts: "rifle" 229, "prone" 43, "dying" 117, "grenade" 8, "climb" 26, "injured" 31, "bayonet" 2, "reload" 7. "sandbag", "machine gun" and "surrender" each returned 0. [Mixamo motion search (rifle)](https://www.mixamo.com/#/?type=Motion&query=rifle)
  - **Rifle locomotion and stances:** Rifle Run (aimed / rifle down), Rifle Walk, Rifle Crouch Walk (forward and backward), Rifle Stand To Kneel, Rifle Kneel Idle, Rifle Kneel To Aim, Rifle Kneel To Stand, Rifle Start Run, Rifle Walk To Stop, Rifle Idle variants (including "Looking Around"), Grab Rifle From Back, Rifle Put Away. Packs: "Pro Rifle Pack" / "Rifle 8-Way Locomotion Pack" (walk/run/sprint 8-way, crouch-walk 8-way, turns, jumps, 6 deaths), "Lite Rifle Pack", "Basic Shooter Pack", "Slim Shooter Pack". [Mixamo](https://www.mixamo.com/#/?type=Motion&query=rifle)
  - **Firing:** Firing Rifle (standing, walking, running, crouch-walking), Shoot Rifle (running), Prone Firing Rifle (full-body and upper-body). [Mixamo](https://www.mixamo.com/#/?type=Motion&query=rifle)
  - **Reload (7 hits):** Reload (Run While Reloading Rifle), Reload (Rifle in Crouch), Reload (Walk While Reloading Rifle), Prone Reloading, Reloading (Rifle While Standing). These are generic magazine-style reloads; none is a bolt-action/stripper-clip reload. [Mixamo](https://www.mixamo.com/#/?type=Motion&query=reload)
  - **Prone/crawl:** Crouch To Prone, Rifle Kneel To Prone, Rifle Prone To Kneel, Prone Idle (with rifle), Prone Forward, Prone Forward Stop, Prone Backwards Start/Stop, Crawl Backwards In Prone, Prone Left/Right Turn (including "Game Blend" versions), Prone Roll, Rifle Prone Hit Reaction, Prone Death, Prone To Crouch, Getting Up (from prone), Moving Backward In Crawl Position With Rifle, Low Crawl ("Super Low Crawl"), Crawling (hands and knees), Crawling Backwards (frantic, on stomach). [Mixamo](https://www.mixamo.com/#/?type=Motion&query=prone)
  - **Grenades:** Toss Grenade (holding rifle), Throw Grenade (prone), Throw Grenade (crouched), Grenade Throw (kneeling, "Pulling Pin With Teeth"), Grenade Throw (walking), Run And Throw Grenade. [Mixamo](https://www.mixamo.com/#/?type=Motion&query=grenade)
  - **Melee/bayonet:** Bayonet Stab ("Advancing And Stabbing With Rifle Bayonet Or Spear"), Slash Advance ("Slashing Forward With A Bayonet"), Rifle Punch (butt strike), Upward Rifle Butt Strike (while sitting), Rifle Block / Block With Rifle. [Mixamo](https://www.mixamo.com/#/?type=Motion&query=bayonet)
  - **Deaths and hits:** Rifle Death, Rifle Run To Dying, Walking To Dying (aiming rifle), Crouch Death, Prone Death, Death From Front/Back/Right/Front Headshot, Dying (Explosion From Behind), Flying Back Death, Dying Backwards, many "Dying… Falling On One/Two Knees" variants, Dying (Laying On The Ground). Hit reactions include rifle-crouched, rifle-running, rifle-walking-aiming and rifle-prone versions. [Mixamo](https://www.mixamo.com/#/?type=Motion&query=dying)
  - **Shell-fire flavour:** Rifle Shielding Face (From Debris), Rifle Rubbing Eyes (Debris), Gunplay (Duck And Look Around Apprehensively), Right/Left Cover Sneak With Rifle. [Mixamo](https://www.mixamo.com/#/?type=Motion&query=rifle)
  - **Wounded/casualty:** Injured Walk/Run/Idle/Turn sets (31 hits), Injured Hurting Idle (holding leg), Injured Wave For Help Idle, Writhing In Pain (lying on back), Agony (holding head). Carrying: "Carrying Someone" (idle/walk/run/turn/stop) and the matching "Being Carried (Injured And Being Carried To A Safer Place)". [Mixamo](https://www.mixamo.com/#/?type=Motion&query=injured); [Mixamo](https://www.mixamo.com/#/?type=Motion&query=carrying)
  - **Climbing (proxies for going over the top):** Climbing (Pulling Up To A Ledge), Climbing (Starting To Climb Onto A Box Or Short Fence), Climbing (Climbing Up A Slope), Climbing Ladder / Climbing To Top (ladder to standing), Sprint To Wall Climb, Braced Hang To Crouch, Jumping Over Into Combat ("Jumping Over Obstacle Getting Ready To Fight"), Climbing Down (Climb Through Fence And Jump Down). Also "Charge (Pointing Onward Charge)", usable as an officer's whistle/charge gesture. [Mixamo](https://www.mixamo.com/#/?type=Motion&query=climb)

### Inferences
- Mixamo alone can cover most of a Verdun infantry state machine: idle, walk, run, crouch, prone, crawl, fire, reload, grenade, bayonet, hit, death, wounded, casualty carry. You would only need to fill gaps (bolt-action cycling, ladder or fire-step exit while holding a rifle, MG crew, shell-shock/cowering). Ladder and ledge climbs exist but are unarmed, so going over the top would need a rifle-holding edit (for example in Cascadeur or Blender) or a custom capture.
- All Mixamo clips share one skeleton ("mixamorig:" bones). That makes Mixamo the natural canonical skeleton for a Babylon project: a single rig with every clip already retargeted, and other sources retargeted onto it.
- For a web game, the raw-file redistribution ban means you must not serve Mixamo FBX/GLB clips as browsable standalone files. Shipping them baked into your own character GLB, or into vertex-animation textures, fits the "integrated into the project" model. This is an inference from the license text, not legal advice.
- The bayonet-stab clip is an "advancing" stab, usable for a bayonet charge when looped or blended with Rifle Run.

### Gaps
- Mixamo export options (FBX vs DAE, frame rate, keyframe reduction, "In Place" toggle) were not re-verified this session. From prior knowledge **(unverified)**: FBX binary/ASCII and Collada export, with/without skin, 24/30/60 fps, and an "In Place" checkbox on locomotion.
- Mixamo search figures come from Mixamo's public site-search endpoint, not from a documented API, and may count duplicates or variants.
- I found no official Adobe statement about Mixamo's long-term roadmap in 2026.

---

## A2. Paid mocap packs (Fab, Unity Asset Store, MoCap Online, ActorCore, Rokoko, Truebones, Kevin Iglesias, Kubold): content, price, format, skeleton, license, and WW1-specific coverage

### Takeaway
No vendor sells a dedicated WW1 infantry animation pack (bolt-action reload, over the top, MG mounting). A Fab search for "ww1 animations" returns only models. The best-value third-person rifle sets are:
- Kevin Iglesias, Human Soldier Animations: $30, 538 files, includes prone crawl, wounded idle, grenade, reload.
- Kubold's Unity versions: Rifle Animset Pro $50, plus Rifle Crouch And Prone Pro $15.
- MoCap Online Rifle: $5.99 / $44.99 / $149.99 tiers, 390 animations. Big, but no prone/crawl/melee.

The only bolt-action set found is first-person-only (Kar 98 pack). Fab Standard License, Unity Asset Store and MoCap Online licenses all permit use outside Unreal/Unity, but all require that end users can't extract the raw assets.

### Cited Findings
**Kubold (Fab / Unity Asset Store)**
- **Rifle Animset Pro on Fab:** "over 120 motion captured animations of a human character walking, running, crouching and proning with a rifle. It also includes … shooting, getting hit, dying, throwing grenades, melee attacks, opening doors and jumping." Price $59.99. Included format: **Unreal Engine** asset package only (UE 4.8–5.8). Standard License. "Allows usage with AI: No". Published Oct 16 2014. Rating 3.7 (58). Other Kubold items on Fab: Movement Animset Pro from $64.99, Fighting Animset Pro from $79.99, Sword Animset Pro from $64.99. [Fab – Rifle Animset Pro](https://www.fab.com/listings/e0eed5c5-54a6-41cc-bfa9-62b26c309bca) (verified Oct 2026)
- **Unity Asset Store (Kubold):** Rifle Animset Pro $50.00 (4.5★, 144 ratings), Cover Rifle Animset Pro $50.00, **Rifle Crouch And Prone Pro $15.00**, Pistol Animset Pro $50.00, Movement Animset Pro $65.00, Fighting Animset Pro $80.00. [Unity Asset Store search "rifle animset pro"](https://assetstore.unity.com/search#q=rifle%20animset%20pro) (verified Oct 2026)
- An older/third-party Gumroad listing describes Rifle Animset Pro as "$25 … 88 motion capture animations" with walking, running, shooting, hit/die, grenade, aiming additives, melee, sprint, jump. [Gumroad (poha181) – Rifle Animset Pro](https://poha181.gumroad.com/l/Rifle-Animset-Pro). This seller is not Kubold and may be unauthorized; treat it as a content description only. **(unverified seller)**

**Kevin Iglesias**
- **Human Soldier Animations (full):** 538 animation files, each in masculine and feminine versions. Combat: aiming, shooting, precise aiming, **reload**, **grenade throws**, 6 hit reactions, 6 deaths. Idles: default, **military**, **wounded**. Movement: crouch walk/strafe, **crawling prone (forward/backward)**, run, sprint, strafe, turns, walk. Plus sheathe/unsheathe. Price "$30 USD or more" on itch.io. Downloads: "Godot/Unreal" (59 MB) and "Unity" (90 MB) packages, plus Blender animation files. Retargeting tutorials provided. **No melee/bayonet or climbing listed.** [itch.io – Human Soldier Animations](https://kevdev.itch.io/human-soldier-animations)
- Free version: 128 animation files. [itch.io – Human Soldier Animations FREE](https://kevdev.itch.io/human-soldier-animations-free); [Gumroad – Human Soldier Animations FREE](https://keviniglesias.gumroad.com/l/human-soldier-animations-free)
- Unity Asset Store prices: Human Soldier Animations $30.00 (4.8★, 11), Human Soldier Animations FREE (free), Human Mega Animations Pack $65.00 (sale, normally $130.00). [Unity Asset Store search](https://assetstore.unity.com/search#q=soldier%20animations%20prone%20crawl&category=3d%5Canimations) (verified Oct 2026)
- Same search also shows: Free Crawl Animation (Voxel Vision, free), Animation Pack – Crawling Forward (Picola Inc., $4.99), Crawl_MocapAnimPack 1.2 (RIB Studio, $39.99). [Unity Asset Store](https://assetstore.unity.com/search#q=soldier%20animations%20prone%20crawl&category=3d%5Canimations)

**MoCap Online**
- **Rifle pack (mocaponline.com):** 390 animations / 892 files (including 48 aim offsets and 36 split jumps). Tiers: Starter $5.99, Basic $44.99, Pro $149.99. Formats: FBX, Blender, iClone, Unity, BIP, Unreal (UE4/UE5). Skeleton **MotusMan_v55** (proprietary). Covers stand/crouch/crouch-walk/walk/jog/run, gun-up and gun-down, single/burst/continuous fire, standing and crouching reloads, rifle↔pistol swaps, jumps, deaths in 4 directions. **Prone, crawl, grenade, melee/bayonet and climbing are not listed.** Standard license covers personal/indie/commercial use "up to 1M end users/$1M revenue", with upgrades above that. [MoCap Online – Rifle](https://mocaponline.com/products/rifle) (license threshold taken from a fetched-page summary; confirm on purchase)
- Fab listings by MoCap Online: "Rifle Starter Animation – MoCap Pack" from $4.99 (3.7★, 13); "Rifle Shooter Pro – MoCap Animation Pack" from $149.99 (4.4★, 28). [Fab search](https://www.fab.com/search?q=soldier%20rifle%20animations%20mocap) (verified Oct 2026); [Fab – Rifle Shooter Pro](https://www.fab.com/listings/6cbfcfb5-e96b-4a69-b8f2-124844c17b8f)
- Other MoCap Online packs relevant to soldiers: Mobility ("200+ walking, running, turning, strafing, and transition animations"), Death ("Death animations and hit reactions"), Hip Fire, Pistol, Punch. All are listed as FBX/BIP/Unreal/Unity/Blender/iClone with a "royalty-free perpetual commercial license (standard)". [MoCap Online catalog (llms page)](https://mocaponline.com/pages/llms)
- An "Injured" pack ("twelve … injured animations … from running to crawling") and a "Scared" pack (60 animations: creeping, hiding, kneeling, begging) were mentioned in search snippets, but I did not reach their listings. **(unverified price/content)**. [search snippet source: Fab listing](https://www.fab.com/listings/0f09658b-cd7c-489d-a5e1-b7104c544219)

**Other Fab animation listings**
- **Kar 98 Animation Pack (Gamma Studio):** 25 bolt-action rifle animations (hip and ADS fire, reload, melee, inspect, idle/walk/run/jump), with SFX and Niagara muzzle flash. "Designed exclusively for First-Person Shooter games in Unreal Engine." UE 5.2–5.8, Unreal format only. $19.99–$39.99. Standard License. "Allows usage with AI: Yes". [Fab – Kar 98 Animation Pack](https://www.fab.com/listings/57eaacef-eff0-4438-a4f1-b362b927f50a) (verified Oct 2026)
- Fab search results also list "Rifle Mega MocapAnimPack 1,3" (300+ FBX rifle animations: locomotion, dodge, stun, hit, death), "Assault Rifle Animations", "Military Animation Pack I (Unarmed)", and "Tactical FPS Animation Shooter Pack" (UltimateGameStudio, from $55.99). Prices/contents were not opened. **(partly unverified)** [Fab – Rifle Mega MocapAnimPack](https://www.fab.com/listings/9fe50cd0-1f9a-4795-814b-abd28618182d); [Fab – Military Animation Pack I (Unarmed)](https://www.fab.com/listings/ea5dfaf0-0b6a-4b1f-9e32-2ba31d108adc); [Fab search](https://www.fab.com/search?q=military%20mocap%20prone%20crawl&categories=animations)
- A Fab search for "ww1 animations" returned only models, no animation packs. Examples: "Great War Trenches" (Katanalevy, from $24.99), "Soldiers WW1" (Studio FieriaGold, from $39.99), "WW1 British Soldier" (MoonyState, from $19.99), "Low poly WW1 German pack" / "WW1 low poly British/French pack" (AmeliaTeale, from $14.99), "Rifles WW1" (from $25.99). [Fab search "ww1 animations"](https://www.fab.com/search?q=ww1%20animations) (verified Oct 2026)
- Synty "POLYGON War Map – WWI": characters are rigged (Mecanim) but **no animations included**. [Synty Store](https://syntystore.com/products/polygon-war-map-wwi)
- Traversal fallback: "Ultimate Traversal Anims" (RamsterZ), 385 hand-keyed parkour/climb/ladder animations for UE/Unity, sold as FBX-only. [RamsterZ Animations](https://www.ramsterzanimations.com/store-buy/p/ultimate-traversal-anims-fbx-only)

**Fab license**
- Summary of the Fab Standard License: use commercially; modify; distribute in Projects; "Use the assets with any compatible tools (usage is not limited to Unreal Engine)". You may not resell or redistribute standalone. Personal and Professional tiers grant the same rights; "There is no need for upgrading from Personal to Professional tier if you cross the revenue threshold after the purchase." [Fab EULA](https://www.fab.com/eula)
- Binding EULA text: "you may … only authorize end users to make use of Content solely as incorporated in the Project in object code and you must restrict end users from extracting or otherwise using Content outside of the Project." Plugins are per-seat. [Fab EULA](https://www.fab.com/eula)
- Tier threshold: Personal tier is for buyers with ≤$100,000 USD gross revenue in the last 12 months; Professional is above that. [Epic – Licenses and pricing in Fab](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab)

**ActorCore (Reallusion)**
- The current ActorCore license table shows **Standard** covering "Export to 3rd party software", "Games, XR, & interactive applications". "Embed into any application or service" and "AI training" require **Enterprise**. [ActorCore – License](https://actorcore.reallusion.com/license) (verified Oct 2026). This contradicts a 2022 report that game use required applying for a "mass distribution licence" [CG Channel 2022](https://www.cgchannel.com/?p=121885), so the policy appears to have changed.
- The ActorCore site banner in Oct 2026: "JUST LAUNCHED — Get $170+ Worth of Premium Motions for Just $29/Month" (new motion subscription). Categories include "Weapon Combat", "Hand Combat", "Hollywood Stunts". Searches for "military" and "rifle" returned no results in the web UI (possibly a client-side rendering issue). [ActorCore 3D motion search](https://actorcore.reallusion.com/3d-motion/search?keyword=military)
- Older pricing: individual motions $1.50–$12 depending on length; packs $0–$200. FBX at 24/30/60 fps with Unity/Unreal/Blender/Maya presets. **(dated, 2020–2022)** [CG Channel](https://www.cgchannel.com/?p=121885); [ProVideo Coalition](https://www.provideocoalition.com/actorcore-a-new-3d-mocap-motion-library-online/)
- Reallusion's "Rifle Combat: Prone" iClone pack: crouch idle, kneel, sign alert, walk, run, side strafe, shooting, run to kneel and prone, rifle-barrel clearing, grenade throwing, all from optical stunt-actor capture. There is also a "Rifle Combat: Guard" pack. The price and whether ActorCore offers FBX export of these were not shown. [Reallusion – Rifle Combat: Prone](https://reallusion.com/contentstore/iclone/pack/iclone7-motion-rifle-combat-prone/default.html); [Reallusion – Rifle Combat: Guard](https://www.reallusion.com/ContentStore/iClone/pack/iClone7-Motion-Rifle-Combat-Guard/default.html)

**Rokoko Motion Library**
- 150 free mocap assets licensed for commercial use. Most of the library is paid at $3 or $6 per asset. Sources include Audiomotion and Centroid, plus 50 moves by stunt performer Eric Jacobus. **(dated, 2020)** [CG Channel](https://www.cgchannel.com/?p=113569); [Rokoko pricing](https://www.rokoko.com/pricing)

**Truebones**
- 30,000+ mocap clips in BVH/FBX. Royalty free "for any and all purposes including commercial … games". Redistribution or resale of the raw FBX/BVH is prohibited. No dedicated military pack found. [Truebones Gumroad – Ultimate Mega-Bundle](https://truebones.gumroad.com/l/ztysf)

**Unity Asset Store license (other engines)**
- Unity's support article says Asset Store assets can generally be used with other engines. Some Unity-made assets are Unity-only, and end users must not be able to extract the raw files. [Unity Support – Can I use assets from the Asset Store with other engines](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines); [GameFromScratch](https://gamefromscratch.com/using-asset-store-assets-in-other-engines-is-it-legal/)

### Inferences
- **WW1-specific motions are not available off the shelf from any vendor checked.** These include bolt-action cycling (third person), stripper-clip reload, fire-step stand/aim, going over the top via a trench ladder or parapet, wire cutting, MG crew (Maxim/Hotchkiss/St-Étienne loading and traversing), stretcher carry, gas-mask donning and shell-shock. A short custom mocap session or AI video-to-motion pass will be needed for these.
- For a Babylon/glTF pipeline, prefer packs that ship FBX (Kevin Iglesias, MoCap Online, Unity-store packs, which usually contain FBX inside the package) over Fab "Unreal Engine"-format-only listings such as Kubold on Fab or Kar 98. Those only arrive as .uasset and would need exporting from the UE editor. That is allowed under "any compatible tools", but it adds steps.
- The Kar 98 pack is first-person (arms and camera), so it is a poor fit for an angled top-down view.
- Kubold's $15 "Rifle Crouch And Prone Pro" (Unity) plus Mixamo prone clips should cover prone needs cheaply.
- Under every paid license reviewed (Fab, Unity, MoCap Online, Truebones), web delivery should package animations inside combined/binary game assets (for example a single GLB per unit type, or VAT textures) rather than exposing individual clip files. That is how to meet the "restrict end users from extracting" clauses.

### Gaps
- I could not verify the content list (prone? bayonet?) for Rifle Mega MocapAnimPack, Military Animation Pack I, Tactical FPS Animation Shooter Pack, or MoCap Online's Injured/Scared packs.
- ActorCore's catalog search returned nothing via the web UI, so concrete ActorCore military pack names, prices and counts for 2026 are unverified.
- I found no Reddit or forum reviews comparing these packs specifically for WW1 projects.
- The "Moverse" search found only a markerless capture system (studio/academic licenses), not a motion library. [Knoxlabs – Moverse Capture](https://www.knoxlabs.com/products/moverse-capture-markerless-motion-capture-platform)

---

## A3. Free/cheap mocap datasets and AI motion-generation tools: suitability and licenses

### Takeaway
CMU mocap is free for use in commercial products (no resale of the raw data) but is raw BVH that needs cleanup. Bandai Namco's 3,000+ moves are **CC BY-NC-ND 4.0, so not usable in a commercial game**. For filling WW1-specific gaps cheaply, the realistic tools are:
- Uthana: pay-as-you-go, commercial use included, GLB/FBX export.
- Move.ai Move One: video-to-motion from $15/month.
- DeepMotion: commercial from its $15/month Starter.
- Cascadeur Indie: about $8–19/month for keyframe cleanup and AutoPosing.

### Cited Findings
- **CMU Graphics Lab Motion Capture Database:** "You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form." Free for research and commercial projects; an acknowledgment text is requested in publications. 2,548 trials from 140+ subjects, Vicon at 120 Hz; BVH conversions available via cgspeed. [jMonkeyEngine hub quoting CMU terms](https://hub.jmonkeyengine.org/t/found-perfect-resource-for-character-animation-motion-capture-data/9485); [MoCap Online blog – Free Motion Capture Animations](https://mocaponline.com/blogs/mocap-news/free-motion-capture-animations). The primary source is mocap.cs.cmu.edu/faqs.php, but its TLS certificate failed to verify, so I could not fetch it.
- **Bandai Namco Research Motion Dataset:** over 3,000 moves from Bandai Namco's own mocap studio. Datasets 1 and 2 are both **CC BY-NC-ND 4.0** (only the Blender visualization code is MIT). Intended for AI R&D; **commercial use prohibited**. [GitHub README](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset/blob/master/README.md); [CG Channel](https://www.cgchannel.com/2022/05/download-3000-free-mocap-moves-from-bandai-namco-research/); [Automaton](https://automaton-media.com/en/news/20220430-12213/)
- **Uthana (text/video-to-motion):** pay-as-you-go credits. Text-to-motion 1.0 $0.02/s, 2.0 $0.03/s, 3.0 $0.10/s; video-to-motion 2.0/2.1 $0.05/s; locomotion $0.02/s; stitching/looping $0.01/s; auto-rig $0.15; unlimited re-downloads. "Paid usage includes commercial use of generated outputs." [Uthana pricing](https://uthana.com/pricing) (verified). Exports GLB, FBX (BVH on request). [Uthana FAQ](https://uthana.com/faq)
- **Move.ai (Move One, single-camera video mocap):** Starter $15/month ($144/year), 180 credits/month; Basic $35/month ($336/year), 480 credits; Teams $75/user/month (3–10 users), 4,000 shared credits. Pro capture: Standard $46/seat/month with commercial use; Plus $225/seat/month (includes the s2 single-view model). [Move.ai docs – Move One pricing](https://docs.move.ai/knowledge/move-one-pricing); [Move.ai docs – pricing plans and credits](https://docs.move.ai/knowledge/move-ai-pricing-plans-credits)
- **DeepMotion Animate 3D:** Free (60 credits/month, 20 s clips), Starter $15/month (180 credits, includes commercial license), Innovator $48/month (480), Professional $117/month (1,500 credits, 120 s clips, 6-person tracking). **(third-party aggregator, unverified on deepmotion.com)** [FitGap – DeepMotion](https://us.fitgap.com/products/009151/deepmotion); [DeepMotion subscription launch post](https://deepmotion.com/post/animate-3d-subscription-launch)
- **Cascadeur:** Free tier; Indie $19/month or $8/month billed annually; Pro $49/month. Indie allows "unrestricted animation exports" to FBX, DAE and USD. After 1 year of subscription you keep a perpetual license without updates. AI AutoPosing and AutoPhysics. [Cascadeur – Plans](https://cascadeur.com/plans); [Toolradar – Cascadeur pricing](https://toolradar.com/tools/cascadeur/pricing)
- **Plask Motion:** Freemium plan and a "Mocap Pro" paid plan (video-to-motion). Current 2026 operating status and license not confirmed. [80.lv](https://80.lv/articles/plask-ai-s-freemium-mocap-pro-payment-plans-get-upgraded); [Plask docs](https://plask.ai/docs)
- Fab also hosts AI/mocap tools such as "RIGIPO – AI Text to Animation | Local – No API – Offline" (from $68.99) and "AnimBridge – Video Mocap Toolkit" (from $24.99). [Fab search](https://www.fab.com/search?q=military%20mocap%20prone%20crawl&categories=animations)

### Inferences
- Suggested gap-filling workflow: film a reference actor holding a broom or replica Lebel/Gewehr 98 doing (a) bolt-cycle while aiming, (b) fire-step up/down, (c) ladder or parapet climb-out with rifle, (d) wire cutting, (e) MG belt feed. Run the clips through Move One or Uthana video-to-motion (cost at $0.05/s is negligible: 10 minutes ≈ $30), then clean the hands/rifle contact in Cascadeur Indie. This keeps every output commercially licensed.
- Bandai Namco data must not ship in the game. It could only be used for internal reference or previs, and even that is constrained by the ND clause.
- CMU data contains few combat motions. It is mainly useful for generic locomotion/idles; Mixamo is cleaner for those.

### Gaps
- I did not verify whether Move.ai's $15 Move One Starter includes commercial rights (the commercial rights statement was for the Standard/Plus seats).
- DeepMotion's 2026 prices come from a third-party aggregator.
- Cascadeur's video-to-animation capability for 2026 was not confirmed.

---

## A4. Retargeting pipeline to a single skeleton and export to glTF for Babylon.js; common pitfalls

### Takeaway
There are two viable routes:
- **Offline:** retarget everything onto one canonical skeleton (Mixamo's rig is the easiest) in Blender, Cascadeur or the UE retargeter. Export one GLB per unit type with named animations (NLA tracks in Blender).
- **Runtime:** Babylon.js v9's new `AnimatorAvatar.retargetAnimationGroup()`, which retargets glTF animation groups between differently named skeletons at load time.

For hundreds of soldiers, bake the final clips into vertex animation textures (VAT) with Babylon's `VertexAnimationBaker` / `BakedVertexAnimationManager`.

### Cited Findings
- **Babylon.js v9.0 animation retargeting:** the `AnimatorAvatar` class exposes `retargetAnimationGroup()`. Options include `fixRootPosition` (scales root displacement across characters of different sizes), `fixGroundReference` (keeps feet planted), `rootNodeName`, `groundReferenceNodeName`, `mapNodeNames` (bone-name mapping, for example stripping Mixamo's `mixamorig:` prefix) and `animationGroupName`. Limitation: source animation groups must target TransformNodes (glTF animations always do), and the root must contain discoverable skeletons. An interactive Animation Retargeting Tool is at playground #RJQI3F#13. Early bugs (unfixed root bones, glTF import regressions) were patched. [Babylon.js forum – Introducing Animation Retargeting](https://forum.babylonjs.com/t/introducing-animation-retargeting/62547); [@babylonjs/core 9.18.0 animatorAvatar.d.ts](https://app.unpkg.com/@babylonjs/core@9.18.0/files/Animations/animatorAvatar.d.ts)
- Best practice: retarget once at load time per clip, cache the resulting AnimationGroups, then start/blend the cached groups on state changes. [Babylon.js forum – Introducing Animation Retargeting](https://forum.babylonjs.com/t/introducing-animation-retargeting/62547)
- Known issue: after a retarget, stopping the current animation snaps to the rest pose. [Babylon.js forum](https://forum.babylonjs.com/t/after-anim-retarget-stopping-current-animation-jumps-to-rest-pose/63379); [How to properly retarget animations?](https://forum.babylonjs.com/t/how-to-properly-retarget-animations/63568/6)
- **Blender → GLB:** name each NLA track; export to GLB and the tracks become addressable AnimationGroups in Babylon. [Babylon.js forum – How Blender exports two separate NLA grouped animations in GLB](https://forum.babylonjs.com/t/how-blender-exports-two-separate-nla-grouped-animations-in-glb-fomat/58582)
- **Pitfalls reported with Mixamo → Blender → Babylon:**
  - Duplicate armatures/skeletons when combining multiple Mixamo FBX imports.
  - The T-pose blended into every clip ("unable to remove T-pose from animations").
  - Duplicated animation groups, one of them empty, when NLA strips and duplicate armatures are used.

  [Babylon.js forum – Mixamo > Blender > Babylon workflow T-pose](https://forum.babylonjs.com/t/mixamo-blender-babylon-workflow-unable-to-remove-t-pose-from-animations/35680); [Babylon.js forum – duplicated armatures with animation layers](https://forum.babylonjs.com/t/getting-duplicated-armatures-when-exporting-character-with-animation-layers-nodding-and-walking/28321); [Babylon.js forum – Blender export glTF animations issue](https://forum.babylonjs.com/t/blender-export-gltf-animations-issue/36838)
- Babylon supports loading animation-only GLBs and retargeting them onto a model's skeleton, plus copying AnimationGroups between skeletons. [Babylon.js forum – Attaching GLTF/GLB animations-only files](https://forum.babylonjs.com/t/attaching-gltf-glb-animations-only-files-to-gltf-glb-3d-models/30729); [Targeting multiple GLTF animations to a single rig](https://forum.babylonjs.com/t/targeting-multiple-gltf-animations-to-a-single-rig/27171)
- **Crowds:** VAT moves skinning into a texture sampled in the vertex shader, so crowds scale to thousands with instancing. Babylon provides `VertexAnimationBaker` + `BakedVertexAnimationManager`, which work with instances or thin instances. A community project ("Shado") reports 1M instances in memory with 20k rendered at about 60 fps using auto-VAT. [Babylon.js forum – Vertex Animation Texture module](https://forum.babylonjs.com/t/vertex-animation-texture-module-implementation/24576); [Babylon.js forum – Shado](https://forum.babylonjs.com/t/shado-1-million-instances-20k-rendering-auto-vat-full-custom-properties-dynamic-webassembly/63830); [DEV – Instancing & VAT animation](https://dev.to/orion3d/making-a-multiplayer-web-rpg-part-8-instancing-vat-animation-327m); [Babylon.js forum – Baked Texture Animations with Animation Groups](https://forum.babylonjs.com/t/baked-texture-animations-with-animation-groups/32518)

### Inferences
- Recommended single-skeleton plan:
  1. Pick the Mixamo skeleton as canonical. It already holds most clips, and Kevin Iglesias provides retarget guides to common humanoid rigs.
  2. Retarget MoCap Online (MotusMan_v55), Kubold and Kevin Iglesias clips onto it in Blender (for example with the Rokoko Retargeting add-on or Auto-Rig Pro), or use UE5's IK Retargeter for Unreal-only Fab packs before FBX export.
  3. Bake to keyframes with "In Place" locomotion, which suits RTS-style movement driven by game logic.
  4. Export one GLB per soldier archetype with named NLA tracks.
  5. Bake to VAT in Babylon for crowd rendering, keeping full skeletal animation only for close-up/hero units.
- Practitioner knowledge, not verified in this session:
  - Mixamo FBX imports at centimetre scale (needs a 0.01 fix).
  - Bones carry a `mixamorig:` prefix (handle via `mapNodeNames`).
  - A-pose vs T-pose rest-pose mismatches between vendors cause shoulder/arm offsets unless rest poses are matched before retargeting.
  - Blender's glTF exporter needs "Always Sample Animations" / "Group by NLA Track" and "Export Deformation Bones Only" for clean output.
  - Rifle hand IK (keeping the off-hand on the forestock) usually breaks across differently proportioned rigs and needs a cleanup pass (Cascadeur or Blender).
  - Compress the final GLBs (for example with glTF-Transform resample/quantize and meshopt) to keep animation payloads small.
- With an angled top-down camera, small hand/finger errors are barely visible. Root motion, foot sliding and silhouette readability (prone vs crouch vs standing) matter more, so lean on Babylon's `fixGroundReference` and in-place clips.

### Gaps
- I found no first-party Babylon documentation page (doc.babylonjs.com) for AnimatorAvatar during this session, only the forum announcement and type definitions.
- Specific Blender add-on versions and Blender 4.x/5.x glTF exporter option names in 2026 were not verified.
- No published benchmark of Babylon VAT with 500+ soldiers on mid-range laptops was found beyond community claims.

---

## B1. Quixel Megascans on Fab: 2026 pricing/free status, WW1-relevant surfaces, and license for non-Unreal/web use

### Takeaway
Megascans are no longer free in bulk (paid since 2025, singles from $0.99, packs from $24.99). The big find: a **free Quixel "Military Trenches" collection on Fab, published Dec 18 2025**. It contains craters, sandbag barriers and stacks, corrugated-metal and wood trench walls, dirt-wall ends, duckboard bridges, log emplacements, a barbed-wire set and debris piles. It is offered under the Fab Standard License with **fbx/glb/gltf/usdz** downloads, which can be used in any engine, including Babylon. Mud surfaces (Moist Chunky Mud, Soil Mud, Mud Footprint, Tire Tracks On Mud) cost $0.99 each, with a few free, and also come with glTF.

### Cited Findings
- Pricing since 2025: standalone 2D/3D assets from $0.99, asset packs from $24.99, procedural kits from $4.99. Some assets remain free. Unlimited free Megascans ended at the end of 2024. [CG Channel](https://www.cgchannel.com/2024/10/epic-games-has-made-megascans-free-to-all-but-only-until-the-end-of-2024/); [80.lv](https://80.lv/articles/megascans-no-longer-free-after-2024); [Fab – Quixel to Fab Transition FAQs](https://support.fab.com/s/article/Fab-Transition-FAQs?language=en_US)
- An indie guide (2026) says previously downloaded Megascans keep their original license, new Fab assets use Fab terms, and Epic periodically runs free temporary bundles. [StraySpark – Quixel to Fab migration guide 2026](https://www.strayspark.studio/blog/quixel-to-fab-migration-indie-developer-survival-guide-2026) (secondary source)
- **"Military Trenches" collection (Quixel Megascans, Fab):** items seen, all priced **Free**:
  - Military Trenches Crater L 01 / L 02 / L 03
  - Barrier Sandbag Canvas 01/02/03/S/Worn/Square 01–02/Round 01–02
  - Equipment Sandbag Canvas Stack 01–03; Pile Sandbag Canvas 01; Cloth Sandbag Canvas Torn 03
  - Wall Metal Corrugated 04/06/15/16; Wall Metal Corner 02; Wall Extrusion Metal Corrugated 01
  - Wall Wood 07; Wall Mixed; Wall Dirt End
  - Bench Wood 01; Bridge Wood; Emplacement Roof Wood; Emplacement Logs Wood
  - **Wire Barbed Set**
  - Debris Pile Rock S; Ground Patch Rock S 02

  [Fab search "Military Trenches"](https://www.fab.com/search?q=%22Military%20Trenches%22); [Fab search "megascans sandbag"](https://www.fab.com/search?q=megascans%20sandbag); [Fab search "megascans barbed wire"](https://www.fab.com/search?q=megascans%20barbed%20wire); [Fab search "megascans crater"](https://www.fab.com/search?q=megascans%20crater) (all verified Oct 2026)
- Listing example, **Military Trenches Crater L 02**: Free. Standard License. Included formats **fbx, glb, usdz, gltf** ("Converted GLB, glTF, and USDZ") plus ZBrush. Texel density 1916 px/m. 3.69 m × 3.73 m × 0.51 m open mesh. Maps: AO, Basecolor, Bump, Cavity, Displacement, Gloss, Normal, Roughness, Specular. Published Dec 18 2025. "Allows usage with AI: No". Description: modular "logs, sandbags, planks, and barbed wire" for "winding pathways" and "fortified structures". [Fab – Military Trenches Crater L 02](https://www.fab.com/listings/3870598a-4772-4a34-ab6b-48ed9336faab) (verified)
- Mud surfaces (Quixel Megascans on Fab): "Moist Chunky Mud" ($0.99), "Soil Mud" (several variants; some Free, most $0.99), "Mud Footprint" ($0.99), "Tire Tracks On Mud" (one Free, others $0.99), "Mud Tire Tracks" ($0.99), "Mud Ground" ($0.99), "Straw And Mud Surface" ($0.99), "Brick Mud" ($0.99). [Fab search "megascans mud"](https://www.fab.com/search?q=megascans%20mud) (verified)
- **Moist Chunky Mud listing:** texel density 4096 px/m, 2×2 m scan area, maps AO/Bump/Specular/Normal/Displacement/Gloss/Basecolor/Cavity/Roughness. Included formats "texture set, gltf". Standard License. Published Oct 13 2024. [Fab – Moist Chunky Mud](https://www.fab.com/listings/80b01ee6-81a3-48c8-92eb-979f9aebcdb8) (verified)
- Searching "megascans chalk" returned no Megascans chalk-ground surface (only Military Trenches rock debris and unrelated chalk props). Dekogon sells "HSC – Chalk – PBR Game Ready" and "SO – Chalk – PBR Game Ready" at $5.99 each (whether these are ground surfaces was not checked). [Fab search "megascans chalk"](https://www.fab.com/search?q=megascans%20chalk)
- Fab Standard License: usable "with any compatible tools (usage is not limited to Unreal Engine)". End users must be restricted "from extracting or otherwise using Content outside of the Project". NoAI-tagged content can't be used for generative-AI training. [Fab EULA](https://www.fab.com/eula)
- Third-party trench and battlefield packs on Fab: "Military Trenches and Modular World War Compound" (Sierra Division, from $179.99), "Sandbag Walls" (Karamai, from $24.99), "Barbed Wire Pack" (Karamai, from $19.99), "Rusted barbed wire" (Axonite, from $0.99), "Concertina Wire" (Isaac Oster, from $0.99), "Barbed Wire Substance material and textures" (Vasyl8, from $1.99). [Fab search "Military Trenches"](https://www.fab.com/search?q=%22Military%20Trenches%22); [Fab search "megascans barbed wire"](https://www.fab.com/search?q=megascans%20barbed%20wire)

### Inferences
- The free Military Trenches collection is the single most valuable find for a Verdun game. It is photogrammetry trench furniture plus crater meshes, ships as glTF/GLB, and is free under a license that permits non-Unreal engines. Expect to decimate and re-bake it: the meshes are high-density photogrammetry (craters at about 1.9k px/m texel density) and need LODs, texture downsizing (1K–2K) and KTX2/Basis compression for the web.
- Verdun's terrain was largely churned clay-loam and limestone/chalk-marl (white/grey patches in shell holes). Megascans' coverage of a "chalk ground" surface looks thin, so a CC0 clay/rock texture may need to be tinted toward chalk, or a paid chalk-soil texture sourced separately.
- Because of the Fab "restrict end users from extracting" clause, a web game should not serve these as plain, individually named .glb files. Packing them into combined or obfuscated asset bundles is the usual mitigation. This is an inference, not legal advice.

### Gaps
- I did not confirm whether every item in the Military Trenches collection is free (all items seen were) or how many items it contains in total.
- I did not confirm the Personal vs Professional tier price for $0.99 Megascans (the listing masked the price).
- I found no explicit Epic statement on browser/WebGL delivery beyond the general extraction clause.

---

## B2. Poly Haven and ambientCG (CC0): relevant materials and resolutions

### Takeaway
Both are CC0 (no attribution, commercial use OK, no anti-extraction clause), which makes them the safest choice for a web game.
- **Poly Haven:** 864 textures (Oct 2026). Strong mud set (brown_mud ×4 variants, muddy_tracks, mud_forest, etc.), burned ground, excavated soil wall, 40+ plank woods, 20+ rusty metal/corrugated iron, hessian (sandbag) fabric. Up to 8K, with a ready **glTF download per texture**.
- **ambientCG:** 2,140 materials and decals (Oct 2026). 128 Ground materials (about 40 tagged mud/wet), Clay ×4, Rust ×10, CorrugatedSteel ×15, Planks ×59, Footsteps (mud), and decals for leaks/tire tracks. Up to 8K, with many at 12K/16K.

### Cited Findings
- Poly Haven license: "You can use our assets for any purpose, including commercial work." "You do not need to give credit or attribution." "You can redistribute them … or even in a product you sell." [Poly Haven – License](https://polyhaven.com/license)
- Poly Haven textures total: **864** (from `api.polyhaven.com/assets?type=textures`, Oct 3 2026). [Poly Haven API](https://api.polyhaven.com/assets?type=textures)
- Poly Haven relevant texture slugs (all at polyhaven.com/a/<slug>), from the API:
  - **Mud:** aerial_mud_1, brown_mud, brown_mud_02, brown_mud_03, brown_mud_dry, brown_mud_leaves_01, brown_mud_rocks_01, dry_mud_field_001, mud_cracked_dry_03, mud_cracked_dry_riverbed_002, mud_forest, **muddy_tracks**, red_dirt_mud_01, red_mud_stones
  - **Ground/soil:** **burned_ground_01**, **excavated_soil_wall**, farm_soil, dirt, dirt_floor, raked_dirt, forest_floor, forest_ground_04/05/06, forest_leaves_02/03/04, leaves_forest_ground, dry_ground_01, dry_ground_rocks, rock_ground/rock_ground_02, rocks_ground_01–09, stony_dirt_path, clay_floor_001, **wood_planks_dirt**, cracked_red_ground
  - **Gravel/rock:** gravel, gravel_ground_01, rocky_terrain/02/03, rocky_trail/02, sandy_gravel, plus about 30 more
  - **Wood planks (42):** old_planks_02, weathered_planks, weathered_brown_planks, worn_planks, wooden_rough_planks, raw_plank_wall, wood_plank_wall, green_rough_planks, dark_wooden_planks, oriented_strand_board (modern, avoid), etc.
  - **Rust/metal (21):** corrugated_iron, corrugated_iron_02/03, **rusty_corrugated_iron**, worn_corrugated_iron, rusty_metal_01–05, rusty_metal_sheet, rust_coarse_01, rusty_metal_grid, green_metal_rust
  - **Fabric (for sandbags):** hessian_230, hessian_380
  - **Snow (for the winter 1916 phases):** snow_01–05, snow_field_aerial

  [Poly Haven API](https://api.polyhaven.com/assets?type=textures); [Poly Haven ground & terrain](https://polyhaven.com/textures/terrain)
- Example asset "muddy_tracks": "Wet, earthy mud with deep tire tracks, rough clumps of loose soil, moist sheen". Max resolution 8192×8192. Category "Ground & Terrain/Soil & Mud/Tire-Tracked Mud". Downloadable as **blend, gltf, mtlx** and individual maps (Diffuse, nor_gl, nor_dx, Rough, AO, arm, Displacement) at 1K/2K/4K/8K. [Poly Haven API – info/muddy_tracks](https://api.polyhaven.com/info/muddy_tracks); [Poly Haven API – files/muddy_tracks](https://api.polyhaven.com/files/muddy_tracks)
- ambientCG license: "Creative Commons CC0 1.0 Universal License". You may "copy, modify, distribute and perform the assets, even for commercial purposes, all without asking permission". Attribution is optional. [ambientCG – License](https://docs.ambientcg.com/license/)
- ambientCG catalog: **2,140** Material+Decal assets (from `ambientcg.com/api/v2/full_json`, Oct 3 2026). Category counts include Ground 128, Gravel 44, Rock 67, Rocks 26, Planks 59, Wood 102, Metal 101, Rust 10, Corrugated Steel 15, Fabric 87, Clay 4, Bark 15, Snow 23, Footsteps 6, Fence 12, Rope 3, Net 8, Surface Imperfections 20, Scratches 5, Smear 8, Leaking 39 (decals), Tire Tracks 1 (decal). [ambientCG API](https://ambientcg.com/api/v2/full_json?type=Material,Decal&limit=2000)
- ambientCG Ground materials tagged mud/muddy/wet: Ground012, 015, 018, 019, 023, 024, 025, 026, 029, 036, 040, 041, 042, 049A/B/C, **050 (mud + puddle)**, 051, 054, 057, 059, 061, 071, 083, 087, 092A/B/C, 094A/B/C, 095A/B/C, 100, 106, 109. Ground031 is tagged "cracks". Clay001–004; Rust001–010; CorrugatedSteel001–009 (with A/B/C variants); **Footsteps001 (tags: mud, imprints, shoe, snow)**. Fence001–006 are tagged wire/wiremesh (chain-link, not barbed). [ambientCG API](https://ambientcg.com/api/v2/full_json?type=Material,Decal&limit=2000); [ambientCG list](https://ambientcg.com/list?q=mud&type=material)
- Resolutions: ambientCG Ground054 offers 1K/2K/4K/8K/12K/16K in JPG and PNG. TireTracks001 (decal) and Footsteps001 go to 12K–16K. [ambientCG API – Ground054/Footsteps001/TireTracks001](https://ambientcg.com/api/v2/full_json?id=Ground054,Footsteps001,TireTracks001&include=downloadData)

### Inferences
- A practical CC0 Verdun ground stack:
  - **Base:** brown_mud_02/03 or ambientCG Ground050/Ground095 (wet mud).
  - **Craters and spoil:** excavated_soil_wall, burned_ground_01, mud_forest.
  - **Chalk/limestone patches:** tinted rock_ground or rocky_terrain, or ambientCG Rock0xx.
  - **Detail tiling:** muddy_tracks or Footsteps001 for trodden areas near trenches.
  - **Trench furniture:** old/weathered planks, rusty_corrugated_iron, hessian_230/380 for sandbags.
- For the web, use 1K–2K maps compressed to KTX2/Basis. Poly Haven's ready glTF download simplifies a Babylon PBRMaterial import. Pack AO/rough/metal into Poly Haven's "arm" texture to save fetches.
- CC0 also removes the "restrict extraction" concern that applies to Fab, Unity and Adobe assets in a browser game.

### Gaps
- Poly Haven per-asset max resolution varies (some 16K); I only spot-checked one asset.
- I did not visually check which of the about 40 mud-tagged ambientCG Ground materials best match Verdun's grey-brown clay/chalk palette.
- Neither library has a dedicated barbed-wire texture or a shell-crater decal.

---

## B3. Other texture sources: Textures.com, Poliigon, GameTextures, CGBookcase, Adobe Substance 3D Assets (pricing and game licenses)

### Takeaway
- **Textures.com:** indie (<$150k revenue) subscription from US$13/month for 1,000 credits; game use allowed; no more free credits.
- **Poliigon:** plans about $12–$37/month; the Hobbyist tier excludes commercial projects (third-party info).
- **Substance 3D Assets:** now unmetered with the Substance 3D Texturing ($24.99/month) or Collection ($59.99/month) plans. Game use is allowed only when assets are incorporated or modified and can't be extracted standalone.
- **CGBookcase:** free with "no restrictions".
- **GameTextures:** 2026 pricing could not be verified.

### Cited Findings
- **Textures.com:** "Freelance & Indie" license is for "entities with less than $150k USD in funding or gross revenue per year". STARTER: 1,000 credits/month, US$13/month (monthly). A Pro tier and Studio/Corporate plans also exist. Features listed include commercial license, high-res images, procedural materials, .SBS source files, 3D objects and scans. [Textures.com – Pricing (Indie)](https://www.textures.com/pricing/indie) (verified Oct 2026)
- Textures.com stopped offering free credits. [GameDev.tv community](https://community.gamedev.tv/t/textures-com-no-longer-offers-free-credits/219803). Its textures are royalty-free and usable in game development. [WorldViz KB](https://kb.worldviz.com/?p=2357); [Textures.com Terms of Service PDF](https://www.textures.com/system/TexturesCom%20-%20Terms%20of%20Service%20Rev3-8.pdf)
- **Poliigon:** Hobbyist $12/month, Professional $24/month, Unlimited $27/month, Studio $37/month, plus Free and Enterprise. "The Hobbyist plan does not permit client work or commercial projects beyond personal portfolio." Plans are now priced in "assets per month" instead of credits. **(third-party; Poliigon's own pricing page did not render)** [Toolradar – Poliigon pricing](https://toolradar.com/tools/poliigon/pricing); [LicenseOrg – Poliigon](https://licenseorg.com/guide/3d-assets/poliigon); [Poliigon help – New asset pricing](https://help.poliigon.com/en/articles/8749917-new-asset-pricing)
- Poliigon free content: 100+ free assets, including 55 textures up to 8K. **(dated)** [80.lv](https://80.lv/articles/poliigon-is-offering-over-100-assets-textures-hdris-for-free)
- **Adobe Substance 3D Assets:** from Mar 25 2025, Substance 3D Collection costs $59.99/month or $599.88/year (individual) and includes "unmetered access" to 20,000+ assets. The Substance 3D Texturing plan ($24.99/month or $249.88/year) also includes unmetered Assets access. [Adobe blog – Substance 3D innovations and pricing updates](https://blog.adobe.com/en/publish/2025/02/20/substance-3d-innovations-pricing-updates); [GameFromScratch](https://gamefromscratch.com/adobe-announce-substance-suite-price-increases/)
- Substance 3D Assets Additional Terms: you must not distribute a Substance 3D Asset unless it is "(1) modified into a Modified Work; or (2) incorporated into a Larger Work", and must not use it "in any way that allows a third party to use, download, extract, or access the Substance 3D Asset(s) on a stand-alone basis". [Adobe Substance 3D Assets Additional Terms (2022)](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe-Substance-3D-Assets-Addl-Terms-en_US-20220322.pdf); [Adobe Community thread](https://community.adobe.com/t5/substance-3d-assets-and-community-assets/commercial-use-of-3d-asset-library/m-p/13944776/highlight/true)
- **CGBookcase:** the homepage states "100% free, no restrictions" (photoscanned rocks, manhole decals, etc.). The license name and catalog size were not shown on the fetched page. [CGBookcase](https://www.cgbookcase.com/)
- **GameTextures:** historically $30/month. An indie license allowed limited commercial use under $250k/year revenue. **(dated; 2026 pricing unverified)** [Polycount](https://polycount.com/discussion/comment/1667058); [GameTextures help – license TL;DR](https://gametexturescom.helpscoutdocs.com/article/108-your-license-is-too-long-i-didnt-read-fill-me-in)

### Inferences
- With a free Megascans Military Trenches set plus CC0 Poly Haven/ambientCG mud, rust, plank and hessian, a paid texture subscription is probably unnecessary. Textures.com ($13/month, indie) is the cheapest top-up for oddities: WW1-era signage, specific uniforms/cloth weaves, chalk soil photo references.
- Substance 3D Assets is attractive if the team already uses Painter/Designer, since the procedural mud/soil .sbsar materials allow tuning colour toward Verdun chalk-clay. Bake outputs to plain textures before shipping; the "modified/larger work" clause supports this.

### Gaps
- I could not verify current Poliigon plan prices on poliigon.com (the page did not render).
- Textures.com Pro-tier price and credit costs per texture were not captured.
- I did not confirm whether CGBookcase still publishes new content in 2026 or uses CC0 specifically.

---

## B4. Terrain blending and decals (footprints, craters, tracks, blood): which sources provide them

### Takeaway
Decals are sparse in the CC0 libraries. ambientCG offers leak/stain, tire-track and asphalt-damage decals; its "Footsteps" mud imprints are tileable materials. The richest WW1-relevant options are on Fab:
- Megascans Mud Footprint and Tire Tracks On Mud ($0.99, some free).
- Free Megascans "Military Trenches Crater" meshes.
- LDN127 "Crater Decals" (from $10.99).
- Free "Bomb Craters Pack" (Blenderust).
- Dekogon "Decals VOL.7 – Mud Tracks and Prints" (40+ decals, $11.99–$19.99, but Unreal-format only).

No dedicated blood-decal source was verified in this pass.

### Cited Findings
- **ambientCG decals:** 127 total, mostly RoadLines and ManholeCover. Relevant ones: **Leaking001–019 (39 wet/smudge stain decals)**, **TireTracks001**, **AsphaltDamage001 (cracks)**, plus Smear001–008 and SurfaceImperfections001–020 materials (grime overlays). Footsteps001–006 are "Material" type; Footsteps001 is tagged mud/imprints/shoe/snow. [ambientCG API](https://ambientcg.com/api/v2/full_json?type=Material,Decal&limit=2000)
- **Megascans (Fab):** "Mud Footprint" ($0.99), "Tire Tracks On Mud" (one variant Free, others $0.99), "Mud Tire Tracks" ($0.99). [Fab search "megascans mud"](https://www.fab.com/search?q=megascans%20mud). Megascans crater meshes from the Military Trenches set (Crater L 01–03) are free. [Fab search "megascans crater"](https://www.fab.com/search?q=megascans%20crater)
- **Dekogon Studios – "Decals VOL.7 – Mud Tracks and Prints":** "40+ Easily applied decal set of mud tracks and prints", master material, Lumen support. Unreal Engine 5.3–5.8 format only. $11.99–$19.99. Published Feb 17 2026. [Fab listing](https://www.fab.com/listings/9057ce52-09f0-4885-9231-c2c34bf5aa4c) (verified)
- Other Fab crater/mud items: "Crater Decals" (LDN127, from $10.99, 5.0★ from 15 ratings), "Bomb Craters Pack" (Blenderust, Free), "20 Craters Nanites Meshs + 20 Heightmaps 4K" (Kins'Art, from $5.99), "Pockmarked Crater Terrain" (Taber Noble, from $14.99), "Field mud tracks" (Axonite, from $7.99), "[Photoscanned] Mud Essentials Pack" (Rough Edge, from $20.99), "Wet Mud PBR Texture Combo" (CGHawk, from $14.99). [Fab search "megascans crater"](https://www.fab.com/search?q=megascans%20crater); [Fab search "megascans mud"](https://www.fab.com/search?q=megascans%20mud)
- Poly Haven "muddy_tracks" (CC0, 8K) is a tileable tire-tracked mud material, usable as a blend layer rather than a decal. [Poly Haven API – info/muddy_tracks](https://api.polyhaven.com/info/muddy_tracks)

### Inferences
- For a top-down Babylon terrain, a splat/height-blended material works well: 3–4 tiling CC0 mud/clay/chalk/burnt layers blended by a mask painted from crater positions. That plus mesh craters (free Megascans Crater L 01–03 and a generated heightmap) will read better than many projected decals. Reserve decals (Babylon DecalMap or projected decals) for footprints/tracks near trenches, scorch marks and blood. Decals from Unreal-only packs (Dekogon) would need exporting from UE to PNG/EXR first.
- Crater heightmap packs (Kins'Art "20 Craters … 20 Heightmaps 4K") can be stamped into a procedural Verdun heightfield at build time. That avoids runtime decal cost for hundreds of craters.
- Blood: given the game's subject, a stylised or minimal approach (dark wet-mud stains from ambientCG Leaking or Smear decals tinted dark red-brown) may be enough and avoids sourcing gore-specific packs.

### Gaps
- I did not search specifically for blood-decal packs or check their licenses.
- I did not verify LDN127 "Crater Decals" formats (UE-only or texture files).
- I did not check whether Babylon.js v9 has new terrain-splat or decal-map features beyond the existing `DecalMapConfiguration` (not researched here).
