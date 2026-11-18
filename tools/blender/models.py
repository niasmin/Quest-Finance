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
    path = os.path.join(OUT, name + '.json')
    # Blender can list vertices in a different order from run to run; leave the file alone when the
    # shape itself is the same, so regenerating the set doesn't rewrite every model
    def shape(ps):
        out = {}
        for p in ps:
            pos = p['pos']
            tri = []
            for t in range(0, len(p['idx']), 3):
                tri.append(tuple(sorted(tuple(pos[i * 3:i * 3 + 3]) for i in p['idx'][t:t + 3])))
            out[p['key']] = (sorted(tri), p.get('color'), p.get('rough'), p.get('metal'), p.get('emit'))
        return out
    if os.path.exists(path):
        try:
            with open(path) as f:
                if shape(json.load(f)['parts']) == shape(parts):
                    print(name, 'unchanged')
                    return
        except Exception:
            pass
    with open(path, 'w') as f:
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


# ---------------- shared helpers for the vehicles and street furniture ----------------
def slab(points, thick, z, m, smooth=False):
    """A flat shape from (x, y) points, given thickness upward from height z."""
    me = bpy.data.meshes.new('slab')
    n = len(points)
    verts = [(x, y, z) for x, y in points] + [(x, y, z + thick) for x, y in points]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new('slab', me)
    bpy.context.scene.collection.objects.link(o)
    return add(o, m, smooth)

def wheels(m_tyre, m_hub, xs, ys, r, w, z=None):
    for x in xs:
        for y in ys:
            cyl(r, w, (x, y, r if z is None else z), m_tyre, rot=(0, math.pi / 2, 0), verts=16)
            cyl(r * 0.55, w + 0.01, (x, y, r if z is None else z), m_hub, rot=(0, math.pi / 2, 0), verts=10)

def begin():
    reset()
    MATS.clear()

# ---------------- ambulance (front at -Y) ----------------
def ambulance():
    begin()
    white = mat('white', [0.86, 0.87, 0.88], rough=0.35, metal=0.15)
    red = mat('stripe', [0.75, 0.03, 0.04], rough=0.4)
    dark = mat('trim', [0.025, 0.025, 0.03], rough=0.75)
    tyre = mat('tyre', [0.02, 0.02, 0.022], rough=0.9)
    hub = mat('chrome', [0.7, 0.72, 0.75], rough=0.25, metal=1.0)
    glass = mat('glass', [0.03, 0.05, 0.08], rough=0.06, metal=0.8)
    head = mat('head', [1.0, 0.95, 0.82], emit=True)
    tail = mat('tail', [0.85, 0.04, 0.04], emit=True)
    siren = mat('siren', [0.9, 0.1, 0.1], emit=True)
    # Box body at the back, cab and bonnet at the front
    cube((1.4, 2.5, 1.55), (0, 0.55, 0.32 + 0.78), white, bevel=0.06)
    cube((1.36, 1.0, 1.05), (0, -1.15, 0.32 + 0.53), white, bevel=0.1, seg=3)
    cube((1.3, 0.6, 0.55), (0, -1.85, 0.32 + 0.28), white, bevel=0.12, seg=3)
    ws = cube((1.2, 0.05, 0.5), (0, -1.66, 1.12), glass)
    ws.rotation_euler.x = -0.35
    for sx in (-1, 1):
        cube((0.02, 0.6, 0.42), (sx * 0.69, -1.15, 1.1), glass)
        cube((0.02, 2.5, 0.2), (sx * 0.705, 0.55, 0.95), red)  # side stripe
        cube((0.02, 0.5, 0.14), (sx * 0.71, 0.7, 1.5), red)  # cross
        cube((0.02, 0.14, 0.5), (sx * 0.71, 0.7, 1.5), red)
        cube((0.02, 0.5, 0.5), (sx * 0.705, 1.3, 1.45), glass)  # rear side window
        cube((0.1, 0.12, 0.09), (sx * 0.74, -1.5, 1.2), white, bevel=0.02)  # mirror
        cube((0.24, 0.04, 0.12), (sx * 0.45, -2.155, 0.62), head, bevel=0.02)
        cube((0.18, 0.04, 0.3), (sx * 0.55, 1.805, 0.9), tail, bevel=0.02)
    cube((1.3, 0.04, 0.9), (0, 1.81, 1.15), white)  # rear doors
    cube((0.02, 0.05, 0.9), (0, 1.84, 1.15), dark)
    cube((1.44, 0.14, 0.16), (0, -2.2, 0.42), dark, bevel=0.04)
    cube((1.44, 0.14, 0.16), (0, 1.88, 0.42), dark, bevel=0.04)
    cube((1.0, 0.3, 0.14), (0, -1.15, 1.43), siren, bevel=0.04)  # light bar on the cab roof
    cube((0.25, 0.25, 0.12), (0, 1.5, 1.93), siren, bevel=0.03)
    wheels(tyre, hub, (-0.62, 0.62), (-1.4, 1.1), 0.32, 0.22)
    write('ambulance')

# ---------------- airliner (front at -Y, wheels on the ground) ----------------
def airliner():
    begin()
    white = mat('white', [0.88, 0.88, 0.86], rough=0.35, metal=0.2)
    grey = mat('grey', [0.55, 0.57, 0.6], rough=0.4, metal=0.5)
    livery = mat('livery', [0.7, 0.05, 0.06], rough=0.3, metal=0.4)
    glass = mat('glass', [0.03, 0.05, 0.08], rough=0.06, metal=0.8)
    dark = mat('trim', [0.03, 0.03, 0.035], rough=0.7)
    tyre = mat('tyre', [0.02, 0.02, 0.022], rough=0.9)
    zc = 1.6
    cyl(1.0, 9.0, (0, 0, zc), white, rot=(math.pi / 2, 0, 0), verts=24)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=24, ring_count=12, location=(0, -4.5, zc))
    nose = add(bpy.context.object, white)
    nose.scale = (1, 1.7, 0.95)
    tailc = cyl(1.0, 3.4, (0, 6.2, zc + 0.25), white, rot=(-math.pi / 2, 0, 0), verts=24, r2=0.22)
    tailc.rotation_euler.x = -math.pi / 2 + 0.1
    # Wings: swept, with a little dihedral, engines below
    for sx in (-1, 1):
        w = slab([(0, -1.0), (sx * 5.6, 0.9), (sx * 5.6, 1.6), (0, 1.4)], 0.16, zc - 0.55, white)
        w.rotation_euler.y = -sx * 0.06
        slab([(sx * 5.55, 0.9), (sx * 5.75, 1.0), (sx * 5.75, 1.6), (sx * 5.55, 1.6)], 0.7, zc - 0.5, livery)  # winglet
        cyl(0.44, 1.7, (sx * 2.6, -0.4, zc - 0.85), grey, rot=(math.pi / 2, 0, 0), verts=18)
        cyl(0.36, 0.06, (sx * 2.6, -1.26, zc - 0.85), dark, rot=(math.pi / 2, 0, 0), verts=18)
        cube((0.14, 1.0, 0.4), (sx * 2.6, -0.1, zc - 0.5), white)
        slab([(0, 5.6), (sx * 2.2, 7.0), (sx * 2.2, 7.5), (0, 7.4)], 0.1, zc + 0.35, white)  # tailplane
        cube((0.02, 7.6, 0.16), (sx * 0.99, -0.2, zc + 0.35), glass)  # cabin windows
        cube((0.02, 7.8, 0.14), (sx * 0.985, -0.2, zc - 0.2), livery)  # cheat line
        for y in (-3.4, 3.6):
            cube((0.02, 0.5, 0.95), (sx * 0.995, y, zc + 0.1), dark)  # door outlines
    fin = slab([(0, 5.0), (0, 7.6), (0.0, 8.0), (0, 8.0)], 0.0, 0, livery)
    bpy.data.objects.remove(fin)
    me = bpy.data.meshes.new('fin')
    pts = [(5.2, zc + 0.6), (7.75, zc + 0.6), (8.05, zc + 3.4), (7.2, zc + 3.4)]
    verts = [(-0.08, y, z) for y, z in pts] + [(0.08, y, z) for y, z in pts]
    faces = [[0, 1, 2, 3][::-1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new('fin', me)
    bpy.context.scene.collection.objects.link(o)
    add(o, livery, smooth=False)
    cockpit = cube((1.2, 0.4, 0.22), (0, -5.15, zc + 0.42), glass, bevel=0.05)
    cockpit.rotation_euler.x = 0.45
    # Landing gear
    for x, y in ((-0.45, 0.6), (0.45, 0.6)):
        cyl(0.07, 0.7, (x, y, 0.55), grey, verts=8)
        wheels(tyre, grey, (x - 0.08, x + 0.08), (y,), 0.22, 0.14)
    cyl(0.06, 0.8, (0, -4.0, 0.6), grey, verts=8)
    wheels(tyre, grey, (0,), (-4.0,), 0.18, 0.12)
    write('airliner')

# ---------------- fighter jet (front at -Y) ----------------
def jet():
    begin()
    paint = mat('paint', [0.25, 0.28, 0.32], rough=0.4, metal=0.5)
    dark = mat('trim', [0.03, 0.03, 0.035], rough=0.7)
    glass = mat('canopy', [0.2, 0.45, 0.6], rough=0.05, metal=0.6)
    white = mat('missile', [0.85, 0.86, 0.88], rough=0.4)
    red = mat('tip', [0.8, 0.05, 0.05], rough=0.4)
    z = 0.75
    cyl(0.32, 3.0, (0, 0.3, z), paint, rot=(math.pi / 2, 0, 0), verts=14, r2=0.36)
    cyl(0.32, 1.3, (0, -1.85, z), paint, rot=(math.pi / 2, 0, 0), verts=14, r2=0.02)  # nose cone, tip forward
    cyl(0.3, 0.25, (0, 1.9, z), dark, rot=(math.pi / 2, 0, 0), verts=14, r2=0.24)  # nozzle
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.26, segments=14, ring_count=8, location=(0, -0.9, z + 0.25))
    c = add(bpy.context.object, glass)
    c.scale = (0.9, 2.1, 0.75)
    for sx in (-1, 1):
        slab([(0, -1.0), (sx * 1.85, 0.9), (sx * 1.85, 1.2), (0, 1.3)], 0.07, z - 0.08, paint)  # delta wing
        slab([(sx * 0.2, 1.2), (sx * 0.95, 1.85), (sx * 0.95, 2.05), (sx * 0.2, 1.95)], 0.05, z, paint)
        cube((0.28, 0.9, 0.3), (sx * 0.4, -0.2, z - 0.05), paint, bevel=0.06)  # intakes
        cube((0.22, 0.04, 0.24), (sx * 0.4, -0.66, z - 0.05), dark)
        cyl(0.05, 1.0, (sx * 1.25, 0.4, z - 0.18), white, rot=(math.pi / 2, 0, 0), verts=8)
        cyl(0.05, 0.18, (sx * 1.25, -0.19, z - 0.18), red, rot=(math.pi / 2, 0, 0), verts=8, r2=0.0)
        fin = cube((0.05, 0.75, 0.75), (sx * 0.22, 1.5, z + 0.5), paint)
        fin.rotation_euler.y = sx * 0.3
        taper(fin, 0.0, 1, 0.55)
    for x, y in ((-0.35, 0.4), (0.35, 0.4), (0, -1.4)):
        cyl(0.03, 0.45, (x, y, 0.32), dark, verts=6)
        cyl(0.11, 0.08, (x, y, 0.11), dark, rot=(0, math.pi / 2, 0), verts=10)
    write('jet')

# ---------------- tank: hull and turret as two files, so the turret can turn ----------------
def tank():
    begin()
    olive = mat('olive', [0.12, 0.15, 0.05], rough=0.75)
    olive2 = mat('olive2', [0.09, 0.11, 0.035], rough=0.8)
    track = mat('track', [0.02, 0.02, 0.022], rough=0.9)
    steel = mat('steel', [0.25, 0.26, 0.27], rough=0.5, metal=0.6)
    head = mat('head', [1.0, 0.95, 0.82], emit=True)
    cube((1.5, 2.6, 0.5), (0, 0, 0.6), olive, bevel=0.05)
    glacis = cube((1.5, 0.7, 0.08), (0, -1.45, 0.66), olive, bevel=0.02)
    glacis.rotation_euler.x = 0.55
    for sx in (-1, 1):
        cube((0.42, 2.9, 0.5), (sx * 0.84, 0, 0.3), track, bevel=0.2, seg=4)
        cube((0.48, 2.95, 0.05), (sx * 0.84, 0, 0.6), olive2, bevel=0.02)
        for k in range(6):
            cyl(0.19, 0.44, (sx * 0.84, -1.05 + k * 0.42, 0.26), steel, rot=(0, math.pi / 2, 0), verts=12)
        cube((0.16, 0.06, 0.1), (sx * 0.6, -1.32, 0.86), head, bevel=0.02)
        cube((0.3, 0.6, 0.18), (sx * 0.55, 0.9, 0.94), olive2, bevel=0.03)  # stowage boxes
    cyl(0.12, 0.35, (0.4, 1.2, 0.95), olive2, verts=10)  # exhaust
    write('tank_hull')
    begin()
    olive = mat('olive', [0.1, 0.125, 0.04], rough=0.75)
    olive2 = mat('olive2', [0.08, 0.1, 0.03], rough=0.8)
    steel = mat('steel', [0.08, 0.09, 0.05], rough=0.6, metal=0.3)
    t = cube((1.05, 1.35, 0.42), (0, 0.05, 1.07), olive, bevel=0.08, seg=2)
    taper(t, 0.0, 0.85, 0.85)
    cyl(0.085, 1.9, (0, -1.5, 1.1), steel, rot=(math.pi / 2, 0, 0), verts=12)
    cyl(0.13, 0.25, (0, -2.4, 1.1), steel, rot=(math.pi / 2, 0, 0), verts=12)
    cyl(0.16, 0.3, (0, -0.65, 1.1), olive2, rot=(math.pi / 2, 0, 0), verts=12)  # mantlet
    cyl(0.2, 0.1, (-0.2, 0.2, 1.33), olive2, verts=12)
    cyl(0.012, 1.1, (0.38, 0.5, 1.8), steel, verts=4)
    cube((0.8, 0.28, 0.24), (0, 0.78, 1.02), olive2, bevel=0.03)
    write('tank_turret')

# ---------------- warship (front at -Y) ----------------
def ship():
    begin()
    grey = mat('hull', [0.32, 0.36, 0.4], rough=0.55, metal=0.3)
    light = mat('deck', [0.62, 0.65, 0.68], rough=0.5)
    red = mat('waterline', [0.45, 0.03, 0.03], rough=0.6)
    dark = mat('trim', [0.03, 0.03, 0.035], rough=0.7)
    glass = mat('glass', [0.03, 0.05, 0.08], rough=0.06, metal=0.8)
    hullpts = [(-0.75, 2.4), (-0.78, 0.0), (-0.6, -2.2), (0, -3.5), (0.6, -2.2), (0.78, 0.0), (0.75, 2.4)]
    slab(hullpts, 0.22, -0.15, red)
    slab(hullpts, 0.62, 0.07, grey)
    slab([(x * 0.96, y * 0.98) for x, y in hullpts], 0.03, 0.69, light)
    cube((1.0, 1.5, 0.6), (0, 0.5, 1.0), light, bevel=0.04)
    cube((0.8, 0.8, 0.5), (0, 0.4, 1.55), light, bevel=0.04)
    cube((0.82, 0.02, 0.16), (0, -0.01, 1.62), glass)
    cyl(0.04, 1.4, (0, 0.5, 2.4), dark, verts=6)
    rad = cube((0.9, 0.08, 0.2), (0, 0.5, 2.9), dark)
    cyl(0.18, 0.6, (0, 1.4, 1.3), grey, verts=12, r2=0.15)  # funnel
    cyl(0.32, 0.25, (0, -1.5, 0.84), grey, verts=14)  # gun turret
    cyl(0.05, 0.9, (0, -2.0, 0.9), dark, rot=(math.pi / 2, 0, 0), verts=8)
    cyl(0.25, 0.2, (0, 1.95, 0.82), grey, verts=12)
    for sx in (-1, 1):
        cube((0.03, 4.4, 0.03), (sx * 0.72, -0.1, 0.95), light)
    write('ship')

# ---------------- street lamp and park bench ----------------
def lamp():
    begin()
    metal = mat('lamp', [0.06, 0.08, 0.09], rough=0.45, metal=0.6)
    cyl(0.14, 0.25, (0, 0, 0.12), metal, verts=12, r2=0.09)
    cyl(0.07, 2.45, (0, 0, 1.35), metal, verts=10, r2=0.045)
    arm = cyl(0.03, 0.5, (0.2, 0, 2.58), metal, rot=(0, math.pi / 2, 0), verts=8)
    cube((0.34, 0.2, 0.1), (0.4, 0, 2.6), metal, bevel=0.04)
    write('lamp')

def bench():
    begin()
    wood = mat('slat', [0.33, 0.16, 0.06], rough=0.7)
    iron = mat('iron', [0.04, 0.045, 0.05], rough=0.5, metal=0.5)
    for k in range(3):
        cube((1.3, 0.12, 0.04), (0, -0.16 + k * 0.14, 0.45), wood, bevel=0.015)
    for k in range(2):
        cube((1.3, 0.04, 0.11), (0, 0.25, 0.62 + k * 0.16), wood, bevel=0.015)  # backrest slats
    for x in (-0.55, 0.55):
        cube((0.05, 0.42, 0.05), (x, 0.0, 0.22), iron, bevel=0.01)
        cube((0.05, 0.05, 0.85), (x, 0.24, 0.43), iron, bevel=0.01)
        cube((0.05, 0.42, 0.04), (x, 0.03, 0.44), iron)
        cube((0.05, 0.36, 0.04), (x, 0.0, 0.62), iron)  # arm rest
    write('bench')

# ---------------- rescue helicopter: body and rotor as two files, so the rotor can spin ----------------
def helicopter():
    begin()
    white = mat('white', [0.86, 0.87, 0.88], rough=0.35, metal=0.15)
    red = mat('stripe', [0.75, 0.03, 0.04], rough=0.4)
    dark = mat('trim', [0.03, 0.03, 0.035], rough=0.6, metal=0.3)
    glass = mat('glass', [0.05, 0.12, 0.18], rough=0.05, metal=0.7)
    zc = 1.1
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.8, segments=20, ring_count=12, location=(0, 0, zc))
    b = add(bpy.context.object, white)
    b.scale = (0.95, 1.55, 0.92)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.62, segments=18, ring_count=10, location=(0, -0.75, zc + 0.12))
    c = add(bpy.context.object, glass)
    c.scale = (1.15, 1.1, 0.9)
    cyl(0.82, 0.32, (0, 0.25, zc), red, rot=(math.pi / 2, 0, 0), verts=20)  # band round the cabin
    cyl(0.2, 2.6, (0, 2.3, zc + 0.3), white, rot=(-math.pi / 2, 0, 0), verts=12, r2=0.09)  # tail boom
    me = bpy.data.meshes.new('fin')
    pts = [(3.2, zc + 0.25), (3.75, zc + 0.25), (3.95, zc + 1.0), (3.55, zc + 1.0)]
    verts = [(-0.04, y, z) for y, z in pts] + [(0.04, y, z) for y, z in pts]
    me.from_pydata(verts, [], [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]])
    o = bpy.data.objects.new('fin', me)
    bpy.context.scene.collection.objects.link(o)
    add(o, red, smooth=False)
    cyl(0.28, 0.04, (0.06, 3.55, zc + 0.45), dark, rot=(0, math.pi / 2, 0), verts=12)  # tail rotor disc
    cube((0.7, 0.04, 0.1), (0, 3.6, zc + 0.3), white)  # stabiliser
    cyl(0.08, 0.35, (0, 0, zc + 0.85), dark, verts=8)  # mast
    cube((0.5, 0.7, 0.18), (0, 0.15, zc + 0.75), white, bevel=0.06)  # engine housing
    for sx in (-1, 1):
        cube((0.02, 0.36, 0.36), (sx * 0.77, 0.35, zc + 0.05), red)  # cross on each side
        cube((0.02, 0.12, 0.36), (sx * 0.775, 0.35, zc + 0.05), white)
        cube((0.02, 0.36, 0.12), (sx * 0.775, 0.35, zc + 0.05), white)
        sk = cyl(0.05, 2.3, (sx * 0.65, 0.0, 0.08), dark, rot=(math.pi / 2, 0, 0), verts=8)
        for y in (-0.5, 0.55):
            leg = cyl(0.035, 0.55, (sx * 0.6, y, 0.33), dark, verts=6)
            leg.rotation_euler.y = sx * 0.25
    write('heli_body')
    begin()
    dark = mat('trim', [0.03, 0.03, 0.035], rough=0.5, metal=0.4)
    cyl(0.14, 0.1, (0, 0, 0), dark, verts=12)
    for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        bl = cube((2.3, 0.2, 0.03), (math.cos(a) * 1.15, math.sin(a) * 1.15, 0), dark)
        bl.rotation_euler.z = a
        bl.rotation_euler.x = 0.06
    write('heli_rotor')

# ---------------- armoured car (front at -Y) ----------------
def armored():
    begin()
    green = mat('green', [0.13, 0.16, 0.06], rough=0.75)
    green2 = mat('green2', [0.09, 0.11, 0.04], rough=0.8)
    tyre = mat('tyre', [0.02, 0.02, 0.022], rough=0.9)
    hub = mat('hub', [0.12, 0.14, 0.06], rough=0.6)
    glass = mat('glass', [0.03, 0.05, 0.08], rough=0.06, metal=0.8)
    steel = mat('steel', [0.08, 0.09, 0.05], rough=0.6, metal=0.3)
    head = mat('head', [1.0, 0.95, 0.82], emit=True)
    body = cube((1.45, 2.6, 0.75), (0, 0, 0.85), green, bevel=0.06)
    taper(body, 0.0, 0.9, 0.95)
    nose = cube((1.36, 0.5, 0.5), (0, -1.5, 0.72), green, bevel=0.05)
    taper(nose, 0.0, 1.0, 0.55)  # sloped front plate
    cube((1.1, 0.04, 0.24), (0, -1.12, 1.1), glass)
    cyl(0.3, 0.3, (0, 0.1, 1.38), green2, verts=12)  # small turret
    cyl(0.045, 0.8, (0, -0.4, 1.42), steel, rot=(math.pi / 2, 0, 0), verts=8)
    cyl(0.25, 0.12, (0, 1.36, 0.95), tyre, rot=(math.pi / 2, 0, 0), verts=14)  # spare wheel
    for sx in (-1, 1):
        cube((0.04, 0.5, 0.22), (sx * 0.7, -0.3, 1.0), glass)
        cube((0.16, 0.06, 0.1), (sx * 0.5, -1.72, 0.74), head, bevel=0.02)
        cube((0.1, 2.7, 0.06), (sx * 0.78, 0, 0.52), green2)  # side skirt
    wheels(tyre, hub, (-0.74, 0.74), (-0.85, 0.0, 0.85), 0.33, 0.26)
    write('armored')

# ---------------- body parts for people, each centred where the game places it ----------------
def person_parts():
    begin()
    torso = mat('torso', [0.6, 0.6, 0.6], rough=0.7)
    leg = mat('leg', [0.3, 0.3, 0.3], rough=0.8)
    arm = mat('arm', [0.6, 0.6, 0.6], rough=0.7)
    shoe = mat('shoe', [0.05, 0.05, 0.05], rough=0.6)
    hand = mat('hand', [0.8, 0.6, 0.45], rough=0.7)
    # Torso: shoulders wider than the waist, rounded chest, a hint of collar
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=14, ring_count=9, location=(0, 0, 0))
    t = add(bpy.context.object, torso)
    # Half-width by height (sphere z from -1 to 1): hips, waist, chest, broad shoulders, then the neck
    prof = [(-1.0, 0.2), (-0.7, 0.245), (-0.25, 0.225), (0.3, 0.26), (0.68, 0.29), (0.9, 0.2), (1.0, 0.1)]
    def width(z):
        for (z0, w0), (z1, w1) in zip(prof, prof[1:]):
            if z <= z1:
                return w0 + (w1 - w0) * (z - z0) / (z1 - z0)
        return prof[-1][1]
    for v in t.data.vertices:
        z = v.co.z
        r = math.hypot(v.co.x, v.co.y) or 1
        # Re-shape each ring: width from the profile, depth a bit less, chest slightly forward
        v.co.x = v.co.x / r * width(z) * (1 if abs(z) < 1 else 0)
        v.co.y = v.co.y / r * width(z) * 0.78 - (0.02 if 0.1 < z < 0.7 else 0)
        v.co.z = z * 0.42
    t.location = (0, 0, 0)
    cyl(0.1, 0.08, (0, 0, 0.4), torso, verts=10)  # collar
    write('pp_torso')
    begin()
    leg = mat('leg', [0.3, 0.3, 0.3], rough=0.8)
    cyl(0.095, 0.48, (0, 0, 0), leg, verts=10, r2=0.072)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.095, segments=10, ring_count=5, location=(0, 0, 0.24))
    add(bpy.context.object, leg)
    write('pp_leg')
    begin()
    arm = mat('arm', [0.6, 0.6, 0.6], rough=0.7)
    cyl(0.072, 0.42, (0, 0, 0.0), arm, verts=8, r2=0.058)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.074, segments=8, ring_count=5, location=(0, 0, 0.21))
    add(bpy.context.object, arm)
    write('pp_arm')
    begin()
    shoe = mat('shoe', [0.05, 0.05, 0.05], rough=0.6)
    s = cube((0.15, 0.27, 0.12), (0, -0.04, 0.0), shoe, bevel=0.04, seg=2)
    taper(s, 0.0, 0.9, 0.75)
    write('pp_shoe')
    begin()
    hand = mat('hand', [0.8, 0.6, 0.45], rough=0.7)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07, segments=8, ring_count=6, location=(0, 0, 0))
    h = add(bpy.context.object, hand)
    h.scale = (0.8, 1.0, 1.2)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.028, segments=6, ring_count=4, location=(0, -0.055, 0.02))
    add(bpy.context.object, hand)  # thumb
    write('pp_hand')

# ---------------- the hospital's front: trim that sits on the plain block (origin = block centre at ground) ----------------
def hospital_front():
    begin()
    trim = mat('trim', [0.86, 0.85, 0.81], rough=0.6)
    stone = mat('stone', [0.5, 0.48, 0.45], rough=0.75)
    fy = -1.5  # the block's front face
    cube((22.25, 0.16, 0.55), (0, fy - 0.07, 0.275), stone, bevel=0.03, seg=1)  # plinth
    cube((22.15, 0.12, 0.16), (0, fy - 0.05, 3.7), trim, bevel=0.02, seg=1)  # band between storeys
    cube((22.35, 0.2, 0.12), (0, fy - 0.09, 6.74), trim, bevel=0.02, seg=1)  # cornice, two steps
    cube((22.5, 0.3, 0.09), (0, fy - 0.14, 6.86), trim, bevel=0.02, seg=1)
    for sx in (-1, 1):  # the cornice and plinth turn the corners
        cube((0.2, 3.0, 0.12), (sx * 11.09, 0, 6.74), trim, bevel=0.02, seg=1)
        cube((0.16, 3.0, 0.55), (sx * 11.06, 0, 0.275), stone, bevel=0.03, seg=1)
    for i in range(7):
        x = -10.2 + i * 3.4
        cube((0.36, 0.14, 6.2), (x, fy - 0.06, 3.65), trim, bevel=0.03, seg=1)  # pilaster
        cube((0.5, 0.2, 0.32), (x, fy - 0.09, 0.71), stone, bevel=0.03, seg=1)  # base
        cube((0.52, 0.22, 0.2), (x, fy - 0.1, 6.55), trim, bevel=0.03, seg=1)  # capital
    for i in range(6):
        x = -8.5 + i * 3.4
        for zc in (2.4, 5.0):
            cube((1.95, 0.24, 0.1), (x, fy - 0.1, zc - 0.72), trim, bevel=0.02, seg=1)  # sill
            cube((1.9, 0.14, 0.16), (x, fy - 0.06, zc + 0.76), trim, bevel=0.02, seg=1)  # lintel
            cube((0.24, 0.18, 0.28), (x, fy - 0.08, zc + 0.78), stone, bevel=0.02, seg=1)  # keystone
            for sx in (-1, 1):
                cube((0.1, 0.1, 1.34), (x + sx * 0.86, fy - 0.04, zc), trim)  # reveal
    write('hospital_front')

# ---------------- entrance canopy (origin = canopy centre at ground) ----------------
def entrance_canopy():
    begin()
    white = mat('white', [0.86, 0.87, 0.88], rough=0.4, metal=0.1)
    red = mat('fascia', [0.75, 0.04, 0.05], rough=0.4)
    glass = mat('glass', [0.25, 0.45, 0.55], rough=0.05, metal=0.5)
    steel = mat('steel', [0.6, 0.62, 0.65], rough=0.3, metal=0.9)
    slab_ = cube((4.7, 2.5, 0.2), (0, 0, 2.95), white, bevel=0.06, seg=2)
    cube((4.8, 0.14, 0.3), (0, -1.28, 3.02), red, bevel=0.03)  # front fascia
    for sx in (-1, 1):
        cube((0.14, 2.6, 0.3), (sx * 2.38, 0, 3.02), red, bevel=0.03)
    cube((4.2, 2.0, 0.04), (0, 0.05, 3.08), glass)  # glass roof light
    for sx in (-1, 1):
        cyl(0.13, 2.8, (sx * 2.0, -1.0, 1.4), steel, verts=14)
        cyl(0.22, 0.2, (sx * 2.0, -1.0, 0.1), white, verts=14)
        cyl(0.18, 0.12, (sx * 2.0, -1.0, 2.82), white, verts=14)
    write('entrance_canopy')

hospital_front()
entrance_canopy()
# ---------------- trim kit: unit pieces the game stretches to fit any building ----------------
# Each piece's back sits on y = 0 and it projects toward -Y (the wall's outward face in the game).
# Cornice and plinth are 1 long (x from -0.5 to 0.5); the corner pilaster is 1 tall.
def trim_kit():
    begin()
    trim = mat('trim', [0.86, 0.85, 0.81], rough=0.6)
    cube((1, 0.1, 0.12), (0, -0.05, -0.12), trim, bevel=0.015, seg=1)
    cube((1, 0.17, 0.1), (0, -0.085, -0.01), trim, bevel=0.015, seg=1)
    cube((1, 0.22, 0.05), (0, -0.11, 0.065), trim, bevel=0.015, seg=1)
    write('kit_cornice')
    begin()
    stone = mat('stone', [0.5, 0.48, 0.45], rough=0.75)
    cube((1, 0.08, 0.3), (0, -0.04, 0.15), stone, bevel=0.015, seg=1)
    cube((1, 0.11, 0.07), (0, -0.055, 0.33), stone, bevel=0.015, seg=1)
    write('kit_plinth')
    begin()
    trim = mat('trim', [0.86, 0.85, 0.81], rough=0.6)
    cube((0.26, 0.26, 1), (0, 0, 0.5), trim, bevel=0.02, seg=1)
    write('kit_corner')

trim_kit()

# ---------------- bus shelter (front at -Y; the bench and sign are added by the game) ----------------
def bus_shelter():
    begin()
    frame = mat('frame', [0.04, 0.06, 0.09], rough=0.45, metal=0.6)
    roof = mat('roof', [0.05, 0.16, 0.55], rough=0.4, metal=0.2)
    pane = mat('pane', [0.55, 0.72, 0.85], rough=0.1, metal=0.3)
    ad = mat('ad', [1.0, 0.85, 0.45], emit=True)
    r = cube((2.3, 1.15, 0.08), (0, 0.05, 2.18), roof, bevel=0.03, seg=1)
    for v in r.data.vertices:  # roof slopes down toward the back
        v.co.z -= v.co.y * 0.12
    cube((2.32, 0.06, 0.12), (0, -0.53, 2.2), roof, bevel=0.02, seg=1)
    for x in (-1.05, 1.05):
        for y in (0.42, -0.3):
            cyl(0.04, 2.15, (x, y, 1.07), frame, verts=8)
    cube((2.06, 0.03, 1.55), (0, 0.42, 1.2), pane)  # back glass
    cube((2.1, 0.06, 0.06), (0, 0.42, 1.98), frame)
    cube((2.1, 0.06, 0.06), (0, 0.42, 0.42), frame)
    for x in (-1.05, 1.05):
        cube((0.03, 0.66, 1.4), (x, 0.06, 1.25), pane)  # side glass
    cube((0.06, 0.62, 1.2), (1.05, 0.06, 1.2), ad)  # lit advert panel on one end
    write('bus_shelter')

# ---------------- airport control tower (origin at the foot) ----------------
def control_tower():
    begin()
    concrete = mat('concrete', [0.72, 0.72, 0.7], rough=0.8)
    band = mat('band', [0.45, 0.46, 0.48], rough=0.7)
    glass = mat('glass', [0.05, 0.12, 0.18], rough=0.05, metal=0.7)
    dark = mat('trim', [0.05, 0.06, 0.07], rough=0.5, metal=0.4)
    cube((4.0, 3.0, 2.6), (0, 0, 1.3), concrete, bevel=0.06, seg=1)  # base building
    cube((4.1, 3.1, 0.2), (0, 0, 2.65), band, bevel=0.03, seg=1)
    cube((3.6, 0.04, 0.8), (0, -1.52, 1.4), glass)
    cyl(1.15, 7.0, (0, 0, 6.0), concrete, verts=20, r2=0.85)  # tapering shaft
    for z in (4.0, 6.0, 8.0):
        cyl(1.12 - (z - 2.5) * 0.043, 0.18, (0, 0, z), band, verts=20)
    cyl(1.25, 0.35, (0, 0, 9.6), band, verts=20)  # gallery floor
    cyl(1.55, 0.1, (0, 0, 9.82), dark, verts=24)
    cyl(1.45, 1.4, (0, 0, 10.55), glass, verts=12, r2=1.85)  # cab, windows leaning out
    cyl(1.95, 0.2, (0, 0, 11.35), concrete, verts=12)
    cyl(1.2, 0.3, (0, 0, 11.6), band, verts=12)
    cyl(1.62, 0.06, (0, 0, 10.1), dark, verts=12)  # frame rings round the cab glass
    cyl(1.78, 0.06, (0, 0, 10.9), dark, verts=12)
    cyl(0.04, 1.6, (0.6, 0.3, 12.5), dark, verts=6)  # antennas
    cyl(0.03, 1.1, (-0.5, -0.4, 12.2), dark, verts=6)
    dish = cyl(0.45, 0.2, (-0.8, 0.5, 12.0), concrete, verts=14, r2=0.1)
    dish.rotation_euler.x = 0.6
    write('control_tower')

bus_shelter()
control_tower()

def lower_half_off(o, z=0.0):
    """Delete every vertex below height z (in world space, after applying transforms)."""
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z + o.location.z < z - 1e-4], context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    o.select_set(False)
    return o

# ---------------- arched hangar for the base, 6 wide and 5 deep (front at -Y) ----------------
def base_hangar():
    begin()
    paint = mat('paint', [0.4, 0.45, 0.5], rough=0.45, metal=0.5)
    rib = mat('rib', [0.2, 0.24, 0.27], rough=0.5, metal=0.5)
    door = mat('door', [0.2, 0.25, 0.27], rough=0.6, metal=0.3)
    yellow = mat('yellow', [0.95, 0.7, 0.1], rough=0.5)
    dark = mat('trim', [0.03, 0.03, 0.035], rough=0.6)
    concrete = mat('concrete', [0.55, 0.55, 0.53], rough=0.85)
    glass = mat('glass', [0.05, 0.12, 0.18], rough=0.05, metal=0.7)
    shell = cyl(3.0, 5.0, (0, 0, 0), paint, rot=(math.pi / 2, 0, 0), verts=28)
    lower_half_off(shell)
    bm = bmesh.new()  # keep only the curved skin (drop the half end caps), then give it thickness
    bm.from_mesh(shell.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.y) > 0.9], context='FACES')
    bm.to_mesh(shell.data)
    bm.free()
    sol = shell.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.06
    for k in range(6):
        bpy.ops.mesh.primitive_torus_add(major_radius=3.03, minor_radius=0.07, major_segments=28, minor_segments=6, location=(0, -2.4 + k * 0.96, 0), rotation=(math.pi / 2, 0, 0))
        r = add(bpy.context.object, rib)
        lower_half_off(r)
    back = cyl(2.98, 0.06, (0, 2.45, 0), paint, rot=(math.pi / 2, 0, 0), verts=28)
    lower_half_off(back)
    frame = cyl(2.98, 0.08, (0, -2.47, 0), rib, rot=(math.pi / 2, 0, 0), verts=28)
    lower_half_off(frame)
    for sx in (-1, 1):
        cube((2.3, 0.08, 2.4), (sx * 1.18, -2.53, 1.2), door, bevel=0.02, seg=1)  # sliding doors
        for k in range(6):
            cube((0.05, 0.02, 2.3), (sx * (0.25 + k * 0.38), -2.58, 1.2), dark)  # door ribs
        for k in range(3):
            cube((2.3, 0.02, 0.14), (sx * 1.18, -2.59, 0.2 + k * 0.3), yellow if k % 2 == 0 else dark)
        cube((0.03, 3.6, 0.35), (sx * 2.2, 0, 1.9), glass)  # roof lights along the sides
    cube((0.3, 0.06, 2.5), (0, -2.6, 1.25), yellow)  # centre post between the doors
    cube((6.6, 1.2, 0.08), (0, -3.1, 0.04), concrete, bevel=0.02, seg=1)  # apron slab
    write('hangar')

# ---------------- Thai temple for the town strip, 4.4 wide (front at -Y) ----------------
def temple():
    begin()
    base = mat('base', [0.85, 0.84, 0.8], rough=0.7)
    wall = mat('wall', [0.92, 0.85, 0.7], rough=0.7)
    white = mat('white', [0.9, 0.9, 0.88], rough=0.6)
    roof = mat('roof', [0.62, 0.17, 0.02], rough=0.55)
    green = mat('green', [0.05, 0.3, 0.12], rough=0.55)
    gold = mat('gold', [0.85, 0.6, 0.12], rough=0.3, metal=0.8)
    cube((4.6, 3.2, 0.3), (0, 0, 0.15), base, bevel=0.03, seg=1)
    cube((4.3, 2.9, 0.15), (0, 0, 0.37), base, bevel=0.02, seg=1)
    for k in range(3):  # front steps
        cube((1.4, 0.3, 0.12), (0, -1.6 - k * 0.22, 0.32 - k * 0.11), base)
    cube((3.4, 2.2, 1.7), (0, 0.1, 1.3), wall, bevel=0.03, seg=1)
    for x in (-1.6, -0.95, 0.95, 1.6):  # columns along the front porch
        cyl(0.11, 1.9, (x, -1.25, 1.39), white, verts=12)
        cube((0.3, 0.3, 0.1), (x, -1.25, 2.38), gold)
    cube((0.8, 0.05, 1.3), (0, -1.0, 1.1), gold, bevel=0.01, seg=1)  # doors
    for x in (-1.15, 1.15):
        cube((0.5, 0.05, 0.7), (x, -1.0, 1.35), gold)  # windows
    def tier(w, d, h, z, mroof):
        ang = math.atan2(h, d / 2)
        slope = math.hypot(d / 2, h)
        for sy in (-1, 1):
            sl = cube((w, slope + 0.2, 0.1), (0, sy * d / 4, z + h / 2), mroof)
            sl.rotation_euler.x = sy * ang
        cube((w + 0.1, 0.16, 0.12), (0, 0, z + h + 0.04), gold)  # ridge
        for sx in (-1, 1):
            me = bpy.data.meshes.new('gable')
            pts = [(-d / 2, z), (d / 2, z), (0, z + h)]
            x = sx * w / 2
            verts = [(x - 0.03, y, zz) for y, zz in pts] + [(x + 0.03, y, zz) for y, zz in pts]
            me.from_pydata(verts, [], [[2, 1, 0], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]])
            o = bpy.data.objects.new('gable', me)
            bpy.context.scene.collection.objects.link(o)
            add(o, gold, smooth=False)
            ch = cyl(0.05, 0.55, (x + sx * 0.12, 0, z + h + 0.22), gold, verts=6, r2=0.01)  # chofa finial
            ch.rotation_euler.y = sx * 0.6
    tier(4.0, 3.0, 1.0, 2.2, roof)
    tier(3.2, 2.3, 0.8, 2.85, green)
    tier(2.2, 1.6, 0.6, 3.4, roof)
    write('temple')

base_hangar()
temple()

# ---------------- military base buildings (front at -Y, origin = footprint centre at ground) ----------------
def mil_common():
    return dict(
        wall=mat('milwall', [0.62, 0.58, 0.45], rough=0.8),
        wall2=mat('milwall2', [0.5, 0.47, 0.36], rough=0.8),
        roof=mat('milroof', [0.12, 0.15, 0.06], rough=0.7),
        trim=mat('miltrim', [0.82, 0.8, 0.72], rough=0.7),
        glass=mat('milglass', [0.04, 0.08, 0.1], rough=0.1, metal=0.6),
        door=mat('mildoor', [0.22, 0.25, 0.18], rough=0.7),
        steel=mat('steel', [0.3, 0.32, 0.33], rough=0.5, metal=0.7),
        sand=mat('sandbag', [0.55, 0.48, 0.32], rough=0.95),
        star=mat('star', [0.95, 0.75, 0.15], rough=0.4, metal=0.5),
    )

def windows_row(m, w, y, z0, z1, n, h=0.55, wd=0.6):
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        cube((wd, 0.06, h), (x, y, (z0 + z1) / 2), m['glass'])
        cube((wd + 0.14, 0.09, 0.08), (x, y - 0.02, (z0 + z1) / 2 - h / 2 - 0.04), m['trim'])  # sill

def mil_hq():
    begin(); m = mil_common()
    w, d, h = 9, 5, 3.2
    cube((w, d, h), (0, 0, h / 2), m['wall'], bevel=0.04, seg=1)
    cube((w + 0.3, d + 0.3, 0.25), (0, 0, h + 0.12), m['roof'], bevel=0.03, seg=1)
    cube((w + 0.1, d + 0.1, 0.4), (0, 0, 0.2), m['wall2'], bevel=0.02, seg=1)
    for zc in (1.1, 2.4):
        windows_row(m, w - 1.5, -d / 2 - 0.01, zc - 0.3, zc + 0.3, 6)
    # Portico with columns, a pediment and a star
    cube((3.2, 1.2, 0.2), (0, -d / 2 - 0.6, 2.6), m['trim'], bevel=0.03, seg=1)
    for x in (-1.3, -0.45, 0.45, 1.3):
        cyl(0.13, 2.5, (x, -d / 2 - 1.05, 1.3), m['trim'], verts=12)
    me = bpy.data.meshes.new('ped')
    pts = [(-1.7, 2.7), (1.7, 2.7), (0, 3.4)]
    verts = [(x, -d / 2 - 1.2, z) for x, z in pts] + [(x, -d / 2 + 0.0, z) for x, z in pts]
    me.from_pydata(verts, [], [[2, 1, 0], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]])
    o = bpy.data.objects.new('ped', me); bpy.context.scene.collection.objects.link(o); add(o, m['trim'], smooth=False)
    cyl(0.22, 0.05, (0, -d / 2 - 1.22, 3.0), m['star'], rot=(math.pi / 2, 0, 0), verts=5)
    cube((1.2, 0.08, 1.8), (0, -d / 2 - 0.01, 0.9), m['door'])
    for k in range(3):  # steps
        cube((3.0, 0.3, 0.12), (0, -d / 2 - 1.5 - k * 0.25, 0.3 - k * 0.1), m['wall2'])
    cube((0.9, 0.9, 0.5), (2.6, 0.8, h + 0.5), m['steel'], bevel=0.04, seg=1)  # rooftop plant
    cyl(0.04, 2.2, (-3.2, 0.5, h + 1.1), m['steel'], verts=6)  # radio mast
    write('mil_hq')

def mil_barracks():
    begin(); m = mil_common()
    w, d, h = 8, 5, 2.4
    cube((w, d, h), (0, 0, h / 2), m['wall'], bevel=0.04, seg=1)
    r = cube((w + 0.4, d + 0.5, 0.14), (0, 0, h + 0.5), m['roof'])
    for sy in (-1, 1):
        sl = cube((w + 0.4, d / 2 + 0.45, 0.12), (0, sy * 1.38, h + 0.43), m['roof'])
        sl.rotation_euler.x = -sy * 0.36
    bpy.data.objects.remove(r)
    # Gable ends under the roof
    me = bpy.data.meshes.new('gable')
    verts = []
    for x in (-w / 2, w / 2):
        verts += [(x, -d / 2, h), (x, d / 2, h), (x, 0, h + 0.85)]
    me.from_pydata(verts, [], [[0, 1, 2], [5, 4, 3]])
    o = bpy.data.objects.new('gable', me); bpy.context.scene.collection.objects.link(o); add(o, m['wall'], smooth=False)
    windows_row(m, w - 1, -d / 2 - 0.01, 0.9, 1.8, 6)
    windows_row(m, w - 1, d / 2 + 0.01, 0.9, 1.8, 6)
    for x in (-2.5, 2.5):
        cube((1.0, 0.08, 1.7), (x, -d / 2 - 0.01, 0.85), m['door'])
        cube((1.4, 0.6, 0.08), (x, -d / 2 - 0.3, 1.95), m['roof'])  # door canopy
    # Sandbag wall in front
    for k in range(9):
        cube((0.8, 0.4, 0.28), (-3.6 + k * 0.9, -d / 2 - 2.0, 0.14 + (k % 2) * 0.0), m['sand'], bevel=0.1, seg=2)
        cube((0.8, 0.4, 0.28), (-3.15 + k * 0.9, -d / 2 - 2.0, 0.42), m['sand'], bevel=0.1, seg=2) if k < 8 else None
    write('mil_barracks')

def mil_depot():
    begin(); m = mil_common()
    w, d, h = 7, 5, 2.6
    cube((w, d, h), (0, 0, h / 2), m['wall2'], bevel=0.04, seg=1)
    cube((w + 0.3, d + 0.3, 0.2), (0, 0, h + 0.1), m['roof'], bevel=0.03, seg=1)
    for x in (-2.2, 0, 2.2):
        cube((1.8, 0.08, 1.9), (x, -d / 2 - 0.01, 0.95), m['steel'])
        for k in range(8):
            cube((1.8, 0.02, 0.03), (x, -d / 2 - 0.06, 0.15 + k * 0.23), m['door'])
        cube((2.0, 0.1, 0.12), (x, -d / 2 - 0.03, 1.95), m['trim'])
    windows_row(m, w - 1, d / 2 + 0.01, 1.4, 2.1, 5, h=0.4)
    cyl(0.12, 0.8, (2.8, 1.6, h + 0.5), m['steel'], verts=10)  # exhaust stack
    write('mil_depot')

def mil_shed():
    begin(); m = mil_common()
    w, d = 8, 5
    for x in (-3.8, -1.27, 1.27, 3.8):
        for y in (-2.3, 2.3):
            cube((0.22, 0.22, 3.0), (x, y, 1.5), m['steel'])
        tr = cube((0.12, d, 0.12), (x, 0, 3.0), m['steel'])
    for sy in (-1, 1):
        sl = cube((w + 0.4, d / 2 + 0.5, 0.1), (0, sy * 1.47, 3.25), m['roof'])
        sl.rotation_euler.x = -sy * 0.2
    cube((w, 0.12, 0.14), (0, 0, 3.5), m['steel'])
    cube((w, 0.25, 1.2), (0, d / 2, 0.6), m['wall2'])  # back wall
    cube((w + 0.4, d + 0.4, 0.06), (0, 0, 0.03), m['wall2'])  # concrete slab
    write('mil_shed')

def navy_pier():
    begin(); m = mil_common()
    wood = mat('pier', [0.35, 0.22, 0.12], rough=0.85)
    cube((13, 1.2, 0.18), (0, 0, 0.32), wood, bevel=0.02, seg=1)
    for x in [i * 1.3 - 6.2 for i in range(10)]:
        cyl(0.1, 0.9, (x, -0.55, 0.0), m['steel'], verts=8)
        cyl(0.1, 0.9, (x, 0.55, 0.0), m['steel'], verts=8)
        cyl(0.09, 0.22, (x, -0.5, 0.52), m['door'], verts=8)  # bollard
    for k in range(13):
        cube((0.04, 1.18, 0.01), (-6.0 + k, 0, 0.415), m['door'])  # plank joints
    # A small dockside crane
    cube((0.5, 0.5, 3.2), (5.8, 0.3, 2.0), m['star'])
    arm = cube((3.0, 0.25, 0.25), (4.6, 0.3, 3.6), m['star'])
    cyl(0.02, 1.4, (3.3, 0.3, 2.9), m['steel'], verts=4)
    for x in (-5.5, 0, 5.0):
        cyl(0.05, 1.6, (x, 0.5, 1.2), m['steel'], verts=6)
        cube((0.25, 0.12, 0.12), (x, 0.4, 2.0), m['trim'])
    write('navy_pier')

def navy_hq():
    begin(); m = mil_common()
    white = mat('navywhite', [0.88, 0.88, 0.86], rough=0.6)
    blue = mat('navyblue', [0.03, 0.08, 0.3], rough=0.6)
    cube((4, 3, 2.4), (0, 0, 1.2), white, bevel=0.04, seg=1)
    cube((4.3, 3.3, 0.22), (0, 0, 2.5), blue, bevel=0.03, seg=1)
    windows_row(m, 3, -1.51, 1.0, 1.8, 3, h=0.5)
    cube((0.9, 0.06, 1.6), (1.4, -1.51, 0.8), blue)
    # Anchor emblem
    cube((0.08, 0.04, 0.7), (-0.2, -1.53, 1.6), m['star'])
    cube((0.4, 0.04, 0.08), (-0.2, -1.53, 1.85), m['star'])
    cyl(0.2, 0.04, (-0.2, -1.53, 1.3), m['star'], rot=(math.pi / 2, 0, 0), verts=12)
    cyl(0.04, 2.2, (1.6, 1.0, 3.6), m['steel'], verts=6)
    write('navy_hq')

def watchtower():
    begin(); m = mil_common()
    wood = mat('wtwood', [0.32, 0.22, 0.12], rough=0.85)
    for x in (-0.8, 0.8):
        for y in (-0.8, 0.8):
            l = cyl(0.08, 4.0, (x * 0.85, y * 0.85, 2.0), wood, verts=6)
    for z in (1.2, 2.6):
        cube((1.8, 0.06, 0.06), (0, -0.7, z), wood); cube((1.8, 0.06, 0.06), (0, 0.7, z), wood)
    cube((2.2, 2.2, 0.15), (0, 0, 4.0), wood)
    for sy in (-1, 1):
        cube((2.2, 0.06, 0.7), (0, sy * 1.07, 4.45), wood)
        cube((0.06, 2.2, 0.7), (sy * 1.07, 0, 4.45), wood)
    for sy in (-1, 1):
        sl = cube((2.6, 1.5, 0.08), (0, sy * 0.66, 5.44), m['roof'])
        sl.rotation_euler.x = -sy * 0.5
    cyl(0.12, 0.25, (0.7, -1.1, 4.9), m['steel'], rot=(math.pi / 2, 0, 0), verts=10)  # searchlight
    write('watchtower')

def radar_dome():
    begin(); m = mil_common()
    white = mat('radarwhite', [0.86, 0.86, 0.84], rough=0.5)
    cyl(1.3, 1.6, (0, 0, 0.8), m['wall2'], verts=16)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.5, location=(0, 0, 2.0))
    add(bpy.context.object, white, smooth=True)
    cube((3.2, 3.2, 0.1), (0, 0, 0.05), m['wall2'])
    write('radar_dome')

def sandbags():
    begin(); m = mil_common()
    for row in range(3):
        n = 6 - row
        for k in range(n):
            a = -0.9 + (k + 0.5 + row * 0.5) * (1.8 / 6)
            x, y = math.sin(a) * 1.6, -math.cos(a) * 1.6 + 1.6
            b = cube((0.55, 0.32, 0.24), (x, y, 0.12 + row * 0.23), m['sand'], bevel=0.09, seg=2)
            b.rotation_euler.z = a
    write('sandbags')

mil_hq(); mil_barracks(); mil_depot(); mil_shed(); navy_pier(); navy_hq(); watchtower(); radar_dome(); sandbags()

helicopter()
armored()
person_parts()
ambulance()
airliner()
jet()
tank()
ship()
lamp()
bench()

tree('round', 7, 'round')
tree('tall', 11, 'tall')
tree('wide', 19, 'wide')
