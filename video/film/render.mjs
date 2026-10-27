// 逐帧渲染网页层。
//   node render.mjs --mode full|ui|ov|desk|phone [--frames 0-120,300-340] [--workers N] [--resume]
//   node render.mjs --mode desk --stills 1.2,3.4      只出几张静帧检查
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')));
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const mode = args.mode || 'full';
const VIEW = {
  full: { width: 1080, height: 1920, dsf: 1 },
  ui: { width: 1080, height: 1920, dsf: 1 },
  ov: { width: 1080, height: 1920, dsf: 1 },
  desk: { width: 1600, height: 1000, dsf: 1 },
  phone: { width: 390, height: 844, dsf: 2 },
}[mode];
const root = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.join(root, 'frames', args.stills ? `${mode}-stills` : mode);
fs.mkdirSync(outDir, { recursive: true });

const server = await serve(root);
const url = `http://127.0.0.1:${server.address().port}/src/index.html?mode=${mode}`;
const browsers = [];
async function openPage() {
  // 每个 worker 一个独立浏览器：GPU 进程各自独立，才能并行
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: VIEW.width, height: VIEW.height }, deviceScaleFactor: VIEW.dsf });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(url);
  await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
  return page;
}
async function shoot(page, t, frame, file) {
  await page.evaluate(([tt, ff]) => window.renderAt(tt, ff), [t, frame]);
  await page.screenshot({ path: file, type: 'png', omitBackground: mode === 'ov', clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height } });
}
function parseFrames(spec, total) {
  if (!spec) return Array.from({ length: total }, (_, i) => i);
  const out = [];
  for (const part of String(spec).split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let f = a; f <= (b ?? a); f++) if (f < total) out.push(f);
  }
  return out;
}

if (args.stills) {
  const page = await openPage();
  const times = String(args.stills).split(',').map(Number);
  for (const t of times) await shoot(page, t, Math.round(t * 30), path.join(outDir, `t_${t.toFixed(3)}.png`));
  console.log(`stills: ${times.length}`);
} else {
  const probe = await openPage();
  const { DUR, FPS } = await probe.evaluate(() => ({ DUR: window.DUR, FPS: window.FPS }));
  const total = Math.round(DUR * FPS);
  const list = parseFrames(args.frames, total).filter((f) => !(args.resume && fs.existsSync(path.join(outDir, `f_${String(f).padStart(5, '0')}.png`))));
  const workers = Math.max(1, Math.min(Number(args.workers ?? 3), list.length));
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const page = w === 0 ? probe : await openPage();
    while (next < list.length) {
      const f = list[next++];
      await shoot(page, f / FPS, f, path.join(outDir, `f_${String(f).padStart(5, '0')}.png`));
      if (++done % 30 === 0) console.log(`${mode}: ${done}/${list.length} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }));
  console.log(`done ${mode} ${done} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await Promise.all(browsers.map((b) => b.close()));
server.close();
