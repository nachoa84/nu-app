import fs from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NUAPP_PLAYWRIGHT_MODULE || 'playwright');
if (!process.env.NUAPP_PGLITE_MODULE) throw new Error('Set NUAPP_PGLITE_MODULE to an isolated test installation of @electric-sql/pglite.');
const cwd = new URL('../', import.meta.url).pathname;
const qaDir = process.env.NUAPP_QA_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(),'nuapp-supplements-qa-'));
fs.mkdirSync(qaDir,{recursive:true});
const server = spawn(process.execPath, ['-r','./tests/helpers/supplements-pglite.cjs','server.js'], {cwd,env:{...process.env,PORT:'3102',DATABASE_URL:'postgres://localhost/isolated-browser-test',SCHEDULER_INTERVAL_MS:'3600000',NUAPP_PGLITE_MODULE:process.env.NUAPP_PGLITE_MODULE}});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
let browser;
try {
  for(let i=0;i<100&&!logs.includes('Servidor listo');i++) await new Promise(r=>setTimeout(r,100));
  assert.ok(logs.includes('Servidor listo'),logs);
  browser=await chromium.launch({headless:true,executablePath:process.env.NUAPP_CHROMIUM_EXECUTABLE || undefined,args:JSON.parse(process.env.NUAPP_CHROMIUM_ARGS || '["--no-sandbox","--disable-dev-shm-usage"]')});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='warning')console.log('browser warning:',m.text().slice(0,180));});
  await page.addInitScript(()=>{
    if(!localStorage.getItem('routineUserProfile')) localStorage.setItem('routineUserProfile',JSON.stringify({userId:'browser-pilot',name:'Prueba',country:'Argentina',timezone:'America/Argentina/Buenos_Aires',notificationTime:'09:00',objective:'Conocer los productos'}));
    sessionStorage.setItem('nuapp:intro-shown:v122','1');
  });
  await page.goto('http://127.0.0.1:3102/',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('[data-routine-id="pharmanex-upcoming"] button');
  await page.locator('[data-routine-id="pharmanex-upcoming"] button').click();
  await page.waitForSelector('#view-suplementos.active');
  assert.equal(await page.locator('.supplement-general li').count(),6);
  assert.equal(await page.locator('.supplement-routines [data-routine-id]').count(),2);
  assert.ok(await page.evaluate(()=>document.querySelector('.supplement-general').compareDocumentPosition(document.querySelector('.supplement-products'))&Node.DOCUMENT_POSITION_FOLLOWING));
  await page.screenshot({path:path.join(qaDir,'supplements-mobile.png'),fullPage:true});
  await page.locator('.supplement-routines [data-routine-id="lifepak-5"] button').click();
  await page.waitForSelector('#view-hoy.day-open');
  assert.equal(await page.locator('#chat .resource-row').count(),3);
  assert.equal(await page.locator('#chat .routine-content-carousel').count(),0);
  assert.ok((await page.locator('#chat').innerText()).includes('TUS MATERIALES DE HOY'));
  // Load and play an actual optimized video inside the existing preview.
  await page.locator('#chat .resource-row-video').first().click();
  console.log('Opening real video');
  await page.getByRole('button',{name:'Reproducir video',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.currentSrc.includes('/supplements/')&&v.readyState>=2));
  const video=await page.evaluate(async()=>{const v=[...document.querySelectorAll('video')].find(v=>v.currentSrc.includes('/supplements/')&&v.readyState>=2);v.muted=true;await v.play();return {duration:v.duration,width:v.videoWidth};});
  assert.ok(video.duration>0&&video.width>0);
  console.log('Video played',video);
  await page.locator('#previewSaveBtn').click();
  await page.evaluate(()=>closeMediaPreview());
  await page.waitForSelector('#mediaPreview[hidden]',{state:'attached'});
  await page.getByRole('button',{name:'Favoritos',exact:true}).click();
  assert.ok((await page.locator('#favoritesList').innerText()).includes('LifePak'));
  await page.evaluate(()=>{activateMainView('hoy');openRoutineFromCardV92a('lifepak-5');});
  await page.waitForSelector('#view-hoy.day-open');
  await page.route('**/api/product-routines/complete', route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Prueba sin conexión'})}));
  await page.locator('#chat .complete-day-btn').click();
  await page.waitForFunction(()=>document.querySelector('#chat .complete-helper')?.textContent==='Prueba sin conexión');
  assert.equal(await page.evaluate(()=>isDayComplete(1)),false);
  assert.ok(await page.locator('#chat .complete-helper').isVisible());
  await page.unroute('**/api/product-routines/complete');
  console.log('Completing day after failed request');
  page.on('response',async r=>{if(r.url().includes('/api/product-routines/complete'))console.log('Complete response',r.status());});
  await page.locator('#chat .complete-day-btn').click();
  try { await page.waitForFunction(()=>document.querySelector('#chat .complete-card')?.classList.contains('done')); } catch(e) { console.log('Completion diagnostics',await page.locator('#chat .complete-card').innerText(),errors); throw e; }
  assert.ok(await page.evaluate(()=>isDayComplete(1)));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof getActiveRoutineId==='function'&&getActiveRoutineId()==='lifepak-5');
  assert.ok(await page.evaluate(()=>isDayComplete(1)));
  await page.evaluate(()=>openRoutineFromCardV92a('colageno-10'));
  await page.waitForSelector('#view-hoy.day-open');
  assert.equal(await page.evaluate(()=>isDayComplete(1)),false);
  await page.locator('#chat .resource-row-image').first().click();
  await page.waitForFunction(()=>document.querySelector('#previewStage img')?.naturalWidth>0);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shared={keys:Object.keys(data),type:data.files[0].type,size:data.files[0].size,name:data.files[0].name};}});
  });
  await page.locator('#previewShareBtn').click();
  await page.waitForFunction(()=>window.__shared);
  const shared=await page.evaluate(()=>window.__shared);
  assert.deepEqual(shared.keys,['files']);assert.equal(shared.type,'image/jpeg');assert.ok(shared.size>1000);
  await page.evaluate(()=>closeMediaPreview());
  await page.waitForSelector('#mediaPreview[hidden]',{state:'attached'});
  await page.locator('#dailyNativeBackBtn').click();
  await page.waitForSelector('#view-suplementos.active');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.locator('#supplementsBackBtn').click();
  await page.waitForSelector('#view-hoy.active');
  assert.equal(await page.locator('.home-routines-section [data-routine-id="collagen-30"]').count(),1);
  await page.setViewportSize({width:1280,height:900});
  await page.locator('[data-routine-id="pharmanex-upcoming"] button').click();
  await page.screenshot({path:path.join(qaDir,'supplements-desktop.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.supplement-routines .home-routine-card')].every(c=>c.scrollWidth<=c.clientWidth+1)));
  // Exercise delivery and actual decoding for every pilot image/video from this origin.
  const assets=JSON.parse(fs.readFileSync(cwd+'docs/supplements-pilot-media.json'));
  for(const asset of assets){
    if(asset.kind==='image'){
      assert.ok(await page.evaluate(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth>0);img.onerror=reject;img.src=src;}),asset.src));
    } else {
      const range=await page.request.get('http://127.0.0.1:3102/'+asset.src,{headers:{Range:'bytes=0-1023'}});
      assert.equal(range.status(),206);assert.equal((await range.body()).length,1024);
      assert.ok(await page.evaluate(src=>new Promise((resolve,reject)=>{const v=document.createElement('video');v.muted=true;v.playsInline=true;v.onloadeddata=async()=>{try{await v.play();v.pause();v.removeAttribute('src');v.load();resolve(true);}catch(e){reject(e.message)}};v.onerror=()=>reject('video decode failed');v.src=src;v.load();}),asset.src));
    }
  }
  console.log('Decoded all 33 images and 12 videos; range requests passed');
  const finalProfile={userId:'browser-final',name:'Final',country:'Argentina',timezone:'America/Argentina/Buenos_Aires',notificationTime:'09:00'};
  await page.request.post('http://127.0.0.1:3102/api/bootstrap',{data:{profile:finalProfile,localState:{currentDay:1},completedDays:[]}});
  await page.request.post('http://127.0.0.1:3102/api/product-routines/bootstrap',{data:{userId:finalProfile.userId,routines:{'lifepak-5':{currentDay:5,completedDays:[1,2,3,4]}}}});
  await page.evaluate(async profile=>{localStorage.setItem('routineUserProfile',JSON.stringify(profile));await BackendAPI.getProductRoutineStatesV136();openRoutineFromCardV92a('lifepak-5');},finalProfile);
  await page.waitForSelector('#view-hoy.day-open');
  assert.equal(await page.locator('#chat .resource-row').count(),3);
  await page.locator('#chat .complete-day-btn').click();
  await page.waitForFunction(()=>document.querySelector('#chat .complete-card')?.textContent.includes('Programa completado'));
  await page.evaluate(()=>activateMainView('rutina'));
  assert.equal(await page.evaluate(()=>TOTAL_PROGRAM_DAYS),5);
  assert.equal(await page.evaluate(()=>getRoutineState().nextUnlockAt),null);
  console.log('LifePak day 5 completed in browser without a sixth day');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({status:'PASS',video,checks:['mobile navigation and back','6 general actions above 2 products','3 materials without tasks','33 images and 12 videos decoded','video Range 206','JPEG share payload without caption','favorite saved','completion failure and retry','completion confirmed and persistent after reload','program isolation','Collagen+ card preserved','no horizontal overflow','desktop layout','no JS errors']}));
} finally {await browser?.close();server.kill('SIGTERM');}
