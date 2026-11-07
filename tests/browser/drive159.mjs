import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// drive159: Beta 1.130 - the cold-open city-list stutter and its fix.
// Andrew, on 1.129: cold open -> Create new route -> Select from list ->
// "a glitch or a stutter... like a loading screen before the city list
// shows up." The diagnosis (beta1/work/cold-stutter-1130/DIAGNOSIS.md,
// cold profiles + in-page timestamps + a stub-delayed catalogue) proved:
// packs/index.json was requested for the FIRST time inside
// crRenderCityChoices - at the Select-from-list tap itself - and the
// tap->rows wait equalled the fetch duration to within ~25 ms (1,540 ms
// at a 1,500 ms delay; 21 ms with the catalogue in hand). The fix starts
// the catalogue download during BOOT - Andrew's own suggestion (load it
// during the splash), adjudicated to the catalogue only and fired from
// the boot tail's deferred menu-arming slot (crWarmCityLibrary; the
// Create button, openDoors and openRouteMenu re-trigger it as no-ops on
// the cached promise, still at most one fetch per session; the city
// pack files stay on-demand) - and shows a "Loading cities..." row in
// the city rows' own routeRow styling while a fetch is genuinely in
// flight. Same rig as drive153 (own CDP session, Fetch interception at
// the network layer; packs/index.json is fulfilled with the repo's
// SHIPPED index under a controlled delay). What it proves:
//   A (boot pre-warm): from a COLD page, with NO tap at all, the
//      catalogue request starts during boot (the menu-arming slot);
//      once it has landed, the Create -> Select-from-list walk renders
//      the city rows immediately (< 2.5 s against a 6 s stub
//      delay - no fetch in flight at tap time) and the session's
//      catalogue request count stays exactly 1.
//   B (in-flight honesty): with the fetch still in flight when the
//      list pane opens, the pane shows the Loading cities row (a
//      .routeRow, not a bare note on an empty pane) and NO city rows
//      yet; when the download lands, the loading row is REPLACED by
//      the city rows.
//   C (failure): a 404 catalogue still degrades honestly - the
//      "isn't available right now - use Search manually" note, no
//      rows, no dead end (the 1.124 behaviour, preserved).
// Red side (pristine 1.129): A fails (no request exists until the list
// tap; the tap then waits out the 6 s delay), B fails (the in-flight
// state is an .rmNote, never a .routeRow; there is no loading row to
// be replaced), C passes on both (it guards a preserved behaviour).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEXFX = JSON.parse(fs.readFileSync(path.join(REPO, 'packs', 'index.json'), 'utf8'));
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

let indexMode = 'ok'; // 'ok' | 'fail'
let indexDelayMs = 0;
const wire = []; // { kind: 'packindex'|'packindexDone', t: epoch ms }

// ---- static server + CDP rig (drive153's pattern) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain', '.py': 'text/plain', '.yml': 'text/plain' };
const server = http.createServer((req, res) => {
  const p = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(REPO) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;
const PROFILE = '/tmp/d159profile-' + Date.now();
const proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server', '--remote-debugging-port=0', '--disable-features=LocalNetworkAccessChecks', '--user-data-dir=' + PROFILE, '--window-size=420,900', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
const wsUrl = await new Promise((res, rej) => { let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); }); setTimeout(() => rej(new Error('no devtools url')), 25000); });
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1; const pending = new Map(); const consoleLog = []; const sessions = new Set();
let PAGE_S = null;
function send(method, params = {}, sessionId) { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
async function fulfil(sessionId, p) {
  const url = p.request.url;
  const json = (obj, code) => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: code || 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64') }, sessionId);
  try {
    const pn = new URL(url).pathname;
    if (pn.endsWith('/packs/index.json')) {
      wire.push({ kind: 'packindex', t: Date.now() });
      if (indexMode === 'fail') { wire.push({ kind: 'packindexDone', t: Date.now() }); return await json('nf', 404); }
      if (indexDelayMs) await sleep(indexDelayMs);
      const done = json(INDEXFX);
      wire.push({ kind: 'packindexDone', t: Date.now() });
      return await done;
    }
    if (/\/packs\/[^/]+\.json$/.test(pn)) return await json('nf', 404);
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}
ws.addEventListener('message', async ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Target.attachedToTarget') {
    const sid = msg.params.sessionId;
    if (!sessions.has(sid)) { sessions.add(sid); await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sid); }
    return;
  }
  if (msg.method === 'Fetch.requestPaused') { fulfil(msg.sessionId, msg.params); return; }
  if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === PAGE_S) { const d = msg.params.exceptionDetails; consoleLog.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text)); }
});
await send('Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
PAGE_S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
await send('Page.enable', {}, PAGE_S);
await send('Runtime.enable', {}, PAGE_S);
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, PAGE_S);
async function evaluate(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, PAGE_S); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result ? r.result.result.value : undefined; }
const ev2 = async (code) => evaluate(code);
const poll = async (expr, ms, step) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { let v; try { v = await ev2(expr); } catch (e) { v = undefined; } if (v === true) return true; await sleep(step || 400); } return false; };
const pollWire = async (kind, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (wire.some(w => w.kind === kind)) return true; await sleep(150); } return wire.some(w => w.kind === kind); };
const bootPicker = async () => { // the cold-start picker, usable (drive153 phase E's entry)
  await poll(`!!window.__bootAt`, 30000);
  await poll(`document.getElementById('routeMenu').classList.contains('show')`, 15000);
  return await poll(`!!document.getElementById('rmCreate')`, 10000);
};
const rowsN = () => ev2(`document.querySelectorAll('#crCityList .routeRow:not(.crLoadingRow)').length`);
const rowsReady = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await rowsN().catch(() => 0)) === INDEXFX.cities.length) return Date.now() - t0; await sleep(100); } return null; }; // premise fix (2026-11-07, Andrew-approved, test-only): the expected row count derives from the shipped packs/index.json - the baked-in 5 expired when the catalogue grew to twelve

// ---- phase A: cold page - BOOT starts the fetch; the warmed walk is instant ----
indexDelayMs = 6000;
await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
await bootPicker();
const startedAtBoot = await pollWire('packindex', 4000); // NO tap has happened yet - the request must already exist
const reqA = wire.find(w => w.kind === 'packindex');
ok('A1 BOOT WARMTH: from a cold open, with no tap at all, the catalogue request starts during BOOT (the menu-arming slot - Andrew\'s splash-screen suggestion, catalogue only) instead of waiting for the Select-from-list tap that needs it | request seen: ' + startedAtBoot,
  startedAtBoot === true && !!reqA);
await pollWire('packindexDone', 12000); // the boot download lands behind the picker
await ev2(`document.getElementById('rmCreate').click()`);
const doorsA = await poll(`document.getElementById('rmCreatePane').classList.contains('on')`, 10000);
await ev2(`document.getElementById('crDoorList').click()`);
const rowsMsA = await rowsReady(2500);
const reqCountA = wire.filter(w => w.kind === 'packindex').length;
ok('A2 PRE-WARMED WALK: with the catalogue fetched during boot, Create -> Select from list renders the city rows immediately (' + (rowsMsA === null ? 'not within 2500 ms' : rowsMsA + ' ms') + ' against a 6000 ms stub delay - no fetch in flight at tap time) and the session still holds exactly ONE catalogue request (the gate/menu re-triggers are no-ops) | doors pane: ' + doorsA + ', requests: ' + reqCountA,
  doorsA === true && rowsMsA !== null && rowsMsA < 2500 && reqCountA === 1);

// ---- phase B: fresh page session - the pane's in-flight state is a ROW ----
// (the stub's behaviour is set BEFORE the reload: since Beta 1.130 the
// catalogue fetch fires during boot itself, so a mode flipped after the
// picker shows would arrive too late to govern that fetch)
indexDelayMs = 4000;
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootPicker();
wire.length = 0;
await ev2(`document.getElementById('rmCreate').click()`);
await ev2(`document.getElementById('crDoorList').click()`); // immediately: the warmed fetch (4 s) is still in flight
const loadRowSeen = await poll(`!!document.querySelector('#crCityList .crLoadingRow')`, 2500, 100);
const loadRowShape = await ev2(`(() => { const r = document.querySelector('#crCityList .crLoadingRow'); if (!r) return null; const n = r.querySelector('.routeName'); return { row: r.classList.contains('routeRow'), text: n ? n.textContent : '', cityRows: document.querySelectorAll('#crCityList .routeRow:not(.crLoadingRow)').length }; })()`).catch(() => null);
ok('B1 LOADING ROW: while the catalogue is genuinely in flight, the list pane shows a "Loading cities…" ROW in the city rows\' own routeRow styling (never a bare note on an unexplained empty pane), and no city rows pretend to be there yet | ' + JSON.stringify(loadRowShape),
  loadRowSeen === true && !!loadRowShape && loadRowShape.row === true && loadRowShape.text === 'Loading cities…' && loadRowShape.cityRows === 0);
const rowsMsB = await rowsReady(12000);
const loadRowGone = await ev2(`!document.querySelector('#crCityList .crLoadingRow')`).catch(() => false);
ok('B2 REPLACEMENT: when the download lands, the loading row is replaced by the city rows (it does not linger above or below them) | rows after ' + (rowsMsB === null ? 'never' : rowsMsB + ' ms'),
  loadRowSeen === true && rowsMsB !== null && loadRowGone === true);

// ---- phase C: catalogue failure still degrades honestly (1.124 behaviour) ----
indexMode = 'fail'; indexDelayMs = 0; // before the reload - the boot fetch must meet the failing stub (see phase B's note)
await send('Page.reload', { ignoreCache: false }, PAGE_S);
await bootPicker();
await ev2(`document.getElementById('rmCreate').click()`);
await ev2(`document.getElementById('crDoorList').click()`);
const failNote = await poll(`/isn.t available right now/.test(document.getElementById('crCityList').textContent) && /Search manually/.test(document.getElementById('crCityList').textContent)`, 10000, 200);
const rowsC = await rowsN().catch(() => -1);
ok('C1 HONEST FAILURE: a catalogue that fails to load still lands on the "isn\'t available right now - go back and use Search manually" note with no rows and no dead end', failNote === true && rowsC === 0);

R.exceptions = consoleLog.filter(l => l.indexOf('EXCEPTION') === 0);
console.log(JSON.stringify(R));
try { proc.kill('SIGKILL'); } catch (e) {}
server.close();
process.exit(0);
