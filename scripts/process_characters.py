#!/usr/bin/env python3
"""
Phase 1 - Character Rigging & Animation Pipeline (scripts/process_characters.py)
Run via: blender -b -P scripts/process_characters.py

1. Inspects pre-animated Meshy Pro GLBs (destiny, alex, marleigh, callie).
   Preserves existing Meshy skeleton, textures, and animations intact when all
   required clips exist (synthesizes only missing clips if any were absent).
2. Rigs and animates static/un-animated Bluey family GLBs (bluey, bingo, bandit, chilli)
   with a clean unified CartoonRig armature, distortion-free rigid Head/Snout/Ear
   and Pelvis-bound Tail weights, and 6 smooth loopable 30fps cartoon NLA clips:
   Idle, Walk, Run, Jump, Swat, Wave.
"""

import os
import sys
import json
import math
import shutil
import struct
import bpy
import mathutils

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_DIR = os.path.join(ROOT_DIR, "raw_models")
if not os.path.exists(RAW_DIR):
    RAW_DIR = os.path.join(ROOT_DIR, "raw models")
OUT_CHAR_DIR = os.path.join(ROOT_DIR, "public", "models", "characters")
os.makedirs(OUT_CHAR_DIR, exist_ok=True)

CHARACTER_SPECS = [
    {
        "id": "bluey",
        "name": "Bluey",
        "raw_file": "bluey.glb",
        "role": "kid",
        "target_height": 1.10,
        "meshy": False,
    },
    {
        "id": "bingo",
        "name": "Bingo",
        "raw_file": "bingo_bluey.glb",
        "role": "kid",
        "target_height": 0.94,
        "meshy": False,
    },
    {
        "id": "bandit",
        "name": "Bandit",
        "raw_file": "bandit_heeler.glb",
        "role": "adult",
        "target_height": 1.68,
        "meshy": False,
    },
    {
        "id": "chilli",
        "name": "Chilli",
        "raw_file": "chilli_heeler_blueys_mum.glb",
        "role": "adult",
        "target_height": 1.60,
        "meshy": False,
    },
    {
        "id": "destiny",
        "name": "Destiny",
        "raw_file": "destiny.glb",
        "role": "destiny",
        "target_height": 1.64,
        "meshy": True,
    },
    {
        "id": "alex",
        "name": "Alex",
        "raw_file": "alex.glb",
        "role": "adult",
        "target_height": 1.72,
        "meshy": True,
    },
    {
        "id": "marleigh",
        "name": "Marleigh",
        "raw_file": "marleigh.glb",
        "role": "kid",
        "target_height": 1.16,
        "meshy": True,
    },
    {
        "id": "callie",
        "name": "Callie",
        "raw_file": "callie.glb",
        "role": "kid",
        "target_height": 0.95,
        "meshy": True,
    },
]


def read_glb_animation_names(filepath):
    """Read exact animation clip names stored in the GLB JSON chunk."""
    with open(filepath, "rb") as f:
        magic, version, length = struct.unpack("<III", f.read(12))
        if magic != 0x46546C67:
            return []
        chunk_len, chunk_type = struct.unpack("<II", f.read(8))
        data = json.loads(f.read(chunk_len).decode("utf-8"))
    return [a.get("name", f"anim_{i}") for i, a in enumerate(data.get("animations", []))]


def map_meshy_clips(anim_names, is_destiny=False):
    """Map embedded Meshy Pro animation clip names to standard game keys."""
    mapping = {}

    def find_clip(candidates):
        for cand in candidates:
            for a in anim_names:
                if a.lower() == cand.lower():
                    return a
        for cand in candidates:
            for a in anim_names:
                if cand.lower() in a.lower():
                    return a
        return None

    mapping["Idle"] = find_clip(["Idle_3", "Idle_4", "Idle_9", "Idle"])
    mapping["Walk"] = find_clip(["Walking", "Walk"])
    mapping["Run"] = find_clip(["Running", "Run_02", "Run"])
    mapping["Jump"] = find_clip(["Jump_Over_Obstacle_2_inplace", "Jump"])
    mapping["Swat"] = find_clip(["swat", "Punch", "Interact"])
    mapping["Wave"] = find_clip(["Wave_One_Hand", "Wave"])
    if is_destiny:
        mapping["SitDrive"] = find_clip(["drive", "SitDrive", "Sitting"])
    return mapping


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30


def get_scene_meshes():
    return [
        o for o in bpy.context.scene.objects
        if o.type == "MESH" and not o.name.startswith("Icosphere")
    ]


def compute_world_bbox(meshes, exclude_tail_y=None):
    min_v = mathutils.Vector((1e9, 1e9, 1e9))
    max_v = mathutils.Vector((-1e9, -1e9, -1e9))
    deps = bpy.context.evaluated_depsgraph_get()
    for m in meshes:
        em = m.evaluated_get(deps)
        me = em.to_mesh()
        mw = em.matrix_world
        for v in me.vertices:
            wc = mw @ v.co
            if exclude_tail_y is not None and wc.y > exclude_tail_y:
                continue
            for i in range(3):
                min_v[i] = min(min_v[i], wc[i])
                max_v[i] = max(max_v[i], wc[i])
        em.to_mesh_clear()
    return min_v, max_v


def bake_mesh_world_and_strip_armatures(meshes):
    """Evaluate current armature/world deformation into mesh vertices and remove armatures."""
    deps = bpy.context.evaluated_depsgraph_get()
    for m in meshes:
        em = m.evaluated_get(deps)
        baked_mesh = bpy.data.meshes.new_from_object(em, preserve_all_data_layers=True, depsgraph=deps)
        # Transform vertices into world space
        mw = m.matrix_world.copy()
        baked_mesh.transform(mw)
        old_mesh = m.data
        m.modifiers.clear()
        m.parent = None
        m.matrix_world = mathutils.Matrix.Identity(4)
        m.data = baked_mesh
        if old_mesh.users == 0:
            bpy.data.meshes.remove(old_mesh)

    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or obj.name.startswith("Icosphere"):
            bpy.data.objects.remove(obj, do_unlink=True)


def relax_tpose_arms_before_bake(arm, left_bone_name, right_bone_name, angle_deg=40.0):
    """Bring stiff horizontal T-pose arms down into a natural cartoon A-pose before baking."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    rad = math.radians(angle_deg)
    arm_rot = arm.matrix_world.to_3x3().normalized()
    for bname, sign in [(left_bone_name, 1.0), (right_bone_name, -1.0)]:
        if bname in arm.pose.bones:
            pb = arm.pose.bones[bname]
            bone = arm.data.bones[bname]
            b_rot_w = (arm_rot @ bone.matrix_local.to_3x3()).normalized()
            # Left arm (+X) rotates down (-Z) via +angle around +Y world axis:
            r_world = mathutils.Euler((0.0, sign * rad, 0.0), "XYZ").to_matrix()
            p_rot = b_rot_w.inverted() @ r_world @ b_rot_w
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = p_rot.to_quaternion()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()


def ensure_principled_textures(meshes):
    """Ensure any image texture in an unlit/emission glTF material is linked to Principled Base Color."""
    for m in meshes:
        for mat in m.data.materials:
            if not mat or not mat.use_nodes:
                continue
            nt = mat.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image), None)
            if bsdf and tex and not bsdf.inputs["Base Color"].is_linked:
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
            if bsdf:
                bsdf.inputs["Roughness"].default_value = 0.75


def clean_bandit_or_bingo(meshes, arm):
    """Remove closed eyelid shells & duplicate outline hull meshes, then relax T-pose arms."""
    ensure_principled_textures(meshes)
    keep = []
    for m in meshes:
        mats = [mt.name for mt in m.data.materials if mt]
        if any("OH_Outline" in mt for mt in mats):
            bpy.data.objects.remove(m, do_unlink=True)
            continue
        vg_names = set()
        for v in m.data.vertices:
            for g in v.groups:
                if g.weight > 0.2:
                    vg_names.add(m.vertex_groups[g.group].name)
        if vg_names and all("EyeLid" in n for n in vg_names):
            bpy.data.objects.remove(m, do_unlink=True)
            continue
        keep.append(m)

    if arm:
        relax_tpose_arms_before_bake(arm, "UpperArm.L_27", "UpperArm.R_39", angle_deg=40.0)
    bake_mesh_world_and_strip_armatures(keep)
    return keep


def clean_chilli(meshes, arm):
    """Align Chilli to face -Y with shoulders along X, relax horizontal T-pose arms to A-pose, bake world geometry."""
    ensure_principled_textures(meshes)
    sh_l = arm.matrix_world @ arm.data.bones["upper_arm.L_135_34"].head_local
    sh_r = arm.matrix_world @ arm.data.bones["upper_arm.R_139_38"].head_local
    vec = sh_l - sh_r
    angle_z = math.atan2(vec.y, vec.x)

    # Rotate armature + mesh in object mode first so Chilli faces -Y cleanly, then relax T-pose arms around world Y!
    rot_z = mathutils.Matrix.Rotation(-angle_z, 4, "Z")
    arm.matrix_world = rot_z @ arm.matrix_world
    bpy.context.view_layer.update()
    relax_tpose_arms_before_bake(arm, "upper_arm.L_135_34", "upper_arm.R_139_38", angle_deg=40.0)
    bake_mesh_world_and_strip_armatures(meshes)
    return meshes


def clean_and_decimate_bluey(meshes):
    """Decimate 433k-vert ZBrush Bluey sculpt cleanly while preserving UVs and textures."""
    bake_mesh_world_and_strip_armatures(meshes)
    for m in meshes:
        vcount = len(m.data.vertices)
        if vcount > 4000:
            ratio = 0.065 if vcount > 20000 else 0.22
            bpy.context.view_layer.objects.active = m
            mod = m.modifiers.new(name="DecimateClean", type="DECIMATE")
            mod.decimate_type = "COLLAPSE"
            mod.ratio = ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
    return meshes


def normalize_character_transform(meshes, target_height):
    """Center X/Y (ignoring rear tail overhang) and place feet at Z=0, scaled to target_height."""
    min_all, max_all = compute_world_bbox(meshes)
    raw_h = max(max_all.z - min_all.z, 1e-4)
    # Exclude rear tail (+Y > 25% of depth behind center) when finding body X/Y center
    y_cutoff = min_all.y + (max_all.y - min_all.y) * 0.68
    min_body, max_body = compute_world_bbox(meshes, exclude_tail_y=y_cutoff)
    cx = 0.5 * (min_body.x + max_body.x)
    cy = 0.5 * (min_body.y + max_body.y)
    cz = min_all.z
    scale = target_height / raw_h

    t_mat = (
        mathutils.Matrix.Scale(scale, 4)
        @ mathutils.Matrix.Translation((-cx, -cy, -cz))
    )
    for m in meshes:
        m.data.transform(t_mat)
        m.data.update()


def create_cartoon_armature(char_id, H):
    """
    Create a unified 20-bone Cartoon Biped Armature fitted to character height H.
    Bluey characters have cute boxy proportions: short legs, stocky torso, tall boxy head + ears.
    """
    is_kid = char_id in ("bluey", "bingo")
    leg_top = H * (0.24 if is_kid else 0.26)
    knee_z = H * (0.13 if is_kid else 0.14)
    ankle_z = H * 0.045
    pelvis_z = leg_top
    spine_z = H * (0.35 if is_kid else 0.37)
    chest_z = H * (0.46 if is_kid else 0.48)
    head_z = H * (0.53 if is_kid else 0.55)
    ear_base_z = H * 0.82
    ear_tip_z = H * 0.99

    leg_x = H * (0.095 if is_kid else 0.088)
    sh_x = H * (0.165 if is_kid else 0.155)
    sh_z = H * (0.46 if is_kid else 0.48)
    arm_len = H * (0.23 if is_kid else 0.25)
    # 42-degree relaxed A-pose arm direction
    ang = math.radians(42.0)
    dx = math.cos(ang) * arm_len
    dz = -math.sin(ang) * arm_len

    arm_data = bpy.data.armatures.new("CartoonRigData")
    arm_obj = bpy.data.objects.new("CartoonRig", arm_data)
    bpy.context.scene.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def add_bone(name, head, tail, parent_name=None):
        b = eb.new(name)
        b.head = mathutils.Vector(head)
        b.tail = mathutils.Vector(tail)
        b.roll = 0.0
        if parent_name:
            b.parent = eb[parent_name]
            b.use_connect = False
        return b

    add_bone("Root", (0, 0, 0), (0, 0, pelvis_z * 0.6), None)
    add_bone("Pelvis", (0, 0, pelvis_z), (0, 0, spine_z), "Root")
    add_bone("Spine", (0, 0, spine_z), (0, 0, chest_z), "Pelvis")
    add_bone("Chest", (0, 0, chest_z), (0, 0, head_z), "Spine")
    add_bone("Head", (0, 0, head_z), (0, 0, ear_base_z), "Chest")
    add_bone("Ear.L", (H * 0.095, H * 0.02, ear_base_z), (H * 0.085, -H * 0.01, ear_tip_z), "Head")
    add_bone("Ear.R", (-H * 0.095, H * 0.02, ear_base_z), (-H * 0.085, -H * 0.01, ear_tip_z), "Head")
    add_bone("Tail", (0, H * 0.11, pelvis_z + H * 0.03), (0, H * 0.30, pelvis_z - H * 0.01), "Pelvis")

    for side, sx in [("L", 1.0), ("R", -1.0)]:
        p0 = (sx * sh_x, 0.0, sh_z)
        p1 = (sx * (sh_x + dx * 0.48), 0.0, sh_z + dz * 0.48)
        p2 = (sx * (sh_x + dx * 0.82), 0.0, sh_z + dz * 0.82)
        p3 = (sx * (sh_x + dx * 1.02), -H * 0.01, sh_z + dz * 1.02)
        add_bone(f"UpperArm.{side}", p0, p1, "Chest")
        add_bone(f"LowerArm.{side}", p1, p2, f"UpperArm.{side}")
        add_bone(f"Hand.{side}", p2, p3, f"LowerArm.{side}")

        add_bone(f"UpperLeg.{side}", (sx * leg_x, 0.0, leg_top), (sx * leg_x, 0.0, knee_z), "Pelvis")
        add_bone(f"LowerLeg.{side}", (sx * leg_x, 0.0, knee_z), (sx * leg_x, 0.0, ankle_z), "UpperLeg." + side)
        add_bone(f"Foot.{side}", (sx * leg_x, 0.0, ankle_z), (sx * leg_x, -H * 0.08, H * 0.015), "LowerLeg." + side)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_obj


BONE_LIST = [
    "Root", "Pelvis", "Spine", "Chest", "Head", "Ear.L", "Ear.R", "Tail",
    "UpperArm.L", "LowerArm.L", "Hand.L",
    "UpperArm.R", "LowerArm.R", "Hand.R",
    "UpperLeg.L", "LowerLeg.L", "Foot.L",
    "UpperLeg.R", "LowerLeg.R", "Foot.R",
]


def assign_weights_bandit_bingo(meshes, arm_obj):
    """Remap artist vertex groups on Bandit/Bingo directly onto CartoonRig bones."""
    remap = {
        "GLTF_created_0_rootJoint": "Pelvis",
        "Root_0": "Pelvis",
        "Hips_55": "Pelvis",
        "Spine.001_42": "Spine",
        "Spine.002_41": "Chest",
        "shoulder.L_28": "Chest",
        "shoulder.R_40": "Chest",
        "Head_16": "Head",
        "Snout_3": "Head",
        "Ear.L_1": "Ear.L",
        "Ear.R_2": "Ear.R",
        "UpperArm.L_27": "UpperArm.L",
        "forearm.L_26": "LowerArm.L",
        "Hand.L_25": "Hand.L",
        "UpperArm.R_39": "UpperArm.R",
        "forearm.R_38": "LowerArm.R",
        "Hand.R_37": "Hand.R",
        "thigh.L_50": "UpperLeg.L",
        "shin.L_49": "LowerLeg.L",
        "Foot.L_48": "Foot.L",
        "Toe.L_47": "Foot.L",
        "thigh.R_54": "UpperLeg.R",
        "shin.R_53": "LowerLeg.R",
        "Foot.R_52": "Foot.R",
        "Toe.R_51": "Foot.R",
    }
    for m in meshes:
        old_names = {vg.index: vg.name for vg in m.vertex_groups}
        per_vert = []
        for v in m.data.vertices:
            acc = {}
            for g in v.groups:
                if g.weight <= 1e-4:
                    continue
                oname = old_names.get(g.group, "")
                target = remap.get(oname)
                if not target:
                    if oname.startswith("Tail"):
                        target = "Tail"
                    elif oname.startswith("EyeLid"):
                        target = "Head"
                    elif ".L" in oname:
                        target = "Hand.L"
                    elif ".R" in oname:
                        target = "Hand.R"
                    else:
                        target = "Head"
                acc[target] = acc.get(target, 0.0) + g.weight
            if not acc:
                acc["Head" if v.co.z > 0.5 else "Pelvis"] = 1.0
            total = sum(acc.values())
            per_vert.append({k: val / total for k, val in acc.items()})

        m.vertex_groups.clear()
        vgs = {b: m.vertex_groups.new(name=b) for b in BONE_LIST}
        for vid, weights in enumerate(per_vert):
            for bname, w in weights.items():
                vgs[bname].add([vid], w, "REPLACE")

        mod = m.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = arm_obj
        m.parent = arm_obj


def assign_weights_chilli(meshes, arm_obj, H):
    """Remap Chilli's vertex groups onto CartoonRig with rigid Head, Ears, and Pelvis-bound Tail."""
    remap = {
        "GLTF_created_0_rootJoint": "Pelvis",
        "GLTF_created_2_rootJoint_56": "Pelvis",
        "spine_156_55": "Pelvis",
        "pelvis.L_144_43": "Pelvis",
        "pelvis.R_145_44": "Pelvis",
        "spine.001_143_42": "Spine",
        "spine.002_142_41": "Chest",
        "shoulder.L_136_35": "Chest",
        "shoulder.R_140_39": "Chest",
        "spine.003_141_40": "Head",
        "spine.004_132_31": "Head",
        "spine.005_131_30": "Head",
        "spine.006_130_29": "Head",
        "upper_arm.L_135_34": "UpperArm.L",
        "forearm.L_134_33": "LowerArm.L",
        "hand.L_133_32": "Hand.L",
        "upper_arm.R_139_38": "UpperArm.R",
        "forearm.R_138_37": "LowerArm.R",
        "hand.R_137_36": "Hand.R",
        "thigh.L_150_49": "UpperLeg.L",
        "shin.L_149_48": "LowerLeg.L",
        "foot.L_148_47": "Foot.L",
        "toe.L_146_45": "Foot.L",
        "heel.02.L_147_46": "Foot.L",
        "thigh.R_155_54": "UpperLeg.R",
        "shin.R_154_53": "LowerLeg.R",
        "foot.R_153_52": "Foot.R",
        "toe.R_151_50": "Foot.R",
        "heel.02.R_152_51": "Foot.R",
    }
    for m in meshes:
        old_names = {vg.index: vg.name for vg in m.vertex_groups}
        per_vert = []
        for v in m.data.vertices:
            co = v.co
            acc = {}
            for g in v.groups:
                if g.weight <= 1e-4:
                    continue
                oname = old_names.get(g.group, "")
                target = remap.get(oname, "Head")
                acc[target] = acc.get(target, 0.0) + g.weight

            # Rigid upper head/snout/ears enforcement so Chilli's face never stretches
            is_arm = any(k.startswith(("UpperArm", "LowerArm", "Hand")) and val > 0.25 for k, val in acc.items())
            if not is_arm and co.z > H * 0.54:
                if co.z > H * 0.84:
                    ear = "Ear.L" if co.x >= 0 else "Ear.R"
                    t = min(1.0, (co.z - H * 0.84) / (H * 0.10))
                    acc = {ear: t, "Head": 1.0 - t}
                else:
                    acc = {"Head": 1.0}
            # Bind Chilli's rear tail solidly to Tail (parented to Pelvis)
            elif not is_arm and co.y > H * 0.13 and H * 0.16 < co.z < H * 0.45:
                t = min(1.0, (co.y - H * 0.13) / (H * 0.05))
                acc = {"Tail": t, "Pelvis": 1.0 - t}

            if not acc:
                acc = {"Head": 1.0} if co.z > H * 0.5 else {"Pelvis": 1.0}
            total = sum(acc.values())
            per_vert.append({k: val / total for k, val in acc.items()})

        m.vertex_groups.clear()
        vgs = {b: m.vertex_groups.new(name=b) for b in BONE_LIST}
        for vid, weights in enumerate(per_vert):
            for bname, w in weights.items():
                vgs[bname].add([vid], w, "REPLACE")

        mod = m.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = arm_obj
        m.parent = arm_obj


def smoothstep(edge0, edge1, x):
    if edge1 <= edge0:
        return 1.0 if x >= edge1 else 0.0
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def assign_weights_bluey(meshes, arm_obj, H):
    """
    Assign crisp cartoon weights to Bluey's separated submeshes:
    - Tail submeshes -> Tail (child of Pelvis)
    - Snout & Eyebrow submeshes -> 1.0 Head
    - Leg submeshes -> UpperLeg / LowerLeg / Foot (.L / .R)
    - Arm submeshes -> UpperArm / LowerArm / Hand (.L / .R)
    - Main body/head submesh -> Pelvis / Spine / Chest below neck, 1.0 Head + Ears above
    """
    for m in meshes:
        xs = [v.co.x for v in m.data.vertices]
        ys = [v.co.y for v in m.data.vertices]
        zs = [v.co.z for v in m.data.vertices]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        min_z, max_z = min(zs), max(zs)
        span_x = max_x - min_x
        span_z = max_z - min_z

        m.vertex_groups.clear()
        vgs = {b: m.vertex_groups.new(name=b) for b in BONE_LIST}

        # Classify submesh by normalized bounds
        is_tail = min_y > H * 0.08 and max_z < H * 0.55
        is_snout_or_brows = max_y < -H * 0.06 and min_z > H * 0.45 and span_z < H * 0.35
        is_legs = max_z < H * 0.38 and min_z < H * 0.05
        is_arms = (max_x > H * 0.24 or min_x < -H * 0.24) and max_z < H * 0.62 and min_z > H * 0.18

        for vid, v in enumerate(m.data.vertices):
            co = v.co
            weights = {}
            if is_tail:
                t = smoothstep(H * 0.10, H * 0.16, co.y)
                weights = {"Tail": t, "Pelvis": 1.0 - t}
            elif is_snout_or_brows:
                weights = {"Head": 1.0}
            elif is_legs:
                side = "L" if co.x >= 0 else "R"
                if co.z < H * 0.075:
                    t = smoothstep(H * 0.045, H * 0.075, co.z)
                    weights = {f"Foot.{side}": 1.0 - t, f"LowerLeg.{side}": t}
                elif co.z < H * 0.155:
                    t = smoothstep(H * 0.115, H * 0.155, co.z)
                    weights = {f"LowerLeg.{side}": 1.0 - t, f"UpperLeg.{side}": t}
                else:
                    weights = {f"UpperLeg.{side}": 1.0}
            elif is_arms:
                side = "L" if co.x >= 0 else "R"
                ax = abs(co.x)
                # Shoulder is around ax = 0.15*H, hand tip around ax = 0.33*H
                if ax < H * 0.235:
                    t = smoothstep(H * 0.205, H * 0.235, ax)
                    weights = {f"UpperArm.{side}": 1.0 - t, f"LowerArm.{side}": t}
                elif ax < H * 0.29:
                    t = smoothstep(H * 0.265, H * 0.29, ax)
                    weights = {f"LowerArm.{side}": 1.0 - t, f"Hand.{side}": t}
                else:
                    weights = {f"Hand.{side}": 1.0}
            else:
                # Main boxy body + head + ears
                if co.z >= H * 0.54:
                    if co.z >= H * 0.84:
                        ear = "Ear.L" if co.x >= 0 else "Ear.R"
                        t = smoothstep(H * 0.84, H * 0.90, co.z)
                        weights = {ear: t, "Head": 1.0 - t}
                    else:
                        weights = {"Head": 1.0}
                elif co.z >= H * 0.44:
                    t = smoothstep(H * 0.44, H * 0.54, co.z)
                    weights = {"Chest": 1.0 - t, "Head": t}
                elif co.z >= H * 0.34:
                    t = smoothstep(H * 0.34, H * 0.44, co.z)
                    weights = {"Spine": 1.0 - t, "Chest": t}
                else:
                    t = smoothstep(H * 0.25, H * 0.34, co.z)
                    weights = {"Pelvis": 1.0 - t, "Spine": t}

            for bname, w in weights.items():
                if w > 1e-4:
                    vgs[bname].add([vid], w, "REPLACE")

        mod = m.modifiers.new(name="Armature", type="ARMATURE")
        mod.object = arm_obj
        m.parent = arm_obj


def set_pose_world_transform(arm_obj, pb_name, rot_deg_xyz=(0.0, 0.0, 0.0), loc_world=(0.0, 0.0, 0.0)):
    """
    Apply world-space delta rotation (rx, ry, rz in degrees) and world-space translation
    to a pose bone regardless of its rest roll:
      - For downward limbs (legs/arms): rx < 0 swings FORWARD (-Y), rx > 0 swings BACKWARD (+Y).
      - For upward torso/head/ears: rx > 0 leans FORWARD (-Y), rx < 0 leans BACKWARD (+Y).
      - ry < 0 raises Left arm (+X) UP; ry > 0 raises Right arm (-X) UP.
      - rz rotates around vertical +Z (head turn / tail wag).
    """
    pb = arm_obj.pose.bones[pb_name]
    bone = arm_obj.data.bones[pb_name]
    b_rot = bone.matrix_local.to_3x3()
    r_world = mathutils.Euler(
        (math.radians(rot_deg_xyz[0]), math.radians(rot_deg_xyz[1]), math.radians(rot_deg_xyz[2])),
        "XYZ",
    ).to_matrix()
    p_rot = b_rot.inverted() @ r_world @ b_rot
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = p_rot.to_quaternion()
    if any(abs(v) > 1e-6 for v in loc_world):
        pb.location = b_rot.inverted() @ mathutils.Vector(loc_world)
    else:
        pb.location = (0.0, 0.0, 0.0)


def reset_pose(arm_obj):
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


def keyframe_all_bones(arm_obj, frame):
    for pb in arm_obj.pose.bones:
        pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        if pb.name == "Pelvis":
            pb.keyframe_insert(data_path="location", frame=frame)


def bake_cartoon_actions(arm_obj, H):
    """
    Bake 6 smooth loopable cartoon actions @ 30fps and push each to an NLA track:
      Idle (60f), Walk (30f), Run (20f), Jump (25f), Swat (18f), Wave (40f)
    """
    if not arm_obj.animation_data:
        arm_obj.animation_data_create()

    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")

    actions_created = []

    # 1. IDLE (60 frames @ 30fps) - gentle breathing bounce, ear/tail sway
    act_idle = bpy.data.actions.new(name="Idle")
    arm_obj.animation_data.action = act_idle
    for f in range(0, 61, 5):
        reset_pose(arm_obj)
        phase = (f / 60.0) * 2.0 * math.pi
        bob = math.sin(phase * 2.0) * H * 0.012
        sway = math.sin(phase)
        set_pose_world_transform(arm_obj, "Pelvis", (0, sway * 1.2, 0), (0, 0, bob))
        set_pose_world_transform(arm_obj, "Spine", (math.sin(phase * 2.0) * 1.8, 0, 0))
        set_pose_world_transform(arm_obj, "Head", (-math.sin(phase * 2.0) * 1.5, sway * 2.2, sway * 3.0))
        set_pose_world_transform(arm_obj, "Ear.L", (math.sin(phase * 2.0 + 0.6) * 4.0, -abs(sway) * 2.5, 0))
        set_pose_world_transform(arm_obj, "Ear.R", (math.sin(phase * 2.0 + 1.2) * 4.0, abs(sway) * 2.5, 0))
        set_pose_world_transform(arm_obj, "Tail", (math.cos(phase * 2.0) * 4.0, 0, math.sin(phase * 2.0) * 14.0))
        set_pose_world_transform(arm_obj, "UpperArm.L", (sway * 3.0, -2.0, 0))
        set_pose_world_transform(arm_obj, "UpperArm.R", (-sway * 3.0, 2.0, 0))
        keyframe_all_bones(arm_obj, f)
    actions_created.append((act_idle, 0, 60))

    # 2. WALK (30 frames @ 30fps) - cheerful jaunty stride with arm swing & torso bob
    act_walk = bpy.data.actions.new(name="Walk")
    arm_obj.animation_data.action = act_walk
    for f in range(0, 31, 3):
        reset_pose(arm_obj)
        phase = (f / 30.0) * 2.0 * math.pi
        s = math.sin(phase)
        c = math.cos(phase)
        bob = abs(c) * H * 0.026
        # Left leg forward (rx < 0) when s > 0, Right leg opposite
        knee_l = max(0.0, -c) * 28.0
        knee_r = max(0.0, c) * 28.0
        set_pose_world_transform(arm_obj, "Pelvis", (2.5, s * 2.5, -s * 4.0), (0, 0, bob))
        set_pose_world_transform(arm_obj, "Spine", (3.5, -s * 2.0, s * 3.5))
        set_pose_world_transform(arm_obj, "Head", (-2.0, s * 1.8, -s * 2.0))
        set_pose_world_transform(arm_obj, "UpperLeg.L", (-s * 30.0, 0, 0))
        set_pose_world_transform(arm_obj, "LowerLeg.L", (knee_l, 0, 0))
        set_pose_world_transform(arm_obj, "Foot.L", (s * 12.0, 0, 0))
        set_pose_world_transform(arm_obj, "UpperLeg.R", (s * 30.0, 0, 0))
        set_pose_world_transform(arm_obj, "LowerLeg.R", (knee_r, 0, 0))
        set_pose_world_transform(arm_obj, "Foot.R", (-s * 12.0, 0, 0))
        # Opposite arm swing
        set_pose_world_transform(arm_obj, "UpperArm.L", (s * 26.0, -4.0, 0))
        set_pose_world_transform(arm_obj, "LowerArm.L", (-max(0.0, -s) * 18.0 - 8.0, 0, 0))
        set_pose_world_transform(arm_obj, "UpperArm.R", (-s * 26.0, 4.0, 0))
        set_pose_world_transform(arm_obj, "LowerArm.R", (-max(0.0, s) * 18.0 - 8.0, 0, 0))
        set_pose_world_transform(arm_obj, "Ear.L", (-abs(c) * 6.0, 0, 0))
        set_pose_world_transform(arm_obj, "Ear.R", (-abs(c) * 6.0, 0, 0))
        set_pose_world_transform(arm_obj, "Tail", (6.0, 0, math.sin(phase * 2.0) * 18.0))
        keyframe_all_bones(arm_obj, f)
    actions_created.append((act_walk, 0, 30))

    # 3. RUN (20 frames @ 30fps) - energetic cartoon sprint with forward lean
    act_run = bpy.data.actions.new(name="Run")
    arm_obj.animation_data.action = act_run
    for f in range(0, 21, 2):
        reset_pose(arm_obj)
        phase = (f / 20.0) * 2.0 * math.pi
        s = math.sin(phase)
        c = math.cos(phase)
        bob = (abs(c) - 0.25) * H * 0.055
        knee_l = max(0.0, -c) * 48.0 + 8.0
        knee_r = max(0.0, c) * 48.0 + 8.0
        set_pose_world_transform(arm_obj, "Pelvis", (9.0, s * 3.5, -s * 6.0), (0, 0, bob))
        set_pose_world_transform(arm_obj, "Spine", (8.0, -s * 2.5, s * 5.0))
        set_pose_world_transform(arm_obj, "Chest", (5.0, 0, s * 3.0))
        set_pose_world_transform(arm_obj, "Head", (-10.0, s * 2.0, -s * 3.0))
        set_pose_world_transform(arm_obj, "UpperLeg.L", (-s * 46.0, 0, 0))
        set_pose_world_transform(arm_obj, "LowerLeg.L", (knee_l, 0, 0))
        set_pose_world_transform(arm_obj, "Foot.L", (s * 18.0, 0, 0))
        set_pose_world_transform(arm_obj, "UpperLeg.R", (s * 46.0, 0, 0))
        set_pose_world_transform(arm_obj, "LowerLeg.R", (knee_r, 0, 0))
        set_pose_world_transform(arm_obj, "Foot.R", (-s * 18.0, 0, 0))
        set_pose_world_transform(arm_obj, "UpperArm.L", (s * 44.0, -8.0, 0))
        set_pose_world_transform(arm_obj, "LowerArm.L", (-32.0, 0, 0))
        set_pose_world_transform(arm_obj, "UpperArm.R", (-s * 44.0, 8.0, 0))
        set_pose_world_transform(arm_obj, "LowerArm.R", (-32.0, 0, 0))
        set_pose_world_transform(arm_obj, "Ear.L", (-14.0 + c * 6.0, 0, 0))
        set_pose_world_transform(arm_obj, "Ear.R", (-14.0 - c * 6.0, 0, 0))
        set_pose_world_transform(arm_obj, "Tail", (14.0, 0, math.sin(phase * 2.0) * 24.0))
        keyframe_all_bones(arm_obj, f)
    actions_created.append((act_run, 0, 20))

    # 4. JUMP (25 frames @ 30fps) - anticipation squash, upward stretch, arms up
    act_jump = bpy.data.actions.new(name="Jump")
    arm_obj.animation_data.action = act_jump
    jump_poses = [
        # (frame, pelvis_dz, torso_rx, leg_rx, knee_rx, arm_up_deg, arm_fwd_deg, ear_rx)
        (0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
        (5, -H * 0.06, 12.0, -26.0, 42.0, -15.0, 18.0, 8.0),
        (11, H * 0.08, -8.0, 12.0, 8.0, 82.0, -20.0, -14.0),
        (16, H * 0.10, -5.0, -14.0, 24.0, 92.0, -25.0, -10.0),
        (21, -H * 0.04, 8.0, -20.0, 32.0, 25.0, -8.0, 6.0),
        (25, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
    ]
    for f, dz, trx, lrx, krx, aup, afwd, erx in jump_poses:
        reset_pose(arm_obj)
        set_pose_world_transform(arm_obj, "Pelvis", (trx * 0.5, 0, 0), (0, 0, dz))
        set_pose_world_transform(arm_obj, "Spine", (trx * 0.5, 0, 0))
        set_pose_world_transform(arm_obj, "Head", (-trx * 0.6, 0, 0))
        set_pose_world_transform(arm_obj, "UpperLeg.L", (lrx, -3.0, 0))
        set_pose_world_transform(arm_obj, "LowerLeg.L", (krx, 0, 0))
        set_pose_world_transform(arm_obj, "UpperLeg.R", (lrx, 3.0, 0))
        set_pose_world_transform(arm_obj, "LowerLeg.R", (krx, 0, 0))
        set_pose_world_transform(arm_obj, "UpperArm.L", (afwd, -aup, 0))
        set_pose_world_transform(arm_obj, "UpperArm.R", (afwd, aup, 0))
        set_pose_world_transform(arm_obj, "Ear.L", (erx, 0, 0))
        set_pose_world_transform(arm_obj, "Ear.R", (erx, 0, 0))
        set_pose_world_transform(arm_obj, "Tail", (10.0, 0, math.sin(f * 0.5) * 20.0))
        keyframe_all_bones(arm_obj, f)
    actions_created.append((act_jump, 0, 25))

    # 5. SWAT (18 frames @ 30fps) - upward arm/paw reach for hitting the Keepy Uppy balloon
    act_swat = bpy.data.actions.new(name="Swat")
    arm_obj.animation_data.action = act_swat
    swat_poses = [
        # (frame, dz, head_rx, r_arm_up, r_arm_fwd, l_arm_up, l_arm_fwd)
        (0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
        (4, -H * 0.035, 10.0, -12.0, 15.0, -8.0, 10.0),
        (8, H * 0.055, -18.0, 108.0, -42.0, 68.0, -28.0),
        (12, H * 0.03, -12.0, 88.0, -55.0, 45.0, -18.0),
        (18, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
    ]
    for f, dz, hrx, rup, rfwd, lup, lfwd in swat_poses:
        reset_pose(arm_obj)
        set_pose_world_transform(arm_obj, "Pelvis", (0, 0, -rup * 0.08), (0, 0, dz))
        set_pose_world_transform(arm_obj, "Spine", (-hrx * 0.3, 0, -rup * 0.1))
        set_pose_world_transform(arm_obj, "Head", (hrx, 0, 0))
        set_pose_world_transform(arm_obj, "UpperArm.R", (rfwd, rup, 0))
        set_pose_world_transform(arm_obj, "LowerArm.R", (-18.0, 0, 0))
        set_pose_world_transform(arm_obj, "UpperArm.L", (lfwd, -lup, 0))
        set_pose_world_transform(arm_obj, "Tail", (8.0, 0, math.sin(f * 0.7) * 22.0))
        keyframe_all_bones(arm_obj, f)
    actions_created.append((act_swat, 0, 18))

    # 6. WAVE (40 frames @ 30fps) - friendly wave for drop-off intro cutscene & NPC greetings
    act_wave = bpy.data.actions.new(name="Wave")
    arm_obj.animation_data.action = act_wave
    for f in range(0, 41, 4):
        reset_pose(arm_obj)
        env = smoothstep(0, 8, f) * (1.0 - smoothstep(32, 40, f))
        osc = math.sin((f / 40.0) * 6.0 * math.pi)
        set_pose_world_transform(arm_obj, "Pelvis", (0, env * 2.5, 0), (0, 0, abs(osc) * env * H * 0.012))
        set_pose_world_transform(arm_obj, "Head", (-env * 4.0, env * 5.0 + osc * env * 3.0, -env * 4.0))
        set_pose_world_transform(arm_obj, "UpperArm.R", (-16.0 * env, (92.0 + osc * 14.0) * env, 0))
        set_pose_world_transform(arm_obj, "LowerArm.R", (-12.0 * env, osc * 26.0 * env, 0))
        set_pose_world_transform(arm_obj, "Hand.R", (0, osc * 16.0 * env, 0))
        set_pose_world_transform(arm_obj, "Ear.L", (osc * env * 4.0, 0, 0))
        set_pose_world_transform(arm_obj, "Ear.R", (-osc * env * 4.0, 0, 0))
        set_pose_world_transform(arm_obj, "Tail", (6.0, 0, osc * 22.0))
        keyframe_all_bones(arm_obj, f)
    actions_created.append((act_wave, 0, 40))

    bpy.ops.object.mode_set(mode="OBJECT")

    # Push every action onto its own NLA track so glTF exports exact clip names
    arm_obj.animation_data.action = None
    for act, f_start, f_end in actions_created:
        act.use_fake_user = True
        track = arm_obj.animation_data.nla_tracks.new()
        track.name = act.name
        strip = track.strips.new(act.name, f_start, act)
        strip.name = act.name


def process_meshy_character(spec):
    src = os.path.join(RAW_DIR, spec["raw_file"])
    dst = os.path.join(OUT_CHAR_DIR, f"{spec['id']}.glb")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=src)
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    meshes = get_scene_meshes()
    min_v, max_v = compute_world_bbox(meshes)
    native_height = max(max_v.z - min_v.z, 0.01)

    anim_names = read_glb_animation_names(src)
    is_destiny = spec["id"] == "destiny"
    clip_map = map_meshy_clips(anim_names, is_destiny=is_destiny)
    missing = [k for k, v in clip_map.items() if not v]

    print(f"[Meshy] {spec['name']}: arm={len(arms)}, native_h={native_height:.3f}m, clips={clip_map}, missing={missing}")
    if not missing:
        # Preserve Meshy Pro skeleton, PBR materials/textures, and clips 100% intact!
        shutil.copy2(src, dst)
    else:
        raise RuntimeError(f"Meshy model {spec['raw_file']} missing clips: {missing}")


def process_static_family_character(spec):
    src = os.path.join(RAW_DIR, spec["raw_file"])
    dst = os.path.join(OUT_CHAR_DIR, f"{spec['id']}.glb")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = get_scene_meshes()
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    arm_existing = arms[0] if arms else None
    cid = spec["id"]
    H = spec["target_height"]

    if cid in ("bandit", "bingo"):
        meshes = clean_bandit_or_bingo(meshes, arm_existing)
    elif cid == "chilli":
        meshes = clean_chilli(meshes, arm_existing)
    elif cid == "bluey":
        meshes = clean_and_decimate_bluey(meshes)

    normalize_character_transform(meshes, H)
    arm_obj = create_cartoon_armature(cid, H)

    if cid in ("bandit", "bingo"):
        assign_weights_bandit_bingo(meshes, arm_obj)
    elif cid == "chilli":
        assign_weights_chilli(meshes, arm_obj, H)
    elif cid == "bluey":
        assign_weights_bluey(meshes, arm_obj, H)

    bake_cartoon_actions(arm_obj, H)

    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_animations=True,
        export_nla_strips=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_yup=True,
    )
    print(f"[Rigged & Baked] {spec['name']} -> {dst}")


def main():
    print("=== Starting Phase 1 Character Processing ===")
    for spec in CHARACTER_SPECS:
        if spec["meshy"]:
            process_meshy_character(spec)
        else:
            process_static_family_character(spec)
    print("=== All 8 Characters Processed Successfully! ===")


if __name__ == "__main__":
    main()
