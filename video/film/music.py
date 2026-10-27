"""合成配乐与音效：128 BPM，段落和 timeline.json 一致，逐拍对齐画面。

用法：python3 music.py out/soundtrack.wav
"""
import json
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

ROOT = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(f'{ROOT}/timeline.json'))
SR = 44100
B = 60 / TL['bpm']
SEC = {}
_acc = 0
for _name, _beats, *_ in TL['sections']:
    SEC[_name] = (_acc * B, _beats)
    _acc += _beats
DUR = _acc * B + TL['tail']
N = int(DUR * SR) + SR
rng = np.random.default_rng(7)


def T(sec, beat=0.0):
    return SEC[sec][0] + beat * B


def buf():
    return np.zeros(N)


def add(dst, sig, t, gain=1.0):
    i = int(round(t * SR))
    if i >= N or i < 0:
        return
    j = min(N, i + len(sig))
    dst[i:j] += sig[: j - i] * gain


def tt(d):
    return np.arange(int(d * SR)) / SR


def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def saw(freq, d, detune=(0.0,), phase_seed=0):
    t = tt(d)
    out = np.zeros_like(t)
    r = np.random.default_rng(phase_seed)
    for dt in detune:
        f = freq * (2 ** (dt / 1200))
        out += 2 * ((t * f + r.random()) % 1.0) - 1
    return out / len(detune)


def note(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# ---------- 鼓与音效 ----------
def kick(gain=1.0):
    t = tt(0.42)
    f = 46 + 110 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 300) * 0.35
    return np.tanh((body + click) * 1.6) * gain


def clap():
    t = tt(0.28)
    n = bp(rng.standard_normal(len(t)), 900, 5200)
    env = np.zeros_like(t)
    for o in (0, 0.009, 0.019):
        env += np.where(t >= o, np.exp(-(t - o) * 55), 0)
    env += np.exp(-t * 16) * 0.5
    return n * env * 0.55


def keyclick(bright=1.0, gain=1.0):
    t = tt(0.07)
    n = bp(rng.standard_normal(len(t)), 1800, 7500) * np.exp(-t * 140)
    body = np.sin(2 * np.pi * (380 + 120 * rng.random()) * t) * np.exp(-t * 90) * 0.5
    return (n * bright + body) * gain * 0.6


def enterkey():
    t = tt(0.16)
    n = bp(rng.standard_normal(len(t)), 600, 6000) * np.exp(-t * 60)
    body = np.sin(2 * np.pi * 180 * t) * np.exp(-t * 40)
    return (n + body * 0.9) * 0.9


def hat(open_=False):
    t = tt(0.22 if open_ else 0.05)
    n = hp(rng.standard_normal(len(t)), 7000)
    return n * np.exp(-t * (14 if open_ else 90)) * 0.28


def tom(f0=90):
    t = tt(0.5)
    f = f0 + 60 * np.exp(-t * 20)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6) * 0.8


def thump():
    """解锁时每输一位密码的低频重击"""
    t = tt(0.6)
    f = 40 + 50 * np.exp(-t * 18)
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5) * 2.0) * 0.8


def boop():
    t = tt(0.18)
    f = 900 - 500 * (t / t[-1])
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 20) * 0.5


def ding(f0=1568, gain=0.5):
    t = tt(1.2)
    s = (np.sin(2 * np.pi * f0 * t) + 0.5 * np.sin(2 * np.pi * f0 * 1.5 * t) * np.exp(-t * 3)
         + 0.25 * np.sin(2 * np.pi * f0 * 2.01 * t) * np.exp(-t * 6))
    return s * np.exp(-t * 4.2) * np.minimum(1, t * 400) * gain


def notif():
    out = np.zeros(int(0.6 * SR))
    for i, f in enumerate((1318.5, 1760.0)):
        s = ding(f, 0.35)[: int(0.45 * SR)]
        o = int(i * 0.09 * SR)
        out[o:o + len(s)] += s[: len(out) - o]
    return out


def sweep(d, up=True, gain=0.6, seg=32):
    t = tt(d)
    n = rng.standard_normal(len(t))
    x = t / d
    out = np.zeros_like(t)
    for k in range(seg):
        a, b = int(k * len(t) / seg), int((k + 1) * len(t) / seg)
        fc = 300 * (25 ** (x[a] if up else 1 - x[a]))
        out[a:b] = bp(n[max(0, a - 2000):b], fc * 0.6, min(fc * 1.6, 18000))[-(b - a):]
    return out * np.sin(np.pi * x) ** 1.5 * gain


def impact(gain=1.0):
    t = tt(2.2)
    f = 38 + 70 * np.exp(-t * 10)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    noise = lp(rng.standard_normal(len(t)), 5000) * np.exp(-t * 5) * 0.4
    shimmer = hp(rng.standard_normal(len(t)), 6000) * np.exp(-t * 2.2) * 0.12
    return np.tanh((boom + noise + shimmer) * 1.4) * gain


def zap():
    t = tt(0.12)
    f = 2400 * np.exp(-t * 25) + 300
    s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t * 35)
    return lp(s, 6000) * 0.16


def riser(d):
    t = tt(d)
    x = t / d
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = 48
    for k in range(seg):
        a, b = int(k * len(t) / seg), int((k + 1) * len(t) / seg)
        fc = 400 * (30 ** x[a])
        out[a:b] = bp(n[max(0, a - 2000):b], fc * 0.7, min(fc * 1.4, 19000))[-(b - a):]
    tone = np.sin(2 * np.pi * np.cumsum(220 * (4 ** x)) / SR) * 0.25
    return (out * 0.5 + tone) * x ** 2


# ---------- 和声（A 小调） ----------
CH = {'Am': [57, 60, 64], 'F': [53, 57, 60], 'C': [48, 52, 55], 'G': [55, 59, 62], 'Dm': [50, 53, 57], 'E': [52, 56, 59], 'Am9': [57, 60, 64, 71]}


def pad(notes, d, cutoff=1800):
    s = sum(saw(note(n), d, detune=(-12, 0, 11), phase_seed=n) for n in notes) / len(notes)
    s = lp(s, cutoff, 2)
    t = tt(d)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (d - t) / 0.2)
    return s * env * 0.35


def stab(notes, d=0.16):
    s = sum(saw(note(n + 12), d, detune=(-18, -6, 6, 18), phase_seed=n + 3) for n in notes) / len(notes)
    return lp(s, 5200, 2) * np.exp(-tt(d) * 16) * 0.55


def bass(n, d):
    t = tt(d)
    f = note(n)
    s = saw(f, d, detune=(-6, 6), phase_seed=n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.8
    return np.tanh(lp(s, 700, 2) * np.minimum(1, t / 0.005) * np.exp(-t * 4) * 1.6) * 0.55


def main(out):
    drums, music, sfx = buf(), buf(), buf()
    kicks = []

    def kick_at(t, g=1.0):
        kicks.append(t)
        add(drums, kick(g), t)

    def groove(sec, b0, b1, chords, dense=False, hats16=False):
        """主段节奏：四踩底鼓、反拍开镲、2/4 拍掌、键盘声做 hi-hat、反拍和弦、八分低音。"""
        for b in np.arange(b0, b1, 1.0):
            t = T(sec, b)
            kick_at(t)
            add(drums, hat(open_=True), t + 0.5 * B, 0.5)
            if int(b) % 2 == 1:
                add(drums, clap(), t)
            ch = chords[min(len(chords) - 1, int((b - b0) // 4))]
            add(music, stab(CH[ch]), t + 0.5 * B, 1.0)
            for e in (0, 0.5):
                add(music, bass(CH[ch][0] - 12 + (12 if e else 0), B / 2), t + e * B)
            step = 0.125 if dense else 0.25
            for k in range(int(1 / step)):
                if hats16 or dense or k % 2 == 1:
                    add(sfx, keyclick(1.0, 0.28 + 0.12 * (k == 0)), t + k * step * B)
        for i, ch in enumerate(chords):
            d = min(4, b1 - b0 - 4 * i) * B
            if d > 0:
                add(music, pad(CH[ch], d, 2400), T(sec, b0 + 4 * i), 0.6)

    # 开场：键盘声做鼓点，轻底鼓
    for sec, ch in (('intro1', 'Am'), ('intro2', 'F')):
        for b in range(4):
            kick_at(T(sec, b), 0.75)
            for s16 in range(4):
                if sec == 'intro1' or s16 % 2 == 1:
                    add(sfx, keyclick(1.0, 0.5 + 0.2 * (s16 == 2)), T(sec, b + s16 / 4))
        add(music, pad(CH[ch], 4 * B, 1200), T(sec))
    for i, b in enumerate((1, 1.5, 2, 2.5)):
        add(sfx, tom(95 - i * 8), T('intro2', b), 0.9)
    add(sfx, boop(), T('intro2', 3.0), 0.9)

    # 亮灯
    add(sfx, impact(1.0), T('reveal', 1.0))
    add(music, pad(CH['Dm'], 3 * B, 2600), T('reveal', 1.0), 1.1)
    add(sfx, riser(3 * B), T('reveal', 1.0), 0.4)

    # 手机发指令：节奏进来
    for b in range(4):
        kick_at(T('command', b), 0.85)
        add(drums, hat(), T('command', b + 0.5))
    add(drums, clap(), T('command', 1))
    add(drums, clap(), T('command', 3))
    add(music, pad(CH['E'], 4 * B, 2200), T('command'))
    add(sfx, sweep(0.35, True, 0.5), T('command', 1.8))
    add(sfx, ding(2093, 0.35), T('command', 3.0))

    # 远程解锁：前 4 拍屏住呼吸，每输一位密码一记重击；第 4 拍回车 = drop
    add(music, pad(CH['E'], 4 * B, 900), T('unlock'), 1.2)
    add(sfx, riser(4 * B), T('unlock'), 0.55)
    for b in (0.5, 1.5, 2.5, 3.5):
        add(sfx, thump(), T('unlock', b), 1.0)
        add(sfx, keyclick(1.5, 1.4), T('unlock', b))
    for i in range(10):
        add(drums, clap(), T('unlock', 2 + i * 0.15), 0.15 + 0.45 * i / 10)
    add(sfx, enterkey(), T('unlock', 4.0), 1.4)
    add(sfx, impact(1.0), T('unlock', 4.0))
    add(sfx, ding(1760, 0.4), T('unlock', 4.3))
    groove('unlock', 4, 8, ['Am'])

    # 回微信
    groove('wechat', 0, 8, ['F', 'C'])
    add(sfx, notif(), T('wechat', 0.5), 0.8)
    add(sfx, keyclick(1.0, 0.9), T('wechat', 1.5))
    for i in range(9):
        add(sfx, keyclick(1.3, 0.85), T('wechat', 2.5 + i * (2.5 / 9)))
    add(sfx, enterkey(), T('wechat', 5.5))
    add(sfx, sweep(0.3, True, 0.5), T('wechat', 5.5))

    # 刷小红书
    groove('xhs', 0, 8, ['G', 'Am'])
    for b in (0.9, 1.2):
        add(sfx, keyclick(1.3, 0.9), T('xhs', b))
    add(sfx, enterkey(), T('xhs', 1.5))
    add(sfx, sweep(2.6 * B, True, 0.35), T('xhs', 1.8))
    add(sfx, sweep(0.3, False, 0.4), T('xhs', 4.6))
    for b in (5.2, 5.7, 6.2, 6.7):
        add(sfx, ding(2637, 0.12), T('xhs', b))

    # 快段：报告 → 发回手机 → 混剪
    groove('report', 0, 4, ['F'], hats16=True)
    for i in range(4):
        add(sfx, keyclick(1.0, 0.9), T('report', 0.8 + i * 0.25))
    add(sfx, ding(1760, 0.3), T('report', 1.8))
    add(sfx, sweep(0.3, False, 0.5), T('report', 2.2))
    add(sfx, enterkey(), T('report', 2.9), 0.8)
    groove('notify', 0, 2, ['G'], hats16=True)
    add(sfx, notif(), T('notify', 0.3), 1.0)
    groove('montage', 0, 6, ['Am', 'F'], dense=True)
    for b in range(6):
        add(sfx, enterkey(), T('montage', b + 0.25), 0.6)

    # 小方块插入镜头：电流声
    for sec, b, _ in TL['inserts']:
        add(sfx, zap(), T(sec, b))

    # 完成：静一拍 → 叮 → 锁屏 → 绿灯
    add(sfx, ding(1568, 0.6), T('done', 1.0))
    add(sfx, sweep(0.45, False, 0.45), T('done', 1.0))
    add(music, pad(CH['C'], 3 * B, 1600), T('done', 1.0), 0.9)
    add(music, pad([60, 64, 67, 71], 2 * B, 2200), T('done', 2.0), 0.5)

    # 片尾
    add(sfx, impact(0.9), T('end'))
    kick_at(T('end'), 1.0)
    endlen = DUR - T('end') + 0.6
    add(music, pad(CH['Am9'], endlen, 3000), T('end'), 1.2)
    add(music, stab(CH['Am9'], 0.6), T('end'), 1.0)
    add(sfx, ding(1318.5, 0.35), T('end', 0.5))
    add(sfx, ding(1975.5, 0.25), T('end', 1.0))
    add(sfx, keyclick(1.2, 1.2), T('end', 3.5))
    add(sfx, enterkey(), DUR - 0.45, 0.9)

    side = np.ones(N)
    for k in kicks:
        i = int(k * SR)
        n = min(N - i, int(0.4 * SR))
        side[i:i + n] = np.minimum(side[i:i + n], 1 - 0.65 * np.exp(-np.arange(n) / SR * 11))
    music *= side

    mix = drums * 0.85 + music * 0.95 + sfx * 0.8
    # 真空静音：亮灯前一拍、解锁回车前 1/4 拍、完成后第一拍
    for a, b in ((T('reveal', 0.05), T('reveal', 1.0)), (T('unlock', 3.75), T('unlock', 4.0)), (T('done', 0), T('done', 1.0))):
        i, j = int(a * SR), int(b * SR)
        fade = int(0.01 * SR)
        mix[i:i + fade] *= np.linspace(1, 0, fade)
        mix[i + fade:j] = 0
    add(mix, boop() * 0.4, T('done', 0.05))

    mix = mix[: int(DUR * SR)]
    tail = int(0.35 * SR)
    mix[-tail:] *= np.linspace(1, 0, tail)
    mix = hp(mix, 28)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    mix *= 0.89 / np.max(np.abs(mix))
    wavfile.write(out, SR, (np.stack([mix, mix], axis=1) * 32767).astype(np.int16))
    print(f'wrote {out}: {len(mix) / SR:.2f}s')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'out/soundtrack.wav')
