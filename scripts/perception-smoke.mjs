import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const context=await chromium.launchPersistentContext(process.env.PERCEPTION_PROFILE || 'artifacts/perception-profile',{headless:true,viewport:{width:1512,height:960},...(process.env.PERCEPTION_BROWSER_PATH?{executablePath:process.env.PERCEPTION_BROWSER_PATH}:{})});
const page=await context.newPage(); const errors=[],requests=[];
page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR:',error.message);});
page.on('requestfailed',request=>{requests.push({url:request.url().replace(/\?.*/,''),error:request.failure()?.errorText});});
try {
 await page.goto('http://127.0.0.1:5179/scripts/perception-smoke.html');
 for(let i=0;i<180;i++){
  await page.waitForTimeout(1000);
  const state=await page.evaluate(()=>window.perceptionStatus);
  if(i%10===0)console.log('WARMUP:',await page.locator('#status').textContent());
  if(state?.stage==='error')throw new Error(state.error);
  if(state?.stage==='ready')break;
 }
 const ready=await page.evaluate(async()=>({state:window.perceptionStatus,models:window.warmupResult,warmupMs:window.warmupMs,hardware:(await navigator.gpu?.requestAdapter())?.info?.toJSON?.() || null,userAgent:navigator.userAgent}));
 assert.equal(ready.state.stage,'ready');console.log('READY:',JSON.stringify(ready));
 const results=[];
 for(const [name,point,quality] of [['monitor',{x:.875,y:.56}],['robot',{x:.61,y:.40}],['robot-base',{x:.598,y:.554}],['motor',{x:.51,y:.62}],['monitor-new-frame',{x:.875,y:.56},.92],['monitor-third-frame',{x:.875,y:.56},.91]]){
  const result=await page.evaluate(({point,quality})=>window.runSelection(point,quality),{point,quality});
  assert.ok(result.selectedPixels>10);assert.ok(result.bbox.w>0&&result.bbox.h>0);
  results.push({name,point,...result});console.log('SELECTION:',JSON.stringify(results.at(-1)));
  await page.screenshot({path:`artifacts/perception-${name}.png`,fullPage:true});
 }
 assert.equal(results[0].label,'computer'); assert.equal(results[1].label,'robot'); assert.equal(results[3].label,'object');
 assert.equal(errors.length,0);
 await writeFile('artifacts/perception-report.json',JSON.stringify({timestamp:new Date().toISOString(),executablePath:process.env.PERCEPTION_BROWSER_PATH||null,ready,results,errors,failedRequests:requests},null,2));
 await page.evaluate(()=>window.disposePerception());
}catch(error){
 await writeFile('artifacts/perception-report.json',JSON.stringify({error:error.stack,errors,failedRequests:requests,progress:await page.evaluate(()=>window.perceptionProgress).catch(()=>[])},null,2));
 await page.screenshot({path:'artifacts/perception-failure.png',fullPage:true}).catch(()=>{});throw error;
}finally{await context.close();}
