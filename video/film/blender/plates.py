"""渲染两张背景底片（笔记本 / 手机），并导出屏幕四角在底片上的像素坐标。

python3 blender/plates.py laptop|phone [samples] [percent]
输出：out/plates/<name>.png 和 out/plates/<name>.json
"""
import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import lib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
which = sys.argv[1]
samples = int(sys.argv[2]) if len(sys.argv) > 2 else 48
pct = int(sys.argv[3]) if len(sys.argv) > 3 else 100
os.makedirs(f'{ROOT}/out/plates', exist_ok=True)

lib.reset()
lib.render_settings(w=1620, h=2880, samples=samples, threshold=0.03)
bpy.context.scene.render.resolution_percentage = pct


def table_mat():
    return lib.principled('table', (0.010, 0.011, 0.012), 0.5, 0.0, **{'Coat Weight': 0.6, 'Coat Roughness': 0.06})


if which == 'laptop':
    lib.world((0.002, 0.003, 0.005))
    lib.desk(7.0)
    lt = lib.Laptop(f'{ROOT}/blender/tex/desk_placeholder.png', open_deg=110, screen_strength=1.0)
    lt.root.rotation_euler = (0, 0, math.radians(-8))
    cube = lib.Cube('cubeA', cable_len=0.4)
    cube.root.location = (0.20, -0.16, 0)
    cube.root.rotation_euler = (0, 0, math.radians(-150))
    cube.set_led('main', lib.GREEN, 1.0)
    cube.set_led('port', lib.BLUE, 0.6)
    cube.route_cable([(0.178, -0.115, 0.0019), (0.168, -0.07, 0.0019), (0.165, -0.01, 0.0019), (0.163, 0.045, 0.006)])
    lib.bokeh_lights(110, seed=5, center=(0.0, 3.2, 0.9), spread=(5.0, 0.8, 1.4))
    # 屏幕补光：模拟屏幕照在键盘和桌面上
    lib.area_light('screen_spill', (0.0, 0.06, 0.14), (math.radians(70), 0, 0), 0.28, 1.6, (0.55, 0.75, 1.0), size_y=0.17, visible=False)
    lib.area_light('rim', (-0.6, 0.7, 0.5), (math.radians(-60), 0, math.radians(-140)), 0.6, 6.0, (0.55, 0.75, 1.0))
    lib.area_light('fill', (0.5, -0.6, 0.6), (math.radians(45), 0, math.radians(40)), 0.8, 1.2, (1.0, 0.9, 0.8))
    cam = lib.camera(lens=42, loc=(0.16, -0.78, 0.40), target=(0.035, 0.03, 0.085), fstop=2.8)
    corners = lt.screen_corners_world()
    extra = {'cube': [cube.root.matrix_world.translation.copy()]}
elif which == 'phone':
    lib.world((0.002, 0.002, 0.004))
    t = lib.desk(7.0)
    lib.set_mat(t, table_mat())
    ph = lib.Phone(f'{ROOT}/blender/tex/phone_placeholder.png')
    ph.root.rotation_euler = (0, 0, math.radians(8))
    lib.cup((0.10, 0.15))
    lib.bokeh_lights(120, seed=11, center=(0.0, 2.6, 0.7), spread=(4.0, 0.8, 1.3))
    lib.area_light('top', (-0.15, 0.1, 0.5), (math.radians(15), math.radians(-15), 0), 0.5, 2.5, (1.0, 0.85, 0.7))
    lib.area_light('rim', (0.3, 0.6, 0.25), (math.radians(-70), 0, math.radians(160)), 0.5, 3.0, (0.6, 0.75, 1.0))
    cam = lib.camera(lens=50, loc=(0.02, -0.30, 0.19), target=(0.0, 0.015, 0.0), fstop=4.5)
    corners = ph.screen_corners_world()
    extra = {}
else:
    raise SystemExit('laptop|phone')

px = lib.project(cam, corners)
s = bpy.context.scene
s.render.filepath = f'{ROOT}/out/plates/{which}.png'
t0 = time.time()
bpy.ops.render.render(write_still=True)
info = {'size': [s.render.resolution_x * pct // 100, s.render.resolution_y * pct // 100], 'screen': px,
        **{k: lib.project(cam, v) for k, v in extra.items()}}
json.dump(info, open(f'{ROOT}/out/plates/{which}.json', 'w'), indent=1)
print(f'rendered {which} in {time.time() - t0:.1f}s', info)
