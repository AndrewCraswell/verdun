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

Soldiers come from the retargeted animation GLB (retarget-animations.py) beside the converted packs: the Synty WW1
bodies recoloured per side, with helmets, a rifle, a gas mask and machine guns, as soldier.glb.

Usage (headless Blender):
  blender -b --factory-startup -P scripts/build-level-kit.py -- <converted unity dir> <vendor unity dir> <output dir>
      [section ...]

Sections (all by default): kit, ground, fx, audio, soldier.

Example:
  blender -b --factory-startup -P scripts/build-level-kit.py -- .asset-cache/unity vendor/unity .asset-cache/level
"""

import re
import shutil
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

WAR_MAP = "POLYGON - War Map WWI - Art by Synty"
WAR_PACK = "POLYGON - War Pack - Art by Synty"
NATURE = "POLYGON - Nature Pack - Art by Synty"
FARM = "POLYGON - Farm Pack - Art by Synty"

# Fleury's church, built up from the War Pack's modular walls (2.5 m wide, a 3 m storey): walls whole, halved and
# broken, a window, the west door, the gable's slopes, the apse's curve, a pillar, and roof lying where it fell. They come
# from Synty's generic set, so they're drawn in its palette; but they're mapped for a tiling texture, their big faces
# spanning the whole image, so those faces take one colour, the limestone Fleury was built of (see flatten_spanning).
CHURCH_WALLS = [
    f"SM_Bld_Base_{name}"
    for name in [
        "Wall_01",
        "Wall_Half_01",
        "Wall_Destroyed_01",
        "Wall_Destroyed_02",
        "Wall_Window_01",
        "Wall_Door_Double_Large_01",
        "Wall_Angle_01",
        "Wall_Angle_02",
        "Wall_Round_01",
        "Pillar_01",
        "Roof_Straight_01",
    ]
]
# The orchard's fruit trees, stripped bare by the shelling: their leaves are cut away (see strip_leaves) and the piece
# named "<piece>_Bare".
BARE_TREES = [f"SM_Env_Tree_{name}_01" for name in ["Apple", "Pear", "Plum", "Cherry"]]

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
    (WAR_MAP, "SM_Env_Crater_Water_02"),
    # Life in the line: the brazier's drum, a trench signboard, and tufts of grass on the slopes the shells spared.
    (NATURE, "SM_Prop_RoadSign_01"),
    # Deadwood under the woods: a fallen limb with its twigs, and logs with the stubs of their branches.
    *[(NATURE, f"SM_Tree_{name}") for name in ["Branch_01", "Log_01", "Log_02"]],
    # What a battle leaves on the ground: helmets of both sides, rifles, planks and iron, duds, burst sandbags, kit.
    *[
        (WAR_MAP, f"SM_{name}")
        for name in [
            "Chr_Attach_French_Helmet_01",
            "Chr_Attach_German_Helmet_2",
            "Wep_German_Rifle_01",
            "Gen_Prop_Plank_01",
            "Gen_Prop_Plank_02",
            "Prop_Iron_Sheet_03",
        ]
    ],
    *[
        (WAR_PACK, f"SM_{name}")
        for name in [
            "Prop_Shell_01",
            "Prop_Shell_02",
            "Env_Sandbag_01",
            "Env_Sandbag_03",
            "Prop_Stretcher_01",
            "Char_Attach_German_Pack_01",
            "Char_Attach_German_Canteen_01",
        ]
    ],
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
            "Prop_Barrel_Metal_01",
            "Prop_Sack_Stack_01",
            "Wep_Spade_01",
            "Env_Grass_01",
            "Env_Grass_02",
            "Env_Grass_03",
            "Env_Grass_Tall_01",
            "Env_Grass_Tall_02",
            "Env_Twig_02",
            "Env_Twig_03",
            "Env_Twig_04",
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
            "Bld_Barn_Broken_01",
            "Prop_Chimney_01",
            "Prop_Fireplace_01",
            "Prop_Rubble_House_Plank_01",
            "Prop_Rubble_House_Plank_02",
            "Prop_Rubble_House_Tile_01",
            "Prop_Rubble_House_Tile_02",
            "Bld_Bunker_01",
            "Env_Rubble_Pile_01",
            "Env_Rubble_Pile_02",
            "Env_Rubble_Pile_Big",
            "Env_Rubble_Pile_Corner",
            "Env_Rubble_Pile_Small",
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
            "Env_Tree_Branch_03",
            "Env_Tree_Branch_04",
            # Trunks stripped to poles, their branches shot away: the woods nearest the lines.
            "Env_Tree_Dead_01",
            "Env_Tree_Dead_02",
            "Env_Tree_Dead_03",
            "Env_Sandbag_Wall_01",
            "Env_Sandbag_Wall_Long_01",
            "Env_Sandbag_Wall_Curved_01",
            "Env_Sandbag_Pile_01",
            "Prop_Crate_Pile_01",
            "Prop_Barrel_Pile_01",
        ]
    ],
    *[(WAR_PACK, name) for name in CHURCH_WALLS],
    *[(FARM, name) for name in BARE_TREES],
]

WAR_PACK_SCALE = 100
# War Pack pieces that convert at full size, unlike the rest of the pack: a few props, and the modular walls the pack
# carries from Synty's generic set.
FULL_SIZE = {
    "SM_Prop_Stretcher_01",
    "SM_Char_Attach_German_Pack_01",
    "SM_Char_Attach_German_Canteen_01",
    *CHURCH_WALLS,
}
PALETTE_SIZE = 1024
# Synty's generic props (SM_Gen_*) have no prefab in the pack, so the converter gave them the pack's palette. They use
# the generic palette instead, in its weathered B colours: pale, splintered wood reads against the mud.
GENERIC_PREFIX = "Gen_"
GENERIC_PALETTE = Path("Synty/PolygonGeneric/Textures/Alts/Generic_01_B.png")
# The church's limestone, as a hex colour: its walls take the generic palette's nearest swatch.
LIMESTONE = "a8a090"
# A face whose UVs span more than this of the image is mapped for a tiling texture, not to a palette swatch.
SWATCH_SPAN = 0.05

# Ground layers: (output name, Nature pack texture, target mean colour as hex, saturation kept, mirror). Target means
# match surfaceColors in apps/client/src/palette.ts.
GROUND = [
    ("grass", "Grass_02", "55593d", 0.4, False),
    ("mud", "Mud_01", "574636", 0.9, False),
    ("chalk", "Pebbles_Sand_01", "6f6a5e", 0.35, False),
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

# Ambience from vendor/audio: the Sonniss GDC bundles and Pole Position's Warfare Library (royalty-free or bought, not
# CC0: pack only). (output name, file, start in seconds, length in seconds, loops). Files are found by name anywhere
# under vendor/audio. Loops get their ends crossfaded so they repeat without a seam.
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
    # One distant report from Pole Position's Warfare Library, bought, in place of a free sampler's.
    ("guns-far-1", "VAR DISTANT FIRING 01 - AB - MKH8020.wav", 72.8, 7, False),
    ("guns-far-2", "2017/Pole Position - The Warfare Library/warfare_t1b_cannon_firing_forest_distant_MKH8060_2.wav", 0, 9, False),
]
AUDIO_CROSSFADE = 3
AUDIO_RATE = 48000
AUDIO_BITRATE = 64000

PARTICLE_FX = "POLYGON - Particle FX Pack - Art by Synty"
# Effect sprites: (output name, Particle FX pack texture, largest size kept). Synty's flat, faceted smoke puff, a soft
# spot for mist, a flipbook of flames (10 x 10 frames) for fires and braziers, a spark for embers, and a faceted dark
# blot and grunge splotches for the scorch shells leave on the ground.
FX = [
    ("smoke", "PolygonParticles_Smoke_01", 1024),
    ("mist", "PolygonParticles_Soft_Spot_01", 1024),
    ("fire", "Gen_FireFrames_Grey_01", 1280),
    ("ember", "PolygonParticles_Sparkle_01", 128),
    ("scorch", "PolygonParticles_Circle_Dark_01", 256),
    ("grunge", "Generic_Decal_Grunge_01", 512),
]
# The body of smoke, dust and the column of earth a shell throws up: a billow made here rather than taken from the pack,
# whose soft disc has a flat top and a rim, so that dozens of puffs twenty metres across overlapping read as discs.
PUFF = {"size": 256, "falloff": 0.36, "seed": 1916}

# What the build can be limited to, naming them after the output directory; all of them by default.
SECTIONS = ["kit", "ground", "fx", "audio", "soldier"]
DUPLICATE_SUFFIX = re.compile(r"\.\d{3}$")
# Pieces heavier than this get a decimated far-distance copy, named "<piece>_LOD1", aiming for LOD1_TRIANGLES.
LOD1_FROM_TRIANGLES = 700
LOD1_TRIANGLES = 450
LOD1_MIN_RATIO = 0.3


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) < 3 or any(section not in SECTIONS for section in args[3:]):
        sys.exit(__doc__)
    return Path(args[0]).resolve(), Path(args[1]).resolve(), Path(args[2]).resolve(), args[3:] or SECTIONS


def find_model(converted, pack, name):
    matches = sorted((converted / pack).rglob(f"{name}.glb"))
    if not matches:
        raise FileNotFoundError(f"{name}.glb not found under {converted / pack}; run convert-unity-models.py first")
    return matches[0]


def import_piece(path, piece_id, scale):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    # Joining deletes the other meshes, so remember the rest by name. Windows' glass is blown out of every ruin.
    others = [obj.name for obj in imported if obj.type != "MESH" or obj.name.endswith("_Glass")]
    meshes = [obj for obj in imported if obj.type == "MESH" and not obj.name.endswith("_Glass")]
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


def strip_leaves(piece):
    """Cuts a tree's leaves away, leaving its trunk and branches: the faces whose palette colour is greener than red."""
    import bmesh

    images = [
        node.image
        for slot in piece.material_slots
        if slot.material and slot.material.node_tree
        for node in slot.material.node_tree.nodes
        if node.type == "TEX_IMAGE" and node.image
    ]
    if not images:
        raise ValueError(f"{piece.name} has no palette to tell its leaves by")
    image = images[0]
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    mesh = bmesh.new()
    mesh.from_mesh(piece.data)
    uv = mesh.loops.layers.uv.active
    leaves = []
    for face in mesh.faces:
        u = sum(loop[uv].uv[0] for loop in face.loops) / len(face.loops)
        v = sum(loop[uv].uv[1] for loop in face.loops) / len(face.loops)
        red, green = pixels[min(height - 1, int((v % 1) * height)), min(width - 1, int((u % 1) * width)), :2]
        if green > red:
            leaves.append(face)
    bmesh.ops.delete(mesh, geom=leaves, context="FACES")
    mesh.to_mesh(piece.data)
    mesh.free()
    piece.name = f"{piece.name}_Bare"
    piece.data.name = piece.name


def nearest_swatch(image, target_hex, block=32):
    """
    The UV of the middle of the palette's evenly coloured `block`-pixel square nearest a colour. An 8-bit palette's
    pixels come as stored, its sRGB values, as the colour is given. A whole block, so neither the palette's halving nor a
    texel's offset blends in the colour next to it.
    """
    width, height = image.size
    stored = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)[:, :, :3]
    squares = stored.reshape(height // block, block, width // block, block, 3)
    means = squares.mean(axis=(1, 3))
    even = squares.std(axis=(1, 3)).max(axis=2) < 0.004
    target = np.array([int(target_hex[i : i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)
    distance = np.where(even, np.sum((means - target) ** 2, axis=2), np.inf)
    row, column = np.unravel_index(np.argmin(distance), distance.shape)
    return (column + 0.5) * block / width, (row + 0.5) * block / height


def flatten_spanning(piece, uv_point):
    """Maps every face whose UVs span the image, as a tiling texture's would, onto one palette swatch."""
    uv = piece.data.uv_layers.active
    for polygon in piece.data.polygons:
        us = [uv.data[loop].uv[0] for loop in polygon.loop_indices]
        vs = [uv.data[loop].uv[1] for loop in polygon.loop_indices]
        if max(us) - min(us) > SWATCH_SPAN or max(vs) - min(vs) > SWATCH_SPAN:
            for loop in polygon.loop_indices:
                uv.data[loop].uv = uv_point


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
        scale = WAR_PACK_SCALE if pack == WAR_PACK and name not in FULL_SIZE else 1
        piece = import_piece(find_model(converted, pack, name), piece_id, scale)
        if name in BARE_TREES:
            strip_leaves(piece)
        if piece_id.startswith(GENERIC_PREFIX) or name in CHURCH_WALLS:
            generic = generic or generic_material(vendor)
            for slot in piece.material_slots:
                slot.material = generic
        if name in CHURCH_WALLS:
            image = next(node.image for node in generic.node_tree.nodes if node.type == "TEX_IMAGE")
            flatten_spanning(piece, nearest_swatch(image, LIMESTONE))
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


# How much of each ground texture's contrast to keep: the chalk's white pebbles glare like snow at full contrast.
GROUND_CONTRAST = {"chalk": 0.55}


def grade(pixels, target_hex, saturation, contrast=1.0):
    """Keeps a texture's detail but moves its mean colour onto a palette swatch, with some colour drained first."""
    rgb = pixels[..., :3]
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722])
    rgb = luminance[..., None] + (rgb - luminance[..., None]) * saturation
    # Image.pixels holds the stored sRGB values, the same encoding as the palette's hex colours.
    target = np.array([int(target_hex[i : i + 2], 16) / 255 for i in (0, 2, 4)])
    rgb = rgb * (target / rgb.reshape(-1, 3).mean(axis=0))
    rgb = target + (rgb - target) * contrast
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
        image.pixels.foreach_set(grade(pixels, target_hex, saturation, GROUND_CONTRAST.get(name, 1.0)).ravel())
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
    source_dir = vendor / PARTICLE_FX / "Synty"
    fx_dir = output / "fx"
    fx_dir.mkdir(parents=True, exist_ok=True)
    for name, source, size in FX:
        path = next(source_dir.rglob(f"{source}.png"))
        image = bpy.data.images.load(str(path))
        if image.size[0] > size:
            image.scale(size, size * image.size[1] // image.size[0])
            image.filepath_raw = str(fx_dir / f"{name}.png")
            image.file_format = "PNG"
            image.save()
        else:
            shutil.copyfile(path, fx_dir / f"{name}.png")
        print(f"[level-kit] fx {name} <- {source}", flush=True)
    write_puff(fx_dir / "puff.png")


def cloud_noise(rng, size, octaves=(4, 8, 16, 32)):
    """Smooth value noise from 0 to 1: random grids, coarse to fine, each blown up bilinearly and summed."""
    total = np.zeros((size, size))
    weight = 1.0
    weights = 0.0
    for cells in octaves:
        grid = rng.random((cells + 1, cells + 1))
        at = np.linspace(0, cells, size, endpoint=False)
        low = at.astype(int)
        t = at - low
        rows = grid[low] * (1 - t)[:, None] + grid[low + 1] * t[:, None]
        layer = rows[:, low] * (1 - t)[None, :] + rows[:, low + 1] * t[None, :]
        total += layer * weight
        weights += weight
        weight *= 0.55
    total /= weights
    return (total - total.min()) / (total.max() - total.min())


def write_puff(path):
    """
    A billow of smoke, white for the particle's colour to tint: thickest in the middle and thinning smoothly to nothing,
    with no flat top or rim, its edge ragged and its body cloudy so overlapping puffs don't line up into discs.
    """
    size = PUFF["size"]
    rng = np.random.default_rng(PUFF["seed"])
    at = (np.arange(size) + 0.5) / size * 2 - 1
    x, y = np.meshgrid(at, at)
    # A ragged edge: the distance from the middle stretched and shrunk by one noise, the body thinned by another.
    ragged = cloud_noise(rng, size)
    body = cloud_noise(rng, size)
    r = np.hypot(x, y) * (0.85 + 0.3 * ragged)
    alpha = np.exp(-(r**2) / (2 * PUFF["falloff"] ** 2)) * (0.65 + 0.35 * body)
    alpha *= np.clip((1 - np.hypot(x, y)) / 0.15, 0, 1)
    shade = 0.84 + 0.16 * cloud_noise(rng, size)
    pixels = np.dstack([shade, shade, shade, np.clip(alpha, 0, 1)])
    image = bpy.data.images.new("puff", size, size, alpha=True)
    image.pixels.foreach_set(pixels[::-1].astype(np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    print("[level-kit] fx puff <- made here", flush=True)


def build_audio(vendor, output):
    """Cuts each ambience to length, crossfades loops' ends into their starts, and encodes Opus in Ogg."""
    import aud

    audio_dir = output / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    source_dir = vendor.parent / "audio"
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


# Soldiers: the Synty WW1 characters with the animations scripts/retarget-animations.py baked onto their rig (in the
# asset cache, beside the converted packs). Each side's body gets its helmet bound to the head and its own copy of the
# palette with the uniform recoloured; a gas mask is bound to the head as a separate skinned mesh; the rifle comes
# unrigged, for the game to put between the hands in every frame of every clip; and each side's machine gun stands on its
# tripod in front of the gunner. One GLB, every clip kept.
SOLDIER_ANIMATIONS = Path("animations") / "synty-soldier.glb"
SOLDIER_MODELS = Path(WAR_MAP) / "Synty" / "PolygonWarMap" / "Models"
# Palette swaps, source hex to target hex. Horizon blue for the French (#7d8fa6 the tunic) on the British body, with
# brown leather for the webbing and a horizon-blue Adrian helmet; feldgrau for the Germans, Stahlhelm included, a
# shade lighter than the cloth (#5e6450) since the battlefield's light and grade darken it toward black.
FRENCH_UNIFORM = {
    "8d7254": "7d8fa6",
    "7d644c": "6d7e95",
    "9b7c5b": "8a9cb2",
    "a88662": "97a8bd",
    "55452d": "4d5a6c",
    "cdad8b": "5c4532",
    "9b7156": "6e5a45",
    "444a4e": "5f6e81",
    "586065": "71819a",
}
GERMAN_UNIFORM = {
    "4c514e": "737862",
    "5c625e": "7f846d",
    "69706b": "8b907a",
    "586065": "62675a",
    "3a3e36": "4c4f42",
    "444a36": "5c6150",
}
# (body name, Synty character, helmet, palette swap).
SOLDIER_BODIES = [
    ("Soldier_French", "Character_British_WW1_01", "SM_Chr_Attach_French_Helmet_01", FRENCH_UNIFORM),
    ("Soldier_German", "Character_German_WW1_01", "SM_Chr_Attach_German_Helmet_2", GERMAN_UNIFORM),
]
# The Gewehr 98 for both sides: closer to the long Lebel than the Lee-Enfield is. It keeps Synty's layout, in metres:
# grip at the origin, muzzle along the character's forward, sights up.
SOLDIER_RIFLE = ("Soldier_Rifle", "SM_Wep_German_Rifle_01")
SOLDIER_MASK = ("Soldier_Mask", "SM_Chr_Attach_Mask_Gas_01")
# (output name, gun and tripod). The Vickers stands in for the French Hotchkiss, the German MG 08 for itself.
SOLDIER_GUNS = [
    ("MachineGun_French", ["SM_Wep_British_HeavyMachineGun_01", "SM_Wep_British_HeavyMachineGun_Tripod_01"]),
    ("MachineGun_German", ["SM_Wep_German_HeavyMachineGun_01", "SM_Wep_German_HeavyMachineGun_Tripod_01"]),
]
# How far in front of the gunner's feet the gun stands, in metres.
GUN_DISTANCE = 0.9


def load_joined(path):
    """Imports a model and joins its meshes into one object, keeping where the source placed them."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    others = [obj.name for obj in imported if obj.type != "MESH"]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    for name in others:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    return bpy.context.view_layer.objects.active


def authored(obj):
    """A model's authored orientation and scale (the converter's 1/100 and axis turn), without its position."""
    return obj.matrix_world.to_3x3().to_4x4()


def place_in_armature(obj, armature, world):
    """Bakes `world` into a model's vertices in the armature's space and parents it there, like the bodies."""
    obj.data.transform(armature.matrix_world.inverted() @ world)
    obj.parent = armature
    obj.matrix_parent_inverse = Matrix()
    obj.matrix_basis = Matrix()


def skin_to_bone(obj, armature, bone):
    group = obj.vertex_groups.new(name=bone)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature


def hex_rgb(value):
    return [int(value[i : i + 2], 16) for i in (0, 2, 4)]


def swap_palette(material, name, swaps):
    """A copy of the material on a copy of its palette, with the swapped colours replaced."""
    source = next(node.image for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image)
    image = source.copy()
    image.name = f"{name}_Palette"
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    rgb = np.round(pixels[:, :, :3] * 255)
    for before, after in swaps.items():
        match = np.all(np.abs(rgb - hex_rgb(before)) <= 2, axis=2)
        pixels[match, :3] = np.array(hex_rgb(after)) / 255
    image.pixels[:] = pixels.ravel()
    image.pack()
    copy = material.copy()
    copy.name = name
    for node in copy.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            node.image = image
    return copy


def strip_vertex_extras(obj):
    """The bodies carry vertex colours and a second UV set the game never reads."""
    for attribute in list(obj.data.color_attributes):
        obj.data.color_attributes.remove(attribute)
    for layer in list(obj.data.uv_layers)[1:]:
        obj.data.uv_layers.remove(layer)


def one_material(obj):
    """Every face on the object's first palette material (the gas mask's glass lenses too): one primitive, one draw."""
    materials = obj.data.materials
    keep = next((material for material in materials if "Glass" not in material.name), materials[0])
    for polygon in obj.data.polygons:
        polygon.material_index = 0
    while len(materials) > 1:
        materials.pop()
    materials[0] = keep


def join_into(target, others):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [target, *others]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = target
    if others:
        bpy.ops.object.join()
    return target


def build_soldier(converted, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    animations = converted.parent / SOLDIER_ANIMATIONS
    if not animations.exists():
        raise FileNotFoundError(f"{animations} not found; run retarget-animations.py first")
    bpy.ops.import_scene.gltf(filepath=str(animations))
    armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
    keep = {armature.name} | {character for _, character, _, _ in SOLDIER_BODIES}
    for obj in [obj for obj in bpy.data.objects if obj.name not in keep]:
        bpy.data.objects.remove(obj, do_unlink=True)
    models = converted / SOLDIER_MODELS
    head = Matrix.Translation(armature.matrix_world @ armature.data.bones["Head"].head_local)

    for name, character, helmet_model, swaps in SOLDIER_BODIES:
        body = bpy.data.objects[character]
        helmet = load_joined(models / f"{helmet_model}.glb")
        place_in_armature(helmet, armature, head @ authored(helmet))
        skin_to_bone(helmet, armature, "Head")
        # One material on both before joining, so the joined body keeps one slot: one draw.
        material = swap_palette(body.data.materials[0], name, swaps)
        for slot in [*body.material_slots, *helmet.material_slots]:
            slot.material = material
        join_into(body, [helmet])
        body.name = name
        body.data.name = name

    rifle_name, rifle_model = SOLDIER_RIFLE
    rifle = join_into(load_joined(models / f"{rifle_model}.glb"), [])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mask_name, mask_model = SOLDIER_MASK
    mask = load_joined(models / f"{mask_model}.glb")
    place_in_armature(mask, armature, head @ authored(mask))
    skin_to_bone(mask, armature, "Head")
    for obj, name in [(rifle, rifle_name), (mask, mask_name)]:
        obj.name = name
        obj.data.name = name

    for name, parts in SOLDIER_GUNS:
        guns = [load_joined(models / f"{part}.glb") for part in parts]
        gun = join_into(guns[0], guns[1:])
        gun.location += Vector((0, -GUN_DISTANCE, 0))
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        gun.name = name
        gun.data.name = name

    merge_duplicate_materials()
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            strip_vertex_extras(obj)
            one_material(obj)
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(output / "soldier.glb"),
        export_format="GLB",
        export_yup=True,
        export_animation_mode="NLA_TRACKS",
        export_image_format="AUTO",
    )
    print(f"[level-kit] soldier: {len(bpy.data.actions)} clips -> {output / 'soldier.glb'}", flush=True)


def main():
    converted, vendor, output, sections = parse_args()
    if "kit" in sections:
        build_kit(converted, vendor, output)
    if "ground" in sections:
        build_ground(vendor, output)
    if "fx" in sections:
        build_fx(vendor, output)
    if "audio" in sections:
        build_audio(vendor, output)
    if "soldier" in sections:
        build_soldier(converted, output)


main()
