"""Converts a pack unpacked by `pnpm assets:unpack` from FBX to GLB, with materials rebuilt from Unity's.

FBX files from the Asset Store reference the artist's original texture paths, not the shipped textures, so every
mesh is re-materialled from the package's unity-materials.json (written by extract-unitypackage.mjs): the material
its prefab uses, one per submesh. Meshes no prefab uses get the pack's most-used material, which for Synty packs is
the palette texture. Collision meshes are skipped. Animation clips in an FBX are kept. Output mirrors the package
layout with .glb extensions.

Usage (headless Blender):
  blender -b --factory-startup -P scripts/convert-unity-models.py -- <package dir> <output dir> [name filter]

Example:
  blender -b --factory-startup -P scripts/convert-unity-models.py -- \
    "vendor/unity/POLYGON - War Map WWI - Art by Synty" ".asset-cache/unity/POLYGON - War Map WWI - Art by Synty"
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

import bpy

DUPLICATE_SUFFIX = re.compile(r"\.\d{3}$")


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(args) < 2:
        sys.exit(__doc__)
    return Path(args[0]).resolve(), Path(args[1]).resolve(), args[2] if len(args) > 2 else ""


def build_material(name, spec, package):
    """A matte Principled BSDF material: Synty art is flat colour from a palette texture."""
    material = bpy.data.materials.new(name)
    nodes = material.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 1.0
    bsdf.inputs["Metallic"].default_value = 0.0
    r, g, b, a = spec.get("color") or (1.0, 1.0, 1.0, 1.0)
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    texture = spec.get("texture")
    if texture and (package / texture).exists():
        image_node = nodes.new("ShaderNodeTexImage")
        image_node.image = bpy.data.images.load(str(package / texture), check_existing=True)
        image_node.interpolation = "Closest"
        if (r, g, b) == (1.0, 1.0, 1.0):
            material.node_tree.links.new(image_node.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            tint = nodes.new("ShaderNodeMix")
            tint.data_type = "RGBA"
            tint.blend_type = "MULTIPLY"
            tint.inputs["Factor"].default_value = 1.0
            material.node_tree.links.new(image_node.outputs["Color"], tint.inputs["A"])
            tint.inputs["B"].default_value = (r, g, b, 1.0)
            material.node_tree.links.new(tint.outputs["Result"], bsdf.inputs["Base Color"])
    if a < 1.0:
        bsdf.inputs["Alpha"].default_value = a
        material.surface_render_method = "BLENDED"
    return material


def convert(fbx, package, output, manifest, fallback):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(fbx))
    materials = {}

    def material(name):
        if name not in materials:
            materials[name] = build_material(name, manifest["materials"].get(name, {}), package)
        return materials[name]

    relative = fbx.relative_to(package).as_posix()
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        mesh_name = DUPLICATE_SUFFIX.sub("", obj.name)
        names = manifest["meshes"].get(f"{relative}#{mesh_name}") or [fallback]
        slot_count = max(len(obj.material_slots), 1)
        obj.data.materials.clear()
        for index in range(slot_count):
            obj.data.materials.append(material(names[min(index, len(names) - 1)]))

    target = output / Path(relative).with_suffix(".glb")
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(target),
        export_format="GLB",
        export_animations=bool(bpy.data.actions),
        export_apply=True,
        export_yup=True,
    )


def main():
    package, output, name_filter = parse_args()
    manifest = json.loads((package / "unity-materials.json").read_text(encoding="utf8"))
    used = Counter(name for names in manifest["meshes"].values() for name in names)
    fallback = used.most_common(1)[0][0] if used else "Default"
    models = sorted(
        path
        for path in package.rglob("*.fbx")
        if "Collision" not in path.relative_to(package).parts and name_filter.lower() in path.name.lower()
    )
    failures = []
    for index, fbx in enumerate(models, 1):
        try:
            convert(fbx, package, output, manifest, fallback)
        except Exception as error:  # Keep going: one broken model shouldn't stop a pack.
            failures.append(f"{fbx.relative_to(package)}: {error}")
        if index % 50 == 0 or index == len(models):
            print(f"[convert] {index}/{len(models)} models", flush=True)
    print(f"[convert] done: {len(models) - len(failures)} converted, {len(failures)} failed -> {output}", flush=True)
    for failure in failures:
        print(f"[convert] FAILED {failure}", flush=True)


main()
