import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launch, ready } from './browser.mjs';

const browser = await launch();
const errors = [];
await mkdir('previews', { recursive: true });
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewport({ width, height: width > 800 ? 1000 : 844, deviceScaleFactor: 1 });
    await ready(page, 'http://127.0.0.1:8787/?design=all');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflows at ${width}px`);
    assert.equal(await page.$$eval('.proposal:not([hidden])', nodes => nodes.length), 3);
    assert.equal(await page.$$eval('.canvas-wrap', nodes => nodes.every(el => {
      const box = el.getBoundingClientRect(), panel = el.firstElementChild.getBoundingClientRect();
      return Math.abs(box.height - box.width * 3 / 5) < 1 && Math.abs(box.bottom - panel.bottom) < 1;
    })), true, `Scaled preview has an incorrect height at ${width}px`);
    await page.screenshot({ path: `previews/gallery-${width}.png`, fullPage: true });
  }
  const realData = await page.evaluate(() => window.dashboardData);
  await ready(page, 'http://127.0.0.1:8787');
  assert.deepEqual(await page.$$eval('.proposal:not([hidden])', nodes => nodes.map(n => n.dataset.proposal)), ['station']);
  assert.equal(await page.$eval('#screen-station .rotating-greeting', node => node.textContent), (await page.evaluate(() => window.dashboardData)).greeting.text);
  await page.setViewport({ width: 800, height: 480, deviceScaleFactor: 1 });
  for (const design of ['daily', 'weather', 'station']) {
    await ready(page, `http://127.0.0.1:8787/?design=${design}&display=1`);
    const geometry = await page.$eval(`#screen-${design}`, el => {
      const box = el.getBoundingClientRect();
      return { width: box.width, height: box.height, scroll: el.scrollHeight, out: [...el.querySelectorAll('*')].filter(n => {
        const r = n.getBoundingClientRect(); return r.width && r.height && (r.bottom > box.bottom + 1 || r.right > box.right + 1);
      }).map(n => `${n.tagName}.${n.className}`) };
    });
    assert.deepEqual(geometry, { width: 800, height: 480, scroll: 480, out: [] }, design);
    assert.equal(await page.$$eval('.screen:not([hidden]) img', nodes => nodes.every(n => n.complete && n.naturalWidth > 0)), true);
    const data = await page.evaluate(() => window.dashboardData);
    assert.equal(data.weather.status, 'ok');
    assert.equal(data.transit.mode, 'scheduled');
    assert.equal(data.transit.platforms.length, 2);
    await page.screenshot({ path: `previews/${design}-browser.png` });
  }
  // Every authored greeting must fit beside the clock at the physical pixel size.
  const phraseFit = await page.evaluate(async () => {
    const phrases = await fetch('/phrases.json').then(r => r.json());
    const node = document.querySelector('#screen-station .rotating-greeting');
    const original = node.textContent;
    const overflow = [];
    for (const phrase of phrases) {
      node.textContent = phrase.text;
      if (node.scrollWidth > node.clientWidth || node.getBoundingClientRect().bottom > 70) overflow.push(phrase.text);
    }
    node.textContent = original;
    return { count: phrases.length, overflow };
  });
  assert.deepEqual(phraseFit, { count: 100, overflow: [] });
  // Force a long destination and a three-digit countdown to stress actual board columns.
  await page.evaluate(() => {
    for (const destination of document.querySelectorAll('.destination')) destination.textContent = 'Nádraží Holešovice – dlouhý název';
    for (const minutes of document.querySelectorAll('.minutes')) minutes.innerHTML = '119<small>min</small>';
  });
  assert.equal(await page.$eval('#screen-station', el => el.scrollHeight), 480);
  // An upstream failure must show an honest empty state, including in display view.
  let fixture = {
    generatedAt: new Date().toISOString(),
    weather: { status: 'unavailable', error: 'Weather unavailable.' },
    transit: { status: 'unavailable', error: 'Timetable unavailable.', platforms: [] },
  };
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('/api/dashboard')) request.respond({ contentType: 'application/json', body: JSON.stringify(fixture) });
    else request.continue();
  });
  for (const design of ['daily', 'weather', 'station']) {
    await ready(page, `http://127.0.0.1:8787/?design=${design}&display=1`);
    assert.equal(await page.$eval(`#screen-${design}`, el => el.textContent.includes('Timetable unavailable.')), true);
    assert.equal(await page.$eval(`#screen-${design}`, el => el.scrollHeight), 480, `${design} unavailable state`);
  }
  fixture = structuredClone(realData);
  Object.assign(fixture.weather.current, { temperature_2m: -12, apparent_temperature: -18, weather_code: 75, is_day: 1 });
  Object.assign(fixture.weather.today, { snowfallCm: 2.4, peakPrecipitationProbability: 80, low: -20, high: -10 });
  for (const hour of fixture.weather.hours) Object.assign(hour, { temperature_2m: -12, weather_code: 75, snowfall: .4, precipitation_probability: 80 });
  for (const design of ['daily', 'weather', 'station']) {
    await ready(page, `http://127.0.0.1:8787/?design=${design}&display=1`);
    assert.equal(await page.$eval(`#screen-${design}`, el => el.scrollHeight), 480, `${design} winter layout`);
    await page.screenshot({ path: `previews/${design}-winter-check.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: 4 gallery widths, 3 physical panel layouts, assets and real data.');
} finally {
  await browser.close();
}
