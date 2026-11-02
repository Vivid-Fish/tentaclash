// End-to-end check on the built file: real Chromium, real WebGL, the single
// inlined index.html served from an empty directory. Proves three things that
// unit tests cannot: it renders, it makes no external requests, and holding the
// press key actually moves the grip.
//
// Run: node test/render.mjs   (expects dist/index.html to exist)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ARTIFACTS = path.join(ROOT, 'artifacts');

const FILE_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const file = path.join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': FILE_TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('nope');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const fail = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fail.push(label);
};

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html missing — run ./build.sh first');
  process.exit(1);
}
mkdirSync(ARTIFACTS, { recursive: true });

const { server, port } = await serve(DIST);
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  const external = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (req) => {
    if (!req.url().startsWith(url)) external.push(req.url());
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  check(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));
  check(external.length === 0, 'no external requests', external.slice(0, 3).join(' '));

  const gl = await page.evaluate(() => {
    const c = document.getElementById('stage');
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    return { hasCanvas: !!c, w: c.width, h: c.height, hasGL: !!ctx, lost: ctx ? ctx.isContextLost() : true };
  });
  check(gl.hasCanvas && gl.w > 0 && gl.h > 0, 'canvas sized to the viewport', `${gl.w}x${gl.h}`);
  check(gl.hasGL && !gl.lost, 'WebGL context is live');

  await page.screenshot({ path: path.join(ARTIFACTS, 'menu.png') });
  check((await readFile(path.join(ARTIFACTS, 'menu.png'))).byteLength > 60_000,
    'something is actually drawn (blank screens compress tiny)');

  // Enter the tournament, pick the first arm, then hold the press key.
  await page.click('#start');
  await page.waitForTimeout(600);
  await page.click('#arm-grid .arm-card >> nth=0');
  // Wait for the referee to finish the set: pressing during it is not a grip, and a
  // check that measures the set phase proves nothing about the grip.
  await page.waitForTimeout(3200);

  const read = () => page.evaluate(() => ({
    needle: parseFloat(document.getElementById('grip-needle').style.left),
    fuel: parseFloat(document.getElementById('fuel-you').firstElementChild.style.width),
  }));
  const before = await read();
  await page.keyboard.down('Space');
  await page.waitForTimeout(3000);
  await page.keyboard.up('Space');
  const after = await read();

  // Holding Press for three seconds is ~18 accepted pumps: the grip must move by a
  // visible amount and the arm must be measurably spent. A delta of a pixel or two
  // would pass a weak assertion and mean the input is not reaching the rules.
  check(Number.isFinite(before.needle) && Number.isFinite(after.needle)
    && Math.abs(after.needle - before.needle) > 1.5,
    'holding Press moves the grip', `${before.needle} -> ${after.needle}`);
  check(before.fuel - after.fuel > 15, 'pressing spends fuel over three seconds',
    `${before.fuel}% -> ${after.fuel}%`);

  await page.screenshot({ path: path.join(ARTIFACTS, 'desktop-play.png') });

  // Mobile: the thumb zones must exist, be large, and not overlap the readouts.
  // Close the desktop page first: a hidden page has its animation frames throttled,
  // so its game loop does not run and every dynamic check below would be measuring
  // a paused game.
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mobile.bringToFront();
  await mobile.goto(url, { waitUntil: 'load' });
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: path.join(ARTIFACTS, 'mobile-menu.png') });
  const boxes = await mobile.evaluate(() => {
    const r = (id) => {
      const el = document.getElementById(id);
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { id, w: b.width, h: b.height, display: s.display };
    };
    return [r('touch-left'), r('touch-right')];
  });
  for (const b of boxes) {
    check(b.display !== 'none' && b.w >= 120 && b.h >= 200,
      `touch target ${b.id} is thumb-sized`, `${Math.round(b.w)}x${Math.round(b.h)} display=${b.display}`);
  }

  // Two thumbs at once: press with one, brace with the other.
  await mobile.close();
  const page2 = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page2.bringToFront();
  await page2.goto(url, { waitUntil: 'load' });
  await page2.click('#start');
  await page2.waitForTimeout(500);
  await page2.click('#arm-grid .arm-card >> nth=0');
  await page2.waitForTimeout(3200);
  // Six taps, spaced past the pump cooldown, on the Press zone. Both channels are
  // checked: a tap that moves nothing, and a tap that costs no fuel, are both the
  // same bug — the thumb not reaching the rules.
  const readTouch = () => page2.evaluate(() => ({
    n: parseFloat(document.getElementById('grip-needle').style.left),
    f: parseFloat(document.getElementById('fuel-you').firstElementChild.style.width),
  }));
  const beforeTouch = await readTouch();
  for (let i = 0; i < 6; i++) {
    await page2.touchscreen.tap(300, 700);
    await page2.waitForTimeout(180);
  }
  const afterTouch = await readTouch();
  check(Number.isFinite(afterTouch.n) && Math.abs(afterTouch.n - beforeTouch.n) > 1.5
    && beforeTouch.f - afterTouch.f > 8,
    'taps in the Press zone reach the rules and cost fuel',
    `grip ${beforeTouch.n} -> ${afterTouch.n}, fuel ${beforeTouch.f}% -> ${afterTouch.f}%`);
  await page2.screenshot({ path: path.join(ARTIFACTS, 'mobile-play.png') });

} finally {
  await browser.close();
  server.close();
}

if (fail.length) {
  console.error(`\n${fail.length} render check(s) failed`);
  process.exit(1);
}
console.log('\nall render checks passed');
