"""渲染 Blender 动画镜头，输出到 frames/bl/f_<全片帧号>.png。

python3 blender/shots.py reveal|inserts|dark|end [--samples N] [--pct P] [--only 113,114]
时间轴和 src/main.js、music.py 一致：128 BPM，30 fps。
"""
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector, Color
import lib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FPS = 30
B = 60 / 128
BAR = 4 * B
DUR = 12 * BAR + 1.0


def bs(k):
    return (k - 1) * BAR


def frames_in(t0, t1):
    return [f for f in range(int(t0 * FPS) - 1, int(t1 * FPS) + 2) if t0 <= f / FPS < t1]


INSERTS = sorted([bs(k) for k in (4, 5, 6, 7, 8, 9)] + [bs(5) + B] + [bs(10) + b * B for b in (0.5, 1.5, 2.5, 3.5)])
SEGMENTS = {
    'reveal': frames_in(bs(3), bs(4)),
    'inserts': [f for t0 in INSERTS for f in frames_in(t0, t0 + B / 2)],
    'dark': frames_in(bs(11) + 2 * B, bs(12)),
    'end': frames_in(bs(12), DUR),
}


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def inv(a, b, x):
    return clamp((x - a) / (b - a))


def lerp(a, b, t):
    return a + (b - a) * t


def eio(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def pulse(dt, k):
    return math.exp(-dt * k) if dt >= 0 else 0.0


CUBE_POS = Vector((0.20, -0.16, 0.0))


def build_desk_scene(screen_on):
    lib.world((0.002, 0.003, 0.005))
    lib.desk(7.0)
    lt = lib.Laptop(f'{ROOT}/blender/tex/desk_placeholder.png', open_deg=110, screen_strength=1.0 if screen_on else 0.0)
    lt.root.rotation_euler = (0, 0, math.radians(-8))
    cube = lib.Cube('cubeA', cable_len=0.4)
    cube.root.location = CUBE_POS
    cube.root.rotation_euler = (0, 0, math.radians(-150))
    cube.route_cable([(0.178, -0.115, 0.0019), (0.168, -0.07, 0.0019), (0.165, -0.01, 0.0019), (0.163, 0.045, 0.006)])
    lib.bokeh_lights(110, seed=5, center=(0.0, 3.2, 0.9), spread=(5.0, 0.8, 1.4))
    spill = lib.area_light('screen_spill', (0.0, 0.06, 0.14), (math.radians(70), 0, 0), 0.28, 1.6 if screen_on else 0.0, (0.55, 0.75, 1.0), size_y=0.17, visible=False)
    rim = lib.area_light('rim', (-0.6, 0.7, 0.5), (math.radians(-60), 0, math.radians(-140)), 0.6, 6.0, (0.55, 0.75, 1.0))
    key = lib.area_light('key', CUBE_POS + Vector((-0.12, -0.10, 0.25)), (math.radians(30), 0, math.radians(-40)), 0.2, 0.5, (1.0, 0.92, 0.85))
    return lt, cube, {'spill': spill, 'rim': rim, 'key': key}


def place_cam(cam, pos, target, lens=None, fstop=None):
    cam.location = pos
    lib.look_at(cam, target)
    if lens:
        cam.data.lens = lens
    cam.data.dof.focus_distance = (Vector(pos) - Vector(target)).length
    if fstop:
        cam.data.dof.aperture_fstop = fstop


ANGLES = [
    ((0.16, -0.27, 0.11), (0, 0, 0.006), 85),
    ((-0.08, -0.19, 0.27), (0, 0, 0.006), 85),
    ((-0.27, -0.08, 0.08), (0, 0, 0.006), 85),
    ((0.0, -0.34, 0.06), (0, 0, 0.006), 85),
    ((0.24, -0.14, 0.16), (0, 0, 0.006), 85),
    ((0.15, -0.21, 0.11), (0, 0, 0.006), 85),
]


def main():
    shot = sys.argv[1]
    opts = dict(zip(sys.argv[2::2], sys.argv[3::2]))
    samples = int(opts.get('--samples', 12))
    pct = int(opts.get('--pct', 100))
    frames = SEGMENTS[shot]
    if '--only' in opts:
        only = set(int(x) for x in opts['--only'].split(','))
        frames = [f for f in frames if f in only]
    out = f'{ROOT}/frames/bl'
    os.makedirs(out, exist_ok=True)
    if opts.get('--resume'):
        frames = [f for f in frames if not os.path.exists(f'{out}/f_{f:05d}.png')]

    lib.reset()
    lib.render_settings(samples=samples, threshold=0.04)
    s = bpy.context.scene
    s.render.resolution_percentage = pct

    if shot == 'end':
        lib.world((0.002, 0.003, 0.005))
        lib.desk(7.0)
        lib.bokeh_lights(90, seed=8, center=(0.0, 3.0, 0.8), spread=(4.0, 0.6, 1.2))
        a = lib.Cube('cubeA', cable_len=0.5)
        a.root.location = (-0.027, 0.004, 0)
        a.root.rotation_euler = (0, 0, math.radians(200))
        g = lib.Cube('cubeB', tint=(0.035, 0.42, 0.34), glitter=True, cable_len=0.5)
        g.root.location = (0.027, -0.004, 0)
        g.root.rotation_euler = (0, 0, math.radians(160))
        for c in (a, g):
            c.set_led('main', lib.GREEN, 1.0)
            c.set_led('port', lib.BLUE, 0.5)
        lib.area_light('key', (-0.15, -0.12, 0.3), (math.radians(30), 0, math.radians(-40)), 0.3, 0.9, (1.0, 0.92, 0.85))
        lib.area_light('rim', (0.2, 0.35, 0.18), (math.radians(-65), 0, math.radians(150)), 0.4, 3.5, (0.55, 0.8, 1.0))
        cam = lib.camera(lens=60, loc=(0, -0.4, 0.2), target=(0, 0, 0.01), fstop=4.0)
    else:
        lt, cube, lights = build_desk_scene(screen_on=(shot == 'inserts'))
        cam = lib.camera(lens=85, loc=(0.25, -0.4, 0.15), target=tuple(CUBE_POS), fstop=2.8)

    t_start = time.time()
    for n, f in enumerate(frames):
        t = f / FPS
        if shot == 'reveal':
            lt_ = t - bs(3)
            p = eio(inv(0, BAR, lt_))
            ign = B
            on = lt_ >= ign
            glow = (1.0 + 2.2 * pulse(lt_ - ign, 5)) if on else 0.0
            cube.set_led('main', lib.GREEN, glow)
            cube.set_led('port', lib.BLUE, 0.6 * min(1, glow))
            lights['rim'].data.energy = 6.0 if on else 3.0
            lights['key'].data.energy = 0.5 if on else 0.08
            off = Vector((lerp(0.03, 0.02, p), lerp(-0.42, -0.27, p), lerp(0.20, 0.13, p)))
            place_cam(cam, CUBE_POS + off, CUBE_POS + Vector((0, 0, 0.005)), 70, 2.8)
        elif shot == 'inserts':
            i = max(k for k, t0 in enumerate(INSERTS) if t0 <= t + 1e-6)
            lt_ = t - INSERTS[i]
            col = lib.GREEN if i == 0 else lib.BLUE
            cube.set_led('main', col, 1.0 + 2.2 * pulse(lt_, 11))
            cube.set_led('port', lib.BLUE, 0.6)
            pos, tgt, lens = ANGLES[i % len(ANGLES)]
            k = 1 - 0.08 * (lt_ / (B / 2))
            place_cam(cam, CUBE_POS + Vector(pos) * k, CUBE_POS + Vector(tgt), lens, 4.0)
        elif shot == 'dark':
            lb = (t - bs(11)) / B
            p = inv(2.0, 4.0, lb)
            mix = eio(inv(2.2, 3.0, lb))
            col = tuple(lerp(b, g, mix) for b, g in zip(lib.BLUE, lib.GREEN))
            cube.set_led('main', col, lerp(1.6, 1.0, mix))
            cube.set_led('port', lib.BLUE, 0.5)
            lights['key'].data.energy = 0.25
            off = Vector((lerp(0.11, 0.08, p), lerp(-0.22, -0.18, p), lerp(0.10, 0.075, p)))
            place_cam(cam, CUBE_POS + off, CUBE_POS + Vector((-0.005, 0.01, 0.004)), 85, 2.8)
        elif shot == 'end':
            p = clamp((t - bs(12)) / (DUR - bs(12)))
            ang = math.radians(lerp(-12, 6, p))
            r = lerp(0.29, 0.27, p)
            pos = Vector((math.sin(ang) * r, -math.cos(ang) * r, lerp(0.125, 0.115, p)))
            # 目标点放在方块上方，让方块落在画面中下部，给标题留出上半屏
            place_cam(cam, pos, (0, 0, 0.024), 45, 4.0)
        s.render.filepath = f'{out}/f_{f:05d}.png'
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'[{shot}] frame {f} ({n + 1}/{len(frames)}) {time.time() - t0:.1f}s', flush=True)
    print(f'[{shot}] done {len(frames)} frames in {time.time() - t_start:.0f}s', flush=True)


if __name__ == '__main__':
    main()
