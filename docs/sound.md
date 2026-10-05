# Sound

What the game plays now is described in [level design](level-design.md#sound); where the sounds come from is in the
[shopping list](assets/shopping-list.md#audio) and the [register](assets/register.md); the research behind both is the
[sound effects report](research/ww1-sound-effects-report.md). This page lists what is still missing, grouped by what it
takes to fix: recordings nobody sells, things the game doesn't yet tell the sound about, and sound design not yet done.

Nobody has listened to the mix yet. Every level was set by measurement (loudness of each file, distance laws), so an ear
pass comes before anything below is tuned.

## Recordings we don't have

No library sells these at the quality the rest of the game uses. "Proxy" says what stands in today.

| Missing                                                                      | Proxy today                                                                                                                                                                | How to get it                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lebel, Berthier, Gewehr 98 firing                                            | Mosin-Nagant 1891, M1917 Enfield, Springfield bolt (BOOM)                                                                                                                  | Commission a recording session, or keep the proxies (close at RTS distance)                                                                                                              |
| Hotchkiss M1914, St. Étienne, MG 08, Chauchat, Lewis firing                  | Browning M1919 (Super Thump, GDC samples)                                                                                                                                  | The Recordist's Vickers ($89) for the MG 08; commission the rest                                                                                                                         |
| French 75 and German 77 firing; 210 and 420 mm                               | 105 mm, 155 mm and 70 mm (Pole Position Warfare Library)                                                                                                                   | No source exists; pitch down the heavy recordings for 210/420 mm                                                                                                                         |
| Incoming heavy shell rush (real)                                             | None: designed stand-ins were taken out, the shells land unheralded                                                                                                        | Pole Position Bandkanon or a whistle designed from the Warfare Library's whizzes                                                                                                         |
| Trench whistle (Acme Metropolitan and Thunderer, French and German whistles) | None: the whistles at zero hour are wired up but silent                                                                                                                    | No library records one: buy Acme's 1914 Metropolitan replica and a Thunderer (about £40) and record them ([notes](research/notes/audio/whistles_and_bullets.md))                         |
| French and German voices: more battle cries and orders, prayer               | Generated shouts (ElevenLabs, checked by native speakers) for the charge, gas, take cover, grenade, wounded, pinned, follow, hold, surrender, objective taken and breaking | Native voice actors, 6–8 non-union, about $2k–4k ([report](research/ww1-sound-effects-report.md)), for what ElevenLabs can't shout ("Vorwärts!" and "Deckung!" came out flat or garbled) |
| Charge walla, war cries, crowd pain                                          | None                                                                                                                                                                       | BOOM Crowds: War & Battle ($329, planned)                                                                                                                                                |
| Gas alarm rattle and a real brass shell-case gong                            | Struck iron and a spade (Pole Position sweeteners)                                                                                                                         | Record a football rattle and an empty brass case                                                                                                                                         |
| Gas-mask breathing through a period mask                                     | Real breathing (UberDuo), low-passed to sound muffled                                                                                                                      | Record through a rubber mask with a cloth pad                                                                                                                                            |
| Very lights and signal rockets                                               | None: a firework launch was taken out                                                                                                                                      | Record a blank flare-pistol pop and a road-flare fizz                                                                                                                                    |
| Boots on duckboards, mud squelch, ladders                                    | Bare earth (PMSFX): the samplers' wood and mud steps are too weak                                                                                                          | GDC samples exist (mud footsteps, gear foley); a home foley session for duckboards                                                                                                       |
| Digging, sandbags, wire cutting, wire rattling in the wind                   | None                                                                                                                                                                       | Home foley session; GDC has wind on a wire fence                                                                                                                                         |
| Field telephone, French bugle calls, rats, flies, dugout room tone           | None                                                                                                                                                                       | Record, or the GDC fly and bunker samples                                                                                                                                                |
| Horses and limbers, WW1 trucks, aircraft                                     | GDC horse samples, unused                                                                                                                                                  | BOOM Horses; Pole Position Fokker Dr.I ($449) once aircraft fly                                                                                                                          |

## Things the game doesn't tell the sound about

The sound models ([audio/](../apps/client/src/audio)) hear simulation events and read simulation and level state. These
happen in the game but have no event or hook yet, or a hook that only plays a stand-in.

- **Wire**: the `wire-cut` event duplicates a burst, so it stays silent; wire rattle and twang up close need foley.
- **Props wrecked** by `level.damage.blast()`: planks splintering and wire snapping go unheard.
- **Planned mechanics**: signal rockets for the SOS barrage, mines, the stand-to at the daily turn. The design docs ask
  them to emit events.

## Sound design not done yet

- **Rain on helmets and standing water**: rain drips on corrugated iron in the trenches, but there is no recording of
  rain on steel helmets or on the water lying in the trench.
- **3D**: sounds are panned in stereo, not placed with HRTF, so there is no above or behind.
- **Mix**: nobody has listened yet. Levels were set by measurement; the sound mixer panel (M, dev builds) is for setting
  them by ear, and its Copy button gives the values to ship in audio/tuning.ts. Battery reports under a heavy
  bombardment may be too dense, and the voice limit has no priority between kinds of sound beyond loudness.
- **Close bullets**: rounds crack, zip past, ricochet and strike earth, mud, snow, water, stone, wire and parapets (The
  Recordist's Bullets 3), but nothing is heard of a round striking a man or a steel helmet: a flesh-impact library is
  needed (SoundMorph "Gore" or 344 Audio's, [notes](research/notes/audio/whistles_and_bullets.md)). Bullets 3's rounds
  are mostly subsonic, so the whizz plays only for the closest passes, under the supersonic crack. The flare and the
  incoming rush have no recording.
