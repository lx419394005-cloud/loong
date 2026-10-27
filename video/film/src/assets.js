// 共用的图形素材和小工具


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

export { clamp, lerp, inv, eOut, eIn, eIO, eBack, pulse, $, css, show, rng, esc, SVG, ICONS, icon, AV, avBg, petArt };
