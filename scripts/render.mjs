import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { PNG } from 'pngjs';
import { launch, ready } from './browser.mjs';

const options = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(2, i), arg.slice(i + 1)]; }));
const design = options.design || 'station';
const worlds = ['transmission', 'courtyard', 'petrol', 'comic', 'mountain'];
if (!['daily', 'weather', 'station', ...worlds].includes(design)) throw new Error('Choose a supported dashboard design.');
const output = resolve(options.output || `previews/${design}.png`);
const base = options.url || 'http://127.0.0.1:8787';
const started = performance.now();
const browser = await launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('Dashboard JavaScript error:', error));
  page.on('requestfailed', request => {
    console.warn('Dashboard resource failed:', new URL(request.url()).pathname, request.failure()?.errorText);
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      console.warn('Dashboard resource returned HTTP', response.status(), new URL(response.url()).pathname);
    }
  });
  await page.setViewport({ width: 800, height: 480, deviceScaleFactor: 1 });
  const isWorld = worlds.includes(design);
  await ready(page, isWorld ? `${base}/worlds.html?view=${design}&display=1` : `${base}/?design=${design}&display=1`);
  const data = await page.evaluate(() => window.dashboardData);
  const age = Date.now() - Date.parse(data?.generatedAt);
  if (!Number.isFinite(age) || age < -30000 || age > 90000) throw new Error('Snapshot timestamp is stale or invalid.');
  const bounds = await page.$eval(`#${isWorld ? 'world' : 'screen'}-${design}`, el => ({ width: el.offsetWidth, height: el.offsetHeight, scrollHeight: el.scrollHeight }));
  if (bounds.width !== 800 || bounds.height !== 480 || bounds.scrollHeight > 480) throw new Error(`Layout exceeds panel: ${JSON.stringify(bounds)}`);
  const bytes = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 800, height: 480 } });
  const png = PNG.sync.read(Buffer.from(bytes));
  // Crisp binary pixels. Text antialiasing becomes a black/white edge; no grey or colour pixels.
  for (let i = 0; i < png.data.length; i += 4) {
    const luminance = .2126 * png.data[i] + .7152 * png.data[i + 1] + .0722 * png.data[i + 2];
    const value = luminance < 160 ? 0 : 255;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = value;
    png.data[i + 3] = 255;
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, PNG.sync.write(png, { colorType: 0 }));
  if (options.metadata) {
    const metadata = resolve(options.metadata);
    await mkdir(dirname(metadata), { recursive: true });
    await writeFile(metadata, JSON.stringify({ ...data, renderedAt: new Date().toISOString(), design }));
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  console.log(`Saved ${design}: ${output} (800 × 480, black/white) in ${seconds}s`);
} finally {
  await browser.close();
}
