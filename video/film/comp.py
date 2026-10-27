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
TL = json.load(open(f'{ROOT}/timeline.json'))
FPS = TL['fps']
B = 60 / TL['bpm']
SEC = {}
_acc = 0
for _name, _beats, *_ in TL['sections']:
    SEC[_name] = (_acc * B, (_acc + _beats) * B)
    _acc += _beats
DUR = _acc * B + TL['tail']
TOTAL = round(DUR * FPS)
OW, OH = 1080, 1920
PREVIEW = '--preview' in sys.argv
ORDER = [s[0] for s in TL['sections']]
UNLOCK_DOTS = [0.5, 1.5, 2.5, 3.5]   # 和 src/main.js 一致
UNLOCK_ENTER = 4.0


def T(sec, beat=0.0):
    return SEC[sec][0] + beat * B


def sec_at(t):
    for n in ORDER:
        if t < SEC[n][1]:
            return n
    return 'end'


def lb_of(sec, t):
    return (t - SEC[sec][0]) / B


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


INSERTS = sorted(T(sec, b) for sec, b, _ in TL['inserts'])
IB = TL['insert_beats'] * B


def insert_at(t):
    for t0 in INSERTS:
        if t0 <= t < t0 + IB:
            return t0
    return None


def segment(t):
    """这一帧用什么画面：bl = Blender 镜头，laptop / phone = 底片 + 屏幕，ui = 全屏界面。"""
    if insert_at(t) is not None:
        return 'bl'
    sec = sec_at(t)
    lb = lb_of(sec, t)
    if sec in ('intro1', 'intro2', 'unlock'):
        return 'laptop'
    if sec in ('reveal', 'end'):
        return 'bl'
    if sec == 'command':
        return 'phone' if lb < 3 else 'laptop'
    if sec == 'notify':
        return 'phone'
    if sec == 'done':
        return 'ui' if lb < 1.4 else 'laptop' if lb < 2 else 'bl'
    return 'ui'


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
    sec = sec_at(t)
    lb = lb_of(sec, t)
    if name == 'laptop':
        if sec in ('intro1', 'intro2'):
            p1 = eio(inv(SEC['intro1'][0], SEC['intro1'][1], t))
            p2 = eio(inv(T('intro2'), T('intro2', 1.5), t))
            z = lerp(lerp(1.0, 1.22, p1), fill, p2)
            return z, center + (sc - center) * lerp(0.35 * p1, 1.0, p2)
        if sec == 'command':
            return lerp(1.0, 1.06, inv(3, 4, lb)), center
        if sec == 'unlock':
            # 前 4 拍：屏幕和小方块同框；回车那一下推进到屏幕铺满
            cube = np.array(info['cube'][0])
            mid = np.array([(scr[:, 0].min() + cube[0] + 90) / 2, (scr[:, 1].min() + cube[1] + 90) / 2])
            medium = min(1080 / (max(scr[:, 0].max(), cube[0] + 80) - scr[:, 0].min() + 60), 1920 / (cube[1] + 140 - scr[:, 1].min())) / (OW / W)
            if lb < UNLOCK_ENTER:
                return lerp(medium, medium * 1.08, lb / UNLOCK_ENTER), mid
            p = eio(inv(UNLOCK_ENTER, UNLOCK_ENTER + 0.5, lb))
            z = lerp(medium * 1.08, fill, p) * lerp(1.0, 1.05, inv(UNLOCK_ENTER + 0.5, 8, lb))
            return z, mid + (sc - mid) * p
        p = eio(inv(1.4, 2.0, lb))  # done：拉远
        return lerp(fill, 1.0, p), sc + (center - sc) * p
    p = inv(0.5, 3, lb) if sec == 'command' else inv(0, 2, lb)
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
        path = f'{ROOT}/frames/bl/f_{f:05d}.png'
        if PREVIEW and not os.path.exists(path):
            path = f'{ROOT}/out/sample-cube.png'  # 预览时 Blender 镜头还没渲完，先用样张占位
        img = read(path).astype(np.float32) / 255
        img = cv2.resize(img, (OW, OH), interpolation=cv2.INTER_CUBIC)
        img = bloom(img, 0.7, 0.6)
    elif seg == 'ui':
        img = read(f'{ROOT}/frames/ui/f_{f:05d}.png').astype(np.float32) / 255
    else:
        name = 'laptop' if seg == 'laptop' else 'phone'
        tex = read(f'{ROOT}/frames/{"desk" if name == "laptop" else "phone"}/f_{f:05d}.png').astype(np.float32) / 255
        img, ex = plate_frame(name, t, tex)
        img = bloom(img, 0.8, 0.4)
        # 家里的小方块：收到指令时亮一下；解锁时每输一位密码闪一下蓝光
        sec, lb = sec_at(t), lb_of(sec_at(t), t)
        if name == 'laptop' and 'cube' in ex:
            r = 70 * ex['s'] / 0.67
            if sec == 'command':
                img = img + radial(*ex['cube'], r, (0.55, 1.0, 0.2), 0.9 * pulse((lb - 3) * B, 4))
            if sec == 'unlock' and lb < UNLOCK_ENTER + 1:
                k = max([pulse((lb - d) * B, 9) for d in UNLOCK_DOTS] + [pulse((lb - UNLOCK_ENTER) * B, 5)])
                img = img + radial(*ex['cube'], r, (1.0, 0.45, 0.1), 1.1 * k)

    # 闪光（BGR）
    flash = None
    ti = insert_at(t)
    if ti is not None:
        flash = ((1, 1, 1), 0.35 * pulse(t - ti, 30))
    ign = T('reveal', 1)
    if ign <= t < SEC['reveal'][1]:
        flash = ((0.8, 1.0, 0.7), 0.75 * pulse(t - ign, 7))
    unl = T('unlock', UNLOCK_ENTER)
    if unl <= t < SEC['unlock'][1]:
        flash = ((1, 1, 1), 0.6 * pulse(t - unl, 7))
    if SEC['end'][0] <= t:
        flash = ((1, 1, 1), 0.5 * pulse(t - SEC['end'][0], 9))
    if flash and flash[1] > 0.002:
        img = img * (1 - flash[1]) + np.array(flash[0], np.float32) * flash[1]
    for t0, dur in ((T('done', 2), 0.4 * B),):
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
    args = dict(zip([a for a in sys.argv[1:] if a != '--preview'][0::2], [a for a in sys.argv[1:] if a != '--preview'][1::2]))
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
