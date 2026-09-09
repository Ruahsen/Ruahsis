'use strict';
/**
 * Mobile / responsive smoke test.
 * Drives the app at real phone viewports and asserts:
 *   - no horizontal page overflow (the shell itself must not scroll sideways)
 *   - the nav drawer opens/closes
 *   - every module renders and stays inside the viewport
 *   - ASCII tables fall back to stacked record cards
 *   - modals fit the screen
 *
 *   NODE_PATH=<workspace>/node_modules node lib/mobiletest.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE || 'http://localhost:8787';
const SHOTS = path.join(__dirname, '..', 'screenshots', 'mobile');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const DEVICES = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'iPad mini', width: 768, height: 1024 }
];

const ROUTES = ['dashboard', 'students', 'staff', 'courses', 'sections', 'master',
  'grades', 'attendance', 'discipline', 'fees', 'reports', 'messages', 'setup'];

let pass = 0, fail = 0;
const log = (ok, msg) => { ok ? pass++ : fail++; console.log('  ' + (ok ? '[ok]  ' : '[FAIL]') + ' ' + msg); };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  for (const dev of DEVICES) {
    console.log('\n  ── ' + dev.name + '  (' + dev.width + 'x' + dev.height + ') ' + '─'.repeat(24));
    const ctx = await browser.newContext({
      viewport: { width: dev.width, height: dev.height },
      deviceScaleFactor: 2,
      isMobile: dev.width < 700,
      hasTouch: dev.width < 700,
      userAgent: dev.width < 700
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#lu', { timeout: 15000 });

    // ---- login screen must fit
    let over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log(over <= 1, 'login screen has no horizontal overflow (' + over + 'px)');
    await page.screenshot({ path: path.join(SHOTS, dev.name.replace(/\s/g, '') + '-01-login.png') });

    await page.fill('#lu', 'admin');
    await page.fill('#lp', 'admin');
    await page.click('#lgo');
    await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
    await page.waitForTimeout(1300);

    // ---- shell must never overflow horizontally
    over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log(over <= 1, 'app shell has no horizontal overflow (' + over + 'px)');

    // ---- hamburger visible on phone, hidden on tablet+
    const burger = await page.isVisible('#btnMenu');
    if (dev.width < 900) log(burger, 'hamburger menu button is visible');
    else log(!burger, 'hamburger hidden at tablet width, sidebar inline');

    // ---- drawer opens and closes
    if (dev.width < 900) {
      await page.click('#btnMenu');
      await page.waitForTimeout(400);
      const open = await page.evaluate(() => document.getElementById('side').classList.contains('open'));
      log(open, 'nav drawer opens');
      await page.screenshot({ path: path.join(SHOTS, dev.name.replace(/\s/g, '') + '-02-drawer.png') });

      // tap a module in the drawer -> navigates and closes
      await page.click('#side a[data-view="students"]');
      await page.waitForTimeout(1200);
      const closed = await page.evaluate(() => !document.getElementById('side').classList.contains('open'));
      const hash = await page.evaluate(() => location.hash);
      log(closed && hash.indexOf('students') >= 0, 'tapping a drawer item navigates and closes it (' + hash + ')');
    }

    // ---- walk every module, check overflow + content
    for (const r of ROUTES) {
      await page.evaluate((h) => { location.hash = '#/' + h; }, r);
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => ({
        over: document.documentElement.scrollWidth - window.innerWidth,
        len: (document.getElementById('main').textContent || '').trim().length,
        // widest element that is NOT an intentional scroll container
        wide: (() => {
          const vw = window.innerWidth;
          let worst = 0, tag = '';
          document.querySelectorAll('#main *').forEach((el) => {
            const cs = getComputedStyle(el);
            if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
            const w = el.getBoundingClientRect().width;
            if (w > worst) { worst = w; tag = el.tagName + '.' + el.className; }
          });
          return { w: Math.round(worst), tag, vw };
        })()
      }));
      const ok = m.over <= 1 && m.len > 100;
      log(ok, r.padEnd(11) + ' renders (' + m.len + ' chars, overflow ' + m.over + 'px)');
    }

    await page.screenshot({ path: path.join(SHOTS, dev.name.replace(/\s/g, '') + '-03-dashboard.png') });

    // ---- ASCII tables become stacked cards on phones
    await page.evaluate(() => { location.hash = '#/students'; });
    await page.waitForTimeout(1300);
    const cards = await page.evaluate(() => {
      const t = document.querySelector('#main pre.ascii[data-table]');
      if (!t) return null;
      const lines = t.textContent.split('\n');
      const rows = t.querySelectorAll('.trow');
      return {
        rowCount: rows.length,
        linesPerRow: rows.length ? rows[0].textContent.split('\n').length : 0,
        firstLine: lines[0] || '',
        width: Math.max.apply(null, lines.map((l) => l.length))
      };
    });
    if (dev.width <= 760) {
      log(cards && cards.rowCount > 0 && cards.linesPerRow > 2,
        'ASCII roster renders as stacked cards (' + (cards ? cards.rowCount : 0) + ' rows, ' +
        (cards ? cards.linesPerRow : 0) + ' lines each)');
      log(cards && cards.width <= 64, 'card width fits the screen (' + (cards ? cards.width : '?') + ' chars)');
    } else {
      log(cards && cards.rowCount > 0, 'ASCII roster renders as a wide table (' + (cards ? cards.rowCount : 0) + ' rows)');
    }
    await page.screenshot({ path: path.join(SHOTS, dev.name.replace(/\s/g, '') + '-04-students.png') });

    // ---- a modal must fit
    await page.click('#btnNew');
    await page.waitForTimeout(600);
    const box = await page.evaluate(() => {
      const b = document.querySelector('#modal .box');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), vw: window.innerWidth };
    });
    log(box && box.left >= -1 && box.right <= box.vw + 1,
      'modal fits the viewport (' + (box ? box.w + '/' + box.vw + 'px' : 'no modal') + ')');
    await page.screenshot({ path: path.join(SHOTS, dev.name.replace(/\s/g, '') + '-05-modal.png') });
    await page.click('#modal [data-close]');
    await page.waitForTimeout(300);

    log(errors.length === 0, 'no console / page errors' + (errors.length ? ' -> ' + errors.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  await browser.close();
  console.log('\n  ' + '='.repeat(56));
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  console.log('  screenshots -> ' + SHOTS);
  console.log('  ' + '='.repeat(56) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\n  [X] mobile test crashed: ' + e.stack + '\n'); process.exit(1); });
