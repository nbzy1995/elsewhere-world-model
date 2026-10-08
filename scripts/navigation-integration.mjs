import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960}});
const page=await context.newPage();
page.setDefaultTimeout(12000);
const checks=[],errors=[],failures=[];
let tokenAttempts=0,blockedModelDownloads=0,holdSwitch=false,releaseSwitch,notifySwitch;
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
const noDialogs=async()=>{
  await page.waitForFunction(()=>document.querySelectorAll('dialog[open]').length===0);
  await page.waitForTimeout(80);
  assert.equal(await page.locator('dialog[open]').count(),0);
};
const pixels=()=>page.evaluate(()=>{
  const small=document.createElement('canvas');small.width=80;small.height=46;
  const ctx=small.getContext('2d');ctx.drawImage(document.querySelector('#world'),0,0,80,46);
  return [...ctx.getImageData(0,0,80,46).data];
});
await context.route('**/api/token',route=>{tokenAttempts++;return route.abort();});
await context.route('**/*',route=>{
  if(/(?:huggingface\.co|hf\.co|\.onnx(?:\?|$))/.test(route.request().url())){blockedModelDownloads++;return route.abort();}
  return route.fallback();
});
await context.route('**/assets/times-square-third-person.png',async route=>{
  if(holdSwitch && route.request().resourceType()==='fetch'){
    notifySwitch?.();
    await new Promise(resolve=>releaseSwitch=resolve);
    try {await route.continue();}catch{/* The caller intentionally aborted this request. */}
    return;
  }
  return route.fallback();
});
page.on('pageerror',error=>errors.push(error.message));
await mkdir('artifacts/navigation-integration',{recursive:true});
try{
  await page.goto('http://127.0.0.1:5179/?preview=1');
  await page.waitForFunction(()=>window.render_game_to_text && JSON.parse(window.render_game_to_text()).mode==='controls preview');
  await page.waitForFunction(()=>document.querySelector('#world').getContext('2d').getImageData(800,400,1,1).data[3]===255);
  await noDialogs();
  const initial=await state();
  assert.equal(await page.locator('#playUI').evaluate(element=>element.hidden),false);
  assert.equal(await page.locator('#destination').isVisible(),true);
  assert.equal(await page.locator('#welcome').isVisible(),false);
  assert.equal(await page.locator('[data-start-scene]:visible').count(),0);
  assert.equal(initial.world.place,'Empire State Building, New York City');
  assert.equal(initial.navigation.characters.length,2);
  assert.match(initial.world.reference.source,/commons.wikimedia.org/);
  await page.screenshot({path:'artifacts/navigation-integration/direct-entry.png',fullPage:true});
  assert.equal(initial.world.view,'outside');
  checks.push('direct preview entry displays the third-person Empire State scene/HUD, no landing or open dialogs, and no visible scene catalog');

  await page.keyboard.press('v');
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).world.view==='first');
  await page.keyboard.press('v');
  await page.waitForFunction(()=>JSON.parse(window.render_game_to_text()).world.view==='outside');
  await page.keyboard.press('t');
  await page.locator('#worldTimeDialog[open]').waitFor();
  await page.locator('[data-time-preset="2126"]').click();
  await page.screenshot({path:'artifacts/navigation-integration/time-2126.png',fullPage:true});
  await page.locator('.world-time-submit').click();
  await noDialogs();
  let current=await state();
  assert.equal(current.world.year,2126);
  assert.equal(current.world.place,initial.world.place);
  assert.deepEqual(current.world.point,initial.world.point);
  assert.equal(current.world.scene,'empireFuture');
  assert.equal(current.world.reference.generated,true);
  assert.notEqual(current.world.reference.image,initial.world.reference.image);
  for(const field of ['source','credit','license','date'])assert.equal(current.world.reference[field],initial.world.reference[field]);
  assert.equal(current.world.view,'outside');
  const futureReference=structuredClone(current.world.reference);
  await page.waitForTimeout(180);
  await page.screenshot({path:'artifacts/navigation-integration/future-2126.png',fullPage:true});
  checks.push('V toggles first/third person; T2126 loads an explicitly generated future reference while preserving place, map point, source/date/credit and third-person view');

  holdSwitch=true;
  const requestPaused=new Promise(resolve=>notifySwitch=resolve);
  await page.keyboard.press('Tab');
  await page.locator('#worldCharactersDialog[open]').waitFor();
  assert.deepEqual(await page.locator('.world-character-caption strong').allTextContents(),['Explorer','Traveler']);
  await page.screenshot({path:'artifacts/navigation-integration/characters.png',fullPage:true});
  await page.locator('[data-character-id="traveler"]').click();
  await requestPaused;
  assert.equal((await state()).navigation.pending,'characters');
  await page.keyboard.press('Escape');
  await noDialogs();
  holdSwitch=false;releaseSwitch();
  await page.waitForTimeout(120);
  assert.equal((await state()).world.place,initial.world.place);
  assert.equal((await state()).navigation.activeCharacter,'explorer');
  assert.equal((await state()).navigation.pending,null);
  checks.push('Escape cancels a delayed character image fetch; stale switch completion leaves the original place and active character intact');

  const savedPixels=await pixels();
  await page.keyboard.press('Tab');
  await page.locator('[data-character-id="traveler"]').click();
  await noDialogs();
  await page.waitForTimeout(160);
  current=await state();
  assert.equal(current.world.place,'Times Square, New York City');
  assert.equal(current.world.characterId,'traveler');
  assert.equal(current.world.year,2026);
  assert.match(current.world.reference.credit,/Sergiy Galyonkin/);
  await page.screenshot({path:'artifacts/navigation-integration/times-square.png',fullPage:true});
  await page.keyboard.press('Tab');
  await page.locator('[data-character-id="explorer"]').click();
  await noDialogs();
  await page.waitForTimeout(160);
  current=await state();
  assert.equal(current.world.place,initial.world.place);
  assert.equal(current.world.year,2126);
  assert.equal(current.world.view,'outside');
  assert.deepEqual(current.world.point,initial.world.point);
  assert.deepEqual(current.world.reference,futureReference);
  assert.equal(current.world.scene,'empireFuture');
  const returnedPixels=await pixels();
  const frameDifference=savedPixels.reduce((sum,value,index)=>sum+Math.abs(value-returnedPixels[index]),0)/savedPixels.length;
  assert.ok(frameDifference<6,`Saved-view average channel difference is ${frameDifference}.`);
  checks.push(`Tab switches to the Times Square photo and back to the future Empire State scene, retaining year/view/generated reference and the saved canvas frame (mean difference ${frameDifference.toFixed(3)}/255)`);

  await page.keyboard.press('t');
  await page.locator('#worldTimeYear').fill('2026');
  await page.locator('.world-time-submit').click();
  await noDialogs();
  current=await state();
  assert.equal(current.world.year,2026);
  assert.equal(current.world.scene,'city');
  assert.equal(current.world.view,'outside');
  assert.deepEqual(current.world.reference,initial.world.reference);
  assert.deepEqual(current.world.point,initial.world.point);
  await page.waitForTimeout(180);
  await page.screenshot({path:'artifacts/navigation-integration/present-restored.png',fullPage:true});
  checks.push('T2026 restores the present-day city reference and source photo metadata while preserving place, point and third-person view');

  await page.keyboard.press('t');
  await page.locator('#worldTimeYear').fill('2186');
  await page.locator('.world-time-submit').click();
  await noDialogs();
  assert.equal((await state()).world.year,2186);
  await page.keyboard.press('t');
  await page.locator('#worldTimeYear').fill('1926');
  await page.keyboard.press('Escape');
  await noDialogs();
  assert.equal((await state()).world.year,2186);
  checks.push('later time change works; dismissing an unsubmitted year leaves the current year unchanged');

  await page.keyboard.press('m');
  await page.locator('#travelDialog[open]').waitFor();
  assert.equal(await page.locator('dialog[open]').count(),1);
  assert.equal(await page.locator('#travelPlace').inputValue(),initial.world.place);
  await page.keyboard.press('Escape');
  await noDialogs();
  await page.keyboard.press('Escape');
  await page.locator('#welcome[open]').waitFor();
  assert.equal(await page.locator('dialog[open]').count(),1);
  assert.equal(await page.locator('#startYear').inputValue(),'2186');
  assert.equal(await page.locator('[data-start-scene]:visible').count(),0);
  await page.screenshot({path:'artifacts/navigation-integration/world-settings.png',fullPage:true});
  const beforeSettingsDraft=(await state()).world;
  await page.locator('.scene-references summary').click();
  await page.locator('[data-start-scene="spacecraft"]').click();
  assert.deepEqual((await state()).world,beforeSettingsDraft);
  await page.keyboard.press('Escape');
  await noDialogs();
  assert.deepEqual((await state()).world,beforeSettingsDraft);
  checks.push('choosing Spacecraft in settings remains a draft; Escape leaves the current world unchanged');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await noDialogs();
  checks.push('M opens map; Escape closes map, opens settings from play, closes settings, and closes character picker without stacking/reopening dialogs');
  assert.equal(tokenAttempts,0);
  assert.deepEqual(errors,[]);
  const report={result:'pass',checks,errors,tokenAttempts,blockedModelDownloads,scope:'Offline UI/state only. No Reactor generation or perception inference tested.',state:await state()};
  await writeFile('artifacts/navigation-integration/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({result:'pass',checks,errors,tokenAttempts,blockedModelDownloads},null,2));
}catch(error){
  failures.push(error.stack||error.message);
  await page.screenshot({path:'artifacts/navigation-integration/failure.png',fullPage:true}).catch(()=>{});
  const report={result:'fail',checks,errors,failures,tokenAttempts,blockedModelDownloads,state:await state().catch(()=>null)};
  await writeFile('artifacts/navigation-integration/report.json',JSON.stringify(report,null,2));
  console.error(JSON.stringify(report,null,2));
  process.exitCode=1;
}finally{
  releaseSwitch?.();
  await browser.close();
}
