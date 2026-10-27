"""合成成片：Blender 底片 / Blender 镜头 + 网页界面层 + 字幕浮窗层 → frames/comp。

python3 comp.py --list desk|phone|ui|ov     打印某一层需要渲染的帧（给 render.mjs --frames 用）
python3 comp.py [--frames 0-704] [--jobs 4]  合成
"""
import json
import math
import os
import sys
from multiprocessing import Pool

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
FPS = 30
B = 60 / 128
BAR = 4 * B
DUR = 12 * BAR + 1.0
TOTAL = round(DUR * FPS)
OW, OH = 1080, 1920


def bs(k):
    return (k - 1) * BAR


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


INSERTS = sorted([bs(k) for k in (4, 5, 6, 7, 8, 9)] + [bs(5) + B] + [bs(10) + b * B for b in (0.5, 1.5, 2.5, 3.5)])


def insert_at(t):
    for t0 in INSERTS:
        if t0 <= t < t0 + B / 2:
            return t0
    return None


def segment(t):
    """这一帧用什么画面。"""
    if insert_at(t) is not None:
        return 'bl'
    if t < bs(3):
        return 'laptop'
    if t < bs(4):
        return 'bl'
    if t < bs(4) + 3 * B:
        return 'phone'
    if t < bs(6):
        return 'laptop'
    if bs(9) + 1.5 * B <= t < bs(10):
        return 'phone'
    if t < bs(11) + 1.4 * B:
        return 'ui'
    if t < bs(11) + 2 * B:
        return 'laptop'
    return 'bl'


def layer_frames(layer):
    out = []
    for f in range(TOTAL):
        seg = segment(f / FPS)
        if layer == 'ov' or (layer == 'desk' and seg == 'laptop') or seg == layer:
            out.append(f)
    return out


def ranges(fs):
    parts, start, prev = [], None, None
    for f in fs:
        if start is None:
            start = prev = f
        elif f == prev + 1:
            prev = f
        else:
            parts.append(f'{start}-{prev}' if prev > start else str(start))
            start = prev = f
    if start is not None:
        parts.append(f'{start}-{prev}' if prev > start else str(start))
    return ','.join(parts)


# ---------- 底片 ----------
_cache = {}


def plate(name):
    if name not in _cache:
        img = cv2.imread(f'{ROOT}/out/plates/{name}.png', cv2.IMREAD_COLOR).astype(np.float32) / 255
        info = json.load(open(f'{ROOT}/out/plates/{name}.json'))
        sx = img.shape[1] / info['size'][0]
        info['screen'] = [(x * sx, y * sx) for x, y in info['screen']]
        if 'cube' in info:
            info['cube'] = [(x * sx, y * sx) for x, y in info['cube']]
        _cache[name] = (img, info)
    return _cache[name]


def view(name, t):
    """底片上的推拉镜头：返回 (缩放 z, 焦点像素)。z=1 时整张底片铺满画面。"""
    img, info = plate(name)
    H, W = img.shape[:2]
    center = np.array([W / 2, H / 2])
    scr = np.array(info['screen'])
    sc = scr.mean(axis=0)
    width = np.linalg.norm(scr[1] - scr[0])
    fill = 1040 / width / (OW / W)
    if name == 'laptop':
        if t < bs(3):
            p1 = eio(inv(0.0, bs(2), t))
            p2 = eio(inv(bs(2), bs(2) + 1.5 * B, t))
            z = lerp(lerp(1.0, 1.22, p1), fill, p2)
            foc = center + (sc - center) * lerp(0.35 * p1, 1.0, p2)
            return z, foc
        if t < bs(5):
            return lerp(1.0, 1.06, inv(bs(4) + 3 * B, bs(5), t)), center
        if t < bs(6):
            return lerp(fill, fill * 1.05, inv(bs(5), bs(6), t)), sc
        p = eio(inv(bs(11) + 1.4 * B, bs(11) + 2 * B, t))
        return lerp(fill, 1.0, p), sc + (center - sc) * p
    # phone
    if t < bs(5):
        p = inv(bs(4) + 0.5 * B, bs(4) + 3 * B, t)
    else:
        p = inv(bs(9) + 1.5 * B, bs(10), t)
    return lerp(1.0, 1.1, p), center + (sc - center) * 0.3


def plate_frame(name, t, tex):
    img, info = plate(name)
    H, W = img.shape[:2]
    z, foc = view(name, t)
    s = z * OW / W
    A = np.array([[s, 0, OW / 2 - foc[0] * s], [0, s, OH / 2 - foc[1] * s]], dtype=np.float32)
    out = cv2.warpAffine(img, A, (OW, OH), flags=cv2.INTER_LINEAR if s > 1 else cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    quad = np.array([[x * s + A[0, 2], y * s + A[1, 2]] for x, y in info['screen']], dtype=np.float32)
    th, tw = tex.shape[:2]
    src = np.array([[0, 0], [tw, 0], [tw, th], [0, th]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(src, quad)
    warped = cv2.warpPerspective(tex, M, (OW, OH), flags=cv2.INTER_AREA if s * th < th else cv2.INTER_LINEAR)
    mask = cv2.warpPerspective(np.ones((th, tw), np.float32), M, (OW, OH), flags=cv2.INTER_LINEAR)[..., None]
    # 屏幕玻璃：轻微压暗 + 一道斜向反光
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    refl = np.clip(1 - np.abs((xx * 0.55 + yy) - (quad[:, 1].mean() + quad[:, 0].mean() * 0.55 - 120)) / 260, 0, 1) * 0.05
    warped = warped * 0.94 + refl[..., None]
    out = out * (1 - mask) + warped * mask
    extra = {'quad': quad, 's': s, 'A': A}
    if 'cube' in info:
        cx, cy = info['cube'][0]
        extra['cube'] = (cx * s + A[0, 2], cy * s + A[1, 2])
    return out, extra


def read(path, flags=cv2.IMREAD_COLOR):
    im = cv2.imread(path, flags)
    if im is None:
        raise FileNotFoundError(path)
    return im


def bloom(img, thr=0.75, k=0.55):
    small = cv2.resize(img, (OW // 4, OH // 4), interpolation=cv2.INTER_AREA)
    hi = np.clip(small - thr, 0, None)
    g = cv2.GaussianBlur(hi, (0, 0), 6) + cv2.GaussianBlur(hi, (0, 0), 18) * 0.7
    return img + cv2.resize(g, (OW, OH), interpolation=cv2.INTER_LINEAR) * k


_yy, _xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
VIG = (1 - 0.42 * np.clip(((_xx - OW / 2) / (OW * 0.62)) ** 2 + ((_yy - OH * 0.48) / (OH * 0.6)) ** 2 - 0.25, 0, 1))[..., None]


def radial(cx, cy, r, color, a):
    d = np.exp(-(((_xx - cx) ** 2 + (_yy - cy) ** 2) / (2 * r * r)))[..., None]
    return d * np.array(color, np.float32)[None, None, :] * a


def compose(f):
    t = f / FPS
    seg = segment(t)
    if seg == 'bl':
        img = read(f'{ROOT}/frames/bl/f_{f:05d}.png').astype(np.float32) / 255
        img = cv2.resize(img, (OW, OH), interpolation=cv2.INTER_CUBIC)
        img = bloom(img, 0.7, 0.6)
    elif seg == 'ui':
        img = read(f'{ROOT}/frames/ui/f_{f:05d}.png').astype(np.float32) / 255
    else:
        name = 'laptop' if seg == 'laptop' else 'phone'
        tex = read(f'{ROOT}/frames/{"desk" if name == "laptop" else "phone"}/f_{f:05d}.png').astype(np.float32) / 255
        img, ex = plate_frame(name, t, tex)
        img = bloom(img, 0.8, 0.4)
        # 第 4 小节最后一拍：家里的小方块收到指令，亮一下
        if name == 'laptop' and bs(4) + 3 * B <= t < bs(5) and 'cube' in ex:
            a = pulse(t - (bs(4) + 3 * B), 4)
            img = img + radial(*ex['cube'], 70 * ex['s'] / 0.67, (0.2, 1.0, 0.55)[::-1], 0.9 * a)

    # 闪光（BGR）
    flash = None
    ti = insert_at(t)
    if ti is not None:
        flash = ((1, 1, 1), 0.35 * pulse(t - ti, 30))
    ign = bs(3) + B
    if ign <= t < bs(4):
        flash = ((0.8, 1.0, 0.7), 0.75 * pulse(t - ign, 7))
    unl = bs(5) + 3 * B
    if unl <= t < bs(6):
        flash = ((1, 1, 1), 0.45 * pulse(t - unl, 9))
    if bs(12) <= t:
        flash = ((1, 1, 1), 0.5 * pulse(t - bs(12), 9))
    if flash and flash[1] > 0.002:
        img = img * (1 - flash[1]) + np.array(flash[0], np.float32) * flash[1]
    for t0, dur in ((bs(11) + 2 * B, 0.4 * B), (bs(9) + 1.5 * B, 0.3 * B)):
        if t0 <= t < t0 + dur:  # 从黑场淡入
            img = img * inv(t0, t0 + dur, t)

    img = img * VIG
    ov = read(f'{ROOT}/frames/ov/f_{f:05d}.png', cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    a = ov[..., 3:4]
    img = img * (1 - a) + ov[..., :3] * a
    rng = np.random.default_rng(f * 7 + 1)
    img = img + rng.normal(0, 0.012, (OH // 2, OW // 2, 1)).repeat(2, 0).repeat(2, 1).astype(np.float32)
    out = np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)
    os.makedirs(f'{ROOT}/frames/comp', exist_ok=True)
    cv2.imwrite(f'{ROOT}/frames/comp/f_{f:05d}.png', out)
    return f


def main():
    args = dict(zip(sys.argv[1::2], sys.argv[2::2]))
    if '--list' in args:
        print(ranges(layer_frames(args['--list'])))
        return
    if '--segments' in args:
        for f in range(TOTAL):
            print(f, segment(f / FPS))
        return
    fs = list(range(TOTAL))
    if '--frames' in args:
        fs = []
        for part in args['--frames'].split(','):
            a, _, b = part.partition('-')
            fs += list(range(int(a), int(b or a) + 1))
    with Pool(int(args.get('--jobs', 4))) as p:
        for i, _ in enumerate(p.imap_unordered(compose, fs)):
            if (i + 1) % 60 == 0:
                print(f'comp {i + 1}/{len(fs)}', flush=True)
    print(f'comp done {len(fs)}')


if __name__ == '__main__':
    main()
