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

async function dismissStoryDrawers(page) {
  for (let i = 0; i < 6; i += 1) {
    const close = page.getByTestId('story-close');
    if (!(await close.isVisible().catch(() => false))) break;
    await close.click();
    await page.waitForTimeout(250);
  }
}

async function enterMarketWorkspace(page) {
  const newFund = page.getByTestId('new-fund');
  if (await newFund.isVisible().catch(() => false)) {
    await newFund.click();

    const startDirectly = page.getByTestId('start-directly');
    if (await startDirectly.isVisible().catch(() => false)) {
      await startDirectly.click();
    }
  }

  // A new STORY campaign lands in FUND HQ. The shell can already exist behind
  // a non-critical story drawer, so close those before operating the workspace.
  await page.locator('[data-testid="workspace-scroll-region"], [data-testid="fund-hq"]')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 });
  await dismissStoryDrawers(page);

  const workspace = page.getByTestId('workspace-scroll-region');
  const active = await workspace.getAttribute('data-active-workspace').catch(() => null);
  if (active !== 'MARKET') {
    const tradeFloor = page.getByTestId('tile-tradefloor');
    if (await tradeFloor.isVisible().catch(() => false)) {
      await tradeFloor.click();
    } else {
      const marketRail = page.locator('[data-workspace="MARKET"]').first();
      await marketRail.waitFor({ state: 'visible', timeout: 15000 });
      await marketRail.click();
    }
  }

  await workspace.waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="workspace-scroll-region"]');
    return el?.getAttribute('data-active-workspace') === 'MARKET';
  }, { timeout: 45000 });

  await dismissStoryDrawers(page);
  await page.locator('.pcp-chart-stage').first().waitFor({ state: 'visible', timeout: 45000 });
  await page.getByTestId('live-price-overlay').waitFor({ state: 'visible', timeout: 45000 });

  // Let the live-price rings / scanner / lightweight-charts finish their first
  // animation frame so the still image actually records the intended motion cue.
  await page.waitForTimeout(2200);
}

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
  await enterMarketWorkspace(page);

  const workspace = page.getByTestId('workspace-scroll-region');
  const chartStage = page.locator('.pcp-chart-stage').first();
  const liveOverlay = page.getByTestId('live-price-overlay');

  // Primary acceptance image is the actual first viewport; fixed command hardware must be judged where the player sees it.
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  // Preserve a diagnostic long capture without letting Playwright's fullPage fixed-element relocation contaminate first-screen judging.
  await page.screenshot({ path: `${out}/${name}-fullpage.png`, fullPage: true });
  report.push({
    name, theme, width, height,
    status: response?.status() ?? null,
    dataTheme: await page.evaluate(() => document.documentElement.getAttribute('data-theme')),
    activeWorkspace: await workspace.getAttribute('data-active-workspace'),
    chartStageVisible: await chartStage.isVisible().catch(() => false),
    livePriceOverlayVisible: await liveOverlay.isVisible().catch(() => false),
    scrollHeight: await page.evaluate(() => document.documentElement.scrollHeight),
    clientHeight: await page.evaluate(() => document.documentElement.clientHeight),
    errors,
  });
  await context.close();
}

fs.writeFileSync(`${out}/browser-smoke.json`, JSON.stringify(report, null, 2));
await browser.close();

const failed = report.some(x =>
  (x.status ?? 200) >= 400 ||
  x.activeWorkspace !== 'MARKET' ||
  !x.chartStageVisible ||
  !x.livePriceOverlayVisible ||
  x.errors.some(e => e.startsWith('pageerror:'))
);
if (failed) process.exit(1);
