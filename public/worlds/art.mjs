// Code-native illustration: each small world changes shape with the weather.
export const rainy = new Set([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]);
export const snowy = new Set([71,73,75,77,85,86]);
export function weatherKind(c = {}) {
  if (!Number.isFinite(c.weather_code)) return 'unknown';
  if (snowy.has(c.weather_code)) return 'snow';
  if (rainy.has(c.weather_code)) return 'rain';
  if (c.wind_speed_10m >= 20) return 'wind';
  if (c.weather_code >= 45 && c.weather_code <= 48) return 'fog';
  if (c.weather_code >= 2) return 'cloud';
  return 'clear';
}
export function definitions(id) {
  return `<defs>
    <pattern id="${id}-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle class="ink" cx="1" cy="1" r=".7"/></pattern>
    <pattern id="${id}-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><path class="fine-line" d="M-2 2 2-2M0 7 7 0M5 9 9 5"/></pattern>
    <pattern id="${id}-brick" width="24" height="12" patternUnits="userSpaceOnUse"><path class="fine-line" d="M0 12H24M12 0V12"/></pattern>
  </defs>`;
}
export function svg(content, id, night = false, label = 'A fictional weather scene') {
  return `<svg class="scene-art${night ? ' night' : ''}" viewBox="0 0 800 402" role="img" aria-label="${label}">${definitions(id)}${content}</svg>`;
}
export function cloud(x, y, scale = 1, extra = '') {
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path class="outline ${extra}" d="M-39 20C-68 20-68-15-44-18-48-55 9-64 22-28 53-43 76-7 53 13 45 20 36 20 28 20Z"/><path class="fine-line ${extra}" d="M-31 29H37M-14 37H53"/></g>`;
}
export function celestial(c, x = 675, y = 89, id = 'sky') {
  const kind = weatherKind(c);
  if (kind === 'unknown') return '';
  if (kind === 'cloud' || kind === 'fog' || kind === 'rain' || kind === 'snow') return cloud(x, y, .65, 'sky-mark');
  if (c.is_day === 0) return `<path class="outline sky-mark" d="M${x+8} ${y-29}a31 31 0 1 0 23 49 32 32 0 0 1-23-49Z"/>`;
  return `<g class="line-art sky-mark"><circle cx="${x}" cy="${y}" r="23"/>${Array.from({length:8}, (_,i) => { const a=i*Math.PI/4; return `<path d="M${x+Math.cos(a)*31} ${y+Math.sin(a)*31}l${Math.cos(a)*9} ${Math.sin(a)*9}"/>`; }).join('')}</g>`;
}
export function sky(c, id, {stars = true, weather = true} = {}) {
  const night = c.is_day === 0;
  const marks = night && stars ? Array.from({length:29}, (_,i) => `<circle class="star" cx="${31+(i*137)%745}" cy="${77+(i*43)%130}" r="${i%4===0?1.4:.8}"/>`).join('') : '';
  return `<rect class="sky" width="800" height="402"/>${marks}${weather?celestial(c,675,88,id):''}`;
}
export function precipitation(c, id, start = 95, end = 340) {
  const kind = weatherKind(c);
  if (kind === 'rain') return `<g class="line-art">${Array.from({length:27},(_,i)=>{const x=28+(i*73)%748,y=start+(i*47)%(end-start);return `<path d="m${x} ${y}-6 13"/>`;}).join('')}</g>`;
  if (kind === 'snow') return `<g class="line-art">${Array.from({length:22},(_,i)=>{const x=28+(i*89)%748,y=start+(i*53)%(end-start);return `<path d="M${x-3} ${y}h6m-3-3v6"/>`;}).join('')}</g>`;
  if (kind === 'wind') return `<g class="line-art"><path d="M43 124h95q22 0 20-16m-91 31h131q25 0 24-16M565 148h119q24 0 23-17m-88 32h98"/></g>`;
  if (kind === 'fog') return `<g class="line-art"><path d="M0 255H310m75 0H800M95 273H610M0 290H190m80 0H800"/></g>`;
  return '';
}
export function cat(x, y, scale = 1, facing = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale*facing} ${scale})">
    <path class="outline" d="M-13 0q-10-8-7-23l-1-14 11 7q11-3 19 1l11-7-2 19q4 12-7 17Z"/>
    <path class="outline" d="M-17-2q-15 3-15-13-1-9-8-11-9-1-6 8 2 5 6 2"/>
    <path class="line-art" d="M-9-18h1m12 0h1m-6 5 3 2 3-2m-14 2-9-1m11 5-10 2m22-6 10-1m-12 5 11 1"/>
  </g>`;
}
function windowFrame(x,y,w,h,lit=false) {
  return `<g><rect class="outline" x="${x}" y="${y}" width="${w}" height="${h}"/><rect class="${lit?'paper':'ink'}" x="${x+5}" y="${y+5}" width="${w-10}" height="${h-10}"/><path class="line-art" d="M${x+w/2} ${y+3}v${h-6}M${x+2} ${y+h/2}h${w-4}M${x-4} ${y+h+3}h${w+8}"/></g>`;
}
export function courtyard(c, world) {
  const id='yard';
  const night=c.is_day===0;
  let buildings=`<path class="building" d="M0 128 166 107 166 327 0 364ZM166 107 485 113 485 327 166 327ZM485 113 800 87 800 369 485 327Z"/>`;
  buildings+=`<path class="fine-line" d="M0 151 166 131 485 137 800 112M166 107V327M485 113V327M16 343 166 311M501 313 783 349"/>`;
  for(const [x,y,w,h] of [[28,167,48,70],[98,155,40,68],[192,151,57,63],[288,151,57,63],[389,151,57,63],[191,246,57,62],[389,246,57,62],[535,148,54,69],[635,137,54,69],[729,125,44,68],[536,248,54,59],[635,248,54,71],[729,248,44,80]]) buildings+=windowFrame(x,y,w,h,night&&x===192);
  const spot=world.cat?.spot||'windowsill';
  const catPosition=spot==='bench'?[567,325,1]:spot==='doorstep'?[325,326,.9]:[222,212,.72];
  const puddles=world.puddles?`<ellipse class="outline" cx="453" cy="362" rx="65" ry="8"/><path class="fine-line" d="M405 362h78m-45-4h43m-23 8h30"/><ellipse class="outline" cx="165" cy="358" rx="34" ry="5"/>`:'';
  const leafLocations=[[106,340],[356,359],[661,357],[718,339]];
  const [lx,ly]=leafLocations[world.leaf?.position||0];
  const leaf=world.leaf?.visible?`<g transform="translate(${lx} ${ly}) rotate(-20)"><path class="outline" d="M-10 1Q-4-13 11-4Q7 7-10 1Z"/><path class="line-art" d="m-13 5 20-9"/></g>`:'';
  return svg(`${sky(c,id,{weather:false})}${buildings}
    <path class="outline" d="M0 365 166 327H485L800 369V402H0Z"/>
    <path class="fine-line" d="M85 402 231 327M374 402 361 327M672 402 472 327M0 382H800M49 351H671"/>
    <path class="outline" d="M282 327v-75q20-25 40 0v75Z"/><path class="line-art" d="M288 326v-72q13-16 28 0v72m-27-11h27"/>
    <rect class="outline" x="520" y="312" width="113" height="8"/><path class="line-art" d="M530 319v21m92-21v21M526 293h101m-101 7h101m-95-14v30m90-30v30"/>
    <path class="outline" d="m365 313 8 24h25l7-24Z"/><path class="line-art" d="M384 315v-20m0 12q-18-2-14-15 14 1 14 15m0-6q18-7 15-18-12 1-15 18"/>
    ${puddles}${leaf}${cat(...catPosition)}
    ${precipitation(c,id,100,346)}
  `,id,night,'An imagined Holešovice courtyard with Miso, a leaf and remembered rain');
}
export function signalMap(c) {
  const id='signal';
  const blocks=[[18,22,70,35,-13],[107,9,58,56,-13],[189,12,87,31,-13],[295,10,68,43,-13],[34,92,61,40,-13],[116,82,74,47,-13],[215,75,62,47,-13],[300,80,76,39,-13],[95,160,78,34,-13],[201,146,78,40,-13],[308,149,56,36,-13]];
  const roofs=blocks.map(([x,y,w,h,r])=>`<g transform="rotate(${r} ${x+w/2} ${y+h/2})"><rect class="outline" x="${x}" y="${y}" width="${w}" height="${h}"/><rect x="${x+3}" y="${y+3}" width="${w-6}" height="${h-6}" fill="url(#${id}-dots)"/><path class="fine-line" d="M${x+8} ${y+h/2}h${w-16}"/></g>`).join('');
  return `<svg class="scene-art" viewBox="0 0 390 211" role="img" aria-label="Fictional halftone sector scan, not a satellite photograph">${definitions(id)}<rect class="paper" width="390" height="211"/><rect width="390" height="211" fill="url(#${id}-dots)"/><path class="paper" d="M0 154Q64 132 89 211H0Z"/>${roofs}<path class="line-art" d="M-10 75 400-11M40 240 3-10M242 230 192-10M-20 163 420 65M-5 169 420 71"/><path class="fine-line" d="M6 72 400-13M235 220 185-10"/><circle class="outline" cx="159" cy="112" r="14"/><circle class="ink" cx="159" cy="112" r="3"/><path class="line-art" d="M159 88V74m0 76v-14m-25-24h-15m80 0h-15M7 7h15M7 7v15M383 7h-15m15 0v15M7 204h15m-15 0v-15m376 15h-15m15 0v-15"/><rect class="ink" x="230" y="184" width="58" height="11"/><rect class="ink" x="294" y="184" width="34" height="11"/></svg>`;
}
function vehicle(kind,x,y) {
  if(kind==='none') return '';
  if(kind==='motorbike') return `<g transform="translate(${x} ${y})"><circle class="outline" cx="-20" cy="0" r="12"/><circle class="outline" cx="24" cy="0" r="12"/><path class="line-art" d="M-20 0 0-18 24 0H-20m20-18h13l-7-16H-2m-14 12h19"/></g>`;
  const body=kind==='van'?'M-61-5V-49H12l25 19h20v25Z':'M-61-5v-21l25-4 15-24H16l24 24 25 8v17Z';
  return `<g transform="translate(${x} ${y})"><path class="outline" d="${body}"/><path class="line-art" d="M-12-47V-28H29L12-43H-9m-42 23h86m-23 5h7"/><circle class="ink" cx="-36" cy="-3" r="12"/><circle class="paper" cx="-36" cy="-3" r="5"/><circle class="ink" cx="39" cy="-3" r="12"/><circle class="paper" cx="39" cy="-3" r="5"/></g>`;
}
export function petrol(c,world) {
  const id='petrol';
  return svg(`${sky(c,id)}
    <path class="outline" d="M0 256 63 240 118 250 189 219 263 237 332 213 415 241 482 231 549 253 647 233 723 250 800 226V402H0Z"/>
    <path class="fine-line" d="M0 276h800M7 291h146m370 2h252M0 369 800 349M0 392 800 373M296 386l70-2m78-5 60-2m93-5 67-2"/>
    <path class="building" d="M193 225H467V325H193Z"/>
    <path class="building" d="M160 182H490V206H160Z"/>
    <text class="svg-caption strong canopy-letter" x="325" y="199" text-anchor="middle">NOWHERE</text>
    <path class="building-detail" d="M182 206v114m278-114v113M174 194h106m90 0h108"/>
    <path class="building" d="M221 268V239H332V292H221Zm135-29h50v86h-50Z"/>
    <path class="building-detail" d="M270 240v50m-44-25h100m65 20h6"/>
    <g><rect class="outline" x="239" y="263" width="26" height="62" rx="3"/><rect class="ink" x="244" y="271" width="16" height="15"/><path class="line-art" d="M265 277q15 0 13 18v20q0 9-9 8m9-30 5-8"/><rect class="outline" x="310" y="263" width="26" height="62" rx="3"/><rect class="ink" x="315" y="271" width="16" height="15"/><path class="line-art" d="M336 277q15 0 13 18v20q0 9-9 8m9-30 5-8"/></g>
    <g><rect class="outline" x="488" y="267" width="40" height="61"/><rect class="ink" x="492" y="272" width="24" height="40"/><path class="line-art" d="M519 276h4m-4 8h4m-4 8h4m-27 25h22"/><path class="paper" d="M497 278h13v5h-13Zm0 10h13v5h-13Zm0 10h13v5h-13Z"/></g>
    <path class="line-art" d="M679 261v76m16-76v77m-37 0h59"/>
    ${vehicle(world.vehicle||'none',110,336)}
    ${world.puddles?'<ellipse class="outline" cx="406" cy="341" rx="69" ry="5"/>':''}
    ${precipitation(c,id,100,340)}
  `,id,c.is_day===0,'A lonely fictional petrol station, with weather on its sign');
}
export function person(x,y, {scale=1,pose='stand',coat=false}={}) {
  const arms=pose==='shrug'?'M-7 8-24-1-31 5M7 8 23-1 31 5':pose==='umbrella'?'M-7 8-15 21M7 8 19-3':pose==='walk'?'M-7 8-20 19M7 8 17-4':'M-7 8-12 24M7 8 12 24';
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path class="outline" d="M-10 0q-8-18 2-25 15-9 22 4 8 16-5 22Z"/><path class="line-art" d="M-2-15v1m10-1v1m-8 6q4 3 8 0"/><path class="outline" d="M-7 1 7 1l${coat?'8 28H-15':'1 23H-8'}Z"/><path class="line-art" d="${arms}M-5 26-9 44H-16M5 26 13 44h7"/>${coat?'<path class="line-art" d="M-5 2 0 9 6 2m-6 7v16m-1-8h2"/>':''}</g>`;
}
export function comicArt(index,kind,episode,isNight=false) {
  const id=`comic-${index}`;
  let content='';
  if(index===0) content=`<path class="outline" d="M18 95H158V147H18Zm7-11h42v18H25Z"/><path class="line-art" d="M18 83v76m140-64v64M67 104l33-17 58 20"/><path class="outline" d="M34 79q-5-16 12-18 19 0 13 19Z"/><path class="line-art" d="M42 71h4m7 0h3"/><text class="svg-caption strong" x="100" y="55">z z z</text>`;
  else {
    content=person(86,104,{scale:1.2,pose:index===1?'shrug':index===2&&kind==='rain'?'umbrella':'walk',coat:index>=2&&(kind==='snow'||kind==='rain'||kind==='cold')});
    if(kind==='rain') content+=`<g class="line-art"><path d="M17 31 12 44m37-28-5 13m87 3-5 13m30 14-5 13"/></g>${index>=2?'<path class="outline" d="M54 68q32-46 66 0-7-6-12 0-12-7-19 0-12-7-19 0-10-7-16 0Z"/><path class="line-art" d="M87 46v46q0 9 9 6"/>':''}`;
    else if(kind==='snow') content+=`<g class="line-art"><path d="M35 43h10m-5-5v10M121 56h10m-5-5v10M60 28h8m-4-4v8M145 89h8m-4-4v8M18 163h143"/></g><path class="outline" d="M68 76q20-15 38 2v7H67Z"/>`;
    else if(kind==='wind') content+=`<g class="line-art"><path d="M3 44h93q19 0 14-14M16 61h108m-88 15h94q18 0 15-13"/></g><path class="outline" d="M107 87q35-28 44-8-20 16-44 8Z"/>`;
    else if(kind==='hot') content+=`<g class="line-art"><circle cx="134" cy="36" r="16"/><path d="M134 11V3m0 66v-8m-25-25h-8m66 0h-8M67 83h43m-35-7q12-14 25 0"/></g>${index===2?'<path class="outline" d="M12 31h10v122H12Zm5-7q-26-8-13-25 6-25 29-7 28-3 19 20-5 19-35 12Z"/>':''}`;
    else if(kind==='night'||isNight) content+=`<path class="outline" d="M134 23a20 20 0 1 0 15 32 23 23 0 0 1-15-32Z"/><path class="line-art" d="M23 35h6m-3-3v6m102 47h6m-3-3v6"/>`;
    else if(kind==='unknown') content+='<path class="line-art" d="M16 155H160"/>';
    else content+=`<g class="line-art"><path d="M16 155H160"/><circle cx="133" cy="38" r="18"/></g>`;
  }
  return `<svg class="scene-art" viewBox="0 0 180 180" aria-hidden="true">${definitions(id)}${content}</svg>`;
}
// Coordinates are calibrated against the supplied 1619x971 engravings at 800px wide.
// Both assets share the same composition; the climber follows their printed trail.
export const TRAIL=[
  [164,363],[186,351],[212,343],[237,332],[250,320],[276,308],
  [275,297],[288,285],[312,278],[335,275],[350,268],[360,255],
  [356,243],[370,235],[389,226],[408,216],[421,206],[429,192],
  [422,181],[434,168],[450,162],[458,156],[453,145],
  [450,128],[444,111],[448,95],[448,77],
];
const trailLengths=TRAIL.slice(1).map((point,i)=>Math.hypot(point[0]-TRAIL[i][0],point[1]-TRAIL[i][1]));
const trailLength=trailLengths.reduce((sum,length)=>sum+length,0);
export function trailPoint(progress) {
  let distance=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0))*trailLength;
  for(let i=0;i<trailLengths.length;i++) {
    const length=trailLengths[i];
    if(distance<=length || i===trailLengths.length-1) {
      const t=distance/length;
      return [TRAIL[i][0]+(TRAIL[i+1][0]-TRAIL[i][0])*t,TRAIL[i][1]+(TRAIL[i+1][1]-TRAIL[i][1])*t];
    }
    distance-=length;
  }
  return TRAIL[0];
}
export function mountainMode(c,solar) {
  if(solar.phase==='day') return 'day';
  if(solar.phase==='night'||solar.phase==='dawn') return 'night';
  return c.is_day===0?'night':'day';
}
export function mountainBackground(c,solar) {
  const mode=mountainMode(c,solar),kind=weatherKind(c);
  const weather=['rain','snow','wind'].includes(kind)?kind:'clear';
  const suffix=weather==='clear'?'':`-${weather}`;
  const width=weather==='wind'||(mode==='day'&&weather==='rain')?1620:1619;
  return {mode,weather,width,height:971,src:`/assets/backgrounds/mountain-${mode}${suffix}.png`};
}
export function mountain(c,solar) {
  const id='mountain',background=mountainBackground(c,solar),{mode,weather}=background;
  const [x,y]=trailPoint(solar.position);
  const camping=solar.phase==='night'||solar.phase==='dawn';
  const marker=camping
    ? `<g class="mountain-camp" transform="translate(${x} ${y})"><path class="outline" d="M-24 3 0-24 25 3Z"/><path class="ink" d="M0-24 8 3H-9Z"/><path class="line-art" d="M-29 4h59"/></g>`
    : `<g class="mountain-climber">${person(x,y-24,{scale:.55,pose:'walk',coat:true})}</g>`;
  // Keep the original rasters untouched. The image is scaled proportionally;
  // its blank lower margin is clipped behind the separate departure strip.
  return `<img class="mountain-background" src="${background.src}" width="${background.width}" height="${background.height}" data-mode="${mode}" data-weather="${weather}" alt="${mode==='night'?'Night':'Day'} alpine engraving, ${weather} weather, supplied by you">`
    + svg(`<g class="mountain-traveller" data-trail-x="${x.toFixed(2)}" data-trail-y="${y.toFixed(2)}" data-phase="${solar.phase}">${marker}</g>
      <path class="line-art" d="M139 313v65m-15 0h30"/>
      ${weather==='clear'?precipitation(c,id,112,345):''}`,id,mode==='night','Live climber over the weather-specific engraved mountain')
      .replace('class="scene-art','class="mountain-overlays scene-art');
}
