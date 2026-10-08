import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, rename } from 'node:fs/promises';
await mkdir('artifacts/story-smoke', { recursive: true });
const context = await chromium.launchPersistentContext('artifacts/perception-gpu-profile', {
  headless: true, viewport: { width: 1512, height: 960 }, recordVideo: { dir: 'artifacts/story-smoke', size: { width: 1512, height: 960 } },
  executablePath: '/Users/Yang/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
const page = context.pages()[0] || await context.newPage(); const recordingStart = Date.now();
const checks = [], errors = [], stages = []; let tokenAttempts = 0;
page.setDefaultTimeout(20000);
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/token', route => { tokenAttempts++; return route.abort(); });
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function snap(name) {
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `artifacts/story-smoke/${name}.png` });
  const s = await state(); stages.push({ name, elapsed: (Date.now() - recordingStart) / 1000, world: s.world, interaction: s.interaction });
  console.log('STAGE', name, s.world.scene, s.world.view);
}
async function view(expected) {
  await page.locator('#world').focus(); await page.keyboard.press('v');
  await page.waitForFunction(view => JSON.parse(window.render_game_to_text()).world.view === view, expected);
}
async function next(scene) {
  await page.locator('#sceneAction').click();
  await page.waitForFunction(scene => JSON.parse(window.render_game_to_text()).world.scene === scene, scene);
}
async function point(x, y) {
  const p = await page.locator('#world').evaluate((canvas, { x, y }) => {
    const r = canvas.getBoundingClientRect(), scale = Math.max(r.width / canvas.width, r.height / canvas.height), w = canvas.width * scale, h = canvas.height * scale;
    return { x: r.left + x * w - (w - r.width) / 2, y: r.top + y * h - (h - r.height) / 2 };
  }, { x, y });
  await page.mouse.click(p.x, p.y);
}
try {
  await page.goto('http://127.0.0.1:5179/?preview=1');
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode === 'controls preview');
  await page.waitForTimeout(500);
  let s = await state(); assert.equal(s.world.view, 'outside'); assert.equal(s.dialog, null);
  await snap('01-present-third');
  await view('first'); await snap('02-present-first');
  await view('outside');
  const original = (await state()).world;
  await page.keyboard.press('t'); await page.locator('[data-time-preset="2126"]').click(); await page.locator('.world-time-submit').click();
  await page.waitForFunction(() => !document.querySelector('#worldTimeDialog').open);
  s = await state(); assert.equal(s.world.scene, 'empireFuture'); assert.equal(s.world.year, 2126); assert.equal(s.world.reference.generated, true);
  assert.equal(s.world.place, original.place); assert.deepEqual(s.world.point, original.point); assert.equal(s.world.view, 'outside');
  await snap('03-future-third'); checks.push('Default third person, paired first-person reference, and same-place 2126 interpretation');
  await next('spacecraft'); assert.equal((await state()).world.view, 'first'); await snap('04-cockpit');
  await view('outside'); await snap('05-flight-third');
  await page.keyboard.down('w'); await page.waitForTimeout(100); assert.equal((await state()).inputs.longitudinal, 'forward'); await page.keyboard.up('w');
  assert.equal((await state()).inputs.longitudinal, 'idle'); checks.push('Boarding opens cockpit, V selects matching exterior, W input releases to idle');
  await next('lunarArrival'); await snap('06-colony-third');
  await view('first'); await snap('07-colony-first'); await view('outside');
  await next('lunarFactory'); await snap('08-factory-third');
  await view('first'); await snap('09-factory-first'); checks.push('Connected colony exterior and factory interior with paired camera references');
  await point(.855, .56);
  await page.waitForFunction(() => { const s = JSON.parse(window.render_game_to_text()).interaction.selection; return s && !s.pending; }, null, { timeout: 180000 });
  s = await state(); assert.equal(s.interaction.selection.outlined, true); assert.equal(s.interaction.selection.label, 'computer');
  await snap('10-selected-computer');
  await page.locator('[data-play="computer"]').click(); await page.locator('#computerDialog[open]').waitFor();
  await page.locator('#notes').fill('Lunar robot: inspect the solar array.'); assert.equal((await state()).computer.note, 'Lunar robot: inspect the solar array.');
  await snap('11-computer'); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).interaction.computer);
  checks.push('Actual local segmentation finds lunar monitor; Use approaches it, Notes accept typing, Escape returns');
  assert.deepEqual(errors, []); assert.equal(tokenAttempts, 0);
  await writeFile('artifacts/story-smoke/report.json', JSON.stringify({ result: 'pass', recordingStart, recordingEnd: Date.now(), at: new Date().toISOString(), checks, errors, tokenAttempts, stages, scope: 'Prepared references, actual local perception and computer. No generated movement validated by this offline run.' }, null, 2));
  console.log(JSON.stringify({ result: 'pass', checks, errors }));
} catch (error) {
  await page.screenshot({ path: 'artifacts/story-smoke/failure.png' }).catch(() => {});
  await writeFile('artifacts/story-smoke/report.json', JSON.stringify({ result: 'fail', checks, errors, tokenAttempts, stages, error: error.stack, state: await state().catch(() => null) }, null, 2));
  throw error;
} finally { const video = page.video(); await context.close(); if (video) await rename(await video.path(), 'artifacts/story-smoke/preview-and-computer.webm'); }
