"""Builds the battlefield level kit from converted Synty packs: one GLB of props and four ground textures.

Imports every piece in PIECES from the GLBs written by convert-unity-models.py, joins each into one mesh object named
after the piece, bakes its transform (War Pack models convert at 1/100 scale), merges the duplicate palette materials
every GLB carries, halves the palette textures to 1K, adds a decimated far-distance copy of each heavy piece, and
exports one GLB. Pieces keep their source origin, so trench
kit pieces stay aligned on Synty's grid.

Smoke and mist sprites come from the Particle FX pack; ambience from the Sonniss GDC bundles in vendor/audio. Ground textures come from the Nature pack's tiling ground set. Each is graded so its mean colour matches the flat
surface colour the terrain falls back to (apps/client/src/palette.ts), keeping the muted palette whether or not the
textures are loaded.

Output is git-ignored and must never ship raw (paid assets; see docs/assets/licensing.md). The dev server serves it at
/level-kit/; production builds load nothing and fall back to greybox.

Usage (headless Blender):
  blender -b --factory-startup -P scripts/build-level-kit.py -- <converted unity dir> <vendor unity dir> <output dir>

Example:
  blender -b --factory-startup -P scripts/build-level-kit.py -- .asset-cache/unity vendor/unity .asset-cache/level
"""

import re
import shutil
import sys
from pathlib import Path

import bpy
import numpy as np

WAR_MAP = "POLYGON - War Map WWI - Art by Synty"
WAR_PACK = "POLYGON - War Pack - Art by Synty"
NATURE = "POLYGON - Nature Pack - Art by Synty"

# (pack, source model name without .glb). War Pack models are scaled up from their 1/100 conversion.
PIECES = [
    # Trench kit: deep trench sections on a 3.22 m grid, 2.2 m between the revetments.
    *[
        (WAR_MAP, f"SM_Env_Trench_Deep_{name}")
        for name in [
            "Straight_01",
            "Straight_02",
            "Straight_03",
            "Straight_Dugout_01",
            "Corner_01",
            "Intersection_01",
            "Intersection_02",
            "End_02",
            "Bunker_01",
        ]
    ],
    *[(WAR_MAP, f"SM_Env_Trench_{name}") for name in ["Firestep_02", "Firestep_05", "Mound_01", "Mound_02", "Pole_01"]],
    *[
        (WAR_MAP, f"SM_Prop_{name}")
        for name in [
            "Ladder_01",
            "Ladder_02",
            "Trench_Bridge_01",
            "Trench_Bridge_02",
            "Trench_Planks_01",
            "Trench_Planks_02",
            "Iron_Sheet_01",
            "Iron_Sheet_02",
            "Barricade_01",
            "Barricade_03",
            "Wire_Fence_01",
            "Wire_Fence_02",
            "Wire_Fence_03",
            "Wire_Fence_04",
            "Wire_Fence_Tangled_01",
            "Wire_Fence_Tangled_02",
            "Wire_Fence_Tangled_03",
        ]
    ],
    (WAR_MAP, "SM_Env_Crater_Water_01"),
    (WAR_MAP, "SM_Env_Tree_Dead_04"),
    *[
        (WAR_MAP, f"SM_Gen_{name}")
        for name in [
            "Env_Tree_Dead_01",
            "Env_Tree_Dead_02",
            "Env_Tree_Dead_03",
            "Env_Stump_01",
            "Env_Stump_02",
            "Env_Stump_03",
            "Env_Log_01",
            "Env_Log_02",
            "Env_Rock_03",
            "Env_Rock_05",
            "Prop_Crate_01",
            "Prop_Crate_02",
            "Prop_Barrel_Wood_01",
            "Prop_Sack_Stack_01",
            "Wep_Spade_01",
        ]
    ],
    *[
        (WAR_MAP, f"SM_{name}")
        for name in [
            "Veh_Artillery_01",
            "Veh_Artillery_01_Destroyed",
            "Veh_German_Plane_01_Destroyed",
            "Wep_German_HeavyMachineGun_01",
            "Wep_German_HeavyMachineGun_Tripod_01",
            "Wep_British_HeavyMachineGun_01",
            "Wep_British_HeavyMachineGun_Tripod_01",
        ]
    ],
    *[
        (WAR_PACK, f"SM_{name}")
        for name in [
            "Bld_City_Destroyed_01",
            "Bld_City_Destroyed_02",
            "Bld_City_Destroyed_03",
            "Bld_TownHouse_Rubble_01",
            "Bld_TownHouse_Rubble_02",
            "Bld_Bunker_01",
            "Env_Rubble_Pile_01",
            "Env_Rubble_Pile_02",
            "Env_Brick_Debris_01",
            "Env_Brick_Debris_02",
            "Env_Brick_Debris_03",
            "Env_StoneWall_Rubble_01",
            "Env_StoneWall_Rubble_02",
            "Env_StoneWall_Rubble_03",
            "Env_StoneWall_Rubble_04",
            "Env_Tree_Destroyed_01",
            "Env_Tree_Destroyed_02",
            "Env_Tree_Destroyed_03",
            "Env_Tree_Destroyed_04",
            "Env_Tree_Shards_01",
            "Env_Tree_Shards_02",
            "Env_Tree_Shards_03",
            "Env_Tree_Branch_01",
            "Env_Tree_Branch_02",
            "Env_Sandbag_Wall_01",
            "Env_Sandbag_Wall_Long_01",
            "Env_Sandbag_Wall_Curved_01",
            "Env_Sandbag_Pile_01",
            "Prop_Crate_Pile_01",
            "Prop_Barrel_Pile_01",
        ]
    ],
]

WAR_PACK_SCALE = 100
PALETTE_SIZE = 1024
# Synty's generic props (SM_Gen_*) have no prefab in the pack, so the converter gave them the pack's palette. They use
# the generic palette instead, in its weathered B colours: pale, splintered wood reads against the mud.
GENERIC_PREFIX = "Gen_"
GENERIC_PALETTE = Path("Synty/PolygonGeneric/Textures/Alts/Generic_01_B.png")

# Ground layers: (output name, Nature pack texture, target mean colour as hex, saturation kept, mirror). Target means
# match surfaceColors in apps/client/src/palette.ts.
GROUND = [
    ("grass", "Grass_02", "55593d", 0.4, False),
    ("mud", "Mud_01", "574636", 0.9, False),
    ("chalk", "Pebbles_Sand_01", "8e897b", 0.4, False),
    ("churned", "Mud_01", "43372b", 0.8, True),
]
# Each layer's normal map, written as "<layer>_normal.png". Mirrored layers get their normal map mirrored to match.
GROUND_NORMALS = {
    "grass": "Grass_01_Normals",
    "mud": "Mud_01_Normal",
    "chalk": "Pebbles_01_Normals",
    "churned": "Mud_01_Normal",
}
GROUND_SIZE = 1024

# Ambience from the Sonniss GDC bundles (vendor/audio/sonniss-gdc, royalty-free, not CC0: pack only).
# (output name, file, start in seconds, length in seconds, loops). Loops get their ends crossfaded so they repeat
# without a seam.
AUDIO = [
    (
        "no-mans-land",
        "2024/Systematic Sound - General Ambience Series - Rural Countryside 01/"
        "AMBRurl_Meadow Open Plane Windy Deep Rumble_SYSO_SYSO011-1.wav",
        10,
        90,
        True,
    ),
    ("wood", "2018/Ivo Vicic - Bora wind - European local wind/31 Wind_squeaking_tree_leaves_branches_bird.wav", 5, 90, True),
    ("rear", "2016/Mindful Audio - Woodland Atmosphere/MAFX001 wind robin blackbird 01.wav", 5, 90, True),
    ("ruins", "2016/Detunized - Urban Crows/Detunized_Urban-Crows_01.wav", 2, 60, True),
    ("guns-far-1", "2017/Gamemaster Audio -  Explosion Sound Pack/explosion_far_distant_02.wav", 0, 3.6, False),
    ("guns-far-2", "2017/Pole Position - The Warfare Library/warfare_t1b_cannon_firing_forest_distant_MKH8060_2.wav", 0, 9, False),
]
AUDIO_CROSSFADE = 3
AUDIO_RATE = 48000
AUDIO_BITRATE = 64000

PARTICLE_FX = "POLYGON - Particle FX Pack - Art by Synty"
# Effect sprites: (output name, Particle FX pack texture). Synty's flat, faceted smoke puff and a soft spot for mist.
FX = [("smoke", "PolygonParticles_Smoke_01"), ("mist", "PolygonParticles_Soft_Spot_01")]

DUPLICATE_SUFFIX = re.compile(r"\.\d{3}$")
# Pieces heavier than this get a decimated far-distance copy, named "<piece>_LOD1", aiming for LOD1_TRIANGLES.
LOD1_FROM_TRIANGLES = 700
LOD1_TRIANGLES = 450
LOD1_MIN_RATIO = 0.3


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) != 3:
        sys.exit(__doc__)
    return Path(args[0]).resolve(), Path(args[1]).resolve(), Path(args[2]).resolve()


def find_model(converted, pack, name):
    matches = sorted((converted / pack).rglob(f"{name}.glb"))
    if not matches:
        raise FileNotFoundError(f"{name}.glb not found under {converted / pack}; run convert-unity-models.py first")
    return matches[0]


def import_piece(path, piece_id, scale):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    # Joining deletes the other meshes, so remember the rest by name.
    others = [obj.name for obj in imported if obj.type != "MESH"]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise ValueError(f"{path.name} has no meshes")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        # Keep the world transform when unparenting, so the mesh lands where the source placed it.
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.scale = [axis * scale for axis in joined.scale]
    joined.location = [axis * scale for axis in joined.location]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for name in others:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    joined.name = piece_id
    joined.data.name = piece_id
    return joined


def generic_material(vendor):
    material = bpy.data.materials.new("Generic_01_B")
    nodes = material.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 1.0
    image_node = nodes.new("ShaderNodeTexImage")
    image_node.image = bpy.data.images.load(str(vendor / WAR_MAP / GENERIC_PALETTE))
    image_node.interpolation = "Closest"
    material.node_tree.links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
    return material


def add_far_copy(piece):
    """A decimated copy of a heavy piece for drawing far from the camera."""
    triangles = sum(len(polygon.vertices) - 2 for polygon in piece.data.polygons)
    if triangles <= LOD1_FROM_TRIANGLES:
        return
    far = piece.copy()
    far.data = piece.data.copy()
    far.name = f"{piece.name}_LOD1"
    far.data.name = far.name
    bpy.context.collection.objects.link(far)
    decimate = far.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = max(LOD1_MIN_RATIO, LOD1_TRIANGLES / triangles)
    bpy.ops.object.select_all(action="DESELECT")
    far.select_set(True)
    bpy.context.view_layer.objects.active = far
    bpy.ops.object.modifier_apply(modifier=decimate.name)


def merge_duplicate_materials():
    """Every source GLB embeds its own copy of the pack palette: point all slots at the first copy."""
    canonical = {}
    for material in bpy.data.materials:
        canonical.setdefault(DUPLICATE_SUFFIX.sub("", material.name), material)
    for obj in bpy.data.objects:
        for slot in obj.material_slots:
            if slot.material:
                slot.material = canonical[DUPLICATE_SUFFIX.sub("", slot.material.name)]
    canonical_images = {}
    for image in bpy.data.images:
        canonical_images.setdefault(DUPLICATE_SUFFIX.sub("", image.name), image)
    for material in canonical.values():
        if material.node_tree:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    node.image = canonical_images[DUPLICATE_SUFFIX.sub("", node.image.name)]
    for image in canonical_images.values():
        if image.size[0] > PALETTE_SIZE:
            image.scale(PALETTE_SIZE, PALETTE_SIZE)


def build_kit(converted, vendor, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    generic = None
    for pack, name in PIECES:
        piece_id = name.removeprefix("SM_")
        piece = import_piece(find_model(converted, pack, name), piece_id, WAR_PACK_SCALE if pack == WAR_PACK else 1)
        if piece_id.startswith(GENERIC_PREFIX):
            generic = generic or generic_material(vendor)
            for slot in piece.material_slots:
                slot.material = generic
        add_far_copy(piece)
    merge_duplicate_materials()
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output / "kit.glb"),
        export_format="GLB",
        export_yup=True,
        export_animations=False,
        export_image_format="AUTO",
    )
    print(f"[level-kit] {len(PIECES)} pieces -> {output / 'kit.glb'}", flush=True)


def grade(pixels, target_hex, saturation):
    """Keeps a texture's detail but moves its mean colour onto a palette swatch, with some colour drained first."""
    rgb = pixels[..., :3]
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722])
    rgb = luminance[..., None] + (rgb - luminance[..., None]) * saturation
    # Image.pixels holds the stored sRGB values, the same encoding as the palette's hex colours.
    target = np.array([int(target_hex[i : i + 2], 16) / 255 for i in (0, 2, 4)])
    rgb = rgb * (target / rgb.reshape(-1, 3).mean(axis=0))
    pixels[..., :3] = np.clip(rgb, 0, 1)
    pixels[..., 3] = 1
    return pixels


def build_ground(vendor, output):
    source_dir = vendor / NATURE / "Synty" / "PolygonNature" / "Textures" / "Ground"
    ground_dir = output / "ground"
    ground_dir.mkdir(parents=True, exist_ok=True)
    for name, source, target_hex, saturation, mirror in GROUND:
        image = bpy.data.images.load(str(source_dir / f"{source}.png"))
        image.scale(GROUND_SIZE, GROUND_SIZE)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(GROUND_SIZE, GROUND_SIZE, 4)
        if mirror:
            pixels = pixels[::-1, ::-1].copy()
        image.pixels.foreach_set(grade(pixels, target_hex, saturation).ravel())
        image.filepath_raw = str(ground_dir / f"{name}.png")
        image.file_format = "PNG"
        image.save()
        normal = bpy.data.images.load(str(source_dir / f"{GROUND_NORMALS[name]}.png"))
        normal.colorspace_settings.name = "Non-Color"
        normal.scale(GROUND_SIZE, GROUND_SIZE)
        if mirror:
            # Turning the map half a turn turns its normals too: their x and y swap sign.
            texels = np.array(normal.pixels[:], dtype=np.float32).reshape(GROUND_SIZE, GROUND_SIZE, 4)
            texels = texels[::-1, ::-1].copy()
            texels[..., 0:2] = 1 - texels[..., 0:2]
            normal.pixels.foreach_set(texels.ravel())
        normal.filepath_raw = str(ground_dir / f"{name}_normal.png")
        normal.file_format = "PNG"
        normal.save()
        print(f"[level-kit] ground {name} <- {source}, {GROUND_NORMALS[name]}", flush=True)


def build_fx(vendor, output):
    source_dir = vendor / PARTICLE_FX / "Synty" / "PolygonParticleFX" / "Textures"
    fx_dir = output / "fx"
    fx_dir.mkdir(parents=True, exist_ok=True)
    for name, source in FX:
        shutil.copyfile(source_dir / f"{source}.png", fx_dir / f"{name}.png")
        print(f"[level-kit] fx {name} <- {source}", flush=True)


def build_audio(vendor, output):
    """Cuts each ambience to length, crossfades loops' ends into their starts, and encodes Opus in Ogg."""
    import aud

    audio_dir = output / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    source_dir = vendor.parent / "audio" / "sonniss-gdc"
    matches = sorted(source_dir.rglob("*.wav"))
    for name, relative, start, length, loops in AUDIO:
        # Folder names in the bundle carry odd spacing and characters; match on the file name.
        path = next((match for match in matches if match.name == Path(relative).name), None)
        if path is None:
            raise FileNotFoundError(f"{relative} not found under {source_dir}")
        sound = aud.Sound(str(path)).rechannel(aud.CHANNELS_STEREO).resample(AUDIO_RATE, True)
        clip = sound.limit(start, start + length)
        if loops:
            # The sound just past the loop's end, faded out over the start of the loop as the start fades in.
            tail = sound.limit(start + length, start + length + AUDIO_CROSSFADE).fadeout(0, AUDIO_CROSSFADE)
            clip = clip.fadein(0, AUDIO_CROSSFADE).mix(tail)
        clip.write(
            str(audio_dir / f"{name}.ogg"),
            rate=AUDIO_RATE,
            channels=aud.CHANNELS_STEREO,
            format=aud.FORMAT_FLOAT32,
            container=aud.CONTAINER_OGG,
            codec=aud.CODEC_OPUS,
            bitrate=AUDIO_BITRATE,
        )
        print(f"[level-kit] audio {name} <- {path.name}", flush=True)


def main():
    converted, vendor, output = parse_args()
    build_kit(converted, vendor, output)
    build_ground(vendor, output)
    build_fx(vendor, output)
    build_audio(vendor, output)


main()
