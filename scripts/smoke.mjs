// Browser smoke test: serves the production build and clicks through the whole
// app in a real browser, with the OpenAI API mocked. Run with `npm run smoke`
// (after `npm run build`), or as part of `npm run nightly`.
//
//   SMOKE_BROWSER=chrome|msedge   browser channel (default: tries chrome, then msedge)
//   SMOKE_SHOTS=<dir>             also save a screenshot of every screen there
//   SMOKE_HEADED=1                watch it run

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const SHOTS = process.env.SMOKE_SHOTS;
const STORAGE_KEY = 'earth-online/v1';
const STAT_IDS = ['int', 'str', 'vit', 'cre', 'soc', 'dis'];

// ---------- helpers ----------

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOf(date, weeksAgo = 0) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * weeksAgo);
  return d;
}
const dayBefore = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);

let step = 'startup';
const failures = [];
function check(condition, message) {
  if (condition) return;
  failures.push(`${step}: ${message}`);
  console.log(`  ✗ ${message}`);
}
function begin(name) {
  step = name;
  console.log(`• ${name}`);
}

async function launch() {
  const channels = process.env.SMOKE_BROWSER ? [process.env.SMOKE_BROWSER] : ['chrome', 'msedge'];
  let lastError;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: !process.env.SMOKE_HEADED });
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`No browser found (tried ${channels.join(', ')}). ${lastError?.message ?? ''}`);
}

/** A save with history on a Sunday week grid while the setting says Monday: the case that used to flatten the chart. */
function seededSave() {
  const now = new Date();
  const thisWeek = mondayOf(now);
  const lastWeek = mondayOf(now, 1);
  const twoAgo = mondayOf(now, 2);
  const event = (id, week, source, deltas, refId) => ({
    id,
    at: week.toISOString(),
    weekId: localDate(week),
    source,
    refId,
    title: `Seeded ${source}`,
    deltas,
  });
  const checkin = (id, week, applied) => ({
    id,
    weekId: localDate(week),
    createdAt: week.toISOString(),
    mode: 'manual',
    schedule: 'Mon: gym after work\nWed: dinner with Sam',
    summary: '',
    changes: [],
    questions: [],
    applied,
  });
  return {
    version: 1,
    settings: {
      characterName: 'Smoke Tester',
      openaiApiKey: 'sk-smoke-test',
      model: 'gpt-5-mini',
      weekStartsOn: 1,
      weeklyCapPerStat: 3,
      theme: 'auto',
      startedAt: mondayOf(now, 3).toISOString(),
    },
    baseStats: { int: 10, str: 10, vit: 10, cre: 10, soc: 10, dis: 10 },
    ledger: [
      // Sunday-grid ids (one day before the Monday week they belong to).
      event('e1', dayBefore(twoAgo), 'checkin', { str: 2, soc: -1 }, 'c1'),
      event('e2', dayBefore(lastWeek), 'checkin', { int: 3, str: 1 }, 'c2'),
      event('e3', thisWeek, 'adjust', { vit: 1 }),
    ],
    checkins: [checkin('c1', dayBefore(twoAgo), { str: 2, soc: -1 }), checkin('c2', dayBefore(lastWeek), { int: 3, str: 1 })],
  };
}

const MOCK_ANALYSIS = {
  summary: 'A sturdy week, adventurer.',
  changes: [
    { statId: 'str', delta: 2, reason: 'Two gym sessions' },
    { statId: 'luck', delta: 9, reason: 'Not a real stat, must be dropped' },
  ],
  questions: [{ statId: 'soc', question: 'Did you meet anyone in person?', yesDelta: 1, noDelta: -1 }],
  completedTaskIds: [],
};
const MOCK_QUESTS = {
  quests: [
    { title: 'Invite Sam for a walk', statId: 'soc', points: 2, repeat: 'once', reason: 'Social is your weakest stat.' },
    { title: 'Sketch for 20 minutes', statId: 'cre', points: 1, repeat: 'weekly', reason: 'No creative time lately.' },
  ],
};

async function newPage(browser, { save, viewport }) {
  const context = await browser.newContext({ viewport });
  // Requests to OpenAI never leave the machine.
  await context.route('https://api.openai.com/**', async (route) => {
    const body = route.request().postDataJSON?.() ?? {};
    const name = body?.response_format?.json_schema?.name;
    const payload = name === 'quest_suggestions' ? MOCK_QUESTS : MOCK_ANALYSIS;
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(payload) } }] } });
  });
  if (save) {
    await context.addInitScript(
      ([key, value]) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      },
      [STORAGE_KEY, JSON.stringify(save)],
    );
  }
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && check(false, `console error: ${m.text()}`));
  page.on('pageerror', (e) => check(false, `page error: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return page;
}

let shotIndex = 0;
async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${pad(++shotIndex)}-${name}.png`) });
}

async function noSideScroll(page, where) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `${where} scrolls sideways by ${overflow}px`);
}

const tab = (page, label) => page.locator('nav.nav button', { hasText: label }).click();

async function attributeValues(page) {
  await page.locator('.stat-btn').first().waitFor({ timeout: 5000 });
  const values = await page.locator('.stat-btn .stat-value').allTextContents();
  return values.map(Number);
}

async function enterGame(page) {
  await page.locator('.splash').waitFor({ timeout: 5000 });
  await page.keyboard.press('Enter');
  await page.locator('nav.nav').waitFor({ timeout: 5000 });
  await page.locator('.splash').waitFor({ state: 'detached', timeout: 5000 });
}

// ---------- scenarios ----------

async function freshStart(browser, url) {
  begin('fresh start: Enter key starts the game');
  const page = await newPage(browser, { viewport: { width: 1280, height: 800 } });
  await page.goto(url);
  await page.locator('.splash').waitFor();
  await shot(page, 'start-screen-intro');
  // No click first: Enter must work without the page ever being focused by the mouse.
  await page.keyboard.press('Enter');
  await page.locator('nav.nav').waitFor({ timeout: 3000 }).catch(() => check(false, 'Enter did not open the game'));
  await page.locator('.splash').waitFor({ state: 'detached', timeout: 3000 }).catch(() => check(false, 'start screen stayed up'));
  check((await page.locator('h1').first().textContent())?.includes('Player One'), 'character name missing');
  check((await attributeValues(page)).join() === '10,10,10,10,10,10', 'a new character should start at 10 everywhere');
  await shot(page, 'character-fresh');

  begin('fresh start: Continue button after the intro');
  await page.reload();
  const button = page.locator('.splash-continue');
  await button.waitFor();
  await page.waitForFunction(() => !document.querySelector('.splash-continue')?.disabled, null, { timeout: 6000 });
  await shot(page, 'start-screen-ready');
  await button.click();
  await page.locator('nav.nav').waitFor({ timeout: 3000 }).catch(() => check(false, 'Continue did not open the game'));
  await page.context().close();
}

async function fullTour(browser, url, viewport, label) {
  const page = await newPage(browser, { save: seededSave(), viewport });
  begin(`${label}: load a saved game`);
  await page.goto(url);
  await enterGame(page);

  begin(`${label}: character page`);
  const before = await attributeValues(page);
  check(before.length === 6, 'expected six attribute cards');
  check(before[1] >= 13, `Strength should include both seeded check-ins (got ${before[1]})`);
  await noSideScroll(page, 'character page');
  await shot(page, `${label}-character`);

  begin(`${label}: stat detail and level guide`);
  await page.locator('.stat-btn').nth(1).click();
  await page.locator('dialog[open]').waitFor();
  check(await page.locator('dialog[open]').getByText('How it moves').isVisible(), 'stat detail has no rules section');
  await shot(page, `${label}-stat-detail`);
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('button.link').click();
  await page.locator('dialog[open]').waitFor();
  check((await page.locator('dialog[open] tbody tr').count()) >= 20, 'level guide should list at least 20 levels');
  check((await page.locator('dialog[open] tr.current').count()) === 1, 'level guide should mark the current level');
  await shot(page, `${label}-level-guide`);
  await page.locator('dialog[open] button[aria-label="Close"]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });

  begin(`${label}: history matches attributes`);
  await tab(page, 'History');
  await page.locator('.viz svg').waitFor();
  const paths = await page.locator('.viz path.series').evaluateAll((els) => els.map((el) => el.getAttribute('d')));
  const flat = paths.filter((d) => new Set((d.match(/,[\d.]+/g) ?? []).map(String)).size === 1).length;
  check(paths.length === 6, 'chart should draw six lines');
  check(flat < 6, 'every line in the chart is flat');
  await shot(page, `${label}-history-chart`);
  await page.getByRole('button', { name: 'Show table' }).click();
  const latest = await page.locator('.table-wrap tbody tr').first().locator('td').allTextContents();
  const charted = latest.slice(1).map((t) => parseInt(t, 10));
  check(charted.join() === before.join(), `chart ends at ${charted.join()} but attributes are ${before.join()}`);
  const rows = await page.locator('.table-wrap tbody tr').count();
  check(rows >= 4, `history should cover the start plus three weeks (got ${rows} rows)`);
  await noSideScroll(page, 'history page');
  await shot(page, `${label}-history-table`);

  begin(`${label}: quests from the Game Master`);
  await tab(page, 'Quests');
  await page.getByRole('button', { name: 'Suggest quests for me' }).click();
  const suggestion = page.locator('li.suggestion', { hasText: 'Invite Sam for a walk' });
  await suggestion.waitFor({ timeout: 5000 }).catch(() => check(false, 'no suggestions appeared'));
  await shot(page, `${label}-quests`);
  await suggestion.getByRole('button', { name: 'Accept' }).click();
  check((await page.locator('li.task', { hasText: 'Invite Sam for a walk' }).count()) === 1, 'accepted quest is not in the task list');
  await page.locator('li.task', { hasText: 'Invite Sam for a walk' }).locator('input[type=checkbox]').check();
  await noSideScroll(page, 'quests page');

  begin(`${label}: weekly check-in with the Game Master`);
  await tab(page, 'Check-in');
  await page.locator('textarea').fill('Mon: gym\nThu: gym\nSat: stayed home');
  await page.getByRole('button', { name: 'Send to Game Master' }).click();
  await page.getByText('A sturdy week, adventurer.').waitFor({ timeout: 5000 }).catch(() => check(false, 'no Game Master summary'));
  check((await page.getByText('Not a real stat').count()) === 0, 'an unknown stat from the model reached the screen');
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await noSideScroll(page, 'check-in review');
  await shot(page, `${label}-checkin-review`);
  await page.getByRole('button', { name: 'Apply to character' }).click();
  await page.getByText('Week recorded!').waitFor({ timeout: 3000 }).catch(() => check(false, 'check-in was not applied'));
  await page.getByRole('button', { name: 'View character' }).click();
  const after = await attributeValues(page);
  // +2 STR from the check-in, +1 SOC from the answer, +2 SOC from the accepted quest. Achievements may add more.
  check(after[1] >= before[1] + 2, `Strength should rise by at least 2 (was ${before[1]}, now ${after[1]})`);
  check(after[4] >= before[4] + 3, `Social should rise by at least 3 (was ${before[4]}, now ${after[4]})`);
  await shot(page, `${label}-character-after`);

  begin(`${label}: changing the week start keeps history`);
  await tab(page, 'Settings');
  await page.locator('select').first().selectOption('0');
  await noSideScroll(page, 'settings page');
  await tab(page, 'History');
  await page.getByRole('button', { name: 'Show table' }).click();
  const moved = (await page.locator('.table-wrap tbody tr').first().locator('td').allTextContents()).slice(1).map((t) => parseInt(t, 10));
  check(moved.join() === after.join(), `after changing week start the chart ends at ${moved.join()}, attributes are ${after.join()}`);
  check((await page.locator('details.card').count()) === 3, 'expected three check-ins in history');

  begin(`${label}: rules page`);
  await tab(page, 'Rules');
  await page.locator('.rule').first().waitFor({ timeout: 5000 });
  check((await page.locator('.rule').count()) >= 17, 'rule book is missing rules');
  await noSideScroll(page, 'rules page');
  await shot(page, `${label}-rules`);

  begin(`${label}: reload keeps the save`);
  await page.reload();
  await enterGame(page);
  await tab(page, 'Character');
  check((await attributeValues(page)).join() === after.join(), 'stats changed across a reload');
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  check(stored?.includes('"seed":2'), 'save was not written back with the current seed');

  begin(`${label}: quit and come back`);
  await page.getByRole('button', { name: 'Quit' }).click();
  await page.getByText('Thank you for playing').waitFor();
  check(await page.locator('.quit-return').isDisabled(), 'goodbye should play before the way back appears');
  await page.waitForTimeout(6500);
  await shot(page, `${label}-quit`);
  await page.waitForFunction(() => !document.querySelector('.quit-return')?.disabled, null, { timeout: 8000 });
  await page.locator('.quit-return').click();
  await page.locator('.splash-continue').waitFor({ timeout: 3000 }).catch(() => check(false, 'no start screen after coming back'));
  await page.context().close();
}

// ---------- run ----------

const server = await preview({ preview: { port: 4317, strictPort: false, open: false }, logLevel: 'error' });
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4317/';
let browser;
try {
  browser = await launch();
  await freshStart(browser, url);
  await fullTour(browser, url, { width: 1280, height: 800 }, 'desktop');
  await fullTour(browser, url, { width: 390, height: 844 }, 'phone');
} catch (e) {
  failures.push(`${step}: ${e?.message ?? e}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

if (failures.length) {
  console.log(`\nSmoke test FAILED (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
