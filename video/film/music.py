"""合成配乐与音效：128 BPM，12 小节 + 1 秒片尾，和 src/main.js 的时间轴逐拍对齐。

用法：python3 music.py out/soundtrack.wav
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
BPM = 128
B = 60 / BPM
BAR = 4 * B
DUR = 12 * BAR + 1.0
N = int(DUR * SR) + SR  # 多留 1 秒给混响尾巴，最后再裁掉
rng = np.random.default_rng(7)


def bs(k):
    return (k - 1) * BAR


def T(bar, beat=0.0):
    return bs(bar) + beat * B


def buf():
    return np.zeros(N)


def add(dst, sig, t, gain=1.0):
    i = int(round(t * SR))
    if i >= N:
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
    """MIDI 音高 → 频率"""
    return 440.0 * 2 ** ((n - 69) / 12)


# ---------- 鼓与音效 ----------
def kick(gain=1.0):
    t = tt(0.42)
    f = 46 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
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
    """真实键盘声：短促的塑料“嗒”"""
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
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    return s * 0.8


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
    """消息提示：两个短音"""
    out = np.zeros(int(0.6 * SR))
    for i, f in enumerate((1318.5, 1760.0)):
        s = ding(f, 0.35)[: int(0.45 * SR)]
        o = int(i * 0.09 * SR)
        out[o:o + len(s)] += s[: len(out) - o]
    return out


def whoosh(d, up=True, gain=0.6):
    t = tt(d)
    n = rng.standard_normal(len(t))
    x = t / d
    out = np.zeros_like(t)
    seg = 32
    for k in range(seg):
        a, b = int(k * len(t) / seg), int((k + 1) * len(t) / seg)
        fc = 300 * (25 ** (x[a] if up else 1 - x[a]))
        out[a:b] = bp(n[max(0, a - 2000):b], fc * 0.6, min(fc * 1.6, 18000))[-(b - a):]
    env = np.sin(np.pi * x) ** 1.5
    return out * env * gain


def impact(gain=1.0):
    t = tt(2.2)
    f = 38 + 70 * np.exp(-t * 10)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    noise = lp(rng.standard_normal(len(t)), 5000) * np.exp(-t * 5) * 0.4
    shimmer = hp(rng.standard_normal(len(t)), 6000) * np.exp(-t * 2.2) * 0.12
    return np.tanh((boom + noise + shimmer) * 1.4) * gain


def zap():
    """小方块插入镜头的电流声"""
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
    f = 220 * (4 ** x)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return (out * 0.5 + tone) * x ** 2


# ---------- 和声 ----------
# 每小节一个和弦（A 小调）：Am F Dm E | Am F C G | Am F C Am
CHORDS = {
    1: [57, 60, 64], 2: [53, 57, 60], 3: [50, 53, 57], 4: [52, 56, 59],
    5: [57, 60, 64], 6: [53, 57, 60], 7: [48, 52, 55], 8: [55, 59, 62],
    9: [57, 60, 64], 10: [53, 57, 60], 11: [48, 52, 55], 12: [57, 60, 64, 71],
}
ROOT = {k: v[0] - 12 for k, v in CHORDS.items()}


def pad(notes, d, cutoff=1800):
    s = sum(saw(note(n), d, detune=(-12, 0, 11), phase_seed=n) for n in notes) / len(notes)
    s = lp(s, cutoff, 2)
    t = tt(d)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (d - t) / 0.2)
    return s * env * 0.35


def stab(notes, d=0.16):
    s = sum(saw(note(n + 12), d, detune=(-18, -6, 6, 18), phase_seed=n + 3) for n in notes) / len(notes)
    t = tt(d)
    s = lp(s, 5200, 2)
    return s * np.exp(-t * 16) * 0.55


def bass(n, d):
    t = tt(d)
    f = note(n)
    s = saw(f, d, detune=(-6, 6), phase_seed=n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.8
    s = lp(s, 700, 2)
    env = np.minimum(1, t / 0.005) * np.exp(-t * 4)
    return np.tanh(s * env * 1.6) * 0.55


def main(out):
    drums, music, sfx = buf(), buf(), buf()
    kicks = []

    # 1–2 小节：键盘声做鼓点 + 轻底鼓 + 铺底和弦
    for bar in (1, 2):
        for b in range(4):
            kicks.append(T(bar, b))
            add(drums, kick(0.75), T(bar, b))
        for s16 in range(16):
            if bar == 1 or s16 % 2 == 1:
                add(sfx, keyclick(1.0, 0.55 + 0.25 * (s16 % 4 == 2)), T(bar, s16 / 4 + 0.01 * rng.random()))
        add(music, pad(CHORDS[bar], BAR, 1200), T(bar))
    # 第 2 小节：图标一个个暗下去 → 光标被弹回
    for i, b in enumerate((1, 1.5, 2, 2.5)):
        add(sfx, tom(95 - i * 8), T(2, b), 0.9)
    add(sfx, boop(), T(2, 3.0), 0.9)

    # 3 小节：亮灯 + riser
    add(sfx, impact(1.0), T(3, 1.0))
    add(music, pad(CHORDS[3], BAR - B, 2600), T(3, 1.0), 1.1)
    add(sfx, riser(3 * B), T(3, 1.0), 0.5)

    # 4 小节：节奏进来，军鼓滚奏推向 drop，最后半拍静音
    for b in range(4):
        kicks.append(T(4, b))
        add(drums, kick(0.85), T(4, b))
        add(drums, hat(), T(4, b + 0.5))
    add(drums, clap(), T(4, 1)); add(drums, clap(), T(4, 3))
    for i in range(12):
        bb = 2 + i * (1.5 / 12)
        add(drums, clap(), T(4, bb), 0.25 + 0.5 * i / 12)
    add(music, pad(CHORDS[4], BAR - 0.5 * B, 3200), T(4))
    add(sfx, whoosh(0.35, True, 0.5), T(4, 1.8))
    add(sfx, whoosh(2 * B, False, 0.5), T(4, 2.1))
    add(sfx, ding(2093, 0.35), T(4, 3.0))

    # 5–10 小节：主段
    for bar in range(5, 11):
        for b in range(4):
            kicks.append(T(bar, b))
            add(drums, kick(1.0), T(bar, b))
            add(drums, hat(open_=True), T(bar, b + 0.5), 0.5)
        add(drums, clap(), T(bar, 1)); add(drums, clap(), T(bar, 3))
        step = 0.125 if bar == 10 else 0.25
        k = 0
        while k * step < 4:
            if (k * step) % 1 != 0.5:
                add(sfx, keyclick(1.0, 0.3 + 0.15 * ((k % 4) == 0)), T(bar, k * step))
            k += 1
        for b in range(4):
            add(music, stab(CHORDS[bar]), T(bar, b + 0.5), 1.0)
        for e in range(8):
            add(music, bass(ROOT[bar] if e % 2 == 0 else ROOT[bar] + 12, B / 2), T(bar, e * 0.5))
        add(music, pad(CHORDS[bar], BAR, 2400), T(bar), 0.6)
    add(sfx, impact(0.9), T(5, 0))

    # 小方块插入镜头：电流声
    inserts = [T(k) for k in (4, 5, 6, 7, 8, 9)] + [T(5, 1)] + [T(10, b) for b in (0.5, 1.5, 2.5, 3.5)]
    for t0 in inserts:
        add(sfx, zap(), t0)

    # 5 小节：密码一位位输入 → 回车
    for b in (0.5, 1.5, 2.0, 2.5):
        add(sfx, keyclick(1.4, 1.0), T(5, b))
    add(sfx, enterkey(), T(5, 3.0), 1.2)
    add(sfx, whoosh(0.45, True, 0.6), T(5, 3.0))
    # 6 小节：微信
    add(sfx, notif(), T(6, 0.5), 0.8)
    add(sfx, keyclick(1.0, 0.9), T(6, 1.25))
    msg = 9
    for i in range(msg):
        add(sfx, keyclick(1.3, 0.85), T(6, 1.75 + i * (1.55 / msg)))
    add(sfx, enterkey(), T(6, 3.5))
    add(sfx, whoosh(0.3, True, 0.5), T(6, 3.5))
    # 7 小节：小红书搜索
    for b in (0.6, 0.8):
        add(sfx, keyclick(1.3, 0.9), T(7, b))
    add(sfx, enterkey(), T(7, 1.0))
    add(sfx, whoosh(2.6 * B, True, 0.35), T(7, 1.3))
    # 8 小节：扫描 + 报告成形
    for b in (0.8, 1.2, 1.45, 1.7, 1.95):
        add(sfx, ding(2637, 0.12), T(8, b))
    add(sfx, whoosh(0.4, True, 0.5), T(8, 2.25))
    for i in range(4):
        add(sfx, keyclick(1.0, 0.9), T(8, 2.75 + i * 0.25))
    add(sfx, ding(1760, 0.3), T(8, 3.75))
    # 9 小节：发文件 → 光束 → 手机收到
    add(sfx, whoosh(0.5 * B * 2, False, 0.5), T(9, 0.5))
    add(sfx, enterkey(), T(9, 1.15), 0.8)
    add(sfx, whoosh(1.1 * B * 2, True, 0.55), T(9, 1.6))
    add(sfx, notif(), T(9, 3.0), 1.0)
    # 10 小节：每次切换都点一下
    for b in range(4):
        add(sfx, enterkey(), T(10, b + 0.3), 0.6)

    # 11 小节：静音一拍 → 叮 → 锁屏 → 绿灯
    add(sfx, ding(1568, 0.6), T(11, 1.0))
    add(sfx, whoosh(0.45, False, 0.45), T(11, 1.0))
    add(music, pad(CHORDS[11], 3 * B, 1600), T(11, 1.0), 0.9)
    add(music, pad([60, 64, 67, 71], 2 * B, 2200), T(11, 2.0), 0.5)

    # 12 小节：片尾
    add(sfx, impact(0.9), T(12, 0))
    kicks.append(T(12, 0))
    add(drums, kick(1.0), T(12, 0))
    endlen = DUR - T(12) + 0.6
    add(music, pad(CHORDS[12], endlen, 3000), T(12), 1.2)
    add(music, stab(CHORDS[12], 0.6), T(12), 1.0)
    add(sfx, ding(1318.5, 0.35), T(12, 0.5))
    add(sfx, ding(1975.5, 0.25), T(12, 1.0))
    add(sfx, keyclick(1.2, 1.2), T(12, 3.5))
    add(sfx, enterkey(), DUR - 0.45, 0.9)

    # 侧链：底鼓压音乐
    side = np.ones(N)
    for k in kicks:
        i = int(k * SR)
        n = min(N - i, int(0.4 * SR))
        side[i:i + n] = np.minimum(side[i:i + n], 1 - 0.65 * np.exp(-np.arange(n) / SR * 11))
    music *= side

    mix = drums * 0.85 + music * 0.95 + sfx * 0.8
    # 第 4 小节最后半拍、第 11 小节第一拍：真空静音
    for a, b in ((T(4, 3.5), T(5, 0)), (T(11, 0), T(11, 1.0))):
        i, j = int(a * SR), int(b * SR)
        fade = int(0.01 * SR)
        mix[i:i + fade] *= np.linspace(1, 0, fade)
        mix[i + fade:j] = 0
    # 第 11 小节静音那一拍保留提示 toast 的轻“啵”
    add(mix, boop() * 0.4, T(11, 0.05))

    mix = mix[: int(DUR * SR)]
    tail = int(0.35 * SR)
    mix[-tail:] *= np.linspace(1, 0, tail)
    mix = hp(mix, 28)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    mix *= 0.89 / np.max(np.abs(mix))
    stereo = np.stack([mix, mix], axis=1)
    wavfile.write(out, SR, (stereo * 32767).astype(np.int16))
    print(f'wrote {out}: {len(mix) / SR:.2f}s')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'out/soundtrack.wav')
