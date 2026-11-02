// Staging tool: screenshots of the built game at desktop and phone sizes, plus the
// draw-call count and a SwiftShader frame count. Use it after touching the camera,
// a rig, or the lighting. Not a gate: test/render.mjs is the gate.
//
//   node tools/shots.mjs [url]

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const target = process.argv[2];
let srv = null;
let URL = target;
if (!URL) {
  srv = createServer(async (req, res) => {
    try { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile('dist/index.html')); }
    catch { res.writeHead(404).end('x'); }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  URL = `http://127.0.0.1:${srv.address().port}/`;
}

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];

async function open(viewport) {
  const p = await b.newPage(viewport);
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  return p;
}

// The referee's count is random, so wait for the grip rather than sleeping.
const toGrip = (p) => p.waitForFunction(() => window.__tentaclash?.phase() === 'fighting', null, { timeout: 10000 });

async function enter(p) {
  await p.click('#start');
  await p.waitForTimeout(700);
  await p.click('#arm-grid .arm-card >> nth=0');
  await toGrip(p);
}

const desk = await open({ viewport: { width: 1280, height: 720 } });
await desk.screenshot({ path: 'artifacts/x-menu.png' });
await enter(desk);
await desk.screenshot({ path: 'artifacts/x-play.png' });
await desk.keyboard.down('Space');
await desk.waitForTimeout(2500);
await desk.screenshot({ path: 'artifacts/x-press.png' });
await desk.keyboard.up('Space');

const stats = await desk.evaluate(async () => {
  const s = window.__tentaclash;
  let frames = 0, t0 = performance.now();
  await new Promise((r) => { const tick = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else r(); }; requestAnimationFrame(tick); });
  return { fps: frames, calls: s.stats(), size: s.canvas() };
});
console.log('fps(swiftshader):', stats.fps, 'drawCalls:', stats.calls, 'canvas:', stats.size.join('x'));

const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.screenshot({ path: 'artifacts/x-mobile-menu.png' });
await enter(phone);
await phone.waitForTimeout(1200);
await phone.screenshot({ path: 'artifacts/x-mobile-play.png' });

console.log('errors:', errs.length ? errs.slice(0, 4) : 'none');
await b.close();
srv?.close();
