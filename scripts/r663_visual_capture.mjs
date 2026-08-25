import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = process.env.R663_PREVIEW_URL || 'http://127.0.0.1:4173/';
const out = process.env.R663_ARTIFACT_DIR || '/tmp/r663-artifacts';
fs.mkdirSync(out, { recursive: true });

const cases = [
  ['amber-1672x941', 'amber', 1672, 941],
  ['calm-1672x941', 'calm', 1672, 941],
  ['neon-1536x1024', 'neon', 1536, 1024],
  ['mobile-390x844', 'neon', 390, 844],
  ['mobile-375x812', 'neon', 375, 812],
];

const browser = await chromium.launch({ headless: true });
const report = [];

for (const [name, theme, width, height] of cases) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${String(e)}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.addInitScript(([t]) => {
    localStorage.setItem('ot_theme', t);
    localStorage.setItem('ot_motion', 'full');
  }, [theme]);

  const response = await page.goto(base, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1800);

  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  report.push({
    name, theme, width, height,
    status: response?.status() ?? null,
    dataTheme: await page.evaluate(() => document.documentElement.getAttribute('data-theme')),
    scrollHeight: await page.evaluate(() => document.documentElement.scrollHeight),
    clientHeight: await page.evaluate(() => document.documentElement.clientHeight),
    errors,
  });
  await context.close();
}

fs.writeFileSync(`${out}/browser-smoke.json`, JSON.stringify(report, null, 2));
await browser.close();

if (report.some(x => (x.status ?? 200) >= 400 || x.errors.some(e => e.startsWith('pageerror:')))) {
  process.exit(1);
}
