// 小方块演绎视频：每一帧都由 renderAt(t) 从时间直接算出，保证逐帧渲染可复现。
import { createStage, GREEN, BLUE } from './cube.js';
import * as THREE from 'three';

const W = 1080, H = 1920;
export const BPM = 128;
const B = 60 / BPM;          // 一拍
const BAR = 4 * B;           // 一小节
const DUR = 12 * BAR + 1.0;  // 12 小节 + 1 秒片尾停留
const bs = (k) => (k - 1) * BAR;

// ---------- 工具 ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const eOut = (t) => 1 - Math.pow(1 - t, 3);
const eIn = (t) => t * t * t;
const eIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return t <= 0 ? 0 : 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const pulse = (dt, k = 10) => (dt < 0 ? 0 : Math.exp(-dt * k));
const $ = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const css = (e, o) => { for (const k in o) e.style[k] = o[k]; };
const show = (e, on) => { e.style.display = on ? '' : 'none'; };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const under = document.getElementById('under');
const over = document.getElementById('over');
const glCanvas = document.getElementById('gl');
const flashEl = document.getElementById('flash');
const hudEl = document.getElementById('hud');
const capEl = document.getElementById('cap');
const capL1 = capEl.querySelector('.l1');
const capL2 = capEl.querySelector('.l2');
const capBg = document.getElementById('capbg');
const grain = document.getElementById('grain');

// ---------- 图形素材 ----------
const SVG = {
  cursor: '<svg viewBox="0 0 46 60" width="46" height="60"><path d="M4 3 L4 48 L15 37 L23 56 L31 52 L23 34 L39 34 Z" fill="#fff" stroke="#111" stroke-width="3.5" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 100 100" width="92" height="92"><ellipse cx="40" cy="42" rx="30" ry="25" fill="#fff"/><path d="M22 60 L18 74 L34 64 Z" fill="#fff"/><ellipse cx="64" cy="60" rx="25" ry="21" fill="#e9fff2" stroke="#07c160" stroke-width="4"/><circle cx="31" cy="38" r="4" fill="#07c160"/><circle cx="49" cy="38" r="4" fill="#07c160"/></svg>',
  note: '<svg viewBox="0 0 100 100" width="88" height="88"><rect x="22" y="16" width="56" height="68" rx="10" fill="#fff"/><rect x="32" y="32" width="36" height="6" rx="3" fill="#ff2e4d"/><rect x="32" y="46" width="36" height="6" rx="3" fill="#ff2e4d" opacity=".55"/><rect x="32" y="60" width="22" height="6" rx="3" fill="#ff2e4d" opacity=".55"/></svg>',
  lock: '<svg viewBox="0 0 100 100" width="84" height="84"><path d="M32 46 V34 a18 18 0 0 1 36 0 V46" fill="none" stroke="#fff" stroke-width="9"/><rect x="22" y="44" width="56" height="42" rx="10" fill="#fff"/><circle cx="50" cy="63" r="6" fill="#3b4a55"/></svg>',
  folder: '<svg viewBox="0 0 100 100" width="90" height="90"><path d="M14 30 a6 6 0 0 1 6 -6 h22 l8 8 h30 a6 6 0 0 1 6 6 v38 a6 6 0 0 1 -6 6 h-60 a6 6 0 0 1 -6 -6 Z" fill="#fff"/></svg>',
  globe: '<svg viewBox="0 0 100 100" width="86" height="86"><circle cx="50" cy="50" r="32" fill="none" stroke="#fff" stroke-width="7"/><path d="M50 18 c-14 18 -14 46 0 64 M50 18 c14 18 14 46 0 64 M18 50 h64" fill="none" stroke="#fff" stroke-width="6"/></svg>',
  grid: '<svg viewBox="0 0 100 100" width="84" height="84"><rect x="18" y="20" width="64" height="60" rx="8" fill="#fff"/><path d="M18 40 h64 M18 60 h64 M40 20 v60 M61 20 v60" stroke="#1f9d55" stroke-width="5"/></svg>',
  term: '<svg viewBox="0 0 100 100" width="84" height="84"><path d="M24 34 L42 50 L24 66" fill="none" stroke="#9fd6ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M50 68 h26" stroke="#9fd6ff" stroke-width="8" stroke-linecap="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 20 C5 15 2 11.5 2 8 a5 5 0 0 1 10 -1 a5 5 0 0 1 10 1 c0 3.5 -3 7 -10 12 Z" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 3 l2.7 5.6 6.1 .9 -4.4 4.3 1 6.1 L12 17 6.6 19.9 l1-6.1 L3.2 9.5 l6.1-.9 Z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  bubble: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 5 h16 v11 h-9 l-5 4 v-4 h-2 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="32" height="32"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="#999" stroke-width="2.4"/><path d="M15.5 15.5 L21 21" stroke="#999" stroke-width="2.4" stroke-linecap="round"/></svg>',
};
const ICONS = {
  wx: { bg: 'linear-gradient(160deg,#2be37f,#07a650)', g: SVG.chat, n: '微信' },
  xhs: { bg: 'linear-gradient(160deg,#ff5a6e,#e3112f)', g: SVG.note, n: '小红书' },
  lock: { bg: 'linear-gradient(160deg,#55636e,#2b343c)', g: SVG.lock, n: '锁屏' },
  folder: { bg: 'linear-gradient(160deg,#4fb2ff,#1b6fe0)', g: SVG.folder, n: '文件' },
  globe: { bg: 'linear-gradient(160deg,#6a8cff,#3346d6)', g: SVG.globe, n: '浏览器' },
  grid: { bg: 'linear-gradient(160deg,#2fc173,#167a45)', g: SVG.grid, n: '表格' },
  term: { bg: 'linear-gradient(160deg,#2a333d,#12171d)', g: SVG.term, n: '终端' },
};
function icon(parent, key, label = true) {
  const d = ICONS[key];
  const e = $('div', 'icon', parent, `<div class="sq" style="background:${d.bg}">${d.g}</div>${label ? `<div class="lb">${d.n}</div>` : ''}`);
  return e;
}
const AV = ['#f6a', '#fa6', '#6cf', '#9e6', '#c9f', '#fd5', '#5dc', '#f87'];
const avBg = (i) => `radial-gradient(circle at 35% 30%, #fff, ${AV[i % AV.length]} 60%)`;

// 桌宠插画：渐变背景 + 一个带眼睛的小团子
function petArt(seed, w, h) {
  const r = rng(seed * 97 + 13);
  const hue = Math.floor(r() * 360);
  const bg = `linear-gradient(${Math.floor(r() * 180)}deg, hsl(${hue},70%,86%), hsl(${(hue + 40) % 360},75%,74%))`;
  const pw = Math.floor(w * (0.42 + r() * 0.16));
  const ph = Math.floor(pw * (0.78 + r() * 0.2));
  const body = `hsl(${(hue + 160 + Math.floor(r() * 60)) % 360},${55 + Math.floor(r() * 25)}%,${55 + Math.floor(r() * 15)}%)`;
  const glow = r() > 0.5 ? `box-shadow:0 0 ${Math.floor(pw * 0.35)}px ${body}, inset 0 -${Math.floor(ph * 0.15)}px 0 rgba(0,0,0,0.12);` : `box-shadow: inset 0 -${Math.floor(ph * 0.15)}px 0 rgba(0,0,0,0.12);`;
  return `<div class="im" style="height:${h}px;background:${bg}"><div class="pet" style="width:${pw}px;height:${ph}px;background:${body};${glow}"><i class="e l"></i><i class="e r"></i></div></div>`;
}

// ---------- 字幕 ----------
const C = (s) => `<em style="color:var(--claude)">${s}</em>`;
const X = (s) => `<em style="color:var(--codex)">${s}</em>`;
const G = (s) => `<em style="color:var(--green)">${s}</em>`;
const CAPS = {
  1: { l1: `${C('Claude')} 和 ${X('Codex')}`, l2: '已经很能干了' },
  2: { l1: '如果它们能', l2: `${G('走出对话框')}呢？`, at2: 0.25 },
  3: { l1: '现在，它们有了', l2: G('小方块'), at: 1.0, at2: 1.1 },
  4: { l1: '不在家', l2: '发一句话就行', at: 0.5, at2: 0.6 },
  5: { l1: '人不在，', l2: G('远程解锁'), at2: 3.0 },
  6: { l1: `${C('Claude')} 帮你`, l2: `回${G('微信')}`, at: 0.5, at2: 0.6 },
  7: { l1: `${X('Codex')} 去`, l2: `刷<em style="color:var(--red)">小红书</em>`, at: 0.5, at2: 0.6 },
  8: { l1: '翻笔记、看评论', l2: `写${G('报告')}`, at: 0.5, at2: 2.5 },
  9: { l1: '结果，直接', l2: `发回你${G('微信')}`, at: 0.5, at2: 0.6 },
  10: { l1: `${C('Claude')} 也好，${X('Codex')} 也好`, l2: `都能用上${G('它')}` },
  11: { l1: '干完，', l2: '自己锁屏', at: 0.0, at2: 1.0 },
};
let capKey = null;
function updateCaption(t) {
  const k = Math.floor(t / BAR) + 1;
  const c = CAPS[k];
  if (!c || k > 11) { capEl.style.opacity = 0; capBg.style.opacity = 0; return; }
  if (capKey !== k) { capL1.innerHTML = c.l1; capL2.innerHTML = c.l2; capKey = k; }
  const lt = (t - bs(k)) / B;
  const a1 = inv(c.at || 0, (c.at || 0) + 0.25, lt);
  const a2 = inv(c.at2 ?? 0.1, (c.at2 ?? 0.1) + 0.22, lt);
  const out = k === 11 ? 1 : 1 - inv(3.86, 4.0, lt);
  capEl.style.opacity = out;
  capBg.style.opacity = Math.max(a1, a2) * out;
  css(capL1, { opacity: a1, transform: `translateY(${(1 - eOut(a1)) * 30}px)` });
  const s2 = a2 > 0 ? lerp(1.35, 1, eBack(a2)) : 1.35;
  css(capL2, { opacity: clamp(a2 * 2), transform: `scale(${s2})`, filter: `blur(${(1 - a2) * 12}px)` });
}

// ---------- Agent 浮窗 ----------
const HUD = [
  [bs(4) + 3.0 * B, 'c', '收到'],
  [bs(5) + 0.0 * B, 'c', '输入密码'],
  [bs(5) + 3.0 * B, 'c', '回车 · 解锁'],
  [bs(6) + 0.5 * B, 'c', '打开 微信'],
  [bs(6) + 1.75 * B, 'c', '回复「晚上 8 点前发你」'],
  [bs(7) + 0.5 * B, 'x', '打开 小红书'],
  [bs(7) + 0.75 * B, 'x', '搜索「桌宠」'],
  [bs(8) + 0.5 * B, 'x', '读取 笔记与评论'],
  [bs(8) + 2.4 * B, 'x', '整理前 10 篇爆款'],
  [bs(9) + 0.5 * B, 'c', '发送报告 → 文件传输助手'],
  [bs(10) + 0.0 * B, 'c', '回复消息'],
  [bs(10) + 1.0 * B, 'x', '读取 笔记'],
  [bs(10) + 2.0 * B, 'c', '填写 表格'],
  [bs(10) + 3.0 * B, 'x', '点击「允许」'],
  [bs(11) + 0.0 * B, 'c', '全部完成 ✓'],
  [bs(11) + 0.6 * B, 'c', '锁屏'],
  [bs(12) + 0.0 * B, 'c', '搞定 ✓'],
];
const AGENT = { c: ['Claude', 'var(--claude)', 'rgba(224,135,95,0.65)'], x: ['Codex', 'var(--codex)', 'rgba(159,214,255,0.65)'] };
const hudLines = [$('div', 'hl old', hudEl), $('div', 'hl', hudEl)];
function hudHtml(ev, chars) {
  const [name, color] = AGENT[ev[1]];
  const txt = [...ev[2]].slice(0, chars).join('');
  return `<span class="dot ${ev[1]}"></span><span class="ag" style="color:${color}">${name}</span> <span style="opacity:.6">▸</span> ${esc(txt)}`;
}
function updateHud(t) {
  let idx = -1;
  for (let i = 0; i < HUD.length; i++) if (HUD[i][0] <= t) idx = i;
  const vis = idx >= 0 && t < bs(12) + 1.4 * B;
  const fade = 1 - inv(bs(12) + 1.0 * B, bs(12) + 1.4 * B, t);
  hudEl.style.opacity = vis ? fade : 0;
  if (!vis) return;
  const cur = HUD[idx];
  const dt = t - cur[0];
  const chars = Math.floor(dt * 70) + 1;
  const ln = hudLines[1];
  ln.innerHTML = hudHtml(cur, chars);
  ln.style.borderColor = AGENT[cur[1]][2];
  const a = eOut(inv(0, 0.12, dt));
  css(ln, { opacity: a, transform: `translateY(${(1 - a) * 16}px) scale(${1 + 0.06 * pulse(dt, 14)})` });
  const prev = HUD[idx - 1];
  const old = hudLines[0];
  if (prev && cur[0] - prev[0] < 3 * BAR) {
    old.innerHTML = hudHtml(prev, 99);
    old.style.borderColor = AGENT[prev[1]][2];
    css(old, { opacity: 0.5, display: '' });
  } else old.style.display = 'none';
}

// ---------- 场景 ----------
const scenes = [];
function scene(range, build, update) {
  const u = $('div', 'scene', under);
  const o = $('div', 'scene', over);
  const s = { range, u, o, update };
  build(u, o, s);
  scenes.push(s);
  return s;
}

// 1–2 小节：Claude / Codex 窗口 → 走不出对话框
scene([0, bs(3)], (u, o, s) => {
  $('div', 'bg-dark', u);
  s.claude = $('div', 'win claude', u, `<div class="bar"><i></i><i></i><i></i><div class="ttl"><span class="dot c"></span>Claude</div></div>
    <div class="body"><div class="msg">好的，我来重构这个模块，并补上测试：</div><div class="code"></div></div>`);
  s.codex = $('div', 'win codex', u, `<div class="bar"><i></i><i></i><i></i><div class="ttl" style="color:#9fb3c6"><span class="dot x"></span>Codex</div></div><div class="body"></div>`);
  for (const w of [s.claude, s.codex]) css(w, { left: '80px', width: '920px', height: '470px' });
  s.code = s.claude.querySelector('.code');
  s.cbody = s.codex.querySelector('.body');
  s.icons = ['wx', 'xhs', 'lock', 'folder'].map((k) => icon(u, k));
  s.iconPos = [[115, 395], [815, 395], [115, 1185], [815, 1185]];
  s.cursor = $('div', 'cursor', u, SVG.cursor);
  s.ripple = $('div', 'ripple', u);
}, (s, t) => {
  const CODE = [
    'export async function sendKeys(keys) {',
    '  const dev = await hid.open(VID, PID);',
    '  for (const k of keys) {',
    '    await dev.write(encode(k));',
    '  }',
    '  return dev.close();',
    '}',
  ].join('\n');
  const n = Math.floor(CODE.length * eIO(inv(0.1, 1.75, t)));
  const hl = (src) => esc(src)
    .replace(/\b(export|async|function|const|for|of|await|return)\b/g, '<span class="k">$1</span>')
    .replace(/\b(sendKeys|open|write|encode|close)\b/g, '<span class="f">$1</span>')
    .replace(/\b(VID|PID)\b/g, '<span class="n">$1</span>');
  s.code.innerHTML = hl(CODE.slice(0, n)) + (t < 1.85 ? '<span class="caret" style="color:#e7956e"></span>' : '');
  const LINES = [
    '<span class="p">›</span> 重构 hid_bridge，并补全测试',
    '<span class="d">• 读取 src/bridge.ts</span>',
    '<span class="d">• 修改 3 个文件</span>',
    '<span class="g">+ export function sendKeys(keys)</span>',
    '<span class="r">- function legacyWrite()</span>',
    '<span class="g">+ test("按顺序写入按键")</span>',
    '<span class="g">✓ 42 项测试通过</span>',
  ];
  const shown = Math.min(LINES.length, Math.floor(inv(0.15, 1.7, t) * LINES.length) + (t > 0.15 ? 1 : 0));
  s.cbody.innerHTML = LINES.slice(0, shown).map((l) => `<div class="ln">${l}</div>`).join('');

  // 第 1 小节节拍上的轻微弹动；第 2 小节缩小居中
  const beatDt = t < BAR ? (t % B) : 99;
  const punch = 1 + 0.02 * pulse(beatDt, 9);
  const p = eIO(inv(bs(2), bs(2) + 0.6, t));
  const sc = lerp(1, 0.56, p) * punch;
  const cy1 = lerp(535, 700, p), cy2 = lerp(1065, 985, p);
  const intro = eOut(inv(0, 0.25, t));
  css(s.claude, { top: `${cy1 - 235}px`, transform: `scale(${sc * lerp(0.9, 1, intro)})`, opacity: intro });
  const intro2 = eOut(inv(0.12, 0.37, t));
  css(s.codex, { top: `${cy2 - 235}px`, transform: `scale(${sc * lerp(0.9, 1, intro2)})`, opacity: intro2 });

  // 窗口边缘发光：暗示“墙”
  const wall = inv(bs(2) + 0.3, bs(2) + 0.8, t);
  const bump = pulse(t - (bs(2) + 3.0 * B), 8);
  s.claude.style.boxShadow = `0 50px 120px rgba(0,0,0,.65), 0 0 0 ${2 + bump * 5}px rgba(120,255,200,${0.1 + wall * 0.3 + bump * 0.6})`;
  s.codex.style.boxShadow = `0 50px 120px rgba(0,0,0,.65), 0 0 0 2px rgba(120,255,200,${0.1 + wall * 0.3})`;

  // 图标：弹出 → 每半拍暗下去一个
  s.icons.forEach((e, i) => {
    const t0 = bs(2) + 0.12 + i * 0.07;
    const a = inv(t0, t0 + 0.3, t);
    const dimT = bs(2) + (1 + i * 0.5) * B;
    const dim = eOut(inv(dimT, dimT + 0.12, t));
    const shake = Math.sin((t - dimT) * 80) * 8 * pulse(t - dimT, 14) * (t > dimT ? 1 : 0);
    const [x, y] = s.iconPos[i];
    css(e, {
      left: `${x + shake}px`, top: `${y}px`, opacity: a * lerp(1, 0.55, dim),
      transform: `scale(${eBack(a) * lerp(1, 0.9, dim)})`,
      filter: `grayscale(${dim}) brightness(${lerp(1, 0.45, dim)})`,
      display: t < bs(2) ? 'none' : '',
    });
  });

  // 光标想出窗口，被弹回
  const c0 = bs(2) + 2.0 * B, hit = bs(2) + 3.0 * B;
  const cvis = t > c0 && t < bs(3) - 0.05;
  let cx = lerp(560, 770, eIn(inv(c0, hit, t)));
  if (t > hit) cx = lerp(770, 660, eOut(inv(hit, hit + 0.35, t)));
  css(s.cursor, { display: cvis ? '' : 'none', left: `${cx}px`, top: '690px' });
  const rp = inv(hit, hit + 0.35, t);
  css(s.ripple, { display: t > hit && rp < 1 ? '' : 'none', left: '795px', top: '720px', transform: `scale(${0.3 + rp * 1.4})`, opacity: 1 - rp });

  // 最后半拍整体压暗
  const dark = inv(bs(3) - 0.5 * B, bs(3), t);
  s.u.style.filter = `brightness(${1 - dark * 0.7})`;
  return null;
});

// 3 小节：小方块亮起，图标重新点亮
scene([bs(3), bs(4)], (u, o, s) => {
  s.svg = $('div', 'abs', o, '');
  css(s.svg, { inset: '0' });
  s.icons = ['wx', 'xhs', 'lock', 'folder', 'globe', 'grid'].map((k) => icon(o, k));
  s.iconPos = [[100, 420], [830, 420], [60, 1130], [870, 1130], [465, 280], [465, 1250]];
  s.svg.innerHTML = `<svg width="1080" height="1920" style="position:absolute;left:0;top:0">${s.iconPos.map(([x, y], i) =>
    `<line id="ln${i}" x1="540" y1="960" x2="${x + 75}" y2="${y + 75}" stroke="#3dff8f" stroke-width="4" stroke-linecap="round" opacity=".85" style="filter:drop-shadow(0 0 8px #3dff8f)"/>`).join('')}</svg>`;
  s.lines = s.iconPos.map((_, i) => s.svg.querySelector(`#ln${i}`));
}, (s, t) => {
  const lt = t - bs(3);
  const ig = B;               // 第 2 拍亮灯
  const on = lt >= ig;
  const glow = on ? 1.15 + 2.6 * pulse(lt - ig, 5) : 0.0;
  const p = eIO(inv(0, BAR, lt));
  const shot = {
    cam: { pos: [lerp(-3.2, -1.6, p), lerp(6.5, 4.8, p), lerp(14.5, 11.2, p)], target: [0, -0.35, 0], fov: 24 },
    cubes: [{ rotY: lerp(-0.75, -0.35, p), led: { color: GREEN, int: glow }, pulse: on ? inv(ig, ig + 0.6, lt) * 0.9 : null, pulseColor: GREEN }],
    exposure: on ? 1.0 : 0.55, rim: on ? 0.9 : 1.6, key: on ? 0.6 : 0.15, env: on ? 0.32 : 0.12, bloom: 0.95,
  };
  s.icons.forEach((e, i) => {
    const t0 = ig + 0.06 + i * (B / 4);
    const a = inv(t0, t0 + 0.2, lt);
    const [x, y] = s.iconPos[i];
    const drift = Math.sin(lt * 1.3 + i) * 6;
    css(e, {
      left: `${x}px`, top: `${y + drift}px`, opacity: lerp(0.18, 1, a),
      transform: `scale(${lerp(0.85, 1, eBack(a))})`,
      filter: `grayscale(${1 - a}) brightness(${lerp(0.4, 1, a)}) drop-shadow(0 0 ${a * 30}px rgba(61,255,143,${a * 0.8}))`,
    });
    const ln = s.lines[i];
    const lp = eOut(inv(t0 - 0.05, t0 + 0.15, lt));
    const [x2, y2] = [x + 75, y + 75 + drift];
    ln.setAttribute('x2', lerp(540, x2, lp));
    ln.setAttribute('y2', lerp(960, y2, lp));
    ln.setAttribute('opacity', lp * 0.75);
  });
  return { mode: 'full', shot, flash: on ? ['rgba(160,255,200,1)', 0.75 * pulse(lt - ig, 7)] : null };
});

// 城市夜景 + 手机（第 4 小节发指令；第 9 小节收报告）
function cityBg(u) {
  $('div', 'abs', u, '').style.cssText = 'inset:0;background:linear-gradient(180deg,#05070d 0%,#0a1222 45%,#0c1626 70%,#06080c 100%)';
  const cv = $('canvas', 'abs', u);
  cv.width = 1080; cv.height = 1920;
  css(cv, { left: '0', top: '0' });
  const g = cv.getContext('2d');
  const r = rng(7);
  for (let i = 0; i < 120; i++) { // 远处光斑
    const x = r() * 1080, y = 500 + r() * 900, rad = 6 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() > 0.5 ? '255,190,120' : '120,190,255';
    grd.addColorStop(0, `rgba(${col},${0.25 + r() * 0.3})`); grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  let x = -20;
  while (x < 1100) { // 楼群剪影
    const w = 60 + r() * 110, h = 200 + r() * 520, top = 1180 - h;
    g.fillStyle = `rgb(${8 + r() * 8},${12 + r() * 8},${22 + r() * 12})`;
    g.fillRect(x, top, w, h + 800);
    for (let wy = top + 16; wy < 1180; wy += 26) for (let wx = x + 10; wx < x + w - 12; wx += 20) {
      if (r() < 0.32) { g.fillStyle = r() < 0.75 ? `rgba(255,${200 + r() * 40},${120 + r() * 60},${0.35 + r() * 0.5})` : `rgba(140,200,255,${0.3 + r() * 0.4})`; g.fillRect(wx, wy, 8, 12); }
    }
    x += w + 4 + r() * 10;
  }
  g.fillStyle = '#05070b'; g.fillRect(0, 1180, 1080, 740);
}
scene([bs(4), bs(5)], (u, o, s) => {
  cityBg(u);
  s.home = $('div', 'abs', u, '');
  css(s.home, { left: '560px', top: '1000px', width: '420px', height: '360px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(61,255,143,.35), transparent)' });
  s.phone = $('div', 'phone', o, `<div class="scr ph-chat"><div class="island"></div>
    <div class="ph-status"><span>21:47</span><span>5G</span></div>
    <div class="ph-head"><span class="dot c"></span>Claude</div>
    <div class="ph-msgs"><div class="bub me" style="opacity:0">回下微信，再让 Codex 去小红书调研下桌宠</div></div>
    <div class="ph-input"><span class="txt"></span><span class="caret" style="color:var(--claude)"></span><span class="send">↑</span></div></div>`);
  css(s.phone, { left: '80px', top: '230px' });
  s.bub = s.phone.querySelector('.bub');
  s.txt = s.phone.querySelector('.txt');
  s.caret = s.phone.querySelector('.ph-input .caret');
  s.chipA = $('div', 'chip', o, '你 · 在外面');
  css(s.chipA, { left: '170px', top: '1080px' });
  s.chipB = $('div', 'chip', o, '家里 · 小方块');
  css(s.chipB, { left: '660px', top: '1330px' });
  s.svg = $('div', 'abs', o, `<svg width="1080" height="1920" style="position:absolute;left:0;top:0">
    <path id="trail" d="M470 600 C 760 560, 900 820, 770 1170" fill="none" stroke="#3dff8f" stroke-width="10" stroke-linecap="round" style="filter:drop-shadow(0 0 12px #3dff8f) drop-shadow(0 0 30px #3dff8f)"/></svg>`);
  css(s.svg, { inset: '0' });
  s.trail = s.svg.querySelector('#trail');
}, (s, t) => {
  const lb = (t - bs(4)) / B;
  const MSG = '回下微信，再让 Codex 去小红书调研下桌宠';
  const n = Math.floor([...MSG].length * inv(0.55, 1.8, lb));
  const sent = lb >= 2.0;
  s.txt.textContent = sent ? '' : [...MSG].slice(0, n).join('');
  s.caret.style.opacity = sent ? 0 : 1;
  const ba = inv(2.0, 2.25, lb);
  css(s.bub, { opacity: ba, transform: `translateY(${(1 - eOut(ba)) * 80}px) scale(${lerp(0.8, 1, eBack(ba))})` });
  const fl = Math.sin(t * 1.6) * 8;
  css(s.phone, { transform: `perspective(1600px) rotateY(14deg) rotateZ(-3deg) translateY(${fl}px)` });
  // 光束：从手机飞向家里的小方块
  const len = 1000;
  const tp = eIO(inv(2.1, 3.0, lb));
  s.trail.setAttribute('stroke-dasharray', `${len * 0.35} ${len * 2}`);
  s.trail.setAttribute('stroke-dashoffset', `${lerp(len * 0.35, -len, tp)}`);
  s.trail.style.opacity = lb > 2.1 && lb < 3.4 ? 1 - inv(3.0, 3.4, lb) : 0;
  s.trail.style.strokeDasharray = '';
  const hit = lb >= 3.0;
  const int = hit ? 1.2 + 2.6 * pulse((lb - 3.0) * B, 6) : 0.9;
  s.home.style.opacity = 0.5 + 0.5 * (hit ? pulse((lb - 3.0) * B, 3) : 0);
  css(s.chipA, { opacity: inv(0.3, 0.6, lb) });
  css(s.chipB, { opacity: inv(0.5, 0.8, lb) });
  const shot = {
    cam: { pos: [0, 12, 30], target: [0, 0, 0], fov: 22 },
    cubes: [{ rotY: -0.5 + lb * 0.04, led: { color: GREEN, int }, pulse: null }],
    bg: 0x000000, floor: false, bloom: 1.1, env: 0.4, fogNear: 100, fogFar: 200,
  };
  return { mode: 'screen', shot, offset: [230, 220] };
});

// 5–11 小节：Mac（锁屏 → 微信 → 小红书 → 报告 → 混剪 → 锁屏）
const LIST = [
  { n: '小王', pv: '周报呢？', bd: 1, av: 0 },
  { n: '文件传输助手', pv: '[文件] 方案.pdf', av: 6 },
  { n: '家人群', pv: '[图片]', av: 3 },
  { n: '项目群', pv: '收到', av: 4 },
  { n: '订阅号', pv: '……', av: 7 },
];
function wxWindow(parent, chatName) {
  const w = $('div', 'win wx', parent, `<div class="side"><b></b><b></b><b></b><b></b></div>
    <div class="list">${LIST.map((it, i) => `<div class="it" data-i="${i}"><div class="av" style="background:${avBg(it.av)}"></div><div class="tx"><div class="n">${it.n}</div><div class="pv">${it.pv}</div></div>${it.bd ? '<div class="bd">1</div>' : ''}</div>`).join('')}</div>
    <div class="main"><div class="hd">${chatName}</div><div class="msgs"></div>
      <div class="inp"><div class="tools"><b></b><b></b><b></b></div><span class="txt"></span><span class="caret" style="color:#07c160"></span><div class="snd">发送(S)</div></div>
      <div class="empty"><b></b></div></div>`);
  w.insertAdjacentHTML('afterbegin', '<div class="bar" style="position:absolute;left:0;right:0;top:0;z-index:2;background:transparent"><i></i><i></i><i></i></div>');
  css(w, { left: '50px', top: '250px', width: '980px', height: '1130px' });
  return w;
}
function xhsWindow(parent) {
  const w = $('div', 'win xhs', parent, `<div class="bar" style="background:#fff"><i></i><i></i><i></i><div class="ttl" style="color:#333">小红书</div></div>
    <div class="top"><div class="sb">${SVG.search}<span class="txt"></span><span class="caret" style="color:var(--red)"></span></div><div class="go">搜索</div></div>
    <div class="tabs"><span>全部</span><span class="on">最热</span><span>最新</span><span>图文</span><span>视频</span></div>
    <div class="feedwrap"><div class="feed"><div class="col"></div><div class="col"></div></div></div>`);
  css(w, { left: '50px', top: '250px', width: '980px', height: '1130px' });
  const TITLES = ['我的桌面住进了一只小怪兽', '会眨眼的电子宠物，治愈了', '打工人桌搭必备小东西', '给桌宠接上 AI 之后…', '桌宠开箱｜比想象中可爱', '自制桌宠第 3 版', '这个小东西会看我写代码', '桌面氛围感拉满', '下班后它还在陪我', '有人知道这是什么桌宠吗', '我的工位新成员', '情绪价值拉满的小东西', '桌宠能有多治愈', '第一次做硬件就成功了'];
  const LIKES = ['3.2万', '1.8万', '9421', '6035', '5210', '4876', '3302', '2999', '2410', '1987', '1650', '1203', '998', '870'];
  const cols = w.querySelectorAll('.col');
  const r = rng(3);
  TITLES.forEach((tt, i) => {
    const h = 380 + Math.floor(r() * 200);
    cols[i % 2].insertAdjacentHTML('beforeend', `<div class="card">${petArt(i + 1, 466, h)}<div class="tt">${tt}</div><div class="ft"><span class="a" style="background:${avBg(i)}"></span>用户***<span class="lk">${SVG.heart}${LIKES[i]}</span></div></div>`);
  });
  return w;
}

scene([bs(5), bs(11) + 2.0 * B], (u, o, s) => {
  s.wall = $('div', 'wall', u);
  s.menubar = $('div', 'menubar', u, '<span>访达</span><span style="font-weight:500">文件</span><span style="font-weight:500">编辑</span><span style="font-weight:500">显示</span><span class="r">21:47</span>');
  s.dock = $('div', 'dock', u, ['wx', 'xhs', 'globe', 'folder', 'grid', 'term'].map((k) => `<div class="d" style="background:${ICONS[k].bg}"><div style="transform:scale(.62)">${ICONS[k].g}</div></div>`).join(''));

  s.wx = wxWindow(u, '小王');
  s.wxMsgs = s.wx.querySelector('.msgs');
  s.wxTxt = s.wx.querySelector('.inp .txt');
  s.wxCaret = s.wx.querySelector('.inp .caret');
  s.wxEmpty = s.wx.querySelector('.empty');
  s.wxHd = s.wx.querySelector('.hd');
  s.wxItems = [...s.wx.querySelectorAll('.it')];
  s.wxBadge = s.wx.querySelector('.bd');
  s.wxMsgs.innerHTML = `<div class="row in"><div class="av" style="background:${avBg(0)}"></div><div class="bb">周报呢？</div></div>
    <div class="row out"><div class="av" style="background:radial-gradient(circle at 35% 30%, #7af5d0, #1d7f72 70%)"></div><div class="bb">晚上 8 点前发你</div></div>
    <div class="row out file"><div class="av" style="background:radial-gradient(circle at 35% 30%, #7af5d0, #1d7f72 70%)"></div><div class="file"><div class="tx" style="flex:1"><div class="fn">桌宠调研.xlsx</div><div class="fs">24 KB</div></div><div class="fi">XLS</div></div></div>`;
  s.rowIn = s.wxMsgs.children[0];
  s.rowOut = s.wxMsgs.children[1];
  s.rowFile = s.wxMsgs.children[2];

  s.xhs = xhsWindow(u);
  s.xTxt = s.xhs.querySelector('.sb .txt');
  s.xCaret = s.xhs.querySelector('.sb .caret');
  s.feed = s.xhs.querySelector('.feed');
  s.feedWrap = s.xhs.querySelector('.feedwrap');
  s.note = $('div', 'note', s.xhs, `${petArt(1, 980, 560)}
    <div class="nt">我的桌面住进了一只小怪兽</div>
    <div class="nb">做了三个月，终于会动了……</div>
    <div class="st"><span>${SVG.heart} 3.2万</span><span>${SVG.star} 1.1万</span><span>${SVG.bubble} 2316</span></div>
    ${['好可爱，求链接', '这个会动吗？', '想要同款！', '蹲第二批'].map((c, i) => `<div class="cm"><div class="a" style="background:${avBg(i + 2)}"></div><div><div class="u">用户***</div><div class="c">${c}</div></div></div>`).join('')}`);
  s.scan = $('div', 'scan', s.xhs, '<div class="tg">Codex 读取中</div>');

  s.report = $('div', 'report', o, `<div class="rh"><div class="t">桌宠爆款调研 · Top 10</div><div class="tag">by Codex</div></div>
    <div class="th"><div>笔记</div><div>点赞</div><div>关键词</div></div>
    ${[['我的桌面住进了一只小怪兽', '3.2万', '可爱 / 会动'], ['会眨眼的电子宠物，治愈了', '1.8万', '表情 / 陪伴'], ['打工人桌搭必备小东西', '9421', '桌搭 / 氛围灯'], ['给桌宠接上 AI 之后…', '6035', 'AI / 互动']]
      .map(([a, b, c]) => `<div class="tr"><div>${a}</div><div class="lk">${b}</div><div class="kw">${c}</div></div>`).join('')}
    <div class="cc">结论：${'<em>可爱外形</em> + <em>会动</em> + <em>能互动</em>'} = 爆款</div>`);
  s.rows = [...s.report.querySelectorAll('.tr')];
  s.concl = s.report.querySelector('.cc');
  s.minis = [0, 1, 2, 3].map((i) => { const m = $('div', 'card abs', o, petArt(i + 1, 200, 150)); css(m, { width: '200px' }); return m; });
  s.file = $('div', 'fileicon', o, '<div class="fi">XLS</div><div class="fn">桌宠调研.xlsx</div>');

  // 混剪素材
  s.snips = [];
  const sn0 = $('div', 'win wx', u, `<div class="main" style="flex:1"><div class="hd" style="margin-top:62px">项目群</div><div class="msgs">
     <div class="row in"><div class="av" style="background:${avBg(4)}"></div><div class="bb">明早的会改到 10 点</div></div>
     <div class="row out"><div class="av" style="background:radial-gradient(circle at 35% 30%, #7af5d0, #1d7f72 70%)"></div><div class="bb">收到，已更新日程</div></div></div></div>`);
  sn0.insertAdjacentHTML('afterbegin', '<div class="bar" style="position:absolute;left:0;right:0;top:0;z-index:2"><i></i><i></i><i></i><div class="ttl" style="color:#333">微信</div></div>');
  s.snips.push(sn0);
  const sn1 = $('div', 'win xhs', u, `<div class="bar" style="background:#fff"><i></i><i></i><i></i><div class="ttl" style="color:#333">小红书</div></div>
     <div class="note">${petArt(2, 900, 640)}<div class="nt">会眨眼的电子宠物，治愈了</div><div class="st"><span>${SVG.heart} 1.8万</span><span>${SVG.star} 6230</span><span>${SVG.bubble} 984</span></div></div>`);
  sn1.insertAdjacentHTML('beforeend', '<div class="scan" style="left:20px;top:770px;width:860px;height:150px"><div class="tg">Codex 读取中</div></div>');
  s.snips.push(sn1);
  const cells = [];
  const head = ['', '渠道', '曝光', '点赞', '转化'];
  for (let rr = 0; rr < 11; rr++) for (let cc = 0; cc < 5; cc++) {
    if (rr === 0) cells.push(`<div class="h">${head[cc]}</div>`);
    else if (cc === 0) cells.push(`<div class="h">${rr}</div>`);
    else cells.push(`<div data-k="${rr * 5 + cc}"></div>`);
  }
  const sn2 = $('div', 'win sheet', u, `<div class="bar" style="background:#1f9d55;color:#fff"><i></i><i></i><i></i><div class="ttl">周报.xlsx</div></div><div class="grid">${cells.join('')}</div>`);
  s.snips.push(sn2);
  s.sheetCells = [...sn2.querySelectorAll('[data-k]')];
  const sn3 = $('div', 'abs', u, `<div class="alert"><div class="ai">&gt;_</div><div class="at">“终端”想访问“文稿”文件夹中的文件</div><div class="ad">需要访问以保存调研报告</div><div class="ab"><div>不允许</div><div class="ok">允许</div></div></div>`);
  css(sn3, { inset: '0' });
  s.snips.push(sn3);
  s.okBtn = sn3.querySelector('.ok');
  s.snips.forEach((e, i) => { if (i < 3) css(e, { left: '90px', top: '300px', width: '900px', height: '1000px' }); });

  s.toast = $('div', 'toast', o, '<div class="ck">✓</div><div class="tt">全部完成</div><div class="ts">微信已回复 · 调研报告已发回</div>');
  s.lock = $('div', 'lock', o, `<div class="dt">10月27日 星期二</div><div class="tm">21:47</div><div class="av"></div><div class="nm">我的 MacBook</div>
    <div class="pw"><span class="pd"></span><span class="pd"></span><span class="pd"></span><span class="pd"></span><div class="go">→</div></div><div class="hint">输入密码</div>`);
  s.pds = [...s.lock.querySelectorAll('.pd')];
  s.lockTm = s.lock.querySelector('.tm');
  s.black = $('div', 'abs', o, '');
  css(s.black, { inset: '0', background: '#000' });
  s.cursor = $('div', 'cursor', o, SVG.cursor);
  s.ripple = $('div', 'ripple', o);
  s.ripple.style.borderColor = 'rgba(30,30,30,.8)';
}, (s, t) => {
  const bar = Math.floor(t / BAR) + 1;
  const lb = (t - bs(bar)) / B;
  const hideAll = [s.wx, s.xhs, s.note, s.scan, s.report, s.file, s.toast, s.lock, s.black, s.cursor, s.ripple, ...s.minis, ...s.snips];
  hideAll.forEach((e) => show(e, false));
  css(s.wall, { filter: '', transform: '' });
  show(s.menubar, true); show(s.dock, true);
  let ret = null;
  const cursorAt = (x, y) => { show(s.cursor, true); css(s.cursor, { left: `${x}px`, top: `${y}px` }); };
  const rippleAt = (x, y, p) => { if (p <= 0 || p >= 1) return; show(s.ripple, true); css(s.ripple, { left: `${x}px`, top: `${y}px`, transform: `scale(${0.3 + p})`, opacity: 1 - p }); };

  if (bar === 5) {
    // 锁屏：密码一位位自己填上，回车解锁
    const unlock = eIO(inv(3.0, 3.5, lb));
    show(s.lock, unlock < 1);
    s.lockTm.textContent = '21:47';
    const DOTS = [0.5, 1.5, 2.0, 2.5];
    s.pds.forEach((d, i) => { const a = inv(DOTS[i], DOTS[i] + 0.08, lb); css(d, { opacity: a, transform: `scale(${eBack(a) * (1 + 0.5 * pulse((lb - DOTS[i]) * B, 12))})` }); });
    css(s.lock, { opacity: 1 - unlock, transform: `translateY(${-unlock * 160}px) scale(${1 + unlock * 0.05})` });
    css(s.wall, { filter: `blur(${(1 - unlock) * 28}px) brightness(${lerp(0.7, 1, unlock)})`, transform: `scale(${lerp(1.12, 1, unlock)})` });
    show(s.menubar, unlock > 0); show(s.dock, unlock > 0);
    css(s.menubar, { opacity: unlock }); css(s.dock, { opacity: unlock, transform: `translateX(-50%) translateY(${(1 - unlock) * 120}px)` });
    if (lb >= 3.0) ret = { flash: ['#fff', 0.45 * pulse((lb - 3.0) * B, 9)] };
  } else if (bar === 6) {
    // 微信：点开小王 → 自己打字回复
    show(s.wx, true);
    const pop = eBack(inv(0.5, 0.75, lb));
    css(s.wx, { transform: `scale(${lerp(0.9, 1, pop)})`, opacity: inv(0.5, 0.6, lb) });
    s.wxHd.textContent = '小王';
    const opened = lb >= 1.25;
    show(s.wxEmpty, !opened);
    s.wxItems.forEach((it, i) => it.classList.toggle('sel', opened && i === 0));
    show(s.wxBadge, !opened);
    const ai = inv(1.3, 1.45, lb);
    css(s.rowIn, { opacity: ai, transform: `scale(${eBack(ai)})`, display: '' });
    const MSG = [...'晚上 8 点前发你'];
    const n = Math.floor(MSG.length * inv(1.75, 3.3, lb)) + (lb > 1.75 ? 1 : 0);
    const sent = lb >= 3.5;
    s.wxTxt.textContent = opened && !sent ? MSG.slice(0, Math.min(n, MSG.length)).join('') : '';
    s.wxCaret.style.opacity = opened && !sent ? 1 : 0;
    const ao = inv(3.5, 3.68, lb);
    css(s.rowOut, { opacity: ao, transform: `scale(${eBack(ao)})`, display: '' });
    show(s.rowFile, false);
    // 光标：移到会话 → 点击
    if (lb > 0.6 && lb < 1.6) {
      const p = eIO(inv(0.6, 1.2, lb));
      cursorAt(lerp(760, 230, p), lerp(1100, 345, p));
      rippleAt(250, 375, inv(1.25, 1.6, lb));
    }
  } else if (bar === 7) {
    // 小红书：搜索“桌宠” → 信息流狂滚
    show(s.xhs, true);
    css(s.xhs, { transform: `scale(${lerp(0.94, 1, eBack(inv(0.5, 0.72, lb)))})`, opacity: inv(0.5, 0.6, lb), filter: '' });
    const q = [...'桌宠'];
    const n = lb < 0.6 ? 0 : lb < 0.8 ? 1 : 2;
    s.xTxt.textContent = q.slice(0, n).join('');
    s.xCaret.style.opacity = lb < 1.0 ? 1 : 0;
    const fa = inv(1.0, 1.25, lb);
    const sp = eIO(inv(1.25, 4.0, lb));
    const v = Math.sin(Math.PI * clamp(inv(1.25, 4.0, lb)));
    css(s.feed, { opacity: fa, transform: `translateY(${(1 - eOut(fa)) * 120 - sp * 2300}px)`, filter: `blur(${v * 2.5}px)` });
  } else if (bar === 8) {
    // 打开笔记 → 扫描点赞和评论 → 卡片飞出，组成调研报告
    show(s.xhs, true); show(s.note, true);
    s.xTxt.textContent = '桌宠'; s.xCaret.style.opacity = 0;
    const into = eOut(inv(0.5, 0.8, lb));
    css(s.note, { transform: `translateX(${(1 - into) * 980}px)` });
    css(s.feed, { opacity: 1, transform: 'translateY(-2300px)', filter: '' });
    const out = eIO(inv(2.25, 2.75, lb));
    css(s.xhs, { opacity: 1 - out * 0.75, transform: `scale(${lerp(1, 0.8, out)}) translateY(${-out * 140}px)`, filter: `blur(${out * 6}px)` });
    const SC = [[0.8, 30, 780, 920, 92], [1.2, 30, 880, 920, 116], [1.45, 30, 996, 920, 116], [1.7, 30, 1112, 920, 116], [1.95, 30, 1228, 920, 116]];
    let cur = null;
    for (const sc of SC) if (lb >= sc[0]) cur = sc;
    if (cur && lb < 2.3) {
      show(s.scan, true);
      const a = pulse((lb - cur[0]) * B, 14);
      css(s.scan, { left: `${cur[1]}px`, top: `${cur[2]}px`, width: `${cur[3]}px`, height: `${cur[4]}px`, transform: `scale(${1 + a * 0.04})` });
    }
    if (lb >= 2.3) {
      show(s.report, true);
      const ra = eOut(inv(2.4, 2.75, lb));
      css(s.report, { opacity: ra, transform: `translateY(${(1 - ra) * 80}px) scale(${lerp(0.94, 1, ra)})` });
      s.rows.forEach((r, i) => { const a = inv(2.75 + i * 0.25, 2.9 + i * 0.25, lb); css(r, { opacity: a, transform: `translateX(${(1 - eOut(a)) * -60}px)`, background: `rgba(159,214,255,${0.18 * pulse((lb - 2.75 - i * 0.25) * B, 8) * (a > 0 ? 1 : 0)})` }); });
      const ca = inv(3.75, 3.9, lb);
      css(s.concl, { opacity: ca, transform: `scale(${lerp(0.9, 1, eBack(ca))})` });
      s.minis.forEach((m, i) => {
        const t0 = 2.3 + i * 0.25, p = inv(t0, t0 + 0.4, lb);
        show(m, p > 0 && p < 1);
        const sx = 120 + (i % 2) * 450, sy = 500 + Math.floor(i / 2) * 300;
        const ex = 90, ey = 560 + i * 96;
        css(m, { left: `${lerp(sx, ex, eIO(p))}px`, top: `${lerp(sy, ey, eIO(p))}px`, transform: `scale(${lerp(1, 0.25, eIO(p))}) rotate(${(1 - p) * (i % 2 ? 8 : -8)}deg)`, opacity: 1 - p * 0.5 });
      });
    }
  } else if (bar === 9) {
    // 报告缩成文件 → 微信发到文件传输助手
    show(s.wx, true);
    css(s.wx, { opacity: 1, transform: '' });
    s.wxHd.textContent = '文件传输助手';
    show(s.wxEmpty, false);
    s.wxItems.forEach((it, i) => it.classList.toggle('sel', i === 1));
    show(s.wxBadge, false);
    css(s.rowIn, { display: 'none' }); css(s.rowOut, { display: 'none' });
    const fa = inv(1.15, 1.3, lb);
    css(s.rowFile, { display: '', opacity: fa, transform: `scale(${eBack(fa)})` });
    s.wxTxt.textContent = ''; s.wxCaret.style.opacity = 0;
    const shrink = eIO(inv(0.5, 1.0, lb));
    if (lb < 1.0) {
      show(s.report, true);
      s.rows.forEach((r) => css(r, { opacity: 1, transform: '', background: '' }));
      css(s.concl, { opacity: 1, transform: '' });
      css(s.report, { opacity: 1 - inv(0.8, 1.0, lb), transform: `translate(${shrink * 150}px, ${shrink * 300}px) scale(${lerp(1, 0.15, shrink)})` });
    }
    if (lb > 0.7 && lb < 1.2) {
      show(s.file, true);
      const p = eIO(inv(0.7, 1.15, lb));
      css(s.file, { left: `${lerp(470, 640, p)}px`, top: `${lerp(700, 560, p)}px`, transform: `scale(${lerp(1.3, 0.6, p)})`, opacity: 1 - inv(1.05, 1.2, lb) });
    }
  } else if (bar === 10) {
    // 混剪：Claude / Codex 轮流操作不同软件
    const k = Math.min(3, Math.floor(lb));
    const e = s.snips[k];
    show(e, true);
    const lt = lb - k;
    const z = lerp(1.1, 1, eOut(inv(0, 0.45, lt)));
    const rot = k % 2 ? 6 : -6;
    css(e, { transform: `perspective(1800px) rotateY(${rot}deg) scale(${z})` });
    if (k === 0) { const a = inv(0.12, 0.3, lt); const row = e.querySelectorAll('.row')[1]; css(row, { opacity: a, transform: `scale(${eBack(a)})` }); }
    if (k === 2) s.sheetCells.forEach((c, i) => { const on = i < Math.floor(inv(0.0, 0.45, lt) * s.sheetCells.length); c.textContent = on ? ((i * 7919) % 9000 + 300).toLocaleString('en-US') : ''; c.classList.toggle('on', i === Math.floor(inv(0.0, 0.45, lt) * s.sheetCells.length) - 1); });
    if (k === 3) {
      const p = eIO(inv(0.0, 0.3, lt));
      cursorAt(lerp(820, 700, p), lerp(1250, 1035, p));
      const click = lt > 0.3;
      s.okBtn.style.filter = click ? 'brightness(1.25)' : '';
      s.okBtn.style.transform = click ? 'scale(0.96)' : '';
      rippleAt(720, 1050, inv(0.3, 0.5, lt));
    }
  } else if (bar === 11) {
    // 完成 → 锁屏 → 熄屏
    show(s.toast, lb < 1.4);
    const ta = inv(0, 0.18, lb);
    css(s.toast, { opacity: ta * (1 - inv(1.0, 1.3, lb)), transform: `scale(${lerp(0.85, 1, eBack(ta))})` });
    const ld = eIO(inv(1.0, 1.4, lb));
    show(s.lock, lb >= 1.0);
    s.pds.forEach((d) => css(d, { opacity: 0, transform: '' }));
    s.lockTm.textContent = '21:53';
    css(s.lock, { opacity: ld, transform: `translateY(${(1 - ld) * -200}px)` });
    css(s.wall, { filter: `blur(${ld * 28}px) brightness(${lerp(1, 0.7, ld)})`, transform: `scale(${lerp(1, 1.12, ld)})` });
    show(s.black, lb >= 1.4);
    css(s.black, { opacity: eIn(inv(1.4, 2.0, lb)) });
  }
  return ret;
});

// 9 小节后半：报告飞回手机
scene([bs(9) + 1.5 * B, bs(10)], (u, o, s) => {
  cityBg(u);
  s.home = $('div', 'abs', u, '');
  css(s.home, { left: '560px', top: '1000px', width: '420px', height: '360px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(61,123,255,.4), transparent)' });
  s.phone = $('div', 'phone', o, `<div class="scr ph-lock"><div class="island"></div><div class="tm">21:52</div><div class="dt">10月27日 星期二</div>
    <div class="notif"><div class="app"><b></b>微信 · 现在</div><div class="t1">文件传输助手</div><div class="t2">[文件] 桌宠调研.xlsx</div></div></div>`);
  css(s.phone, { left: '80px', top: '230px' });
  s.notif = s.phone.querySelector('.notif');
  s.chipA = $('div', 'chip', o, '你 · 在外面');
  css(s.chipA, { left: '170px', top: '1080px' });
  s.chipB = $('div', 'chip', o, '家里 · 小方块');
  css(s.chipB, { left: '660px', top: '1330px' });
  s.svg = $('div', 'abs', o, `<svg width="1080" height="1920" style="position:absolute;left:0;top:0">
    <path id="trail2" d="M770 1170 C 900 820, 760 560, 470 600" fill="none" stroke="#3dff8f" stroke-width="10" stroke-linecap="round" style="filter:drop-shadow(0 0 12px #3dff8f) drop-shadow(0 0 30px #3dff8f)"/></svg>`);
  css(s.svg, { inset: '0' });
  s.trail = s.svg.querySelector('#trail2');
}, (s, t) => {
  const lb = (t - bs(9)) / B;
  const len = 1000;
  const tp = eIO(inv(1.6, 2.7, lb));
  s.trail.setAttribute('stroke-dasharray', `${len * 0.35} ${len * 2}`);
  s.trail.setAttribute('stroke-dashoffset', `${lerp(len * 0.35, -len, tp)}`);
  s.trail.style.opacity = lb < 3.0 ? 1 - inv(2.7, 3.0, lb) : 0;
  const na = inv(3.0, 3.18, lb);
  css(s.notif, { opacity: na, transform: `translateY(${(1 - eOut(na)) * -60}px) scale(${lerp(0.9, 1, eBack(na))})` });
  const fl = Math.sin(t * 1.6) * 8;
  css(s.phone, { transform: `perspective(1600px) rotateY(14deg) rotateZ(-3deg) translateY(${fl}px) scale(${1 + 0.03 * pulse((lb - 3.0) * B, 8) * (lb > 3 ? 1 : 0)})` });
  const shot = {
    cam: { pos: [0, 12, 30], target: [0, 0, 0], fov: 22 },
    cubes: [{ rotY: -0.45, led: { color: BLUE, int: 1.3 + 1.6 * pulse((lb - 1.6) * B, 5) * (lb > 1.6 ? 1 : 0) } }],
    bg: 0x000000, floor: false, bloom: 1.1, env: 0.4, fogNear: 100, fogFar: 200,
  };
  return { mode: 'screen', shot, offset: [230, 220], flash: lb >= 1.5 ? ['#000', 0.8 * (1 - inv(1.5, 1.7, lb))] : null };
});

// 11 小节后半：黑暗里只剩小方块，蓝灯回到绿灯
scene([bs(11) + 2.0 * B, bs(12)], () => {}, (s, t) => {
  const lb = (t - bs(11)) / B;
  const p = inv(2.0, 4.0, lb);
  const mix = eIO(inv(2.2, 3.0, lb));
  const col = new THREE.Color().copy(BLUE).lerp(GREEN, mix);
  const shot = {
    cam: { pos: [lerp(4.2, 3.4, p), lerp(2.6, 2.2, p), lerp(6.6, 5.6, p)], target: [0, -0.1, -0.3], fov: 26 },
    cubes: [{ rotY: -0.3, led: { color: col, int: lerp(1.6, 1.0, mix) } }],
    exposure: 0.9, key: 0.25, env: 0.2, bloom: 1.0,
  };
  return { mode: 'full', shot, flash: ['#000', 1 - inv(2.0, 2.4, lb)] };
});

// 12 小节：片尾
scene([bs(12), DUR + 1], (u, o, s) => {
  s.title = $('div', 'end-title', o, '<div class="big">小方块</div><div class="sub">给 AI 一双真的手</div>');
  s.big = s.title.querySelector('.big');
  s.sub = s.title.querySelector('.sub');
  s.chips = $('div', 'end-chips', o, '<div>插上 USB</div><div>免驱</div><div>不用开权限</div>');
  s.foot = $('div', 'end-foot', o, '可接入 <b style="color:var(--claude)">Claude</b> / <b style="color:var(--codex)">Codex</b>');
}, (s, t) => {
  const lb = (t - bs(12)) / B;
  const p = clamp((t - bs(12)) / (DUR - bs(12)));
  const shot = {
    cam: { pos: [Math.sin(lerp(-0.3, 0.08, p)) * 17, lerp(7.2, 6.4, p), Math.cos(lerp(-0.3, 0.08, p)) * 17], target: [0, 1.25, 0], fov: 30 },
    cubes: [
      { pos: [-1.2, 0, 0.1], rotY: 0.45, led: { color: GREEN, int: 1.0 } },
      { pos: [1.2, 0, -0.1], rotY: -0.4, led: { color: GREEN, int: 1.0 } },
    ],
    exposure: 1.0, bloom: 0.8,
  };
  const a1 = inv(0.5, 0.9, lb);
  css(s.big, { opacity: a1, transform: `scale(${lerp(1.3, 1, eOut(a1))})`, filter: `blur(${(1 - a1) * 16}px)` });
  const a2 = inv(1.0, 1.3, lb);
  css(s.sub, { opacity: a2, transform: `translateY(${(1 - eOut(a2)) * 30}px)` });
  [...s.chips.children].forEach((c, i) => { const a = inv(1.5 + i * 0.25, 1.75 + i * 0.25, lb); css(c, { opacity: a, transform: `scale(${eBack(a)})` }); });
  const a4 = inv(2.4, 2.8, lb);
  css(s.foot, { opacity: a4 });
  return { mode: 'full', shot, flash: lb < 0.5 ? ['#fff', 0.5 * pulse(lb * B, 9)] : null };
});

// ---------- 小方块插入镜头（每小节第一拍、混剪的反拍） ----------
const INSERTS = [];
[4, 5, 6, 7, 8, 9].forEach((k) => INSERTS.push([bs(k), k === 4 ? GREEN : BLUE]));
INSERTS.push([bs(5) + B, BLUE]);
[0.5, 1.5, 2.5, 3.5].forEach((b) => INSERTS.push([bs(10) + b * B, BLUE]));
INSERTS.sort((a, b) => a[0] - b[0]);
const ANGLES = [
  { pos: [5.2, 1.6, 6.0], target: [0, -0.1, -0.3], fov: 26 },
  { pos: [1.4, 8.0, 4.2], target: [0, -0.2, -0.6], fov: 26 },
  { pos: [-6.0, 1.9, 2.6], target: [0, -0.1, -0.9], fov: 26 },
  { pos: [0.3, 1.3, 8.2], target: [0, -0.05, -0.4], fov: 24 },
  { pos: [-5.2, 3.4, 5.0], target: [0, -0.2, -0.2], fov: 26 },
  { pos: [3.6, 2.2, 4.0], target: [0.2, -0.1, 0.0], fov: 26 },
];
function insertAt(t) {
  for (let i = 0; i < INSERTS.length; i++) {
    const [t0, col] = INSERTS[i];
    if (t >= t0 && t < t0 + B / 2) return { i, lt: t - t0, col };
  }
  return null;
}
function insertShot({ i, lt, col }) {
  const a = ANGLES[i % ANGLES.length];
  const k = 1.55 * (1 - 0.06 * (lt / (B / 2)));
  return {
    cam: { pos: a.pos.map((v, j) => a.target[j] + (v - a.target[j]) * k), target: a.target, fov: a.fov, roll: (i % 2 ? 1 : -1) * 0.04 },
    cubes: [{ rotY: 0.2 + i * 0.7, led: { color: col, int: 1.1 + 2.6 * pulse(lt, 11) }, pulse: lt / (B / 2) * 0.5, pulseColor: col, pulseInt: 5 }],
    exposure: 1.0, bloom: 1.0,
  };
}

// ---------- 颗粒 ----------
const gctx = grain.getContext('2d');
const gimg = gctx.createImageData(540, 960);
function drawGrain(frame) {
  const r = rng(frame * 31 + 5);
  const d = gimg.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.floor(r() * 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  gctx.putImageData(gimg, 0, 0);
}

// ---------- 设备屏幕（贴到 Blender 底片里的笔记本 / 手机屏幕上） ----------
const MODE = new URLSearchParams(location.search).get('mode') || 'full';
const deskEl = $('div', 'abs', document.body);
deskEl.id = 'desk';
const phoneEl = $('div', 'abs', document.body);
phoneEl.id = 'phonescr';

const DESK = {};
(() => {
  const d = deskEl;
  DESK.wall = $('div', 'wall', d);
  DESK.menubar = $('div', 'menubar', d, '<span>访达</span><span style="font-weight:500">文件</span><span style="font-weight:500">编辑</span><span style="font-weight:500">显示</span><span class="r">21:47</span>');
  DESK.claude = $('div', 'win claude', d, `<div class="bar"><i></i><i></i><i></i><div class="ttl"><span class="dot c"></span>Claude</div></div>
    <div class="body"><div class="msg">好的，我来重构这个模块，并补上测试：</div><div class="code"></div></div>`);
  DESK.codex = $('div', 'win codex', d, `<div class="bar"><i></i><i></i><i></i><div class="ttl" style="color:#9fb3c6"><span class="dot x"></span>Codex</div></div><div class="body"></div>`);
  css(DESK.claude, { left: '90px', top: '120px', width: '690px', height: '640px' });
  css(DESK.codex, { left: '820px', top: '120px', width: '690px', height: '640px' });
  DESK.code = DESK.claude.querySelector('.code');
  DESK.cbody = DESK.codex.querySelector('.body');
  DESK.dock = $('div', 'dock', d, ['wx', 'xhs', 'globe', 'folder', 'grid', 'term'].map((k) => `<div class="d" style="background:${ICONS[k].bg}"><div style="transform:scale(.62)">${ICONS[k].g}</div></div>`).join(''));
  DESK.dockIcons = [...DESK.dock.children];
  DESK.cursor = $('div', 'cursor', d, SVG.cursor);
  DESK.ripple = $('div', 'ripple', d);
  DESK.lock = $('div', 'dlock', d, `<div class="dt">10月27日 星期二</div><div class="tm">21:47</div><div class="av"></div><div class="nm">我的 MacBook</div>
    <div class="pw"><span class="pd"></span><span class="pd"></span><span class="pd"></span><span class="pd"></span><div class="go">→</div></div><div class="hint">输入密码</div>`);
  DESK.pds = [...DESK.lock.querySelectorAll('.pd')];
  DESK.tm = DESK.lock.querySelector('.tm');
  DESK.black = $('div', 'abs', d);
  css(DESK.black, { inset: '0', background: '#000' });
})();
const CODE_SRC = [
  'export async function sendKeys(keys) {',
  '  const dev = await hid.open(VID, PID);',
  '  for (const k of keys) {',
  '    await dev.write(encode(k));',
  '  }',
  '  return dev.close();',
  '}',
].join('\n');
const CODEX_LINES = [
  '<span class="p">›</span> 重构 hid_bridge，并补全测试',
  '<span class="d">• 读取 src/bridge.ts</span>',
  '<span class="d">• 修改 3 个文件</span>',
  '<span class="g">+ export function sendKeys(keys)</span>',
  '<span class="r">- function legacyWrite()</span>',
  '<span class="g">+ test("按顺序写入按键")</span>',
  '<span class="g">✓ 42 项测试通过</span>',
];
const hlCode = (src) => esc(src)
  .replace(/\b(export|async|function|const|for|of|await|return)\b/g, '<span class="k">$1</span>')
  .replace(/\b(sendKeys|open|write|encode|close)\b/g, '<span class="f">$1</span>')
  .replace(/\b(VID|PID)\b/g, '<span class="n">$1</span>');

function updateDesk(t) {
  const D = DESK;
  const bar = Math.floor(t / BAR) + 1;
  const lb = (t - bs(bar)) / B;
  [D.claude, D.codex, D.cursor, D.ripple, D.lock, D.black].forEach((e) => show(e, false));
  css(D.wall, { filter: '', transform: '' });
  show(D.menubar, true); show(D.dock, true);
  D.dockIcons.forEach((e) => css(e, { filter: '', transform: '' }));
  const lockState = (dots, time, dim) => {
    show(D.lock, true);
    D.tm.textContent = time;
    D.pds.forEach((p, i) => css(p, { opacity: i < dots ? 1 : 0 }));
    css(D.wall, { filter: `blur(24px) brightness(${0.75 * dim})`, transform: 'scale(1.1)' });
    css(D.lock, { opacity: dim, transform: '' });
    show(D.menubar, false); show(D.dock, false);
  };
  if (t < bs(3)) {
    show(D.claude, true); show(D.codex, true);
    const n = Math.floor(CODE_SRC.length * eIO(inv(0.1, 1.75, t)));
    D.code.innerHTML = hlCode(CODE_SRC.slice(0, n)) + (t < 1.85 ? '<span class="caret" style="color:#e7956e"></span>' : '');
    const shown = Math.min(CODEX_LINES.length, Math.floor(inv(0.15, 1.7, t) * CODEX_LINES.length) + (t > 0.15 ? 1 : 0));
    D.cbody.innerHTML = CODEX_LINES.slice(0, shown).map((l) => `<div class="ln">${l}</div>`).join('');
    const wall = inv(bs(2) + 0.3, bs(2) + 0.8, t);
    const bump = t > bs(2) + 3 * B ? pulse(t - (bs(2) + 3.0 * B), 8) : 0;
    D.claude.style.boxShadow = `0 40px 100px rgba(0,0,0,.6), 0 0 0 ${2 + bump * 5}px rgba(120,255,200,${0.1 + wall * 0.35 + bump * 0.6})`;
    D.codex.style.boxShadow = `0 40px 100px rgba(0,0,0,.6), 0 0 0 2px rgba(120,255,200,${0.1 + wall * 0.35})`;
    D.dockIcons.slice(0, 4).forEach((e, i) => {
      const dimT = bs(2) + (1 + i * 0.5) * B;
      const dim = eOut(inv(dimT, dimT + 0.12, t));
      css(e, { filter: `grayscale(${dim}) brightness(${lerp(1, 0.4, dim)})`, transform: `scale(${lerp(1, 0.88, dim)})` });
    });
    const c0 = bs(2) + 2.0 * B, hit = bs(2) + 3.0 * B;
    if (t > c0) {
      let cx = lerp(560, 752, eIn(inv(c0, hit, t)));
      if (t > hit) cx = lerp(752, 640, eOut(inv(hit, hit + 0.35, t)));
      show(D.cursor, true);
      css(D.cursor, { left: `${cx}px`, top: '470px' });
      const rp = inv(hit, hit + 0.35, t);
      if (t > hit && rp < 1) { show(D.ripple, true); css(D.ripple, { left: '780px', top: '500px', transform: `scale(${0.3 + rp * 1.4})`, opacity: 1 - rp }); }
    }
    const dark = inv(bs(3) - 0.5 * B, bs(3), t);
    deskEl.style.filter = `brightness(${1 - dark * 0.75})`;
    return;
  }
  deskEl.style.filter = '';
  if (bar === 4) { lockState(0, '21:47', 0.55); return; }
  if (bar === 5) {
    const DOTS = [0.5, 1.5, 2.0, 2.5];
    const dots = DOTS.filter((x) => lb >= x).length;
    const unlock = eIO(inv(3.0, 3.5, lb));
    lockState(dots, '21:47', 1);
    D.pds.forEach((p, i) => { const a = inv(DOTS[i], DOTS[i] + 0.08, lb); css(p, { opacity: a, transform: `scale(${eBack(a) * (1 + 0.5 * pulse((lb - DOTS[i]) * B, 12))})` }); });
    css(D.lock, { opacity: 1 - unlock, transform: `translateY(${-unlock * 100}px)` });
    css(D.wall, { filter: `blur(${(1 - unlock) * 24}px) brightness(${lerp(0.75, 1, unlock)})`, transform: `scale(${lerp(1.1, 1, unlock)})` });
    show(D.menubar, unlock > 0); show(D.dock, unlock > 0);
    css(D.menubar, { opacity: unlock }); css(D.dock, { opacity: unlock });
    return;
  }
  // 第 11 小节：锁屏后熄屏
  lockState(0, '21:53', 1);
  show(D.black, true);
  css(D.black, { opacity: eIn(inv(1.4, 2.0, lb)) });
}

const PH = {};
(() => {
  const p = phoneEl;
  PH.chat = $('div', 'pscr ph-chat', p, `<div class="island"></div>
    <div class="ph-status"><span>21:47</span><span>5G</span></div>
    <div class="ph-head"><span class="dot c"></span>Claude</div>
    <div class="ph-msgs"><div class="bub me" style="opacity:0">回下微信，再让 Codex 去小红书调研下桌宠</div></div>
    <div class="ph-input"><span class="txt"></span><span class="caret" style="color:var(--claude)"></span><span class="send">↑</span></div>`);
  PH.bub = PH.chat.querySelector('.bub');
  PH.txt = PH.chat.querySelector('.txt');
  PH.caret = PH.chat.querySelector('.ph-input .caret');
  PH.lock = $('div', 'pscr ph-lock', p, `<div class="island"></div><div class="tm">21:52</div><div class="dt">10月27日 星期二</div>
    <div class="notif"><div class="app"><b></b>微信 · 现在</div><div class="t1">文件传输助手</div><div class="t2">[文件] 桌宠调研.xlsx</div></div>`);
  PH.notif = PH.lock.querySelector('.notif');
})();
function updatePhone(t) {
  const bar = Math.floor(t / BAR) + 1;
  const lb = (t - bs(bar)) / B;
  show(PH.chat, bar <= 4); show(PH.lock, bar > 4);
  if (bar <= 4) {
    const MSG = [...'回下微信，再让 Codex 去小红书调研下桌宠'];
    const n = Math.floor(MSG.length * inv(0.55, 1.8, lb));
    const sent = lb >= 2.0;
    PH.txt.textContent = sent ? '' : MSG.slice(0, n).join('');
    PH.caret.style.opacity = sent ? 0 : 1;
    const ba = inv(2.0, 2.25, lb);
    css(PH.bub, { opacity: ba, transform: `translateY(${(1 - eOut(ba)) * 80}px) scale(${lerp(0.8, 1, eBack(ba))})` });
  } else {
    const na = inv(3.0, 3.18, lb);
    css(PH.notif, { opacity: na, transform: `translateY(${(1 - eOut(na)) * -60}px) scale(${lerp(0.9, 1, eBack(na))})` });
  }
}

// ---------- 入口 ----------
const stage = createStage(glCanvas, W, H);
window.DUR = DUR;
window.FPS = 30;
window.MODE = MODE;
const OVERLAY_SCENES = new Set([scenes[1], scenes[scenes.length - 1]]); // 第 3 小节的图标连线、片尾文字
document.body.dataset.mode = MODE;
if (MODE === 'ov') document.documentElement.style.background = 'transparent';
window.renderAt = async (t, frame = 0) => {
  if (MODE === 'desk') { updateDesk(t); await document.fonts.ready; return; }
  if (MODE === 'phone') { updatePhone(t); await document.fonts.ready; return; }
  let gl = null;
  let flash = null;
  for (const s of scenes) {
    let on = t >= s.range[0] && t < s.range[1];
    if (MODE === 'ov') {
      show(s.u, false);
      show(s.o, on && OVERLAY_SCENES.has(s));
      if (on && OVERLAY_SCENES.has(s)) s.update(s, t);
      continue;
    }
    show(s.u, on); show(s.o, on);
    if (on) {
      const r = s.update(s, t);
      if (r) { if (r.mode) gl = r; if (r.flash) flash = r.flash; }
    }
  }
  const ins = MODE === 'full' ? insertAt(t) : null;
  if (ins) {
    gl = { mode: 'full', shot: insertShot(ins) };
    for (const s of scenes) { show(s.u, false); show(s.o, false); }
    flash = ['#fff', 0.35 * pulse(ins.lt, 30)];
  }
  if (gl && MODE === 'full') {
    stage.render(gl.shot, t);
    glCanvas.style.display = '';
    glCanvas.style.mixBlendMode = gl.mode === 'screen' ? 'screen' : 'normal';
    const [dx, dy] = gl.offset || [0, 0];
    glCanvas.style.transform = `translate(${dx}px, ${dy}px)`;
  } else glCanvas.style.display = 'none';
  if (MODE === 'full' && flash && flash[1] > 0.001) css(flashEl, { background: flash[0], opacity: flash[1] });
  else flashEl.style.opacity = 0;
  if (MODE !== 'ui') { updateHud(t); updateCaption(t); }
  if (MODE === 'full') drawGrain(frame);
  await document.fonts.ready;
};

// 预加载所有字形，避免逐帧渲染时字体还没下载
(async () => {
  for (const s of scenes) { show(s.u, true); show(s.o, true); s.u.style.opacity = 0; s.o.style.opacity = 0; }
  const all = document.body.innerText + Object.values(CAPS).map((c) => c.l1 + c.l2).join('') + HUD.map((h) => h[2]).join('') + 'ClaudeCodex▸✓→' + CODE_SRC;
  const txt = all.replace(/<[^>]+>/g, '');
  await Promise.all([300, 400, 500, 700, 900].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, txt)));
  await Promise.all([400, 700].map((w) => document.fonts.load(`${w} 30px "JetBrains Mono"`, txt)));
  await document.fonts.ready;
  for (const s of scenes) { s.u.style.opacity = ''; s.o.style.opacity = ''; }
  window.ready = true;
})();
