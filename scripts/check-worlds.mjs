import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launch, ready } from './browser.mjs';

const base=process.env.DASHBOARD_URL||'http://127.0.0.1:8790';
const views=['transmission','courtyard','petrol','comic','mountain'];
const browser=await launch();
const errors=[];
await mkdir('previews',{recursive:true});
try {
  const page=await browser.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1440,800,390,320]) {
    await page.setViewport({width,height:900,deviceScaleFactor:1});
    await ready(page,`${base}/worlds.html`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Gallery overflow at ${width}`);
    assert.equal(await page.$$eval('[data-world]:not([hidden])',nodes=>nodes.length),5);
    assert.equal(await page.$$eval('.world-wrap',nodes=>nodes.every(el=>{
      const wrap=el.getBoundingClientRect(),canvas=el.firstElementChild.getBoundingClientRect();
      return Math.abs(wrap.bottom-canvas.bottom)<1&&Math.abs(wrap.width-canvas.width)<1;
    })),true,`Canvas scaling at ${width}`);
  }
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await ready(page,`${base}/worlds.html`);
  const real=await page.evaluate(()=>window.dashboardData);
  assert.equal(real.weather.status,'ok');
  assert.equal(real.world.status,'ok');
  assert.equal(real.world.fictional,true);
  assert.equal(real.transit.platforms.length,2);
  assert.equal(await page.$eval('#world-mountain .scene-heading',node=>node.textContent),real.mountainGreeting.text);
  const headlineOverflow=await page.evaluate(async()=>{
    const phrases=(await Promise.all(['/phrases.json','/mountain-phrases.json'].map(async path=>(await fetch(path)).json()))).flat();
    const heading=document.querySelector('#world-mountain .scene-heading');
    const original=heading.textContent;
    const subtitle=document.querySelector('#world-mountain .scene-subtitle').getBoundingClientRect();
    const screen=document.getElementById('world-mountain').getBoundingClientRect();
    const failures=[];
    for(const phrase of phrases) {
      heading.textContent=phrase.text;
      const bounds=heading.getBoundingClientRect();
      if(bounds.bottom>subtitle.top||bounds.right>screen.right) failures.push(phrase.text);
    }
    heading.textContent=original;
    return {count:phrases.length,failures};
  });
  assert.equal(headlineOverflow.count,200);
  assert.deepEqual(headlineOverflow.failures,[],'Seasonal headline overlaps the mountain caption');
  const originalWorld=JSON.stringify(real.world);
  const backgrounds={clear:'mountain-day.png',rain:'mountain-day-rain.png',snow:'mountain-day-snow.png',wind:'mountain-day-wind.png',night:'mountain-night.png','rain-night':'mountain-night-rain.png','snow-night':'mountain-night-snow.png','wind-night':'mountain-night-wind.png'};
  for(const scenario of ['live',...Object.keys(backgrounds)]) {
    await page.select('#study',scenario);
    await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));
    assert.equal(await page.evaluate(()=>window.worldsData.study),scenario);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.dashboardData.world)),originalWorld,'Studies mutated real world data');
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.world-canvas')].flatMap(screen=>{
      const bounds=screen.getBoundingClientRect();
      return [...screen.querySelectorAll('h2,h3,p,dt,dd,figcaption,time,.signal-channels')].filter(node=>{
        const r=node.getBoundingClientRect();
        return r.width&&r.height&&(r.right>bounds.right+1||r.left<bounds.left-1||r.bottom>bounds.bottom+1||r.top<bounds.top-1);
      }).map(node=>`${screen.id}: ${node.textContent}`);
    }));
    assert.deepEqual(overflow,[],`${scenario} text exceeds physical canvas`);
    if(scenario==='night'||scenario.endsWith('-night')) {
      assert.equal(await page.$$eval('.world-courtyard .scene-heading,.world-mountain .scene-heading',nodes=>nodes.every(node=>getComputedStyle(node).color==='rgb(255, 255, 255)')),true);
    }
    const mountainImage=await page.$eval('.mountain-background',img=>({src:img.getAttribute('src'),width:img.width,height:img.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}));
    if(scenario!=='live') assert.ok(mountainImage.src.endsWith(backgrounds[scenario]),`${scenario} chose the wrong artwork`);
    assert.ok(Math.abs(mountainImage.width/mountainImage.height-mountainImage.naturalWidth/mountainImage.naturalHeight)<.003,'Background aspect ratio changed');
    assert.equal(await page.$eval('#world-mountain',node=>{
      const text=node.textContent;
      return !node.querySelector('.study-banner,.mountain-caption,.world-footer')
        && !/Open-Meteo|PID|Sunrise|Sunset|simulated weather|daylight used/.test(text);
    }),true,'Mountain still contains the removed labels');
    assert.ok(await page.$eval('.mountain-clock',node=>parseFloat(getComputedStyle(node).fontSize)>=40),'Mountain clock is too small');
    // Capture all scenes in this weather for a visual contact sheet.
    for(const view of views) {
      await page.$eval(`#world-${view}`,node=>node.scrollIntoView({block:'center'}));
      await (await page.$(`#world-${view}`)).screenshot({path:`previews/${view}-${scenario}.png`});
    }
  }
  const solar=await page.evaluate(async()=>{
    const {solarPosition}=await import('/worlds/worlds.mjs');
    return {
      summer:solarPosition({today:{sunrise:1000,sunset:1000+16*3600}},(1000+8*3600)*1000),
      winter:solarPosition({today:{sunrise:1000,sunset:1000+8*3600}},(1000+4*3600)*1000),
      after:solarPosition({today:{sunrise:1000,sunset:2000}},3000*1000),
      missing:solarPosition({},3000*1000),
    };
  });
  assert.equal(solar.summer.progress,.5);
  assert.equal(solar.winter.progress,.5);
  assert.equal(solar.winter.position,solar.summer.position/2);
  assert.equal(solar.after.phase,'night');
  assert.equal(solar.missing.phase,'unknown');
  const trail=await page.evaluate(async()=>{
    const {trailPoint,mountainMode}=await import('/worlds/art.mjs');
    return {points:[0,.25,.5,.75,1].map(trailPoint),
      sunset:mountainMode({is_day:1},{phase:'night'}),
      sunrise:mountainMode({is_day:0},{phase:'day'}),
      dawn:mountainMode({is_day:0},{phase:'dawn'})};
  });
  assert.deepEqual(trail.points[0],[164,363]);
  assert.ok(Math.abs(trail.points[4][0]-448)<.001&&Math.abs(trail.points[4][1]-77)<.001);
  assert.ok(trail.points[1][1]>trail.points[2][1]&&trail.points[2][1]>trail.points[3][1],'Climber does not gain altitude through the day');
  assert.equal(trail.sunset,'night','Background must switch at sunset even if current weather is cached');
  assert.equal(trail.sunrise,'day');
  assert.equal(trail.dawn,'night');
  const artworkRules=await page.evaluate(async()=>{
    const {mountainBackground}=await import('/worlds/art.mjs');
    return {
      rainInWind:mountainBackground({weather_code:61,wind_speed_10m:45},{phase:'night'}).src,
      snowInWind:mountainBackground({weather_code:73,wind_speed_10m:45},{phase:'day'}).src,
      coldClear:mountainBackground({weather_code:0,temperature_2m:-8,wind_speed_10m:5},{phase:'day'}).src,
      cloudy:mountainBackground({weather_code:3,wind_speed_10m:5},{phase:'night'}).src,
    };
  });
  assert.ok(artworkRules.rainInWind.endsWith('mountain-night-rain.png'));
  assert.ok(artworkRules.snowInWind.endsWith('mountain-day-snow.png'));
  assert.ok(artworkRules.coldClear.endsWith('mountain-day.png'),'Cold alone must not invent snowfall');
  assert.ok(artworkRules.cloudy.endsWith('mountain-night.png'),'Unprovided weather art must use a valid base image');
  for(const view of views) {
    await page.setViewport({width:800,height:480,deviceScaleFactor:1});
    await ready(page,`${base}/worlds.html?view=${view}&display=1&study=snow`);
    assert.equal(await page.evaluate(()=>window.worldsData.study),'live','Display URLs must never use simulated weather');
    assert.deepEqual(await page.$eval(`#world-${view}`,el=>{
      const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:el.scrollHeight};
    }),{x:0,y:0,width:800,height:480,scroll:480});
    assert.equal(await page.$$eval('[data-world]:not([hidden])',nodes=>nodes.length),1);
  }
  // Missing providers must remain explicit rather than filling in fake measurements.
  const unavailable={...real,weather:{status:'unavailable'},transit:{status:'unavailable',platforms:[]},world:{status:'unavailable'}};
  await page.setRequestInterception(true);
  page.on('request',request=>{
    if(request.url().includes('/api/dashboard')) request.respond({contentType:'application/json',body:JSON.stringify(unavailable)});
    else request.continue();
  });
  for(const view of views) {
    await ready(page,`${base}/worlds.html?view=${view}&display=1`);
    const text=await page.$eval(`#world-${view}`,node=>node.textContent);
    assert.ok(text.includes('Weather unavailable')||text.includes('Sunrise and sunset unavailable'),view);
    assert.ok(text.includes('Tram timetable unavailable'),view);
  }
  assert.deepEqual(errors,[]);
  console.log('Worlds browser checks passed: four gallery widths, nine weather studies, eight mountain backgrounds, five 800x480 display views, simulation isolation, weather priority, daylight mapping and unavailable data.');
} finally {await browser.close();}
