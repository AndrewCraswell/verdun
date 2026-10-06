"""Retargets humanoid soldier animations onto the Synty character rig: polyperfect's Low Poly War Pack and Mixamo.

Imports the converted Synty characters GLB (from convert-unity-models.py), bakes every clip in the given FBX files onto
its skeleton, makes the clips no source has (`make_climb_over`, `make_hands_up`, `make_bolt_fire`), and exports one
GLB holding the characters and one animation per clip, at 24 fps.

The rigs are humanoid but differ in bone names, proportions, rest pose (polyperfect A-pose, Synty and Mixamo T-pose)
and bone axes. Bone axes from FBX import are arbitrary, so limbs are compared by joint-to-joint vectors instead: for
each mapped bone, the rest-pose difference is the rotation taking the source limb direction onto the target's. Each
frame, the source bone's world rotation relative to its rest is applied to the target's rest, corrected by that
difference. The hips also copy the source's movement, scaled by hip height. Bones without a source (eyes, and the
spine's middle for polyperfect) keep their rest pose relative to their parent.

Which rig a file has is told by its bone names: polyperfect's two rigs share "Root_M", "Spine1_M" and the like, Mixamo's
are "mixamorig:Hips", "mixamorig:LeftArm" and so on, whether from Mixamo's own characters or the skeleton its
auto-rigger fits to our soldier (see --mixamo-upload). A Mixamo clip is named after its file in vendor/mixamo, saved as
the clip's description in docs/assets/mixamo-clips.md in kebab case (climb-through-fence-and-jump-down.fbx is
climb_through_fence_and_jump_down), unless MIXAMO_NAMES gives the name the game plays it by. It is resampled from the
file's rate to 24 fps, and loses its travel across the ground, keeping the hips' sway and their rise and fall: the
simulation moves the man. It replaces a polyperfect or made clip of the same name.

Usage (headless Blender):
  blender -b --factory-startup -P scripts/retarget-animations.py -- <characters.glb> <output.glb> <fbx or dir> [...]

A list (a .txt file of file names, one a line, # for comments) narrows the files and folders given to the files it
names: scripts/soldier-clips.txt is the clips the game plays, of all those in vendor/mixamo.

To get Mixamo's skeleton fitted to our soldier, write the French soldier as soldier.glb has him (body and helmet,
T-pose, no skeleton) for Mixamo's auto-rigger:
  blender -b --factory-startup -P scripts/retarget-animations.py -- --mixamo-upload <soldier.glb> <output.fbx>
"""

import math
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

# The rate every clip is baked and exported at, as the game bakes them (BAKE_FPS in soldier-kit.ts).
FPS = 24

# (target bone, source bone, target direction child, source direction child). With no children, the bone reuses its
# mapped parent's rest-pose difference. "@L"/"@R" names are finger bones found under that side's hand, because the
# Synty FBX repeats finger names on both hands. "{s}" is the target's side, L or R; "{S}" the source's name for it.
POLYPERFECT_CORE = [
    ("Hips", "Root_M", None, None),
    ("Spine_01", "Spine1_M", "Spine_03", "Chest_M"),
    ("Spine_03", "Chest_M", "Neck", "Neck_M"),
    ("Neck", "Neck_M", "Head", "Head_M"),
    ("Head", "Head_M", None, None),
]
POLYPERFECT_SIDE = [
    ("Clavicle_{s}", "Scapula_{S}", "Shoulder_{s}", "Shoulder_{S}"),
    ("Shoulder_{s}", "Shoulder_{S}", "Elbow_{s}", "Elbow_{S}"),
    ("Elbow_{s}", "Elbow_{S}", "Hand_{s}", "Wrist_{S}"),
    ("Hand_{s}", "Wrist_{S}", "Finger_01@{s}", "PinkyFinger1_{S}"),
    ("Thumb_01@{s}", "ThumbFinger1_{S}", "Thumb_02@{s}", "ThumbFinger2_{S}"),
    ("Thumb_02@{s}", "ThumbFinger2_{S}", None, None),
    ("IndexFinger_01@{s}", "PinkyFinger1_{S}", "IndexFinger_02@{s}", "PinkyFinger2_{S}"),
    ("IndexFinger_02@{s}", "PinkyFinger2_{S}", "IndexFinger_03@{s}", "PinkyFinger3_{S}"),
    ("IndexFinger_03@{s}", "PinkyFinger3_{S}", None, None),
    ("Finger_01@{s}", "PinkyFinger1_{S}", "Finger_02@{s}", "PinkyFinger2_{S}"),
    ("Finger_02@{s}", "PinkyFinger2_{S}", "Finger_03@{s}", "PinkyFinger3_{S}"),
    ("Finger_03@{s}", "PinkyFinger3_{S}", None, None),
    ("UpperLeg_{s}", "Hip_{S}", "LowerLeg_{s}", "Knee_{S}"),
    ("LowerLeg_{s}", "Knee_{S}", "Ankle_{s}", "Ankle_{S}"),
    ("Ankle_{s}", "Ankle_{S}", "Ball_{s}", "Toes_{S}"),
    ("Ball_{s}", "Toes_{S}", "Toes_{s}", "ToesEnd_{S}"),
]
# Mixamo's names, less the "mixamorig:" prefix (which varies: "mixamorig1:" and so on). Synty's one finger chain besides
# the index and thumb takes Mixamo's middle finger.
MIXAMO_CORE = [
    ("Hips", "Hips", None, None),
    ("Spine_01", "Spine", "Spine_02", "Spine1"),
    ("Spine_02", "Spine1", "Spine_03", "Spine2"),
    ("Spine_03", "Spine2", "Neck", "Neck"),
    ("Neck", "Neck", "Head", "Head"),
    ("Head", "Head", None, None),
]
MIXAMO_SIDE = [
    ("Clavicle_{s}", "{S}Shoulder", "Shoulder_{s}", "{S}Arm"),
    ("Shoulder_{s}", "{S}Arm", "Elbow_{s}", "{S}ForeArm"),
    ("Elbow_{s}", "{S}ForeArm", "Hand_{s}", "{S}Hand"),
    ("Hand_{s}", "{S}Hand", "Finger_01@{s}", "{S}HandMiddle1"),
    ("Thumb_01@{s}", "{S}HandThumb1", "Thumb_02@{s}", "{S}HandThumb2"),
    ("Thumb_02@{s}", "{S}HandThumb2", "Thumb_03@{s}", "{S}HandThumb3"),
    ("Thumb_03@{s}", "{S}HandThumb3", None, None),
    ("IndexFinger_01@{s}", "{S}HandIndex1", "IndexFinger_02@{s}", "{S}HandIndex2"),
    ("IndexFinger_02@{s}", "{S}HandIndex2", "IndexFinger_03@{s}", "{S}HandIndex3"),
    ("IndexFinger_03@{s}", "{S}HandIndex3", None, None),
    ("Finger_01@{s}", "{S}HandMiddle1", "Finger_02@{s}", "{S}HandMiddle2"),
    ("Finger_02@{s}", "{S}HandMiddle2", "Finger_03@{s}", "{S}HandMiddle3"),
    ("Finger_03@{s}", "{S}HandMiddle3", None, None),
    ("UpperLeg_{s}", "{S}UpLeg", "LowerLeg_{s}", "{S}Leg"),
    ("LowerLeg_{s}", "{S}Leg", "Ankle_{s}", "{S}Foot"),
    ("Ankle_{s}", "{S}Foot", "Ball_{s}", "{S}ToeBase"),
    ("Ball_{s}", "{S}ToeBase", "Toes_{s}", "{S}Toe_End"),
]
TARGET_HIPS = "Hips"
DUPLICATE_SUFFIX = re.compile(r"\.\d{3}$")
# Mixamo clips the game plays under names of its own, by the clip their file is named after.
MIXAMO_NAMES = {}
# The soldier sent to Mixamo's auto-rigger, as build-level-kit.py names him in soldier.glb.
MIXAMO_UPLOAD_BODY = "Soldier_French"


class SourceRig:
    """What one kind of source rig calls its bones (a bone map, source names in full), and if its clips stay put."""

    def __init__(self, kind, core, side, sides, prefix=""):
        self.kind = kind
        self.in_place = kind == "mixamo"
        rows = core + [
            tuple(name and name.format(s=side_name, S=sides[side_name]) for name in row)
            for side_name in "LR"
            for row in side
        ]
        self.mapping = [
            (target, prefix + source, target_child, source_child and prefix + source_child)
            for target, source, target_child, source_child in rows
        ]
        self.hips = prefix + core[0][1]


def source_rig(armature):
    """The kind of rig an imported armature is, by its bone names, or None for one we don't know."""
    bones = armature.data.bones
    if "Root_M" in bones and "Spine1_M" in bones:
        return SourceRig("polyperfect", POLYPERFECT_CORE, POLYPERFECT_SIDE, {"L": "L", "R": "R"})
    hips = next((b.name for b in bones if b.name.endswith("Hips") and b.name[:-4] + "LeftUpLeg" in bones), None)
    if hips is not None:
        return SourceRig("mixamo", MIXAMO_CORE, MIXAMO_SIDE, {"L": "Left", "R": "Right"}, prefix=hips[:-4])
    return None


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) < 3:
        sys.exit(__doc__)
    sources = []
    listed = set()
    for arg in args[2:]:
        path = Path(arg)
        if path.suffix == ".txt":
            lines = (line.strip() for line in path.read_text(encoding="utf-8").splitlines())
            listed |= {line for line in lines if line and not line.startswith("#")}
        else:
            sources += sorted(path.rglob("*.fbx")) if path.is_dir() else [path]
    if listed:
        missing = listed - {source.name for source in sources}
        if missing:
            sys.exit(f"[retarget] listed but not found: {', '.join(sorted(missing))}")
        sources = [source for source in sources if source.name in listed]
    return Path(args[0]), Path(args[1]), sources


def clip_name(stem, action_name):
    """Short snake_case clip names: Soldier_InPlace_Running_Back_Left -> run_back_left, Soldier_3 -> idle_3."""
    if action_name and "|" in action_name:
        action_name = action_name.split("|")[1]
    name = action_name if action_name and "Take 001" not in action_name else stem
    name = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    name = re.sub(r"^soldier_(inplace_)?", "", name)
    name = re.sub(r"^(\d+)$", r"idle_\1", name)
    replacements = {"running": "run", "backwards": "back", "rib_hit": "hit_ribs", "walk$": "walk_forward"}
    for pattern, replacement in replacements.items():
        name = re.sub(pattern, replacement, name)
    return name


def file_clip_name(stem):
    """A clip named after its file, or the name MIXAMO_NAMES gives it: "Climbing Down (1)" -> climbing_down_1."""
    name = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")
    return MIXAMO_NAMES.get(name, name)


def resolve_target(armature, name):
    """A target bone by name; "Finger@L" finds a finger under the left hand whatever its duplicate suffix."""
    if "@" not in name:
        return armature.data.bones.get(name)
    base, side = name.split("@")
    hand = armature.data.bones.get(f"Hand_{side}")
    return next((b for b in hand.children_recursive if DUPLICATE_SUFFIX.sub("", b.name) == base), None) if hand else None


def world_rotation(matrix):
    return matrix.to_3x3().normalized().to_quaternion()


def assign(obj, action):
    """Plays an action on an object, in its first slot (Blender 4.4 and later keep an action's curves per slot)."""
    obj.animation_data_create().action = action
    if action is not None and hasattr(obj.animation_data, "action_slot") and action.slots:
        obj.animation_data.action_slot = action.slots[0]


def set_frame(frame):
    """Evaluates the scene at a frame that may fall between two."""
    whole = math.floor(frame)
    bpy.context.scene.frame_set(whole, subframe=frame - whole)


class Rig:
    """World-space rest data for one armature."""

    def __init__(self, obj):
        self.obj = obj
        world = obj.matrix_world
        self.rest_rotation = {b.name: world_rotation(world @ b.matrix_local) for b in obj.data.bones}
        self.rest_head = {b.name: world @ b.head_local for b in obj.data.bones}


def yaw_alignment(source, target, mapping):
    """Rotation about world Z that turns the source rig to face the same way as the target."""

    def lateral(rig, left, right):
        vector = rig.rest_head[left] - rig.rest_head[right]
        return Vector((vector.x, vector.y, 0)).normalized()

    by_target = {t: s for t, s, _, _ in mapping}
    source_lateral = lateral(source, by_target["UpperLeg_L"], by_target["UpperLeg_R"])
    target_lateral = lateral(target, "UpperLeg_L", "UpperLeg_R")
    return source_lateral.rotation_difference(target_lateral)


def rest_differences(source, target, mapping, yaw, parent_of):
    """Per target bone, the world rotation taking the (yaw-aligned) source limb direction onto the target's."""
    differences = {}
    for target_bone, source_bone, target_child, source_child in mapping:
        if target_child and source_child in source.rest_head:
            source_direction = yaw @ (source.rest_head[source_child] - source.rest_head[source_bone])
            target_direction = target.rest_head[target_child] - target.rest_head[target_bone]
            differences[target_bone] = source_direction.rotation_difference(target_direction)
        else:
            parent = parent_of.get(target_bone)
            differences[target_bone] = differences.get(parent, Quaternion())
    return differences


def mapped_parents(target_obj, mapping):
    """Nearest mapped ancestor for each mapped target bone."""
    mapped = {t for t, _, _, _ in mapping}
    parents = {}
    for target_bone, _, _, _ in mapping:
        bone = target_obj.data.bones[target_bone].parent
        while bone and bone.name not in mapped:
            bone = bone.parent
        parents[target_bone] = bone.name if bone else None
    return parents


def hip_travel(source_obj, hips, frames, in_place):
    """Per frame, the source hips' travel across the ground to take back out: none, or for an in-place clip where it
    begins, off the spot it stands on at rest, and a steady drift from there to where it ends. The clip then starts over
    the spot and ends there, keeping the sway between and the hips' rise and fall."""
    if not in_place:
        return [Vector()] * len(frames)
    heads = []
    for frame in frames:
        set_frame(frame)
        heads.append((source_obj.matrix_world @ source_obj.pose.bones[hips].matrix).translation)
    rest = source_obj.matrix_world @ source_obj.data.bones[hips].head_local
    start = Vector((heads[0].x - rest.x, heads[0].y - rest.y, 0))
    drift = Vector((heads[-1].x - heads[0].x, heads[-1].y - heads[0].y, 0))
    last = max(1, len(frames) - 1)
    return [start + drift * (index / last) for index in range(len(frames))]


def bake_clip(source_obj, source_rig, target, mapping, frames, name):
    """Bakes the source armature's current action, sampled at `frames` (source frames, one per output frame), onto the
    target as a new action on its own NLA track."""
    source = Rig(source_obj)
    yaw = yaw_alignment(source, target, mapping)
    parent_of = mapped_parents(target.obj, mapping)
    differences = rest_differences(source, target, mapping, yaw, parent_of)
    hip_scale = target.rest_head[TARGET_HIPS].z / max(source.rest_head[source_rig.hips].z, 1e-6)
    target_world = target.obj.matrix_world
    target_world_rotation = world_rotation(target_world)
    to_target_space = target_world.inverted().to_3x3()
    sources = {t: s for t, s, _, _ in mapping}
    bones = sorted(target.obj.data.bones, key=lambda b: len(b.parent_recursive))
    travel = hip_travel(source_obj, source_rig.hips, frames, source_rig.in_place)

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    assign(target.obj, action)
    for pose_bone in target.obj.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.matrix_basis = Matrix()

    previous = {}
    for index, frame in enumerate(frames):
        set_frame(frame)
        source_world = source_obj.matrix_world
        pose = {}
        for bone in bones:
            rest = bone.matrix_local
            parent = bone.parent
            base = pose[parent.name] @ parent.matrix_local.inverted() @ rest if parent else rest.copy()
            source_bone = sources.get(bone.name)
            if source_bone is None:
                pose[bone.name] = base
                continue
            source_rotation = world_rotation(source_world @ source_obj.pose.bones[source_bone].matrix)
            delta = yaw @ source_rotation @ source.rest_rotation[source_bone].inverted() @ yaw.inverted()
            rotation = delta @ differences[bone.name].inverted() @ target.rest_rotation[bone.name]
            translation = base.translation
            if bone.name == TARGET_HIPS:
                source_head = (source_world @ source_obj.pose.bones[source_bone].matrix).translation
                offset = yaw @ (source_head - travel[index] - source.rest_head[source_bone]) * hip_scale
                translation = rest.translation + to_target_space @ offset
            local = target_world_rotation.inverted() @ rotation
            pose[bone.name] = Matrix.Translation(translation) @ local.to_matrix().to_4x4()
            key_pose(target.obj.pose.bones[bone.name], base.inverted() @ pose[bone.name], index, previous)

    return finish_clip(target.obj, action, name), len(frames)


def key_pose(pose_bone, basis, frame, previous):
    """Keys a bone's rotation (and the hips' place) at a frame, on the same side of the quaternion sphere as before."""
    quaternion = basis.to_quaternion()
    if pose_bone.name in previous and previous[pose_bone.name].dot(quaternion) < 0:
        quaternion.negate()
    previous[pose_bone.name] = quaternion
    pose_bone.rotation_quaternion = quaternion
    pose_bone.keyframe_insert("rotation_quaternion", frame=frame, group=pose_bone.name)
    if pose_bone.name == TARGET_HIPS:
        pose_bone.location = basis.translation
        pose_bone.keyframe_insert("location", frame=frame, group=pose_bone.name)


def finish_clip(obj, action, name):
    """Puts a baked action on its own NLA track, which is how the exporter finds the clips."""
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    assign(obj, None)
    return action


def armature_actions(source_obj):
    """Actions in the file that move the source armature, by name (the gun file also animates its weapons)."""
    scene = bpy.context.scene
    found = {}
    rest = {bone.name: bone.matrix_local for bone in source_obj.data.bones}
    for action in bpy.data.actions:
        start, end = (int(round(x)) for x in action.frame_range)
        if end <= start or action.name in found:
            continue
        assign(source_obj, action)
        scene.frame_set((start + end) // 2)
        moved = any(
            (pb.matrix.translation - rest[pb.name].translation).length > 1e-4
            or pb.matrix.to_quaternion().rotation_difference(rest[pb.name].to_quaternion()).angle > 1e-3
            for pb in source_obj.pose.bones
        )
        if moved:
            found[action.name] = (action, start, end)
    return found.values()


def resampled(start, end, rate):
    """Source frames to sample, one per output frame at FPS, for a clip running `start` to `end` at `rate` fps."""
    count = int(math.floor((end - start) * FPS / rate + 1e-6)) + 1
    return [start + index * rate / FPS for index in range(count)]


# The climbs over a wooden fence and a low wall, made here: Mixamo's vaults are running jumps, taking three or four
# metres over a box under a metre high, where the simulation takes a man over from a standstill where the fence or wall
# stopped him, at a steady pace across a metre or so (vault.ts). Each starts and ends in the first frame of `from`,
# standing at ease, and lasts as long as the simulation's crossing, FENCE_CLIMB_SECONDS: a crouch with both hands on the
# top, a spring that takes the hips up over it with the knees tucked and the body turned side-on, the legs swung over
# together and down, a landing on bent knees, and up. The simulation carries him across at a steady pace the whole time,
# so hands and feet are keyed where they stand on the ground and the top, and the clip takes his carrying back out.
CLIMB = {
    "from": "rifle_standing_idle",
    "seconds": 1.25,
    # He starts this far off the near face, in metres, and comes down this much further from the far one than that: the
    # simulation's FENCE_REACH and CLEAR_OF_FENCE.
    "reach": 0.35,
    "clear": 0.05,
}
# What each climbs, in metres: how high its top stands, and how far its faces stand either side of its line. The
# wooden fence is Synty's barricade, 1.35 m to the top of its posts and 0.1 m either side as the simulation has it;
# the walls, the stone walls' sight shapes (sight-shapes.ts): a metre high and 0.6 m thick, or 0.6 m and 0.8 m.
CLIMBS = {
    "climb_over": {"top": 1.35, "half": 0.1},
    "climb_over_wall": {"top": 1.0, "half": 0.3},
    "climb_over_low_wall": {"top": 0.6, "half": 0.4},
}


def climb_keys(top, half, hips_height, square):
    """Keys for a climb over a top `top` metres high, faces `half` either side of its line, as (fraction of the climb,
    value), passing smoothly through each and still at any held twice running. Places are (left, ahead, up) in metres from
    the ground under him at the start. "hips" moves the hips from where `from` has them; "lean" tips the body forward from
    the hips and "bend" curls the spine over it, in radians; "turn" swings the body left, side-on as the legs go over.
    Hands and feet are where the wrists and ankles go, from where the body carries them (0) to their keyed place (1) as
    "reach" says. A foot keyed "idle" stands where it stood at the start, "idle+" where it stands at the end. `square`
    turns the body square to the top from the way `from` stands, side-on to hold the rifle."""
    near = CLIMB["reach"]
    line = near + half
    far = line + half
    crossing = far + CLIMB["reach"] + CLIMB["clear"]
    # The hips clear the top by this much, and the feet by this, as they pass over it.
    over = top + 0.12 - hips_height
    tuck = top + 0.18
    return {
        "crossing": crossing,
        "hips": [(0, (0, 0, 0)), (0.22, (0, 0.06, -0.14)), (0.44, (0.04, line - 0.05, over)),
                 (0.56, (0.04, line + 0.15, over - 0.08)), (0.76, (0, far + 0.28, -0.2)), (1, (0, crossing, 0))],
        "lean": [(0, 0), (0.22, 0.35), (0.44, 0.5), (0.6, 0.3), (0.76, 0.25), (1, 0)],
        "bend": [(0, 0), (0.22, 0.15), (0.44, 0.3), (0.6, 0.15), (0.8, 0.1), (1, 0)],
        "turn": [(0, 0), (0.2, square), (0.46, square + 0.5), (0.6, square + 0.3), (0.76, square), (0.9, square),
                 (1, 0)],
        "foot_L": [(0, "idle"), (0.27, "idle"), (0.36, (0.14, near - 0.22, 0.85 * top)), (0.47, (0.12, line, tuck)),
                   (0.58, (0.12, far + 0.18, 0.6 * top)), (0.74, (0.12, far + 0.3, 0)), (0.88, (0.12, far + 0.3, 0)),
                   (1, "idle+")],
        "foot_R": [(0, "idle"), (0.25, "idle"), (0.34, (-0.1, near - 0.22, 0.85 * top)), (0.45, (-0.06, line, tuck)),
                   (0.56, (-0.1, far + 0.15, 0.6 * top)), (0.72, (-0.12, far + 0.28, 0)),
                   (0.86, (-0.12, far + 0.28, 0)), (1, "idle+")],
        "hand_L": [(0, (0.2, line, top + 0.04)), (1, (0.2, line, top + 0.04))],
        "hand_R": [(0, (-0.2, line, top + 0.04)), (1, (-0.2, line, top + 0.04))],
        "reach_L": [(0, 0), (0.06, 0), (0.18, 1), (0.6, 1), (0.78, 0), (1, 0)],
        "reach_R": [(0, 0), (0.06, 0), (0.18, 1), (0.56, 1), (0.74, 0), (1, 0)],
        "reach_foot": [(0, 0), (0.05, 1), (0.95, 1), (1, 0)],
        # Which way a knee points (left, ahead, up): ahead, and up and out as the legs tuck and swing over.
        "knee_L": [(0, (0.1, 1, 0)), (0.22, (0.1, 1, 0)), (0.45, (0.6, 0.8, 0.6)), (0.7, (0.1, 1, 0)),
                   (1, (0.1, 1, 0))],
        "knee_R": [(0, (-0.1, 1, 0)), (0.2, (-0.1, 1, 0)), (0.43, (0.2, 0.9, 0.6)), (0.7, (-0.1, 1, 0)),
                   (1, (-0.1, 1, 0))],
    }


# The spine bones the bend curls through, and the share each takes.
CLIMB_SPINE = [("Spine_01", 0.4), ("Spine_02", 0.35), ("Spine_03", 0.25)]
# The neck tips back by this much of the lean and bend: he watches where he's going.
CLIMB_LOOK = 0.5
# Limbs by their keys: (upper bone, lower bone, end bone, reach key, which way the joint bends: a key or (left, ahead,
# up)). Elbows go out, back and down.
CLIMB_LIMBS = {
    "foot_L": ("UpperLeg_L", "LowerLeg_L", "Ankle_L", "reach_foot", "knee_L"),
    "foot_R": ("UpperLeg_R", "LowerLeg_R", "Ankle_R", "reach_foot", "knee_R"),
    "hand_L": ("Shoulder_L", "Elbow_L", "Hand_L", "reach_L", (0.6, -0.3, -0.7)),
    "hand_R": ("Shoulder_R", "Elbow_R", "Hand_R", "reach_R", (-0.6, -0.3, -0.7)),
}
# How far toward that bend the joint is pushed, in metres, at full reach.
CLIMB_POLE = 0.3


def keyed(keys, time):
    """A keyed value at `time`: a curve through the keys (Catmull-Rom), still at the ends and at any key held twice."""

    def held(index):
        value = keys[index][1]
        return index in (0, len(keys) - 1) or value == keys[index - 1][1] or value == keys[index + 1][1]

    def velocity(index):
        if held(index):
            return keys[index][1] * 0
        (t0, v0), (t1, v1) = keys[index - 1], keys[index + 1]
        return (v1 - v0) / (t1 - t0)

    if time <= keys[0][0]:
        return keys[0][1]
    for index in range(1, len(keys)):
        (t0, v0), (t1, v1) = keys[index - 1], keys[index]
        if time <= t1:
            span = t1 - t0
            u = (time - t0) / span
            h00, h10, h01, h11 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u, -2 * u**3 + 3 * u**2, u**3 - u**2
            return v0 * h00 + velocity(index - 1) * (span * h10) + v1 * h01 + velocity(index) * (span * h11)
    return keys[-1][1]


def rotate_about(matrix, point, rotation):
    """A world matrix turned by `rotation` about a world point."""
    return Matrix.Translation(point) @ rotation.to_matrix().to_4x4() @ Matrix.Translation(-point) @ matrix


def two_bone_ik(root, joint, end, target, pole):
    """Where a two-bone limb's joint and end go for the end to reach `target` (as near as the limb allows), the joint
    bending toward `pole`."""
    upper = (joint - root).length
    lower = (end - joint).length
    toward = target - root
    distance = min(max(toward.length, abs(upper - lower) + 1e-4), upper + lower - 1e-4)
    along = toward.normalized()
    bend = (pole - root) - along * (pole - root).dot(along)
    if bend.length < 1e-6:
        bend = (joint - root) - along * (joint - root).dot(along)
    bend.normalize()
    cos = (upper * upper + distance * distance - lower * lower) / (2 * upper * distance)
    sin = math.sqrt(max(0.0, 1 - cos * cos))
    return root + (along * cos + bend * sin) * upper, root + along * distance


def make_climb_over(target_obj, base_action, name, top, half):
    """Keys a climb over a fence or wall `top` metres high, its faces `half` either side of its line (see CLIMB), onto
    the rig as a new action, from the base clip's first frame."""
    world = target_obj.matrix_world
    assign(target_obj, base_action)
    bpy.context.scene.frame_set(int(base_action.frame_range[0]))
    base = {pb.name: world @ pb.matrix for pb in target_obj.pose.bones}
    assign(target_obj, None)
    bones = sorted(target_obj.data.bones, key=lambda b: len(b.parent_recursive))
    local = {b.name: base[b.parent.name].inverted() @ base[b.name] for b in bones if b.parent}
    children = {b.name: [c.name for c in b.children] for b in bones}
    # The rig's own axes in the world, from its rest pose: `from` stands side-on. And the ground under its hips.
    rest = target_obj.data.bones
    left = world.to_3x3() @ (rest["UpperLeg_L"].head_local - rest["UpperLeg_R"].head_local)
    left = Vector((left.x, left.y, 0)).normalized()
    up = Vector((0, 0, 1))
    ahead = left.cross(up)
    # How far `from` turns him from square, to take back out.
    stood = base["UpperLeg_L"].translation - base["UpperLeg_R"].translation
    stood = Vector((stood.x, stood.y, 0)).normalized()
    square = math.atan2(stood.cross(left).z, stood.dot(left))
    hips = base[TARGET_HIPS].translation
    ground = Vector((hips.x, hips.y, 0))
    seconds = CLIMB["seconds"]
    keys = climb_keys(top, half, hips.z, square)
    crossing = ahead * keys["crossing"]

    def timed(values):
        return [(at * seconds, value if isinstance(value, (str, float, int)) else Vector(value)) for at, value in values]

    def offset(value):
        return left * value[0] + ahead * value[1] + up * value[2]

    def spot(value, end):
        if value == "idle":
            return base[end].translation.copy()
        if value == "idle+":
            return base[end].translation + crossing
        return ground + offset(value)

    def follow(pose, bone):
        for child in children[bone]:
            pose[child] = pose[bone] @ local[child]
            follow(pose, child)

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    assign(target_obj, action)
    for pose_bone in target_obj.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
    frames = int(round(seconds * FPS)) + 1
    previous = {}
    for frame in range(frames):
        time = frame / FPS
        carried = crossing * (time / seconds)
        pose = {bone: matrix.copy() for bone, matrix in base.items()}
        # The body: the hips moved, then leaned and turned about their joint, the spine curled over them.
        lean = keyed(timed(keys["lean"]), time)
        bend = keyed(timed(keys["bend"]), time)
        turn = Quaternion(up, keyed(timed(keys["turn"]), time))
        moved = offset(keyed(timed(keys["hips"]), time)) - carried
        body = turn @ Quaternion(left, lean)
        pose[TARGET_HIPS] = Matrix.Translation(moved) @ rotate_about(base[TARGET_HIPS], hips, body)
        follow(pose, TARGET_HIPS)
        side = turn @ left
        curls = [(bone, bend * share) for bone, share in CLIMB_SPINE] + [("Neck", -CLIMB_LOOK * (lean + bend))]
        for bone, angle in curls:
            pose[bone] = rotate_about(pose[bone], pose[bone].translation, Quaternion(side, angle))
            follow(pose, bone)
        # The limbs, each reaching from where the body has carried it toward its keyed place on the ground or the top.
        for limb, (upper, lower, end, reach_key, bend_way) in CLIMB_LIMBS.items():
            reach = keyed(timed(keys[reach_key]), time)
            places = [(at, spot(value, end)) for at, value in timed(keys[limb])]
            goal = pose[end].translation.lerp(keyed(places, time) - carried, reach)
            if isinstance(bend_way, str):
                bend_way = keyed(timed(keys[bend_way]), time)
            pole = pose[lower].translation + turn @ offset(bend_way).normalized() * CLIMB_POLE * reach
            joint, reached = two_bone_ik(
                pose[upper].translation, pose[lower].translation, pose[end].translation, goal, pole
            )
            for bone, child, place in [(upper, lower, joint), (lower, end, reached)]:
                head = pose[bone].translation
                swing = (pose[child].translation - head).rotation_difference(place - head)
                pose[bone] = rotate_about(pose[bone], head, swing)
                follow(pose, bone)
            if limb.startswith("foot"):
                # A foot stays flat to the ground, turned with the body.
                at = pose[end].translation
                pose[end] = rotate_about(base[end], base[end].translation, turn)
                pose[end].translation = at
                follow(pose, end)
        armature = {bone: world.inverted() @ matrix for bone, matrix in pose.items()}
        for bone in bones:
            parent = bone.parent
            rest = (armature[parent.name] @ parent.matrix_local.inverted() if parent else Matrix()) @ bone.matrix_local
            key_pose(target_obj.pose.bones[bone.name], rest.inverted() @ armature[bone.name], frame, previous)
    return finish_clip(target_obj, action, name), frames


# Giving up: hands raised, made here because Mixamo has no hands up. Each is a clip of the game's with the arms lifted
# out of it every frame, the rest of the body as that clip has it: standing at ease, and walking, a prisoner led to the
# rear. (made clip, the clip it's made from)
HANDS_UP = {
    "hands_up": "rifle_standing_idle",
    "hands_up_walk": "rifle_walk_forward",
}
# Where a hand goes from its shoulder, in metres: out to its own side, ahead, and up. Short of the arm's reach, so the
# elbow keeps a bend.
HANDS_UP_REACH = (0.2, 0.06, 0.44)
# Which way the elbow bends, from the hand's own side: out, a little ahead.
HANDS_UP_ELBOW = (1, 0.25, 0)


def make_hands_up(target_obj, base_action, name):
    """Keys hands up onto the rig as a new action: the base clip frame by frame, both arms raised (see HANDS_UP)."""
    scene = bpy.context.scene
    world = target_obj.matrix_world
    bones = sorted(target_obj.data.bones, key=lambda b: len(b.parent_recursive))
    children = {b.name: [c.name for c in b.children] for b in bones}
    start, end = (int(round(x)) for x in base_action.frame_range)
    assign(target_obj, base_action)
    poses = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        pose = {pb.name: world @ pb.matrix for pb in target_obj.pose.bones}
        local = {b.name: pose[b.parent.name].inverted() @ pose[b.name] for b in bones if b.parent}
        # The body's own axes this frame, from the line across its thighs.
        left = pose["UpperLeg_L"].translation - pose["UpperLeg_R"].translation
        left = Vector((left.x, left.y, 0)).normalized()
        up = Vector((0, 0, 1))
        ahead = left.cross(up)

        def follow(bone):
            for child in children[bone]:
                pose[child] = pose[bone] @ local[child]
                follow(child)

        for side, way in (("L", 1), ("R", -1)):
            upper, lower, hand = f"Shoulder_{side}", f"Elbow_{side}", f"Hand_{side}"
            out, forward, rise = HANDS_UP_REACH
            goal = pose[upper].translation + left * (way * out) + ahead * forward + up * rise
            bend_out, bend_ahead, bend_up = HANDS_UP_ELBOW
            bend = (left * (way * bend_out) + ahead * bend_ahead + up * bend_up).normalized()
            pole = pose[lower].translation + bend * CLIMB_POLE
            joint, reached = two_bone_ik(
                pose[upper].translation, pose[lower].translation, pose[hand].translation, goal, pole
            )
            for bone, child, place in [(upper, lower, joint), (lower, hand, reached)]:
                head = pose[bone].translation
                swing = (pose[child].translation - head).rotation_difference(place - head)
                pose[bone] = rotate_about(pose[bone], head, swing)
                follow(bone)
        poses.append(pose)
    assign(target_obj, None)

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    assign(target_obj, action)
    for pose_bone in target_obj.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
    previous = {}
    for frame, pose in enumerate(poses):
        armature = {bone: world.inverted() @ matrix for bone, matrix in pose.items()}
        for bone in bones:
            parent = bone.parent
            rest = (armature[parent.name] @ parent.matrix_local.inverted() if parent else Matrix()) @ bone.matrix_local
            key_pose(target_obj.pose.bones[bone.name], rest.inverted() @ armature[bone.name], frame, previous)
    return finish_clip(target_obj, action, name), len(poses)


# A bolt-action rifle worked after each shot, made here because Mixamo's rifles are self-loading: each is a firing clip of
# the game's, then the right hand off the grip to the bolt, the bolt up, back, forward and down, and the hand back,
# the rest of the body held as the shot left it. (made clip, the shot it's made from)
BOLT = {
    "fire_bolt_standing": "firing_a_rifle_while_standing",
    "fire_bolt_crouched": "fire_rifle_while_crouched",
    "fire_bolt_prone": "firing_a_rifle_while_prone",
}
# Where the right wrist goes over the cycle, in seconds from the shot's end, from where it gripped: along the rifle (to
# the muzzle), to the rifle's right and up, in metres. The bolt's handle is a hand's breadth forward of the grip, on the
# right; lifted, drawn back a rifle cartridge's length, pushed home and turned down.
BOLT_KEYS = [
    (0.0, (0.0, 0.0, 0.0)),
    (0.15, (0.1, 0.07, 0.05)),
    (0.25, (0.1, 0.08, 0.09)),
    (0.42, (0.02, 0.08, 0.09)),
    (0.58, (0.1, 0.08, 0.09)),
    (0.68, (0.1, 0.07, 0.05)),
    (0.88, (0.0, 0.0, 0.0)),
]
# Which way the right elbow bends while it works the bolt: out to the right and down.
BOLT_ELBOW = (0.0, 1.0, -1.0)


def make_bolt_fire(target_obj, base_action, name):
    """Keys a shot and the bolt worked after it onto the rig as a new action (see BOLT)."""
    scene = bpy.context.scene
    world = target_obj.matrix_world
    bones = sorted(target_obj.data.bones, key=lambda b: len(b.parent_recursive))
    children = {b.name: [c.name for c in b.children] for b in bones}
    start, end = (int(round(x)) for x in base_action.frame_range)
    assign(target_obj, base_action)
    poses = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        poses.append({pb.name: world @ pb.matrix for pb in target_obj.pose.bones})
    assign(target_obj, None)
    last = poses[-1]
    local = {b.name: last[b.parent.name].inverted() @ last[b.name] for b in bones if b.parent}
    # The rifle's axes as the shot leaves it: from the right wrist through the left, its up, and its right.
    grip = last["Hand_R"].translation.copy()
    along = (last["Hand_L"].translation - grip).normalized()
    up = Vector((0, 0, 1))
    up = (up - along * up.dot(along)).normalized()
    right = along.cross(up)
    keys = [(at, along * a + right * r + up * u) for at, (a, r, u) in BOLT_KEYS]
    bend = (along * BOLT_ELBOW[0] + right * BOLT_ELBOW[1] + up * BOLT_ELBOW[2]).normalized()
    for frame in range(1, int(round(BOLT_KEYS[-1][0] * FPS)) + 1):
        pose = {bone: matrix.copy() for bone, matrix in last.items()}

        def follow(bone):
            for child in children[bone]:
                pose[child] = pose[bone] @ local[child]
                follow(child)

        goal = grip + keyed(keys, frame / FPS)
        pole = pose["Elbow_R"].translation + bend * CLIMB_POLE
        joint, reached = two_bone_ik(
            pose["Shoulder_R"].translation, pose["Elbow_R"].translation, pose["Hand_R"].translation, goal, pole
        )
        for bone, child, place in [("Shoulder_R", "Elbow_R", joint), ("Elbow_R", "Hand_R", reached)]:
            head = pose[bone].translation
            swing = (pose[child].translation - head).rotation_difference(place - head)
            pose[bone] = rotate_about(pose[bone], head, swing)
            follow(bone)
        poses.append(pose)

    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    assign(target_obj, action)
    for pose_bone in target_obj.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
    previous = {}
    for frame, pose in enumerate(poses):
        armature = {bone: world.inverted() @ matrix for bone, matrix in pose.items()}
        for bone in bones:
            parent = bone.parent
            rest = (armature[parent.name] @ parent.matrix_local.inverted() if parent else Matrix()) @ bone.matrix_local
            key_pose(target_obj.pose.bones[bone.name], rest.inverted() @ armature[bone.name], frame, previous)
    return finish_clip(target_obj, action, name), len(poses)


def export_mixamo_upload(soldier, output):
    """Writes the French soldier from soldier.glb, body and helmet in their T-pose with the palette, as a mesh with no
    skeleton: what Mixamo's auto-rigger takes to fit its skeleton to our soldier's build."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(soldier))
    body = bpy.data.objects[MIXAMO_UPLOAD_BODY]
    world = body.matrix_world.copy()
    body.parent = None
    body.matrix_world = world
    for obj in [o for o in bpy.data.objects if o != body]:
        bpy.data.objects.remove(obj, do_unlink=True)
    # Without its armature the mesh stands as it was bound, in the T-pose.
    for modifier in list(body.modifiers):
        body.modifiers.remove(modifier)
    body.vertex_groups.clear()
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=str(output),
        use_selection=True,
        object_types={"MESH"},
        bake_anim=False,
        path_mode="COPY",
        embed_textures=True,
    )
    height = max(v.co.z for v in body.data.vertices) - min(v.co.z for v in body.data.vertices)
    print(f"[retarget] {MIXAMO_UPLOAD_BODY}, {height:.2f} m tall, T-pose, no skeleton -> {output}", flush=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if args[:1] == ["--mixamo-upload"]:
        if len(args) != 3:
            sys.exit(__doc__)
        export_mixamo_upload(Path(args[1]), Path(args[2]))
        return
    characters, output, sources = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=str(characters))
    target_obj = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    # The characters' own take leaves an NLA track behind with no action, which the exporter samples every clip through
    # as if it held them at rest: every clip comes out unmoving.
    for track in list(target_obj.animation_data.nla_tracks if target_obj.animation_data else []):
        target_obj.animation_data.nla_tracks.remove(track)
    target = Rig(target_obj)
    keep = set(bpy.data.objects)
    # Clip name -> (action, kind of source).
    clips = {}

    def drop(name):
        action, _ = clips.pop(name)
        tracks = target_obj.animation_data.nla_tracks
        for track in [t for t in tracks if t.name == name]:
            tracks.remove(track)
        bpy.data.actions.remove(action)

    for fbx in sources:
        before_actions = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=str(fbx))
        # The importer sets the scene to the file's rate and keys the clip in its frames; export is at FPS.
        rate = scene.render.fps / scene.render.fps_base
        scene.render.fps, scene.render.fps_base = FPS, 1
        imported = [o for o in bpy.data.objects if o not in keep]
        source_obj, rig = next(
            ((o, source_rig(o)) for o in imported if o.type == "ARMATURE" and source_rig(o)), (None, None)
        )
        if source_obj is None:
            print(f"[retarget] skipped {fbx.name}: no rig we know", flush=True)
        else:
            mapping = []
            for target_bone, source_bone, target_child, source_child in rig.mapping:
                bone = resolve_target(target_obj, target_bone)
                child = resolve_target(target_obj, target_child) if target_child else None
                if bone and source_bone in source_obj.data.bones:
                    mapping.append((bone.name, source_bone, child and child.name, source_child if child else None))
            new = [found for found in armature_actions(source_obj) if found[0] not in before_actions]
            for index, (action, start, end) in enumerate(new):
                if rig.kind == "mixamo":
                    name = file_clip_name(fbx.stem) + (f"_{index + 1}" if len(new) > 1 else "")
                else:
                    name = clip_name(fbx.stem, action.name if len(bpy.data.actions) - len(before_actions) > 1 else "")
                if name in clips:
                    if not (rig.kind == "mixamo" and clips[name][1] != "mixamo"):
                        continue
                    drop(name)
                assign(source_obj, action)
                baked, count = bake_clip(source_obj, rig, target, mapping, resampled(start, end, rate), name)
                clips[name] = (baked, rig.kind)
                print(f"[retarget] {name}: {count} frames from {fbx.name} ({rig.kind}, {rate:g} fps)", flush=True)
        for obj in imported:
            bpy.data.objects.remove(obj, do_unlink=True)
        for action in set(bpy.data.actions) - before_actions - {action for action, _ in clips.values()}:
            bpy.data.actions.remove(action)
        for collection in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.images):
            for block in [b for b in collection if b.users == 0]:
                collection.remove(block)

    for name, climbed in CLIMBS.items():
        if name not in clips and CLIMB["from"] in clips:
            made, count = make_climb_over(target_obj, clips[CLIMB["from"]][0], name, climbed["top"], climbed["half"])
            clips[name] = (made, "made")
            print(f"[retarget] {name}: {count} frames, made here from {CLIMB['from']}", flush=True)
    for name, base in HANDS_UP.items():
        if name not in clips and base in clips:
            made, count = make_hands_up(target_obj, clips[base][0], name)
            clips[name] = (made, "made")
            print(f"[retarget] {name}: {count} frames, made here from {base}", flush=True)
    for name, base in BOLT.items():
        if name not in clips and base in clips:
            made, count = make_bolt_fire(target_obj, clips[base][0], name)
            clips[name] = (made, "made")
            print(f"[retarget] {name}: {count} frames, made here from {base}", flush=True)

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_animation_mode="NLA_TRACKS")
    print(f"[retarget] done: {len(clips)} clips -> {output}", flush=True)


main()
