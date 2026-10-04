# SFX licensing, WW1 archival audio, commissioning, and web delivery

Scope note: research done 2026-10-03. This is not legal advice. Quotes are verbatim from the primary pages unless marked. Pages fetched with curl and stripped to text: A Sound Effect, Pro Sound Effects (PSE), Soundsnap, Splice, Envato Elements (via the Zendesk article API), AudioJungle, Unity, GameDev Market, Sonniss standard license, Sound Ideas FAQ, Freesound FAQ, IWM, Gallica. The Soundly license PDF was converted with pdftotext, so some word spacing in the PDF was lost and has been restored in the quotes. Some quotes came through a summarizing fetch tool and may be lightly paraphrased: BOOM Library EULA, Sonniss GDC bundle license, Epidemic, and some Babylon/caniuse items. Those are flagged **[via fetch summary]** and should be re-checked against the live page before relying on them. Fab quotes are reused from the project's earlier [asset licensing notes](../assets/licensing.md), which got the Oct 1, 2024 Fab EULA through a reader proxy because fab.com returns 403 to fetchers.

Framing: every audio file is downloaded to the player's browser. Whatever encoding we use (Ogg/WebM Opus, AAC), the decoded audio can always be captured from the Web Audio output. No license reviewed demands that capture be impossible. The usual wording is "not allow/permit/invite extraction", "embedded", or "due diligence/strict safeguards".

## 1. Vendor license terms as they apply to a commercial browser MMO

### Takeaway

Every major vendor allows its sounds in a commercial video game, and web or online distribution is covered either explicitly or as "distribution" of the end product. The real differences are in five areas:

- **Protection:** whether they require you to stop end users extracting files. Sound Ideas, PSE, Envato/AudioJungle, Unity, Fab, Soundsnap and GameDev Market all require this, and PSE and Sound Ideas are the strictest.
- **Subscription rules:** whether rights survive after you stop paying. This matters for a live game that keeps shipping updates. Soundly, Envato Elements and PSE subscriptions are problematic. Soundsnap and Splice are perpetual.
- **Seats:** the per-seat or "sole editor" rules.
- **User-generated content:** bans on "authoring tools", "build it yourself" or "end-user customization" apps. These matter if we ship a map editor.
- **AI training:** near-universal bans, which match our existing policy.

Best fits for a solo developer: one-time-purchase libraries from Sonniss, A Sound Effect, BOOM or GameDev Market, plus Soundsnap and Splice (perpetual), plus Freesound CC0. PSE (sync-only wording and a custom "application" license), Soundly/Epidemic (version-locked after the subscription ends), and Envato Elements (End Product must be completed while subscribed, plus a ban on customization apps) each need written clarification or should be avoided for core game audio.

### Cited Findings

#### Summary matrix (detail and quotes below)

| Vendor | Game use | Web/online | Protection / anti-extraction duty | Seats | Revenue tiers | AI/ML ban | After subscription / termination | UGC / tools |
|---|---|---|---|---|---|---|---|---|
| A Sound Effect (standard EULA) | Yes ("video games") | Yes ("websites") | Implicit (only "incorporated in and synchronized"); no technical duty stated | Per workstation per license | None | Yes | Perpetual; auto-terminates on breach | Bans "media authoring tools", "soundboards" |
| BOOM Library | Yes | Yes | No explicit encryption clause [via fetch summary] | Single user = one individual; team/enterprise by quote | None found | Yes | Auto-terminates on material breach; 14-day delete; finished productions survive | Bans "real-time audio tool" embedding |
| Sonniss (standard and GDC bundle) | Yes ("games ... interactive") | Yes | None explicit; "synchronized within Licensee's project" | "Sole editor" or multi-user license | None | Yes | Lifetime; auto-terminates on breach | Not addressed |
| Pro Sound Effects (individual) | Ambiguous: "synchronized" only; asynchronous use needs a "Custom Application License" | Yes, but no standalone files on websites | **Strictest**: "due diligence and maintain strict safeguards" | One person; a 2nd person or computer needs Multi-User | None | Yes ("Audio Research") | Subscription: no new Productions after term; 15x liquidated damages; audits | Custom license |
| Soundsnap | Yes ("video games, applications, software") | Yes | "not ... in a manner that allows the Sound to be extracted" | Not addressed | None | Yes, unless written permission | **Perpetual for downloaded sounds** | Not addressed |
| Soundly (Epidemic-integrated) | Yes, but only versions made during the term | Yes ("in apps") | No standalone access | One legal entity | Must buy Enterprise above USD 10M (USD 5M for publishers/agencies) | Yes ("third party AI tool") | **New major versions after the term must drop the sounds** | Bans "digital templates or other applications enabling end users to synchronize" |
| Splice | Yes ("video games") | Yes | Not stated; no distribution except "as incorporated" | Not stated | None | Yes | Perpetual right | Not addressed |
| Epidemic Sound | Only on API Scale/Enterprise plans for games (own page); a reseller's copy of the end-user terms bans video games | n/a | n/a | n/a | Plan-based | n/a | Subscription-tied | n/a |
| Envato Elements | Yes, per project | Yes | "must not permit an end user to extract" | Individuals/Teams subscriptions | n/a (Enterprise by contact) | (AI tools governed separately) | **License valid only if End Product completed during the subscription** | Bans "build it yourself" customization apps |
| AudioJungle SFX Single/Multi | Yes ("apps, games ... websites") | Yes | "must not permit an end user to extract" | Licensee = you or your entity | None | Not stated | Perpetual; terminates on unremedied breach | Bans "build it yourself" apps |
| Unity Asset Store | Yes | Yes | Official support guidance: no extraction of raw files | No seats for content | None | Yes | Perpetual | Monetizing in UGC-primary products needs authorization |
| Fab Standard | Yes | Yes ("available on a network") | "must restrict end users from extracting" | No seat count for content | Personal tier eligibility: USD 100k revenue in last 12 months | Only for "NoAI"-tagged content | Perpetual | Exposing assets in a level editor is risky (Sec. 6(b)(iii)) |
| GameDev Market | Yes | Yes | Must not "allow ... extract" | None | None | Not stated | Perpetual | Not addressed |
| Sound Ideas / Hollywood Edge | Yes | Yes (playback only) | **"embedded in the code ... not available ... to access or download"** | Multi-user licenses sold separately | None found | Separate AI licensing offered | n/a | Supplemental license if users can access sounds |
| Freesound | CC0/CC-BY yes; CC-BY-NC no | Yes | CC-BY: must not apply DRM that restricts the licence | n/a | n/a | CC terms plus uploader Gen-AI preferences (July 2026) | n/a | n/a |
| itch.io | Per creator | Per creator | Per creator | Per creator | Per creator | Per creator | Per creator | Per creator |

#### A Sound Effect (marketplace EULA, covers per-creator libraries "unless explicitly stated")

- Scope: "This End-User License Agreement covers all Sound Library purchases made through A Sound Effect, unless explicitly stated". The license is between the buyer and "the creator, or creators" of the library, with ASE as "Distributor". No version date is shown. — [ASE License Agreement](https://www.asoundeffect.com/license-agreement/)
- Grant: "worldwide, non-exclusive, perpetual, royalty-free license(s)". — [ASE](https://www.asoundeffect.com/license-agreement/)
- Seats: "install and use the Sound Libraries on as many of the Licensee's workstations at a time as the number of licenses to the Sound Libraries that the Licensee has purchased". — [ASE](https://www.asoundeffect.com/license-agreement/)
- Games and web: "distribute and publicly perform reproductions of the Sounds, where these are incorporated in and synchronized with other media productions, which shall mean products that contains at least one additional media element to the Sounds (music, voice, image, etc.), including but not limited to radio and television broadcasts, film, music compositions, websites, podcasts, mobile apps, advertising, multi-media presentations, video games and similar." — [ASE](https://www.asoundeffect.com/license-agreement/)
- Restrictions on tools and UGC: "not permitted to distribute or perform reproductions of the Sounds where these are not incorporated in and synchronized with other media productions, including but not limited to in toys, product design, greeting cards, ringtones, applications such as soundboards, hardware devices, media authoring tools etc." — [ASE](https://www.asoundeffect.com/license-agreement/)
- Modification: "the Licensee is prohibited from adapting, modifying or repackaging any Sounds, except as permitted in Clause 2.b". So modification and layering are allowed only as part of a synchronized production. — [ASE](https://www.asoundeffect.com/license-agreement/)
- AI: may not be used "for the purpose of training, improving, or developing any Neural Networks (NN), Artificial Intelligence (AI) or Machine Learning (ML) models or algorithms, whether for commercial or non-commercial use." The same clause bans use in "Any library" and in products that are "primarily a sound product" (at least 50% pure SFX). — [ASE](https://www.asoundeffect.com/license-agreement/)
- Termination: "will automatically terminate in the event of any breach ... the Licensee shall delete or destroy all copies". — [ASE](https://www.asoundeffect.com/license-agreement/)
- Custom licenses: "If you have any doubts or if you're looking to include our Sound Libraries in ways that are mentioned in the Restrictions, please get in touch with us. We're here to discuss the possibility of obtaining a custom license". — [ASE](https://www.asoundeffect.com/license-agreement/)

#### BOOM Library EULA [via fetch summary; re-verify]

- Single user: "This license is granted to one individual only." Multi-user/Enterprise: "The CONTENT may be accessed by the specific number of AUDIO USERS (employees or contractors) designated at the time of purchase." No revenue or company-size thresholds were found. — [BOOM Terms & Conditions/EULA](https://www.boomlibrary.com/?p=480427)
- Media grant lists "video games", "websites", "AR/VR experiences" and more, worldwide, royalty-free, no attribution. — [BOOM EULA](https://www.boomlibrary.com/?p=480427); search summary
- Tool ban: "You may not embed or include the CONTENT in any software, application, or hardware where it functions as a real-time audio tool, effect, or processor (e.g., Impulse Responses used in convolution reverbs)." — [BOOM EULA](https://www.boomlibrary.com/?p=480427)
- Redistribution: bans "Reselling, trading, or sharing raw or processed files" and inclusion "in any sample library, virtual instrument, or 'stem' pack where the CONTENT is the primary value". Products where content is ">50% of the total time" are also banned. The summarizer found **no explicit encryption/anti-extraction requirement**. — [BOOM EULA](https://www.boomlibrary.com/?p=480427)
- AI: bans "Developing or training Neural Networks, Artificial Intelligence, or Machine Learning models." — [BOOM EULA](https://www.boomlibrary.com/?p=480427)
- Modification: "derivatives of licensed audio files...either by mixing, editing, processing or any other means remain bound by the terms." — [BOOM EULA](https://www.boomlibrary.com/?p=480427)
- Termination: "terminates automatically upon any material breach ... all rights to use, access, or store raw or unsynchronized CONTENT cease immediately, and the Licensee/CUSTOMER shall, within fourteen (14) days, delete all copies." Finalized productions keep their rights unless the breach was in them. — [BOOM EULA](https://www.boomlibrary.com/?p=480427)
- The site uses "digital fingerprinting and online monitoring". Enterprise licensing offers "∞ Seats" and is quote-based. — search summary of BOOM EULA; [BOOM Volume & Team Licensing](https://www.boomlibrary.com/support/enterprise-licensing/)
- The product page says "products are only available for commercial customers". — [BOOM World War I Firearms](https://www.boomlibrary.com/sound-effects/world-war-i-firearms/) [via fetch summary]

#### Sonniss: standard store license and GDC Game Audio Bundle

- Standard license (sonniss.com/license, verbatim):
  - "Licensee may use the licensed sound effects on an unlimited number of projects for the entirety of their life time."
  - "for the purposes of synchronization with audio and visual projects ... games, films, television & interactive projects."
  - "may distribute and publicly perform a reproduction ... as long as they are synchronized within Licensee's project."
  - "may re-record, edit, duplicate and release the licensed sound effects as part of yours or your clients' production". — [Sonniss License](https://sonniss.com/license)
- Seats: "Licensee must be the sole editor, otherwise a multi-user license will be required." Also: "This license does not allow you to upload the sound effects to a network-drive, server or make copies available to other unlicensed users." — [Sonniss License](https://sonniss.com/license). Team licensing is "seat-based pricing", quote-based. — [Sonniss Studio Licensing](https://sonniss.com/studio-sound-effects-licensing/)
- Restrictions: "may not sell any of the sound effects libraries or contents ... for the purposes of commercial gain. (Although the sound effects may be sold as incorporated into licensee project)". "may not transfer, assign, share or sub-lease". — [Sonniss License](https://sonniss.com/license)
- AI: "expressly prohibited from using any sound effects licensed under this Agreement for the purpose of training artificial intelligence technologies." — [Sonniss License](https://sonniss.com/license)
- Termination: "will automatically terminate in the event of any breach ... upon written demand ... immediately destroy all copies". — [Sonniss License](https://sonniss.com/license)
- No anti-extraction or encryption clause appears in the Sonniss standard text.
- GDC bundle license, "Version 2.0, Effective 27 August 2026" [via fetch summary]. It uses the same core wording: "games, films, television & interactive projects"; "may not sell any of the sound effects as they come", "Although the sound effects may be sold as incorporated into licensee project"; "may not distribute, publish, sub-license or otherwise supply the sound effects as sound effects to any other person"; AI training "expressly prohibited". — [Sonniss GDC Bundle License](https://sonniss.com/gdc-bundle-license)

#### Pro Sound Effects: Individual EULA, "Last Updated October 2024"

- Users: "Individuals and single (i.e. one (1)) person entities may enter into this Agreement ... Any use of the Licensed Audio Content by multiple individuals (even if at the same organization) or entities (i.e. two (2) or more) and/or from more than one computer requires a Multi-User License." — [PSE Individual EULA](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- **Sync-only, with a custom license for asynchronous use (key ambiguity for games):** "Use of the Licensed Audio Content shall be limited to use in a synchronized manner. Any use of the Licensed Audio Content in an asynchronous or non-synchronized format without receiving proper consent and license by virtue of obtaining the necessary Custom Application License issued by Pro Sound Effects is strictly prohibited." "Synchronize" means "solely in timed relation with the intended use(s) specified herein". Video games are **not named** anywhere in the EULA. — [PSE](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- **Strictest protection duty:** "You shall not make the Licensed Audio Content available in a manner intended to allow or invite a third party to download, extract, redistribute or access the Licensed Audio Content as a standalone file, and You shall exercise due diligence and maintain strict safeguards in order to ensure that no third party is able to do so. If You become aware that any third party has downloaded, extracted, ... You shall immediately notify PSE". Also: "You shall not provide any person or entity with any directions or instructions as to how the Licensed Audio Content may be extracted". And: "You shall not alter or delete any 'watermark' or other ordinarily imperceptible identifier". — [PSE](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- Websites: "If You Copy or Broadcast any End User Work on Your website(s), You shall not make any of the Licensed Audio Content on Your website(s) available as a standalone file". — [PSE](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- AI: "You may not use the Licensed Audio Content for the purpose of Audio Research, commercially, non-commercially, or for internal R&D purposes". "Audio Research" expressly includes training of "algorithms, neural networks, and/or AIs". — [PSE](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- Subscriptions: "Sound Effects and Music Tracks cannot be used on any Productions after the Subscription Term." — [PSE](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- Enforcement: "liquidated damages fee equal to fifteen (15) times PSE's standard license fee for the unauthorized use". Termination for breach requires that you "destroy or ... return" the content. PSE also has audit rights, including "free of charge access to any pay-walled or otherwise restricted access" platforms. — [PSE](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- PSE builds "customized licenses for situations where modding tools extend beyond typical synchronized usage". — [Mix: PSE customized multi-user solutions for game production](https://www.mixonline.com/?p=25396) (search summary)

#### Soundsnap: unified license (former Pro and Pro+ merged), no date shown

- "Creative Works" include "video games, applications, software". Grant: "worldwide, non-exclusive, perpetual (for the duration of the applicable copyright), irrevocable license, except in the case of material breach". Covers "use, reproduce, edit, modify, synchronize, and incorporate", and "publicly perform, display, distribute, transmit, broadcast, publish, and monetize Creative Works". "Attribution is not required." — [Soundsnap License](https://www.soundsnap.com/licence)
- Protection: You may not "sell, sublicense, share, distribute, or make available any Sound on a standalone basis or in a manner that allows the Sound to be extracted or reused separately from a Creative Work". — [Soundsnap](https://www.soundsnap.com/licence)
- AI: may not "use the Sounds to train, develop, or improve machine learning, artificial intelligence, or similar automated systems without prior written permission from Soundsnap". — [Soundsnap](https://www.soundsnap.com/licence)
- After the subscription: "This License is perpetual with respect to Sounds lawfully downloaded ... Termination of an account or subscription does not affect rights granted for Sounds downloaded prior to termination, except in the case of material breach." — [Soundsnap](https://www.soundsnap.com/licence)

#### Soundly: SFX Subscription License, "Last update: 11 November 2024" (Soundly AS, Norway)

- Grant covers "video games" and "physical devices". — [Soundly EULA PDF](https://getsoundly.com/assets/Soundly-EULA.pdf)
- **Video-game version lock:** "If you create a video game Production, only the version(s) of the video game Production produced during the term of this License will be licensed and you may not change the use of the Licensed Works after the term of this License. This does not mean that you must remove Licensed Works from versions created during the term of, and in accordance with, this License, but that you must exclude the Licensed Works if you create any new major version of that video game after the term." — [Soundly EULA](https://getsoundly.com/assets/Soundly-EULA.pdf)
- UGC and tool ban: may not exploit the sounds "in any way that is intended to allow third parties to download, reproduce, stream, and/or otherwise access or use the Licensed Works ... on a standalone basis, including without limitation in any digital templates or other applications enabling end users to synchronize or otherwise combine the Licensed Works with other content". The same clause bans uploading sounds "in any third party AI tool". — [Soundly EULA](https://getsoundly.com/assets/Soundly-EULA.pdf)
- Edit rights: "You may vary, alter, modify, add to and/or delete parts of the Licensed Works". — [Soundly EULA](https://getsoundly.com/assets/Soundly-EULA.pdf)
- Revenue cap: if your company or group "has an annual revenue exceeding USD 10 million, or if you are a publisher, agency, or production company with an annual revenue over USD 5 million, please sign up for our Enterprise plan". "Only one legal entity." — [Soundly EULA](https://getsoundly.com/assets/Soundly-EULA.pdf)
- Removed sounds: "you may not use any removed Licensed Works in any new Productions after the date of such removal, even if you have downloaded them previously". Soundly may also require takedowns and will provide replacements. — [Soundly EULA](https://getsoundly.com/assets/Soundly-EULA.pdf)
- Soundly's FAQ: "Games created while subscribing to Soundly Pro stay cleared even if you end your subscription". It recommends filtering Freesound to CC0. — [Soundly FAQ](https://getsoundly.com/faq/can-i-use-the-sounds-in-a-video-game)
- Epidemic Sound "integrated Soundly's Hollywood-grade library of sound effects into our own catalog" (250,000+ effects). The corporate relationship is not stated on that page. — [Epidemic: Soundly launch](https://www.epidemicsound.com/campaign/soundly-launch)

#### Epidemic Sound (primary license page not reachable)

- Epidemic's own game-development page says commercial game releases need "a paid Scale or Enterprise plan. The Free tier is for prototyping only, capped at 50 downloads with no commercial license." [via fetch summary] — [Epidemic: Game development](https://www.epidemicsound.com/game-development); [Epidemic developer API](https://developers.epidemicsound.com/)
- A third-party reseller's copy of Epidemic end-user terms bans incorporating "any End-User Production containing any Licensed Works in a software application or video game." — [Videobolt: Epidemic Sound End-User License Terms](https://videobolt.net/epidemic-sound-terms). **Conflict:** this is a reseller-specific sublicense, not Epidemic's direct subscription terms. Epidemic's current direct license terms could not be fetched (404 or Cloudflare block).

#### Splice (DCI) Terms, "Last Updated: July 24, 2026"

- "3.1.1.2 Creative Works": a "non-exclusive, non-transferable, perpetual right to use Sounds ... in other creative works, such as but not limited to, video games ... used either in isolation as sound effects, loops, and/or sound mixes ... for non-commercial and commercial purposes". — [Splice Terms](https://splice.com/terms)
- Prohibited: you may not "sublicense the Sounds in isolation as sound effects", "distribute, or transfer the Sounds to a third party except as incorporated into a New Recording or Creative Work", or "use the Sounds as source or training material for generative or other types of artificial intelligence models." — [Splice Terms](https://splice.com/terms)
- No explicit anti-extraction duty. Rights are perpetual once credits are spent.

#### Envato Elements License, "Last revised: December 8, 2025" (Individuals/Teams; Enterprise by contact)

- Per-project license: "for an audio Item, the End Product is a sync of the music with an audio-visual or audio-only work that incorporates the Item as well as other things". — [Envato Elements License](https://help.elements.envato.com/hc/en-us/articles/360000628966-License-Terms)
- **Completion during the subscription:** "the license is only valid if you complete the End Product while your subscription is active. Once the Item has been incorporated into a completed End Product during an active subscription term, the license becomes perpetual ... If you cancel your subscription and have not completed your End Product, the license for the Item is terminated". — [Envato](https://help.elements.envato.com/hc/en-us/articles/360000628966-License-Terms)
- Protection: "You must not permit an end user to extract an Item and use it separately from the End Product". — [Envato](https://help.elements.envato.com/hc/en-us/articles/360000628966-License-Terms)
- UGC: "You can't use an Item in any application allowing an end user to customize a digital or physical product to their specific needs, such as an 'on demand', 'made to order' or 'build it yourself' application." Also: "You can't redistribute an Item as stock, in a tool or template". — [Envato](https://help.elements.envato.com/hc/en-us/articles/360000628966-License-Terms)
- Modification: "You can modify or manipulate an Item, or combine the Item with other works". — [Envato](https://help.elements.envato.com/hc/en-us/articles/360000628966-License-Terms)
- Termination: "We may terminate this Elements License for any Item at any time, including if you breach ... Upon termination, you must stop using the relevant Item, which includes no longer making copies of or distributing the End Product created using that Item (unless you remove the Item from it)." — [Envato](https://help.elements.envato.com/hc/en-us/articles/360000628966-License-Terms)
- The overview article was updated 2026-09-29. AI-generated content is governed by separate "AI Tools Terms". — [Envato Full License Wording](https://help.elements.envato.com/hc/en-us/articles/360000629206-Full-License-Wording)

#### AudioJungle (Envato Market) SFX (Single Use) License, "Last revised: March 11, 2025"

- "Examples of End Products: apps, games, podcasts, websites". "free or commercial, monetized or not ... as long as it's one single End Product". The Multi-Use license allows "an unlimited number of end products". — [AudioJungle SFX Single Use](https://audiojungle.net/licenses/terms/audio_sfx_media_single); [AudioJungle SFX licenses](https://audiojungle.net/licenses/sound_effects)
- "You must not permit an end user to extract the Item and use it separately from the End Product." — [AudioJungle](https://audiojungle.net/licenses/terms/audio_sfx_media_single)
- "You can't use the Item in any application allowing an end user to customize a digital or physical product ... 'build it yourself' application." — [AudioJungle](https://audiojungle.net/licenses/terms/audio_sfx_media_single)
- "You can modify or manipulate the Item ... you can edit or loop or stretch a sound effect". Termination applies only on an unremedied breach. — [AudioJungle](https://audiojungle.net/licenses/terms/audio_sfx_media_single)

#### Unity Asset Store EULA, "Last updated: December 4, 2024"

- Assets include "sounds and music". Grant: to incorporate "into an electronic application or digital media ... as an embedded component of that Licensed Product", and "reproduce ... transmit, and distribute the Asset as incorporated and embedded". The license is "perpetual". — [Unity Asset Store Terms/EULA](https://unity.com/legal/as-terms)
- UGC: END-USER may not "without express authorization, monetize an Asset in a Licensed Product where the Licensed Product's primary purpose is to create user-generated content". — [Unity](https://unity.com/legal/as-terms)
- AI: no use "for purposes such as training an artificial intelligence or machine learning model without the express consent". — [Unity](https://unity.com/legal/as-terms)
- Unity support (July 2, 2025): assets may be used in other engines. "Assets cannot be redistributed as standalone items or in a way that allows others to extract them from your final product". — [Unity Support](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines) (quoted from the project's [asset licensing notes](../assets/licensing.md))

#### Fab Standard License (applies to Fab's audio category too)

- Fab lists an Audio category alongside 3D assets. — [Fab: Audio](https://www.fab.com/category/audio?lang=en)
- Sec. 4(c): "you may only authorize end users to make use of Content solely as incorporated in the Project in object code and you must restrict end users from extracting or otherwise using Content outside of the Project"; "you may Distribute software applications (such as video games) that include Content to the general public". Distribute covers making "the Project's functionality available on a network". — [Fab EULA](https://www.fab.com/eula) (Oct 1, 2024 text, via [project notes](../assets/licensing.md))
- Revenue tier: Personal tier eligibility is not more than "$100,000 USD in gross revenue ... in the last 12 months". Both tiers grant "the same scope of rights". "There is no need for upgrading from Personal to Professional tier if you cross the revenue threshold after the purchase". — [Fab license summary](https://www.fab.com/eula)
- AI ban applies only to "NoAI"-tagged content (Sec. 6(b)(vii)). — [Fab EULA](https://www.fab.com/eula)

#### GameDev Market: Marketplace Terms, Licence (A) for purchases after 15 Jan 2019

- "non-exclusive perpetual licence to ... use the Licensed Asset and any Derivative Works as part of both Non-Monetized Media Products and Monetized Media Products, with no restriction on the number of projects". A Media Product includes "websites". — [GameDev Market Terms](https://www.gamedevmarket.net/terms-conditions)
- A Licence does not allow the Purchaser to "Allow the user of the Media Product to extract the Licensed Asset or Derivative Works and use them outside of the relevant Media Product." — [GameDev Market](https://www.gamedevmarket.net/terms-conditions)

#### Chuck Russom FX

- No license text was retrievable (the site returned an empty page to the fetcher). Secondary coverage says Chuck Russom FX "focuses on multi-user and site licenses" and is willing to tailor licenses for game teams. — [Designing Sound](https://designingsound.org/2010/07/12/fireworks-and-skateboard-two-new-sfx-libraries-of-chuck-russom-fx-with-exclusive-qa/) (search summary; dated 2010)

#### Sound Ideas / Hollywood Edge

- Sound Ideas acquired the rights to The Hollywood Edge libraries after Hollywood Edge's 2014 bankruptcy. — [Wikipedia: Sound Ideas](https://en.wikipedia.org/wiki/Sound_Ideas)
- Games: "Can I use Sound Ideas sound effects in my computer game? Yes you can, provided that the sounds are embedded in the code of your game and are not available for an end-user to access or download. If your application allows the end-user to access or download unsynchronized sounds, you must contact us to arrange supplemental authorization ... A license fee may be charged." — [Sound Ideas FAQ](https://sound-ideas.com/pages/faq)
- Web: "you can synchronize our sound effects for playback only on your Web site ... You are not permitted to present our sound effects in any way that would allow access to the sound effects or sounds as downloadable audio." — [Sound Ideas FAQ](https://sound-ideas.com/pages/faq)
- Non-video games and toys need extra licensing. A "guess what this sound is?" app is not allowed. — [Sound Ideas FAQ](https://sound-ideas.com/pages/faq)
- The site offers "Multi User Licenses" and "Licensing for AI & Machine Learning" as separate products. The EULA page URL tried returned 404. — [Sound Ideas FAQ footer](https://sound-ideas.com/pages/faq)

#### Freesound

- Three current licenses: CC0, CC BY 4.0, CC BY-NC 4.0, plus legacy "Sampling+". "'Noncommercial' works like attribution, but you can't earn any money with the piece of work you create!" Sampling+ is interpreted as at least as restrictive as BY-NC. — [Freesound FAQ](https://freesound.org/help/faq/)
- Since July 2026, uploaders can set Gen-AI training preferences on top of the CC license. — [Freesound FAQ](https://freesound.org/help/faq/)
- CC BY 4.0 bans applying "Effective Technological Measures" that restrict recipients' rights (Sec. 2(a)(5)(B)). So CC-BY audio must ship raw, consistent with existing project policy. — [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode); [project licensing doc](../../../assets/licensing.md)

#### itch.io

- No platform-wide asset license exists. Each creator states their own terms on the product page (CC0, custom royalty-free, and so on). — search summary of itch.io asset pages, e.g. [400 sounds pack](https://ci.itch.io/400-sounds-pack)

### Inferences

- **Safest commercial sources for a live-service game:** perpetual, one-time licenses with explicit game wording. That means Sonniss (standard and GDC bundle), A Sound Effect, BOOM, GameDev Market, AudioJungle SFX Multi-Use, Unity, Fab, plus Soundsnap and Splice, whose subscriptions grant perpetual rights in downloaded sounds.
- **Subscription traps:**
  - Soundly bars the sounds from any "new major version" made after you unsubscribe. An MMO that ships continuously would have to keep subscribing forever or rip the sounds out.
  - Envato Elements' "complete the End Product while your subscription is active" is undefined for a never-finished live game.
  - PSE subscriptions bar use "on any Productions after the Subscription Term".
- **PSE is not a casual buy for games.** The EULA never mentions games, restricts use to "synchronized" use, and routes "asynchronous" use to a Custom Application License. Interactive triggering is arguably asynchronous. Combined with 15x liquidated damages and audit rights, buying PSE (including the BBC library through PSE) needs a written game/web clarification first.
- **UGC/map editor:** if we ever let players place sounds in a level editor, ASE ("media authoring tools"), Soundly ("applications enabling end users to synchronize"), Envato/AudioJungle ("build it yourself") and Unity (monetization in UGC-primary products) become relevant. An editor that only references sounds by ID inside our game, with no export, is probably still "incorporated" use, but none of these texts says so.
- **Seats:** as a solo developer, single-user licenses fit. Adding even one contractor sound designer would trigger multi-user terms at PSE, Sonniss ("sole editor"), BOOM ("one individual") and ASE (per workstation).
- **AI bans** are universal and align with our policy of never uploading purchased assets to AI services. Note that Soundly also bans uploading into "any third party AI tool", which covers AI mastering or cleanup services, not just training.
- **Revenue tiers** barely matter for audio. Only Fab (USD 100k, with no re-buy needed if crossed later) and Soundly (USD 10M or 5M) have them.

### Gaps

- BOOM EULA, Sonniss GDC license v2.0 and Epidemic quotes came through a summarizing fetcher. The Epidemic direct license and the Chuck Russom license text could not be retrieved. Re-read these on the live pages.
- No current Sound Ideas EULA text was retrieved (only the FAQ). Hollywood Edge-specific terms were not checked.
- Per-creator license overrides on ASE ("unless explicitly stated") and itch.io must be checked per product.
- No vendor defines "extract" or the technical standard for "safeguards".

## 2. Does the encrypted-pack approach satisfy SFX terms, and is raw delivery ever permitted?

### Takeaway

No vendor reviewed explicitly permits shipping their raw sound files as freely downloadable files in a web build. Several explicitly require that end users not be able to extract or access them: Sound Ideas, PSE, Envato/AudioJungle, Soundsnap, GameDev Market, Unity and Fab. Others, such as Sonniss, A Sound Effect, Splice and BOOM, only require that sounds be distributed "incorporated"/"synchronized" in the product, with no stated technical duty.

Our existing encrypted, obfuscated pack, decrypted in a worker, with an EULA forbidding extraction, is the most defensible reading of every clause found. Encoding to Opus/AAC is not itself protection, because those are standard formats any player opens. CC0 audio can ship raw. CC-BY audio must ship raw (CC BY 4.0 ETM clause).

### Cited Findings

- Sound Ideas: sounds must be "embedded in the code of your game and are not available for an end-user to access or download". Websites must not present sounds "in any way that would allow access ... as downloadable audio". — [Sound Ideas FAQ](https://sound-ideas.com/pages/faq)
- PSE: must not make content available "in a manner intended to allow or invite a third party to download, extract ... and You shall exercise due diligence and maintain strict safeguards in order to ensure that no third party is able to do so". The licensee must also notify PSE of any known extraction. — [PSE EULA](https://www.prosoundeffects.com/individual-end-user-license-agreement)
- Envato Elements and AudioJungle: "You must not permit an end user to extract an Item". — [Envato Elements License](https://help.elements.envato.com/hc/en-us/articles/360000628966-License-Terms); [AudioJungle SFX](https://audiojungle.net/licenses/terms/audio_sfx_media_single)
- Soundsnap: not "in a manner that allows the Sound to be extracted or reused separately from a Creative Work". — [Soundsnap](https://www.soundsnap.com/licence)
- GameDev Market: may not "Allow the user of the Media Product to extract the Licensed Asset". — [GDM](https://www.gamedevmarket.net/terms-conditions)
- Fab: "must restrict end users from extracting". Unity support: no redistribution "in a way that allows others to extract them". — [Fab EULA](https://www.fab.com/eula); [Unity Support](https://support.unity.com/hc/en-us/articles/34387186019988-Can-I-use-assets-from-the-Asset-Store-with-other-engines)
- Sonniss: only "synchronized within Licensee's project" and "may be sold as incorporated into licensee project". There is no protection clause. — [Sonniss License](https://sonniss.com/license)
- A Sound Effect: only "incorporated in and synchronized with other media productions"; no protection clause. — [ASE](https://www.asoundeffect.com/license-agreement/)
- Splice: no distribution "except as incorporated into a New Recording or Creative Work"; no protection clause. — [Splice](https://splice.com/terms)
- CC BY 4.0: no "Effective Technological Measures" that restrict recipients. — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode)
- Technical point: Babylon AudioEngineV2 `CreateSoundAsync` and `CreateSoundBufferAsync` accept `ArrayBuffer | AudioBuffer | StaticSoundBuffer | string | string[]`. So a worker-decrypted ArrayBuffer can be handed straight to the engine without any raw URL ever existing. `CreateStreamingSoundAsync` only accepts `HTMLMediaElement | string | string[]`, so streamed tracks need a URL (or a Blob/MediaSource URL). — [@babylonjs/core 9.28.0 `AudioV2/abstractAudio/audioEngineV2.d.ts`](https://app.unpkg.com/@babylonjs/core@9.18.0/files/AudioV2/abstractAudio/audioEngineV2.js) (read from the installed package in `apps/client/node_modules`)

### Inferences

- "Allow/permit/invite extraction" language is about the licensee's conduct and design, not technical impossibility. Encrypted packs, no direct file URLs, no "export sound" feature, and EULA/ToS terms forbidding extraction plausibly meet all of these clauses. That includes PSE's "strict safeguards", though PSE is the one most likely to argue otherwise.
- The **output** of Web Audio can always be recorded. No license treats audible playback as extraction, since every film and game is recordable the same way.
- Serving raw `.ogg`/`.m4a` at public URLs would likely breach Sound Ideas, PSE, Envato/AudioJungle, Soundsnap, GDM, Fab and Unity terms, even though Sonniss/ASE/Splice/BOOM texts do not forbid it in so many words. Recommend applying the encrypted pack uniformly to all paid audio, so per-vendor tracking isn't needed.
- Streaming music through an `HTMLMediaElement` needs a URL. For paid music or ambience, use Blob URLs from decrypted chunks, or decode small loops into static buffers. CC0 or self-recorded ambiences can stream raw.
- Encoded OGG/Opus/AAC delivery is fine under every license reviewed. Formats are never restricted, and several licenses expressly allow edits and "technical modifications" (e.g. Soundsnap). Transcoding is a technical modification, not a derivative "sound product".

### Gaps

- No vendor gives written guidance specific to WebGL or browser games. A short written confirmation from each vendor whose libraries we actually buy (PSE and Sound Ideas especially) would remove the ambiguity.

## 3. Archival and historical WW1 audio sources

### Takeaway

There is essentially **one** authentic WW1 battlefield sound recording: Will Gaisberg's "Gas Shell Bombardment" (HMV 09308, recorded near Lille on 9 Oct 1918). It is a 1918 acoustic 78 rpm disc, so it is very low fidelity and its authenticity as a single unedited take is debated. The underlying recording is public domain in the UK/EU and in the US (pre-1923 recordings).

The famous IWM "Armistice" audio is **not a recording**. It is a 2018 sound design by Coda to Coda for IWM, built from a sound-ranging photographic film, so it is modern copyright and needs a license from IWM. The IWM, BnF/Gallica and Bundesarchiv archives license commercially for a fee. The Library of Congress National Jukebox is streaming-only by Sony license. The BBC archive is RemArc (non-commercial), with commercial licensing via Pro Sound Effects. None of this is usable as gameplay SFX quality. Use it as period flavour (gramophone, menu, museum mode) or as design reference.

### Cited Findings

- **IWM "Armistice" sound:** IWM's film "The End of the War" shows a sound-ranging record from 11 Nov 1918 on the American front near the Moselle. The film recorded "sound pressure impulses" photographically, because magnetic tape did not exist. IWM asked London acoustics firm Coda to Coda to "reproduce a soundscape of the moment of armistice" for its 2018 Making a New World season. — [IWM: Sound ranging explained](https://www.iwm.org.uk/history/sound-ranging-explained); [Bunk History](https://bunkhistory.org/resources/making-a-new-world-armistice-soundwave) (search summary)
- IWM's page: "A re-imagining of what the end of the First World War sounded like, based on the sound ranging tape featured in this video, was part of the Making a New World season at IWM London." — [IWM](https://www.iwm.org.uk/history/sound-ranging-explained)
- Snopes fact-checked viral claims that this was an actual recording. The page returned 402 to the fetcher, so only the search listing was seen. — [Snopes](https://www.snopes.com/fact-check/recording-guns-falling-silent/)
- **IWM sound licensing:** IWM holds "33,000 recordings, including famous speeches, music, and the largest oral history collection of its type in the world". "Audio recordings from the IWM Sound Archive can be licensed for use in projects including film, radio and television programmes", via a "License sound for commercial use" order form. Fees: "Licence/supply fees vary depending upon the nature of the project and are based on the rights, territories and duration required." — [IWM Image and Film Licensing](https://www.iwm.org.uk/commercial/licensing); [IWM Sound Licensing](https://www.iwm.org.uk/commercial/collections-sales-licensing/sound-licensing); [IWM media sales FAQ](https://www.iwm.org.uk/commercial/media-sales/faqs)
- **Gaisberg recording:** "Record: HMV 09308; Company: The Gramophone Company; ... Date of recording: 9th October 1918; Recorded by: William Gaisberg; Type of disc: 12-inch single sided". The label is dated November 1918. HMV marketed it as "not an imitation but was recorded on the battlefront". — [EMI Archive Trust](https://www.emiarchivetrust.org/?p=2123) (search summary); [Sound of the Hound](https://soundofthehound.com/2018/11/09/actual-record-taken-on-the-front-line-france-near-lille-november-1918/)
- Gaisberg's authenticity: "It is now thought to be a 'double- or triple-layered sonic artifact'". — [Jagged Lines (Substack): What did World War I sound like?](https://jaggedlines.substack.com/p/what-did-world-war-i-sound-like-cfa0a455844c) (search summary; secondary)
- **UK law on transfers:** "Copyright does not subsist in a sound recording which is, or to the extent that it is, a copy taken from a previous sound recording." — [CDPA 1988 s.5A(2)](https://www.legislation.gov.uk/ukpga/1988/48/section/5A)
- **US law:** "For recordings first published before 1923, the additional time period ends on December 31, 2021." — [US Copyright Office: pre-1972 sound recordings](https://www.copyright.gov/music-modernization/pre1972-soundrecordings/)
- **Library of Congress National Jukebox:** streaming-only, no downloads. Sony Music granted LoC "a gratis license to stream" its pre-1925 acoustic catalogue (Columbia, OKeh, Victor). Items reissued commercially may be taken down. The LoC rights page returned 403. — [Boulder Weekly / news coverage](https://archives.boulderweekly.com/?p=5571); [KUNC](https://www.kunc.org/post/library-congress-launches-national-jukebox) (search summaries)
- **Gallica/BnF:**
  - "La réutilisation non commerciale de ces contenus est libre et gratuite ... La réutilisation commerciale de ces contenus est payante et fait l'objet d'une licence." (Non-commercial reuse is free; commercial reuse is paid and licensed.)
  - Commercial reuse includes "toute autre réutilisation des contenus générant directement des revenus" (any other reuse that directly generates revenue).
  - Data for sound documents supplied by Sony Music France, Universal Music France, Warner Music France and IDOL "ne peuvent faire l'objet d'aucune exploitation commerciale" (may not be commercially exploited) when it involves a substantial part.
  - Contact: utilisation.commerciale@bnf.fr. — [Gallica: conditions d'utilisation](https://gallica.bnf.fr/edit/und/conditions-dutilisation-des-contenus-de-gallica)
- **Bundesarchiv:** "over 46,000" sound carriers. "Einzelne Originaltöne aus der Frühphase des Ersten Weltkriegs sind beim Bundesarchiv überliefert" (a few original recordings from the early phase of WW1 survive), mostly speeches by German decision-makers. Access is by reading-room appointment in Koblenz or Berlin. No usage or fee terms were found on the page. — [Bundesarchiv: Töne](https://www.bundesarchiv.de/im-archiv-recherchieren/archivgut-recherchieren/nach-medienart/toene/) [via fetch summary]. Bundesarchiv WW1 *film* commercial licensing is handled by Transit Film GmbH. — search summary citing [filmportal.de](https://www.filmportal.de/print/1249711)
- **Europeana 1914-1918:** more than 400,000 digitised WW1 items from national libraries. Sound came in through Europeana Sounds. Rights are per item; much of the metadata and content is CC BY-SA for reuse. — search summaries of [Europeana Sounds (UvA)](https://dare.uva.nl/id/628aef24-6207-408b-8f24-e543f5177265) and [Creative Commons blog](https://creativecommons.org/tag/radio)
- **BBC Sound Effects:** the free archive (33,000+ files, mp3/wav) is "free for personal use, though you can also buy individual sounds for commercial use through the Prosoundeffects.com site". The free RemArc licence covers personal, educational and research use only. — [Sonicstate, Sep 2025](https://www.sonicstate.com/news/2025/09/17/33-thousand-bbc-sound-effects/); [CineD](https://www.cined.com/bbc-gives-away-16000-sound-effects-for-free/)
- Historically, PSE has distributed the BBC library since 2009–2010: "BBC Complete Sound Effects Library" 33,000+ effects, $4,999, smaller sets from $599. — [MacTech 2010](https://www.mactech.com/2010/05/19/pro-sound-effects-distribute-bbc-sound-effects-archive). **Conflict:** the PSE homepage fetched today did not mention the BBC library, so current availability and price are unconfirmed. Sound Ideas also sells "BBC Sound Effects Library Original Series" CDs. — [Adorama listing](https://www.adorama.com/sound-ideas-bbc-sound-effects-library-original-series-volumes-41-60-cds/p/sibbc4160)

### Inferences

- **Public domain candidates:** the Gaisberg 1918 disc, and other commercially published 1914–1918 discs such as patriotic songs and "descriptive" battle records. These are PD in the US (published before 1923) and in the UK. Old UK law gave sound recordings 50 years, and the 2013 extension to 70 years only applied to recordings still in copyright then. A fresh transfer from a PD disc creates no new UK sound-recording copyright (s.5A(2)). Safest path: make our own transfer from a purchased original 78, or use a transfer explicitly released as PD or CC0. Do not lift remastered tracks from EMI, IWM, or archive websites without checking those sites' terms of use.
- **Not public domain:** the IWM/Coda to Coda "Armistice" piece (2018), IWM oral histories (interviewee and IWM rights), and anything on the National Jukebox (Sony license). These are only usable by paid license.
- **Quality:** acoustic-era discs have roughly telephone bandwidth plus surface noise. They suit diegetic gramophones, menus or a "museum" mode, not weapons or ambience gameplay SFX.
- **BBC via PSE** inherits all of PSE's sync-only and "strict safeguards" terms (section 1). Clarify game use first.

### Gaps

- Exact US status of a **foreign** (UK) pre-1923 recording under the Music Modernization Act was not confirmed. The Copyright Office page doesn't address it.
- IWM sound licence fees for games, and whether IWM licenses for interactive use at all (its page mentions film, radio and TV), are unknown without contacting IWM. We did not contact them, per the brief.
- BnF commercial tariff for sound was not retrieved (link to "tarifs et licence"). Whether BnF can charge for reuse of PD sound reproductions is legally contested in France and was not researched.
- No WW1 battlefield ambience exists in any archive. Everything else is re-creation.

## 4. Recording our own or commissioning WW1 weapon audio

### Takeaway

Commercial WW1 weapon audio exists, but coverage is patchy:

- BOOM's "World War I Firearms" ($139+, 24-bit/96 kHz) covers revolvers, pistols, bolt rifles and shotguns. It has **no** SMLE Lee-Enfield, Gewehr 98, Lebel, or any machine gun or artillery.
- The Recordist sells a real Vickers .303 MG library.
- The Battlefield 1 team used Pole Position Production (Sweden), with sessions in Sweden, California and Idaho.

Commissioning is feasible through such specialists, but no published rates for weapon sessions were found. Generic recordist day rates are about £350–500/day plus £100–300/day of equipment in the UK. Weapons add armourer and owner fees, ammunition, and range costs, and US ranches are the usual venue because of firearms law.

### Cited Findings

- BOOM World War I Firearms contents:
  - Revolvers: "Colt New Service, M1917 Revolver, Webley Mk VI, Nagant M1895"
  - Pistols: "Steyr M1912, Colt M1911, FN Highpower, Mauser C96, P08 Luger"
  - Rifles: "M1917 Enfield, Mosin Nagant 1891, Mosin Nagant M1907, Springfield M1903, Springfield M1903 A4, Steyr 1895, Krag–Jørgensen"
  - Shotguns: "Browning Auto 5, Winchester M1887"
  - Construction Kit 499 files / 13.96 GB; Designed 72 files; WAV 24-bit/96 kHz; from $139. Close, mid and far mics in two acoustic environments. No machine guns or artillery. — [BOOM: World War I Firearms](https://www.boomlibrary.com/sound-effects/world-war-i-firearms/) [via fetch summary]
- The Recordist Vickers .303: "Recorded on a 400 acre ranch in North Idaho with a huge amount of microphones and handheld recorders. Perspectives include attached, very close, medium and distant. From just a few inches out to 150 meters". It ships as time-aligned source recordings only. — [The Recordist: Vickers Machine Gun Released](https://therecordist.com/vickers-machine-gun-released/)
- Battlefield 1:
  - "DICE asked Pole Position Production to record WWI-era vehicles". Field recordist Max Lachmann worked with audio director Bence Pajor. — [A Sound Effect: Battlefield 1 sound](https://asoundeffect.com/battlefield-1-sound/) (search summary)
  - "We did some of the sessions here in Sweden, but we've also been in California and Idaho." Many authentic weapons were museum pieces that couldn't be fired, so the team matched "caliber, action, and barrel length". Criterion Games recorded transport vehicles. — [ASE: Battlefield 1](https://asoundeffect.com/battlefield-1-sound/) [via fetch summary]
  - Contracts required a mechanic on site, and the vehicle had to be started the day before. — search summary of the same article
- Pole Position Production also recorded a WWII 105 mm howitzer firing blanks: ~20 channels, 0–150 m. — [ASE: Pole Position Production](https://www.asoundeffect.com/?p=29391) (search summary)
- Watson Wu (US weapons recordist): records "12 or more channels for medium to large size budget jobs". He pays gun owners "a negotiated day rate for shooting services", and over-budgets ammunition because "purchased ammunitions cannot be returned". He uses Florida ranges (no explosions) and "a huge private property in the desert just outside Las Vegas". — [ASE: Weapon sound effects recording](https://www.asoundeffect.com/weapon-sound-effects-recording/) [via fetch summary]
- Generic rates:
  - UK sound recordists "£350–£500 per day", equipment hire "£100–£300+ per day". — [herenow.film](https://www.herenow.film/?p=3345) (search summary)
  - Game audio freelancers "around $350 per day" (low end $150). — [VI-Control forum](https://vi-control.net/community/threads/q-about-game-audio-rates-music-sfx-voice-acting-sessions.12658/) (forum, weak source)

### Inferences

- **Coverage gap to fill:** Lee-Enfield SMLE, Gewehr 98, Lebel 1886, Mauser and Lebel bayonets, MG08/Maxim, Hotchkiss M1914, Chauchat, Lewis, Stokes and minenwerfer mortars, 75 mm and 77 mm field guns, 155 mm and heavier artillery, gas rattles and whistles. BOOM covers some substitutes (the M1917 Enfield sits close to the SMLE in calibre class; the Mauser C96 and P08 are period-correct).
- **Where to record:** the US (Idaho, Nevada, California private ranches) is most permissive for live-firing historic automatics; that is why BF1, The Recordist and Watson Wu sessions were there. UK, French and German law make live-firing WW1 machine guns rare. Re-enactor groups usually fire blanks, which sound different (no projectile crack). This is an inference from venue choices; firearms law wasn't researched in depth.
- **Licensing a commission:** negotiate an assignment or an exclusive perpetual license that covers web distribution, modification, team use and no AI-training restrictions on our own use. Otherwise the recordist may resell the session as a library. A non-exclusive "library-style" license is cheaper.
- **Budget guess (unverified):** 1–2 days × (recordist + 1 assistant) plus owner/armourer fees plus ammunition plus venue, likely in the low thousands to low tens of thousands of USD depending on machine guns and artillery. Treat this as a placeholder until we get quotes.

### Gaps

- No published price lists for Watson Wu, Pole Position Production, BOOM custom sessions, or The Recordist custom work. Quotes require contact, which was out of scope.
- Re-enactor and collector groups in France, Germany and the UK that live-fire WW1 automatics weren't identified. Relevant law (French category A/B/C/D rules, German WaffG, UK Section 5) wasn't researched.
- Licenses for The Recordist and Pole Position Production were not retrieved.

## 5. Web delivery notes (desktop only)

### Takeaway

- **Codec:** Opus is the best codec. It is supported by Chrome, Edge and Firefox in Ogg and WebM. Safari added Ogg Opus only in Safari 18.4 on macOS 15.4+. Before that, Safari supported Opus only in WebM (17.5+) or CAF. Ship Opus (WebM or Ogg) plus an AAC-LC `.m4a` fallback for older Safari, or detect capability at pack-build/load time.
- **Loading:** decode short SFX up front into `AudioBuffer`s (`decodeAudioData` only takes complete files; buffers are float32, intended for clips under about 45 s). Stream long music and ambience.
- **Engine:** Babylon 9 AudioEngineV2 provides static sounds with shareable buffers, streaming sounds via HTMLMediaElement, a `maxInstances` cap (default Infinity), and spatial audio with HRTF or equal-power panning.

### Cited Findings

- Opus support:
  - Chrome 33+, Edge 14+, Firefox 15+.
  - Safari, by version:

    | Safari version | Opus support |
    |---|---|
    | 14–17.3 | "packaged in a CAF file ... (constant bit-rate only)" |
    | 17.4 | "WebM container ... known regression" |
    | 17.5–18.3 | "Supported in a WebM container (all bitrates)" |
    | 18.4+ | "requiring macOS 15.4 Sequoia or later" |

    — [caniuse: Opus](https://caniuse.com/opus) (raw data from [caniuse GitHub](https://github.com/Fyrd/caniuse/blob/main/features-json/opus.json))
- Apple's Safari 18.4 notes: "Added support for Ogg Opus and Ogg Vorbis on macOS Sequoia 15.4, iOS 18.4, iPadOS 18.4, and visionOS 2.4." — [Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes)
- MDN on Opus: 96 kbps at 48 kHz is the recommended minimum for stereo general audio, with latency "5 ms to 66.5 ms". On AAC: "Chrome supports AAC only in MP4 containers", and there are patent caveats for codec makers but "no license required" to distribute AAC content. MDN suggests FLAC for small, pristine effects. — [MDN: Web audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs) [via fetch summary]
- `decodeAudioData`: "This method only works on complete file data, not fragments of audio file data." "The decoded AudioBuffer is resampled to the AudioContext's sampling rate". — [MDN: decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)
- AudioBuffer: "designed to hold small audio snippets, typically less than 45 s. For longer sounds, objects implementing the MediaElementAudioSourceNode are more suitable." Format is "non-interleaved IEEE754 32-bit linear PCM". — [MDN: AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer)
- Babylon AudioEngineV2 (installed `@babylonjs/core` 9.28.0, type definitions):
  - `CreateAudioEngineAsync(options)` takes `resumeOnInteraction` (default true), `resumeOnPause` and `disableIOSRingerSwitchWorkaround`.
  - Static sounds: "fully downloaded and decoded before it can be played". They support loop points and playback-rate changes. "a sound's buffer can be shared with other sounds" via `CreateSoundBufferAsync`.
  - Streaming sounds: "loaded into memory in chunks as it is played ... cannot have loop points or playback rate changes". "there can be a significant delay when attempting to play a streaming sound for the first time", so use `preloadCount`.
  - `maxInstances`: "The maximum number of instances that can play at the same time. Defaults to `Infinity`."
  - Spatial: `spatialPanningModel: "equalpower" | "HRTF"` (default "equalpower"), `distanceModel: "linear" | "inverse" | "exponential"`, one listener per engine.
  - `skipCodecCheck`: when `source` is a string array, each URL is codec-checked before loading.
  - — [unpkg @babylonjs/core 9.18 AudioV2 typings](https://app.unpkg.com/@babylonjs/core@9.18.0/files/AudioV2/abstractAudio/streamingSound.d.ts); local `apps/client/node_modules/@babylonjs/core/AudioV2/`
- Forum reports exist about the v2 engine with "multiple spatial StaticSound". — [Babylon forum](https://forum.babylonjs.com/t/v2-audioengine-not-working-with-multiple-spatial-staticsound/62482) (title only; not read)

### Inferences

- **Sizes:** Opus at 64–96 kbps is 8–12 KB/s. A first-load core set of 150–300 one-shots averaging 1.5 s is about 2–5 MB. Each 60 s stereo ambience loop is 0.5–0.7 MB. That is compatible with the under-10-second link-to-gameplay target if music and secondary ambiences load after first spawn.
- **Memory:** decoded memory is the real cost. 48 kHz × 2 ch × 4 B = 384 KB/s, so 5 minutes of decoded SFX is about 115 MB. Keep SFX mono where they will be spatialized (halving memory), and stream long beds.
- **Encrypted pack:** decrypt in the worker and transfer the ArrayBuffer to the main thread. Decoding goes through the engine's AudioContext (`decodeAudioData` lives on `BaseAudioContext`). Then call `CreateSoundBufferAsync(arrayBuffer)` once per asset and share buffers across many `StaticSound`s.
- **Voices:** Web Audio has no fixed voice limit, but CPU cost scales per voice and HRTF is far more expensive than equal-power. Use HRTF for a few nearby important sources and equal-power for the rest. Set `maxInstances` per sound (for example machine-gun loops) and run our own priority/culling (distance, loudness) for artillery barrages with hundreds of events.
- **Safari strategy:** to avoid dual packs, Opus-in-WebM covers Safari 17.5+ and Chromium/Firefox. AAC is only needed for older Safari or macOS (and possibly for `decodeAudioData` on Safari, which is unverified). Given desktop-only scope, a single Opus/WebM pack plus an AAC fallback pack built on demand is a reasonable plan.

### Gaps

- Whether Safari's `decodeAudioData` (as opposed to `<audio>`) decodes WebM/Opus or Ogg/Opus reliably was not verified. Caniuse notes refer only to the `audio` element. Test in Safari 17.5, 18.x and 26.x.
- The official Babylon docs page for Audio V2 wasn't located (the URL tried returned 404). The typings were used instead.
- No measured voice-count limits or benchmarks for Babylon v2 with HRTF at scale were found.
