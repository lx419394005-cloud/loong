"""小方块 Blender 场景库：建模、材质、灯光、渲染设置。单位：米。"""
import math
import bmesh
import bpy
from mathutils import Vector

# 小方块尺寸（照实物估）
SIZE = 0.040       # 边长
CHAMFER = 0.0045   # 四角切角
HEIGHT = 0.013     # 厚度
WALL = 0.0016      # 外壳壁厚
PCB_Z = 0.0035     # 电路板离底面高度

VOLUME = False
GREEN = (0.05, 1.0, 0.32)
BLUE = (0.06, 0.32, 1.0)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def link(obj, c=None):
    (c or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_obj(name, bm, c=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me), c)


def smooth(obj, angle=35):
    for p in obj.data.polygons:
        p.use_smooth = True
    mod = obj.modifiers.new('smooth', 'SMOOTH_BY_ANGLE') if hasattr(bpy.types, 'SmoothByAngleModifier') else None
    if mod is None:
        try:
            obj.data.set_sharp_from_angle(angle=math.radians(angle))
        except Exception:
            pass


def octagon_prism(size, ch, h, z0=0.0):
    bm = bmesh.new()
    s = size / 2
    pts = [(-s + ch, -s), (s - ch, -s), (s, -s + ch), (s, s - ch), (s - ch, s), (-s + ch, s), (-s, s - ch), (-s, -s + ch)]
    bot = [bm.verts.new((x, y, z0)) for x, y in pts]
    top = [bm.verts.new((x, y, z0 + h)) for x, y in pts]
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new([bot[i], bot[j], top[j], top[i]])
    return bm


def rounded_box(name, dx, dy, dz, r, segs=4, c=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(dx, dy, dz), verts=bm.verts)
    o = mesh_obj(name, bm, c)
    if r > 0:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = r
        b.segments = segs
        b.limit_method = 'NONE'
    smooth(o)
    return o


def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out


def principled(name, color, rough=0.5, metal=0.0, **kw):
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    for k, v in kw.items():
        p.inputs[k].default_value = v
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m


def emission_mat(name, color, strength):
    m, nt, out = node_mat(name)
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*color, 1)
    e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    return m


def resin_mat(name, tint, glitter=False):
    """磨砂半透明树脂：漫透射（Translucent）+ 带清漆的塑料表面。内部 LED 的光穿过内外两层壁后会被充分化开。"""
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = (*tint, 1)
    p.inputs['Roughness'].default_value = 0.38
    p.inputs['Coat Weight'].default_value = 0.35
    p.inputs['Coat Roughness'].default_value = 0.25
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
    tr.inputs['Color'].default_value = (*[min(1, c * 1.25) for c in tint], 1)
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.inputs['Fac'].default_value = 0.5
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    if glitter:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        vor = nt.nodes.new('ShaderNodeTexVoronoi')
        vor.inputs['Scale'].default_value = 2600
        nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
        ramp.color_ramp.elements[1].position = 0.07
        ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
        nt.links.new(vor.outputs['Distance'], ramp.inputs['Fac'])
        flake = nt.nodes.new('ShaderNodeBsdfPrincipled')
        flake.inputs['Base Color'].default_value = (0.85, 1.0, 0.97, 1)
        flake.inputs['Metallic'].default_value = 1.0
        flake.inputs['Roughness'].default_value = 0.12
        mix2 = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(ramp.outputs['Color'], mix2.inputs['Fac'])
        nt.links.new(mix.outputs[0], mix2.inputs[1])
        nt.links.new(flake.outputs[0], mix2.inputs[2])
        mix = mix2
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


def wood_mat(name='desk_wood'):
    """深色胡桃木：沿 X 方向的年轮带 + 细密木纹。"""
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Roughness'].default_value = 0.36
    p.inputs['Coat Weight'].default_value = 0.3
    p.inputs['Coat Roughness'].default_value = 0.15
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mpa = nt.nodes.new('ShaderNodeMapping')
    mpa.inputs['Scale'].default_value = (2.0, 26.0, 2.0)
    nt.links.new(tc.outputs['Object'], mpa.inputs['Vector'])
    dist = nt.nodes.new('ShaderNodeTexNoise')
    dist.inputs['Scale'].default_value = 1.5
    dist.inputs['Detail'].default_value = 4
    nt.links.new(mpa.outputs['Vector'], dist.inputs['Vector'])
    warp = nt.nodes.new('ShaderNodeVectorMath')
    warp.operation = 'MULTIPLY_ADD'
    warp.inputs[1].default_value = (0.0, 2.2, 0.0)
    nt.links.new(dist.outputs['Color'], warp.inputs[0])
    nt.links.new(mpa.outputs['Vector'], warp.inputs[2])
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Y'
    wave.inputs['Scale'].default_value = 0.8
    wave.inputs['Distortion'].default_value = 1.5
    wave.inputs['Detail'].default_value = 3
    nt.links.new(warp.outputs['Vector'], wave.inputs['Vector'])
    mpb = nt.nodes.new('ShaderNodeMapping')
    mpb.inputs['Scale'].default_value = (8.0, 900.0, 8.0)
    nt.links.new(tc.outputs['Object'], mpb.inputs['Vector'])
    streak = nt.nodes.new('ShaderNodeTexNoise')
    streak.inputs['Scale'].default_value = 1.0
    streak.inputs['Detail'].default_value = 3
    nt.links.new(mpb.outputs['Vector'], streak.inputs['Vector'])
    mixf = nt.nodes.new('ShaderNodeMix')
    mixf.data_type = 'FLOAT'
    mixf.inputs['Factor'].default_value = 0.45
    nt.links.new(wave.outputs['Fac'], mixf.inputs['A'])
    nt.links.new(streak.outputs['Fac'], mixf.inputs['B'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.2, (0.20, 0.105, 0.045, 1)
    els[1].position, els[1].color = 0.8, (0.42, 0.25, 0.12, 1)
    nt.links.new(mixf.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.05
    bump.inputs['Distance'].default_value = 0.0003
    nt.links.new(streak.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(p.outputs[0], out.inputs['Surface'])
    return m


def set_mat(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)


class Cube:
    """一个小方块：外壳 + 电路板 + LED + USB-C 插头和线。root 是父级空物体。"""

    def __init__(self, name, tint=(0.06, 0.58, 0.47), glitter=False, cable_len=1.0):
        self.name = name
        c = coll(name)
        self.coll = c
        root = bpy.data.objects.new(name, None)
        link(root, c)
        self.root = root

        shell = mesh_obj(f'{name}_shell', octagon_prism(SIZE, CHAMFER, HEIGHT), c)
        bev = shell.modifiers.new('bevel', 'BEVEL')
        bev.width = 0.0014
        bev.segments = 5
        bev.limit_method = 'ANGLE'
        sol = shell.modifiers.new('solid', 'SOLIDIFY')
        sol.thickness = WALL
        sol.offset = -1
        cut = rounded_box(f'{name}_portcut', 0.0105, 0.01, 0.0042, 0.0016, 3, c)
        cut.location = (0, -SIZE / 2, PCB_Z + 0.0022)
        cut.hide_render = True
        cut.display_type = 'WIRE'
        boo = shell.modifiers.new('port', 'BOOLEAN')
        boo.object = cut
        boo.solver = 'EXACT'
        smooth(shell)
        set_mat(shell, resin_mat(f'{name}_resin', tint, glitter))
        self.shell = shell

        inner = coll(f'{name}_inner')
        pcb = rounded_box(f'{name}_pcb', SIZE - 2 * WALL - 0.003, SIZE - 2 * WALL - 0.003, 0.0012, 0.0004, 2, inner)
        pcb.location = (0, 0, PCB_Z)
        set_mat(pcb, principled('pcb', (0.015, 0.03, 0.025), 0.35))
        module = rounded_box(f'{name}_module', 0.018, 0.0255, 0.0026, 0.0002, 1, inner)
        module.location = (-0.004, 0.002, PCB_Z + 0.0019)
        set_mat(module, principled('shield', (0.75, 0.76, 0.78), 0.28, 1.0))
        rec = rounded_box(f'{name}_usbc', 0.0089, 0.0072, 0.0032, 0.0012, 3, inner)
        rec.location = (0, -SIZE / 2 + WALL + 0.0032, PCB_Z + 0.0022)
        set_mat(rec, principled('usbmetal', (0.8, 0.8, 0.82), 0.22, 1.0))
        chipmat = principled('chip', (0.02, 0.02, 0.022), 0.4)
        for i, (x, y, sx, sy) in enumerate([(0.010, -0.008, 0.005, 0.005), (0.011, 0.009, 0.003, 0.0018), (0.0115, 0.004, 0.003, 0.0018), (-0.012, -0.012, 0.004, 0.0025)]):
            ch = rounded_box(f'{name}_chip{i}', sx, sy, 0.001, 0.0002, 1, inner)
            ch.location = (x, y, PCB_Z + 0.0011)
            set_mat(ch, chipmat)
        self.led_mats = {}
        self.leds = {}
        for key, (x, y), col in [('main', (0.0085, 0.0085), GREEN), ('port', (-0.0045, -0.0125), BLUE)]:
            led = rounded_box(f'{name}_led_{key}', 0.0022, 0.0018, 0.0009, 0.0002, 1, inner)
            led.location = (x, y, PCB_Z + 0.001)
            m = emission_mat(f'{name}_ledm_{key}', col, 9.0)
            set_mat(led, m)
            self.led_mats[key] = m
            # 真正照亮外壳和桌面的灯：阴影只被电路板挡，不被外壳挡
            ld = bpy.data.lights.new(f'{name}_ledlight_{key}', 'POINT')
            ld.energy = 0.05
            ld.shadow_soft_size = 0.0012
            ld.color = col
            lo = link(bpy.data.objects.new(f'{name}_ledlight_{key}', ld), c)
            lo.location = (x, y, PCB_Z + 0.0022)
            lo.light_linking.blocker_collection = inner
            self.leds[key] = (led, lo)
        bpy.context.scene.collection.children.unlink(inner)
        c.children.link(inner)

        # USB-C 插头 + 线
        plug = rounded_box(f'{name}_plug', 0.0118, 0.022, 0.0066, 0.0024, 4, c)
        plug.location = (0, -SIZE / 2 - 0.011 + 0.0005, PCB_Z + 0.0022)
        set_mat(plug, principled('rubber', (0.012, 0.012, 0.013), 0.55))
        tip = rounded_box(f'{name}_plugtip', 0.0083, 0.006, 0.0025, 0.001, 3, c)
        tip.location = (0, -SIZE / 2 + 0.0025, PCB_Z + 0.0022)
        set_mat(tip, bpy.data.materials['usbmetal'])
        cd = bpy.data.curves.new(f'{name}_cable', 'CURVE')
        cd.dimensions = '3D'
        cd.bevel_depth = 0.0019
        cd.bevel_resolution = 4
        cd.resolution_u = 24
        sp = cd.splines.new('BEZIER')
        L = cable_len
        pts = [(0, -SIZE / 2 - 0.021, PCB_Z + 0.0022), (0.002, -0.06, 0.0019), (0.03, -0.14, 0.0019), (0.12, -0.30 * L, 0.0019), (0.30 * L, -0.65 * L, 0.0019)]
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'
        cable = link(bpy.data.objects.new(f'{name}_cable', cd), c)
        cable.data.materials.append(bpy.data.materials['rubber'])
        self.cable = cable

        for o in list(c.all_objects):
            if o is not root and o.parent is None:
                o.parent = root

    def route_cable(self, world_pts):
        """把线改成经过给定的世界坐标点（插头之后）。"""
        bpy.context.view_layer.update()
        inv = self.root.matrix_world.inverted()
        start = (0, -SIZE / 2 - 0.021, PCB_Z + 0.0022)
        pts = [Vector(start), Vector((0, -SIZE / 2 - 0.034, 0.0019))] + [inv @ Vector(p) for p in world_pts]
        sp = self.cable.data.splines[0]
        self.cable.data.splines.remove(sp)
        sp = self.cable.data.splines.new('BEZIER')
        sp.bezier_points.add(len(pts) - 1)
        for bp, p in zip(sp.bezier_points, pts):
            bp.co = p
            bp.handle_left_type = bp.handle_right_type = 'AUTO'

    def set_led(self, key, color, strength):
        """strength：0 熄灭，1 正常亮度。"""
        led, lo = self.leds[key]
        m = self.led_mats[key]
        e = m.node_tree.nodes['Emission']
        e.inputs['Color'].default_value = (*color, 1)
        e.inputs['Strength'].default_value = 9.0 * strength
        lo.data.color = color
        lo.data.energy = 0.05 * strength

    def key_led(self, key, frame, color, strength):
        led, lo = self.leds[key]
        e = self.led_mats[key].node_tree.nodes['Emission']
        e.inputs['Color'].default_value = (*color, 1)
        e.inputs['Strength'].default_value = 9.0 * strength
        e.inputs['Color'].keyframe_insert('default_value', frame=frame)
        e.inputs['Strength'].keyframe_insert('default_value', frame=frame)
        lo.data.color = color
        lo.data.energy = 0.05 * strength
        lo.data.keyframe_insert('color', frame=frame)
        lo.data.keyframe_insert('energy', frame=frame)


def desk(size=3.0):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    o = mesh_obj('desk', bm)
    set_mat(o, wood_mat())
    return o


def area_light(name, loc, rot, size, energy, color=(1, 1, 1), size_y=None, visible=True):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = 'RECTANGLE' if size_y else 'SQUARE'
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ld.energy = energy
    ld.color = color
    o = link(bpy.data.objects.new(name, ld))
    o.location = loc
    o.rotation_euler = rot
    if not visible:
        o.visible_camera = False
        o.visible_glossy = False
    return o


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def camera(name='cam', lens=70, loc=(0, -0.3, 0.12), target=(0, 0, 0.006), fstop=4.0, focus=None):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36
    cd.dof.use_dof = fstop is not None
    if fstop:
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = focus or (Vector(loc) - Vector(target)).length
    o = link(bpy.data.objects.new(name, cd))
    o.location = loc
    look_at(o, target)
    bpy.context.scene.camera = o
    return o


def world(color=(0.004, 0.006, 0.009), strength=1.0):
    w = bpy.data.worlds.new('world')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*color, 1)
    bg.inputs['Strength'].default_value = strength
    bpy.context.scene.world = w
    return w


def render_settings(w=1080, h=1920, samples=128, threshold=0.02):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = samples
    s.cycles.use_adaptive_sampling = True
    s.cycles.adaptive_threshold = threshold
    s.cycles.use_denoising = True
    s.cycles.denoiser = 'OPENIMAGEDENOISE'
    s.cycles.max_bounces = 10
    s.cycles.transmission_bounces = 10
    s.cycles.volume_bounces = 2
    s.cycles.glossy_bounces = 4
    s.cycles.diffuse_bounces = 3
    s.cycles.sample_clamp_indirect = 8
    s.cycles.blur_glossy = 0.5
    s.render.resolution_x = w
    s.render.resolution_y = h
    s.render.resolution_percentage = 100
    s.render.fps = 30
    s.render.film_transparent = False
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGB'
    s.view_settings.view_transform = 'AgX'
    try:
        s.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    s.render.threads_mode = 'AUTO'
    s.render.use_persistent_data = True
    s.cycles.use_light_tree = True


# ---------- 设备 ----------
def image_emission_mat(name, image_path, strength=1.0):
    m, nt, out = node_mat(name)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(image_path)
    tex.interpolation = 'Cubic'
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = strength
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    # 屏幕玻璃的一点反光
    gl = nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.08
    gl.inputs['Color'].default_value = (1, 1, 1, 1)
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.5
    add = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fr.outputs[0], add.inputs['Fac'])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(gl.outputs[0], add.inputs[2])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    return m


def plane(name, w, h, c=None):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(w, h, 1), verts=bm.verts)
    o = mesh_obj(name, bm, c)
    uv = o.data.uv_layers.new()
    for poly in o.data.polygons:
        for li in poly.loop_indices:
            v = o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv = (v.x / w + 0.5, v.y / h + 0.5)
    return o


class Laptop:
    """通用 14 寸笔记本：铝合金机身、键盘、触控板、屏幕。screen 的四个角用来合成界面。"""
    W, D, T = 0.3045, 0.2155, 0.0155
    SW, SH = 0.2860, 0.1788  # 屏幕可视区

    def __init__(self, screen_image, open_deg=108, screen_strength=1.0):
        c = coll('laptop')
        root = bpy.data.objects.new('laptop', None)
        link(root, c)
        self.root = root
        alu = principled('alu', (0.62, 0.63, 0.65), 0.3, 1.0)
        base = rounded_box('lt_base', self.W, self.D, self.T, 0.006, 5, c)
        base.location = (0, 0, self.T / 2)
        set_mat(base, alu)
        well = rounded_box('lt_well', 0.272, 0.098, 0.0008, 0.003, 3, c)
        well.location = (0, 0.047, self.T + 0.0001)
        set_mat(well, principled('well', (0.02, 0.02, 0.022), 0.6))
        keym = principled('keycap', (0.012, 0.012, 0.013), 0.5)
        bm = bmesh.new()
        pitch = 0.0189
        for i in range(6):
            y = 0.088 - (0.0125 if i else 0) - max(0, i - 1) * pitch - (0.0095 if i else 0)
            h = 0.0085 if i == 0 else 0.0165
            if i == 5:
                ws = [0.0165] * 4 + [0.0935] + [0.0165] * 4
            else:
                ws = [0.0165] * 14
                if i == 2:
                    ws[0] = ws[-1] = 0.0165
            total = sum(ws) + (len(ws) - 1) * (pitch - 0.0165)
            x = -total / 2
            for w in ws:
                ret = bmesh.ops.create_cube(bm, size=1.0)
                vs = ret['verts']
                bmesh.ops.scale(bm, vec=(w, h, 0.0012), verts=vs)
                bmesh.ops.translate(bm, vec=(x + w / 2, y, self.T + 0.0008), verts=vs)
                x += w + (pitch - 0.0165)
        keys = mesh_obj('lt_keys', bm, c)
        bv = keys.modifiers.new('bevel', 'BEVEL')
        bv.width = 0.0011
        bv.segments = 2
        set_mat(keys, keym)
        pad = rounded_box('lt_pad', 0.122, 0.078, 0.0004, 0.006, 4, c)
        pad.location = (0, -0.058, self.T + 0.0001)
        set_mat(pad, principled('pad', (0.5, 0.51, 0.53), 0.22, 1.0))

        # 铰链在机身后缘顶部。lid 先按“合盖”摆好（沿 -Y 盖在机身上，屏幕朝下），再绕 X 轴打开。
        hinge = bpy.data.objects.new('lt_hinge', None)
        link(hinge, c)
        hinge.location = (0, self.D / 2 - 0.002, self.T)
        lid = rounded_box('lt_lid', self.W, self.D, 0.0055, 0.004, 4, c)
        lid.location = (0, -self.D / 2, 0.00335)
        set_mat(lid, alu)
        bez = rounded_box('lt_bezel', self.W - 0.003, self.D - 0.003, 0.0006, 0.006, 4, c)
        bez.location = (0, -self.D / 2, 0.0003)
        set_mat(bez, principled('bezel', (0.004, 0.004, 0.005), 0.08))
        scr = plane('lt_screen', self.SW, self.SH, c)
        scr.location = (0, -self.D / 2 - 0.004, -0.00005)
        scr.rotation_euler = (math.radians(180), 0, 0)
        self.screen_mat = image_emission_mat('lt_screen_m', screen_image, screen_strength)
        set_mat(scr, self.screen_mat)
        for o in (lid, bez, scr):
            o.parent = hinge
        hinge.rotation_euler = (math.radians(-open_deg), 0, 0)
        self.screen = scr
        for o in c.all_objects:
            if o.parent is None and o is not root:
                o.parent = root

    def screen_corners_world(self):
        bpy.context.view_layer.update()
        mw = self.screen.matrix_world
        w, h = self.SW / 2, self.SH / 2
        # 左上、右上、右下、左下（按屏幕内容方向）
        return [mw @ Vector(p) for p in [(-w, h, 0), (w, h, 0), (w, -h, 0), (-w, -h, 0)]]


class Phone:
    """通用手机：圆角机身 + 屏幕。"""
    W, H, T = 0.0716, 0.1470, 0.0080
    SW, SH = 0.0670, 0.1425

    def __init__(self, screen_image, screen_strength=1.0):
        c = coll('phone')
        root = bpy.data.objects.new('phone', None)
        link(root, c)
        self.root = root
        body = rounded_box('ph_body', self.W, self.H, self.T, 0.0035, 6, c)
        body.location = (0, 0, self.T / 2)
        set_mat(body, principled('ph_frame', (0.18, 0.18, 0.19), 0.25, 1.0))
        glass = rounded_box('ph_glass', self.W - 0.0012, self.H - 0.0012, 0.0004, 0.009, 6, c)
        glass.location = (0, 0, self.T + 0.0001)
        set_mat(glass, principled('ph_black', (0.003, 0.003, 0.004), 0.05))
        scr = plane('ph_screen', self.SW, self.SH, c)
        scr.location = (0, 0, self.T + 0.0004)
        self.screen_mat = image_emission_mat('ph_screen_m', screen_image, screen_strength)
        set_mat(scr, self.screen_mat)
        self.screen = scr
        for o in c.all_objects:
            if o.parent is None and o is not root:
                o.parent = root

    def screen_corners_world(self):
        bpy.context.view_layer.update()
        mw = self.screen.matrix_world
        w, h = self.SW / 2, self.SH / 2
        return [mw @ Vector(p) for p in [(-w, h, 0), (w, h, 0), (w, -h, 0), (-w, -h, 0)]]


def project(cam, pts):
    """世界坐标 → 渲染图像素坐标（左上角为原点）。"""
    from bpy_extras.object_utils import world_to_camera_view
    s = bpy.context.scene
    W = s.render.resolution_x * s.render.resolution_percentage / 100
    H = s.render.resolution_y * s.render.resolution_percentage / 100
    out = []
    for p in pts:
        v = world_to_camera_view(s, cam, p)
        out.append((v.x * W, (1 - v.y) * H))
    return out


def cup(loc):
    """一只白瓷咖啡杯。"""
    c = coll('props')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.032, radius2=0.04, depth=0.085)
    o = mesh_obj('cup', bm, c)
    sol = o.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.003
    bv = o.modifiers.new('b', 'BEVEL')
    bv.width = 0.0015
    bv.segments = 3
    smooth(o)
    o.location = (loc[0], loc[1], 0.0425)
    set_mat(o, principled('ceramic', (0.85, 0.84, 0.82), 0.15))
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=0.036)
    cof = mesh_obj('coffee', bm, c)
    cof.location = (loc[0], loc[1], 0.074)
    set_mat(cof, principled('coffee', (0.03, 0.012, 0.004), 0.08))
    return o


def bokeh_lights(n=60, seed=3, center=(0, 1.6, 0.5), spread=(2.2, 0.4, 0.9)):
    """远处的城市灯光：一堆发光小球，靠景深变成光斑。"""
    import random
    r = random.Random(seed)
    c = coll('bokeh')
    mats = [emission_mat(f'bk{i}', col, st) for i, (col, st) in enumerate([((1.0, 0.62, 0.3), 30), ((1.0, 0.8, 0.5), 25), ((0.4, 0.65, 1.0), 25), ((0.3, 1.0, 0.6), 12), ((1.0, 0.35, 0.3), 20)])]
    for i in range(n):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.008 + r.random() * 0.014)
        o = mesh_obj(f'bk_{i}', bm, c)
        o.location = (center[0] + (r.random() - 0.5) * spread[0], center[1] + (r.random() - 0.5) * spread[1], center[2] + (r.random() - 0.5) * spread[2])
        set_mat(o, mats[r.randrange(len(mats))])
    return c
