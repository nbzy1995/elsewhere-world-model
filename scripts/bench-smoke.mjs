import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, ...(process.env.BENCH_BROWSER_PATH ? { executablePath: process.env.BENCH_BROWSER_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1664, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5179/scripts/bench-smoke.html');
  await page.waitForFunction(() => window.benchReady);
  const initial = await page.evaluate(() => window.bench.getState());
  assert.deepEqual(initial.installed, []);
  assert.equal(initial.ready, false);
  assert.equal(await page.evaluate(() => window.bench.setPower(true)), false);
  const picked = await page.evaluate(() => {
    const seen = new Set();
    for (let y = .2; y < .95; y += .0125) for (let x = .05; x < .95; x += .0125) {
      const part = window.bench.pick(x, y); if (part) seen.add(part);
    }
    return [...seen].sort();
  });
  assert.deepEqual(picked, ['camera', 'computer', 'controller', 'motor', 'power']);
  await page.screenshot({ path: 'artifacts/bench-loose.png' });
  const assembled = await page.evaluate(() => {
    for (const part of ['motor', 'controller', 'power', 'camera']) window.bench.assemble(part);
    window.bench.setPower(true); window.bench.setAngle(25); window.bench.setSignal(.93);
    for (let i = 0; i < 100; i++) window.bench.update(1 / 60);
    return window.bench.getState();
  });
  assert.equal(assembled.ready, true);
  assert.equal(assembled.powered, true);
  assert.equal(assembled.angle, 25);
  assert.equal(assembled.signal, .93);
  await page.screenshot({ path: 'artifacts/bench-running.png' });
  const stateChecks = await page.evaluate(() => {
    const a = window.bench.setAngle(120), b = window.bench.setSignal(-10);
    const before = window.benchEvents.length;
    window.bench.setAngle(90); window.bench.setSignal(0); window.bench.setPower(true);
    const stable = window.benchEvents.length === before;
    window.bench.assemble('power');
    const removed = window.bench.getState();
    const unknown = window.bench.assemble('unknown');
    window.bench.look(150, -20); window.bench.update(.02);
    window.bench.reset();
    return { a, b, stable, removed, unknown, reset: window.bench.getState() };
  });
  assert.equal(stateChecks.a, 90); assert.equal(stateChecks.b, 0);
  assert.equal(stateChecks.stable, true);
  assert.equal(stateChecks.removed.powered, false);
  assert.equal(stateChecks.removed.ready, false);
  assert.deepEqual(stateChecks.removed.missing, ['power']);
  assert.equal(stateChecks.unknown, false);
  assert.deepEqual(stateChecks.reset, initial);
  assert.deepEqual(errors, []);
  await page.evaluate(() => { window.bench.dispose(); window.bench.dispose(); window.bench.update(.02); });
  console.log(JSON.stringify({ result: 'pass', checks: ['initial state', 'incomplete power rejection', 'all four parts raycast', 'assembly and power', 'angle and signal controls', 'input clamping', 'meaningful change callbacks', 'removal powers off', 'unknown part rejected', 'look and reset', 'idempotent disposal', 'no page errors'], screenshots: ['artifacts/bench-loose.png', 'artifacts/bench-running.png'] }, null, 2));
} finally { await browser.close(); }
