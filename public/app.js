const params = new URLSearchParams(location.search);
const requested = params.get('design');
const selected = requested === 'all' ? 'all' : ['daily', 'weather', 'station'].includes(requested) ? requested : 'station';
const displayOnly = params.get('display') === '1';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const dateLabel = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date));
const degree = (value) => Number.isFinite(value) ? `${Math.round(value)}°` : '—';
const number = (value) => Number.isFinite(value) ? String(Math.round(value)) : '—';
let currentData;
let busy = false;

function icon(name, large = false) {
  return `<img class="icon${large ? ' large' : ''}" src="/assets/${name}.svg" width="24" height="24" alt="" aria-hidden="true">`;
}

function conditions(code, isDay = true) {
  if (code === 0) return [isDay ? 'Clear sky' : 'Clear night', isDay ? 'sun' : 'moon'];
  if (code <= 2) return ['Partly cloudy', isDay ? 'cloud-sun' : 'cloud-moon'];
  if (code === 3) return ['Overcast', 'cloud'];
  if (code <= 48) return ['Foggy', 'cloud-fog'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snow', 'snowflake'];
  if ([56, 57, 66, 67].includes(code)) return ['Freezing rain', 'cloud-rain'];
  if (code >= 95) return ['Thunderstorms', 'cloud-lightning'];
  return ['Rain', 'cloud-rain'];
}

function advice(weather) {
  if (!weather.current) return { title: 'Weather unavailable', detail: 'Check the connection and refresh.', icon: 'cloud' };
  const t = weather.current.apparent_temperature;
  const wet = weather.hours.slice(0, 6).some(h => h.precipitation_probability >= 40 || h.rain >= 0.1);
  const snow = weather.hours.slice(0, 6).some(h => h.snowfall > 0);
  let title, detail;
  if (t < 0) { title = 'Wrap up warm.'; detail = 'Winter coat, warm layers and gloves.'; }
  else if (t < 8) { title = 'Take a warm jacket.'; detail = 'A warm layer will make a difference.'; }
  else if (t < 15) { title = 'Bring another layer.'; detail = 'A jacket or jumper should help.'; }
  else if (t < 21) { title = 'A light layer today.'; detail = 'Keep a light jacket within reach.'; }
  else { title = 'Keep it light.'; detail = 'Light clothing should feel comfortable.'; }
  if (snow) detail = 'Warm layers and shoes with good grip.';
  else if (wet) detail = 'Bring an umbrella for the next few hours.';
  return { title, detail, icon: snow ? 'snowflake' : wet ? 'umbrella' : 'shirt' };
}

function clothing(weather) {
  const a = advice(weather);
  return `<div class="clothing">${icon(a.icon)}<div><h3>${a.title}</h3><p class="summary">${a.detail}</p></div></div>`;
}

function stats(weather) {
  if (!weather.current) return '';
  const probability = weather.today.peakPrecipitationProbability;
  const snow = weather.today.snowfallCm;
  return `<div class="stats"><span>${icon('wind')}${number(weather.current.wind_speed_10m)} km/h</span><span title="Highest hourly precipitation probability from now until midnight">${icon('umbrella')}${probability === null ? '—' : probability + '%'} peak today</span>${snow > 0 ? `<span>${icon('snowflake')}${snow} cm</span>` : ''}</div>`;
}

function forecast(weather) {
  if (!weather.hours?.length) return `<div class="forecast"><p class="empty">Hourly forecast unavailable. Check the connection.</p></div>`;
  return `<div class="forecast" aria-label="Next six hours: temperature and precipitation probability">${weather.hours.map(h => {
    const [label, name] = conditions(h.weather_code, h.is_day);
    return `<div class="hour" title="${clock(h.time * 1000)}: ${label}; precipitation ${h.precipitation_probability ?? 'unknown'}%"><time datetime="${new Date(h.time * 1000).toISOString()}">${clock(h.time * 1000)}</time>${icon(name)}<strong>${degree(h.temperature_2m)}</strong><span class="precip">${icon(h.snowfall > 0 ? 'snowflake' : 'droplet')}${h.precipitation_probability ?? '—'}%</span></div>`;
  }).join('')}</div>`;
}

function platforms(transit, timestamp) {
  if (transit.status !== 'ok') return `<p class="empty">${esc(transit.error)}</p>`;
  return `<div class="platforms">${transit.platforms.map(p => `<section class="platform" aria-label="Ortenovo náměstí, platform ${esc(p.platform)}, towards ${esc(p.direction)}"><div class="platform-head"><h3 title="${p.departures.length ? `Towards ${esc(p.direction)}` : 'No upcoming trams'}">${p.departures.length ? `Towards ${esc(p.direction)}` : 'No upcoming trams'}</h3></div><ol class="departures">${p.departures.slice(0, 3).map(d => {
    const minutes = Math.max(0, Math.ceil((new Date(d.time) - new Date(timestamp)) / 60000));
    return `<li class="departure"><span class="line">${esc(d.line)}</span><span class="destination" title="${esc(d.destination)}">${esc(d.destination)}</span><time datetime="${esc(d.time)}">${clock(d.time)}</time><span class="minutes">${minutes}<small>min</small></span></li>`;
  }).join('') || '<li class="empty">No trams in the next 2 hours.</li>'}</ol></section>`).join('')}</div>`;
}

function footer(data) {
  const w = data.weather;
  const weatherTime = w.current ? `Weather ${clock(w.current.time * 1000)}${w.status === 'stale' ? ' (stale)' : ''}` : 'Weather unavailable';
  const tramStatus = data.transit.status === 'ok' ? 'Scheduled trams / no live delays' : 'Timetable unavailable';
  return `<footer class="screen-footer"><span>Open-Meteo / PID (CC BY)</span><span>${weatherTime} / ${tramStatus}</span><span>Updated ${clock(data.generatedAt)}</span></footer>`;
}

function currentWeather(weather) {
  const c = weather.current;
  const [label, name] = c ? conditions(c.weather_code, c.is_day) : ['Unavailable', 'cloud'];
  const temp = c ? number(c.temperature_2m) : '—';
  return { temp, compact: temp.length > 1 ? ' compact-reading' : '', label, name, feels: c ? `Feels like ${degree(c.apparent_temperature)}` : 'Check connection' };
}

function friendlyAdvice(weather) {
  const base = advice(weather);
  const t = weather.current?.apparent_temperature;
  if (!Number.isFinite(t)) return { ...base, title: 'A little weather mystery.' };
  const title = t < 0 ? 'Brrr. Layer up!' : t < 8 ? 'Jacket? Definitely.' : t < 15 ? 'Hello, jumper weather.' : t < 21 ? 'A little layer helps.' : 'Hello, T-shirt weather!';
  return { ...base, title };
}

function weatherBuddy(weather) {
  const c = weather.current;
  const label = c ? conditions(c.weather_code, c.is_day)[0] : 'Weather unavailable';
  const snow = c && [71, 73, 75, 77, 85, 86].includes(c.weather_code);
  const wet = c && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c.weather_code);
  const clear = c && c.weather_code === 0;
  const night = c && !c.is_day;
  const shape = clear
    ? night ? '<path d="M111 27a48 48 0 1 0 31 76 48 48 0 0 1-31-76Z"/>' : '<circle cx="90" cy="72" r="43"/><path d="M90 13v-8m0 126v8M31 72h-8m134 0h-8M48 30l-6-6m96 96-6-6m0-84 6-6m-96 96 6-6"/>'
    : '<path d="M41 110a26 26 0 0 1-5-51 39 39 0 0 1 76-14 32 32 0 0 1 28 63c-5 2-10 2-16 2Z"/>';
  const face = !c ? '<path d="M64 74h10m27 0h10M78 94h22"/>' : '<path d="M62 75q6-9 12 0m27 0q6-9 12 0M77 91q12 15 25 0"/>';
  const precipitation = wet ? '<path d="m56 123-4 8m36-8-4 8m36-8-4 8"/>' : snow ? '<path d="M57 123v12m-6-6h12m26-6v12m-6-6h12m26-6v12m-6-6h12"/>' : '';
  return `<svg class="weather-buddy" viewBox="0 0 180 145" role="img" aria-label="${esc(label)}, your weather buddy"><g fill="var(--color-paper)" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${shape}<g fill="none">${face}${precipitation}</g></g></svg>`;
}

function friendlyClothing(weather) {
  const a = friendlyAdvice(weather);
  return `<div class="clothing"><div><h3>${a.title}</h3><p class="summary">${a.detail}</p></div></div>`;
}

function renderDaily(data) {
  const w = data.weather, c = currentWeather(w);
  return `<header><div class="daily-topline"><time class="date">${dateLabel(data.generatedAt)}</time><span class="date">Praha 7 / ${clock(data.generatedAt)}</span></div><div class="daily-mast"><h2>Hello, Holešovice!</h2><span>Let's head out.</span></div></header>
    <section class="daily-now" aria-label="Current weather and clothing"><div class="daily-reading"><div class="temperature-sticker${c.compact}"><p class="temp">${c.temp}<span class="degree">°C</span></p></div><div class="condition">${weatherBuddy(w)}<p>${c.label}</p><p class="feels">${c.feels}</p></div></div><div class="daily-advice">${friendlyClothing(w)}${stats(w)}</div></section>
    ${forecast(w)}<div class="transit-title"><h2>Ortenovo náměstí</h2><span>Scheduled departures</span></div>${platforms(data.transit, data.generatedAt)}${footer(data)}`;
}

function renderWeather(data) {
  const w = data.weather, c = currentWeather(w);
  return `<header class="weather-topline"><h2>Your outside buddy.</h2><span>Holešovice / ${dateLabel(data.generatedAt)}</span></header>
    <section class="weather-now" aria-label="Current weather and clothing"><div class="buddy-character">${weatherBuddy(w)}<p>${c.label}</p></div><div class="weather-reading${c.compact}"><p class="temp">${c.temp}<span class="degree">°C</span></p><p class="feels">${c.feels}</p></div><div class="weather-advice">${friendlyClothing(w)}</div></section>
    <div class="buddy-metrics">${stats(w)}${w.today ? `<p>Today ${degree(w.today.low)} to ${degree(w.today.high)} / Sunset ${clock(w.today.sunset * 1000)}</p>` : '<p>Weather unavailable</p>'}</div>
    ${forecast(w)}<div class="transit-title"><h2>Ortenovo náměstí</h2><span>Scheduled departures</span></div>${platforms(data.transit, data.generatedAt)}${footer(data)}`;
}

function renderStation(data) {
  const w = data.weather, c = currentWeather(w);
  return `<header class="station-mast"><h2 class="rotating-greeting">${esc(data.greeting?.text || 'Good for one little adventure.')}</h2><time class="clock">${clock(data.generatedAt)}</time></header>
    <div class="ticket-core"><section class="ticket-journey"><div class="transit-title"><h2>Ortenovo náměstí</h2><span>Scheduled departures</span></div>${platforms(data.transit, data.generatedAt)}</section><section class="station-weather" aria-label="Weather summary"><div class="ticket-buddy">${weatherBuddy(w)}</div><p class="temp">${c.temp}<span class="degree">°C</span></p><p class="feels">${c.feels}</p>${friendlyClothing(w)}<p class="ticket-precip">${w.today?.peakPrecipitationProbability ?? '—'}% peak precip. today</p></section></div>
    ${forecast(w)}${footer(data)}`;
}

function fitCanvases() {
  document.querySelectorAll('.canvas-wrap').forEach(wrap => wrap.style.setProperty('--scale', wrap.clientWidth / 800));
}

function render(data) {
  currentData = data;
  document.getElementById('screen-daily').innerHTML = renderDaily(data);
  document.getElementById('screen-weather').innerHTML = renderWeather(data);
  document.getElementById('screen-station').innerHTML = renderStation(data);
  const errors = [data.weather.status !== 'ok' && (data.weather.error || 'Weather unavailable.'), data.transit.status !== 'ok' && data.transit.error].filter(Boolean);
  document.getElementById('data-status').textContent = errors.length ? errors.join(' ') : `Weather updated ${clock(data.weather.current.time * 1000)}. Official PID timetable loaded. Departures refresh every minute.`;
  document.documentElement.dataset.ready = 'true';
  window.dashboardData = data;
  fitCanvases();
}

async function refresh() {
  if (busy) return;
  busy = true;
  const button = document.getElementById('refresh');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Refreshing…';
  try {
    const response = await fetch('/api/dashboard', { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Dashboard request failed');
    render(await response.json());
  } catch {
    document.getElementById('data-status').textContent = 'Cannot refresh. Check the server and your connection.';
    if (currentData) {
      const stale = structuredClone(currentData);
      if (stale.weather.current) stale.weather.status = 'stale';
      // Hide departed trams rather than keeping an old countdown on the screen.
      stale.transit = { status: 'unavailable', error: 'Tram refresh failed. Check the connection.', platforms: [] };
      render(stale);
    } else {
      document.querySelectorAll('.screen').forEach(el => el.innerHTML = '<p class="initial-state">Data unavailable.<br>Check the server and your connection.</p>');
      document.documentElement.dataset.ready = 'error';
    }
  } finally {
    busy = false;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = 'Refresh data';
  }
}

if (displayOnly) document.body.classList.add('display-only');
document.querySelectorAll('[data-proposal]').forEach(el => el.hidden = (selected !== 'all' && el.dataset.proposal !== selected) || (displayOnly && selected === 'all' && el.dataset.proposal !== 'station'));
document.querySelectorAll('[data-design]').forEach(el => { if (el.dataset.design === selected) el.setAttribute('aria-current', 'page'); });
document.getElementById('refresh').addEventListener('click', refresh);
document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', async () => {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Rendering…';
  try {
    const response = await fetch(`/api/render?design=${button.dataset.export}`);
    if (!response.ok) throw new Error(await response.text());
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `${button.dataset.export}-800x480.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    button.textContent = 'Downloaded';
  } catch (error) {
    document.getElementById('data-status').textContent = error.message;
    button.textContent = 'Retry PNG download';
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}));
new ResizeObserver(fitCanvases).observe(document.getElementById('designs'));
fitCanvases();
refresh();
// A physical-screen render takes one snapshot; avoid a second fetch during capture.
if (!displayOnly) setInterval(refresh, 60000);
