import { chromium } from 'playwright';
import { mkdir, writeFile, rename } from 'node:fs/promises';
await mkdir('artifacts/pickups', { recursive: true });
const context = await chromium.launchPersistentContext('artifacts/perception-gpu-profile', { headless: true, viewport: { width: 1600, height: 900 }, recordVideo: { dir: 'artifacts/pickups', size: { width: 1600, height: 900 } }, executablePath: '/Users/Yang/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' });
await context.routeWebSocket(url => url.hostname === '127.0.0.1' && url.port === '5179', ws => ws.close());
const page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(20000);
const recordingStart = Date.now(), segments = [], errors = []; let failure;
page.on('pageerror', e => errors.push(e.message));
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const arrived = async scene => { await page.waitForFunction(scene => { const s=JSON.parse(window.render_game_to_text()); return s.mode==='live world'&&(!scene||s.world.scene===scene)&&document.querySelector('#connectionOverlay').hidden; }, scene, {timeout:65000}); await page.waitForTimeout(2500); };
async function segment(name, kind, fn) { const start=(Date.now()-recordingStart)/1000; await fn(); await page.screenshot({path:`artifacts/pickups/${name}.png`}); segments.push({name,kind,start,end:(Date.now()-recordingStart)/1000,world:(await state()).world}); console.log('CAPTURED',name); }
async function walk() { await page.locator('#world').focus(); await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w'); await page.waitForTimeout(6000); }
try {
 await page.goto('http://127.0.0.1:5179/'); await arrived();
 await page.keyboard.press('t'); await page.locator('[data-time-preset="2126"]').click(); await page.locator('.world-time-submit').click(); await arrived('empireFuture');
 await segment('04-approach-shuttle','Live Reactor gameplay',async()=>{await page.waitForTimeout(1500);await walk();await page.waitForTimeout(2000);});
 await page.locator('#sceneAction').click(); await arrived('spacecraft');
 await page.locator('#sceneAction').click(); await arrived('lunarArrival');
 await segment('07-walk-to-airlock','Live Reactor gameplay',async()=>{await page.waitForTimeout(1500);await walk();await page.waitForTimeout(2000);});
 await page.locator('#sceneAction').click(); await arrived('lunarFactory'); await page.locator('#viewButton').click(); await arrived('lunarFactory');
 await segment('09-select-use-hologram','Live scene with local selection and computer',async()=>{
  const p=await page.locator('#world').evaluate(c=>{const r=c.getBoundingClientRect(),s=Math.max(r.width/c.width,r.height/c.height),w=c.width*s,h=c.height*s;return{x:r.left+.855*w-(w-r.width)/2,y:r.top+.57*h-(h-r.height)/2};});
  await page.mouse.click(p.x,p.y);await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text()).interaction.selection;return s&&!s.pending;},null,{timeout:30000});
  await page.waitForTimeout(3000);await page.locator('[data-play="computer"]').click();await page.locator('#computerDialog[open]').waitFor();await page.locator('[data-app="notes"]').click();await page.locator('#notes').fill('');await page.locator('#notes').pressSequentially('Lunar helper robot\nTest the gripper with two sensors.',{delay:65});await page.waitForTimeout(2500);
 });
 await segment('10-train-and-deploy','Working local AI and robot interface',async()=>{await page.locator('[data-app="ai"]').click();await page.waitForTimeout(1500);await page.locator('#train').click();await page.waitForTimeout(2500);await page.locator('#deployNetwork').click();await page.locator('#benchPower').waitFor({state:'visible'});for(const part of ['motor','controller','power','camera'])if(await page.locator(`[data-part="${part}"]`).getAttribute('aria-pressed')==='false')await page.locator(`[data-part="${part}"]`).click();if((await page.locator('#benchPower').textContent())==='Power on')await page.locator('#benchPower').click();await page.locator('#runRobotAI').click();await page.waitForTimeout(5500);});
 await segment('11-controller-gripper-response','Working local AI and robot interface',async()=>{await page.locator('#sensorB').check();await page.locator('#sensorA').uncheck();await page.waitForTimeout(3300);await page.locator('#sensorA').check();await page.waitForTimeout(3300);await page.locator('#sensorA').uncheck();await page.waitForTimeout(4400);});
 await page.locator('#leaveBench').click();
} catch(e) { failure=e.message; console.log('PICKUP FAILED',failure); await page.screenshot({path:'artifacts/pickups/failure.png'}).catch(()=>{}); }
finally { const s=await state().catch(()=>null);if(s?.mode==='robot workbench')await page.locator('#leaveBench').click().catch(()=>{});if(s?.mode==='connecting')await page.locator('#cancelConnect').click().catch(()=>{});else if((await state().catch(()=>null))?.model.running)await page.locator('#stop').click().catch(()=>{});await page.waitForTimeout(500);const recordingEnd=Date.now();const video=page.video();await context.close();if(video)await rename(await video.path(),'artifacts/pickups/pickups.webm');await writeFile('artifacts/pickups/report.json',JSON.stringify({recordingStart,recordingEnd,segments,errors,failure},null,2));console.log('CLOSED',JSON.stringify({segments:segments.length,errors,failure})); }
