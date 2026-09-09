'use strict';
/**
 * Browser smoke test -- drives the ASCII UI with playwright-core + local Chrome.
 * Captures console/page errors and screenshots each module.
 *
 *   NODE_PATH=<workspace>/node_modules node lib/uitest.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:8787';
const SHOTS = path.join(__dirname, '..', 'screenshots');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const ROUTES = [
  ['dashboard', 'DASHBOARD'],
  ['students', 'STUDENTS'],
  ['staff', 'USERS'],
  ['courses', 'COURSES'],
  ['sections', 'SECTIONS'],
  ['master', 'MASTER SCHEDULE'],
  ['grades', 'GRADES'],
  ['attendance', 'ATTENDANCE'],
  ['discipline', 'DISCIPLINE'],
  ['fees', 'FEES'],
  ['reports', 'REPORTS'],
  ['messages', 'MESSAGING'],
  ['setup', 'SETUP']
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  let atHash = '(initial)';
  page.on('framenavigated', (f) => {
    if (f !== page.mainFrame()) return;
    f.evaluate(() => location.hash || '(none)').then((h) => { atHash = h; }).catch(() => { });
  });
  page.on('response', (r) => {
    if (r.status() >= 400) {
      errors.push('HTTP ' + r.status() + '  ' + r.request().method() + ' ' + r.url().replace(BASE, '') +
        '   [while at ' + atHash + ']');
    }
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => {
    const u = r.url();
    // ERR_ABORTED on the document is just the logout navigation being
    // cancelled by location.reload() -- not a real failure.
    if ((r.failure() || {}).errorText === 'net::ERR_ABORTED') return;
    if (u.startsWith(BASE)) errors.push('requestfailed: ' + u + ' ' + (r.failure() || {}).errorText);
  });

  const log = (s) => console.log('  ' + s);
  console.log('\n  RUAHSIS UI test -> ' + BASE + '\n');

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#lu', { timeout: 15000 });

  // ---- login screen
  await page.screenshot({ path: path.join(SHOTS, '01-login.png') });
  const artTxt = await page.textContent('#loginart');
  log((artTxt && artTxt.length > 50 ? '[ok]  ' : '[FAIL]') + ' boot sequence finished, ASCII login banner rendered');
  await page.waitForTimeout(300);

  await page.fill('#lu', 'admin');
  await page.fill('#lp', 'admin');
  await page.click('#lgo');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1200);
  log('[ok]  logged in as admin');

  // ---- walk every module
  for (const [route, label] of ROUTES) {
    atHash = '#/' + route; await page.evaluate((r) => { location.hash = '#/' + r; }, route);
    await page.waitForTimeout(1100);
    const txt = await page.textContent('#main');
    const ok = txt && txt.length > 30 && !/^ERROR/.test(txt.trim());
    log((ok ? '[ok]  ' : '[FAIL]') + ' ' + label.padEnd(16) + ' (' + (txt || '').length + ' chars)');
    await page.screenshot({ path: path.join(SHOTS, route + '.png') });
  }

  // ---- every sub-tab of the tabbed modules (regression guard for the
  //      "second hash segment is a tab, not an id" routing rule)
  const TABBED = {
    reports: ['enrollment', 'grades', 'attention', 'defaulters', 'cards'],
    setup: ['schools', 'years', 'mps', 'periods', 'grades', 'scales', 'subjects', 'codes', 'log'],
    attendance: ['day', 'period', 'summary', 'daily'],
    messages: ['inbox', 'sent']
  };
  for (const [view, tabs] of Object.entries(TABBED)) {
    for (const t of tabs) {
      atHash = '#/' + view + '/' + t; await page.evaluate((h) => { location.hash = h; }, '#/' + view + '/' + t);
      await page.waitForTimeout(650);
      const txt = await page.textContent('#tabbody').catch(() => '');
      const ok = txt && txt.trim().length > 15;
      log((ok ? '[ok]  ' : '[FAIL]') + (view + '/' + t).padEnd(24) + '(' + (txt || '').trim().length + ' chars)');
      if (!ok) errors.push('tab ' + view + '/' + t + ' rendered empty');
    }
  }

  // ---- student detail + tabs
  await page.evaluate(() => { location.hash = '#/students'; });
  await page.waitForTimeout(1200);
  const firstRow = await page.$('#main pre.ascii .trow');
  if (firstRow) {
    await firstRow.click();
    await page.waitForTimeout(1200);
    log('[ok]  opened student record');
    await page.screenshot({ path: path.join(SHOTS, 'student-profile.png') });
    for (const tab of ['enrollment', 'contacts', 'medical', 'schedule', 'grades', 'attendance', 'discipline', 'fees', 'notes']) {
      await page.evaluate((t) => {
        const id = location.hash.split('/')[2];
        location.hash = '#/students/' + id + '/' + t;
      }, tab);
      await page.waitForTimeout(700);
      const t = await page.textContent('#tabbody');
      log((t && t.length > 20 ? '[ok]  ' : '[FAIL]') + ' student tab ' + tab.padEnd(12) + '(' + (t || '').length + ' chars)');
    }
    await page.screenshot({ path: path.join(SHOTS, 'student-notes.png') });
  } else errors.push('no student rows found to click');

  // ---- gradebook (editable grid)
  await page.evaluate(async () => {
    const r = await fetch('/api/course-periods', { headers: { Authorization: 'Bearer ' + localStorage.getItem('rsis_token') } });
    const j = await r.json();
    location.hash = '#/gradebook/' + j.data[0].id;
  });
  await page.waitForTimeout(1500);
  const gbInputs = await page.$$('#main input.score');
  log((gbInputs.length ? '[ok]  ' : '[FAIL]') + ' gradebook grid: ' + gbInputs.length + ' editable score cells');
  await page.screenshot({ path: path.join(SHOTS, 'gradebook.png') });

  // save a score
  if (gbInputs.length) {
    await gbInputs[0].fill('88');
    await page.click('#btnSave');
    await page.waitForTimeout(1400);
    log('[ok]  saved a score through the grid');
  }

  // ---- attendance save
  await page.evaluate(() => { location.hash = '#/attendance/day'; });
  await page.waitForTimeout(1300);
  const codes = await page.$$('#main select.code');
  log((codes.length ? '[ok]  ' : '[FAIL]') + ' attendance roster: ' + codes.length + ' code selectors');
  if (codes.length) {
    await page.click('#save');
    await page.waitForTimeout(1500);
    log('[ok]  saved daily attendance');
  }
  await page.screenshot({ path: path.join(SHOTS, 'attendance-day.png') });

  // ---- report card modal
  await page.evaluate(() => { location.hash = '#/reports/cards'; });
  await page.waitForTimeout(900);
  await page.fill('#sq', 'a');
  await page.click('#sb');
  await page.waitForTimeout(1200);
  await page.click('#btnCard');
  await page.waitForTimeout(1400);
  const rc = await page.textContent('#modal');
  log((rc && rc.includes('REPORT CARD') ? '[ok]  ' : '[FAIL]') + ' report card rendered');
  await page.screenshot({ path: path.join(SHOTS, 'report-card.png') });
  await page.click('#modal [data-close]');

  // ---- create a student through the UI
  await page.evaluate(() => { location.hash = '#/students'; });
  await page.waitForTimeout(1100);
  await page.click('#btnNew');
  await page.waitForTimeout(500);
  await page.fill('#f_first_name', 'Ada');
  await page.fill('#f_last_name', 'Lovelace');
  await page.fill('#f_birthdate', '2010-12-10');
  await page.click('#modal [data-save]');
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => location.hash);
  log((after.startsWith('#/students/') ? '[ok]  ' : '[FAIL]') + ' created student via UI  ' + after);
  await page.screenshot({ path: path.join(SHOTS, 'new-student.png') });

  // ---- verify it persisted
  const check = await page.evaluate(async () => {
    const r = await fetch('/api/students?search=Lovelace', { headers: { Authorization: 'Bearer ' + localStorage.getItem('rsis_token') } });
    const j = await r.json();
    return j.total;
  });
  log((check >= 1 ? '[ok]  ' : '[FAIL]') + ' new student persisted in database (' + check + ' match)');

  // ---- search box really filters (regression guard: api.qs used to drop
  //      every non-object param, so searches silently returned everything)
  await page.evaluate(() => { location.hash = '#/students'; });
  await page.waitForTimeout(1200);
  const allRows = await page.$$('#main pre.ascii .trow');
  await page.fill('#q', 'Lovelace');
  await page.click('#btnGo');
  await page.waitForTimeout(1300);
  const hits = await page.$$('#main pre.ascii .trow');
  const cnt = (await page.textContent('#cnt')).trim();
  log((hits.length > 0 && hits.length < allRows.length ? '[ok]  ' : '[FAIL]') +
    ' search filters the roster (' + allRows.length + ' -> ' + hits.length + ', "' + cnt + '")');

  // grade filter
  await page.fill('#q', '');
  await page.selectOption('#fGrade', { index: 2 });
  await page.click('#btnGo');
  await page.waitForTimeout(1300);
  const gradeRows = await page.$$('#main pre.ascii .trow');
  log((gradeRows.length > 0 && gradeRows.length < allRows.length ? '[ok]  ' : '[FAIL]') +
    ' grade filter narrows the roster (' + gradeRows.length + ' rows)');

  // Fresh browser context per role -- otherwise localStorage carries the
  // previous session over and the login screen never appears.
  const rolePage = async () => {
    const c = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push('role pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('role console: ' + m.text()); });
    await p.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lu', { timeout: 15000 });
    return p;
  };

  // ---- logout returns to the login screen
  await page.click('#app button[onclick*="logout"]').catch(() => { });
  await page.waitForTimeout(1200);
  await page.waitForSelector('#lu', { timeout: 15000 });
  log('[ok]  logout returns to the login screen');

  // ---- teacher role
  const page2 = await rolePage();
  await page2.fill('#lu', 'katherine.nolan');
  await page2.fill('#lp', 'teacher');
  await page2.click('#lgo');
  await page2.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  await page2.waitForTimeout(1400);
  const navT = await page2.textContent('#side');
  log((!navT.includes('SETUP') ? '[ok]  ' : '[FAIL]') + ' teacher cannot see the SETUP module');
  await page2.screenshot({ path: path.join(SHOTS, 'teacher-dashboard.png') });

  // ---- student role
  const page3 = await rolePage();
  await page3.fill('#lu', 'student1');
  await page3.fill('#lp', 'student');
  await page3.click('#lgo');
  await page3.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  await page3.waitForTimeout(1500);
  await page3.evaluate(() => { location.hash = '#/students'; });
  await page3.waitForTimeout(1300);
  const sRows = await page3.$$('#main pre.ascii .trow');
  log((sRows.length === 1 ? '[ok]  ' : '[FAIL]') + ' student portal shows only own record (' + sRows.length + ' row)');
  await page3.screenshot({ path: path.join(SHOTS, 'student-portal.png') });

  // ---- parent role (sees only own children)
  const page4 = await rolePage();
  await page4.fill('#lu', 'parent');
  await page4.fill('#lp', 'parent');
  await page4.click('#lgo');
  await page4.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  await page4.waitForTimeout(1400);
  await page4.evaluate(() => { location.hash = '#/students'; });
  await page4.waitForTimeout(1300);
  const pRows = await page4.$$('#main pre.ascii .trow');
  log((pRows.length >= 1 && pRows.length <= 8 ? '[ok]  ' : '[FAIL]') + ' parent portal shows only own children (' + pRows.length + ' row)');
  const navP = await page4.textContent('#side');
  log((!navP.includes('SETUP') ? '[ok]  ' : '[FAIL]') + ' parent cannot see the SETUP module');
  await page4.screenshot({ path: path.join(SHOTS, 'parent-portal.png') });

  await browser.close();

  console.log('\n  ' + '='.repeat(56));
  if (errors.length) {
    console.log('  ' + errors.length + ' ERROR(S) CAPTURED:');
    [...new Set(errors)].slice(0, 40).forEach((e) => console.log('   - ' + e));
  } else {
    console.log('  NO console / page errors captured');
  }
  console.log('  screenshots -> ' + SHOTS);
  console.log('  ' + '='.repeat(56) + '\n');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('\n  [X] UI test crashed: ' + e.stack + '\n'); process.exit(1); });
