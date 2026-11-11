import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launch } from './browser.mjs';
const base=process.env.DASHBOARD_URL||'http://127.0.0.1:8792';
await mkdir('previews',{recursive:true});
const browser=await launch();
try {
  const page=await browser.newPage();
  let selected='station',shown='station',failSave=false;
  const posts=[];
  await page.setRequestInterception(true);
  page.on('request',request=>{
    if(!request.url().includes('/api/display/settings')) return request.continue();
    if(request.method()==='POST') {
      if(failSave) return request.respond({status:503,contentType:'application/json',body:JSON.stringify({error:'Could not save this choice.'})});
      const body=JSON.parse(request.postData());posts.push(body);selected=body.design;
    }
    request.respond({status:request.method()==='POST'?202:200,contentType:'application/json',body:JSON.stringify({
      design:selected,hardwareEnabled:true,refreshQueued:true,
      display:{state:'ok',design:shown,lastDisplayedDesign:shown,lastSuccess:new Date().toISOString()},
    })});
  });
  for(const width of [320,390,800,1440]) {
    await page.setViewport({width,height:900,deviceScaleFactor:1});
    await page.goto(`${base}/display.html`,{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>document.documentElement.dataset.settingsReady==='true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Chooser overflow at ${width}`);
    assert.equal(await page.$eval('#choose-station',node=>node.checked),true);
  }
  await page.click('#choose-mountain');
  await page.click('#check-display');
  await page.waitForFunction(()=>!document.getElementById('check-display').disabled);
  assert.equal(await page.$eval('#choose-mountain',node=>node.checked),true,'Status polling erased an unsaved choice');
  await page.click('#apply-dashboard');
  await page.waitForFunction(()=>document.getElementById('selection-status').textContent.includes('Switching to Daylight Mountain'));
  assert.deepEqual(posts.at(-1),{design:'mountain'});
  assert.ok((await page.$eval('#physical-status',node=>node.textContent)).includes('Little Adventure'),'UI claimed hardware changed before completion');
  shown='mountain';
  await page.click('#check-display');
  await page.waitForFunction(()=>document.getElementById('selection-status').textContent.includes('Daylight Mountain is on the screen'));
  await page.reload({waitUntil:'networkidle0'});
  assert.equal(await page.$eval('#choose-mountain',node=>node.checked),true,'Saved choice was lost on reload');
  await page.setViewport({width:800,height:900,deviceScaleFactor:1});
  await page.screenshot({path:'previews/display-picker.png',fullPage:true});
  await page.click('#choose-station');
  await page.click('#apply-dashboard');
  await page.waitForFunction(()=>document.getElementById('selection-status').textContent.includes('Switching to Little Adventure'));
  assert.deepEqual(posts.at(-1),{design:'station'});
  failSave=true;
  await page.click('#choose-mountain');
  await page.click('#apply-dashboard');
  await page.waitForFunction(()=>document.getElementById('selection-status').textContent.includes('Could not save this choice'));
  await page.click('#check-display');
  await page.waitForFunction(()=>document.getElementById('choose-station').checked);
  console.log('Display chooser checks passed: four widths, both choices, pending versus shown state, reload persistence, unsaved edits and failed saves. No physical updates were requested.');
} finally {await browser.close();}
