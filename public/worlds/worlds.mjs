import { courtyard, signalMap, petrol, comicArt, mountain, mountainMode, weatherKind } from './art.mjs';
const views = ['transmission','courtyard','petrol','comic','mountain'];
const params = new URLSearchParams(location.search);
const selected = views.includes(params.get('view')) ? params.get('view') : 'all';
const displayOnly = params.get('display') === '1';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = value => new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const date = value => new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',day:'numeric',month:'short'}).format(new Date(value));
const exact = value => Number.isFinite(value) ? String(Number(value.toFixed(1))) : '—';
const degrees = value => `${exact(value)}°C`;
const roundedDegrees = value => `${Number.isFinite(value) ? Math.round(value) : '—'}°C`;
let data, loading = false;
const study = document.getElementById('study');
const validStudies = [...study.options].map(option=>option.value);
if (!displayOnly && validStudies.includes(params.get('study'))) study.value=params.get('study');

export function conditions(c={}) {
  const code=c.weather_code;
  if(!Number.isFinite(code)) return 'Weather unavailable';
  if(code===0) return c.is_day===0?'Clear night':'Clear sky';
  if(code<=2) return 'Partly cloudy';
  if(code===3) return 'Overcast';
  if(code<=48) return 'Fog';
  if([71,73,75,77,85,86].includes(code)) return 'Snow';
  if([56,57,66,67].includes(code)) return 'Freezing rain';
  if(code>=95) return 'Thunderstorms';
  return 'Rain';
}
export function solarPosition(weather, now) {
  const rise=weather.today?.sunrise, set=weather.today?.sunset;
  if(!Number.isFinite(rise)||!Number.isFinite(set)||set<=rise) return {phase:'unknown',position:0,progress:0};
  const seconds=now/1000, duration=set-rise;
  const progress=Math.max(0,Math.min(1,(seconds-rise)/duration));
  const phase=seconds<rise?'dawn':seconds>=set?'night':'day';
  return {phase,progress,position:progress*Math.min(1,duration/(16*3600)),duration,rise,set};
}
function adapt(raw) {
  const result=structuredClone(raw);
  result.world = result.world?.status==='ok' ? result.world : {
    status:'unavailable',transmission:null,message:'The station log is unavailable.',
    memory:'World memory unavailable. The courtyard is waiting.',
    cat:{name:'Miso',spot:'windowsill'},leaf:{visible:false,position:0},vehicle:'none',episode:0,journal:[],
  };
  result.sceneNow=Date.parse(result.generatedAt);
  const scenario=displayOnly?'live':study.value;
  result.study=scenario;
  if(scenario==='live') return result;
  const conditionStudy=scenario.replace(/-night$/,'');
  const nightStudy=scenario==='night'||scenario.endsWith('-night');
  const c=result.weather.current ||= {};
  const w=result.weather;
  Object.assign(c,{temperature_2m:18.4,apparent_temperature:18.1,weather_code:0,is_day:1,wind_speed_10m:6.8});
  w.today ||= {};
  w.today.peakPrecipitationProbability=0;
  const rise=w.today.sunrise, set=w.today.sunset;
  if(Number.isFinite(rise)&&Number.isFinite(set)) result.sceneNow=(rise+set)*500;
  if(conditionStudy==='rain') {
    Object.assign(c,{temperature_2m:9.6,apparent_temperature:7.2,weather_code:61,wind_speed_10m:12.4});
    result.world.puddles=true;
    result.world.cat.spot='windowsill';
    result.world.memory='Rain left a puddle. The courtyard kept it.';
    w.today.peakPrecipitationProbability=85;
  } else if(conditionStudy==='snow') {
    Object.assign(c,{temperature_2m:-3.2,apparent_temperature:-7.1,weather_code:73,wind_speed_10m:16.2});
    result.world.cat.spot='windowsill';
    // A hypothetical eight-hour winter climb, never written to world memory.
    const base=Math.floor(Date.parse(result.generatedAt)/86400000)*86400;
    w.today.sunrise=base+7*3600; w.today.sunset=base+15*3600;
    result.sceneNow=(w.today.sunrise+w.today.sunset)*500;
    w.today.peakPrecipitationProbability=90;
  } else if(conditionStudy==='wind') {
    Object.assign(c,{temperature_2m:12.8,apparent_temperature:8.3,weather_code:2,wind_speed_10m:31.4});
    result.world.leaf={visible:true,position:3};
    result.world.cat.spot='doorstep';
    result.world.memory='A change in the wind. The leaf has moved.';
    w.today.peakPrecipitationProbability=20;
  } else if(scenario==='night') {
    Object.assign(c,{temperature_2m:5.3,apparent_temperature:2.7,weather_code:0,is_day:0,wind_speed_10m:4.5});
    result.sceneNow=Number.isFinite(set)?set*1000+3*3600000:result.sceneNow;
    result.world.cat.spot='windowsill';
    result.world.vehicle='van';
  } else {
    result.world.cat.spot='bench';
    result.world.vehicle='hatchback';
  }
  if(nightStudy) {
    c.is_day=0;
    const sunset=w.today.sunset;
    result.sceneNow=Number.isFinite(sunset)?sunset*1000+3*3600000:result.sceneNow;
    result.world.cat.spot='windowsill';
  }
  return result;
}
function tramStrip(d) {
  if(d.transit.status!=='ok') return '<div class="tram-strip"><p>Tram timetable unavailable.</p><p>Check the connection.</p></div>';
  return `<div class="tram-strip" aria-label="Scheduled departures at Ortenovo náměstí">${d.transit.platforms.map(p=>`<section class="tram-direction"><h3>Towards ${escape(p.direction)}</h3><div class="tram-items">${p.departures.slice(0,2).map(t=>{
    const minutes=Math.max(0,Math.ceil((Date.parse(t.time)-Date.parse(d.generatedAt))/60000));
    return `<span class="tram-item"><span class="route">${escape(t.line)}</span><time datetime="${escape(t.time)}">${clock(t.time)}</time><b>${minutes} min</b></span>`;
  }).join('')||'No departures in the next two hours.'}</div></section>`).join('')}</div>`;
}
function footer(d) {
  const w=d.weather;
  const source=w.current?.time?`Weather ${clock(w.current.time*1000)}${w.status==='stale'?' (stale)':''}`:'Weather unavailable';
  return `<footer class="world-footer"><span>Open-Meteo / PID (CC BY)</span><span>${d.study==='live'?source:'Weather study / simulated'} / scheduled trams</span><time datetime="${escape(d.generatedAt)}">${clock(d.generatedAt)}</time></footer>`;
}
function studyBanner(d) {
  return d.study==='live'?'':`<div class="study-banner">${escape(study.selectedOptions[0].textContent)} / simulated weather</div>`;
}
function finish(content,d) { return `<div class="world-content">${content}${studyBanner(d)}</div>${tramStrip(d)}${footer(d)}`; }
function probability(d) { const p=d.weather.today?.peakPrecipitationProbability; return Number.isFinite(p)?`${p}%`:'—'; }
function renderTransmission(d) {
  const c=d.weather.current||{},world=d.world;
  const number=world.transmission===null?'????':String(world.transmission).padStart(4,'0');
  return finish(`<header class="transmission-header"><div><h2>STATION HOLEŠOVICE</h2><p>50.107826° N / 14.447080° E</p></div><div class="transmission-number">Transmission ${number}<br>${date(d.generatedAt)} / ${clock(d.generatedAt)}</div></header>
    <div class="transmission-body"><figure class="signal-map">${signalMap(c)}<figcaption>Fictional sector scan / receiver at Ortenovo náměstí</figcaption></figure><section class="signal-weather" aria-label="Current weather observations"><p class="signal-temp">${exact(c.temperature_2m)}<span>°C</span></p><h3>${conditions(c)}</h3><dl><dt>Feels like</dt><dd>${degrees(c.apparent_temperature)}</dd><dt>Wind</dt><dd>${exact(c.wind_speed_10m)} km/h</dd><dt>Peak precip. today</dt><dd>${probability(d)}</dd></dl></section></div>
    <div class="signal-message"><p>${escape(world.message)}</p><div class="signal-channels">NAS: not connected<br>Indoor: not connected<br>Outside: ${d.weather.status==='ok'?'signal received':d.weather.status==='stale'?'saved signal':'no signal'}</div></div>`,d);
}
function renderCourtyard(d) {
  const c=d.weather.current||{};
  return finish(`${courtyard(c,d.world)}<h2 class="scene-heading">Life between the windows.</h2><p class="scene-subtitle">Miso’s favourite place: the windowsill.</p><div class="courtyard-reading"><strong>${degrees(c.temperature_2m)}</strong><p>${conditions(c)}</p><p>Feels like ${degrees(c.apparent_temperature)}</p><p>${probability(d)} peak precip. today</p></div><p class="courtyard-note">${escape(d.world.memory)}</p>`,d);
}
function renderPetrol(d) {
  const c=d.weather.current||{};
  document.getElementById('world-petrol').classList.toggle('is-night',c.is_day===0);
  return finish(`${petrol(c,d.world)}<h2 class="scene-heading">The last stop before nowhere.</h2><p class="scene-subtitle">Holešovice, at the edge of an imaginary road.</p><section class="petrol-board" aria-label="Weather price board"><h3>LAST STOP</h3><dl><dt>Temperature</dt><dd>${exact(c.temperature_2m)}<small> °C</small></dd><dt>Feels like</dt><dd>${exact(c.apparent_temperature)}<small> °C</small></dd><dt>Wind</dt><dd>${exact(c.wind_speed_10m)}<small> km/h</small></dd></dl></section><p class="petrol-caption">${conditions(c)}. ${probability(d)} peak precip. today. ${d.world.vehicle==='none'?'No one has stopped by.':'Someone has stopped for a little while.'}</p>`,d);
}
function comicEpisode(d) {
  const c=d.weather.current||{},kind=weatherKind(c),variant=d.world.episode||0;
  let story;
  if(kind==='unknown') story=['Outside is a mystery.','The receiver is quiet.','We pack a layer.','Try again soon.'];
  else if(kind==='rain') story=[['The outside called.','It sounded wet.','We negotiated.','Umbrella treaty.'],['A quick walk?','A small umbrella.','A very large sky.','Still counts.'],['Plan: stay dry.','The sky objected.','We brought backup.','Negotiations open.']][variant];
  else if(kind==='snow') story=[['Five more minutes.','The world is a fridge.','Add one more layer.','Ready. Mostly.'],['The bed is warm.','The air has teeth.','The hat is essential.','Very small steps.'],['A white morning.','A cold nose.','A brave little coat.','Outside, eventually.']][variant];
  else if(kind==='wind') story=[['Something is calling.','It is very loud.','It wants my scarf.','Scarf retained.'],['A quiet little walk.','A dramatic entrance.','The wind has notes.','We lean into it.'],['Today: outside.','Today: sideways.','A leaf overtakes us.','A worthy opponent.']][variant];
  else if(c.apparent_temperature<8) story=[['The blanket wins.','Outside disagrees.','Jacket? Definitely.','A small expedition.'],['Just one more minute.','Perhaps two.','The coat intervenes.','Fine. Let’s go.'],['A warm little bed.','A cold little world.','We can work with this.','Layer achieved.']][variant];
  else if(c.apparent_temperature>=24) story=[['Already too warm.','Even in here.','Find some shade.','Shade is a plan.'],['A sunny invitation.','An ambitious sun.','We brought a hat.','A shady compromise.'],['A little walk.','A lot of sunshine.','The tree understands.','Staying right here.']][variant];
  else if(c.is_day===0) story=[['The day was quite a lot.','Outside is quieter.','One tiny night walk.','Then back to bed.'],['One last look outside.','The moon is up.','We say hello.','A quiet conclusion.'],['Bed, or a walk?','A very small walk.','The stars agree.','Bed wins next.']][variant];
  else story=[['A day is happening.','We should investigate.','A very small adventure.','Outside approved.'],['The outside called.','It sounded nice.','We took the scenic way.','Worth getting up.'],['No great plans.','A perfectly good sky.','A little wandering.','That was the plan.']][variant];
  const visualKind=kind==='clear'&&c.apparent_temperature<8?'cold':kind==='clear'&&c.apparent_temperature>=24?'hot':c.is_day===0&&kind==='clear'?'night':kind;
  return {story,visualKind};
}
function renderComic(d) {
  const c=d.weather.current||{}, {story,visualKind}=comicEpisode(d);
  return finish(`<header class="comic-header"><h2>Small weather. Big feelings.</h2><span>${date(d.generatedAt)} / ${clock(d.generatedAt)}</span></header><div class="comic-panels">${story.map((line,i)=>`<section class="comic-panel" aria-label="Panel ${i+1}"><p>${escape(line)}</p>${comicArt(i,visualKind,d.world.episode,c.is_day===0)}${i===3?`<div><p class="comic-temp">${degrees(c.temperature_2m)}</p><p class="exact-condition">${conditions(c)}</p></div>`:`<p class="panel-caption">${i===0?'Meanwhile, in Holešovice.':i===1?'A brief internal debate.':'The outside gets a vote.'}</p>`}</section>`).join('')}</div><p class="comic-tagline">Feels like ${degrees(c.apparent_temperature)}. ${probability(d)} peak precip. today. A new episode every three hours.</p>`,d);
}
function renderMountain(d) {
  const c=d.weather.current||{},solar=solarPosition(d.weather,d.sceneNow);
  document.getElementById('world-mountain').classList.toggle('is-night',mountainMode(c,solar)==='night');
  const caption=solar.phase==='night'?'Daylight is done. Camp is up.':solar.phase==='dawn'?'Still at base camp. Waiting for sunrise.':solar.phase==='unknown'?'Waiting for the daylight report.':'A little further before the light goes.';
  const saved=d.weather.status==='stale'?' (saved forecast)':'';
  const headline=d.mountainGreeting?.text||d.greeting?.text||'Good for one little adventure.';
  return `<div class="world-content">${mountain(c,solar)}<h2 class="scene-heading">${escape(headline)}</h2><p class="scene-subtitle">${caption}</p><p class="mountain-observations">${conditions(c)}${saved} / Wind ${exact(c.wind_speed_10m)} km/h<br>${probability(d)} peak precip. today</p><div class="mountain-marker"><strong>${roundedDegrees(c.temperature_2m)}</strong><p>Feels like ${roundedDegrees(c.apparent_temperature)}</p></div></div>
    <div class="mountain-bottom">${tramStrip(d)}<time class="mountain-clock" datetime="${escape(d.generatedAt)}" aria-label="Current time in Prague">${clock(d.generatedAt)}</time></div>`;
}

const renderers={transmission:renderTransmission,courtyard:renderCourtyard,petrol:renderPetrol,comic:renderComic,mountain:renderMountain};
function fit() { document.querySelectorAll('.world-wrap').forEach(wrap=>wrap.style.setProperty('--scale',wrap.clientWidth/800)); }
function render() {
  if(!data) return;
  const d=adapt(data);
  const visible=displayOnly?[selected==='all'?'transmission':selected]:selected==='all'?views:[selected];
  for(const view of visible) {
    const node=document.getElementById(`world-${view}`);
    node.classList.toggle('is-night',d.weather.current?.is_day===0);
    node.innerHTML=renderers[view](d);
  }
  document.getElementById('station-log').innerHTML=(data.world?.journal||[]).slice(-3).reverse().map(entry=>`<li><time datetime="${escape(entry.date)}">${escape(entry.date)} / Transmission ${entry.transmission}</time>${escape(entry.message)}</li>`).join('')||'<li>World memory unavailable. Weather and trams still work.</li>';
  const status=d.study!=='live'?'Weather study. Simulated weather; tram times remain the actual published schedule.':[
    data.weather.status==='ok'?'Actual Holešovice weather':data.weather.status==='stale'?'Saved weather (stale)':'Weather unavailable',
    data.transit.status==='ok'?'both tram directions loaded':'tram timetable unavailable',
    data.world?.status==='ok'?'world memory saved':'world memory unavailable',
  ].join(' / ')+'.';
  document.getElementById('study-status').textContent=status;
  window.dashboardData=data;
  window.worldsData=d;
  document.documentElement.dataset.ready='true';
  fit();
}
async function refresh() {
  if(loading) return;
  loading=true;
  const button=document.getElementById('refresh-worlds');
  button.disabled=true; button.setAttribute('aria-busy','true');button.textContent='Receiving…';
  try {
    const response=await fetch('/api/dashboard',{signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error('Data request failed');
    data=await response.json(); render();
  } catch {
    document.getElementById('study-status').textContent='The station cannot receive data. Check the connection and try Refresh data.';
    if(data) {
      data=structuredClone(data);
      if(data.weather.current) data.weather.status='stale';
      data.transit={status:'unavailable',platforms:[]};
      render();
      document.getElementById('study-status').textContent='Connection lost. Showing saved weather; old tram countdowns are hidden.';
    } else {
      document.querySelectorAll('.world-canvas').forEach(node=>node.innerHTML='<div class="unavailable-world"><h2>The station is quiet.</h2><p>Weather and tram data could not load.<br>Check the connection and refresh the page.</p></div>');
      document.documentElement.dataset.ready='error';
    }
  } finally {loading=false;button.disabled=false;button.removeAttribute('aria-busy');button.textContent='Refresh data';}
}
if(displayOnly) document.body.classList.add('display-only');
for(const node of document.querySelectorAll('[data-world]')) node.hidden=selected!=='all'?node.dataset.world!==selected:displayOnly&&node.dataset.world!=='transmission';
for(const link of document.querySelectorAll('[data-view]')) if(link.dataset.view===selected) link.setAttribute('aria-current','page');
study.addEventListener('change',()=>{
  const url=new URL(location.href);
  if(study.value==='live') url.searchParams.delete('study');else url.searchParams.set('study',study.value);
  history.replaceState(null,'',url);render();
});
document.getElementById('refresh-worlds').addEventListener('click',refresh);
for(const button of document.querySelectorAll('[data-export]')) button.addEventListener('click',async()=>{
  button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Rendering…';
  try {
    const response=await fetch(`/api/render?design=${button.dataset.export}`);
    if(!response.ok) throw new Error(await response.text());
    const url=URL.createObjectURL(await response.blob());
    const a=document.createElement('a');a.href=url;a.download=`${button.dataset.export}-800x480.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    button.textContent='Downloaded';
  } catch(error) {document.getElementById('study-status').textContent=error.message;button.textContent='Retry live PNG';}
  finally {button.disabled=false;button.removeAttribute('aria-busy');}
});
new ResizeObserver(fit).observe(document.getElementById('worlds'));
fit();refresh();
if(!displayOnly) setInterval(refresh,60000);
