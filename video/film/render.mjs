// 逐帧渲染：node render.mjs [--stills t1,t2,...] [--from F --to F] [--workers N]
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
const root = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.join(root, args.stills ? 'frames/stills' : 'frames/seq');
fs.mkdirSync(outDir, { recursive: true });

const server = await serve(root);
const url = `http://127.0.0.1:${server.address().port}/src/index.html`;
const browsers = [];
async function openPage() {
  // 每个 worker 一个独立浏览器：GPU 进程各自独立，才能并行
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror:', e.message));
  await page.goto(url);
  await page.waitForFunction('window.ready === true', null, { timeout: 120000 });
  return page;
}
async function shoot(page, t, frame, file) {
  await page.evaluate(([tt, ff]) => window.renderAt(tt, ff), [t, frame]);
  await page.screenshot({ path: file, type: 'png' });
}

if (args.stills) {
  const page = await openPage();
  const times = String(args.stills).split(',').map(Number);
  for (const t of times) await shoot(page, t, Math.round(t * 30), path.join(outDir, `t_${t.toFixed(3)}.png`));
  console.log(`stills: ${times.length}`);
} else {
  const pageInfo = await openPage();
  const { DUR, FPS } = await pageInfo.evaluate(() => ({ DUR: window.DUR, FPS: window.FPS }));
  await pageInfo.close();
  const total = Math.round(DUR * FPS);
  const from = Number(args.from ?? 0), to = Number(args.to ?? total);
  const workers = Number(args.workers ?? 3);
  let next = from, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async () => {
    const page = await openPage();
    while (next < to) {
      const f = next++;
      const file = path.join(outDir, `f_${String(f).padStart(5, '0')}.png`);
      if (args.resume && fs.existsSync(file)) continue;
      await shoot(page, f / FPS, f, file);
      if (++done % 30 === 0) console.log(`${done}/${to - from} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await page.close();
  }));
  console.log(`done ${done} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await Promise.all(browsers.map((b) => b.close()));
server.close();
