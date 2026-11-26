#!/usr/bin/env python3
"""
Phase 1 - Environment, Balloon & Drop-Off Car Asset Pipeline (scripts/prepare_assets.py)
Run via: blender -b -P scripts/prepare_assets.py

1. Normalizes heeler_house.glb:
   - Centers X/Y at 0, sets front lawn surface cleanly at Y=0 (Blender Z=0)
   - Scales uniformly (13.5x) so rooms (~3.56m ceiling) and open front doorway (~2.5m)
     fit 1.68m adults and ~1.0m kids comfortably
   - Cleans & decimates 1.59M raw faces -> ~105k crisp manifold faces (preserving UVs/textures)
     so Rapier's trimesh collider builds instantaneously without browser freeze
   - Exports to public/models/environment/heeler_house.glb
2. Normalizes balloon.glb (from raw baloon.glb / balloon.glb):
   - Centers origin at the sphere bulb center (0,0,0) so a Rapier "ball" collider aligns
     accurately with the visual balloon bulb while the string hangs below
   - Scales bulb diameter to 0.45m (radius 0.225m), applies glossy cartoon red material
   - Exports to public/models/props/balloon.glb
3. Procedurally builds Destiny's Drop-Off SUV (destiny_car.glb):
   - Colorful Bluey-inspired family SUV facing +Z in Three.js (-Y in Blender)
   - 4 separate child wheel meshes (Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR) centered on hubs
   - DriverSeatAnchor and PassengerDropAnchor nodes for the 3D drop-off cutscene
   - Exports to public/models/props/destiny_car.glb
"""

import os
import math
import bpy
import bmesh
import mathutils

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_DIR = os.path.join(ROOT_DIR, "raw_models")
if not os.path.exists(RAW_DIR):
    RAW_DIR = os.path.join(ROOT_DIR, "raw models")

ENV_OUT = os.path.join(ROOT_DIR, "public", "models", "environment")
PROPS_OUT = os.path.join(ROOT_DIR, "public", "models", "props")
os.makedirs(ENV_OUT, exist_ok=True)
os.makedirs(PROPS_OUT, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def prepare_heeler_house():
    clear_scene()
    src = os.path.join(RAW_DIR, "heeler_house.glb")
    dst = os.path.join(ENV_OUT, "heeler_house.glb")
    print(f"[House] Importing {src} ...")
    bpy.ops.import_scene.gltf(filepath=src)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("No meshes found in heeler_house.glb!")

    # Bake world matrices into mesh data
    for m in meshes:
        mw = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = mathutils.Matrix.Identity(4)
        m.data.transform(mw)

    if len(meshes) > 1:
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
    house = bpy.context.view_layer.objects.active or meshes[0]
    house.name = "HeelerHouse"

    # Find lawn Z median in front yard region (X in [-0.45, 0.45], Y in [-0.85, -0.55])
    xs = [v.co.x for v in house.data.vertices]
    ys = [v.co.y for v in house.data.vertices]
    cx = 0.5 * (min(xs) + max(xs))
    cy = 0.5 * (min(ys) + max(ys))
    lawn_zs = sorted(
        v.co.z for v in house.data.vertices
        if -0.45 < v.co.x < 0.45 and -0.85 < v.co.y < -0.55
    )
    lawn_z = lawn_zs[len(lawn_zs) // 2] if lawn_zs else min(v.co.z for v in house.data.vertices)

    # Scale 13.5x -> indoor floor-to-ceiling = 3.56m, property ~20.2m x 25.6m, lawn at Z=0
    scale_factor = 13.5
    xform = (
        mathutils.Matrix.Scale(scale_factor, 4)
        @ mathutils.Matrix.Translation((-cx, -cy, -lawn_z))
    )
    house.data.transform(xform)
    house.data.update()

    # Decimate 1.59M faces -> ~110k crisp triangles while preserving UV boundaries for Rapier trimesh
    bpy.context.view_layer.objects.active = house
    mod = house.modifiers.new(name="DecimateTrimesh", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = 0.07
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

    # Remove degenerate zero-area faces or loose vertices so Rapier trimesh is 100% clean
    bm = bmesh.new()
    bm.from_mesh(house.data)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-4, edges=bm.edges[:])
    loose_verts = [v for v in bm.verts if not v.link_faces]
    if loose_verts:
        bmesh.ops.delete(bm, geom=loose_verts, context="VERTS")
    bm.to_mesh(house.data)
    bm.free()
    house.data.update()

    # Ensure warm matte roughness on house material so sunlit cartoon colors pop without harsh glare
    for mat in house.data.materials:
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Roughness"].default_value = 0.85
                    n.inputs["Metallic"].default_value = 0.0

    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )
    print(f"[House] Exported normalized HeelerHouse ({len(house.data.vertices)} verts, {len(house.data.polygons)} tris) -> {dst}")


def prepare_balloon():
    clear_scene()
    src = os.path.join(RAW_DIR, "balloon.glb")
    if not os.path.exists(src):
        src = os.path.join(RAW_DIR, "baloon.glb")
    dst = os.path.join(PROPS_OUT, "balloon.glb")

    if os.path.exists(src):
        print(f"[Balloon] Importing {src} ...")
        bpy.ops.import_scene.gltf(filepath=src)
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        for m in meshes:
            mw = m.matrix_world.copy()
            m.parent = None
            m.matrix_world = mathutils.Matrix.Identity(4)
            m.data.transform(mw)
        if len(meshes) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for m in meshes:
                m.select_set(True)
            bpy.context.view_layer.objects.active = meshes[0]
            bpy.ops.object.join()
        balloon = meshes[0]
        balloon.name = "KeepyUppyBalloon"

        # Find bulb bounding box (upper wide portion, excluding thin hanging string!)
        zs = [v.co.z for v in balloon.data.vertices]
        z_max = max(zs)
        z_min = min(zs)
        # In raw baloon.glb, X/Y width is ~0.166m and bulb occupies top ~0.20m of Z
        xs_all = [v.co.x for v in balloon.data.vertices]
        raw_diam = max(xs_all) - min(xs_all)
        bulb_z_floor = z_max - raw_diam * 1.22
        bulb_verts = [v.co for v in balloon.data.vertices if v.co.z >= bulb_z_floor]
        bx = 0.5 * (min(v.x for v in bulb_verts) + max(v.x for v in bulb_verts))
        by = 0.5 * (min(v.y for v in bulb_verts) + max(v.y for v in bulb_verts))
        bz = 0.5 * (min(v.z for v in bulb_verts) + max(v.z for v in bulb_verts))

        scale = 0.45 / max(raw_diam, 1e-4)
        xform = (
            mathutils.Matrix.Scale(scale, 4)
            @ mathutils.Matrix.Translation((-bx, -by, -bz))
        )
        balloon.data.transform(xform)
        balloon.data.update()

        # Give the bulb a vibrant glossy cartoon Keepy Uppy red while keeping string crisp
        mat_red = bpy.data.materials.new("KeepyRedBalloonMat")
        mat_red.use_nodes = True
        bsdf = mat_red.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (0.94, 0.12, 0.16, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.20
        bsdf.inputs["Specular IOR Level"].default_value = 0.65

        mat_string = bpy.data.materials.new("BalloonStringMat")
        mat_string.use_nodes = True
        bsdf_s = mat_string.node_tree.nodes.get("Principled BSDF")
        bsdf_s.inputs["Base Color"].default_value = (0.96, 0.95, 0.92, 1.0)
        bsdf_s.inputs["Roughness"].default_value = 0.7

        balloon.data.materials.clear()
        balloon.data.materials.append(mat_red)
        balloon.data.materials.append(mat_string)
        for poly in balloon.data.polygons:
            # Knot starts right below -0.235m after scaling bulb to radius 0.225m
            poly.material_index = 1 if poly.center.z < -0.245 else 0
    else:
        print("[Balloon] Generating procedural glossy red balloon...")
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=24, radius=0.225, location=(0, 0, 0))
        balloon = bpy.context.active_object
        balloon.name = "KeepyUppyBalloon"

    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )
    print(f"[Balloon] Exported normalized 0.45m Keepy Uppy balloon -> {dst}")


def make_mat(name, rgba, roughness=0.4, metallic=0.05, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else "HASHED"
    return mat


def add_beveled_box(name, size_xyz, loc_xyz, mat, bevel_width=0.08, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc_xyz)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size_xyz
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bev = obj.modifiers.new(name="Bevel", type="BEVEL")
    bev.width = bevel_width
    bev.segments = 3
    bpy.ops.object.modifier_apply(modifier=bev.name)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def prepare_destiny_car():
    """
    Build a joyful Bluey-style cartoon family SUV facing +Z in Three.js (-Y in Blender):
      - Length along Y: -2.05m (front bumper) to +2.05m (rear bumper)
      - Width along X: -0.96m (right/driver or passenger) to +0.96m (left)
      - Ground at Z = 0.0
      - 4 separate spinning wheel meshes: Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR
      - DriverSeatAnchor (inside cabin behind steering wheel) & PassengerDropAnchor
    """
    clear_scene()
    dst = os.path.join(PROPS_OUT, "destiny_car.glb")

    mat_paint = make_mat("CarPaintCoralBlue", (0.24, 0.62, 0.88, 1.0), roughness=0.32, metallic=0.1)
    mat_roof = make_mat("CarRoofCream", (0.98, 0.95, 0.88, 1.0), roughness=0.45)
    mat_trim = make_mat("CarBumperTrim", (0.18, 0.22, 0.29, 1.0), roughness=0.6)
    mat_glass = make_mat("CarGlassTint", (0.72, 0.90, 0.99, 1.0), roughness=0.12, alpha=0.32)
    mat_tire = make_mat("CarTireDark", (0.14, 0.15, 0.18, 1.0), roughness=0.8)
    mat_rim = make_mat("CarHubcapYellow", (0.98, 0.82, 0.28, 1.0), roughness=0.35)
    mat_headlight = make_mat("CarHeadlight", (1.0, 0.96, 0.72, 1.0), roughness=0.2)
    mat_taillight = make_mat("CarTaillight", (0.95, 0.22, 0.22, 1.0), roughness=0.3)
    mat_seat = make_mat("CarSeatTan", (0.85, 0.64, 0.42, 1.0), roughness=0.75)

    car_root = bpy.data.objects.new("DestinyCarRoot", None)
    bpy.context.scene.collection.objects.link(car_root)

    # Lower chassis & side panels (open cabin interior so Destiny is visible inside!)
    add_beveled_box("ChassisFloor", (1.84, 3.90, 0.24), (0.0, 0.0, 0.42), mat_paint, 0.06, car_root)
    add_beveled_box("FrontHood", (1.82, 1.15, 0.56), (0.0, -1.38, 0.74), mat_paint, 0.10, car_root)
    add_beveled_box("RearTrunk", (1.82, 0.85, 0.58), (0.0, 1.52, 0.75), mat_paint, 0.10, car_root)
    # Left & Right lower doors (leaving upper windows open!)
    add_beveled_box("DoorPanel_L", (0.14, 1.95, 0.52), (0.85, 0.05, 0.72), mat_paint, 0.04, car_root)
    add_beveled_box("DoorPanel_R", (0.14, 1.95, 0.52), (-0.85, 0.05, 0.72), mat_paint, 0.04, car_root)

    # Roof & slim pillars so Destiny is clearly visible driving & waving inside!
    add_beveled_box("RoofTop", (1.68, 2.15, 0.14), (0.0, 0.18, 1.78), mat_roof, 0.05, car_root)
    add_beveled_box("RoofRack_L", (0.07, 1.65, 0.08), (0.64, 0.22, 1.88), mat_trim, 0.02, car_root)
    add_beveled_box("RoofRack_R", (0.07, 1.65, 0.08), (-0.64, 0.22, 1.88), mat_trim, 0.02, car_root)
    for px, py, tilt in [
        (0.76, -0.78, -0.32), (-0.76, -0.78, -0.32),
        (0.76, 0.20, 0.0), (-0.76, 0.20, 0.0),
        (0.76, 1.15, 0.22), (-0.76, 1.15, 0.22),
    ]:
        p = add_beveled_box(f"Pillar_{px:.1f}_{py:.1f}", (0.10, 0.11, 0.82), (px, py, 1.36), mat_roof, 0.02, car_root)
        p.rotation_euler = (tilt, 0.0, 0.0)

    # Semi-transparent front & rear windshields
    ws = add_beveled_box("WindshieldFront", (1.52, 0.05, 0.72), (0.0, -0.82, 1.36), mat_glass, 0.01, car_root)
    ws.rotation_euler = (-0.34, 0.0, 0.0)
    rw = add_beveled_box("WindshieldRear", (1.52, 0.05, 0.68), (0.0, 1.18, 1.36), mat_glass, 0.01, car_root)
    rw.rotation_euler = (0.24, 0.0, 0.0)

    # Bumpers, headlights, taillights, grille
    add_beveled_box("FrontBumper", (1.92, 0.24, 0.22), (0.0, -1.96, 0.42), mat_trim, 0.06, car_root)
    add_beveled_box("RearBumper", (1.92, 0.24, 0.22), (0.0, 1.96, 0.42), mat_trim, 0.06, car_root)
    add_beveled_box("FrontGrille", (0.96, 0.08, 0.24), (0.0, -1.96, 0.72), mat_trim, 0.03, car_root)
    add_beveled_box("Headlight_L", (0.28, 0.10, 0.20), (0.66, -1.95, 0.76), mat_headlight, 0.05, car_root)
    add_beveled_box("Headlight_R", (0.28, 0.10, 0.20), (-0.66, -1.95, 0.76), mat_headlight, 0.05, car_root)
    add_beveled_box("Taillight_L", (0.28, 0.10, 0.22), (0.68, 1.95, 0.80), mat_taillight, 0.04, car_root)
    add_beveled_box("Taillight_R", (0.28, 0.10, 0.22), (-0.68, 1.95, 0.80), mat_taillight, 0.04, car_root)

    # Cozy interior seats + steering wheel (driver on left +X=0.42 so visible from house/curb!)
    for sname, sx, sy in [("SeatDriver", -0.42, -0.18), ("SeatFrontPass", 0.42, -0.18), ("SeatRearBench", 0.0, 0.68)]:
        w = 0.56 if "Bench" not in sname else 1.38
        add_beveled_box(f"{sname}_Base", (w, 0.52, 0.18), (sx, sy, 0.60), mat_seat, 0.04, car_root)
        add_beveled_box(f"{sname}_Back", (w, 0.16, 0.54), (sx, sy + 0.20, 0.88), mat_seat, 0.04, car_root)

    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.19, minor_radius=0.032,
        location=(-0.42, -0.56, 0.96),
        rotation=(math.radians(65), 0.0, 0.0),
    )
    sw = bpy.context.active_object
    sw.name = "SteeringWheel"
    sw.data.materials.append(mat_trim)
    sw.parent = car_root

    # 4 Separate Wheel Meshes centered at their axle origins so Three.js spins wheel.rotation.x!
    wheel_specs = [
        ("Wheel_FL", (0.92, -1.24, 0.36)),
        ("Wheel_FR", (-0.92, -1.24, 0.36)),
        ("Wheel_RL", (0.92, 1.24, 0.36)),
        ("Wheel_RR", (-0.92, 1.24, 0.36)),
    ]
    for wname, wloc in wheel_specs:
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=24, radius=0.36, depth=0.24,
            location=(0, 0, 0), rotation=(0.0, math.radians(90), 0.0),
        )
        tire = bpy.context.active_object
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        tire.data.materials.append(mat_tire)

        bpy.ops.mesh.primitive_cylinder_add(
            vertices=16, radius=0.21, depth=0.26,
            location=(0, 0, 0), rotation=(0.0, math.radians(90), 0.0),
        )
        rim = bpy.context.active_object
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        rim.data.materials.append(mat_rim)

        # Cross spoke bar so wheel rotation is super obvious visually!
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
        spoke = bpy.context.active_object
        spoke.scale = (0.275, 0.36, 0.07)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        spoke.data.materials.append(mat_trim)

        bpy.ops.object.select_all(action="DESELECT")
        tire.select_set(True)
        rim.select_set(True)
        spoke.select_set(True)
        bpy.context.view_layer.objects.active = tire
        bpy.ops.object.join()
        tire.name = wname
        for p in tire.data.polygons:
            p.use_smooth = True
        tire.location = wloc
        tire.parent = car_root

    # DriverSeatAnchor & PassengerDropAnchor empties
    driver_anchor = bpy.data.objects.new("DriverSeatAnchor", None)
    driver_anchor.location = (-0.42, -0.18, 0.22)
    driver_anchor.parent = car_root
    bpy.context.scene.collection.objects.link(driver_anchor)

    drop_anchor = bpy.data.objects.new("PassengerDropAnchor", None)
    drop_anchor.location = (1.35, 0.05, 0.0)
    drop_anchor.parent = car_root
    bpy.context.scene.collection.objects.link(drop_anchor)

    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_yup=True,
    )
    print(f"[Car] Exported procedural Destiny SUV with 4 separate wheels & anchors -> {dst}")


def main():
    print("=== Starting Phase 1 Environment & Prop Preparation ===")
    prepare_heeler_house()
    prepare_balloon()
    prepare_destiny_car()
    print("=== Environment & Prop Assets Ready! ===")


if __name__ == "__main__":
    main()
