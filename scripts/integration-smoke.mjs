import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
page.setDefaultTimeout(15000);
const errors = [], blockedSessions = [], checks = [], bugs = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => {
  const url = route.request().url();
  if (url.includes('/api/token') || /^https?:\/\/[^/]*reactor\.inc\//.test(url)) {
    blockedSessions.push(url.replace(/\?.*/, '')); return route.abort();
  }
  return route.continue();
});
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const check = (name, fn) => { fn(); checks.push(name); console.log('PASS: ' + name); };
async function openBench() {
  await page.locator('#world').focus(); await page.keyboard.press('c');
  await page.locator('#computerDialog[open]').waitFor();
  await page.locator('[data-app="ai"]').click();
  await page.locator('#deployNetwork').click();
  await page.locator('#benchPower').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).interaction.computer);
}
try {
  await page.goto('http://127.0.0.1:5179/?preview=1');
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='controls preview');
  assert.equal((await state()).mode, 'controls preview'); checks.push('preview starts without connecting');
  await openBench();
  assert.equal((await state()).mode, 'robot workbench');
  assert.equal(await page.locator('#benchPower').isDisabled(), true);
  for (const id of ['motor', 'controller', 'power', 'camera']) {
    await page.locator(`[data-part="${id}"]`).click();
    assert.equal(await page.locator(`[data-part="${id}"]`).getAttribute('aria-pressed'), 'true');
  }
  await page.locator('#benchPower').click();
  const assembled = (await state()).bench;
  check('DOM part assembly enables power', () => {
    assert.deepEqual(assembled.installed, ['motor', 'controller', 'power', 'camera']);
    assert.equal(assembled.powered, true); assert.equal(assembled.ready, true);
  });
  await page.locator('#benchComputer').click();
  await page.locator('[data-app="notes"]').click();
  const note = 'Integration QA: build a robot, teach XOR, and keep these notes across reload.';
  await page.locator('#notes').fill(note);
  await page.keyboard.press('ArrowUp');
  assert.deepEqual((await state()).keys, []);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).interaction.computer);
  assert.equal(await page.locator('#computerDialog').isVisible(), false);
  assert.equal((await state()).mode, 'robot workbench');
  checks.push('typing and Escape in computer do not leak into world controls');
  await page.locator('#world').focus(); await page.keyboard.press('c');
  await page.locator('#computerDialog[open]').waitFor();
  await page.locator('[data-app="ai"]').click();
  await page.locator('#train').click();
  await page.waitForFunction(() => document.querySelector('#loss').textContent.startsWith('Loss '), null, { timeout: 10000 });
  const trained = (await state()).computer.training;
  check('actual neural training learns XOR', () => {
    assert.equal(trained.epochs, 6000); assert.ok(trained.loss < .1);
    assert.ok(trained.predictions[0] < .05 && trained.predictions[3] < .05);
    assert.ok(trained.predictions[1] > .95 && trained.predictions[2] > .95);
  });
  const savedNetwork = await page.evaluate(() => localStorage.getItem('elsewhere.network'));
  await page.locator('#deployNetwork').click();
  await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).interaction.computer);
  await page.waitForTimeout(100);
  let controlled = await state();
  assert.equal(controlled.dialog, null);
  assert.ok(Math.abs(controlled.bench.signal - trained.predictions[1]) < 1e-10);
  for (const [a, b, index] of [[true, true, 3], [true, false, 2], [false, false, 0], [false, true, 1]]) {
    await page.locator('#sensorA').setChecked(a); await page.locator('#sensorB').setChecked(b);
    controlled = await state(); assert.ok(Math.abs(controlled.bench.signal - trained.predictions[index]) < 1e-10);
    assert.equal(await page.locator('#signalValue').textContent(), trained.predictions[index].toFixed(3));
  }
  checks.push('deployed network and all four sensor combinations drive the gripper signal');
  await page.locator('#benchAngle').focus(); await page.keyboard.press('End'); await page.keyboard.press('ArrowLeft');
  const beforeLeave = (await state()).bench;
  assert.equal(beforeLeave.angle, 89);
  await page.keyboard.press('Escape');
  if ((await state()).mode === 'robot workbench') {
    bugs.push({ severity: 'minor', title: 'Escape does not leave workbench when a range input has focus', reproduction: 'Move Base angle slider with keyboard, then press Escape. The UI advertises Esc to return, but the workbench stays open.', likelyCause: 'The keydown handler returns for input elements before checking the bench Escape shortcut.' });
    await page.locator('#leaveBench').click();
  }
  assert.equal((await state()).mode, 'controls preview');
  await openBench();
  assert.deepEqual((await state()).bench, beforeLeave);
  checks.push('leaving and reentering preserves powered assembly and controls');
  await page.locator('#world').focus(); await page.keyboard.press('Escape');
  assert.equal((await state()).mode, 'controls preview');
  for (const [key, dialog] of [['m', 'travelDialog'], ['p', 'imagineDialog'], ['c', 'computerDialog']]) {
    await page.locator('#world').focus(); await page.keyboard.press(key);
    await page.locator(`#${dialog}[open]`).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !JSON.parse(window.render_game_to_text()).interaction.computer);
    assert.equal(await page.locator(`#${dialog}`).isVisible(), false);
    assert.deepEqual((await state()).keys, []);
  }
  checks.push('M, P, C dialogs open and close with keyboard');
  await page.locator('#world').focus(); await page.keyboard.press('e');
  await page.locator('#selectionCard').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  assert.equal((await state()).interaction.selection, null);
  checks.push('E starts selection and Escape cancels immediately, including while perception loads');
  await page.reload();
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).mode==='controls preview'); await openBench();
  const restored = await state();
  assert.deepEqual(restored.bench, beforeLeave);
  assert.deepEqual(restored.computer.training, trained);
  assert.equal(restored.computer.note, note);
  assert.equal(await page.evaluate(() => localStorage.getItem('elsewhere.network')), savedNetwork);
  await page.locator('#runRobotAI').click();
  assert.ok(Math.abs((await state()).bench.signal - trained.predictions[1]) < 1e-10);
  checks.push('reload preserves notes, exact network weights, training, assembly, power, angle, and signal');
  await page.locator('#world').focus();
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'artifacts/integration-workbench.png', fullPage: true });
  assert.deepEqual(errors, []); assert.deepEqual(blockedSessions, []);
  checks.push('no page errors or attempted Reactor sessions');
  const report = { result: bugs.length ? 'pass-with-findings' : 'pass', checks, bugs, errors, attemptedSessions: blockedSessions, training: trained, final: await state(), screenshot: 'artifacts/integration-workbench.png' };
  await writeFile('artifacts/integration-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: 'artifacts/integration-failure.png', fullPage: true }).catch(() => {});
  await writeFile('artifacts/integration-report.json', JSON.stringify({ result: 'failed', checks, bugs, errors, error: error.stack, attemptedSessions: blockedSessions }, null, 2));
  throw error;
} finally { await browser.close(); }
