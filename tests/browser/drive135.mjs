// Ported from the maintainer's local drive battery (same filename); the
// test body is unchanged - only harness plumbing differs: CHROME_BIN env
// override for the browser path, repo-relative source path, default page.
// Runner: tests/browser/run.mjs. See docs/TESTING.md.
// v6 driver: serve the v6 folder locally, load in headless Chromium, and fulfill all
// remote map requests (jsDelivr / OpenFreeMap / Esri) through Node fetch (env proxy),
// so the page runs its REAL production pipeline. sw.js is 404'd to keep the run hermetic.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const DIR = new URL('../../src/', import.meta.url).pathname;
const PAGE = process.argv[2] || 'tracker-source.html';
const PORT = 8949;
const outPrefix = process.argv[2] || '/tmp/v6';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// (no local HTTP server: Chromium's Local Network Access checks block 127.0.0.1 navigations
//  from a fresh target, so the page is loaded via file:// like the earlier harnesses;
//  remote map requests are still fulfilled through Node fetch below.)
const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server',
  '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=/tmp/v6profile-' + Date.now(),
  '--window-size=420,900', 'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });

const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('no devtools url: ' + buf.slice(0, 500))), 25000);
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1;
const pending = new Map();
const consoleLog = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method === 'Runtime.consoleAPICalled') {
    consoleLog.push({ type: msg.params.type, text: (msg.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ') });
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleLog.push({ type: 'EXCEPTION', text: (d.exception && d.exception.description) || d.text });
  } else if (msg.method === 'Fetch.requestPaused') {
    handlePaused(msg.params);
  }
});
function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = sessionId;

async function handlePaused(p) {
  const url = p.request.url;
  try {
    if (url.endsWith('/sw.js')) {
      await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 404, body: '' }, S);
      return;
    }
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    await send('Fetch.fulfillRequest', {
      requestId: p.requestId, responseCode: r.status,
      responseHeaders: [{ name: 'Content-Type', value: ct }, { name: 'Access-Control-Allow-Origin', value: '*' }],
      body: buf.toString('base64')
    }, S);
  } catch (e) {
    await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, S);
  }
}
await send('Fetch.enable', { patterns: [
  { urlPattern: '*jsdelivr*', requestStage: 'Request' },
  { urlPattern: '*openfreemap*', requestStage: 'Request' },
  { urlPattern: '*arcgisonline*', requestStage: 'Request' },
  { urlPattern: '*unpkg*', requestStage: 'Request' },
  { urlPattern: '*cartocdn*', requestStage: 'Request' },
  { urlPattern: '*github.io*', requestStage: 'Request' }, // drive133 only: the Protomaps glyphs/sprites host - without it the local rig (no direct internet) never finishes loading the style, so the GPS sources never appear and the dot/trail assertions cannot run locally; CI fulfils it the same way
  { urlPattern: '*sw.js', requestStage: 'Request' }
] }, S);
await send('Page.enable', {}, S);
await send('Runtime.enable', {}, S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await send('Page.navigate', { url: 'file://' + DIR + '/' + PAGE }, S);

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
  if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 400) };
  return r.result && r.result.result ? r.result.result.value : undefined;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' }, S);
  fs.writeFileSync(name, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
}



// drive135: Beta 1.54 viewport/keyboard hardening (Andrew's deep-dive, 2026-11-01).
// The app now keeps a SETTLED size (fullH) and trusts it over a stuck short report
// in a home-screen install; while typing, the menus ride above the keyboard
// (offsets follow the live report, as they always have - 1.54's pin broke this
// and 1.55 reverted it); and the typing freeze releases only
// after the reported height SETTLES, not the instant a field blurs. The rig
// simulates the keyboard by resizing the emulated screen mid-session (a real
// visualViewport change) and forces display-mode: standalone via emulated media.
// (The screen.height anchor itself cannot be isolated in the rig - emulated
// metrics move screen and viewport together; the phone is its judge. What is
// asserted here is the user-visible machinery: pin, settle-hold, trust, release.)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const ev = async (code) => evaluate(code);
await sleep(3000);
const poll120 = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev(expr); if (v === true) return true; await sleep(300); } return false; };
ok('V0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 820, deviceScaleFactor: 2, mobile: true }, S);
await sleep(400);
ok('V5 (tab mode first, no shim): a short live report rules as-is (820px)', await ev(`document.documentElement.style.getPropertyValue('--vvh')`) === '820px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await sleep(300);
// The headless shell cannot emulate display-mode, so the rig shims the media
// query itself before a reload - the app's own detection (matchMedia) and every
// code path after it run for real.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.indexOf('display-mode') >= 0 ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); })();` }, S);
await ev(`location.reload()`);
await sleep(2500);
ok('V0b app reboots under the home-screen shim', await poll120(`typeof glOk !== 'undefined' && glOk === true`));
await ev(`syncViewport()`);
ok('V1 settled size learned at boot (900) | ' + await ev(`fullH`), await ev(`fullH`) === 900);
await ev(`$('streetsBtn').click()`); await sleep(500);
await ev(`(() => { const r = [...document.querySelectorAll('.srow')][names.indexOf('Velmar')]; r.querySelector('.nwrap').click(); return true; })()`); await sleep(400);
await ev(`document.querySelector('.noteEd textarea').focus()`);
await sleep(200);
ok('V2a typing state on (kb class)', await ev(`document.body.classList.contains('kb')`));
ok('V2b bottom offset at rest before the keyboard moves (0px) | ' + await ev(`document.documentElement.style.getPropertyValue('--vvb')`), await ev(`document.documentElement.style.getPropertyValue('--vvb')`) === '0px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S);
await sleep(450);
const pin = JSON.parse(await ev(`JSON.stringify({ vvb: document.documentElement.style.getPropertyValue('--vvb'), vvh: document.documentElement.style.getPropertyValue('--vvh'), dur: getComputedStyle($('sheet')).transitionDuration, sb: $('sheet').getBoundingClientRect().bottom, ih: window.innerHeight })`));
ok('V2c keyboard up: the layout variables stay FROZEN at their pre-keyboard values (900px / 0px), the sheet does not resize or re-anchor, and no transition runs | ' + JSON.stringify(pin), pin.vvh === '900px' && pin.vvb === '0px' && pin.dur === '0s' && Math.abs(pin.sb - pin.ih) <= 1); // Beta 1.61: the keyboard overlays the frozen layout (Andrew's direction). 1.55's live-tracking chased the keyboard's animation ticks and the note menus flickered; the freeze replaces it, and field visibility is handled inside the menu (ensureFieldVisible), not by layout. The rig cannot split window height from visible height the way iOS does, so the sheet-bottom assertion is against the rig's own stage bottom.
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 540, deviceScaleFactor: 2, mobile: true }, S);
await ev(`syncViewport(); syncViewport();`);
await sleep(350);
const frz = JSON.parse(await ev(`JSON.stringify({ vvb: document.documentElement.style.getPropertyValue('--vvb'), vvh: document.documentElement.style.getPropertyValue('--vvh') })`));
ok('F1 the freeze holds against a stream of viewport ticks mid-typing | ' + JSON.stringify(frz), frz.vvh === '900px' && frz.vvb === '0px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S);
await ev(`document.querySelector('.noteEd textarea').blur()`);
await sleep(120);
ok('V3a freeze HOLDS just after blur while the height is still short (the 1.31 instant release is gone)', await ev(`document.body.classList.contains('kb')`));
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 750, deviceScaleFactor: 2, mobile: true }, S);
await sleep(180);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
ok('V3b once the height is home, the freeze releases and the size is the settled one', await poll120(`!document.body.classList.contains('kb') && document.documentElement.style.getPropertyValue('--vvh') === '900px'`, 2500));
ok('V3c bottom offset still 0px after the whole cycle', await ev(`document.documentElement.style.getPropertyValue('--vvb')`) === '0px');
// W (Beta 1.56): keyboard ownership - with the keyboard UP (height unsettled), a rebuild that destroys the editor must NOT unfreeze the sheet (the pre-1.56 list code removed the class itself, instantly); the single owner holds it, then releases through the settle path once the height is home
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S); await sleep(200);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); if (ta) ta.focus(); return true; })()`); await sleep(250);
const wBefore = await ev(`document.body.classList.contains('kb')`);
await ev(`(() => { noteOpenFor = null; renderStreets(); return true; })()`);
await sleep(120);
const wHold = await ev(`document.body.classList.contains('kb')`);
ok('W1 editor destroyed by a rebuild mid-typing: the freeze HOLDS while the height is unsettled (owner decides, not the render) | before ' + wBefore + ' hold ' + wHold, wBefore === true && wHold === true);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
let wRel = false; for (let i = 0; i < 20 && !wRel; i++) { await sleep(150); wRel = await ev(`!document.body.classList.contains('kb')`); }
ok('W2 once the height is home, the owner releases the freeze (no stuck keyboard state)', wRel === true);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 820, deviceScaleFactor: 2, mobile: true }, S);
await sleep(400);
const stuck = JSON.parse(await ev(`JSON.stringify({ vvh: document.documentElement.style.getPropertyValue('--vvh'), vvb: document.documentElement.style.getPropertyValue('--vvb') })`));
ok('V4 stuck-short report (820, no keyboard): the live report rules as-is (820px) - the 1.54 trust override is RETIRED (Beta 1.62); the full-stage guarantee is the document-height floor (1.60), which this rig cannot emulate and drive139 pins | ' + JSON.stringify(stuck), stuck.vvh === '820px' && stuck.vvb === '0px');
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
await sleep(300);
// Beta 1.69 (audit N02): a DELAYED keyboard - the viewport does not move for the
// first ~350 ms after focus (iOS can report the full height before the keyboard
// starts rising). The 1.61 sampler read two unchanged heights inside that window,
// declared the keyboard settled and ran its one visibility check against the
// no-keyboard geometry. Now the first check must wait for a real height drop.
await ev(`(() => { if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(500);
await ev(`(() => { const r = [...document.querySelectorAll('.srow')][names.indexOf('Velmar')]; r.querySelector('.nwrap').click(); return true; })()`); await sleep(400);
const hasEd = await ev(`!!document.querySelector('.noteEd textarea')`);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); if (ta) ta.blur(); return true; })()`); await sleep(700);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S); await sleep(400);
await ev(`(() => { window.__efv = []; const orig = ensureFieldVisible; ensureFieldVisible = () => { window.__efv.push({ t: Date.now(), h: window.visualViewport.height }); orig(); }; return true; })()`);
await ev(`document.querySelector('.noteEd textarea').focus()`);
const kFocused = await ev(`document.activeElement && document.activeElement.tagName`);
const kT0 = Date.now();
await sleep(350);
const efvEarly = JSON.parse(await ev(`JSON.stringify(window.__efv)`));
ok('K1 delayed keyboard: NO visibility conclusion inside the pre-keyboard window (350 ms, height unmoved) | editor staged ' + hasEd + ' focused ' + kFocused + ' calls ' + JSON.stringify(efvEarly), hasEd === true && kFocused === 'TEXTAREA' && efvEarly.length === 0);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 560, deviceScaleFactor: 2, mobile: true }, S);
let efvLate = [];
for (let i = 0; i < 12 && !efvLate.length; i++) { await sleep(200); efvLate = JSON.parse(await ev(`JSON.stringify(window.__efv)`)); }
ok('K2 when the keyboard finally arrives, the visibility check runs against the TRUE keyboard height (560) | calls ' + JSON.stringify(efvLate), efvLate.length >= 1 && Math.abs(efvLate[0].h - 560) <= 2);
// Beta 1.70 (audit A03): a DELAYED dismissal - after blur the height sits at the
// short value for a while before the keyboard starts retracting. The closing
// sampler must not release the freeze inside that window (its opening twin, N02,
// got the same discipline in 1.69).
await ev(`document.querySelector('.noteEd textarea').blur()`);
await sleep(350);
ok('K02 delayed dismissal: the freeze HOLDS while the height has not begun to rise', await ev(`document.body.classList.contains('kb')`));
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
ok('K02b once the height is home the freeze releases', await poll120(`!document.body.classList.contains('kb')`, 4000));
// Beta 1.70 (audit A02): a modal card, two-stage keyboard growth. The card is
// shifted up at the first height; when the keyboard grows further, the second
// correction must be computed from the UNSHIFTED card - the old math measured
// the shifted card and under-shifted, dropping the field back under the keyboard.
await ev(`(() => { const d = document.createElement('div'); d.className = 'modal'; d.id = 'kModal'; d.innerHTML = '<div class="card" style="margin-top:560px"><div>Note</div><textarea id="kTa" rows="3"></textarea></div>'; document.body.appendChild(d); return true; })()`);
await ev(`document.getElementById('kTa').focus()`); await sleep(300);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 580, deviceScaleFactor: 2, mobile: true }, S); await sleep(800);
const kA = JSON.parse(await ev(`(() => { const r = document.getElementById('kTa').getBoundingClientRect(); return JSON.stringify({ b: r.bottom, floor: window.visualViewport.height - 8 }); })()`));
ok('K01a first keyboard height: the modal field is lifted above the keyboard | bottom ' + Math.round(kA.b) + ' floor ' + kA.floor, kA.b <= kA.floor + 2);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 480, deviceScaleFactor: 2, mobile: true }, S); await sleep(900);
const kB = JSON.parse(await ev(`(() => { const r = document.getElementById('kTa').getBoundingClientRect(); return JSON.stringify({ b: r.bottom, floor: window.visualViewport.height - 8 }); })()`));
ok('K01b the keyboard GROWS: the field stays above it (no under-shift from measuring the shifted card) | bottom ' + Math.round(kB.b) + ' floor ' + kB.floor, kB.b <= kB.floor + 2);
await ev(`(() => { const m = document.getElementById('kModal'); if (m) m.remove(); return true; })()`);
await sleep(400);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S); await sleep(300);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
console.log(JSON.stringify(R, null, 1));
proc.kill('SIGKILL'); process.exit(0);
