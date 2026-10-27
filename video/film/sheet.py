# 把若干静帧拼成一张小图，方便检查
import sys, glob
from PIL import Image, ImageDraw
files = sorted(glob.glob(sys.argv[1]), key=lambda f: float(f.split('_')[-1][:-4]) if 't_' in f else f)
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
w, h = 324, 576
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 30)), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h))
    x, y = (i % cols) * w, (i // cols) * (h + 30)
    sheet.paste(im, (x, y + 30))
    d.text((x + 6, y + 8), f.split('/')[-1], fill=(255, 255, 0))
sheet.save(sys.argv[2])
