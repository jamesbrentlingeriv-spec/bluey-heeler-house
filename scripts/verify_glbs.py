#!/usr/bin/env python3
"""
Phase 1 - Headless GLB Verification & Manifest Generator (scripts/verify_glbs.py)
Run via: blender -b -P scripts/verify_glbs.py

Re-imports all 8 exported character GLBs, heeler_house.glb, destiny_car.glb, and balloon.glb,
prints a verification table of mesh/vertex/bone counts and exact animation clip names + frame ranges,
validates required clips/nodes, and generates public/models/characters/manifest.json.
"""

import os
import sys
import json
import struct
import bpy
import mathutils

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CHAR_DIR = os.path.join(ROOT_DIR, "public", "models", "characters")
ENV_DIR = os.path.join(ROOT_DIR, "public", "models", "environment")
PROPS_DIR = os.path.join(ROOT_DIR, "public", "models", "props")


def read_glb_animations(filepath):
    with open(filepath, "rb") as f:
        magic, version, length = struct.unpack("<III", f.read(12))
        chunk_len, chunk_type = struct.unpack("<II", f.read(8))
        j = json.loads(f.read(chunk_len).decode("utf-8"))
    return [a.get("name", f"anim_{i}") for i, a in enumerate(j.get("animations", []))]


def inspect_glb(filepath):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath)
    objs = list(bpy.context.scene.objects)
    meshes = [o for o in objs if o.type == "MESH" and not o.name.startswith("Icosphere")]
    arms = [o for o in objs if o.type == "ARMATURE"]

    verts = sum(len(m.data.vertices) for m in meshes)
    tris = sum(len(m.data.polygons) for m in meshes)
    bones = sum(len(a.data.bones) for a in arms)

    min_v = [1e9, 1e9, 1e9]
    max_v = [-1e9, -1e9, -1e9]
    deps = bpy.context.evaluated_depsgraph_get()
    for m in meshes:
        em = m.evaluated_get(deps)
        me = em.to_mesh()
        mw = em.matrix_world
        for v in me.vertices:
            wc = mw @ v.co
            for i in range(3):
                min_v[i] = min(min_v[i], wc[i])
                max_v[i] = max(max_v[i], wc[i])
        em.to_mesh_clear()

    dims = [round(max_v[i] - min_v[i], 3) for i in range(3)] if meshes else [0, 0, 0]
    glb_clips = read_glb_animations(filepath)
    action_ranges = {}
    for act in bpy.data.actions:
        action_ranges[act.name] = (round(act.frame_range[0], 1), round(act.frame_range[1], 1))

    return {
        "meshes": len(meshes),
        "mesh_names": [m.name for m in meshes],
        "obj_names": [o.name for o in objs],
        "verts": verts,
        "tris": tris,
        "bones": bones,
        "min_z": round(min_v[2], 3) if meshes else 0,
        "height_z": dims[2],
        "dims": dims,
        "glb_clips": glb_clips,
        "action_ranges": action_ranges,
    }


CHARACTER_MANIFEST_META = [
    {
        "id": "bluey",
        "name": "Bluey",
        "role": "kid",
        "targetHeight": 1.10,
        "accentColor": "#579be3",
        "greetingFromKids": "Yay, yippee! Let's play!",
        "arrivalLine": "Yay, yippee! Keepy Uppy time!",
        "npcGreetingTemplate": "Hey {player}! Wanna play Keepy Uppy?",
    },
    {
        "id": "bingo",
        "name": "Bingo",
        "role": "kid",
        "targetHeight": 0.94,
        "accentColor": "#f49752",
        "greetingFromKids": "Hi Bingo! Yay, yippee!",
        "arrivalLine": "Wheee! Don't let it touch the ground!",
        "npcGreetingTemplate": "Hi {player}! Yay, yippee!",
    },
    {
        "id": "bandit",
        "name": "Bandit",
        "role": "adult",
        "targetHeight": 1.68,
        "accentColor": "#3e699c",
        "greetingFromKids": "Hi Dad! Play Keepy Uppy!",
        "arrivalLine": "Biscuits! Ready for Keepy Uppy, kids!",
        "npcGreetingTemplate": "G'day {player}! Ready for Keepy Uppy?",
    },
    {
        "id": "chilli",
        "name": "Chilli",
        "role": "adult",
        "targetHeight": 1.60,
        "accentColor": "#d97b43",
        "greetingFromKids": "Hi Mum! Watch this!",
        "arrivalLine": "Hi sweethearts! Let's play!",
        "npcGreetingTemplate": "Hey there, {player}! Have fun!",
    },
    {
        "id": "destiny",
        "name": "Destiny",
        "role": "destiny",
        "targetHeight": 1.64,
        "accentColor": "#2b8a6e",
        "greetingFromKids": "Hi Aunt Destiny!",
        "arrivalLine": "Hey everyone! Let's play!",
        "npcGreetingTemplate": "Hey {player}! Having a blast?",
    },
    {
        "id": "alex",
        "name": "Alex",
        "role": "adult",
        "targetHeight": 1.72,
        "accentColor": "#3b5998",
        "greetingFromKids": "Hi Uncle Alex!",
        "arrivalLine": "G'day Bluey! Ready to play!",
        "npcGreetingTemplate": "G'day {player}! Keep that balloon up!",
    },
    {
        "id": "marleigh",
        "name": "Marleigh",
        "role": "kid",
        "targetHeight": 1.16,
        "accentColor": "#ec6fa7",
        "greetingFromKids": "Hey Marleigh!",
        "arrivalLine": "Hi Bluey! Yay, yippee!",
        "npcGreetingTemplate": "Hey {player}! Come bounce with us!",
    },
    {
        "id": "callie",
        "name": "Callie",
        "role": "kid",
        "targetHeight": 0.95,
        "accentColor": "#f28cb1",
        "greetingFromKids": "Hey Callie!",
        "arrivalLine": "Yay, yippee! Hi Bluey!",
        "npcGreetingTemplate": "Hi {player}! Yay, yippee!",
    },
]


def resolve_clip(glb_clips, candidates):
    for c in candidates:
        for g in glb_clips:
            if g.lower() == c.lower():
                return g
    for c in candidates:
        for g in glb_clips:
            if c.lower() in g.lower():
                return g
    return None


def main():
    print("\n" + "=" * 96)
    print("PHASE 1 HEADLESS BLENDER GLB VERIFICATION REPORT")
    print("=" * 96)

    manifest_characters = []
    errors = []

    for meta in CHARACTER_MANIFEST_META:
        cid = meta["id"]
        path = os.path.join(CHAR_DIR, f"{cid}.glb")
        if not os.path.exists(path):
            errors.append(f"Missing character GLB: {path}")
            continue

        info = inspect_glb(path)
        clips = info["glb_clips"]

        clip_map = {
            "Idle": resolve_clip(clips, ["Idle", "Idle_3", "Idle_4", "Idle_9"]),
            "Walk": resolve_clip(clips, ["Walk", "Walking"]),
            "Run": resolve_clip(clips, ["Run", "Running", "Run_02"]),
            "Jump": resolve_clip(clips, ["Jump", "Jump_Over_Obstacle_2_inplace"]),
            "Swat": resolve_clip(clips, ["Swat", "swat"]),
            "Wave": resolve_clip(clips, ["Wave", "Wave_One_Hand"]),
        }
        if cid == "destiny":
            clip_map["SitDrive"] = resolve_clip(clips, ["SitDrive", "drive"])

        for req_key, resolved in clip_map.items():
            if not resolved:
                errors.append(f"{cid}.glb missing required animation clip for '{req_key}' (found {clips})")
        if info["bones"] == 0:
            errors.append(f"{cid}.glb has 0 bones!")

        native_h = max(info["height_z"], 0.1)
        height_scale = round(meta["targetHeight"] / native_h, 4)

        print(
            f"CHAR {meta['name']:<9} | meshes={info['meshes']:<2} verts={info['verts']:<6} "
            f"bones={info['bones']:<3} nativeH={native_h:<5.2f}m scale={height_scale:<6.3f} | clips={clip_map}"
        )
        print(f"     frame_ranges={info['action_ranges']}")

        manifest_characters.append({
            "id": cid,
            "name": meta["name"],
            "role": meta["role"],
            "path": f"/models/characters/{cid}.glb",
            "nativeHeight": round(native_h, 3),
            "targetHeight": meta["targetHeight"],
            "heightScale": height_scale,
            "bubbleOffsetY": round(meta["targetHeight"] + 0.34, 2),
            "accentColor": meta["accentColor"],
            "greetingFromKids": meta["greetingFromKids"],
            "arrivalLine": meta["arrivalLine"],
            "npcGreetingTemplate": meta["npcGreetingTemplate"],
            "clips": clip_map,
        })

    # Verify environment & props
    house_path = os.path.join(ENV_DIR, "heeler_house.glb")
    balloon_path = os.path.join(PROPS_DIR, "balloon.glb")
    car_path = os.path.join(PROPS_DIR, "destiny_car.glb")

    for label, p in [("heeler_house.glb", house_path), ("balloon.glb", balloon_path), ("destiny_car.glb", car_path)]:
        if not os.path.exists(p):
            errors.append(f"Missing asset GLB: {p}")
            continue
        info = inspect_glb(p)
        print(
            f"PROP {label:<16} | meshes={info['meshes']:<2} verts={info['verts']:<7} "
            f"tris={info['tris']:<7} dims={info['dims']} minZ={info['min_z']}"
        )
        if label == "destiny_car.glb":
            for w in ["Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR", "DriverSeatAnchor"]:
                if w not in info["obj_names"]:
                    errors.append(f"destiny_car.glb missing child node {w} (found {info['obj_names']})")

    manifest_path = os.path.join(CHAR_DIR, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"version": 1, "characters": manifest_characters}, f, indent=2)
    print(f"\nWrote character manifest -> {manifest_path}")
    print("=" * 96)

    if errors:
        print("VERIFICATION FAILED:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print("ALL 11 GLB ASSETS & ANIMATION CLIPS 100% VERIFIED!")


if __name__ == "__main__":
    main()
