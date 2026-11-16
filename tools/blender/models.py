# Builds the game's car and tree models in Blender and writes them as compact JSON:
# one entry per material, with positions/normals as integers (×1000) and triangle indices.
# Usage: pip install bpy, then  python3 tools/blender/models.py -- public/models
import bpy, bmesh, math, random, json, os, sys
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]
os.makedirs(OUT, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {}
def mat(key, color, rough=0.6, metal=0.0, emit=False):
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new(key)
    m['spec'] = json.dumps({'key': key, 'color': color, 'rough': rough, 'metal': metal, 'emit': emit})
    MATS[key] = m
    return m

def add(o, m, smooth=True):
    o.data.materials.clear()
    o.data.materials.append(m)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o

def cube(size, loc, m, bevel=0.0, seg=2, smooth=True):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = seg
        b.harden_normals = False
    return add(o, m, smooth)

def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=16, r2=None, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts, location=loc, rotation=rot)
    return add(bpy.context.object, m, smooth)

def taper(o, zmin, k_x, k_y):
    # Narrow the top of a mesh (above zmin, in its local space)
    for v in o.data.vertices:
        if v.co.z > zmin:
            v.co.x *= k_x
            v.co.y *= k_y

def write(name):
    """Evaluate modifiers, convert to game axes (x, z, -y), group triangles by material."""
    dg = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for o in bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        me.calc_loop_triangles()
        mw = o.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        corner_normals = me.corner_normals
        for tri in me.loop_triangles:
            mi = me.materials[tri.material_index] if me.materials else None
            spec = mi['spec'] if mi else json.dumps({'key': 'x', 'color': [1, 0, 1]})
            g = groups.setdefault(spec, {'pos': [], 'nor': [], 'map': {}, 'idx': []})
            for li in tri.loops:
                vi = me.loops[li].vertex_index
                p = mw @ me.vertices[vi].co
                n = (nm @ corner_normals[li].vector).normalized()
                key = (round(p.x, 3), round(p.z, 3), round(-p.y, 3), round(n.x, 2), round(n.z, 2), round(-n.y, 2))
                if key not in g['map']:
                    g['map'][key] = len(g['pos']) // 3
                    g['pos'] += [int(round(key[0] * 1000)), int(round(key[1] * 1000)), int(round(key[2] * 1000))]
                    g['nor'] += [int(round(key[3] * 100)), int(round(key[4] * 100)), int(round(key[5] * 100))]
                g['idx'].append(g['map'][key])
        oe.to_mesh_clear()
    parts = []
    for spec, g in groups.items():
        s = json.loads(spec)
        s.update({'pos': g['pos'], 'nor': g['nor'], 'idx': g['idx']})
        parts.append(s)
    tris = sum(len(p['idx']) // 3 for p in parts)
    with open(os.path.join(OUT, name + '.json'), 'w') as f:
        json.dump({'parts': parts}, f, separators=(',', ':'))
    print(name, 'tris', tris, 'bytes', os.path.getsize(os.path.join(OUT, name + '.json')))

# ---------------- cars (front at -Y in Blender = +Z in the game) ----------------
def car(kind):
    reset()
    MATS.clear()
    paint = mat('paint', [0.7, 0.05, 0.06], rough=0.3, metal=0.5)
    dark = mat('trim', [0.025, 0.025, 0.03], rough=0.75)
    tyre = mat('tyre', [0.02, 0.02, 0.022], rough=0.9)
    glass = mat('glass', [0.03, 0.05, 0.08], rough=0.06, metal=0.8)
    chrome = mat('chrome', [0.7, 0.72, 0.75], rough=0.25, metal=1.0)
    head = mat('head', [1.0, 0.95, 0.82], emit=True)
    tail = mat('tail', [0.85, 0.04, 0.04], emit=True)
    L, W = (2.3, 1.12) if kind != 'pickup' else (2.45, 1.16)
    tall = {'sedan': 0.0, 'suv': 0.16, 'pickup': 0.08}[kind]
    bodyH = 0.4 + tall
    # Lower body: rounded slab, wheel arches cut by subtracting cylinders
    body = cube((W, L, bodyH), (0, 0, 0.27 + bodyH / 2), paint, bevel=0.12, seg=3)
    for y in (-L * 0.31, L * 0.31):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.29, depth=W + 0.4, vertices=20, location=(0, y, 0.22), rotation=(0, math.pi / 2, 0))
        cutter = bpy.context.object
        b = body.modifiers.new('arch', 'BOOLEAN')
        b.object = cutter
        b.operation = 'DIFFERENCE'
        b.solver = 'EXACT'
        cutter.hide_set(True)
        cutter.hide_render = True
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier='arch')
        bpy.data.objects.remove(cutter)
    top = 0.27 + bodyH
    # Bonnet slope at the front
    hood = cube((W - 0.06, 0.7, 0.08), (0, -L / 2 + 0.42, top - 0.01), paint, bevel=0.03)
    hood.rotation_euler.x = -0.08
    # Cabin
    if kind == 'pickup':
        cabL, cabY = 0.95, -0.05
    elif kind == 'suv':
        cabL, cabY = 1.55, 0.18
    else:
        cabL, cabY = 1.2, 0.08
    cabH = 0.42 + tall * 0.3
    cab = cube((W - 0.08, cabL, cabH), (0, cabY, top + cabH / 2 - 0.02), glass, bevel=0.08, seg=3)
    taper(cab, 0.0, 0.86, 0.8 if kind == 'sedan' else 0.9)
    # Roof skin and pillars over the glass
    roof = cube(((W - 0.08) * 0.86 + 0.02, cabL * (0.8 if kind == 'sedan' else 0.9) + 0.02, 0.05), (0, cabY, top + cabH - 0.02), paint, bevel=0.02)
    for y in (cabY - cabL * 0.38, cabY + cabL * 0.38):
        p = cube((W * 0.93, 0.07, cabH * 0.9), (0, y, top + cabH / 2 - 0.02), paint, bevel=0.02)
        taper(p, 0.0, 0.88, 1)
        p.rotation_euler.x = 0.35 if y < cabY else -0.35
    p = cube((W * 0.92, 0.06, cabH * 0.9), (0, cabY, top + cabH / 2 - 0.02), paint)  # B pillar
    taper(p, 0.0, 0.9, 1)
    if kind == 'sedan':
        cube((W - 0.1, 0.5, 0.06), (0, L / 2 - 0.33, top), paint, bevel=0.02)  # boot lid
    if kind == 'pickup':
        bedY = cabY + cabL / 2 + 0.55
        for sx in (-1, 1):
            cube((0.07, 1.0, 0.24), (sx * (W / 2 - 0.035), bedY, top + 0.1), paint, bevel=0.02)
        cube((W, 0.07, 0.24), (0, L / 2 - 0.04, top + 0.1), paint, bevel=0.02)
        cube((W - 0.14, 1.0, 0.03), (0, bedY, top - 0.06), dark)
    if kind == 'suv':
        for sx in (-0.3, 0.3):
            cube((0.05, cabL * 0.85, 0.04), (sx, cabY, top + cabH + 0.03), chrome)  # roof rails
        cyl(0.24, 0.12, (0, L / 2 + 0.05, top - 0.12), tyre, rot=(math.pi / 2, 0, 0), verts=14)  # spare wheel
    # Door seams, handles, mirrors, lights, bumpers, grille, plate
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.003)
        for y in (cabY - 0.05, cabY + cabL * 0.45) if kind != 'pickup' else (cabY + cabL * 0.45,):
            cube((0.01, 0.015, bodyH * 0.8), (x, y, 0.27 + bodyH / 2 + 0.02), dark, smooth=False)
        cube((0.03, 0.13, 0.03), (x, cabY - 0.2, top - 0.1), chrome)
        cube((0.03, 0.13, 0.03), (x, cabY + 0.38, top - 0.1), chrome) if kind != 'pickup' else None
        cube((0.12, 0.14, 0.09), (sx * (W / 2 + 0.05), cabY - cabL * 0.42, top + 0.06), paint, bevel=0.03)
        cube((0.26, 0.04, 0.11), (sx * (W / 2 - 0.2), -L / 2 + 0.005, top - 0.13), head, bevel=0.02)
        cube((0.22, 0.04, 0.1), (sx * (W / 2 - 0.18), L / 2 - 0.005, top - 0.13), tail, bevel=0.02)
        for y in (-L * 0.31, L * 0.31):
            cyl(0.24, 0.2, (sx * (W / 2 - 0.1), y, 0.24), tyre, rot=(0, math.pi / 2, 0), verts=18)
            cyl(0.14, 0.21, (sx * (W / 2 - 0.1), y, 0.24), chrome, rot=(0, math.pi / 2, 0), verts=10)
    cube((W + 0.04, 0.12, 0.16), (0, -L / 2 - 0.02, 0.36), dark, bevel=0.05)
    cube((W + 0.04, 0.12, 0.16), (0, L / 2 + 0.02, 0.36), dark, bevel=0.05)
    cube((W * 0.5, 0.03, 0.14), (0, -L / 2 - 0.005, top - 0.14), dark, bevel=0.01)
    cube((0.3, 0.02, 0.1), (0, L / 2 + 0.085, 0.42), chrome)
    write('car_' + kind)

for k in ('sedan', 'suv', 'pickup'):
    car(k)

# ---------------- trees ----------------
def tree(name, seed, shape):
    reset()
    MATS.clear()
    random.seed(seed)
    bark = mat('bark', [0.2, 0.12, 0.065], rough=0.9)
    leaf = mat('leaf', [0.12, 0.32, 0.08], rough=0.85)
    leaf2 = mat('leaf2', [0.17, 0.4, 0.1], rough=0.85)
    h = {'round': 1.5, 'tall': 2.0, 'wide': 1.2}[shape]
    cyl(0.17, h, (0, 0, h / 2), bark, verts=8, r2=0.1)
    cyl(0.27, 0.18, (0, 0, 0.09), bark, verts=8, r2=0.17)
    for k in range(3):
        a = k * 2.1 + random.uniform(0, 0.5)
        l = cyl(0.07, 0.8, (math.cos(a) * 0.2, math.sin(a) * 0.2, h + 0.15), bark, verts=6, r2=0.03)
        l.rotation_euler = (math.sin(a) * -0.6, math.cos(a) * 0.6, 0)
    if shape == 'tall':
        spots = [(0, 0, h + 1.5, 0.75)] + [(math.cos(a) * 0.45, math.sin(a) * 0.45, h + 0.6 + random.uniform(0, 1.4), random.uniform(0.45, 0.6)) for a in [i * 1.6 for i in range(6)]] + [(0, 0, h + 2.3, 0.45)]
    elif shape == 'wide':
        spots = [(0, 0, h + 0.75, 1.0)] + [(math.cos(a) * 0.95, math.sin(a) * 0.95, h + 0.45 + random.uniform(0, 0.35), random.uniform(0.6, 0.78)) for a in [i * 1.05 + random.uniform(0, 0.3) for i in range(6)]]
    else:
        spots = [(0, 0, h + 0.95, 0.92)] + [(math.cos(a) * 0.62, math.sin(a) * 0.62, h + 0.6 + random.uniform(0, 0.45), random.uniform(0.52, 0.72)) for a in [i * 1.26 + random.uniform(0, 0.4) for i in range(5)]] + [(0.08, -0.04, h + 1.65, 0.55)]
    for i, (x, y, z, r) in enumerate(spots):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=(x, y, z))
        o = bpy.context.object
        for v in o.data.vertices:
            v.co *= 1 + random.uniform(-0.13, 0.15)
        o.scale.z = 0.86
        add(o, leaf2 if (z > h + 1.1 and i % 2 == 0) else leaf, smooth=False)
    write('tree_' + shape)

tree('round', 7, 'round')
tree('tall', 11, 'tall')
tree('wide', 19, 'wide')
