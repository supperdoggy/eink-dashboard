import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

export function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium-headless-shell', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  const executable = candidates.find(p => p && existsSync(p));
  if (!executable) throw new Error('Chrome/Chromium not found. Set CHROME_PATH to your browser executable.');
  return executable;
}

export async function launch() {
  return puppeteer.launch({ executablePath: chromePath(), headless: true, timeout: 60000,
    args: ['--disable-dev-shm-usage', '--disable-gpu', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : [])] });
}

export async function ready(page, url) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready, { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0), { timeout: 5000 });
  if (await page.evaluate(() => document.documentElement.dataset.ready === 'error')) throw new Error('Dashboard data could not load; refusing to export an error screen.');
}
