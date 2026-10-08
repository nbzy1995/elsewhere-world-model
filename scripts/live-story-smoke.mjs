import { chromium } from 'playwright';
import { mkdir, writeFile, rename } from 'node:fs/promises';
await mkdir('artifacts/live-story',{recursive:true});
const context=await chromium.launchPersistentContext('artifacts/perception-gpu-profile',{headless:true,viewport:{width:1512,height:960},recordVideo:{dir:'artifacts/live-story',size:{width:1512,height:960}},executablePath:'/Users/Yang/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'});
await context.routeWebSocket(url=>url.hostname==='127.0.0.1'&&url.port==='5179', ws=>ws.close());
const page=context.pages()[0]||await context.newPage(); page.setDefaultTimeout(25000); const recordingStart=Date.now();
const events=[],errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function snap(name){await page.screenshot({path:`artifacts/live-story/${name}.png`});const s=await state();events.push({name,at:new Date().toISOString(),elapsed:(Date.now()-recordingStart)/1000,mode:s.mode,place:s.world.place,year:s.world.year,scene:s.world.scene,view:s.world.view,model:s.model,notice:await page.locator('#notice').textContent()});await writeFile('artifacts/live-story/report.json',JSON.stringify({events,errors},null,2));console.log('STAGE',name,s.mode,s.world.place,s.world.year,'frames',s.model.frames,'chunk',s.model.chunk);}
async function arrived(){await page.waitForFunction(()=>document.querySelector('#connectionOverlay').hidden&&JSON.parse(window.render_game_to_text()).mode==='live world',null,{timeout:80000});await page.waitForTimeout(6000);}
async function travel(place,scene){await page.locator('#world').focus();await page.keyboard.press('m');await page.locator('#travelPlace').fill(place);await page.locator('#arrivalScene').selectOption(scene);await page.locator('#travelForm [type="submit"]').click();await arrived();}
let failure;
try{
 await page.goto('http://127.0.0.1:5179/');
 await page.waitForFunction(()=>window.render_game_to_text&&(JSON.parse(window.render_game_to_text()).mode==='live world'||/capacity|could not|unavailable|failed/i.test(document.querySelector('#notice').textContent)),null,{timeout:95000});
 if((await state()).mode!=='live world')throw new Error(await page.locator('#notice').textContent());
 await arrived();await snap('01-empire-present');
 await page.locator('#world').focus();await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');await page.waitForTimeout(5500);await snap('02-empire-moved');
 await page.keyboard.press('Tab');await page.locator('[data-character-id="traveler"]').click();await arrived();await snap('03-times-square');
 await page.locator('#world').focus();await page.keyboard.press('Tab');await page.locator('[data-character-id="explorer"]').click();await arrived();await snap('04-empire-return');
 await page.locator('#world').focus();await page.keyboard.press('t');await page.locator('[data-time-preset="2126"]').click();await page.locator('.world-time-submit').click();await page.waitForFunction(()=>!document.querySelector('#worldTimeDialog').open);await arrived();await snap('05-future-third-person');
 await page.locator('#sceneAction').click();await arrived();await snap('06-cockpit');await page.locator('#world').focus();await page.keyboard.down('w');await page.waitForTimeout(1400);await page.keyboard.up('w');await page.waitForTimeout(8000);await snap('07-cockpit-flight');
 await page.locator('#viewButton').click();await arrived();await snap('08-exterior-flight');
 await page.locator('#world').focus();await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');await page.waitForTimeout(5500);await snap('09-exterior-flight-moved');
 await page.locator('#sceneAction').click();await arrived();await snap('10-lunar-arrival');
 await page.locator('#sceneAction').click();await arrived();await snap('11-factory-third-person');
 await page.locator('#viewButton').click();await arrived();await snap('12-factory-first-person');
 const target=await page.locator('#world').evaluate(c=>{const r=c.getBoundingClientRect(),s=Math.max(r.width/c.width,r.height/c.height),w=c.width*s,h=c.height*s;return{x:r.left+.855*w-(w-r.width)/2,y:r.top+.56*h-(h-r.height)/2};});
 await page.mouse.click(target.x,target.y);await page.waitForFunction(()=>{const s=JSON.parse(window.render_game_to_text()).interaction.selection;return(s&&!s.pending)||!document.body.classList.contains('selecting');},null,{timeout:45000});
 if(await page.locator('[data-play="computer"]').isVisible()){await page.waitForTimeout(5000);await snap('13-hologram-selected');await page.locator('[data-play="computer"]').click();}
 else {if((await state()).interaction.selection)await page.keyboard.press('Escape');await page.locator('#world').focus();await page.keyboard.press('c');}
 await page.locator('#computerDialog[open]').waitFor();await page.locator('#notes').fill('');await page.locator('#notes').pressSequentially('Build a helper robot for the lunar colony.\nTeach its gripper to react to two sensors.',{delay:45});await page.waitForTimeout(6000);await snap('14-holographic-computer');
 await page.locator('[data-app="ai"]').click();await page.locator('#train').click();await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).computer.training);await page.waitForTimeout(6000);await snap('15-train-ai');
 await page.locator('#deployNetwork').click();await page.locator('#benchPower').waitFor({state:'visible'});for(const part of ['motor','controller','power','camera']){if(await page.locator('[data-part="'+part+'"]').getAttribute('aria-pressed')==='false')await page.locator('[data-part="'+part+'"]').click();}if((await page.locator('#benchPower').textContent())==='Power on')await page.locator('#benchPower').click();await page.locator('#runRobotAI').click();await page.waitForTimeout(3000);await page.locator('#sensorA').check();await page.waitForTimeout(6000);await snap('16-robot-ai-control');await page.locator('#leaveBench').click();
}catch(error){failure=error.message;console.log('LIVE CHECK FAILED:',failure);await snap('failure').catch(()=>{});}
finally{
 const s=await state().catch(()=>null);if(s?.mode==='live world')await page.locator('#stop').click().catch(()=>{});else if(s?.mode==='connecting')await page.locator('#cancelConnect').click().catch(()=>{});
 await page.waitForTimeout(1000);const ended=await state().catch(()=>null);await writeFile('artifacts/live-story/report.json',JSON.stringify({recordingStart,recordingEnd:Date.now(),events,errors,failure,ended},null,2));const video=page.video();await context.close();if(video){const old=await video.path();await rename(old,'artifacts/live-story/presentation-check.webm');}console.log('CLOSED',JSON.stringify({failure,errors,finalMode:ended?.mode,stages:events.length}));
}
