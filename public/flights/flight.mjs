import { drawMap } from './map.mjs';

const params = new URLSearchParams(location.search);
const design = params.get('view') === 'radar' ? 'radar' : 'atlas';
const panelOnly = params.get('display') === '1';
const title = design === 'radar' ? 'Night Radar' : 'Route Atlas';
const screen = document.querySelector('#flight-screen');
const frame = document.querySelector('.flight-frame');
const canvas = document.querySelector('#map');
const replayButton = document.querySelector('#replay');
const statusLine = document.querySelector('#flight-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const set = (id, value) => { document.getElementById(id).textContent = value; };

let countries = [];
let live;
let loading = false;
let replayStart = params.get('mode') === 'replay' ? performance.now() : null;

screen.classList.toggle('radar', design === 'radar');
screen.setAttribute('aria-label', `${title} flight dashboard`);
document.body.classList.toggle('panel-only', panelOnly);
document.querySelector(`a[data-design="${design}"]`).setAttribute('aria-current', 'page');
set('screen-name', title);

const airports = {
  VIE: { code: 'VIE', city: 'Vienna', country: 'Austria', lat: 48.11, lon: 16.57 },
  HEL: { code: 'HEL', city: 'Helsinki', country: 'Finland', lat: 60.32, lon: 24.96 },
  CPH: { code: 'CPH', city: 'Copenhagen', country: 'Denmark', lat: 55.62, lon: 12.65 },
  LHR: { code: 'LHR', city: 'London', country: 'United Kingdom', lat: 51.47, lon: -0.46 },
};
const examples = [
  [airports.VIE, airports.HEL, 'Demo 01', 'Airbus A320neo'],
  [airports.CPH, airports.LHR, 'Demo 02', 'Boeing 737-800'],
];

function replay() {
  const elapsed = (performance.now() - replayStart) / 1000;
  const [origin, destination, callsign, aircraft] = examples[Math.floor(elapsed / 48) % examples.length];
  const progress = Math.min(1, .33 + (elapsed % 48) * .67 / 38);
  const now = Date.now() / 1000;
  const point = fraction => ({
    lat: origin.lat + (destination.lat - origin.lat) * fraction,
    lon: origin.lon + (destination.lon - origin.lon) * fraction + Math.sin(Math.PI * fraction) * 1.2,
  });
  const position = { ...point(progress), seenAt: now, ground: progress === 1,
    altitude: 36000 * Math.min(1, (1 - progress) * 4),
    speed: progress === 1 ? 0 : 140 + 295 * Math.min(1, (1 - progress) * 8),
    heading: Math.atan2(destination.lon - origin.lon, destination.lat - origin.lat) * 180 / Math.PI,
  };
  return { status: progress === 1 ? 'arrived' : 'tracking', now,
    flight: { origin, destination, callsign, aircraft, position,
      trail: Array.from({ length: 18 }, (_, i) => point(.15 + (progress - .15) * i / 17)) } };
}

function render() {
  const demo = replayStart !== null;
  const state = demo ? replay() : live || { status: 'looking' };
  const flight = state.flight;
  const position = flight?.position;
  const phase = { tracking: 'In flight', arrived: 'Arrived', looking: 'Acquiring flight',
    unavailable: 'Feed unavailable', 'signal lost': 'Signal lost' }[state.status];
  const label = demo ? `Replay · ${phase}` : phase;
  set('phase', label);
  for (const [end, name] of [['origin', 'Origin'], ['destination', 'Destination']]) {
    set(`${end}-code`, flight?.[end].code || '—');
    set(`${end}-city`, flight?.[end].city || name);
    document.getElementById(`${end}-city`).title = flight?.[end].city || '';
    set(`${end}-country`, flight?.[end].country || '');
  }
  set('callsign', flight?.callsign || '—');
  set('aircraft', flight?.aircraft || 'Awaiting aircraft');
  document.querySelector('#aircraft').title = flight?.aircraft || '';
  set('altitude', position?.ground ? 'Ground' : Number.isFinite(position?.altitude) ? `${number.format(position.altitude)} ft` : '—');
  set('speed', Number.isFinite(position?.speed) ? `${number.format(position.speed)} kt` : '—');
  const observed = document.getElementById('observed');
  observed.dateTime = position ? new Date(position.seenAt * 1000).toISOString() : '';
  observed.textContent = position ? time.format(position.seenAt * 1000) : '—';
  const message = demo ? 'Simulated replay. Two example flights, with a short stop after landing.'
    : state.status === 'arrived' ? 'Observed on the ground near the destination. Holding this flight for 10 minutes.'
    : state.status === 'signal lost' ? 'No recent position. The last sighting stays on the map while we wait.'
    : state.error || (flight ? 'Following one flight. Position reports update about every three minutes.'
      : 'Looking for a flight with a known route…');
  if (statusLine.textContent !== message) statusLine.textContent = message;
  canvas.setAttribute('aria-label', flight
    ? `${label}: ${flight.callsign} from ${flight.origin.city} to ${flight.destination.city}`
    : 'Flight map of Europe');
  drawMap(canvas, countries, flight, design, state.status);
  document.documentElement.dataset.ready = 'true';
}

async function refresh() {
  if (loading || replayStart !== null) return;
  loading = true;
  try {
    const response = await fetch('/api/flight', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Tracking request failed');
    live = await response.json();
  } catch {
    live = { ...live, status: live?.flight ? 'signal lost' : 'unavailable',
      error: 'Can’t reach the flight tracker. Try a replay to compare the designs.' };
  } finally {
    loading = false;
    render();
  }
}

function updateControls() {
  const demo = replayStart !== null;
  replayButton.textContent = demo ? 'Back to live' : 'Try a replay';
  replayButton.setAttribute('aria-pressed', String(demo));
  for (const link of document.querySelectorAll('a[data-design]')) {
    link.href = `?view=${link.dataset.design}${demo ? '&mode=replay' : ''}`;
  }
}
replayButton.addEventListener('click', () => {
  replayStart = replayStart === null ? performance.now() : null;
  if (replayStart === null) params.delete('mode');
  else params.set('mode', 'replay');
  history.replaceState(null, '', `?${params}`);
  updateControls();
  render();
  refresh();
});

new ResizeObserver(() => {
  frame.style.setProperty('--scale', frame.clientWidth / 800);
}).observe(frame);

updateControls();
const mapResponse = await fetch('/flights/countries.json').catch(() => null);
if (mapResponse?.ok) countries = await mapResponse.json().catch(() => []);
await document.fonts.ready;
render();
refresh();
setInterval(refresh, 12000);
setInterval(() => { if (replayStart !== null) render(); }, reducedMotion.matches ? 2000 : 450);
