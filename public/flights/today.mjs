const zone = 'Europe/Prague';
const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' });
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' });
const degrees = value => Number.isFinite(value) ? `${Math.round(value)}°` : '—';
const element = id => document.getElementById(id);
const clock = element('local-clock');

let forecast;
let failed = false;
let forecastDay;

function updateClock() {
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = clockFormat.format(now);
  element('today-date').textContent = dateFormat.format(now);
  const today = dayFormat.format(now);
  if (forecastDay !== today) {
    forecastDay = today;
    showWeather();
  }
}

function conditions({ weather_code: code, is_day: isDay }) {
  if (!Number.isFinite(code)) return ['Conditions unavailable', 'cloud'];
  if (code === 0) return isDay ? ['Clear sky', 'sun'] : ['Clear night', 'moon'];
  if (code <= 2) return ['Partly cloudy', isDay ? 'cloud-sun' : 'cloud-moon'];
  if (code === 3) return ['Overcast', 'cloud'];
  if (code <= 48) return ['Fog', 'cloud-fog'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snow', 'snowflake'];
  if ([56, 57, 66, 67].includes(code)) return ['Freezing rain', 'cloud-rain'];
  if (code >= 95) return ['Thunderstorms', 'cloud-lightning'];
  return ['Rain', 'cloud-rain'];
}

function showWeather() {
  const weather = forecast?.day === forecastDay ? forecast.weather : undefined;
  const { current, today = {}, status } = weather ?? {};
  const available = Number.isFinite(current?.temperature_2m);
  const icon = element('weather-icon');
  icon.hidden = !available;
  element('weather-unit').hidden = !available;
  element('weather-temperature').textContent = available ? Math.round(current.temperature_2m) : '—';
  if (!available) {
    element('weather-condition').textContent = !forecast && !failed ? 'Loading weather…' : 'Weather unavailable';
    element('weather-feels').textContent = '';
    element('weather-outlook').textContent = '';
    return;
  }

  const [label, iconName] = conditions(current);
  icon.src = `/assets/${iconName}.svg`;
  const saved = status === 'stale' || failed;
  element('weather-condition').textContent = saved ? `${label} (saved)` : label;
  const feels = Number.isFinite(current.apparent_temperature) ? `Feels like ${degrees(current.apparent_temperature)}` : '';
  element('weather-feels').textContent = feels;
  const range = Number.isFinite(today.low) && Number.isFinite(today.high)
    ? `Low ${degrees(today.low)} / High ${degrees(today.high)}` : '';
  const precip = Number.isFinite(today.peakPrecipitationProbability)
    ? `Peak precip. ${today.peakPrecipitationProbability}%` : '';
  element('weather-outlook').textContent = [range, precip].filter(Boolean).join('   /   ');
}

async function refreshWeather() {
  try {
    const response = await fetch('/api/dashboard', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Weather request failed');
    const { weather, generatedAt } = await response.json();
    forecast = { day: dayFormat.format(new Date(generatedAt)), weather };
    failed = false;
  } catch {
    failed = true;
  }
  showWeather();
}

updateClock();
refreshWeather();
setInterval(updateClock, 1000);
setInterval(refreshWeather, 60000);
