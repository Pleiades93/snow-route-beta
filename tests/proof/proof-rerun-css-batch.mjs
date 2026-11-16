// Proof — rerun CSS batch (fix_id: rerun-css-batch, sweep re-run
// sweep-20261115-171048 findings E-02..E-06, assessed 2026-11-15).
//
// Every check measures the FAILURE PROPERTY ITSELF in the rendered,
// assembled app (never a proxy, never a source grep): computed transition
// durations under emulated prefers-reduced-motion, elementFromPoint hit
// ownership over the re-centre button, rendered text/button box
// intersections in route rows, close-button anchoring across a real
// scroll, and the selection popup's content-box / overflow geometry.
// Method follows the candidates assessment (measure-e.cjs): the app is
// served over a local HTTP origin and driven in Chromium at 390x844 and
// 430x932 (plus a 390x440 short viewport for E-05, whose defect only
// exists when the Settings menu actually scrolls).
//
// On unmodified main every E-item has at least one failing check (the
// assessment's measured values); with the fix all checks pass.
//
// Run from the repo root:  node tests/proof/proof-rerun-css-batch.mjs
// Needs playwright-core + a Chromium: PLAYWRIGHT_CORE / CHROME_BIN env
// vars override the VM's known locations.

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
let chromium = null;
for (const cand of [process.env.PLAYWRIGHT_CORE,
  '/home/hatch/workspace/snow-route-5w/beta1/work/shots/node_modules/playwright-core',
  'playwright-core']) {
  if (!cand) continue;
  try { ({ chromium } = require(cand)); if (chromium) break; } catch (e) { /* next */ }
}
if (!chromium) { console.error('FAIL: playwright-core not resolvable'); process.exit(2); }
const EXE = [process.env.CHROME_BIN,
  '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
  '/opt/meta-chromium/chrome'].find(p => p && fs.existsSync(p));
if (!EXE) { console.error('FAIL: no Chromium executable found'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PAGE_URL = `http://127.0.0.1:${server.address().port}/index.html`;

const results = [];
function ok(name, cond, detail) {
  results.push({ name, pass: cond === true, detail });
  console.log(`${cond === true ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
const R = r => r ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null;
const overlap = (a, b) => {
  if (!a || !b) return null;
  const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? { w: +w.toFixed(1), h: +h.toFixed(1) } : null;
};

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// Drive a fresh page through the real boot: pick the first route so the
// splash lifts and the working chrome exists (hit tests are meaningless
// while the z-9999 splash covers the z-1001 popup).
async function bootThrough(page) {
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('#rmChoose');
  await page.waitForFunction(() => document.querySelectorAll('#rmRoutes .routeRow').length > 0, null, { timeout: 8000 });
  await page.click('#rmRoutes .routeRow');
  await page.waitForFunction(() => {
    const s = document.getElementById('splash');
    return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).visibility === 'hidden';
  }, null, { timeout: 12000 });
  await page.waitForTimeout(600);
}
try {
  // ---------------- E-02: reduced motion must zero the menu transitions ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(PAGE_URL, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const dur = el => getComputedStyle(el).transitionDuration;
      const rm = document.getElementById('routeMenu');
      const pane = document.getElementById('rmMain');
      const sm = document.getElementById('setMenu');
      const out = { media: matchMedia('(prefers-reduced-motion: reduce)').matches };
      out.boot = dur(rm); out.bootPane = dur(pane);
      rm.classList.add('show'); out.bootShowPane = dur(pane); rm.classList.remove('show');
      rm.classList.remove('boot'); rm.classList.add('open'); out.open = dur(rm);
      rm.classList.remove('open'); rm.classList.add('bye'); out.bye = dur(rm);
      out.setClosed = dur(sm); sm.classList.add('open'); out.setOpen = dur(sm);
      return out;
    });
    ok('E-02 media query emulated', m.media === true);
    for (const k of ['boot', 'bootPane', 'bootShowPane', 'open', 'bye', 'setClosed', 'setOpen']) {
      const allZero = String(m[k]).split(',').every(s => s.trim() === '0s');
      ok(`E-02 transition duration is 0s (${k})`, allZero, `${k} = ${m[k]}`);
    }
    await ctx.close();
  }

  // ---------------- E-03 + E-06: selection popup states --------------------
  for (const vp of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    await bootThrough(page);
    const tag = `${vp.width}x${vp.height}`;
    const e03 = await page.evaluate(() => {
      const sp = document.getElementById('selPop'); sp.classList.remove('hidden');
      const cb = document.getElementById('centreBtn'); cb.classList.remove('hidden');
      const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const c = rect('centreBtn');
      // sample points across the button's disc (centre + mid-edge insets)
      const pts = [[.5, .5], [.5, .18], [.5, .82], [.18, .5], [.82, .5], [.3, .3], [.7, .7]]
        .map(([fx, fy]) => [c.x + c.width * fx, c.y + c.height * fy]);
      const hits = pts.map(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (cb.contains(el) || el === cb ? 'centreBtn' : (el.id || el.className || el.tagName)) : 'none'; });
      const before = { nb: rect('nightBtn').y, cb: rect('centreBtn').y, sp: rect('selPop').y };
      document.documentElement.style.setProperty('--sat', '44px');
      const after = { nb: rect('nightBtn').y, cb: rect('centreBtn').y, sp: rect('selPop').y };
      document.documentElement.style.removeProperty('--sat');
      return { hits, satDelta: { nightBtn: after.nb - before.nb, centreBtn: after.cb - before.cb, selPop: after.sp - before.sp } };
    });
    ok(`E-03 re-centre button owns every sampled tap (${tag})`, e03.hits.every(h => h === 'centreBtn'), `hits: ${e03.hits.join(',')}`);
    for (const k of ['nightBtn', 'centreBtn']) {
      ok(`E-03 ${k} rides var(--sat) (${tag})`, Math.abs(e03.satDelta[k] - 44) < 1.5, `delta = ${e03.satDelta[k].toFixed(1)}px for a 44px --sat`);
    }
    // night theme geometry (390 only, per the assessment's identical-geometry note)
    if (vp.width === 390) {
      const night = await page.evaluate(() => {
        document.body.classList.add('night');
        const cb = document.getElementById('centreBtn'); const c = cb.getBoundingClientRect();
        const el = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
        document.body.classList.remove('night');
        return el ? (cb.contains(el) || el === cb) : false;
      });
      ok('E-03 re-centre button owns its centre tap (night)', night === true);
    }
    // Beta 1.209 re-derivation (TEST-class): through 1.208 this block read
    // the buttons in a FORCED all-four-visible state (the card unhidden by
    // hand, renderPanel never run) - a state the app cannot take, since
    // renderPanel's display toggles are the only visibility path and they
    // never show more than two of the four buttons. Look 2's 14.5px type
    // and the longer 'Complete entire road' label make that artificial
    // row geometrically impossible, so the same failure properties (row
    // overflow; a button pushed past the card's edge; the note icon
    // squeezed) are now measured in the two states the card really takes,
    // driven through the app's own selection functions - the properties
    // are unchanged, the states are the reachable ones.
    const e06 = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const sp = document.getElementById('selPop');
      const note = document.getElementById('selNote');
      const svg = note.querySelector('svg');
      const acts = sp.querySelector('.selActs');
      const cs = getComputedStyle(note);
      const meas = () => {
        const spr = sp.getBoundingClientRect();
        const btns = {};
        for (const id of ['selNote', 'selAllBtn', 'selBtn', 'selClearBtn']) { const el = document.getElementById(id); if (el.style.display === 'none') continue; const r = el.getBoundingClientRect(); btns[id] = { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; }
        return { actsClientW: acts.clientWidth, actsScrollW: acts.scrollWidth, spRight: spr.right, spX: spr.x, btns };
      };
      selectStretch('Velmar', 0, STRETCH.Velmar.line[10]); await sleep(350);
      const single = meas();
      // the note metrics are captured NOW, while the single state is
      // visible - after deselect() the card is display:none and both
      // widths read 0, which would pass the icon-fit check vacuously
      // (Codex P2 on PR #84, real: the first re-derived form read them
      // after the state walk)
      const noteM = {
        padL: cs.paddingLeft, padR: cs.paddingRight, minH: cs.minHeight,
        contentW: note.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        svgW: svg ? svg.getBoundingClientRect().width : 0,
      };
      tapStretch('Velmar', 1, STRETCH.Velmar.line[10]); await sleep(350);
      const multi = meas();
      deselect();
      return { ...noteM, single, multi };
    });
    const inside = st => Object.values(st.btns).every(b => b.right <= st.spRight - 0.5 && b.x >= st.spX - 0.5);
    ok(`E-06 note button keeps its own padding (${tag})`, e06.padL === '0px' && e06.padR === '0px', `padding = ${e06.padL}/${e06.padR}`);
    ok(`E-06 note button keeps its own min-height (${tag})`, e06.minH === '34px', `min-height = ${e06.minH}`); // Beta 1.209: Look 2 specs the note button at 34px (was 40px) - the pin follows the spec at the same strength
    ok(`E-06 note icon fits its content box (${tag})`, e06.contentW > 0 && e06.svgW > 0 && e06.contentW >= e06.svgW - 0.5, `content ${e06.contentW.toFixed(1)}px vs icon ${e06.svgW.toFixed(1)}px`); // non-zero guards: a hidden-card read is 0/0 and must never pass (Codex P2, PR #84)
    ok(`E-06 action row does not overflow - single state (${tag})`, e06.single.actsScrollW <= e06.single.actsClientW + 0.5, `scrollWidth ${e06.single.actsScrollW} vs clientWidth ${e06.single.actsClientW}`);
    ok(`E-06 action row does not overflow - multi state (${tag})`, e06.multi.actsScrollW <= e06.multi.actsClientW + 0.5, `scrollWidth ${e06.multi.actsScrollW} vs clientWidth ${e06.multi.actsClientW}`);
    ok(`E-06 every visible button stays inside the card - single state (${tag})`, inside(e06.single), JSON.stringify(e06.single.btns));
    ok(`E-06 Clear stays inside the card - multi state (${tag})`, inside(e06.multi) && !!e06.multi.btns.selClearBtn, `Clear right ${e06.multi.btns.selClearBtn ? e06.multi.btns.selClearBtn.right.toFixed(1) : 'hidden'} vs card right ${e06.multi.spRight.toFixed(1)}`);
    // The card is ONE fixed size for one section or many (Beta 1.34,
    // pinned by drive128 M7b): the note button (34px since Look 2,
    // Beta 1.209; 40px before) shows only in the single state, so the
    // action row must reserve its height in both.
    const m7b = await page.evaluate(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const pop = () => { const r = document.getElementById('selPop').getBoundingClientRect(); return { w: r.width, h: r.height }; };
      selectStretch('Velmar', 0, STRETCH.Velmar.line[10]); await sleep(350);
      const single = pop();
      tapStretch('Velmar', 1, STRETCH.Velmar.line[10]); await sleep(350);
      const multi = pop();
      deselect();
      return { single, multi };
    });
    ok(`E-06 card size identical for one section or many (${tag})`,
      Math.abs(m7b.multi.w - m7b.single.w) <= 1 && Math.abs(m7b.multi.h - m7b.single.h) <= 1,
      `single ${m7b.single.w.toFixed(1)}x${m7b.single.h.toFixed(1)} vs multi ${m7b.multi.w.toFixed(1)}x${m7b.multi.h.toFixed(1)}`);
    await ctx.close();
  }

  // ---------------- E-04: route rows ---------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(PAGE_URL, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const rm = document.getElementById('routeMenu');
      rm.classList.remove('boot'); rm.classList.add('tab', 'open');
      rm.style.opacity = '1'; rm.style.visibility = 'visible'; rm.style.transform = 'none';
      document.querySelectorAll('.rmPane').forEach(p => p.classList.toggle('on', p.id === 'rmListPane'));
      const list = document.getElementById('rmRoutes'); list.replaceChildren();
      const mk = (name, sub, extra) => {
        const row = routeRowShell('div', name, sub);
        if (extra === 'del') { const d = document.createElement('button'); d.className = 'routeDel'; d.type = 'button'; d.textContent = 'Delete'; row.appendChild(d); }
        if (extra === 'chev') { const s = document.createElement('span'); s.className = 'routeChev'; s.textContent = '›'; row.appendChild(s); }
        list.appendChild(row); return row;
      };
      const measure = row => {
        const meta = row.querySelector('.routeMeta'), nm = row.querySelector('.routeName');
        const extra = row.querySelector('.routeDel') || row.querySelector('.routeChev');
        const rr = row.getBoundingClientRect(), mr = meta.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(nm);
        const tr = range.getBoundingClientRect();
        const res = { rowH: rr.height, metaH: mr.height, spills: mr.height > rr.height + 0.5, textExtra: null, areaExtra: null };
        if (extra) { const er = extra.getBoundingClientRect();
          const w = Math.min(tr.right, er.right) - Math.max(tr.x, er.x);
          const h = Math.min(tr.bottom, er.bottom) - Math.max(tr.y, er.y);
          res.textExtra = (w > 0 && h > 0) ? { w: +w.toFixed(1), h: +h.toFixed(1) } : null;
          // the subtitle's own box vs the extra: paint is clipped to the
          // element box (overflow:hidden), so the box IS the painted area
          const ar = row.querySelector('.routeArea').getBoundingClientRect();
          const aw = Math.min(ar.right, er.right) - Math.max(ar.x, er.x);
          const ah = Math.min(ar.bottom, er.bottom) - Math.max(ar.y, er.y);
          res.areaExtra = (aw > 0 && ah > 0) ? { w: +aw.toFixed(1), h: +ah.toFixed(1) } : null; }
        return res;
      };
      return {
        fills: measure(mk('North Fields And The Long concession Run', 'Vaughan · 34 streets', 'del')),
        wraps: measure(mk('A Very Long Created Route Name That Wraps Onto Several Lines Because The Area Is Huge', 'Some Outlying Township With A Long Name · 128 streets', 'del')),
        control: measure(mk('Short', 'Innisfil · 12 streets', 'del')),
        chevron: measure(mk('North Fields And The Long concession Run', 'Vaughan · 34 streets', 'chev')),
      };
    });
    for (const k of ['fills', 'wraps', 'control']) {
      ok(`E-04 name text clears the Delete button (${k})`, m[k].textExtra === null, JSON.stringify(m[k].textExtra));
      ok(`E-04 subtitle box clears the Delete button (${k})`, m[k].areaExtra === null, JSON.stringify(m[k].areaExtra));
      ok(`E-04 meta stays inside the row (${k})`, m[k].spills === false, `meta ${m[k].metaH.toFixed(1)}px vs row ${m[k].rowH.toFixed(1)}px`);
    }
    ok('E-04 name text clears the chevron (no-Delete row)', m.chevron.textExtra === null, JSON.stringify(m.chevron.textExtra));
    ok('E-04 subtitle box clears the chevron (no-Delete row)', m.chevron.areaExtra === null, JSON.stringify(m.chevron.areaExtra));
    await ctx.close();
  }

  // ---------------- E-05: close buttons vs menu scroll ----------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 440 } });
    const page = await ctx.newPage();
    await page.goto(PAGE_URL, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      document.documentElement.classList.remove('boot');
      const sm = document.getElementById('setMenu');
      sm.style.opacity = '1'; sm.style.visibility = 'visible'; sm.style.transform = 'none';
      document.querySelectorAll('#setMenu .rmPane').forEach(p => p.classList.toggle('on', p.id === 'setStatusPane'));
      const xc = document.getElementById('setClose'), ver = document.getElementById('setVer');
      const y = el => el.getBoundingClientRect().y;
      const res = { scrollable: sm.scrollHeight - sm.clientHeight, close0: y(xc), ver0: y(ver) };
      sm.scrollTop = 10000; res.scrolledBy = sm.scrollTop;
      res.close1 = y(xc); res.ver1 = y(ver);
      sm.scrollTop = 0;
      return res;
    });
    ok('E-05 Settings menu actually scrolls at 390x440', m.scrolledBy >= 30, `scrolled ${m.scrolledBy}px of ${m.scrollable}px range`);
    ok('E-05 Settings close X stays put while scrolling', Math.abs(m.close1 - m.close0) < 0.6, `y ${m.close0.toFixed(1)} -> ${m.close1.toFixed(1)}`);
    ok('E-05 version label stays put while scrolling', Math.abs(m.ver1 - m.ver0) < 0.6, `y ${m.ver0.toFixed(1)} -> ${m.ver1.toFixed(1)}`);
    await ctx.close();
    // full-height control: the approved layout is untouched (X clear of the pane)
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx2.newPage();
    await p2.goto(PAGE_URL, { waitUntil: 'load' }); await p2.waitForTimeout(1200);
    const c = await p2.evaluate(() => {
      document.documentElement.classList.remove('boot');
      const sm = document.getElementById('setMenu');
      sm.style.opacity = '1'; sm.style.visibility = 'visible'; sm.style.transform = 'none';
      document.querySelectorAll('#setMenu .rmPane').forEach(p => p.classList.toggle('on', p.id === 'setStatusPane'));
      const pane = document.getElementById('setStatusPane').getBoundingClientRect();
      const xc = document.getElementById('setClose').getBoundingClientRect();
      return { paneBottom: pane.bottom, closeTop: xc.top };
    });
    ok('E-05 full-height layout unchanged (X below the pane)', c.closeTop >= c.paneBottom - 0.5, `X top ${c.closeTop.toFixed(1)} vs pane bottom ${c.paneBottom.toFixed(1)}`);
    await ctx2.close();
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:', failed.map(f => f.name).join(' | ')); process.exit(1); }
