# Sound

What the game plays now is described in [level design](level-design.md#sound); where the sounds come from is in the
[shopping list](assets/shopping-list.md#audio) and the [register](assets/register.md); the research behind both is the
[sound effects report](research/ww1-sound-effects-report.md). This page lists what is still missing, grouped by what it
takes to fix: recordings nobody sells, things the game doesn't yet tell the sound about, and sound design not yet done.

Nobody has listened to the mix yet. Every level was set by measurement (loudness of each file, distance laws), so an ear
pass comes before anything below is tuned.

## Recordings we don't have

No library sells these at the quality the rest of the game uses. "Proxy" says what stands in today.

| Missing                                                                            | Proxy today                                               | How to get it                                                                                     |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Lebel, Berthier, Gewehr 98 firing                                                  | Mosin-Nagant 1891, M1917 Enfield, Springfield bolt (BOOM) | Commission a recording session, or keep the proxies (close at RTS distance)                       |
| Hotchkiss M1914, St. Étienne, MG 08, Chauchat, Lewis firing                        | Browning M1919 (Super Thump, GDC samples)                 | The Recordist's Vickers ($89) for the MG 08; commission the rest                                  |
| French 75 and German 77 firing; 210 and 420 mm                                     | 105 mm, 155 mm and 70 mm (Pole Position Warfare Library)  | No source exists; pitch down the heavy recordings for 210/420 mm                                  |
| Incoming heavy shell rush (real)                                                   | Run-up of two designed Bluezone sounds                    | Pole Position Bandkanon or a whistle designed from the Warfare Library's whizzes                  |
| Trench whistle (Acme Thunderer, French whistle)                                    | None: the attack goes in silently                         | Record: a reproduction whistle costs a few dollars                                                |
| French and German voices: orders, battle cries, "Gas!", wounded, stretcher bearers | Six non-verbal death cries and grunts (GDC samples)       | Native voice actors, 6–8 non-union, about $2k–4k ([report](research/ww1-sound-effects-report.md)) |
| Charge walla, war cries, crowd pain                                                | None                                                      | BOOM Crowds: War & Battle ($329, planned)                                                         |
| Gas alarm rattle and a real brass shell-case gong                                  | Struck iron and a spade (Pole Position sweeteners)        | Record a football rattle and an empty brass case                                                  |
| Gas-mask breathing through a period mask                                           | A modern breathing-mask loop (Gamemaster)                 | Record through a rubber mask with a cloth pad                                                     |
| Very lights and signal rockets                                                     | None (no flares in the game yet)                          | Record a blank flare-pistol pop and a road-flare fizz                                             |
| Footsteps on duckboards, mud squelch, ladders, gear rattle                         | None                                                      | GDC samples exist (mud footsteps, gear foley); a home foley session for duckboards                |
| Digging, sandbags, wire cutting, wire rattling in the wind                         | None                                                      | Home foley session; GDC has wind on a wire fence                                                  |
| Field telephone, French bugle calls, rats, flies, dugout room tone                 | None                                                      | Record, or the GDC fly and bunker samples                                                         |
| Horses and limbers, WW1 trucks, aircraft                                           | GDC horse samples, unused                                 | BOOM Horses; Pole Position Fokker Dr.I ($449) once aircraft fly                                   |

## Things the game doesn't tell the sound about

The sound model ([battle-sound-model.ts](../apps/client/src/audio/battle-sound-model.ts)) hears simulation events and
reads simulation state. These happen in the game but have no event or hook yet, or have one that nothing plays.

- **The whistle at zero hour**: G runs `attackBehindBarrage` in skirmish.ts, with no event. Needs a whistle recording
  too.
- **Shouted orders**: squad orders (follow, hold, advance, take cover) go through player-control.ts, with no event or
  callback. Ask the gameplay session for one rather than editing it.
- **Counter-attack, objective taken, capture**: events exist (`counter-attack`, `objective-taken`, `capture`); no sound
  plays for them yet. They want shouts or a distant cheer, which need the voices above.
- **Morale breaking and men pinned down**: on `sim.soldiers` (PINNED 0.6, BROKEN_MORALE 0.25) but unheard; men calling
  out, panting, praying.
- **Wire cut**: the `wire-cut` event duplicates a burst, so it stays silent; wire rattle and twang up close would need
  the foley above.
- **The level's own sources**: brazier and shell-fire crackle (`level.life.braziers`, `level.aftermath.fires`), crows
  taking off (`level.life.crows.flocks`, an `onTakeOff` callback offered by the level session), props wrecked by
  `level.damage.blast()`.
- **Weather**: rain on duckboards, iron sheets and standing water, thunder, wind through the woods. The ambience beds
  are fixed recordings and don't follow `sim.environment`.
- **Planned mechanics**: flares, signal rockets for the SOS barrage, mines, the stand-to at the daily turn. The design
  docs ask them to emit events.

## Sound design not done yet

- **Space**: sounds are panned and attenuated by distance, with separate near and far recordings, but there is no air
  absorption (highs rolling off with distance), no occlusion behind rises or out of sight (`sim.lineOfSight` could give
  it), and no 3D (HRTF) placement.
- **Listener**: the camera's target, counting half the camera's height. It doesn't blend toward the camera when zoomed
  out, and zoomed right out there is no distant roar of the whole front, only the same sounds quieter.
- **Reverb**: no trench, dugout, ruin or open-field acoustics. Impulse responses must be recorded ourselves or CC0:
  BOOM's licence forbids using its content as impulse responses.
- **Mix**: a near miss muffles the battle's own bus, but the ambience beds don't duck. Voices are limited per sound (two
  copies of each variation), with no priority between sounds. Battery reports under a heavy bombardment may be too
  dense. The ambience's first distant-gun bed is a low-grade Gamemaster sample; Pole Position's VAR DISTANT FIRING
  recordings are better.
