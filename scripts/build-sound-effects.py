"""Builds the battle's sound effects from the purchased libraries in vendor/audio.

    blender -b --factory-startup -P scripts/build-sound-effects.py -- vendor/audio .asset-cache/level

Writes <output>/sfx/<cue>-<n>.ogg (mono Opus, one file per variation) and <output>/sfx/sounds.json, which lists each
cue's variation count for apps/client/src/audio/battle-sounds.ts. The libraries are paid or royalty-free but not CC0, so
the files ship only inside the encrypted asset pack, like the rest of the level kit.

Most source recordings hold a run of takes (ten rifle shots, fifteen shells) separated by silence. Each cue finds the
separate takes, keeps the loudest, cuts each from its onset to a fixed length with a fade, and normalises it, so the
game can pick a variation at random and set the level itself.
"""

import json
import sys
from pathlib import Path

import aud
import numpy as np

RATE = 48000
BITRATE = 64000
HOP = RATE // 100
PEAK = 10 ** (-1 / 20)

BOOM = "boom-world-war-i-firearms"
WARFARE = "pole-position-warfare-library"
DETONATIONS = f"{WARFARE}/Detonations and Explosions"
SUPERTHUMP = "superthump-weapons-of-wwii"
GDC = "sonniss-gdc"


def boom_rifle(rifle, metres):
    return (BOOM, f"GUNRif_RI-{rifle} Single Shot {metres}m_B00M_WW1FC_XY.wav")


# Each cue: its sources as (folder under vendor/audio, file name), the gap of quiet that separates takes, how long each
# cut runs, how many variations to keep, and how far below the loudest take (dB) a take may be and still be used.
# Rifles stand in for the period ones: the Mosin-Nagant 1891 for the Lebel (both long, full-power 1890s rifles) and the
# M1917 Enfield's Mauser-pattern action for the Gewehr 98. The Browning M1919 stands in for the Hotchkiss and MG 08,
# whose rate of fire it shares; the MG 42 fires far too fast.
CUES = {
    "rifle-fr-near": dict(sources=[boom_rifle("Mosin Nagant 1891", 5)], gap=1.5, length=2.5, take=6),
    "rifle-fr-far": dict(sources=[boom_rifle("Mosin Nagant 1891", 100)], gap=1.5, length=3.0, take=6),
    "rifle-de-near": dict(sources=[boom_rifle("M1917 Enfield", 5)], gap=1.5, length=2.5, take=6),
    "rifle-de-far": dict(sources=[boom_rifle("M1917 Enfield", 100)], gap=1.5, length=3.0, take=6),
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
        length=2.5,
        take=6,
    ),
    # Rounds cracking past downrange.
    "crack": dict(
        sources=[(WARFARE, "warfare_t3_mg_whizzes_ricochets_bullet_cracks_direct_Zoom_H4n.wav")],
        gap=0.6,
        length=0.8,
        take=8,
        floor=-14,
    ),
    # Field guns' shells outran their own sound: the crack of arrival and the burst come together, with no warning.
    "field-near": dict(
        sources=[
            (WARFARE, "Artillery 70mm - INCOMING - CSS5.wav"),
            (WARFARE, "Artillery 105mm - INCOMING - XY - MKH8040.wav"),
        ],
        gap=4,
        length=4.5,
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
        length=5,
        take=4,
    ),
    "heavy-near": dict(sources=[(WARFARE, "Haubits 155mm - IMPACT - 50m - AB - MKH8020.wav")], gap=4, length=6, take=8),
    "heavy-far": dict(sources=[(WARFARE, "Haubits 155mm - IMPACT - 200m - AB - MKH8020.wav")], gap=4, length=7, take=8),
    # Shrapnel bursts in the air with no crater: the Claymore is a shrapnel charge too.
    "shrapnel-near": dict(
        sources=[
            (DETONATIONS, "Claymore Mine - EXPLOSION x2 - CLOSE - ORTF - MKH8040.wav"),
            (DETONATIONS, "Claymore Mine - EXPLOSION x2 - CLOSE - Wide Stereo - MKH8060.wav"),
        ],
        gap=3,
        length=3.5,
        take=4,
    ),
    "shrapnel-far": dict(
        sources=[(DETONATIONS, "Claymore Mine - EXPLOSION x2 - DISTANT - AMBEO BLD.wav")], gap=3, length=4, take=2
    ),
    "grenade-near": dict(
        sources=[
            (DETONATIONS, "C-4 Plastic Explosive - 1kg - EXPLOSION - Wood Debris - CLOSE - ORTF - MKH8040.wav"),
            (DETONATIONS, "Artillery Grenade - EXPLOSION - Next to Car - CLOSE - ORTF - MKH8040.wav"),
        ],
        gap=3,
        length=3.5,
        take=2,
    ),
    "grenade-far": dict(
        sources=[
            (DETONATIONS, "C-4 Plastic Explosive - 1kg - EXPLOSION - Wood Debris - DISTANT - CSS5.wav"),
            (DETONATIONS, "Artillery Grenade - EXPLOSION - Next to Car - DISTANT - CO-100k.wav"),
        ],
        gap=3,
        length=4,
        take=2,
    ),
    # Gas shells landed with a quiet pop and a hiss, and were often taken for duds.
    "gas-shell": dict(
        sources=[
            (DETONATIONS, "Smoke Grenade - BURST - Smoke Hiss - CLOSE - ORTF - MKH8040.wav"),
            (DETONATIONS, "Smoke Grenade - BURST - Smoke Hiss - CLOSE - H5.wav"),
        ],
        gap=3,
        length=4,
        take=2,
    ),
    # The batteries firing, kilometres behind each line.
    "battery-field": dict(
        sources=[(WARFARE, "Artillery 105mm - FIRING - 250m - In Front - XY - MKH8040.wav")], gap=4, length=5, take=5
    ),
    "battery-heavy": dict(
        sources=[(WARFARE, "Haubits 155mm - FIRING - 200m - In Front - ORTF - MKH8040.wav")], gap=4, length=6, take=6
    ),
    # A man hit: one take from each recording.
    "death": dict(
        sources=[
            (GDC, "voice_male_b_death_low_09.wav"),
            (GDC, "Grunt_Pain_Male_BB_10_SCREAM LIBRARY_BRFX-004.wav"),
            (GDC, "Scream_Frightened_Male_BB_07_SCREAM LIBRARY_BRFX-004.wav"),
            (GDC, "Male_Shout-of-Pain_132.wav"),
            (GDC, "EMOTE Joshua, Man, Pain Hurt Grunt Big 03.wav"),
            (GDC, "VOXScrm_Male in Shock 4_344 Audio_Screaming.wav"),
            (GDC, "HMNBrth_Human, Adult, Male, Exhale, Mouth, Dying_UberDuo_INHL_09.wav"),
        ],
        gap=1,
        length=3,
        take=7,
        per_source=1,
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
    # Breathing through the mask while the controlled soldier wears it.
    "mask-breath": dict(
        sources=[(GDC, "voice_male_breathing_mask_loop_run_02.wav")], gap=60, length=None, take=1, loop=True
    ),
}
FADE = 0.15


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


def takes(samples, gap, floor):
    """(onset sample, peak) of each take: where the 10 ms envelope rises above -30 dB after `gap` seconds of quiet."""
    frames = len(samples) // HOP
    envelope = np.abs(samples[: frames * HOP]).reshape(frames, HOP).max(axis=1)
    top = max(float(envelope.max()), 1e-9)
    loud = 20 * np.log10(np.maximum(envelope, 1e-9) / top) > -30
    found = []
    quiet_since = -1e9
    for frame in range(frames):
        if loud[frame]:
            if (frame - quiet_since) / 100 >= gap:
                peak = float(envelope[frame : frame + 100].max())
                found.append((max(0, frame * HOP - HOP), peak))
            quiet_since = frame
    return [(onset, peak) for onset, peak in found if 20 * np.log10(peak / top) >= floor]


def cut(samples, onset, length, loops):
    clip = samples[onset:] if length is None else samples[onset : onset + int(length * RATE)]
    clip = clip.copy()
    if not loops:
        fade = min(len(clip), int(FADE * RATE))
        clip[len(clip) - fade :] *= np.linspace(1, 0, fade, dtype=np.float32)
    peak = float(np.abs(clip).max())
    return clip * (PEAK / peak) if peak > 0 else clip


def build(vendor, output):
    sfx = output / "sfx"
    sfx.mkdir(parents=True, exist_ok=True)
    for stale in sfx.glob("*.ogg"):
        stale.unlink()
    manifest = {}
    for name, cue in CUES.items():
        loops = cue.get("loop", False)
        candidates = []
        for folder, file in cue["sources"]:
            samples = load(find(vendor, folder, file))
            found = sorted(takes(samples, cue["gap"], cue.get("floor", -6)), key=lambda take: -take[1])
            candidates.append([(samples, onset) for onset, _ in found[: cue.get("per_source", cue["take"])]])
        # Alternate between sources so every recording is represented.
        chosen = []
        while len(chosen) < cue["take"] and any(candidates):
            for source in candidates:
                if source and len(chosen) < cue["take"]:
                    chosen.append(source.pop(0))
        for index, (samples, onset) in enumerate(chosen):
            clip = cut(samples, onset, cue["length"], loops)
            aud.Sound.buffer(clip.reshape(-1, 1), RATE).write(
                str(sfx / f"{name}-{index}.ogg"),
                rate=RATE,
                channels=aud.CHANNELS_MONO,
                format=aud.FORMAT_FLOAT32,
                container=aud.CONTAINER_OGG,
                codec=aud.CODEC_OPUS,
                bitrate=BITRATE,
            )
        manifest[name] = {"variations": len(chosen), "loop": loops}
        print(f"[sound-effects] {name}: {len(chosen)} variations", flush=True)
    (sfx / "sounds.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) != 2:
        sys.exit("usage: blender -b --factory-startup -P scripts/build-sound-effects.py -- <vendor/audio> <output>")
    build(Path(arguments[0]).resolve(), Path(arguments[1]).resolve())
