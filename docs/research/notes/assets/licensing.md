# Licensing terms of major 3D asset marketplaces for a commercial browser-based (WebGL/WebGPU, Babylon.js, glTF) multiplayer game

Scope note: research done 2026-10-03. This is not legal advice. Several primary pages (fab.com/eula, turbosquid.com/Licensing, artstation.com/marketplace-product-eula, unrealengine.com/eula/content) return HTTP 403 or a CAPTCHA to automated fetchers; their text was read through a plain-text reader proxy (r.jina.ai) or, for TurboSquid, through TurboSquid's own first-party blog copy of the license. Quotes below are verbatim from those copies. The live pages should be re-checked before relying on them.

Framing used throughout: the game's model and texture files (glTF/GLB, KTX2, and so on) are downloaded to every player's browser. glTF is an open, publicly documented Khronos format that public tools such as Blender and three.js open directly. So any license that demands a "proprietary format" or "no extraction" is under strain in this delivery model.

---

## 1. Fab (Epic): Standard License, Personal / Professional / Reference-Only tiers, CC licenses, Quixel Megascans, legacy Epic Content License

### Takeaway
The Fab Standard License (EULA last updated Oct 1, 2024) has **no engine restriction**. It allows commercial games distributed to the public, and its definition of distribution expressly covers making a Project's functionality "available on a network", so web delivery is covered. The main protection obligation is that end users may use the Content only "as incorporated in the Project in object code", and you "must restrict end users from extracting or otherwise using Content outside of the Project". The license gives no technical standard for that, and "object code" fits loosely with glTF files served to a browser. That is the key ambiguity. Personal vs Professional is a revenue-eligibility split (USD 100k in the last 12 months, counting funds raised) with the same scope of rights. Megascans acquired on Fab are under the Fab Standard License and may be used in any engine. Megascans claimed under the legacy Epic Content License "Unreal Engine plan" are **UE-Only**.

### Cited Findings
- **Agreement date and parties:** "Last updated: October 1st, 2024". The license is granted by the "Content Licensor", which may be Epic or a third-party seller. — [Fab EULA](https://www.fab.com/eula)
- **License tiers and revenue test (Sec. 2(a)):** "you may be required to select between a Personal - Reference Only tier, a Personal tier, and a Professional tier ... You are only eligible for a Personal - Reference Only tier or Personal tier if, at the time of the Transaction you, together with any controlling entity and other entities under common control with you, have not generated more than $100,000 USD in gross revenue from your commercial activity in the digital content industry in the last 12 months. For purposes of this calculation, revenue includes any advances received or other funds raised." If you bought a tier you were not eligible for, you must pay Epic the difference on request. — [Fab EULA](https://www.fab.com/eula)
- **Same rights in both paid tiers:** Epic's documentation says Personal is for buyers who "have not generated more than $100,000 USD in gross revenue from commercial activity in the last 12 months" and Professional for those who have. Search-indexed text of the same page says both tiers "grant you the same scope of rights" and that use is "not limited to Unreal Engine" ("use the assets with any compatible tools"). — [Epic Dev Docs: Licenses and pricing in Fab](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab). The "any compatible tools" wording came from the search snippet; the direct fetch did not render that sentence.
- **Content formats (Sec. 2(d)):** Reference-Only tier gives "reference asset only". Personal and Professional tiers give "both a source asset and a reference asset". "Source assets are files that contain full copies of the Content in Unreal Engine format and possibly other formats (as listed)". — [Fab EULA](https://www.fab.com/eula)
  - Implication: the **Personal - Reference Only** tier is useless for a Babylon.js game, because it gives no source files.
- **Grant (Sec. 3(a)):** "non-exclusive and non-transferable license to privately use, reproduce, display, perform, and modify the Content". The grant never mentions Unreal Engine. — [Fab EULA](https://www.fab.com/eula)
- **Definition of Distribute (Sec. 4(a)):** "to provide or otherwise make a copy of the Project available publicly ... or make the Project's functionality available on a network." — [Fab EULA](https://www.fab.com/eula)
- **Key protection clause (Sec. 4(c)):** "you may Distribute a Project that incorporates Content as an included dependency to end users. When you make such a Distribution, you may, however, only authorize end users to make use of Content solely as incorporated in the Project in object code and you must restrict end users from extracting or otherwise using Content outside of the Project." It continues: "you may Distribute software applications (such as video games) that include Content to the general public". — [Fab EULA](https://www.fab.com/eula)
- **Standalone and editor restrictions (Sec. 6(b)):** You may not:
  - "sell, rent, lease, or transfer the Content on a 'stand-alone basis' (... the Content must be merely a component of the Project and not the primary focus of the Project)"
  - "allow any third party to incorporate Content into their own products ... (this means, for example, that you may not make Content available in world- or level-editing tools or templates or other modeling tools that allow works to be exported)"
  - "attempt to reverse engineer, decompile, translate, disassemble, or derive source code or data from the Content"
  
  — [Fab EULA](https://www.fab.com/eula)
- **Non-compatible licenses (Sec. 6(a)):** You may not combine Standard-licensed Content with content under "GNU General Public License (GPL), Lesser GPL ... or Creative Commons Attribution-ShareAlike License." — [Fab EULA](https://www.fab.com/eula)
- **Sharing with the team (Sec. 5(a)):** Content may be shared "with your employees, affiliates, and contractors in a private online repository while you work on a Project together". Collaborators must delete it when no longer needed. The EULA sets no seat count for content. Only Plugins are "offered to you on a per-seat basis" (Sec. 2(e)). — [Fab EULA](https://www.fab.com/eula)
- **CC / open licenses on Fab (Sec. 2(c)):** Content offered under an open-source license is licensed under that "Alternative License", and "You are not granted a Standard License to such Content". Fab lists "Creative Commons Attribution (CC-BY) (Free)" as a license type. — [Fab EULA](https://www.fab.com/eula); [Epic Dev Docs](https://dev.epicgames.com/documentation/en-us/fab/licenses-and-pricing-in-fab)
- **AI (Sec. 6(b)(vii), 16(l)):** Content tagged "NoAI" may not be used in datasets for, development of, or training of Generative AI Programs. — [Fab EULA](https://www.fab.com/eula)
- **Amendments (Sec. 7(a)):** "Any Content you acquired (whether free or paid) prior to the modified terms will remain governed by the license terms applicable at the time when you acquired the Content." — [Fab EULA](https://www.fab.com/eula)
- **Megascans on Fab:** From Fab launch until end of 2024, Megascans were free under the Fab Standard License "for all engines and tools", including commercial projects. From 2025 most Megascans became paid, with a free cross-section of 1,500+ assets offered for any engine. "When you acquire Quixel content on Fab - whether free or paid - you can use it forever." — [CG Channel, Oct 22 2024](https://www.cgchannel.com/2024/10/epic-games-has-made-megascans-free-to-all-but-only-until-the-end-of-2024/); [Unreal Engine blog: Fab launches in October](https://www.unrealengine.com/blog/fab-content-marketplace-launches-in-october-publishing-portal-opens-today)
- **Legacy Epic Content License Agreement (Quixel.com / Bridge / old UE Marketplace):**
  - "'UE-Only Content' means Licensed Content that is designated as only permitted for use in conjunction with Unreal Engine and Unreal Engine-based products".
  - Megascans Addendum (c): "Megascans Content that you acquire from Epic while your account is enrolled in an Unreal Engine plan may only be used and shared as UE-Only Content."
  - Personal and indie Megascans plans were usable as ordinary Licensed Content. The personal plan has a USD 100k annual revenue test.
  - Distribution rule: "You may Distribute Licensed Content incorporated in object code format only as an inseparable part of a Project to end users."
  
  — [Epic Content License Agreement](https://www.unrealengine.com/eula/content)
- Search-indexed coverage says that claiming free Megascans on Quixel.com or Bridge gave access under the Epic Content License, while claiming on Fab gives the Fab Standard License, which allows any engine. — [Unreal Engine forum: Access legacy Megascans on Bridge and Quixel.com](https://forums.unrealengine.com/t/access-legacy-megascans-on-bridge-and-quixel-com/2142664/1). This attribution comes from a search summary and was not directly verified on that page.

### Inferences
- **(a) Non-native engine:** Allowed. Nothing in the Fab EULA limits use to Unreal. Only legacy Megascans claimed under the UE plan of the Epic Content License are UE-Only. Those should be **excluded from a Babylon.js project unless re-acquired on Fab**.
- **(b) Web delivery:** Allowed in principle, because network distribution is expressly within "Distribute". The weak point is "object code" plus "must restrict end users from extracting". A raw .glb sitting at a public URL arguably fails "restrict". Packing assets into a custom binary container, adding light encryption or obfuscation, and having game ToS/EULA terms that forbid extraction looks like the defensible minimum. No Epic guidance says what counts.
- **(c) Commercial F2P or paid:** Allowed, with no royalties. Buy Professional once the team or entity passes USD 100k in digital-content revenue. Note that revenue "includes any advances received or other funds raised", so a funded studio may need Professional even before launch revenue.
- **UGC caution:** A level editor or modding tool that exposes Fab assets for export would breach Sec. 6(b)(iii).
- **CC-BY-SA caution:** Do not mix Fab Standard assets with CC-BY-SA assets (Sec. 6(a)). Many Sketchfab-sourced CC models are CC-BY-SA.
- **Free legacy UE Marketplace assets:** These now show on Fab under the Standard License. Check each product page for the listed license and formats, and for any "UE-only" note.

### Gaps
- The live fab.com/eula returns 403 to fetchers. The text here is the Oct 1, 2024 version via a reader proxy, and there may be a newer version.
- No Epic statement was found defining what "restrict end users from extracting" means for WebGL or glTF delivery. Asking Epic/Fab support or the specific seller in writing is advisable.
- Exact 2025 to 2026 Megascans pricing, and the current list of the free all-engine Megascans subset, were not verified from a primary source.

---

## 2. Unity Asset Store EULA: use outside Unity, web builds, protection, seats

### Takeaway
Unity states officially, in a support article dated July 2, 2025, that Asset Store assets **may be used with other engines** if you comply with the EULA. The EULA (last updated Dec 4, 2024) licenses assets for incorporation into a "Licensed Product" and does not mention Unity as the required runtime. The EULA has no explicit "reasonable measures" or proprietary-format clause, and no web or WebGL-specific language. Unity's support article does, however, say that end users must not be able to access or extract the raw asset files. The EULA expressly allows monetizing assets in-product, including through in-app purchases.

### Cited Findings
- **Grant (Sec. 2.2.1(a)):** "to incorporate the Asset, together with substantial, original content not obtained through the Unity Asset Store, into an electronic application or digital media that has a purpose, features, and functions beyond the display, performance, distribution, or use of Assets ('Licensed Product') as an embedded component of that Licensed Product, such that the Asset does not comprise a substantial portion of the Licensed Product". — [Unity Asset Store Terms of Service and EULA](https://unity.com/legal/as-terms)
- **Distribution within the product (Sec. 2.2.1(b)):** "to reproduce, publicly display, publicly perform, transmit, and distribute the Asset as incorporated and embedded in that Licensed Product". — [Unity AS Terms](https://unity.com/legal/as-terms)
- **Monetization (Sec. 2.2.1(d)):** "monetize the Asset within and for use within a Licensed Product, including via in-app purchases". — [Unity AS Terms](https://unity.com/legal/as-terms)
- **Limitations (Sec. 2.2.1.1):** You may not:
  - (a) share purchase costs ("forum pooling")
  - (b) "enable a customer or user of a Licensed Product to sell, transfer, distribute, lease, or lend the Assets for commercial gain"
  - (c) without authorization, monetize an Asset where the product's "primary purpose is to create user-generated content"
  - (f) use Assets in "any digital representation of value, ownership" without authorization
  - (g) use Assets for AI/ML training without consent
  
  — [Unity AS Terms](https://unity.com/legal/as-terms)
- **Version:** "Last updated: December 4, 2024". — [Unity AS Terms](https://unity.com/legal/as-terms)
- **Seats:** "Extension Assets" (Editor Extensions, Scripting, Services) are "a single seat license ... only on a maximum of 2 computers" (Sec. 2.3.2). Other assets are licensed to the END-USER entity, which can extend to Affiliates (Sec. 2.3.1). — [Unity AS Terms](https://unity.com/legal/as-terms), as summarized by the fetch tool. The 2.3.x wording was not reviewed verbatim.
- **Restricted Assets (Sec. 2.2.2 / 2.9):** These carry their own "Restricted Asset Terms" found in the accompanying materials. They are typically used where open-source components apply. — [Unity AS Terms](https://unity.com/legal/as-terms)
- **Other engines, official Unity statement (July 2, 2025):** "Yes, you can use Unity Asset Store assets with other engines, but you must comply with the End User License Agreement". Prohibited: "Assets cannot be redistributed as standalone items or in a way that allows others to extract them from your final product". The search-indexed version of the article adds "users of your project cannot access or extract the raw asset files". — [Unity Support: Can I use assets from the Asset Store with other engines?](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines)
- **No web wording:** The EULA has no WebGL/web-specific language. — [Unity AS Terms](https://unity.com/legal/as-terms)
- **Synty purchases:** Synty's own EULA defines its "Store" as excluding the Unity Asset Store. Synty packs bought on the Unity Asset Store are therefore governed by Unity's EULA, not Synty's. — [Synty One-Time Purchase Licence](https://syntystore.com/pages/end-user-licence-agreement)

### Inferences
- **(a) Non-native engine:** Allowed. Unity has confirmed this officially since at least July 2025.
- **(b) Web delivery:** Allowed. The binding obligation is "no extraction of raw asset files" as the official interpretation. Serving the purchased FBX converted to raw .glb at a predictable URL is the risky pattern. A packed or encrypted container plus ToS is the defensible pattern.
- **(c) Commercial F2P or paid:** Allowed, including selling Asset Store assets as IAP cosmetics (2.2.1(d)). Do not let players trade or sell them for "commercial gain" (2.2.1.1(b)) or use them as NFTs or other tokens of value (2.2.1.1(f)).
- **Per-asset check:** Some Asset Store listings carry Restricted Asset Terms or third-party licenses that override the standard EULA. Check each listing.

### Gaps
- The brief's premise of a "2020+ clarification" in the EULA text itself could not be verified. The clearest official statement found is the 2025 support article. Unity's EULA FAQ page ([assetstore.unity.com/browse/eula-faq](https://assetstore.unity.com/browse/eula-faq)) was found in search but not fetched.
- The exact verbatim Sec. 2.3.1 / 2.3.2 seat text was summarized by the fetch tool, not reviewed line by line.

---

## 3. Sketchfab Store Standard and Editorial licenses (now under Fab)

### Takeaway
The Sketchfab Store has been replaced by Fab. Migrated Standard-licensed models became **Fab Standard (Personal tier)** listings. **Editorial models were not migrated** because Fab has no editorial license. Models bought earlier on Sketchfab remain under the Sketchfab license agreement:
- single-seat
- no standalone access or extraction by third parties
- the site must post terms banning standalone reuse
- a notable clause against using assets to "promote ... weapons or explosives" (relevant for a WW1 shooter)
- Editorial assets are **unusable** in a commercial game.

### Cited Findings
- **Migration:** "Both Creative Commons and Standard-licensed models will be eligible for migration; other license types, such as the Editorial license, will not". Sketchfab Standard (free and paid) maps to Fab Standard at the "Personal" price tier. — [Sketchfab blog: Fab Publishing Portal open for Sketchfab migration](https://sketchfab.com/blogs/community/fab-publishing-portal-open-for-sketchfab-migration); [Epic Dev Docs: Migrating assets to Fab](https://dev.epicgames.com/documentation/fab/migrating-assets-to-fab)
- **Seat (Sec. 2.1):** "a nonexclusive, non-sublicensable, nontransferable, worldwide, revocable, paid, Single-Seat license". Sec. 1.13 adds: "only one identified user ... can access the Licensed Material ... If you wish to be granted a Multi-Seat license, please contact Licensor". — [Sketchfab License Agreement](https://sketchfab.com/licenses)
- **Extraction (Sec. 2.2(b)):** you agree not to "make available the Licensed Material as a stand-alone file ... or in a way that allows third parties to use, download, extract or access the Licensed Material as a stand-alone file (or group of files)". — [Sketchfab Licenses](https://sketchfab.com/licenses)
- **Intent (Sec. 2.2(h)):** not to "make the Licensed Material available in a manner intended to allow or invite a third party to download, extract, redistribute or access the Licensed Material as a stand-alone file". — [Sketchfab Licenses](https://sketchfab.com/licenses)
- **Weapons (Sec. 2.2(f)):** not to "directly or indirectly promote alcoholic beverages, tobacco, gambling, weapons or explosives with the Licensed Material". — [Sketchfab Licenses](https://sketchfab.com/licenses)
- **Website terms (Sec. 2.7):** "Licensee shall post terms and conditions on its permitted websites that prohibit, republication, retransmission, reproduction or other use of the Licensed Material as a stand-alone file (or group of files)." — [Sketchfab Licenses](https://sketchfab.com/licenses)
- **Editorial (Sec. 2.3):** may not be used for "commercial, promotional, endorsement, advertising or merchandising use", and only "to create a Licensee Work that comments on or criticizes" the subject matter or newsworthy events. — [Sketchfab Licenses](https://sketchfab.com/licenses)
- **Audit and penalty:**
  - Licensors and Sketchfab may audit, including free access to "any pay-walled ... platform".
  - Unauthorized use can trigger "a fee equal to up to 25 times the amounts paid".
  
  — [Sketchfab Licenses](https://sketchfab.com/licenses)
- **Plain-language FAQ:** "You may not use the 3D asset in a way that allows others to use or access the 3D asset as a stand-alone file". — [Sketchfab Licenses](https://sketchfab.com/licenses)
- **Babylon.js team view on Sketchfab models:** A Babylon.js team member (sebavan) said that even Sketchfab-hosted models can be pulled from the browser: "Yes, it is the beauty of the web as well as a limitation." — [Babylon.js forum: Keeping assets safe (on behalf of asset providers), Mar 2023](https://forum.babylonjs.com/t/keeping-assets-safe-on-behalf-of-asset-providers/39205)

### Inferences
- **(a) Non-native engine:** No engine restriction.
- **(b) Web delivery:** Allowed if assets are not offered as standalone files. The "intended to allow or invite" wording in 2.2(h) is a softer intent standard than 2.2(b). Do both:
  - do not expose raw files at stable URLs
  - post a ToS clause per 2.7
- **(c) Commercial use:** Allowed for Standard assets, but each license is single-seat, so a multi-artist team needs multi-seat terms from the licensor. Editorial assets are excluded from commercial games. Many realistic WW1 vehicles and weapons on Sketchfab carry Editorial labels because they depict trademarks or real brands. Re-check each model.
- **The 2.2(f) weapons clause:** A WW1 combat game "depicts" rather than "promotes" weapons, but the wording is broad. It is worth seller confirmation for weapon models specifically. This clause appears only in the legacy Sketchfab agreement; it is not in the Fab EULA text reviewed.

### Gaps
- It is unclear whether pre-Fab Sketchfab purchases are now administered under Fab terms or stay under the Sketchfab agreement. The Sketchfab license page is still live (copyright 2026). Assume the license in force at purchase applies.
- No current Sketchfab or Fab statement specifically about glTF web delivery of purchased models was found.

---

## 4. CGTrader Royalty Free and Editorial licenses

### Takeaway
CGTrader's Royalty Free license allows game use only as an "Incorporated Product":
- the asset must not be extractable and usable "as a stand-alone object without the use of reverse engineering tools or techniques"
- in games it must be "contained inside a proprietary format"
- buyers must "take all commercially reasonable measures to prevent the end user from gaining access"

Listed methods include a proprietary product format, a password-protected resource file, or encryption. There is no engine restriction. The license goes to the legal entity, with no seat count. Editorial products are for news or commentary only.

### Cited Findings
- **Definition 8, Incorporated Product:** "Product that cannot be extracted from an application or other product ... and used as a stand-alone object without the use of reverse engineering tools or techniques." — [CGTrader Terms and Conditions](https://www.cgtrader.com/pages/terms-and-conditions)
- **Sec. 21A.2, scope:** "The Buyer's license to Product in this paragraph is strictly limited to Incorporated Product." Approved uses include "as purchased by a game's creators as part of a game if the Product is contained inside a proprietary format and displays inside the game during play, but not for users to re-package as goods distributed or sold inside a virtual world". — [CGTrader T&C](https://www.cgtrader.com/pages/terms-and-conditions)
- **Sec. 21A.3, protection:** "If you use any Product in software products (such as video games, simulations, or VR-worlds) you must take all commercially reasonable measures to prevent the end user from gaining access to the Product. Methods of safeguarding the Product include but are not limited to:
  - using a proprietary disc format such as Xbox, Playstation, etc.;
  - using a proprietary Product format;
  - using a proprietary and/or password protected database or resource file that stores the Product data;
  - encrypting the Product data."
  
  — [CGTrader T&C](https://www.cgtrader.com/pages/terms-and-conditions)
- **Sec. 21A.2, platforms:** Virtual worlds, metaverses, and platforms may provide the Product to users for embedded content if "a) Product is not downloadable by users ... in the form in which it is downloaded from the Site and b) Product is not re-packaged as goods sold inside a virtual world". — [CGTrader T&C](https://www.cgtrader.com/pages/terms-and-conditions)
- **Sec. 21A.1:** Products may not be sold or given away "in the form it is downloaded from the Site". — [CGTrader T&C](https://www.cgtrader.com/pages/terms-and-conditions)
- **Sec. 20.5, licensee:** The license goes to the original Buyer. "if a Buyer is a legal entity, the license is granted to a legal entity and the Product might be shared within the legal entity." — [CGTrader T&C](https://www.cgtrader.com/pages/terms-and-conditions)
- **Sec. 22, Editorial:** Products marked "editorial" are only for "legitimate, editorial purposes ... journalistic, editorial, cultural or otherwise newsworthy value". — [CGTrader T&C](https://www.cgtrader.com/pages/terms-and-conditions), as summarized by the fetch tool
- **Sec. 23A, Custom License:** Predefined Custom License types limited by industry, use, time or scope exist for enterprise deals. — [CGTrader T&C](https://www.cgtrader.com/pages/terms-and-conditions)

### Inferences
- **(a) Non-native engine:** Allowed. No engine is named.
- **(b) Web delivery:** Allowed only if the asset is not delivered "in the form in which it is downloaded" and the team takes "commercially reasonable" protective steps.
  - CGTrader's own examples include "encrypting the Product data" and a "proprietary and/or password protected ... resource file".
  - A custom binary pack with per-build encryption of glTF payloads plausibly meets this "commercially reasonable" standard, even though a determined user can still capture data from GPU memory.
  - Serving a plain .glb does not meet the "proprietary format" example in 21A.2.
- **(c) Commercial use:** Allowed. Do **not** sell CGTrader-derived items as in-game goods or cosmetics. 21A.2 excludes "re-packag[ing] as goods distributed or sold inside a virtual world". The wording targets user re-packaging, but developer-sold cosmetics should be confirmed with the seller.
- **Editorial-tagged models:** Exclude them from a commercial game.

### Gaps
- No version or "last updated" date was found on the CGTrader terms page.
- The verbatim Sec. 22 Editorial text was summarized by the fetch tool, not reviewed line by line.
- Whether CGTrader treats "glTF + Draco/KTX2 + encryption" as compliant is not addressed anywhere public. Seller or CGTrader confirmation is advisable.

---

## 5. TurboSquid Standard 3D Model License (games, real-time, web)

### Takeaway
TurboSquid is the **most restrictive** for this project. The license (effective for use on or after Mar 16, 2023):
- explicitly allows "web applications" and web games
- requires models to be "contained in proprietary formats so that they cannot be opened or imported in a publicly available software application or framework"
- pre-approves only **WebGL exports from Unity, Unreal, and Lumberyard**
- prohibits "any other open format or format encrypted with decryptable open standards (such as an encrypted compression archive or other WebGL programs not listed here)"

A Babylon.js/glTF pipeline is **not pre-approved**. TurboSquid says other WebGL uses need **advance approval**, potentially conditioned on a non-standard format or substantial modification.

### Cited Findings
- **Sec. 7, games and web allowed:** "you may incorporate 3D Models in Creations of Computer Games, virtual worlds, simulation and training environments; mobile, desktop and web applications". — [TurboSquid 3D Model License (TurboSquid blog copy)](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Sec. 7.b, Access to 3D Models:** "You must take all reasonable and industry standard measures to incorporate 3D Models within Creations to prevent other parties from gaining access to 3D Models. 3D Models must be contained in proprietary formats so that they cannot be opened or imported in a publicly available software application or framework, or extracted without reverse engineering. WebGL exports from Unity, Unreal, and Lumberyard are permitted. Any other open format or format encrypted with decryptable open standards (such as an encrypted compression archive or other WebGL programs not listed here) are prohibited from using 3D Models. If your Creation uses WebGL and you are not sure if it qualifies, please contact us and describe your Creation in detail". — [TurboSquid license](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Sec. 7.c, Open Systems:** "You typically may NOT include 3D Models in Creations that have the general functionality for importing and/or exporting 3D Models." — [TurboSquid license](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **FAQ, browser games:** "TurboSquid allows using 3D Models in the following WebGL browser-based applications: Unity, Unreal, and Lumberyard. Others may be approved on a case by case basis." — [TurboSquid license FAQ](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **FAQ, other WebGL:** "TurboSquid allows content to be used in WebGL applications IF the customer/application converts the content from the DCC format to a JavaScript/other non-standard format prior to porting to the WebGL program, subject to the following guidelines: A) the format has no known reverse engineering methods and/or B) The textures and topology of the mesh have been modified in such a way to make it a substantially different product. These uses must be approved in advance by contacting us through email or our Support channels." — [TurboSquid license FAQ](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Allowed and prohibited game uses:**
  - Allowed: "Console, PC, web, mobile games; Virtual and augmented reality; Game mods; Closed MMOs and closed Virtual Worlds".
  - Prohibited: making 3D Models available to end users "in an open format that others can be downloaded".
  - Prohibited: open MMOs like Second Life. Closed MMOs like World of Warcraft are allowed.
  
  — [TurboSquid license FAQ](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Version:** "This 3D Model License is effective for use with 3D Models for use on or after March 16, 2023." Corporate and enterprise licenses are available through enterprise@turbosquid.com. Enterprise tiers carry higher indemnity, for example USD 1,000,000 aggregate. — [TurboSquid license](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Editorial (Sec. 4):** Use of depicted IP is limited to news reporting and academic teaching, scholarship, and research. — [TurboSquid license](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Community reading:** Forum users (jMonkeyEngine, Godot) read the "proprietary format" clause as a hurdle for open-format engines. — [jMonkeyEngine hub: TurboSquid license](https://hub.jmonkeyengine.org/t/turbosquid-lisence/33863); [Godot forums: using non-redistributable 3D models](https://godotforums.org/d/35949-using-non-redistributable-3d-models). Neither thread was fetched in full.

### Inferences
- **(a) Non-native engine:** Allowed for native builds where assets are packed. For web, only Unity/Unreal/Lumberyard WebGL exports are pre-approved.
- **(b) Web delivery with Babylon.js and glTF:** **Not permitted without TurboSquid's written approval.**
  - glTF/GLB is a publicly documented open format that opens in public software and frameworks (Blender, three.js, Babylon.js).
  - Draco and KTX2/Basis are also open, published standards with public decoders, so they do not make the payload "proprietary". This is an inference.
  - Encrypting glTF in the client may itself fall under "format encrypted with decryptable open standards (such as an encrypted compression archive ...)".
- **(c) Commercial use:** Allowed generally, but in practice the web-delivery hurdle dominates. For a WW1 web game, avoid TurboSquid assets unless you get approval in writing. Approval might be conditioned on a custom binary format, substantial modification of the mesh and textures, or both.

### Gaps
- The live license page (turbosquid.com/Licensing) returned 403/CAPTCHA, so I could not confirm whether a post-2023 revision exists. TurboSquid is now part of Shutterstock. Verify the current text.
- The TurboSquid license-tiers page ([blog.turbosquid.com/turbosquid-license-tiers](https://blog.turbosquid.com/turbosquid-license-tiers/)) was not fetched, so seat and team rules per tier were not checked.

---

## 6. ArtStation Marketplace Standard and Extended licenses

### Takeaway
ArtStation's Marketplace End User Agreement (Epic-owned; help article dated Aug 7, 2026) allows stock assets in "computer games".
- The **Standard Commercial** licence covers only **one commercial Work**, capped at **2,000 sales or 20,000 monthly views**.
- The **Extended Commercial** licence removes caps and covers any number of commercial works.

There is no engine restriction and no explicit technical-protection clause. You may not distribute the Product except as part of a Work. Sellers may override with a custom license. Epic announced the ArtStation Marketplace would migrate to Fab in 2025.

### Cited Findings
- **Default terms:** The agreement applies "unless a custom agreement or license is provided by the seller." — [ArtStation Marketplace End User Agreement](https://www.artstation.com/marketplace-product-eula)
- **Sec. 4(c), Stock Assets:** "you may copy, use, modify, adapt, translate, distribute, publicly display, transmit, broadcast, and create derivative works from the Product in works you create ('Works'), which may include things like films, videos, multi-media projects, computer games ...". You will not "distribute the Product except as part of a Work" or "publish, distribute or make available the Product through any online clearinghouse platform." — [ArtStation EUA](https://www.artstation.com/marketplace-product-eula)
- **Standard Commercial licence:** "respect to one commercial Work, with up to a maximum of, as applicable, 2,000 sales of the Work or 20,000 monthly views of the Work." — [ArtStation EUA](https://www.artstation.com/marketplace-product-eula); [ArtStation Help: EULA (Aug 7 2026)](https://help.artstation.com/en/articles/16155014-eula-end-user-license-agreements)
- **Extended Commercial licence:** "with respect to any number of commercial Works, with no limit on sales or views." — [ArtStation EUA](https://www.artstation.com/marketplace-product-eula)
- **Corporate use:** "If you are a corporate entity, you may make the Product available for use by your employees". External collaborators may receive the Product only for your Work and "must secure and limit access to the Product for that purpose". — [ArtStation EUA](https://www.artstation.com/marketplace-product-eula)
- **Sec. 5(d):** Except as expressly permitted, you will not "publish, sell distribute or otherwise make the Product available to others to use, download or copy". — [ArtStation EUA](https://www.artstation.com/marketplace-product-eula)
- **Migration:** "The ArtStation Marketplace will migrate to Fab in 2025", with a migration tool for sellers. — [Unreal Engine blog: Fab launches in October](https://www.unrealengine.com/blog/fab-content-marketplace-launches-in-october-publishing-portal-opens-today)

### Inferences
- **(a) Non-native engine:** Allowed. No engine is named.
- **(b) Web delivery:** Allowed as part of a Work. Sec. 5(d) argues for not exposing raw files that others can "download or copy", so the same pack-and-obfuscate approach applies.
- **(c) Commercial use:** For a F2P web multiplayer game, the Standard licence's "20,000 monthly views" or "2,000 sales" cap is ambiguous. It is unclear whether a free-to-play session counts as a "view" or whether IAP transactions count as "sales". **Buy Extended** for any asset that ships in the commercial game.
- **Where to buy:** If the asset is also on Fab, the Fab Standard license is clearer for games, with no unit caps.

### Gaps
- The current status of the ArtStation-to-Fab migration was not checked: which products have moved and whether ArtStation purchases are honored on Fab.
- No ArtStation guidance on what counts as a "view" for interactive works was found.

---

## 7. Synty Studios (Synty Store one-time purchase, SyntyPass subscription, changes 2024-2026)

### Takeaway
Synty's One-Time Purchase licence (current version "As at 9 July 2026") is **engine-agnostic**: "not limited by game engine, OS, platform or device". It covers any videogame, with **5 seats per licence** and perpetual rights. It has no explicit extraction or proprietary-format clause, but it bans sharing source files outside the team or "for re-use by third parties".

The **SyntyPass / Standard Subscription** licence is time-bound. After the subscription ends you may not use the assets in new work. You may only make minor bug fixes, and if "the Product is substantially developed, modified or improved you are required to have an active Subscription". That matters for a live-service multiplayer game. Synty revised its licences on 11 Sep 2024 (subscription), 6 Mar 2025, 13 Nov 2025, 3 Jun 2026 and 9 Jul 2026. Purchases made on the Unity Asset Store fall under Unity's EULA instead.

### Cited Findings
- **Engine scope:** "The licence is worldwide, and is not limited by game engine, OS, platform or device." — [Synty One-Time Purchase Licence & EULA (As at 9 July 2026)](https://syntystore.com/pages/end-user-licence-agreement)
- **Definitions:**
  - "Product means any videogame (which will always be covered by your licence)".
  - "Store means the Synty Store, Unreal Marketplace, or any other store where we offer Assets ... (excluding the Unity Asset Store)."
  
  — [Synty OTP Licence](https://syntystore.com/pages/end-user-licence-agreement)
- **Rights:** "to publish, distribute, transmit, broadcast, communicate, show and play the Asset as incorporated into those Products". — [Synty OTP Licence](https://syntystore.com/pages/end-user-licence-agreement)
- **Seats:** "each single licence purchase you make includes five seats for your Team. You must purchase enough licences to give you at least as many seats as there are people in your Team, taking the highest count at the time of purchase or any time afterwards." "Your Team" covers technical and creative roles and excludes producers, project managers, and audio-only staff. Humble Bundle purchases are "one seat only". — [Synty OTP Licence](https://syntystore.com/pages/end-user-licence-agreement)
- **Source files:** "You must not share the source files of any Assets outside your team ... You may not upload source files or models to third party services for the purpose of 3D model generation." — [Synty OTP Licence](https://syntystore.com/pages/end-user-licence-agreement)
- **Other restrictions:** "you must not distribute our Assets as stock images or stock art (2D or 3D) or otherwise share them for re-use by third parties." — [Synty OTP Licence](https://syntystore.com/pages/end-user-licence-agreement)
- **Prohibited products:** NFT/blockchain; "Creation of content for Metaverse-related and/or Game Creation Software and products"; generative-AI datasets, development, or model generation. — [Synty OTP Licence](https://syntystore.com/pages/end-user-licence-agreement)
- **Audits and transfer:**
  - Synty may audit team size, with 5 days' notice and at most once per 6 months.
  - The licence is transferable to an acquirer of the game with written notice.
  
  — [Synty OTP Licence](https://syntystore.com/pages/end-user-licence-agreement)
- **Two licence types:** "Standard Subscription Licence ... You are licensed for development using any assets available to you while your subscription plan is active." — [Synty Licences Overview](https://syntystore.com/pages/licences-overview)
- **Subscription Authorised Purpose (Cl. 1.3):** Covers "the creation and development of video games ...". It also covers "(b) the creation and development of user generated content within a game, platform, engine, or middleware". — [Synty Standard Subscription Licence](https://syntystore.com/pages/standard-subscription-licence)
- **Subscription grant (Cl. 6.1):** "While you have an active Subscription, we grant you and your Authorised Users a non-exclusive right to use our Assets for the Authorised Purpose". — [Synty Subscription Licence](https://syntystore.com/pages/standard-subscription-licence)
- **After expiry (Cl. 12.2-12.3):** "you must cease using our Assets in any new Intellectual Property ... created following the date of termination or expiry." You may make "minor bug fixes such as maintenance updates" if the Product is not substantially developed further, or if you are removing the assets. "If the Product is substantially developed, modified or improved you are required to have an active Subscription." — [Synty Subscription Licence](https://syntystore.com/pages/standard-subscription-licence)
- **Subscription seats (Cl. 2-3):** Seats must match Authorised Users. An Authorised User is anyone "engaged by you to interact with our Assets or the Product in some capacity within the last 30 days". — [Synty Subscription Licence](https://syntystore.com/pages/standard-subscription-licence)
- **Version history:**
  - One-time purchase: 7 Oct 2019, 11 Oct 2022, 4 Apr 2024, 13 Nov 2025, 3 Jun 2026, 9 Jul 2026.
  - Subscription: 11 Sep 2024, 6 Mar 2025, 3 Jun 2026, 9 Jul 2026.
  
  — [Synty EULA Version History](https://syntystore.com/pages/eula-versions-history)

### Inferences
- **(a) Non-native engine:** Explicitly allowed.
- **(b) Web delivery:** Allowed. There is no proprietary-format requirement. The "do not share ... for re-use by third parties" and source-file clauses still argue against shipping raw FBX/GLB at public URLs. Packed, non-source runtime data is the safer reading.
- **(c) Commercial use:** Allowed, with no revenue thresholds.
  - **Prefer one-time purchases** over SyntyPass for a long-lived live-service game. The subscription requires staying subscribed for as long as the game is "substantially developed".
  - Count seats against peak team size, including contractors.
- **Modding and UGC:** If the WW1 game ships a map editor or modding tools, the one-time licence's "Game Creation Software" prohibition may be triggered. Contact Synty. The subscription licence, by contrast, explicitly allows UGC "within a game".
- **Fit for this project:** Synty's low-poly stylized art may not suit a "realistic" WW1 aesthetic. This is out of licensing scope but relevant to choosing a vendor.

### Gaps
- The diffs between the 13 Nov 2025, 3 Jun 2026, and 9 Jul 2026 versions were not compared.
- The SyntyPass product page and pricing were not reviewed.

---

## 8. Reallusion (Character Creator, iClone, ActorCore) content export licenses

### Takeaway
Since the **Aug 1, 2025** license update, Reallusion's **Standard License** allows exporting store content "to any external software or game engine" and using it in "game titles". The cheaper **iContent** license is render-only and gives no export rights.

The Content EULA (updated Aug 1, 2025) contains the same strict clause as TurboSquid. It requires 3D models to be "contained in proprietary formats so that they cannot be opened or imported into a publicly available software application". It also bans using content "as purchasable in-software content or downloadable paid content", which rules out selling Reallusion-derived cosmetics or DLC. A broad bullet, "As embedded content within applications or online services", is ambiguous and should be cleared with Reallusion.

### Cited Findings
- **License Update (2025.8.1):** "With this single license, creators can now freely export content to external tools and engines such as Unreal Engine, Unity, Blender, Maya, and more." The Standard License grants the right to "Export content to any external software or game engine" and "For mass distribution in final image/video outputs, game titles, or AR/VR projects". — [Reallusion Content License Policy](https://www.reallusion.com/license/content.html)
- **iContent:** iContent is "restricted to in-app use and can only be exported as rendered images or videos—not as 3D files compatible with third-party software". It is priced at 30% of Standard. — [Reallusion Content License Policy](https://www.reallusion.com/license/content.html)
- **Restriction on special uses:** "Licensed content or derivatives thereof may not be used for in-app purchases." — [Reallusion Content License Policy](https://www.reallusion.com/license/content.html)
- **Sec. 2.1(B), Content EULA:** "You may use the Content to copy, adapt, and incorporate it into your own creations, and your resulting creations are granted full ownership and usage rights to provide, sell, and redistribute those creations for use in commercial games, AR/VR projects and interactive services." — [Reallusion Content EULA (Updated Aug 1, 2025)](https://www.reallusion.com/Content/EULA/EULA.htm)
- **Redistribution and prohibited scenarios:**
  - "(B) Redistribution. You may NOT import, upload, reproduce, make available, publish, transmit, distribute, or sublicense the Content to any third party."
  - "(C) You may NOT use the Content or any Derivative Content in the following scenarios or applications: 1. As purchasable in-software content or downloadable paid content. 2. For online or in-software character generation. 3. In character generation APIs ... 4. As embedded content within applications or online services. 5. For machine learning, AI training ...".
  
  — [Reallusion Content EULA](https://www.reallusion.com/Content/EULA/EULA.htm)
- **Sec. 6.3:** "Member shall take all reasonable and industry-standard measures to incorporate 3D Models within your creations to prevent other parties from gaining access to such 3D Models. Member shall make sure that the 3D Models must be contained in proprietary formats so that they cannot be opened or imported into a publicly available software application." — [Reallusion Content EULA](https://www.reallusion.com/Content/EULA/EULA.htm)
- **One-Year Plan (Sec. 3.2):** If the plan lapses, proprietary-format project files revert to DRM-locked Trial Content. Per Sec. 3.1, output works created during the plan keep commercial rights. — [Reallusion Content EULA](https://www.reallusion.com/Content/EULA/EULA.htm)
- **Workgroup:** Content is "locked to the same purchase account". Workgroup Accounts exist for studios. — [Reallusion Content EULA](https://www.reallusion.com/Content/EULA/EULA.htm)
- **Conflicting text on the policy page:** The FAQ on the same page still describes an "Extended License" for CC Components. "for use in commercial games ... one Standard License only grants outputs for one single character". This is legacy text that conflicts with the Aug 2025 summary, which says Standard now covers unlimited characters from CC Components. — [Reallusion Content License Policy](https://www.reallusion.com/license/content.html)

### Inferences
- **(a) Non-native engine:** Allowed under the Standard License (post-Aug 2025). Do not buy iContent.
- **(b) Web delivery:** Problematic, for the same reason as TurboSquid. Sec. 6.3's "proprietary formats so that they cannot be opened or imported into a publicly available software application" is hard to meet with glTF in a browser. Clause (C)4, "embedded content within applications or online services", could be read against an online game. It probably targets embedding the asset library, but it is ambiguous. **Get written confirmation or an Enterprise license** before shipping Reallusion characters or ActorCore motions in a web game.
- **(c) Commercial use:** Games are allowed. **Do not** sell Reallusion-derived items as IAP or DLC: (C)1 and the "may not be used for in-app purchases" note.
- **Mocap animations:** ActorCore motions are "Content" under the same EULA, as defined in Sec. 1.5. Animation clips baked into glTF are equally exposed.

### Gaps
- No Reallusion statement on WebGL/glTF browser delivery was found.
- It is unresolved whether (C)4 is meant to cover online multiplayer games.
- The internal inconsistency on the policy page between the Aug 2025 update and the legacy FAQ should be resolved with Reallusion sales or licensing.

---

## 9. Mixamo, Poly Haven (CC0), ambientCG (CC0), Adobe Substance 3D Assets

### Takeaway
- **Poly Haven** and **ambientCG** are **CC0**. They have no restrictions on engine, web delivery, or redistribution; ambientCG explicitly allows including raw files in a game. These are the safest choices for web delivery.
- **Mixamo:** characters and animations are royalty-free for commercial video games.
- **Adobe Substance 3D Assets** (Additional Terms, March 22, 2022 version): use is allowed only inside a "Larger Work" or "Modified Work". You must not allow third parties to "use, download, extract, or access" an asset "on a stand-alone basis". Downloaded and paid assets remain usable after the subscription ends.

### Cited Findings
- **Poly Haven:** "Our assets are all licensed as CC0". "You can use our assets for any purpose, including commercial work. You do not need to give credit ... You can redistribute them, share them around, include them when sharing your own work, or even in a product you sell." — [Poly Haven License](https://polyhaven.com/license)
- **ambientCG:** "All ambientCG assets are provided under the Creative Commons CC0 1.0 Universal License." "You can include the raw files in your project, for example a video game." — [ambientCG License](https://docs.ambientcg.com/license/)
- **Mixamo:** "You can use both characters and animations royalty free for personal, commercial, and non-profit projects including: ... Create video games." Mixamo is free with an Adobe ID. — [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)
- **Substance 3D Assets, version:** "Effective as of March 22, 2022. Replaces all prior versions." — [Adobe Substance 3D Assets Additional Terms](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe-Substance-3D-Assets-Addl-Terms-en_US-20220322.pdf)
- **Substance 3D Assets, definitions:**
  - "Larger Work" is "a new work of authorship created that incorporates an unmodified Substance 3D Asset".
  - "Modified Work" is "a new work of authorship created, at least in part, by modifying a Substance 3D Asset".
  
  — [Adobe Substance 3D Assets Additional Terms](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe-Substance-3D-Assets-Addl-Terms-en_US-20220322.pdf)
- **Substance 3D Assets, Sec. 3.1(B):** You must not "use the Substance 3D Asset(s) in any way that allows a third party to use, download, extract, or access the Substance 3D Asset(s) on a stand-alone basis". Sec. 3.2: you may distribute only within a Modified or Larger Work if that work would qualify as original without the asset and "the primary value ... does not lie with the Substance 3D Asset(s) itself". — [Adobe Substance 3D Assets Additional Terms](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe-Substance-3D-Assets-Addl-Terms-en_US-20220322.pdf)
- **Substance 3D Assets, Sec. 3.3:** No use to "create, train, test, or otherwise improve any machine learning algorithms". — [Adobe Substance 3D Assets Additional Terms](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe-Substance-3D-Assets-Addl-Terms-en_US-20220322.pdf)
- **Substance 3D Assets, Sec. 4:** "you may continue to use any Substance 3D Asset(s) that were downloaded and paid for prior to termination of your subscription". Unused Credits are forfeited. — [Adobe Substance 3D Assets Additional Terms](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Adobe-Substance-3D-Assets-Addl-Terms-en_US-20220322.pdf)
- **Community guidance (Adobe Community):** Substance 3D Assets can be used commercially in video games as part of a larger or modified work. When reselling textured models, the original .sbsar or square texture should not be recoverable from the distributed files, so texture "on the asset's UVs instead". — [Adobe Community: Selling 3D models with Substance textures](https://community.adobe.com/t5/substance-3d-assets-and-community-assets/selling-a-3d-models-with-substance-textures/m-p/14418457/highlight/true); [Adobe Community: Commercial use of 3D asset library](https://community.adobe.com/t5/substance-3d-assets-and-community-assets/commercial-use-of-3d-asset-library/td-p/12774162). These are search summaries; the threads were not fetched in full.

### Inferences
- **CC0 (Poly Haven, ambientCG):** (a), (b) and (c) are all unrestricted. Raw GLB and KTX2 at public URLs is fine. They are the lowest-risk source for terrain, mud, wood, metal, and sky HDRIs for a WW1 setting.
- **Mixamo:** (a), (b) and (c) are fine for games. The FAQ text fetched does not address standalone redistribution of the FBX characters or animations. Treat them like other stock content and do not offer them as downloadable files. Adobe's General Terms govern the details.
- **Substance 3D Assets:** (a) and (c) are fine. For (b), seamless tiling materials shipped to a browser as standalone KTX2/PNG textures are arguably "accessible on a stand-alone basis". Mitigations:
  - bake them into model-specific UV-space textures, or modify them (Modified Work)
  - pack them in a container rather than serving the original material maps as files
- **CC-BY assets (e.g., some Fab or Sketchfab free models):** Attribution is required, and Fab's Sec. 6(a) bars mixing with CC-BY-SA. The CC BY 4.0 legal code also bars applying "Effective Technological Measures" that restrict recipients' licensed rights ([CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode)). Encrypting CC-BY assets is therefore unnecessary and possibly inconsistent with the license. The CC BY 4.0 point is an inference from the license text and was not fetched in this session.

### Gaps
- I could not confirm whether Adobe has replaced the March 2022 Substance 3D Assets Additional Terms with a newer version. A June 2021 version also exists.
- The Mixamo FAQ fetched does not contain explicit redistribution or extraction language, and Adobe's General Terms were not reviewed.

---

## 10. Practical guidance: what "reasonable measures" look like for web games, plus community and legal commentary

### Takeaway
Every expert source agrees that anything rendered in a browser can be captured. Babylon.js team members and a Khronos glTF contributor both say so, so no web technique is "unextractable". Licenses fall into three groups:
1. **No specific technical standard:** Fab, Unity, Sketchfab, ArtStation, Synty, Adobe. The obligation is not to offer standalone files and to "restrict" or prevent extraction.
2. **"Commercially reasonable" with examples:** CGTrader names encryption, proprietary resource files, and proprietary formats.
3. **Explicitly bans open formats:** TurboSquid (pre-approves only Unity/Unreal/Lumberyard WebGL) and Reallusion. These require written approval for a Babylon.js/glTF pipeline.

A defensible web posture combines legal controls (ToS) with friction-adding technical controls. CC0 and CC-BY content can be served raw.

### Cited Findings
- **Babylon.js team (sebavan), 2023:** "As soon as it is on the web or even rendered on your machine, the asset is out there ... You can make it harder and more confusing but not really much more." The thread began with a buyer of Polyperfect assets, whose license required assets to be "safely stored within your product". They asked whether Firebase Storage with temporary keys qualifies. — [Babylon.js forum: Keeping assets safe (on behalf of asset providers)](https://forum.babylonjs.com/t/keeping-assets-safe-on-behalf-of-asset-providers/39205)
- **Same thread, other suggestions:**
  - Download encrypted assets and decrypt them client-side with keys delivered separately (forum user "Charge").
  - The only true protection is server-side rendering with a streamed video feed (user "echadwick-artist"): "As soon as you ask the client hardware to render the 3D asset ... it's interceptable".
  
  — [Babylon.js forum thread](https://forum.babylonjs.com/t/keeping-assets-safe-on-behalf-of-asset-providers/39205)
- **Khronos (Don McCurdy, glTF contributor), 2020:** "if you display a 3D model in a user's web browser, then a determined user will always be able to download that 3D data". Encryption and obfuscation raise difficulty only. Another participant argued DRM is "not glTF's responsibility", though third-party encryption wrappers are acceptable. — [Khronos Community: Asset protection for glTF](https://community.khronos.org/t/asset-protection-for-gltf/106080)
- **Other Babylon.js threads:** These discuss obfuscation (custom formats, converting GLB to obfuscated strings), server-side download controls, and relying on copyright law. — [Protecting 3D models](https://forum.babylonjs.com/t/protecting-3d-models/49835); [Hide or block the download of source 3D object](https://forum.babylonjs.com/t/hide-or-block-the-download-of-source-3d-object/207); [Hiding model files and babylonjs code on a website](https://forum.babylonjs.com/t/hiding-model-files-and-babylonjs-code-on-a-website/29533). These came from search summaries; the threads were not fetched individually.
  - One summary claims the .babylon format is "binary" and only Babylon can open it. **This is doubtful.** .babylon scene files are JSON-based. The claim should not be relied on.
- **License examples of "reasonable" methods:** CGTrader lists "using a proprietary Product format", "a proprietary and/or password protected database or resource file", and "encrypting the Product data". — [CGTrader T&C 21A.3](https://www.cgtrader.com/pages/terms-and-conditions)
- **TurboSquid limits on encryption:** TurboSquid expressly rejects "format encrypted with decryptable open standards (such as an encrypted compression archive ...)". Other WebGL needs a "JavaScript/other non-standard format" with "no known reverse engineering methods" and/or substantial modification, approved in advance. — [TurboSquid license and FAQ](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Engine exports:** TurboSquid notes that "Most game engines, such as Unity and Unreal, handle this automatically". That is, their packed asset bundles are the benchmark. — [TurboSquid license FAQ](https://blog.turbosquid.com/turbosquid-3d-model-license/)
- **Sketchfab terms requirement:** The licensee must post website terms prohibiting standalone reuse. — [Sketchfab Licenses Sec. 2.7](https://sketchfab.com/licenses)

### Inferences
**Recommended "reasonable measures" stack for a Babylon.js/glTF web game.** This is a synthesis, not a legal standard; only the CGTrader examples are explicitly endorsed by a license.
1. Do not host original vendor files (FBX, .blend, source textures, .sbsar) anywhere publicly reachable. Ship only runtime-converted, optimized derivatives.
2. Pack runtime assets into a custom container instead of discrete .glb/.ktx2 URLs. Examples:
   - a custom binary pack with an index, mesh buffers, and textures
   - non-standard extension names or a header so that Blender and public glTF viewers cannot open the files directly
   
   Babylon.js can load glTF from in-memory ArrayBuffers or Blobs, so loading from a pack is feasible ([Babylon.js forum: Load GLTF from ArrayBuffer or Blob](https://forum.babylonjs.com/t/load-gltf-from-arraybuffer-or-blob/2163)).
3. Encrypt or obfuscate the pack with per-build keys, decrypted in a worker. This meets CGTrader's examples. It does **not** meet TurboSquid's or Reallusion's "proprietary format" standard on its own.
4. Compress with Draco, Meshopt, or KTX2/Basis for performance. Treat this as **minor friction only**: these are open standards with public decoders, so they do not make data "proprietary". This is an inference.
5. Serve assets only to authenticated game sessions, using signed and short-lived URLs on the CDN with Referer/Origin checks and rate limits. This adds friction against bulk scraping.
6. Add legal controls:
   - a game EULA/ToS forbidding extraction and ripping, also required by Sketchfab 2.7
   - asset attribution and credits where required (CC-BY)
   - an internal license register mapping every shipped asset to its source, license version, tier, and seat count
7. Avoid in-game export features, level editors that export meshes, and modding SDKs that expose licensed assets. These are barred by Fab 6(b)(iii), TurboSquid 7.c, Synty's one-time "Game Creation Software" clause, and Unity 2.2.1.1(c) for UGC monetization.
8. Sort sources into tiers for the WW1 project:
   - **Tier A (safest):** CC0 (Poly Haven, ambientCG), in-house or commissioned assets with a work-for-hire buyout, Fab Standard, Unity Asset Store, Synty one-time purchase.
   - **Tier B (OK with care):** CGTrader Royalty Free (with encryption/packing), ArtStation Extended, legacy Sketchfab Standard (single-seat; weapons-promotion clause), Adobe Substance 3D Assets (bake or modify textures).
   - **Tier C (written approval first):** TurboSquid, Reallusion/ActorCore, any Editorial-tagged asset (unusable), and legacy UE-Only Megascans (unusable outside Unreal).

**Cross-marketplace summary matrix** (synthesis of Sections 1 to 9):

| Marketplace / license | (a) Non-native engine | (b) Web, client-delivered | (c) Commercial F2P/paid | Protection obligation | Seats / thresholds |
|---|---|---|---|---|---|
| Fab Standard (Personal/Pro) | Yes | Yes ("available on a network") | Yes | Use "solely as incorporated ... in object code"; "must restrict end users from extracting" | Pro if >USD 100k digital-content revenue in 12 mo (incl. funds raised); no content seat cap |
| Fab Personal - Reference Only | No source files | n/a | n/a | n/a | Same revenue test |
| Legacy Epic Content License, UE-plan Megascans | **No (UE-Only)** | n/a | n/a | n/a | n/a |
| Unity Asset Store (std EULA) | Yes (Unity support, 2025) | Yes | Yes, IAP allowed | No standalone redistribution; users must not extract raw files (support article) | Extension assets: 1 seat / 2 PCs |
| Sketchfab Store (legacy) Standard | Yes | Yes, no standalone access | Yes | No standalone access/extraction; post ToS; no "promote weapons" | **Single-seat** |
| Sketchfab / CGTrader / TurboSquid Editorial | n/a | n/a | **No** | n/a | n/a |
| CGTrader Royalty Free | Yes | Yes, if protected | Yes; no reselling as in-world goods | "Commercially reasonable measures"; proprietary format/encryption examples | Licensed to legal entity |
| TurboSquid Standard | Yes (native) | **Only Unity/Unreal/Lumberyard WebGL pre-approved; others need advance approval** | Yes | "Proprietary formats" not openable in public software; no open or decryptable-standard encrypted formats | Enterprise tiers via sales |
| ArtStation Standard Commercial | Yes | Yes | **1 Work; 2,000 sales or 20,000 monthly views** | No distribution except as part of a Work | Corporate employees OK |
| ArtStation Extended Commercial | Yes | Yes | Yes, unlimited | Same | Same |
| Synty one-time purchase | Yes (explicit) | Yes | Yes; no Game Creation Software, NFT, or AI uses | No source sharing or third-party reuse | 5 seats per licence |
| SyntyPass subscription | Yes | Yes | Yes, but active sub needed while developing | Same | Seats = Authorised Users (30-day window) |
| Reallusion Standard (2025-08) | Yes | **Unclear; proprietary-format clause; "embedded content ... online services" bullet** | Yes; **no IAP/DLC** | "Proprietary formats ... cannot be opened or imported" | Account-locked; Workgroup |
| Mixamo | Yes | Yes | Yes | Not specified in FAQ | n/a |
| Poly Haven / ambientCG (CC0) | Yes | Yes (raw files OK) | Yes | None | None |
| Adobe Substance 3D Assets | Yes | Yes, inside a Larger or Modified Work | Yes | No standalone use, download, extract, or access | Subscription credits; perpetual for downloaded assets |

### Gaps
- No court decision or regulator guidance was found on what "reasonable measures" means for WebGL games. All guidance is community or vendor opinion.
- No marketplace other than TurboSquid publicly addresses glTF/Babylon.js or three.js specifically.
- A lawyer review is advisable for:
  - the Fab "object code" and "restrict extraction" language as applied to glTF
  - TurboSquid and Reallusion web use, where written vendor approval is needed
  - the Sketchfab weapons-promotion clause for a WW1 combat game
  - ArtStation Standard "views" caps for F2P
  - Synty's "Game Creation Software" prohibition if the game ships modding or map tools
- Reddit r/gamedev and three.js forum threads on this exact question were not found or fetched in this session.
