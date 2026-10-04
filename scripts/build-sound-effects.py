"""Builds the battle's sound effects from the purchased libraries in vendor/audio.

    blender -b --factory-startup -P scripts/build-sound-effects.py -- vendor/audio .asset-cache/level

Writes <output>/sfx/<cue>-<n>.ogg (mono Opus, one file per variation) and <output>/sfx/sounds.json, which lists each
cue's variation count for apps/client/src/audio/battle-sounds.ts. The libraries are paid or royalty-free but not CC0, so
the files ship only inside the encrypted asset pack, like the rest of the level kit.

Most source recordings hold a run of takes (ten rifle shots, fifteen shells) separated by silence. Each cue finds the
separate takes and keeps the loudest. Each take is cut from its onset until it has died away (or the next take starts,
or the cue's longest length), faded out, and matched in loudness to the cue's other variations, so the game can pick
one at random and set the level itself.
"""

import difflib
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

import aud
import numpy as np

RATE = 48000
BITRATE = 64000
# Long, steady loops (rain, wind, night, the front) lose nothing heard at a lower rate, and they are most of the size.
BED_BITRATE = 40000
# Envelope frames of 10 ms.
HOP = RATE // 100
# No variation peaks above -1 dBFS.
PEAK = 10 ** (-1 / 20)
# A take has died away once it stays this far below its own peak.
TAIL_DB = -50
FADE = 0.15
# Takes cut off at the cue's longest length fade out over this long instead.
LONG_FADE = 0.6
# Loudness matching may raise a quiet variation by this much, with a limiter catching its peaks.
MAX_BOOST_DB = 8
# The limiter lets go over this long, in seconds.
RELEASE = 0.05

BOOM = "boom-world-war-i-firearms"
WARFARE = "pole-position-warfare-library"
DETONATIONS = f"{WARFARE}/Detonations and Explosions"
SUPERTHUMP = "superthump-weapons-of-wwii"
GDC = "sonniss-gdc"


def boom_rifle(rifle, metres):
    return (BOOM, f"GUNRif_RI-{rifle} Single Shot {metres}m_B00M_WW1FC_XY.wav")


# Each cue: its sources as (folder under vendor/audio, file name), the gap of quiet that separates takes, the longest a
# cut may run, how many variations to keep, and how far below the loudest take (dB) a take may be and still be used.
# `isolated` keeps only takes that die away (to `tail` dB) within the longest length, so a lone crack isn't a burst.
# `lead` cuts the run-up to a take's loudest moment instead, ending there: an incoming rush that the game starts so it
# ends as the shell lands. `bed` cuts a continuous recording into a loop instead, as (start, length, crossfade) in
# seconds: the sound just past the loop's end fades out over its start, so it repeats without a seam. `loudest` cuts
# the loudest stretches of that many seconds from a recording that never falls quiet, none overlapping.
# Rifles stand in for the period ones: the Mosin-Nagant 1891 for the Lebel (both long, full-power 1890s rifles) and the
# M1917 Enfield's Mauser-pattern action for the Gewehr 98. The Browning M1919 stands in for the Hotchkiss and MG 08,
# whose rate of fire it shares; the MG 42 fires far too fast.
CUES = {
    "rifle-fr-near": dict(sources=[boom_rifle("Mosin Nagant 1891", 5)], gap=1.5, length=2.5, take=6),
    "rifle-fr-far": dict(sources=[boom_rifle("Mosin Nagant 1891", 100)], gap=1.5, length=3.0, take=6),
    "rifle-de-near": dict(sources=[boom_rifle("M1917 Enfield", 5)], gap=1.5, length=2.5, take=6),
    "rifle-de-far": dict(sources=[boom_rifle("M1917 Enfield", 100)], gap=1.5, length=3.0, take=6),
    # The bolt worked after a shot: the Mosin's for the Lebel, the Springfield's Mauser action for the Gewehr 98.
    "bolt-fr": dict(
        sources=[(BOOM, "GUNMech_Foley-Mosin Nagant M1891 Reload Fast_B00M_WW1FC_MS.wav")], gap=0.8, length=1.6, take=6
    ),
    "bolt-de": dict(
        sources=[(BOOM, "GUNMech_Foley-Springfield M1903 Reload Fast_B00M_WW1FC_MS.wav")], gap=0.8, length=1.6, take=6
    ),
    # One round each: the game fires a machine gun round by round.
    "mg-near": dict(
        sources=[(SUPERTHUMP, "STDSGN_WoWW2_Wep_MG_M1919_Machinegun_Single_Shot_X10.wav")], gap=0.3, length=0.9, take=8
    ),
    # Whole bursts heard from afar, played once a burst while a distant gun keeps firing.
    "mg-far": dict(
        sources=[
            (WARFARE, "warfare_t1a_mg_firing_forest_distant_MKH8060_1.wav"),
            (WARFARE, "warfare_t1a_mg_firing_forest_distant_MKH8060_2.wav"),
            (GDC, "M1919A4_Browning_Machine_Gun_.30cal_200m_left_behind_blanks_Triple_shots_x_1.wav"),
        ],
        gap=1.0,
        length=4,
        take=6,
    ),
    # Single rounds cracking past downrange.
    "crack": dict(
        sources=[
            (WARFARE, "warfare_t1a_mg_sonic_booms_forest_MKH8060_1.wav"),
            (WARFARE, "warfare_t3_mg_whizzes_ricochets_bullet_cracks_direct_Zoom_H4n.wav"),
        ],
        gap=0.4,
        length=0.7,
        take=8,
        floor=-14,
        isolated=True,
        tail=-30,
    ),
    # Rounds striking the ground close by.
    "bullet-impact": dict(
        sources=[(GDC, "PM_BBI_Bullet_Impact_Dirt_3.wav")],
        gap=0.5,
        length=1.2,
        take=1,
    ),
    # Field guns' shells outran their own sound: the crack of arrival and the burst come together, with no warning.
    "field-near": dict(
        sources=[
            (WARFARE, "Artillery 70mm - INCOMING - CSS5.wav"),
            (WARFARE, "Artillery 105mm - INCOMING - XY - MKH8040.wav"),
        ],
        gap=4,
        length=5,
        take=10,
        floor=-10,
    ),
    "field-far": dict(
        sources=[
            (DETONATIONS, "Artillery Grenade - EXPLOSION - Next to Car - DISTANT - CSS5.wav"),
            (DETONATIONS, "Artillery Grenade - EXPLOSION - Next to Car - DISTANT - CO-100k.wav"),
            (DETONATIONS, "C-4 Plastic Explosive - 2kg - EXPLOSION - Stone and Sand Debris - DISTANT - CSS5.wav"),
            (DETONATIONS, "Tank Mine - EXPLOSION - Mounted Under Car - DISTANT - CSS5.wav"),
        ],
        gap=3,
        length=6,
        take=4,
    ),
    "heavy-near": dict(sources=[(WARFARE, "Haubits 155mm - IMPACT - 50m - AB - MKH8020.wav")], gap=4, length=7, take=8),
    "heavy-far": dict(sources=[(WARFARE, "Haubits 155mm - IMPACT - 200m - AB - MKH8020.wav")], gap=4, length=8, take=8),
    # Earth and stones raining down after a burst close by.
    "debris": dict(
        sources=[
            (GDC, "soil and dirt debris heavy 13.wav"),
            (GDC, "Eradicated Tree - Stones Large Impacts Debris - 1 Meter. Debris,Stones,Soil,Impact,Rock,Impact,Fall,Various_04.wav"),
            (GDC, "dirt_collapse_05.wav"),
        ],
        gap=3,
        length=4,
        take=3,
        per_source=1,
    ),
    # Shrapnel bursts in the air with no crater: the Claymore is a shrapnel charge too.
    "shrapnel-near": dict(
        sources=[
            (DETONATIONS, "Claymore Mine - EXPLOSION x2 - CLOSE - ORTF - MKH8040.wav"),
            (DETONATIONS, "Claymore Mine - EXPLOSION x2 - CLOSE - Wide Stereo - MKH8060.wav"),
        ],
        gap=3,
        length=4,
        take=4,
    ),
    "shrapnel-far": dict(
        sources=[(DETONATIONS, "Claymore Mine - EXPLOSION x2 - DISTANT - AMBEO BLD.wav")], gap=3, length=5, take=2
    ),
    "grenade-near": dict(
        sources=[
            (DETONATIONS, "C-4 Plastic Explosive - 1kg - EXPLOSION - Wood Debris - CLOSE - ORTF - MKH8040.wav"),
            (DETONATIONS, "Artillery Grenade - EXPLOSION - Next to Car - CLOSE - ORTF - MKH8040.wav"),
        ],
        gap=3,
        length=4,
        take=2,
    ),
    "grenade-far": dict(
        sources=[
            (DETONATIONS, "C-4 Plastic Explosive - 1kg - EXPLOSION - Wood Debris - DISTANT - CSS5.wav"),
            (DETONATIONS, "Artillery Grenade - EXPLOSION - Next to Car - DISTANT - CO-100k.wav"),
        ],
        gap=3,
        length=5,
        take=2,
    ),
    # A grenade leaving the thrower's hand.
    "throw": dict(
        sources=[(GDC, "SFX CLOTH Foley Jacket Synthetic Soft Shell Whoosh Flutter.wav")], gap=1, length=1.2, take=3
    ),
    # Gas shells landed with a quiet pop and a hiss, and were often taken for duds.
    "gas-shell": dict(
        sources=[
            (DETONATIONS, "Smoke Grenade - BURST - Smoke Hiss - CLOSE - ORTF - MKH8040.wav"),
            (DETONATIONS, "Smoke Grenade - BURST - Smoke Hiss - CLOSE - H5.wav"),
        ],
        gap=3,
        length=5,
        take=2,
    ),
    # The batteries firing, kilometres behind each line.
    "battery-field": dict(
        sources=[(WARFARE, "Artillery 105mm - FIRING - 250m - In Front - XY - MKH8040.wav")], gap=4, length=6, take=5
    ),
    "battery-heavy": dict(
        sources=[(WARFARE, "Haubits 155mm - FIRING - 200m - In Front - ORTF - MKH8040.wav")], gap=4, length=7, take=6
    ),
    # A man hit: one take from each recording.
    "death": dict(
        sources=[
            (GDC, "Grunt_Pain_Male_BB_10_SCREAM LIBRARY_BRFX-004.wav"),
            (GDC, "Scream_Frightened_Male_BB_07_SCREAM LIBRARY_BRFX-004.wav"),
            (GDC, "Male_Shout-of-Pain_132.wav"),
            (GDC, "EMOTE Joshua, Man, Pain Hurt Grunt Big 03.wav"),
            (GDC, "VOXScrm_Male in Shock 4_344 Audio_Screaming.wav"),
            (GDC, "HMNBrth_Human, Adult, Male, Exhale, Mouth, Dying_UberDuo_INHL_09.wav"),
        ],
        gap=1,
        length=4,
        take=6,
        per_source=1,
    ),
    # Footsteps of men close by, on bare earth, snow and the stones of Fleury's ruins. Boots on duckboards and in
    # mud have no recording good enough yet (docs/sound.md); trench floors use the earth.
    "step-earth": dict(
        sources=[
            (GDC, "PM_SDNG_Stereo_Walk_Seamless_Loop_1.wav"),
            (GDC, "PM_SDNG_Single_Step_Footstep_19.wav"),
            (GDC, "PM_SDNG_Single_Step_Footstep_46.wav"),
        ],
        gap=0.12,
        length=0.5,
        take=10,
        floor=-10,
    ),
    "step-snow": dict(
        sources=[(GDC, "S23_SFX_Footsteps_Snow_Singles_Sequence.wav")], gap=0.15, length=0.6, take=8, floor=-10
    ),
    "step-stone": dict(
        sources=[(GDC, "015_Foley_Footsteps_Asphalt_Boot_Walk_Fast_Run_Jog_Close.wav")],
        gap=0.12,
        length=0.45,
        take=8,
        floor=-8,
    ),
    # Kit rattling on a running man: webbing, canteen and pack (Joshua Reinhardt's army gear).
    "gear": dict(sources=[(GDC, "PR ARMY GEAR ROOM_WALK_C414.wav")], take=8, loudest=0.6),
    # Fire crackling in the braziers and where shells set things alight, and crows taking off from the wire.
    "fire": dict(
        sources=[(GDC, "Burning_House_t4_Fire_low_intensity_with_crackling_MKH8060.wav")], take=1, bed=(5, 30, 3)
    ),
    # A flock lifting off the wire: the loudest stretches of a flock of crows calling (Detunized, recorded in a
    # European town), never pausing long enough to have separate takes.
    "crow": dict(sources=[(GDC, "Detunized_Urban-Crows_12c.wav")], take=4, loudest=2.5),
    # Men going over the top, and a counter-attack heard across the line: battle cries without words, as no French or
    # German voices are recorded yet.
    "charge": dict(
        sources=[
            (GDC, "Battle Cry, Charge, Screams, Army Attacking, Running 1.wav"),
            (GDC, "Male 2 - Grunt - Battle Cry - Long - Ehrlund M1.wav"),
        ],
        gap=2,
        length=6,
        take=2,
        per_source=1,
    ),
    # A man hit and still standing.
    "pain": dict(
        sources=[
            (GDC, "Grunts 16.wav"),
            (GDC, "Male_Grunt-Shout_317.wav"),
            (GDC, "Male 1 - Breathing - Gasping - Ehrlund M1.wav"),
        ],
        gap=0.6,
        length=2,
        take=6,
        floor=-12,
    ),
    # The gas alarm: an empty brass shell case struck like a gong.
    "gas-gong": dict(
        sources=[
            (GDC, "Iron - Thick - HIT - Hammer.wav"),
            (GDC, "Spade - HIT - Drumstick - Ring - Mute.wav"),
        ],
        gap=0.5,
        length=2.5,
        take=4,
    ),
    # Weather and the front, looped and set by the game: rain on leaves, a gusting wind, and the whole front's guns
    # from far off, heard as the camera climbs.
    "rain": dict(sources=[(GDC, "rain_shower of rain_steady rain_forest_leaves.wav")], take=1, bed=(0, 19, 3)),
    "wind": dict(sources=[(GDC, "wind_blustery_08_loop.wav")], take=1, bed=(0, None, 0)),
    # Night: crickets and owls on a warm night (Ivo Vicic, a European summer night), wind through dark woods on a
    # cold one (Systematic Sound).
    "night-warm": dict(sources=[(GDC, "05 Crickets_owls_summer night.WAV")], take=1, bed=(10, 90, 4)),
    "night-cold": dict(
        sources=[(GDC, "AMBForst_Nighttime-Woodlands Windy Trees Rustling Quiet_SYSO_SYSO009.wav")],
        take=1,
        bed=(20, 90, 4),
    ),
    # Rain dripping onto corrugated iron down in a trench, and the wire's belts singing in the wind (contact mic on a
    # wire fence) close by.
    "rain-trench": dict(sources=[(GDC, "PM_RD_DESIGNED_DRIPPY_ON_IRON_PLATE_3.wav")], take=1, bed=(5, 60, 3)),
    "wire-wind": dict(sources=[(GDC, "MAFX005 wire fence contact mic wind 19.WAV")], take=1, bed=(10, 80, 4)),
    # The controlled soldier's breath, short and broken, while he is pinned down.
    "pinned-breath": dict(
        sources=[(GDC, "HUMAN BREATH Male_Mouth Inhale and Exhale Like Got Frightened Intermittent _C.wav")],
        take=1,
        bed=(0.5, 12.5, 1.5),
    ),
    "front-roar": dict(
        sources=[(WARFARE, "VAR DISTANT FIRING 01 - AB - MKH8020.wav")], take=1, bed=(10, 100, 4)
    ),
    "thunder": dict(
        sources=[
            (GDC, "thunder_mountainous_distant_03.wav"),
            (GDC, "thunder_clap_04.wav"),
            (GDC, "thunder_strike_03.wav"),
            (GDC, "THUN_InsJ_Thunder_Distant_01_EQ.wav"),
            (GDC, "THUN_InsJ_Thunder_Very-Close_Rain_03.wav"),
        ],
        gap=20,
        length=16,
        take=5,
        per_source=1,
    ),
    # Breathing through the mask while the controlled soldier wears it: a man's slow mouth breathing (UberDuo), damped
    # as if through the rubber and the cloth pad, until breathing through a period mask is recorded.
    "mask-breath": dict(
        sources=[(GDC, "HMNBrth_Human, Adult, Male, Breathe, Mouth, Slow,_UberDuo_INHL.wav")],
        take=1,
        bed=(0, None, 0),
        lowpass=1400,
    ),
}

# Soldiers' shouted lines, generated with ElevenLabs by scripts/generate-voices.mjs into vendor/audio/elevenlabs. Only
# the takes chosen by ear, listed under "keep" in VOICE_LINES, are used. To choose among new takes, --shortlist lists
# those worth hearing: they say the scripted words (WORDS_MATCH, against their transcript) and are really shouted (at
# least SHOUT_MIN of their energy from 1 to 4 kHz, where a bellow carries and a spoken line doesn't), the best
# TAKES_PER_LINE of each line.
VOICES = "elevenlabs"
VOICE_LINES = Path(__file__).resolve().parent / "voice-lines.json"
WORDS_MATCH = 0.9
SHOUT_MIN = 0.4
TAKES_PER_LINE = 2

# The ringing in the ears after a shell bursts close by: a high tone with a faint hiss, made here rather than recorded.
EAR_RING = dict(seconds=4.0, tone=3400, wobble=0.6, hiss=0.04)


def find(vendor, folder, name):
    """Looks up a file by name under one library: folder names in the bundles carry odd spacing and characters."""
    matches = [path for path in (vendor / folder).rglob("*.wav") if path.name == name]
    if not matches:
        raise FileNotFoundError(f"{name} not found under {vendor / folder}")
    return matches[0]


def load(path):
    """The recording as mono samples at RATE."""
    sound = aud.Sound(str(path)).rechannel(aud.CHANNELS_MONO).resample(RATE, True)
    return np.asarray(sound.data(), dtype=np.float32).reshape(-1)


def envelope_db(samples):
    """Peak level of each 10 ms frame in dB below the recording's loudest."""
    frames = len(samples) // HOP
    envelope = np.abs(samples[: frames * HOP]).reshape(frames, HOP).max(axis=1)
    return 20 * np.log10(np.maximum(envelope, 1e-9) / max(float(envelope.max()), 1e-9))


def takes(samples, gap, floor):
    """(onset frame, peak dB) of each take: where the envelope rises above -30 dB after `gap` seconds of quiet."""
    level = envelope_db(samples)
    found = []
    quiet_since = -1e9
    for frame, db in enumerate(level):
        if db > -30:
            if (frame - quiet_since) / 100 >= gap:
                found.append((max(0, frame - 1), float(level[frame : frame + 100].max())))
            quiet_since = frame
    return [take for take in found if take[1] >= floor]


def take_span(level, onset, following, longest, tail=TAIL_DB):
    """Frames from a take's onset until it dies away (stays `tail` dB below its peak), the next take starts, or the
    cue's longest length runs out. The third value says whether it died away in time."""
    limit = min(len(level), following, onset + (int(longest * 100) if longest else len(level)))
    peak = float(level[onset:limit].max())
    loud = np.nonzero(level[onset:limit] > peak + tail)[0]
    end = onset + (int(loud[-1]) + 5 if len(loud) else limit - onset)
    died_away = end < limit or limit == len(level)
    return onset, min(end, limit), died_away


def lead_span(level, onset, following, lead):
    """The `lead` seconds before a take first comes within 3 dB of its loudest (the shell landing), which ends the cut."""
    stop = min(len(level), following)
    window = level[onset:stop]
    arrival = onset + int(np.argmax(window >= window.max() - 3))
    return max(0, arrival - int(lead * 100)), arrival


def loudness(clip):
    """RMS of the loudest 300 ms, a stand-in for short-term loudness."""
    window = int(0.3 * RATE)
    if len(clip) <= window:
        return float(np.sqrt(np.mean(clip**2)))
    squares = np.convolve(clip**2, np.ones(window) / window, mode="valid")
    return float(np.sqrt(squares.max()))


def finish(clip, fade_in=0.0, fade_out=FADE):
    clip = clip.copy()
    if fade_in:
        rise = min(len(clip), int(fade_in * RATE))
        clip[:rise] *= np.linspace(0, 1, rise, dtype=np.float32)
    fall = min(len(clip), int(fade_out * RATE))
    if fall:
        clip[len(clip) - fall :] *= np.linspace(1, 0, fall, dtype=np.float32)
    return clip


def limit(clip):
    """Holds peaks to PEAK: the gain drops at once to catch a peak and recovers over RELEASE."""
    block = RATE // 1000
    blocks = -(-len(clip) // block)
    padded = np.pad(np.abs(clip), (0, blocks * block - len(clip)))
    needed = np.minimum(1.0, PEAK / np.maximum(padded.reshape(blocks, block).max(axis=1), 1e-9))
    recover = 1 - np.exp(-1 / (RELEASE * 1000))
    gain = np.empty(blocks)
    current = 1.0
    for index, want in enumerate(needed):
        current = want if want < current else current + (want - current) * recover
        gain[index] = current
    return clip * np.repeat(gain, block)[: len(clip)].astype(np.float32)


def match_loudness(clips):
    """Brings every variation to the cue's median loudness, raising quiet ones by up to MAX_BOOST_DB and limiting
    their peaks, so no variation stands out from the rest."""
    levels = [loudness(clip) for clip in clips]
    target = float(np.median(levels)) if levels else 0.0
    boost = 10 ** (MAX_BOOST_DB / 20)
    return [limit(clip * min(target / max(level, 1e-9), boost)) for clip, level in zip(clips, levels)]


def bed_clip(samples, start, length, crossfade):
    """A loop cut from a continuous recording, its end crossfaded into its start."""
    first = int(start * RATE)
    last = len(samples) if length is None else min(len(samples), first + int(length * RATE))
    clip = samples[first:last].copy()
    fade = int(crossfade * RATE)
    if fade and last + fade <= len(samples):
        ramp = np.linspace(0, 1, fade, dtype=np.float32)
        clip[:fade] = clip[:fade] * ramp + samples[last : last + fade] * (1 - ramp)
    return clip


def loudest_clips(samples, seconds, count):
    """The `count` loudest stretches of `seconds`, none overlapping, faded in and out."""
    window = int(seconds * RATE)
    hop = window // 4
    starts = range(0, max(1, len(samples) - window), hop)
    energy = sorted(((float(np.mean(samples[start : start + window] ** 2)), start) for start in starts), reverse=True)
    chosen = []
    for _, start in energy:
        if all(abs(start - other) >= window for other in chosen):
            chosen.append(start)
        if len(chosen) == count:
            break
    return [finish(samples[start : start + window], fade_in=0.08, fade_out=0.5) for start in sorted(chosen)]


def lowpass(clip, frequency):
    """The clip with its highs above `frequency` taken off, as through a rubber mask."""
    filtered = aud.Sound.buffer(clip.reshape(-1, 1), RATE).lowpass(frequency, 0.9)
    return np.asarray(filtered.data(), dtype=np.float32).reshape(-1)[: len(clip)]


def cue_clips(vendor, cue):
    clips = raw_cue_clips(vendor, cue)
    if "lowpass" in cue:
        clips = match_loudness([lowpass(clip, cue["lowpass"]) for clip in clips])
    return clips


def raw_cue_clips(vendor, cue):
    if "loudest" in cue:
        samples = load(find(vendor, *cue["sources"][0]))
        return match_loudness(loudest_clips(samples, cue["loudest"], cue["take"]))
    if "bed" in cue:
        return match_loudness([bed_clip(load(find(vendor, folder, file)), *cue["bed"]) for folder, file in cue["sources"]])
    candidates = []
    for folder, file in cue["sources"]:
        samples = load(find(vendor, folder, file))
        level = envelope_db(samples)
        found = takes(samples, cue["gap"], cue.get("floor", -6))
        onsets = [onset for onset, _ in found] + [len(level)]
        cuts = []
        for index, (onset, peak) in enumerate(found):
            if "lead" in cue:
                start, end = lead_span(level, onset, onsets[index + 1], cue["lead"])
                cuts.append((peak, finish(samples[start * HOP : end * HOP], fade_in=0.3, fade_out=0.03)))
                continue
            start, end, died_away = take_span(level, onset, onsets[index + 1], cue["length"], cue.get("tail", TAIL_DB))
            if cue.get("isolated") and not died_away:
                continue
            clip = samples[start * HOP : end * HOP]
            if not cue.get("loop"):
                clip = finish(clip, fade_out=FADE if died_away else LONG_FADE)
            cuts.append((peak, clip))
        cuts.sort(key=lambda cut: -cut[0])
        candidates.append([clip for _, clip in cuts[: cue.get("per_source", cue["take"])]])
    # Alternate between sources so every recording is represented.
    chosen = []
    while len(chosen) < cue["take"] and any(candidates):
        for source in candidates:
            if source and len(chosen) < cue["take"]:
                chosen.append(source.pop(0))
    return match_loudness(chosen)


def ear_ring():
    time = np.arange(int(EAR_RING["seconds"] * RATE)) / RATE
    tone = np.sin(2 * np.pi * EAR_RING["tone"] * time) * (1 + 0.05 * np.sin(2 * np.pi * EAR_RING["wobble"] * time))
    hiss = np.random.default_rng(1916).normal(0, EAR_RING["hiss"], len(time))
    shape = np.minimum(1, time / 0.08) * np.exp(-time / (EAR_RING["seconds"] / 3))
    clip = ((tone + hiss) * shape).astype(np.float32)
    return clip * (PEAK / float(np.abs(clip).max()))


def words(text):
    """A line's words for comparing: no delivery tags, punctuation or case."""
    text = re.sub(r"\[[^\]]*\]", " ", text).lower()
    return " ".join(re.sub(r"[^\w\s]", " ", text).split())


def shout(clip):
    """Share of a clip's energy from 1 to 4 kHz, over its loud moments."""
    hop = 2048
    frames = [clip[i : i + hop] for i in range(0, len(clip) - hop, hop)]
    loud = [frame for frame in frames if np.sqrt(np.mean(frame**2)) > 0.02]
    if not loud:
        return 0.0
    spectrum = np.mean([np.abs(np.fft.rfft(frame * np.hanning(hop))) ** 2 for frame in loud], axis=0)
    freqs = np.fft.rfftfreq(hop, 1 / RATE)
    return float(np.sum(spectrum[(freqs >= 1000) & (freqs <= 4000)]) / np.sum(spectrum))


def trimmed(clip):
    """The clip without the silence before and after the voice."""
    level = envelope_db(clip)
    voiced = np.nonzero(level > -45)[0]
    if not len(voiced):
        return clip
    return finish(clip[max(0, voiced[0] - 2) * HOP : (voiced[-1] + 6) * HOP], fade_out=0.05)


def voice_takes(vendor):
    """Every generated take that's on disk, by name: its line, cue, script and transcript."""
    listing = vendor / VOICES / "takes.json"
    if not listing.exists():
        return {}
    takes = json.loads(listing.read_text(encoding="utf-8"))
    return {name: take for name, take in takes.items() if (vendor / VOICES / f"{name}.mp3").exists()}


def voice_cues(vendor):
    """Each voice cue's takes, as chosen by ear, every shout matched to the same loudness: one man's cry for help is as
    loud as another's alarm, in either language."""
    takes = voice_takes(vendor)
    chosen = []
    for name in json.loads(VOICE_LINES.read_text(encoding="utf-8")).get("keep", []):
        if name not in takes:
            print(f"[sound-effects] kept take {name} isn't in {VOICES}; generate it first", flush=True)
            continue
        chosen.append((takes[name]["cue"], trimmed(load(vendor / VOICES / f"{name}.mp3"))))
    cues = {}
    for (cue, _), clip in zip(chosen, match_loudness([clip for _, clip in chosen])):
        cues.setdefault(cue, []).append(clip)
    return cues


def shortlist(vendor):
    """Prints the takes not yet kept that are worth hearing, the best of each line first, to choose among by ear."""
    kept = set(json.loads(VOICE_LINES.read_text(encoding="utf-8")).get("keep", []))
    by_line = {}
    for name, take in voice_takes(vendor).items():
        match = difflib.SequenceMatcher(None, words(take["text"]), words(take.get("transcript", ""))).ratio()
        if name in kept or match < WORDS_MATCH:
            continue
        score = shout(load(vendor / VOICES / f"{name}.mp3"))
        if score >= SHOUT_MIN:
            by_line.setdefault(take["line"], []).append((score, name))
    for line, takes in sorted(by_line.items()):
        for score, name in sorted(takes, reverse=True)[:TAKES_PER_LINE]:
            print(f"{name}: shouted {score:.0%}", flush=True)


def write(path, clip, bitrate=BITRATE):
    aud.Sound.buffer(clip.reshape(-1, 1), RATE).write(
        str(path),
        rate=RATE,
        channels=aud.CHANNELS_MONO,
        format=aud.FORMAT_FLOAT32,
        container=aud.CONTAINER_OGG,
        codec=aud.CODEC_OPUS,
        bitrate=bitrate,
    )


def replace(source, target, tries=30):
    """Moves a built file into place, retrying while something (the dev server sending it) holds the old one open.
    A file still locked after a few seconds keeps its old version, with a warning: stale, but whole."""
    for _ in range(tries):
        try:
            os.replace(source, target)
            return
        except PermissionError:
            time.sleep(0.2)
    print(f"[sound-effects] {target.name} is locked; kept the previous version", flush=True)


def build(vendor, output):
    # Built aside and swapped in at the end, so a game loading meanwhile never reads a file half written.
    final = output / "sfx"
    sfx = output / "sfx.building"
    shutil.rmtree(sfx, ignore_errors=True)
    sfx.mkdir(parents=True)
    manifest = {}
    for name, cue in CUES.items():
        clips = cue_clips(vendor, cue)
        for index, clip in enumerate(clips):
            write(sfx / f"{name}-{index}.ogg", clip, BED_BITRATE if "bed" in cue else BITRATE)
        manifest[name] = {"variations": len(clips), "loop": cue.get("loop", False) or "bed" in cue}
        lengths = ", ".join(f"{len(clip) / RATE:.1f}" for clip in clips)
        print(f"[sound-effects] {name}: {len(clips)} variations ({lengths} s)", flush=True)
    for name, clips in voice_cues(vendor).items():
        for index, clip in enumerate(clips):
            write(sfx / f"{name}-{index}.ogg", clip)
        manifest[name] = {"variations": len(clips), "loop": False}
        print(f"[sound-effects] {name}: {len(clips)} takes", flush=True)
    write(sfx / "ear-ring-0.ogg", ear_ring())
    manifest["ear-ring"] = {"variations": 1, "loop": False}
    print("[sound-effects] ear-ring: made", flush=True)
    (sfx / "sounds.json").write_text(json.dumps(manifest, indent=2) + "\n")
    # Moved in file by file (os.replace swaps each atomically), the manifest last, then stale files removed: the dev
    # server may hold the folder open, so it can't be swapped whole on Windows.
    final.mkdir(parents=True, exist_ok=True)
    built = sorted(sfx.iterdir(), key=lambda path: path.name == "sounds.json")
    for path in built:
        replace(path, final / path.name)
    names = {path.name for path in built}
    for stale in final.iterdir():
        if stale.name not in names:
            stale.unlink()
    shutil.rmtree(sfx, ignore_errors=True)


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) == 2 and arguments[0] == "--shortlist":
        shortlist(Path(arguments[1]).resolve())
    elif len(arguments) == 2:
        build(Path(arguments[0]).resolve(), Path(arguments[1]).resolve())
    else:
        sys.exit(
            "usage: blender -b --factory-startup -P scripts/build-sound-effects.py -- <vendor/audio> <output>\n"
            "       blender -b --factory-startup -P scripts/build-sound-effects.py -- --shortlist <vendor/audio>"
        )
