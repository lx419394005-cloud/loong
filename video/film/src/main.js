// 小方块演绎视频的网页层：每一帧由 renderAt(t) 从时间直接算出。
// 时间轴来自 ../timeline.json，按“段落 + 段内拍数”组织。四种模式（?mode=）：
//   ui    全屏界面（微信、小红书、报告、混剪、完成）
//   ov    透明叠加层（字幕、Agent 浮窗、亮灯时的图标连线、片尾文字）
//   desk  笔记本屏幕内容（1600×1000），合成时按透视贴进 Blender 底片
//   phone 手机屏幕内容（390×844 @2x）
import { lerp, inv, eOut, eIn, eIO, eBack, pulse, $, css, show, rng, esc, SVG, ICONS, icon, avBg, petArt } from './assets.js';

const TL = await (await fetch('/timeline.json')).json();
const B = 60 / TL.bpm;
const SEC = {};
{
  let acc = 0;
  for (const [name, beats] of TL.sections) { SEC[name] = { t0: acc * B, t1: (acc + beats) * B, beats }; acc += beats; }
  SEC.end.t1 += TL.tail;
}
const DUR = SEC.end.t1;
const ORDER = TL.sections.map((s) => s[0]);
const secAt = (t) => ORDER.find((n) => t < SEC[n].t1) || 'end';
const lbOf = (name, t) => (t - SEC[name].t0) / B;
const at = (name, beat) => SEC[name].t0 + beat * B;

const MODE = new URLSearchParams(location.search).get('mode') || 'ui';
document.body.dataset.mode = MODE;
if (MODE === 'ov') document.documentElement.style.background = 'transparent';

const ui = document.getElementById('ui');
const ovl = document.getElementById('ovl');
const hudEl = document.getElementById('hud');
const capEl = document.getElementById('cap');
const capBg = document.getElementById('capbg');
const deskEl = document.getElementById('desk');
const phoneEl = document.getElementById('phonescr');

const MY_AV = 'radial-gradient(circle at 35% 30%, #7af5d0, #1d7f72 70%)';
const DOCK = (keys) => keys.map((k) => `<div class="d" style="background:${ICONS[k].bg}"><div style="transform:scale(.62)">${ICONS[k].g}</div></div>`).join('');

// ================= 字幕（每段一行） =================
const C = (s) => `<em style="color:var(--claude)">${s}</em>`;
const X = (s) => `<em style="color:var(--codex)">${s}</em>`;
const G = (s) => `<em style="color:var(--green)">${s}</em>`;
const R = (s) => `<em style="color:var(--red)">${s}</em>`;
// [段落, 出现拍, 文字, 大字, 持续到哪一段结束]
const CAPS = [
  ['intro1', 0.15, `${C('Claude')} 和 ${X('Codex')} 很能干`],
  ['intro2', 0.2, `如果它们能${G('走出对话框')}？`],
  ['reveal', 1.0, G('小方块'), true],
  ['command', 0.6, '人在外面，发一句话'],
  ['unlock', 4.0, G('远程解锁'), true],
  ['wechat', 0.6, `替你${G('回微信')}`],
  ['xhs', 0.6, `替你刷${R('小红书')}做调研`],
  ['report', 0.6, `报告写好，${G('发回手机')}`, false, 'notify'],
  ['montage', 0.0, `${C('Claude')}、${X('Codex')} 都能用`],
  ['done', 1.0, '干完，自动锁屏'],
];
let capKey = null;
function updateCaption(t) {
  let c = null;
  for (const cc of CAPS) if (t >= at(cc[0], cc[1]) && t < SEC[cc[4] || cc[0]].t1) c = cc;
  if (!c) { capEl.style.opacity = 0; capBg.style.opacity = 0; return; }
  if (capKey !== c) { capEl.innerHTML = c[2]; capEl.classList.toggle('big', !!c[3]); capKey = c; }
  const dt = t - at(c[0], c[1]);
  const end = SEC[c[4] || c[0]].t1;
  const a = inv(0, 0.16, dt);
  const out = 1 - inv(end - 0.06, end, t);
  const s = c[3] ? lerp(1.4, 1, eBack(inv(0, 0.28, dt))) : lerp(0.92, 1, eOut(a));
  css(capEl, { opacity: Math.min(a * 1.6, 1) * out, transform: `translateY(${(1 - eOut(a)) * 24}px) scale(${s})`, filter: `blur(${(1 - a) * 8}px)` });
  capBg.style.opacity = a * out;
}

// ================= Agent 浮窗（只留当前一条） =================
const HUD = [
  ['command', 3.0, 'c', '收到'],
  ['unlock', 0.3, 'c', '输入密码'],
  ['unlock', 4.0, 'c', '解锁'],
  ['wechat', 0.6, 'c', '回复微信'],
  ['xhs', 0.6, 'x', '搜索「桌宠」'],
  ['xhs', 4.6, 'x', '读取评论'],
  ['report', 0.6, 'x', '整理报告'],
  ['report', 2.3, 'c', '发送 → 文件传输助手'],
  ['montage', 0, 'c', '回复消息'],
  ['montage', 1, 'x', '读取笔记'],
  ['montage', 2, 'c', '填写表格'],
  ['montage', 3, 'x', '点击「允许」'],
  ['montage', 4, 'c', '批量改名'],
  ['montage', 5, 'x', '搜索资料'],
  ['done', 0.6, 'c', '锁屏'],
  ['end', 0.0, 'c', '搞定 ✓'],
].map(([s, b, a, txt]) => [at(s, b), a, txt]);
const AGENT = { c: ['Claude', 'var(--claude)', 'rgba(224,135,95,0.7)'], x: ['Codex', 'var(--codex)', 'rgba(159,214,255,0.7)'] };
const hudLine = $('div', 'hl', hudEl);
function updateHud(t) {
  let ev = null;
  for (const e of HUD) if (e[0] <= t) ev = e;
  const fade = 1 - inv(at('end', 1.0), at('end', 1.4), t);
  if (!ev || fade <= 0) { hudEl.style.opacity = 0; return; }
  hudEl.style.opacity = fade;
  const dt = t - ev[0];
  const [name, color, border] = AGENT[ev[1]];
  const txt = [...ev[2]].slice(0, Math.floor(dt * 70) + 1).join('');
  hudLine.innerHTML = `<span class="dot ${ev[1]}"></span><span class="ag" style="color:${color}">${name}</span> <span style="opacity:.6">▸</span> ${esc(txt)}`;
  hudLine.style.borderColor = border;
  const a = eOut(inv(0, 0.12, dt));
  css(hudLine, { opacity: a, transform: `translateY(${(1 - a) * 14}px) scale(${1 + 0.05 * pulse(dt, 14)})` });
}

// ================= 叠加层：亮灯时的图标连线、片尾文字 =================
const OV = {};
{
  OV.reveal = $('div', 'abs', ovl);
  css(OV.reveal, { inset: '0' });
  OV.iconPos = [[100, 420], [830, 420], [60, 1130], [870, 1130], [465, 280], [465, 1250]];
  OV.reveal.innerHTML = `<svg width="1080" height="1920" style="position:absolute;left:0;top:0">${OV.iconPos.map((_, i) =>
    `<line id="ln${i}" x1="540" y1="960" x2="540" y2="960" stroke="#3dff8f" stroke-width="4" stroke-linecap="round" style="filter:drop-shadow(0 0 8px #3dff8f)"/>`).join('')}</svg>`;
  OV.lines = OV.iconPos.map((_, i) => OV.reveal.querySelector(`#ln${i}`));
  OV.icons = ['wx', 'xhs', 'lock', 'folder', 'globe', 'grid'].map((k) => icon(OV.reveal, k));
  OV.end = $('div', 'abs', ovl);
  css(OV.end, { inset: '0' });
  OV.title = $('div', 'end-title', OV.end, '<div class="big">小方块</div><div class="sub">给 AI 一双真的手</div>');
  OV.big = OV.title.querySelector('.big');
  OV.sub = OV.title.querySelector('.sub');
  OV.chips = $('div', 'end-chips', OV.end, '<div>插上 USB</div><div>免驱</div><div>不用开权限</div>');
  OV.foot = $('div', 'end-foot', OV.end, '可接入 <b style="color:var(--claude)">Claude</b> / <b style="color:var(--codex)">Codex</b>');
}
function updateOverlay(t) {
  const sec = secAt(t);
  show(OV.reveal, sec === 'reveal');
  show(OV.end, sec === 'end');
  if (sec === 'reveal') {
    const lt = t - SEC.reveal.t0;
    const ig = B;
    OV.icons.forEach((e, i) => {
      const t0 = ig + 0.06 + i * (B / 4);
      const a = inv(t0, t0 + 0.2, lt);
      const [x, y] = OV.iconPos[i];
      const drift = Math.sin(lt * 1.3 + i) * 6;
      css(e, { left: `${x}px`, top: `${y + drift}px`, opacity: a, transform: `scale(${lerp(0.85, 1, eBack(a))})`, filter: `drop-shadow(0 0 ${a * 30}px rgba(61,255,143,${a * 0.8}))` });
      const lp = eOut(inv(t0 - 0.05, t0 + 0.15, lt));
      OV.lines[i].setAttribute('x2', lerp(540, x + 75, lp));
      OV.lines[i].setAttribute('y2', lerp(960, y + 75 + drift, lp));
      OV.lines[i].setAttribute('opacity', lp * 0.75);
    });
  }
  if (sec === 'end') {
    const lb = lbOf('end', t);
    const a1 = inv(0.5, 0.9, lb);
    css(OV.big, { opacity: a1, transform: `scale(${lerp(1.3, 1, eOut(a1))})`, filter: `blur(${(1 - a1) * 16}px)` });
    const a2 = inv(1.0, 1.3, lb);
    css(OV.sub, { opacity: a2, transform: `translateY(${(1 - eOut(a2)) * 30}px)` });
    [...OV.chips.children].forEach((c, i) => { const a = inv(1.5 + i * 0.25, 1.75 + i * 0.25, lb); css(c, { opacity: a, transform: `scale(${eBack(a)})` }); });
    css(OV.foot, { opacity: inv(2.4, 2.8, lb) });
  }
}

// ================= 全屏界面 =================
const U = {};
const LIST = [
  { n: '小王', pv: '周报呢？', bd: 1, av: 0 },
  { n: '文件传输助手', pv: '[文件] 方案.pdf', av: 6 },
  { n: '家人群', pv: '[图片]', av: 3 },
  { n: '项目群', pv: '收到', av: 4 },
  { n: '订阅号', pv: '……', av: 7 },
];
function wxWindow(parent) {
  const w = $('div', 'win wx', parent, `<div class="side"><b></b><b></b><b></b><b></b></div>
    <div class="list">${LIST.map((it) => `<div class="it"><div class="av" style="background:${avBg(it.av)}"></div><div class="tx"><div class="n">${it.n}</div><div class="pv">${it.pv}</div></div>${it.bd ? '<div class="bd">1</div>' : ''}</div>`).join('')}</div>
    <div class="main"><div class="hd"></div><div class="msgs">
      <div class="row in"><div class="av" style="background:${avBg(0)}"></div><div class="bb">周报呢？</div></div>
      <div class="row out"><div class="av" style="background:${MY_AV}"></div><div class="bb">晚上 8 点前发你</div></div>
      <div class="row out"><div class="av" style="background:${MY_AV}"></div><div class="file"><div class="tx" style="flex:1"><div class="fn">桌宠调研.xlsx</div><div class="fs">24 KB</div></div><div class="fi">XLS</div></div></div></div>
      <div class="inp"><div class="tools"><b></b><b></b><b></b></div><span class="txt"></span><span class="caret" style="color:#07c160"></span><div class="snd">发送(S)</div></div>
      <div class="empty"><b></b></div></div>`);
  w.insertAdjacentHTML('afterbegin', '<div class="bar" style="position:absolute;left:0;right:0;top:0;z-index:2;background:transparent"><i></i><i></i><i></i></div>');
  css(w, { left: '50px', top: '250px', width: '980px', height: '1130px' });
  const rows = w.querySelectorAll('.msgs .row');
  return { w, hd: w.querySelector('.hd'), items: [...w.querySelectorAll('.it')], badge: w.querySelector('.bd'), rowIn: rows[0], rowOut: rows[1], rowFile: rows[2], txt: w.querySelector('.inp .txt'), caret: w.querySelector('.inp .caret'), empty: w.querySelector('.empty') };
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
  const note = $('div', 'note', w, `${petArt(1, 980, 520)}
    <div class="nt">我的桌面住进了一只小怪兽</div>
    <div class="nb">做了三个月，终于会动了……</div>
    <div class="st"><span>${SVG.heart} 3.2万</span><span>${SVG.star} 1.1万</span><span>${SVG.bubble} 2316</span></div>
    ${['好可爱，求链接', '这个会动吗？', '想要同款！', '蹲第二批'].map((c, i) => `<div class="cm"><div class="a" style="background:${avBg(i + 2)}"></div><div><div class="u">用户***</div><div class="c">${c}</div></div></div>`).join('')}`);
  const scan = $('div', 'scan', w, '<div class="tg">Codex 读取中</div>');
  return { w, txt: w.querySelector('.sb .txt'), caret: w.querySelector('.sb .caret'), feed: w.querySelector('.feed'), note, scan };
}
{
  U.wall = $('div', 'wall', ui);
  U.menubar = $('div', 'menubar', ui, '<span>访达</span><span style="font-weight:500">文件</span><span style="font-weight:500">编辑</span><span style="font-weight:500">显示</span><span class="r">21:48</span>');
  U.dock = $('div', 'dock', ui, DOCK(['wx', 'xhs', 'globe', 'folder', 'grid', 'term']));
  U.wx = wxWindow(ui);
  U.xhs = xhsWindow(ui);
  U.report = $('div', 'report', ui, `<div class="rh"><div class="t">桌宠爆款调研 · Top 10</div><div class="tag">by Codex</div></div>
    <div class="th"><div>笔记</div><div>点赞</div><div>关键词</div></div>
    ${[['我的桌面住进了一只小怪兽', '3.2万', '可爱 / 会动'], ['会眨眼的电子宠物，治愈了', '1.8万', '表情 / 陪伴'], ['打工人桌搭必备小东西', '9421', '桌搭 / 氛围灯'], ['给桌宠接上 AI 之后…', '6035', 'AI / 互动']]
      .map(([a, b, c]) => `<div class="tr"><div>${a}</div><div class="lk">${b}</div><div class="kw">${c}</div></div>`).join('')}
    <div class="cc">结论：<em>可爱外形</em> + <em>会动</em> + <em>能互动</em> = 爆款</div>`);
  U.rows = [...U.report.querySelectorAll('.tr')];
  U.concl = U.report.querySelector('.cc');
  U.file = $('div', 'fileicon', ui, '<div class="fi">XLS</div><div class="fn">桌宠调研.xlsx</div>');

  // 混剪：6 个小片段，Claude / Codex 轮流
  const sn0 = $('div', 'win wx', ui, `<div class="main" style="flex:1"><div class="hd" style="margin-top:62px">项目群</div><div class="msgs">
     <div class="row in"><div class="av" style="background:${avBg(4)}"></div><div class="bb">明早的会改到 10 点</div></div>
     <div class="row out"><div class="av" style="background:${MY_AV}"></div><div class="bb">收到，已更新日程</div></div></div></div>`);
  sn0.insertAdjacentHTML('afterbegin', '<div class="bar" style="position:absolute;left:0;right:0;top:0;z-index:2"><i></i><i></i><i></i><div class="ttl" style="color:#333">微信</div></div>');
  const sn1 = $('div', 'win xhs', ui, `<div class="bar" style="background:#fff"><i></i><i></i><i></i><div class="ttl" style="color:#333">小红书</div></div>
     <div class="note">${petArt(2, 900, 600)}<div class="nt">会眨眼的电子宠物，治愈了</div><div class="st"><span>${SVG.heart} 1.8万</span><span>${SVG.star} 6230</span><span>${SVG.bubble} 984</span></div></div>
     <div class="scan" style="left:20px;top:730px;width:860px;height:150px"><div class="tg">Codex 读取中</div></div>`);
  const cells = [];
  const head = ['', '渠道', '曝光', '点赞', '转化'];
  for (let rr = 0; rr < 11; rr++) for (let cc = 0; cc < 5; cc++) {
    if (rr === 0) cells.push(`<div class="h">${head[cc]}</div>`);
    else if (cc === 0) cells.push(`<div class="h">${rr}</div>`);
    else cells.push(`<div data-k="${rr * 5 + cc}"></div>`);
  }
  const sn2 = $('div', 'win sheet', ui, `<div class="bar" style="background:#1f9d55;color:#fff"><i></i><i></i><i></i><div class="ttl">周报.xlsx</div></div><div class="grid">${cells.join('')}</div>`);
  U.sheetCells = [...sn2.querySelectorAll('[data-k]')];
  const sn3 = $('div', 'abs', ui, `<div class="alert"><div class="ai">&gt;_</div><div class="at">“终端”想访问“文稿”文件夹中的文件</div><div class="ad">需要访问以保存调研报告</div><div class="ab"><div>不允许</div><div class="ok">允许</div></div></div>`);
  css(sn3, { inset: '0' });
  U.okBtn = sn3.querySelector('.ok');
  const FILES = [['IMG_2041.jpg', '桌宠-01.jpg'], ['IMG_2042.jpg', '桌宠-02.jpg'], ['IMG_2047.jpg', '桌宠-03.jpg'], ['截屏 10.21.png', '桌宠-04.png'], ['IMG_2050.jpg', '桌宠-05.jpg'], ['未命名 2.png', '桌宠-06.png'], ['IMG_2053.jpg', '桌宠-07.jpg']];
  const sn4 = $('div', 'win finder', ui, `<div class="bar" style="background:#ececec"><i></i><i></i><i></i><div class="ttl" style="color:#333">素材</div></div>
     <div class="flist">${FILES.map(([a, b], i) => `<div class="fr"><span class="fic" style="background:${avBg(i + 1)}"></span><span class="fa">${a}</span><span class="fb">${b}</span></div>`).join('')}</div>`);
  U.fileRows = [...sn4.querySelectorAll('.fr')];
  const sn5 = $('div', 'win browser', ui, `<div class="bar" style="background:#e9eef3"><i></i><i></i><i></i><div class="url">esp32 USB HID 键盘 教程</div></div>
     <div class="res">${['ESP32-S3 做 USB 键盘鼠标：完整教程', 'TinyUSB HID 报告描述符详解', '让 AI 通过硬件操作电脑的几种方案', '开源桌面小硬件合集 2026', 'HID 键盘延迟实测'].map((r) => `<div class="rr"><div class="rt">${r}</div><div class="rl"></div><div class="rl s"></div></div>`).join('')}</div>`);
  U.results = [...sn5.querySelectorAll('.rr')];
  U.snips = [sn0, sn1, sn2, sn3, sn4, sn5];
  U.snips.forEach((e, i) => { if (i !== 3) css(e, { left: '90px', top: '300px', width: '900px', height: '1000px' }); });

  U.toast = $('div', 'toast', ui, '<div class="ck">✓</div><div class="tt">全部完成</div><div class="ts">微信已回复 · 调研报告已发回</div>');
  U.lock = $('div', 'lock', ui, `<div class="dt">10月27日 星期二</div><div class="tm">21:53</div><div class="av"></div><div class="nm">我的 MacBook</div>
    <div class="pw"><div class="go">→</div></div><div class="hint">输入密码</div>`);
  U.cursor = $('div', 'cursor', ui, SVG.cursor);
  U.ripple = $('div', 'ripple', ui);
  U.ripple.style.borderColor = 'rgba(30,30,30,.8)';
}
function updateUI(t) {
  const sec = secAt(t);
  const lb = lbOf(sec, t);
  const all = [U.wx.w, U.xhs.w, U.xhs.note, U.xhs.scan, U.report, U.file, U.toast, U.lock, U.cursor, U.ripple, ...U.snips];
  all.forEach((e) => show(e, false));
  css(U.wall, { filter: '', transform: '' });
  const cursorAt = (x, y) => { show(U.cursor, true); css(U.cursor, { left: `${x}px`, top: `${y}px` }); };
  const rippleAt = (x, y, p) => { if (p <= 0 || p >= 1) return; show(U.ripple, true); css(U.ripple, { left: `${x}px`, top: `${y}px`, transform: `scale(${0.3 + p})`, opacity: 1 - p }); };
  const W = U.wx;

  if (sec === 'wechat') {
    // 点开小王 → 收到“周报呢？” → 自己打字回复 → 发送，最后停一会儿
    show(W.w, true);
    css(W.w, { transform: `scale(${lerp(0.92, 1, eBack(inv(0.5, 0.8, lb)))})`, opacity: inv(0.5, 0.62, lb), filter: '' });
    const opened = lb >= 1.5;
    W.hd.textContent = '小王';
    show(W.empty, !opened);
    W.items.forEach((it, i) => it.classList.toggle('sel', opened && i === 0));
    show(W.badge, !opened);
    const ai = inv(1.6, 1.8, lb);
    css(W.rowIn, { display: '', opacity: ai, transform: `scale(${eBack(ai)})` });
    const MSG = [...'晚上 8 点前发你'];
    const n = lb < 2.5 ? 0 : Math.min(MSG.length, Math.floor(MSG.length * inv(2.5, 5.0, lb)) + 1);
    const sent = lb >= 5.5;
    W.txt.textContent = opened && !sent ? MSG.slice(0, n).join('') : '';
    W.caret.style.opacity = opened && !sent ? 1 : 0;
    const ao = inv(5.5, 5.7, lb);
    css(W.rowOut, { display: '', opacity: ao, transform: `scale(${eBack(ao)})` });
    show(W.rowFile, false);
    if (lb > 0.7 && lb < 1.9) {
      const p = eIO(inv(0.7, 1.4, lb));
      cursorAt(lerp(760, 230, p), lerp(1100, 345, p));
      rippleAt(250, 375, inv(1.5, 1.85, lb));
    }
  } else if (sec === 'xhs') {
    // 搜“桌宠” → 信息流滚动 → 打开爆款笔记 → 逐条读评论
    const Xw = U.xhs;
    show(Xw.w, true);
    css(Xw.w, { transform: `scale(${lerp(0.94, 1, eBack(inv(0.5, 0.75, lb)))})`, opacity: inv(0.5, 0.62, lb), filter: '' });
    Xw.txt.textContent = [...'桌宠'].slice(0, lb < 0.9 ? 0 : lb < 1.2 ? 1 : 2).join('');
    Xw.caret.style.opacity = lb < 1.5 ? 1 : 0;
    const fa = inv(1.5, 1.8, lb);
    const sp = eIO(inv(1.8, 4.4, lb));
    const v = Math.sin(Math.PI * inv(1.8, 4.4, lb));
    css(Xw.feed, { opacity: fa, transform: `translateY(${(1 - eOut(fa)) * 120 - sp * 2300}px)`, filter: `blur(${v * 2}px)` });
    show(Xw.note, lb >= 4.6);
    css(Xw.note, { transform: `translateX(${(1 - eOut(inv(4.6, 4.9, lb))) * 980}px)` });
    const SC = [[5.2, 30, 732, 920, 92], [5.7, 30, 830, 920, 116], [6.2, 30, 946, 920, 116], [6.7, 30, 1062, 920, 116]];
    let cur = null;
    for (const s of SC) if (lb >= s[0]) cur = s;
    if (cur) {
      show(Xw.scan, true);
      const a = pulse((lb - cur[0]) * B, 14);
      css(Xw.scan, { left: `${cur[1]}px`, top: `${cur[2]}px`, width: `${cur[3]}px`, height: `${cur[4]}px`, transform: `scale(${1 + a * 0.04})` });
    }
  } else if (sec === 'report') {
    // 快：报告成形 → 缩成文件 → 发到文件传输助手
    show(W.w, lb >= 2.3);
    W.hd.textContent = '文件传输助手';
    show(W.empty, false);
    W.items.forEach((it, i) => it.classList.toggle('sel', i === 1));
    show(W.badge, false);
    css(W.rowIn, { display: 'none' }); css(W.rowOut, { display: 'none' });
    const fa = inv(2.9, 3.05, lb);
    css(W.rowFile, { display: '', opacity: fa, transform: `scale(${eBack(fa)})` });
    W.txt.textContent = ''; W.caret.style.opacity = 0;
    css(W.w, { opacity: inv(2.3, 2.45, lb), transform: '', filter: '' });
    if (lb < 2.3) {
      show(U.xhs.w, true); show(U.xhs.note, true);
      css(U.xhs.w, { opacity: 0.35, transform: 'scale(0.86)', filter: 'blur(8px)' });
      css(U.xhs.note, { transform: '' });
    }
    if (lb < 2.8) {
      show(U.report, true);
      const ra = eOut(inv(0.5, 0.75, lb));
      const shrink = eIO(inv(2.2, 2.75, lb));
      css(U.report, { opacity: ra * (1 - inv(2.55, 2.75, lb)), transform: `translate(${shrink * 150}px, ${shrink * 300}px) scale(${lerp(lerp(0.94, 1, ra), 0.15, shrink)})` });
      U.rows.forEach((r, i) => { const a = inv(0.8 + i * 0.25, 0.9 + i * 0.25, lb); css(r, { opacity: a, transform: `translateX(${(1 - eOut(a)) * -60}px)`, background: `rgba(159,214,255,${0.18 * pulse((lb - 0.8 - i * 0.25) * B, 8) * (a > 0 ? 1 : 0)})` }); });
      const ca = inv(1.8, 1.95, lb);
      css(U.concl, { opacity: ca, transform: `scale(${lerp(0.9, 1, eBack(ca))})` });
    }
    if (lb > 2.55 && lb < 3.0) {
      show(U.file, true);
      const p = eIO(inv(2.55, 2.95, lb));
      css(U.file, { left: `${lerp(470, 640, p)}px`, top: `${lerp(760, 620, p)}px`, transform: `scale(${lerp(1.3, 0.6, p)})`, opacity: 1 - inv(2.85, 3.0, lb) });
    }
  } else if (sec === 'montage') {
    const k = Math.min(5, Math.floor(lb));
    const e = U.snips[k];
    show(e, true);
    const lt = lb - k;
    css(e, { transform: `perspective(1800px) rotateY(${k % 2 ? 6 : -6}deg) scale(${lerp(1.1, 1, eOut(inv(0, 0.45, lt)))})` });
    if (k === 0) { const a = inv(0.1, 0.28, lt); css(e.querySelectorAll('.row')[1], { opacity: a, transform: `scale(${eBack(a)})` }); }
    if (k === 2) {
      const m = Math.floor(inv(0.0, 0.45, lt) * U.sheetCells.length);
      U.sheetCells.forEach((c, i) => { c.textContent = i < m ? ((i * 7919) % 9000 + 300).toLocaleString('en-US') : ''; c.classList.toggle('on', i === m - 1); });
    }
    if (k === 3) {
      const p = eIO(inv(0.0, 0.3, lt));
      cursorAt(lerp(820, 700, p), lerp(1250, 1035, p));
      U.okBtn.style.filter = lt > 0.3 ? 'brightness(1.25)' : '';
      rippleAt(720, 1050, inv(0.3, 0.5, lt));
    }
    if (k === 4) U.fileRows.forEach((r, i) => r.classList.toggle('done', lt > 0.05 + i * 0.05));
    if (k === 5) U.results.forEach((r, i) => css(r, { opacity: inv(0.05 + i * 0.06, 0.12 + i * 0.06, lt) }));
  } else if (sec === 'done') {
    show(U.toast, lb < 1.3);
    const ta = inv(0, 0.18, lb);
    css(U.toast, { opacity: ta * (1 - inv(1.0, 1.3, lb)), transform: `scale(${lerp(0.85, 1, eBack(ta))})` });
    const ld = eIO(inv(1.0, 1.4, lb));
    show(U.lock, lb >= 1.0);
    css(U.lock, { opacity: ld, transform: `translateY(${(1 - ld) * -200}px)` });
    css(U.wall, { filter: `blur(${ld * 28}px) brightness(${lerp(1, 0.7, ld)})`, transform: `scale(${lerp(1, 1.12, ld)})` });
    css(U.dock, { opacity: 1 - ld }); css(U.menubar, { opacity: 1 - ld });
  } else {
    css(U.dock, { opacity: 1 }); css(U.menubar, { opacity: 1 });
  }
}

// ================= 笔记本屏幕 =================
const D = {};
{
  D.wall = $('div', 'wall', deskEl);
  D.menubar = $('div', 'menubar', deskEl, '<span>访达</span><span style="font-weight:500">文件</span><span style="font-weight:500">编辑</span><span style="font-weight:500">显示</span><span class="r">21:47</span>');
  D.claude = $('div', 'win claude', deskEl, `<div class="bar"><i></i><i></i><i></i><div class="ttl"><span class="dot c"></span>Claude</div></div>
    <div class="body"><div class="msg">好的，我来重构这个模块，并补上测试：</div><div class="code"></div></div>`);
  D.codex = $('div', 'win codex', deskEl, `<div class="bar"><i></i><i></i><i></i><div class="ttl" style="color:#9fb3c6"><span class="dot x"></span>Codex</div></div><div class="body"></div>`);
  css(D.claude, { left: '90px', top: '130px', width: '690px', height: '520px' });
  css(D.codex, { left: '820px', top: '130px', width: '690px', height: '520px' });
  D.code = D.claude.querySelector('.code');
  D.cbody = D.codex.querySelector('.body');
  D.dock = $('div', 'dock', deskEl, DOCK(['wx', 'xhs', 'globe', 'folder', 'grid', 'term']));
  D.dockIcons = [...D.dock.children];
  D.cursor = $('div', 'cursor', deskEl, SVG.cursor);
  D.ripple = $('div', 'ripple', deskEl);
  D.lock = $('div', 'dlock', deskEl, `<div class="dt">10月27日 星期二</div><div class="tm">21:47</div><div class="av"></div><div class="nm">我的 MacBook</div>
    <div class="pw"><span class="pd"></span><span class="pd"></span><span class="pd"></span><span class="pd"></span><div class="go">→</div></div><div class="hint">输入密码</div>`);
  D.pw = D.lock.querySelector('.pw');
  D.pds = [...D.lock.querySelectorAll('.pd')];
  D.tm = D.lock.querySelector('.tm');
  D.hint = D.lock.querySelector('.hint');
  D.ok = $('div', 'dunlocked', deskEl, '<div class="ck">✓</div>');
  D.black = $('div', 'abs', deskEl);
  css(D.black, { inset: '0', background: '#000' });
}
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
// 解锁段：密码每拍一位，第 4 拍回车
const UNLOCK_DOTS = [0.5, 1.5, 2.5, 3.5];
const UNLOCK_ENTER = 4.0;

function updateDesk(t) {
  const sec = secAt(t);
  const lb = lbOf(sec, t);
  [D.claude, D.codex, D.cursor, D.ripple, D.lock, D.ok, D.black].forEach((e) => show(e, false));
  css(D.wall, { filter: '', transform: '' });
  show(D.menubar, true); show(D.dock, true);
  css(D.menubar, { opacity: 1 }); css(D.dock, { opacity: 1, transform: '' });
  D.dockIcons.forEach((e) => css(e, { filter: '', transform: '' }));
  deskEl.style.filter = '';
  const lockState = (time, dim) => {
    show(D.lock, true);
    D.tm.textContent = time;
    D.hint.textContent = '输入密码';
    D.pds.forEach((p) => css(p, { opacity: 0, transform: '' }));
    css(D.wall, { filter: `blur(24px) brightness(${0.75 * dim})`, transform: 'scale(1.1)' });
    css(D.lock, { opacity: dim, transform: '' });
    css(D.pw, { boxShadow: '' });
    show(D.menubar, false); show(D.dock, false);
  };
  if (sec === 'intro1' || sec === 'intro2') {
    const tt = t - SEC.intro1.t0;
    show(D.claude, true); show(D.codex, true);
    const n = Math.floor(CODE_SRC.length * eIO(inv(0.1, 1.75, tt)));
    D.code.innerHTML = hlCode(CODE_SRC.slice(0, n)) + (tt < 1.85 ? '<span class="caret" style="color:#e7956e"></span>' : '');
    const shown = Math.min(CODEX_LINES.length, Math.floor(inv(0.15, 1.7, tt) * CODEX_LINES.length) + (tt > 0.15 ? 1 : 0));
    D.cbody.innerHTML = CODEX_LINES.slice(0, shown).map((l) => `<div class="ln">${l}</div>`).join('');
    const i2 = SEC.intro2.t0;
    const wall = inv(i2 + 0.3, i2 + 0.8, t);
    const hit = at('intro2', 3.0);
    const bump = t > hit ? pulse(t - hit, 8) : 0;
    D.claude.style.boxShadow = `0 40px 100px rgba(0,0,0,.6), 0 0 0 ${2 + bump * 5}px rgba(120,255,200,${0.1 + wall * 0.35 + bump * 0.6})`;
    D.codex.style.boxShadow = `0 40px 100px rgba(0,0,0,.6), 0 0 0 2px rgba(120,255,200,${0.1 + wall * 0.35})`;
    D.dockIcons.slice(0, 4).forEach((e, i) => {
      const dimT = at('intro2', 1 + i * 0.5);
      const dim = eOut(inv(dimT, dimT + 0.12, t));
      css(e, { filter: `grayscale(${dim}) brightness(${lerp(1, 0.4, dim)})`, transform: `scale(${lerp(1, 0.88, dim)})` });
    });
    const c0 = at('intro2', 2.0);
    if (t > c0) {
      let cx = lerp(560, 752, eIn(inv(c0, hit, t)));
      if (t > hit) cx = lerp(752, 640, eOut(inv(hit, hit + 0.35, t)));
      show(D.cursor, true);
      css(D.cursor, { left: `${cx}px`, top: '420px' });
      const rp = inv(hit, hit + 0.35, t);
      if (t > hit && rp < 1) { show(D.ripple, true); css(D.ripple, { left: '780px', top: '450px', transform: `scale(${0.3 + rp * 1.4})`, opacity: 1 - rp }); }
    }
    const dark = inv(SEC.intro2.t1 - 0.5 * B, SEC.intro2.t1, t);
    deskEl.style.filter = `brightness(${1 - dark * 0.75})`;
    return;
  }
  if (sec === 'command') { lockState('21:47', 0.55); return; }
  if (sec === 'unlock') {
    lockState('21:47', 1);
    D.hint.textContent = lb < UNLOCK_ENTER ? 'Claude 正在输入密码…' : '输入密码';
    D.pds.forEach((p, i) => {
      const a = inv(UNLOCK_DOTS[i], UNLOCK_DOTS[i] + 0.08, lb);
      css(p, { opacity: a, transform: `scale(${eBack(a) * (1 + 0.6 * pulse((lb - UNLOCK_DOTS[i]) * B, 12))})` });
    });
    const keyHit = Math.max(...UNLOCK_DOTS.map((d) => (lb >= d ? pulse((lb - d) * B, 10) : 0)));
    css(D.pw, { boxShadow: `0 0 0 ${keyHit * 6}px rgba(61,255,143,${keyHit * 0.5}), 0 0 ${keyHit * 40}px rgba(61,255,143,${keyHit * 0.6})` });
    const unlock = eIO(inv(UNLOCK_ENTER, UNLOCK_ENTER + 0.6, lb));
    css(D.lock, { opacity: 1 - unlock, transform: `translateY(${-unlock * 120}px) scale(${1 + unlock * 0.06})` });
    css(D.wall, { filter: `blur(${(1 - unlock) * 24}px) brightness(${lerp(0.75, 1, unlock)})`, transform: `scale(${lerp(1.1, 1, unlock)})` });
    show(D.menubar, unlock > 0); show(D.dock, unlock > 0);
    css(D.menubar, { opacity: unlock }); css(D.dock, { opacity: unlock, transform: `translateX(-50%) translateY(${(1 - unlock) * 80}px)` });
    // 解锁后的绿色对勾，强调“已经打开”
    const okIn = inv(UNLOCK_ENTER + 0.3, UNLOCK_ENTER + 0.55, lb);
    const ok = okIn * (1 - inv(7.4, 7.9, lb));
    show(D.ok, ok > 0);
    css(D.ok, { opacity: ok, transform: `translate(-50%, -50%) scale(${lerp(0.6, 1, eBack(okIn))})` });
    return;
  }
  // done：锁屏后熄屏
  lockState('21:53', 1);
  show(D.black, true);
  css(D.black, { opacity: eIn(inv(1.4, 2.0, lb)) });
}

// ================= 手机屏幕 =================
const P = {};
{
  P.chat = $('div', 'pscr ph-chat', phoneEl, `<div class="island"></div>
    <div class="ph-status"><span>21:47</span><span>5G</span></div>
    <div class="ph-head"><span class="dot c"></span>Claude</div>
    <div class="ph-msgs"><div class="bub me" style="opacity:0">回下微信，再让 Codex 去小红书调研下桌宠</div></div>
    <div class="ph-input"><span class="txt"></span><span class="caret" style="color:var(--claude)"></span><span class="send">↑</span></div>`);
  P.bub = P.chat.querySelector('.bub');
  P.txt = P.chat.querySelector('.txt');
  P.caret = P.chat.querySelector('.ph-input .caret');
  P.lock = $('div', 'pscr ph-lock', phoneEl, `<div class="island"></div><div class="tm">21:52</div><div class="dt">10月27日 星期二</div>
    <div class="notif"><div class="app"><b></b>微信 · 现在</div><div class="t1">文件传输助手</div><div class="t2">[文件] 桌宠调研.xlsx</div></div>`);
  P.notif = P.lock.querySelector('.notif');
}
function updatePhone(t) {
  const sec = secAt(t);
  const lb = lbOf(sec, t);
  show(P.chat, sec === 'command'); show(P.lock, sec !== 'command');
  if (sec === 'command') {
    const MSG = [...'回下微信，再让 Codex 去小红书调研下桌宠'];
    const n = Math.floor(MSG.length * inv(0.6, 1.7, lb));
    const sent = lb >= 2.0;
    P.txt.textContent = sent ? '' : MSG.slice(0, n).join('');
    P.caret.style.opacity = sent ? 0 : 1;
    const ba = inv(2.0, 2.25, lb);
    css(P.bub, { opacity: ba, transform: `translateY(${(1 - eOut(ba)) * 80}px) scale(${lerp(0.8, 1, eBack(ba))})` });
  } else {
    const na = inv(0.3, 0.48, lb);
    css(P.notif, { opacity: na, transform: `translateY(${(1 - eOut(na)) * -60}px) scale(${lerp(0.9, 1, eBack(na))})` });
  }
}

// ================= 入口 =================
window.DUR = DUR;
window.FPS = TL.fps;
window.MODE = MODE;
window.renderAt = async (t) => {
  if (MODE === 'desk') updateDesk(t);
  else if (MODE === 'phone') updatePhone(t);
  else if (MODE === 'ui') updateUI(t);
  else { updateOverlay(t); updateHud(t); updateCaption(t); }
  await document.fonts.ready;
};

// 预加载所有字形，避免逐帧渲染时字体还没下载
(async () => {
  const txt = (document.body.textContent + CAPS.map((c) => c[2]).join('') + HUD.map((h) => h[2]).join('') + 'ClaudeCodex▸✓→' + CODE_SRC + 'Claude 正在输入密码…').replace(/<[^>]+>/g, '');
  await Promise.all([300, 400, 500, 700, 900].map((w) => document.fonts.load(`${w} 40px "Noto Sans SC"`, txt)));
  await Promise.all([400, 700].map((w) => document.fonts.load(`${w} 30px "JetBrains Mono"`, txt)));
  await document.fonts.ready;
  window.ready = true;
})();
