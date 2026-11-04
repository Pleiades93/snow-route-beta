// E2E v2 (Beta 1.53 diagnosis): real service worker + real Cache Storage over
// http://127.0.0.1:8077. The browser has no direct internet locally, so ALL
// network legs are fulfilled through Node fetch (working egress) - including
// the service worker's OWN fetches, via Target auto-attach: each target
// (page, service worker) gets Fetch interception on its own session, and a
// request pauses in exactly the session whose context issued it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PROFILE = '/tmp/e2e2profile-' + Date.now(); // Beta 1.73 (audit C02): a NAMED profile, so E14 can kill the browser and relaunch on the same one - a true cold-process boot, not a reload
let proc = null, ws = null, PAGE_S = null;
let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set();
function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
let netOff = false; // Phase 3 (Beta 1.72): when true, every intercepted request fails - a true dead-zone simulation for the page AND the worker's own fetches
let tileDelayMs = 0; // Beta 1.73 (audit C01): slows tile responses so a download can be caught genuinely mid-flight
const tileReqs = []; // Beta 1.73 (audit C03): every tile request that reached the network leg, with its outcome
function noteTile(url, failed) { const tm = /\/(\d+)\/(\d+)\/(\d+)\.mvt/.exec(url); if (tm) tileReqs.push({ z: +tm[1], x: +tm[2], y: +tm[3], failed: !!failed }); }
const tileX = (lng, z) => Math.floor((lng + 180) / 360 * Math.pow(2, z));
const tileY = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); };
const inBox = (t) => t.x >= tileX(-79.75, t.z) && t.x <= tileX(-79.35, t.z) && t.y >= tileY(44.05, t.z) && t.y <= tileY(43.70, t.z); // the preload box (Vaughan + nearby): tiles outside it were never promised
const inPreload = (t) => t.z >= 8 && t.z <= 14 && inBox(t); // the preload contract: box tiles at z8-14 (probe-verified: the map also asks for edge tiles outside the box and z7 parents below the app's own min zoom - those render blank offline by design and are not failures)
async function fulfil(sessionId, p) {
  const url = p.request.url;
  if (tileDelayMs && url.includes('cartocdn')) await sleep(tileDelayMs); // on BOTH paths: a dead-network burst must not burn the whole list at full speed either (E15)
  if (netOff) { noteTile(url, true); await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }, sessionId); return; }
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    noteTile(url, r.status >= 400);
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: ct }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { noteTile(url, true); await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); }
}
async function launchBrowser() {
  proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server',
    '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=' + PROFILE,
    '--window-size=420,900', 'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no devtools url')), 25000); });
  ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', async ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Target.attachedToTarget') {
      const sid = msg.params.sessionId, type = msg.params.targetInfo.type;
      if (!sessions.has(sid)) {
        sessions.add(sid);
        const pats = type === 'service_worker'
          ? [{ urlPattern: '*cartocdn*', requestStage: 'Request' }, { urlPattern: '*github.io*', requestStage: 'Request' }, { urlPattern: '*jsdelivr*', requestStage: 'Request' }, { urlPattern: '*127.0.0.1:8077*', requestStage: 'Request' }]
          : [{ urlPattern: '*jsdelivr*', requestStage: 'Request' }, { urlPattern: '*cartocdn*', requestStage: 'Request' }, { urlPattern: '*github.io*', requestStage: 'Request' }];
        await send('Fetch.enable', { patterns: pats }, sid);
        console.log('attached:', type, 'fetch interception on');
      }
      return;
    }
    if (msg.method === 'Fetch.requestPaused') { fulfil(msg.sessionId, msg.params); return; }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId === PAGE_S) { consoleLog.push((msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ')); }
    if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === PAGE_S) { const d = msg.params.exceptionDetails; consoleLog.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text)); }
  });
  await send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const att = await send('Target.attachToTarget', { targetId, flatten: true });
  PAGE_S = att.result.sessionId;
  await send('Page.enable', {}, PAGE_S);
  await send('Runtime.enable', {}, PAGE_S);
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, PAGE_S);
  await send('Page.navigate', { url: 'http://127.0.0.1:8077/index.html' }, PAGE_S);
}
await launchBrowser();
async function evaluate(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, PAGE_S); if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) }; return r.result && r.result.result ? r.result.result.value : undefined; }
const ev2 = async (code) => evaluate(code);
const poll = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev2(expr); if (v === true) return true; await sleep(500); } return false; };
await sleep(2000);
// Beta 1.53 (audit gap B08, closed): the battery's drives load the app from
// file:// where NO service worker can ever register, so the entire offline
// pipeline (worker, caches, preload counting) shipped untested end-to-end -
// which is how a CSP that blocked the worker reached Andrew's phone and his
// preload saved 0 of 894. This check serves the REAL built app over http,
// lets the REAL worker run, and proves the download actually stores files.
// Requires a server on 127.0.0.1:8077 serving the repo root (CI starts one).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
console.log('boot glOk:', await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000));
ok('E1 app boots with the map active (http, real worker present)', await poll(`typeof glOk !== 'undefined' && glOk === true`, 5000));
ok('E2 service worker controls the page', await poll(`!!navigator.serviceWorker.controller`, 30000));
const swState = await ev2(`(async () => { const reg = await navigator.serviceWorker.getRegistration(); return JSON.stringify({ reg: !!reg, active: !!(reg && reg.active), swErr: window.__swErr || null }); })()`);
ok('E3 registration active, no registration error | ' + swState, (() => { try { const d = JSON.parse(swState); return d.reg && d.active && !d.swErr; } catch (e) { return false; } })());
await ev2(`document.getElementById('xPre').click()`);
ok('E4 preload completes with a saved count', await poll(`document.getElementById('xPreStat').textContent.includes('Offline maps: saved')`, 420000));
const stat = await ev2(`document.getElementById('xPreStat').textContent`);
const m = /saved (\d+) of (\d+)/.exec(stat || '');
ok('E5 saved >= 883 of 897 (the 2026-11-01 regression saved 0) | ' + stat, !!m && +m[1] >= 883 && +m[2] === 897);
const counts = await ev2(`(async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).length; } return JSON.stringify(out); })()`);
const baseKeys = JSON.parse(await ev2(`(async () => { const c = await caches.open('snowroute-offline-v1'); const ks = await c.keys(); return JSON.stringify(ks.map(r => r.url).sort()); })()`)); // the pristine post-preload PACK key set, captured before any zooming (keysOf is defined further down, so this capture is inlined). Beta 1.94 (audit F-03): the preload writes into its own cache (snowroute-offline-v1), so this set is exactly the 897-file manifest - 633 tiles + 256 Noto Sans Regular glyph ranges + 8 sprites. (Through 1.93 the pack shared snowroute-tiles-v1 and this census read 899: the manifest plus 2 opportunistic glyph files the live map fetched for boot-view labels - PROVEN 2026-11-03, work/e12b-probe. Those fetches now fall through to the browsing cache, so the pack census is exact.)
ok('E6 the offline pack cache really holds the files | ' + counts, (() => { try { return JSON.parse(counts)['snowroute-offline-v1'] >= 883; } catch (e) { return false; } })());
// ---- Phase 3 (Beta 1.72): E1-E6 prove the files land in the cache. These
// prove the app actually LIVES on them: renders with the network dead, at
// every zoom it allows, across a worker upgrade and a mid-download death.
// E8: cold boot offline - shell, scripts, styles and tiles all from cache.
netOff = true;
await send('Page.reload', { ignoreCache: false }, PAGE_S);
ok('E8 offline cold boot renders the map from cache alone', (await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000)) && (await poll(`typeof tilesOk !== 'undefined' && tilesOk > 0`, 30000)));
// E9/E10: the wide zooms offline (the R04 gap: minZoom is 8, the preload
// stopped at z10 until 1.72). New tile data must still arrive - from cache.
const zoomProbe = async (z) => { const before = await ev2(`typeof tilesOk !== 'undefined' ? tilesOk : -1`); await ev2(`(() => { map.jumpTo({ zoom: ${z} }); return true; })()`); await sleep(5000); const after = await ev2(`typeof tilesOk !== 'undefined' ? tilesOk : -1`); const zoomNow = await ev2(`typeof map !== 'undefined' && map ? map.getZoom() : -1`); return [before, after, zoomNow]; }; // Beta 1.73 fix: GLM is the engine's CLOSURE variable, not a page global - the 1.72 probe's jumpTo silently threw on every run and the checks passed on load-settling alone. The probe now drives the real `map` global and reports the zoom it actually reached
// Beta 1.73 (audit C03): tilesOk rising proves tile EVENTS, not that the RIGHT
// tiles are cached. coverCheck computes the exact tiles covering the current
// view at the zoom band on screen and requires every one to be in the cache.
const coverCheck = async (z) => {
  const expr = '(async () => { const zz = [' + Math.floor(z) + ', ' + Math.ceil(z) + ']; const b = map.getBounds(); const tc = await caches.open(\'snowroute-offline-v1\'); const bc = await caches.open(\'snowroute-tiles-v1\'); const tpl = \'https://tiles.basemaps.cartocdn.com/v/20261026-01/vectortiles/carto.streets/v2/{z}/{x}/{y}.mvt\'; const xOf = (lng, k) => Math.floor((lng + 180) / 360 * Math.pow(2, k)); const yOf = (lat, k) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, k)); }; let need = 0, have = 0; for (const k of zz) { const xa = Math.max(xOf(b.getWest(), k), xOf(-79.75, k)), xb = Math.min(xOf(b.getEast(), k), xOf(-79.35, k)), ya = Math.max(yOf(b.getNorth(), k), yOf(44.05, k)), yb = Math.min(yOf(b.getSouth(), k), yOf(43.70, k)); for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) { need++; const U = tpl.replace(\'{z}\', k).replace(\'{x}\', x).replace(\'{y}\', y); if (await tc.match(U) || await bc.match(U)) have++; } } return JSON.stringify({ need, have }); })()'; // Beta 1.94: a covering tile counts when it is in EITHER cache - the worker serves the pack first and the browsing cache second, so coverage is the union
  try { return JSON.parse(await ev2(expr)); } catch (e) { return { need: -1, have: -1 }; }
};
const keysOf = async () => { const s = await ev2(`(async () => { const tc = await caches.open('snowroute-offline-v1'); const ks = await tc.keys(); return JSON.stringify(ks.map(k => k.url).sort()); })()`); try { return JSON.parse(s); } catch (e) { return []; } }; // Beta 1.94: the pack census - the preload's own cache (E12/E15/E16 partial-and-resume arithmetic is about the pack)
tileReqs.length = 0;
const zp9 = await zoomProbe(8.4);
ok('E9 offline at zoom 8.4, basemap tiles still arrive (from cache) | tilesOk ' + zp9[0] + ' -> ' + zp9[1] + ' zoomNow ' + zp9[2], zp9[1] > zp9[0] && Math.abs(zp9[2] - 8.4) < 0.3);
const cov9 = await coverCheck(8.4); const fail9 = tileReqs.filter(t => t.failed && inPreload(t)).length;
ok('E9b (C03) every in-box tile the z8.4 view needs is in the offline cache and no in-box tile request failed | need ' + cov9.need + ' have ' + cov9.have + ' failedPreload ' + fail9, cov9.need > 0 && cov9.have === cov9.need && fail9 === 0);
// (E10 reload-isolates like E9's fresh boot did: chained off E9 instead, the
// z9 tiles E9 loaded would still cover the view and no new arrival could ever
// be observed - the first local run failed exactly that way, 4 -> 4, with the
// map rendering fine throughout.)
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000);
tileReqs.length = 0;
const zp10 = await zoomProbe(9.4);
ok('E10 offline at zoom 9.4, basemap tiles still arrive (from cache) | tilesOk ' + zp10[0] + ' -> ' + zp10[1] + ' zoomNow ' + zp10[2], zp10[1] > zp10[0] && Math.abs(zp10[2] - 9.4) < 0.3);
const cov10 = await coverCheck(9.4); const fail10 = tileReqs.filter(t => t.failed && inPreload(t)).length;
ok('E10b (C03) every in-box tile the z9.4 view needs is in the offline cache and no in-box tile request failed | need ' + cov10.need + ' have ' + cov10.have + ' failedPreload ' + fail10, cov10.need > 0 && cov10.have === cov10.need && fail10 === 0);
// E10c (audit section 11): the day/night swap is a local style change over
// embedded styles (Beta 1.33) - prove it also works with the network dead.
tileReqs.length = 0;
const nightWas = await ev2(`document.body.classList.contains('night')`);
await ev2(`document.getElementById('nightBtn').click()`);
await sleep(3000);
const nightNow = await ev2(`document.body.classList.contains('night')`);
const themeFail = tileReqs.filter(t => t.failed && inPreload(t)).length;
ok('E10c day/night switch works fully offline | night ' + nightWas + ' -> ' + nightNow + ' failedPreloadReqs ' + themeFail, nightWas !== nightNow && themeFail === 0 && (await ev2(`typeof glOk !== 'undefined' && glOk === true`)) === true);
await ev2(`document.getElementById('nightBtn').click()`);
await sleep(1500);
// E11: a worker upgrade takes over without taking the saved maps with it.
netOff = false;
const swFile = new URL('../../sw.js', import.meta.url);
const swOrig = fs.readFileSync(swFile, 'utf8');
let upgraded = false;
try {
  fs.writeFileSync(swFile, swOrig + '\n// e2e phase-3 upgrade probe (byte change only)\n');
  await ev2(`(() => { window.__ctl = false; navigator.serviceWorker.addEventListener('controllerchange', () => { window.__ctl = true; }); return true; })()`);
  await ev2(`(async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); return true; })()`);
  upgraded = await poll(`window.__ctl === true`, 45000);
} finally { fs.writeFileSync(swFile, swOrig); }
const counts2 = await ev2(`(async () => { const out = {}; for (const k of await caches.keys()) { const c = await caches.open(k); out[k] = (await c.keys()).length; } return JSON.stringify(out); })()`);
ok('E11 worker upgrade takes over and the offline pack cache survives (the 1.94 keep-list) | upgraded ' + upgraded + ' ' + counts2, upgraded && (() => { try { return JSON.parse(counts2)['snowroute-offline-v1'] >= 883; } catch (e) { return false; } })());
// E14 (Beta 1.73, audit C02): a TRUE cold boot offline. E8 reloads inside a
// live browser; this kills the process entirely and relaunches on the SAME
// persisted profile with the network dead from the first instant - the
// closest a test rig gets to a phone cold-starting in a dead zone.
netOff = true;
proc.kill('SIGKILL');
await sleep(1500);
for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(PROFILE + '/' + f, { force: true }); } catch (e) {} }
await launchBrowser();
ok('E14 cold-process offline boot renders the map from the persisted profile alone', (await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000)) && (await poll(`typeof tilesOk !== 'undefined' && tilesOk > 0`, 30000)) && (await poll(`!!navigator.serviceWorker.controller`, 30000)));
netOff = false;

// E12 (REBUILT Beta 1.73, audit C01): the 1.72 version of this test ran against
// the cache E4 had ALREADY filled, so its "interruption" proved nothing about
// a partial cache. Now the download starts from an EMPTY tile cache with tile
// responses throttled, a PARTIAL count is verified on disk, the page dies, and
// the resume must restore the full PRELOAD MANIFEST (897 files) and lose nothing the interrupted download had already stored. (Since Beta 1.94 baseKeys IS the manifest exactly - the pack has its own cache; through 1.93 the census ran 899 with 2 opportunistic glyph fetches mixed in. E15b asserts this same contract shape.)
const waitPartial = async () => { let n = 0; const t0 = Date.now(); while (Date.now() - t0 < 300000) { n = (await keysOf()).length; if (n >= 600) break; await sleep(700); } return n; };
await ev2(`(async () => { await caches.delete('snowroute-tiles-v1'); await caches.delete('snowroute-offline-v1'); try { localStorage.removeItem('snowroute.prep.v1'); } catch (e) {} return true; })()`);
tileDelayMs = 150;
await ev2(`document.getElementById('xPre').click()`);
const partial = await waitPartial();
const partialKeys = await keysOf();
ok('E12a the download was verifiably partial when the page died | cached ' + partial + ' of ' + baseKeys.length, partial >= 300 && partial <= baseKeys.length - 150);
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000);
tileDelayMs = 0;
await ev2(`document.getElementById('xPre').click()`);
ok('E12 preload interrupted by a page death still completes afterwards', await poll(`document.getElementById('xPreStat').textContent.includes('Offline maps: saved')`, 420000));
const stat2 = await ev2(`document.getElementById('xPreStat').textContent`);
const m2 = /saved (\d+) of (\d+)/.exec(stat2 || '');
const keysAfter = await keysOf();
const noLoss12 = partialKeys.every(u => keysAfter.includes(u));
ok('E12b the resumed download restores the full preload set (897) and loses nothing the interruption stored | ' + stat2 + ' | keys ' + keysAfter.length + ' (base ' + baseKeys.length + ' = the pack exactly)', !!m2 && +m2[1] === 897 && +m2[2] === 897 && noLoss12 && keysAfter.length >= 897);
// E15 (audit C01-T4): a dead-network BURST mid-download. The app's per-file
// failure handling skips what it cannot fetch and reports the short count
// honestly; a clean re-run must then restore the exact full set.
await ev2(`(async () => { await caches.delete('snowroute-tiles-v1'); await caches.delete('snowroute-offline-v1'); try { localStorage.removeItem('snowroute.prep.v1'); } catch (e) {} return true; })()`);
tileDelayMs = 150;
await ev2(`document.getElementById('xPre').click()`);
const partial15 = await waitPartial();
netOff = true;
await sleep(6000);
netOff = false;
tileDelayMs = 0;
await poll(`document.getElementById('xPreStat').textContent.includes('Offline maps: saved')`, 420000);
const statF = await ev2(`document.getElementById('xPreStat').textContent`);
const mF = /saved (\d+) of (\d+)/.exec(statF || '');
ok('E15a a dead-network burst leaves the download short, honestly reported | partial ' + partial15 + ' then ' + statF, !!mF && +mF[1] < 897 && +mF[2] === 897);
const keysMid = await keysOf();
await ev2(`document.getElementById('xPre').click()`);
const rerunOk = await poll(`document.getElementById('xPreStat').textContent.includes('saved 897 of 897')`, 420000);
const keysFinal = await keysOf();
const noLoss = keysMid.every(u => keysFinal.includes(u));
ok('E15b the re-run restores the full preload set and loses nothing | rerun ' + rerunOk + ' keys ' + keysFinal.length + ' burst survivors ' + keysMid.length, rerunOk && noLoss && keysFinal.length >= 897); // the preload's contract is the 897 files (baseKeys, exactly, since the 1.94 pack cache), and this section's page never reloads, so the sound claims are: full 897 restored, nothing the burst left behind lost
// E16 (Beta 1.74, audit D02): PROCESS death mid-download. E12 kills the page
// (a navigation); this kills the whole browser while the download is
// genuinely incomplete, relaunches on the SAME persisted profile, and the
// resumed download must restore the full set - the saved maps and the app's
// state have to survive a process kill, not just a reload.
await ev2(`(async () => { await caches.delete('snowroute-tiles-v1'); await caches.delete('snowroute-offline-v1'); try { localStorage.removeItem('snowroute.prep.v1'); } catch (e) {} return true; })()`);
tileDelayMs = 150;
await ev2(`document.getElementById('xPre').click()`);
const partial16 = await waitPartial();
const partialKeys16 = await keysOf();
ok('E16a the download was verifiably partial when the process died | cached ' + partial16 + ' of ' + baseKeys.length, partial16 >= 300 && partial16 <= baseKeys.length - 150);
tileDelayMs = 0;
proc.kill('SIGKILL');
await sleep(1500);
for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(PROFILE + '/' + f, { force: true }); } catch (e) {} }
await launchBrowser();
const backOk = (await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000)) && (await poll(`!!navigator.serviceWorker.controller`, 30000));
await ev2(`document.getElementById('xPre').click()`);
const stat16 = await poll(`document.getElementById('xPreStat').textContent.includes('saved 897 of 897')`, 420000);
const keysAfter16 = await keysOf();
const noLoss16 = partialKeys16.every(u => keysAfter16.includes(u));
ok('E16 process killed mid-download: relaunch on the same profile and the resumed download restores the full preload set (897) and loses nothing the kill left stored | back ' + backOk + ' keys ' + keysAfter16.length + ' (base ' + baseKeys.length + ' = the pack exactly)', backOk && stat16 && noLoss16 && keysAfter16.length >= 897);
// E18 (Beta 1.94, audit F-03): the browsing cache's FIFO eviction can never
// evict the downloaded pack. Flood snowroute-tiles-v1 past its 3000 cap from
// the page, then fetch fresh tiles THROUGH the worker in small batches,
// reading the count after each batch: the worker's trim fires at least every
// 25 puts and cuts to exactly 3000, so a reading at/under 3024 must appear
// within a few batches (a single end-state reading is racy - the trim can
// fire mid-flood while the page-side puts keep landing, as the first CI run
// of this check showed: pack intact at 897/897, count caught at 3126).
await ev2(`(async () => { const tc = await caches.open('snowroute-tiles-v1'); const res = new Response('x'); for (let i = 0; i < 3100; i++) await tc.put('https://tiles.basemaps.cartocdn.com/flood/' + i, res.clone()); return true; })()`);
let trimSeen = -1;
for (let batch = 0; batch < 60 && trimSeen < 0; batch++) {
  await ev2(`(async () => { const tpl = 'https://tiles.basemaps.cartocdn.com/v/20261026-01/vectortiles/carto.streets/v2/12/{x}/1490.mvt'; for (let i = 0; i < 5; i++) { try { await fetch(tpl.replace('{x}', ${1140 + batch * 5} + i)); } catch (e) {} } return true; })()`);
  const n = JSON.parse(await ev2(`(async () => { const tc = await caches.open('snowroute-tiles-v1'); return JSON.stringify((await tc.keys()).length); })()`));
  if (n <= 3024) trimSeen = n;
}
const e18 = JSON.parse(await ev2(`(async () => { const oc = await caches.open('snowroute-offline-v1'); const base = ${JSON.stringify(baseKeys)}; let have = 0; for (const u of base) { if (await oc.match(u)) have++; } return JSON.stringify({ have }); })()`));
ok('E18 browsing-cache eviction (flooded past its cap, trim observed at ' + trimSeen + ') leaves the downloaded pack untouched | pack ' + e18.have + ' of ' + baseKeys.length, e18.have === baseKeys.length && trimSeen > 0);
// E17 (Beta 1.74 audit E02): process death vs APP STATE. E14/E16 prove the
// map cache survives a kill; this proves the WORK does: an open clean, its
// session marker, marked streets and the GPS trail, all written through the
// app's own entry points (startClean, markDone, togglePiece, saveTrail),
// must come back byte-for-byte after the process dies - the phone case is
// iOS killing the app mid-clean. E17b is the audit's caveat made concrete:
// a marker whose write FAILED just before the kill was never persisted, so
// it is expected lost - what must survive is a consistent app that boots
// clean and saves normally afterwards (the sess flush retries every 15 s,
// so the kill lands well inside that window, before any retry can succeed).
// Both kills wait 10 s after the writes: browser local storage commits to
// disk asynchronously, and a kill inside the commit window loses writes
// that were correctly made - the first version of this test killed at
// 0.5 s and measured exactly that. A real clean runs for tens of minutes
// before any kill, so its writes are long committed; the wait models that,
// it does not hide an app defect (verified by probe: with the settle, every
// key survives byte-for-byte; without it, the browser had not yet stored
// them at all).
const loadRouteE2E = async () => { await poll(`(function(){ if (typeof routeLoaded !== 'undefined' && !routeLoaded && typeof loadRoute === 'function') { try { loadRoute('5w'); } catch (e) {} } return typeof routeLoaded !== 'undefined' && routeLoaded === true; })()`, 60000); await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000); }; // Beta 1.76: app state loads when a route is picked - E17's entry points (startClean, markDone) and state reads need the route loaded, including after each process-kill relaunch. Beta 1.77: also wait out the pick's intro flight.
const snapState = async () => JSON.parse(await ev2(`(() => { const out = {}; for (const k of ['start', 'sess', 'sides', 'done', 'times', 'via', 'trail']) out[k] = lsGet(LS[k]); out.app = JSON.stringify({ run: runStart, sess: trailSessions.slice(), velmar: pieces.Velmar[0], astona: pieces.Astona[0], done: Array.from(doneSet).sort(), trailN: trail.length }); return JSON.stringify(out); })()`));
// Phase 1 hygiene (architecture scan 2026-11-04, N4): the scenario runs as an
// attempt, and a failed attempt earns exactly ONE retry when - and only when -
// its failure carries the kill-vs-commit race signature: MONOTONE LOSS. Every
// differing key is absent, emptied, or a strict prefix of its pre-kill value,
// and the app summary's counts only ever drop (its run stamp unchanged) - the
// two signatures the flake log documents (partial last-writes loss on
// 2026-11-04 run 41885400454 attempt 1; wholesale-empty on attempt 2). A
// mutation, a gain, a changed run, or a second failure is a hard FAIL: the
// retry exists so the platform's asynchronous storage commit stops blocking
// release gates, never to forgive an app defect. Each attempt starts from a
// wiped localStorage so attempts are independent and self-relative.
const attemptE17 = async () => {
  await ev2(`(() => { try { const ks = []; for (let i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i)); for (const k of ks) if (k && k.startsWith('snowroute.5w.') && k !== LS.pre) localStorage.removeItem(k); } catch (e) {} return true; })()`); // wipe ONLY this route's state keys: a blanket localStorage.clear() also killed the preload record (LS.pre), which silently disabled migratePack for the rest of the run and failed E19/E20/E21 on run 41920672848 - the migration is gated on that record (app4 migratePack: no record = skip)
  await send('Page.reload', { ignoreCache: false }, PAGE_S);
  await sleep(1200);
  await loadRouteE2E();
  await ev2(`(() => { startClean(); markDone('Velmar', 'tap'); togglePiece('Astona', 0, 0); const t0 = Math.floor(Date.now() / 1000); trail = [[43.82, -79.56, t0], [43.8201, -79.56, t0 + 30], [43.8202, -79.56, t0 + 60]]; saveTrail(); return true; })()`);
  await ev2(`(() => { try { flushAux(true); } catch (e) {} return true; })()`); // quiesce the app's writers first (the flake-log prescription after E17's repeated kill-vs-commit races: settle BEFORE the snapshot, not after)
  await sleep(10000); // storage-commit settle BEFORE snapBefore (Beta 1.95 hardening; the snapshot is then read from committed storage and the kill follows immediately)
  const before = await snapState();
  const aOk = !!before.start && JSON.parse(before.sess).length >= 1 && JSON.parse(before.app).velmar === 3 && JSON.parse(before.app).astona === 1 && JSON.parse(before.app).done.includes('Velmar') && JSON.parse(before.app).trailN === 3;
  proc.kill('SIGKILL');
  await sleep(1500);
  for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(PROFILE + '/' + f, { force: true }); } catch (e) {} }
  await launchBrowser();
  const backOk = (await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000)) && (await poll(`!!navigator.serviceWorker.controller`, 30000));
  await loadRouteE2E();
  const after = await snapState();
  const diag = JSON.parse(await ev2(`(() => JSON.stringify({ lsStart: LS.start, mig: localStorage.getItem('snowroute.5w.v2.migrated'), slotStart: localStorage.getItem('snowroute.5w.v5.start'), legacyStart: localStorage.getItem('snowroute.v5.start'), slotSides: (localStorage.getItem('snowroute.5w.v5.sides') || '').length, legacySides: (localStorage.getItem('snowroute.v5.sides') || '').length }))()`));
  const keys = ['start', 'sess', 'sides', 'done', 'times', 'via', 'trail'];
  const diff = keys.filter(k => before[k] !== after[k]).map(k => k + '[' + (before[k] || '').length + '->' + (after[k] || '').length + ']').join(' ') + (before.app !== after.app ? ' appDIFF before=' + before.app + ' after=' + after.app : '');
  const pass = backOk && keys.every(k => before[k] === after[k]) && before.app === after.app;
  let appLoss = false;
  try { const b = JSON.parse(before.app), a = JSON.parse(after.app); appLoss = (a.run === b.run || a.run === 0) && a.velmar <= b.velmar && a.astona <= b.astona && a.trailN <= b.trailN && a.done.every(d => b.done.includes(d)) && a.sess.every(t => b.sess.includes(t)); } catch (e) {} // the run stamp either survives or is itself lost (0): a DIFFERENT nonzero stamp would be a mutation, never the race. First CI run of this retry (2026-11-04, run 41919355118) hit the wholesale-empty signature live and this predicate's original run-equality clause misjudged it - corrected same day
  const lossOnly = backOk && aOk && appLoss && keys.every(k => { const b = before[k], a = after[k]; return a === b || a === null || a === '' || (typeof b === 'string' && typeof a === 'string' && a.length < b.length && b.startsWith(a)); });
  return { before, after, diag, diff, aOk, pass, lossOnly };
};
const e17r1 = await attemptE17();
ok('E17a the clean state was persisted through the app save paths before the kill | sess ' + e17r1.before.sess + ' app ' + e17r1.before.app, e17r1.aOk);
if (e17r1.pass) {
  ok('E17 persisted app state survives process death byte-for-byte and reloads identically | back true', true);
} else if (e17r1.lossOnly) {
  const e17r2 = await attemptE17();
  ok('E17 persisted app state survives process death byte-for-byte and reloads identically | attempt 1 carried the kill-vs-commit race signature (monotone loss: ' + e17r1.diff + '), retried once per the Phase 1 N4 rule | attempt 2 ' + (e17r2.pass ? 'clean' : 'FAILED | DIFF ' + e17r2.diff + ' | DIAG ' + JSON.stringify(e17r2.diag)), e17r2.pass);
} else {
  ok('E17 persisted app state survives process death byte-for-byte and reloads identically | back ' + e17r1.pass + (e17r1.diff ? ' | DIFF ' + e17r1.diff : '') + ' | DIAG ' + JSON.stringify(e17r1.diag), false);
}
const e17b = JSON.parse(await ev2(`(() => { window.__lsSet = lsSet; lsSet = (k, v) => k === LS.sess ? false : window.__lsSet(k, v); startClean(); return JSON.stringify({ marker: Math.floor(runStart / 1000), run: runStart, dirty: sessDirty, stored: JSON.parse(lsGet(LS.sess) || '[]') }); })()`));
ok('E17b setup: the marker write failed pre-kill, retry armed, marker not persisted | marker ' + e17b.marker + ' dirty ' + e17b.dirty, e17b.dirty === true && !e17b.stored.includes(e17b.marker));
await sleep(10000); // commit settle for the run state the start DID save (the marker's 15 s retry stays stubbed and keeps failing, so it remains unpersisted)
proc.kill('SIGKILL');
await sleep(1500);
for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(PROFILE + '/' + f, { force: true }); } catch (e) {} }
await launchBrowser();
const backOk17b = (await poll(`typeof glOk !== 'undefined' && glOk === true`, 90000)) && (await poll(`!!navigator.serviceWorker.controller`, 30000));
await loadRouteE2E();
const e17bAfter = JSON.parse(await ev2(`(() => { const before = { run: runStart, sess: JSON.parse(lsGet(LS.sess) || '[]') }; startClean(); const after = { sess: JSON.parse(lsGet(LS.sess) || '[]'), marker: Math.floor(runStart / 1000), dirty: sessDirty }; return JSON.stringify({ before, after }); })()`));
ok('E17b after the kill: persisted run state intact, the never-persisted marker absent (expected loss), and a fresh start saves cleanly | ' + JSON.stringify(e17bAfter), backOk17b && e17bAfter.before.run === e17b.run && !e17bAfter.before.sess.includes(e17b.marker) && e17bAfter.after.sess.includes(e17bAfter.after.marker) && e17bAfter.after.dirty === false);
// ---- E19/E20 (Beta 1.95, deep audit SR-194-05/06): the one-time pack
// migration copies ONLY the deterministic preload manifest, verifies the
// destination before it may call itself done, and retries on a later
// attempt when a copy fails. 1.94 copied EVERY browsing-cache key (strays
// included) through a catch-all that set the completion flag
// unconditionally, so a partial copy was marked complete forever.
try {
  const sample3 = baseKeys.filter(u => u.includes('tiles.basemaps.cartocdn.com')).slice(0, 3).sort(); // tile URLs only: no spaces/encoding edge (the glyph URLs are stored %20-encoded) and no sprite ambiguity
  await ev2(`(async () => { const sample = ${JSON.stringify(baseKeys.filter(u => u.includes('tiles.basemaps.cartocdn.com')).slice(0, 3))}; const junk = ['https://tiles.basemaps.cartocdn.com/junk/e19-a', 'https://tiles.basemaps.cartocdn.com/junk/e19-b']; await caches.delete('snowroute-offline-v1'); const tc = await caches.open('snowroute-tiles-v1'); for (const u of sample.concat(junk)) await tc.put(u, new Response('x')); localStorage.removeItem('snowroute.v5.packmig'); return true; })()`);
  await send('Page.reload', { ignoreCache: false }, PAGE_S); await sleep(1200);
  await sleep(1500);
  await loadRouteE2E();
  await poll(`(async () => { const oc = await caches.open('snowroute-offline-v1'); const ks = (await oc.keys()).map(r => r.url); return ${JSON.stringify(sample3)}.every(u => ks.includes(u)); })()`, 30000);
  await poll(`localStorage.getItem('snowroute.v5.packmig') === packMigFingerprint(preloadUrlList())`, 30000); // Phase 1 (2026-11-04): the samples poll alone races the boot migration - it exits the moment the seeded tiles land, while the full pass is still copying and the flag (written LAST, after verification) is still unset; E19 then censused a half-migrated pack (n=3, flag null on run 41921688086; n=0 variant on 41920672848). Wait for the earned flag - the app's own completion signal - before censusing.
  const e19 = JSON.parse(await ev2(`(async () => { const oc = await caches.open('snowroute-offline-v1'); const ks = (await oc.keys()).map(r => r.url); const man = new Set(preloadUrlList().map(u => new URL(u).href)); const tc = await caches.open('snowroute-tiles-v1'); const tks = (await tc.keys()).map(r => r.url); const inTiles = preloadUrlList().filter(u => tks.includes(new URL(u).href)).length; const again = await migratePack(); return JSON.stringify({ n: ks.length, outside: ks.filter(k => !man.has(k)).length, junk: ks.filter(k => k.includes('/junk/')).length, flag: localStorage.getItem('snowroute.v5.packmig'), fp: packMigFingerprint(preloadUrlList()), DIAG_inTiles: inTiles, DIAG_tilesTotal: tks.length, DIAG_again: again }); })()`)); // TEMP DIAG (Phase 1 branch only - strip before merge)
  ok('E19 pack migration is bounded by the manifest: every pack entry is a manifest URL, seeded strays stay out, the seeded manifest tiles arrive, the flag follows verification (Beta 1.95, SR-194-05/06) | ' + JSON.stringify(e19), e19.outside === 0 && e19.junk === 0 && e19.n >= 3 && e19.flag === e19.fp);
} catch (e) { ok('E19 pack migration manifest-bounded + verified (Beta 1.95, SR-194-05/06) | threw ' + String(e).slice(0, 150), false); }
try {
  const hasFn = await ev2(`typeof migratePack === 'function'`);
  await ev2(`(async () => { const sample = ${JSON.stringify(baseKeys.filter(u => u.includes('tiles.basemaps.cartocdn.com')).slice(0, 3))}; await caches.delete('snowroute-offline-v1'); const tc = await caches.open('snowroute-tiles-v1'); for (const u of sample) { if (!(await tc.match(u))) await tc.put(u, new Response('x')); } localStorage.removeItem('snowroute.v5.packmig'); return true; })()`);
  await ev2(`(() => { const realOpen = CacheStorage.prototype.open.bind(caches); let n = 0; caches.open = async (name) => { const c = await realOpen(name); if (name !== 'snowroute-offline-v1') return c; return new Proxy(c, { get(t, p) { if (p === 'put') return async (rq, rs) => { n++; if (n === 2) throw new Error('injected pack write failure'); return t.put(rq, rs); }; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } }); }; window.__restoreOpen = () => { caches.open = realOpen; }; return true; })()`);
  const r1 = JSON.parse(await ev2(`(async () => { const r = await migratePack(); const oc = await caches.open('snowroute-offline-v1'); return JSON.stringify({ ok: !!(r && r.ok), n: (await oc.keys()).length, flag: localStorage.getItem('snowroute.v5.packmig') }); })()`));
  await ev2(`(() => { window.__restoreOpen(); return true; })()`);
  const r2 = JSON.parse(await ev2(`(async () => { const r = await migratePack(); const oc = await caches.open('snowroute-offline-v1'); return JSON.stringify({ ok: !!(r && r.ok), n: (await oc.keys()).length, flag: localStorage.getItem('snowroute.v5.packmig'), fp: packMigFingerprint(preloadUrlList()) }); })()`));
  ok('E20 a failed pack copy leaves the flag UNSET and a retry completes the migration, landing exactly the failed copies (Beta 1.95, SR-194-05) | r1 ' + JSON.stringify(r1) + ' r2 ' + JSON.stringify(r2), hasFn === true && r1.ok === false && r1.flag === null && r2.ok === true && r2.flag === r2.fp && r2.n === r1.n + 1);
} catch (e) { ok('E20 pack migration failure leaves flag unset, retry completes (Beta 1.95, SR-194-05) | threw ' + String(e).slice(0, 150), false); }

// E21 (Beta 1.96, audit-2 N-1): the download cleanup must delete a browsing
// copy ONLY when the pack copy is confirmed. 1.95 deleted every manifest URL
// from the browsing cache unconditionally - a failed pack write (quota) lost
// BOTH copies of a fetched file. Force one pack put to fail during a real
// re-download: the file must stay out of the pack, the count must say so,
// and its browsing copy must SURVIVE.
try {
  await loadRouteE2E();
  const target = JSON.parse(await ev2(`(async () => { const oc = await caches.open('snowroute-offline-v1'); const ks = (await oc.keys()).map(r => r.url); return JSON.stringify(ks.find(u => u.includes('tiles.basemaps.cartocdn.com')) || null); })()`));
  if (!target) throw new Error('no pack tile available to target');
  await ev2(`(async () => { const oc = await caches.open('snowroute-offline-v1'); const tc = await caches.open('snowroute-tiles-v1'); const hit = await oc.match(${JSON.stringify(target)}); if (hit) await tc.put(${JSON.stringify(target)}, hit); await oc.delete(${JSON.stringify(target)}); return true; })()`);
  await ev2(`(() => { window.__realOpen = caches.open.bind(caches); caches.open = async (name) => { const c = await window.__realOpen(name); if (name !== 'snowroute-offline-v1') return c; return new Proxy(c, { get(t, p) { if (p === 'put') return async (u, res) => { const url = typeof u === 'string' ? u : u.url; if (url === ${JSON.stringify(target)}) throw new Error('injected pack put failure'); return t.put(u, res); }; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } }); }; return true; })()`);
  await ev2(`(() => { document.getElementById('xPre').click(); return true; })()`);
  const statOk = await poll(`document.getElementById('xPreStat').textContent.includes('saved 896 of 897')`, 300000);
  const e21 = JSON.parse(await ev2(`(async () => { const oc = await caches.open('snowroute-offline-v1'); const tc = await caches.open('snowroute-tiles-v1'); return JSON.stringify({ inPack: !!(await oc.match(${JSON.stringify(target)})), inTiles: !!(await tc.match(${JSON.stringify(target)})), stat: document.getElementById('xPreStat').textContent }); })()`));
  await ev2(`(() => { caches.open = window.__realOpen; return true; })()`);
  ok('E21 a failed pack write keeps the browsing copy: cleanup deletes only confirmed pack entries (Beta 1.96, audit-2 N-1) | statOk ' + statOk + ' ' + JSON.stringify(e21), statOk === true && e21.inPack === false && e21.inTiles === true);
} catch (e) { ok('E21 download cleanup deletes only confirmed entries (Beta 1.96, N-1) | threw ' + String(e).slice(0, 150), false); }

// E22 (Beta 1.96, deep audit SR-195-03/07): with a healthy pack and the
// completion fingerprint stored, migratePack must take the fast path - a
// census, not another ~1,800-match sweep on every cold start. 1.95 never
// read its own flag and re-verified the whole pack at every boot.
try {
  const heal = JSON.parse(await ev2(`(async () => { const r = await migratePack(); return JSON.stringify({ ok: !!(r && r.ok) }); })()`)); // heal E21's missing file from its surviving browsing copy and re-earn the fingerprint
  await ev2(`(() => { window.__realOpen2 = caches.open.bind(caches); window.__matchN = 0; caches.open = async (name) => { const c = await window.__realOpen2(name); if (name !== 'snowroute-offline-v1') return c; return new Proxy(c, { get(t, p) { if (p === 'match') return async (...a) => { window.__matchN++; return t.match(...a); }; const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } }); }; return true; })()`);
  const e22 = JSON.parse(await ev2(`(async () => { const r = await migratePack(); return JSON.stringify({ ok: !!(r && r.ok), skipped: !!(r && r.skipped), matches: window.__matchN }); })()`));
  await ev2(`(() => { caches.open = window.__realOpen2; return true; })()`);
  ok('E22 a healthy migrated pack takes the fast path on the next migration call: skipped, zero cache matches (Beta 1.96, SR-195-03) | heal ' + JSON.stringify(heal) + ' ' + JSON.stringify(e22), heal.ok === true && e22.ok === true && e22.skipped === true && e22.matches === 0);
} catch (e) { ok('E22 pack migration fast path (Beta 1.96, SR-195-03) | threw ' + String(e).slice(0, 150), false); }

ok('E13 no page exceptions across the whole run', consoleLog.filter(c => String(c).startsWith('EXCEPTION')).length === 0);
const fails = R.checks.filter(c => !c[1]);
for (const c of R.checks) console.log((c[1] ? 'PASS ' : 'FAIL ') + c[0]);
console.log('e2e-offline:', R.checks.length - fails.length + '/' + R.checks.length);
proc.kill('SIGKILL'); process.exit(fails.length ? 1 : 0);
