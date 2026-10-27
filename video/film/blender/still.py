"""样张：夜里木桌上的小方块。python3 blender/still.py out/still.png [samples]"""
import sys
import time
import os
import math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import lib

out = sys.argv[1] if len(sys.argv) > 1 else 'out/still.png'
samples = int(sys.argv[2]) if len(sys.argv) > 2 else 128

lib.reset()
pct = int(sys.argv[3]) if len(sys.argv) > 3 else 100
lib.render_settings(samples=samples, threshold=0.04)
bpy.context.scene.render.resolution_percentage = pct
lib.world((0.003, 0.005, 0.008))
lib.desk()
a = lib.Cube('cubeA')
a.root.rotation_euler = (0, 0, math.radians(-28))
a.set_led('main', lib.GREEN, 1.0)
a.set_led('port', lib.BLUE, 0.6)

lib.area_light('key', (-0.18, -0.12, 0.28), (math.radians(35), 0, math.radians(-50)), 0.25, 0.9, (1.0, 0.92, 0.85))
lib.area_light('rim', (0.16, 0.24, 0.10), (math.radians(-70), 0, math.radians(150)), 0.3, 5.0, (0.6, 0.85, 1.0))
lib.camera(lens=85, loc=(0.16, -0.27, 0.13), target=(0.0, 0.0, 0.004), fstop=5.6)

t = time.time()
bpy.context.scene.render.filepath = os.path.abspath(out)
bpy.ops.render.render(write_still=True)
print(f'rendered {out} in {time.time() - t:.1f}s')
