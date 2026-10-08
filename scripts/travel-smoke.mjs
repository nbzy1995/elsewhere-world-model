import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(20000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
let tokenAttempts=0;await page.route('**/api/token',r=>{tokenAttempts++;return r.abort();});
try {
 await page.goto('http://127.0.0.1:5179/');await page.locator('#startMap').click();await page.locator('#travelPlace').fill('Kyoto');await page.locator('#searchPlace').click();
 await page.getByRole('button',{name:'Kyoto, Kyoto, Japan',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#referencePhotos img')?.naturalWidth>0,null,{timeout:25000});
 assert.match(await page.locator('#referenceStatus').textContent(),/Kyoto/);assert.match(await page.locator('#referenceCredit').textContent(),/CC BY/);
 assert.match(await page.locator('#referenceContext').textContent(),/Kyoto/);
 await page.screenshot({path:'artifacts/location-reference.png'});
 await page.locator('#travelForm [type=submit]').click();let s=await state();assert.equal(s.world.place,'Kyoto, Japan');assert.equal(s.world.year,2026);assert.ok(s.world.reference.image.startsWith('/api/reference-image?'));assert.equal(s.mode,'start');
 await page.locator('#preview').click();assert.equal((await state()).mode,'controls preview');
 await page.locator('#destination').click();await page.locator('#travelYear').fill('2126');await page.locator('#travelForm [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#travelDialog').open);
 s=await state();assert.equal(s.world.year,2126);assert.match(await page.locator('#eraLabel').textContent(),/SPECULATIVE/);
 await page.locator('#destination').click();await page.locator('#realReference').uncheck();await page.locator('#travelYear').fill('1926');await page.locator('#travelForm [type=submit]').click();
 s=await state();assert.equal(s.world.year,1926);assert.match(await page.locator('#eraLabel').textContent(),/HISTORICAL/);
 await page.locator('#destination').click();await page.locator('#travelPlace').fill('Elsewhere test place');assert.match(await page.locator('#coordinates').textContent(),/Search to locate/);await page.keyboard.press('Escape');
 assert.equal((await state()).world.place,'Kyoto, Japan');assert.equal(tokenAttempts,0);assert.deepEqual(errors,[]);
 const report={result:'pass',checks:['real Kyoto geocoding','real Commons images and attribution loaded','Wikipedia context visible','starting-place selection preserves reference','preview travel updates year with honest era labels','manual place typing clears stale coordinates','cancel leaves current place unchanged','no model-session attempts or page errors'],reference:s.world.reference,tokenAttempts,errors};
 await writeFile('artifacts/location-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally{await browser.close();}
