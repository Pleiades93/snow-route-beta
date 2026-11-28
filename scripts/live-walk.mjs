// Post-ship live walk: a cold-session visit to the live
// page after a ship (docs/LIVE-LOOP.md owns the procedure).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const LIVE_URL = 'https://pleiades93.github.io/snow-route-beta/';
const positional = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--wait' || process.argv[i] === '--url') i++;
  else if (!process.argv[i].startsWith('--')) positional.push(process.argv[i]);
}
const [expectedLabel, expectedSha, outRoot] = positional;
const flagVal = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const waitSeconds = Number(flagVal('--wait', '300'));
const walkUrl = flagVal('--url', LIVE_URL);
if (!expectedLabel || !expectedSha || !outRoot || !/^[0-9a-f]{64}$/.test(expectedSha) || !(waitSeconds > 0)) {
  console.error('Usage: node scripts/live-walk.mjs "Beta 1.304" <sha256 of the live page> <out folder> [--wait 300] [--url <url>]');
  process.exit(2);
}
const stamp = new Date().toISOString();
const out = path.join(path.resolve(outRoot), `${stamp.slice(0, 10)}-${expectedLabel.replace(/[^\w.-]/g, '-')}-${stamp.slice(11, 19).replace(/:/g, '')}`);
fs.mkdirSync(out, { recursive: true });
const report = {
  expected: { label: expectedLabel, sha: expectedSha }, url: walkUrl,
  observed: { sha: null, label: null, reads: [] },
  surfaces: [], notes: [], findings: [], startedAt: stamp, finishedAt: null, ok: false
};
function write() {
  fs.writeFileSync(path.join(out, 'findings.json'), JSON.stringify(report, null, 2) + '\n');
  const clean = report.ok && !report.findings.length;
  const text = clean
    ? `walked ${report.surfaces.length} surfaces, no findings, live label read ${report.observed.label}, live sha ${report.observed.sha.slice(0, 12)}`
    : report.findings.map(f => `- ${f.surface}: ${f.step}\n  Expected: ${typeof f.expected === 'string' ? f.expected : JSON.stringify(f.expected)}`
      + `\n  Observed: ${JSON.stringify(f.observed)}\n  Screenshot: ${f.screenshot || 'unavailable'}`).join('\n\n') || 'walk did not complete';
  fs.writeFileSync(path.join(out, 'report.md'), text + '\n');
  fs.writeFileSync(path.join(out, 'coverage.md'), report.notes.join('\n') + '\n');
}
report.notes.push('Cold session: fresh profile, no saved route, clean or history. Only the first-run surfaces are walked; '
  + 'tab mode, the map, cleans and Settings need a picked route or saved state and stay with the drive battery (drive228 walks all 13 surfaces in the harness).');
report.notes.push('The name-your-route pane is reached only through the create flow against live services; the walk installs no fixtures and fabricates no draft, so that pane is not a stop.');
write();

// ---------- the wait: the served bytes must be the expected build ----------
const shaOf = text => createHash('sha256').update(text).digest('hex');
async function readLive() {
  try {
    const res = await fetch(walkUrl, { signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    const m = body.match(/id="ver">([^<]+)/);
    return { sha: shaOf(body), label: m ? m[1].trim() : null };
  } catch (e) { return { sha: null, label: null, error: String(e && e.message || e).slice(0, 120) }; }
}
const deadline = Date.now() + waitSeconds * 1000;
for (;;) {
  const read = await readLive();
  report.observed.reads.push({ at: new Date().toISOString(), ...read });
  report.observed.sha = read.sha; report.observed.label = read.label;
  if (read.sha === expectedSha && read.label === expectedLabel) break;
  if (Date.now() >= deadline) {
    report.findings.push({ surface: 'live page', step: 'wait for the expected build', expected: { label: expectedLabel, sha: expectedSha }, observed: report.observed.reads, pageErrors: [], screenshot: null });
    report.finishedAt = new Date().toISOString(); write();
    console.log(`live-walk: TIMEOUT waiting for ${expectedLabel} (${expectedSha.slice(0, 12)}) at ${walkUrl}; last read label=${read.label} sha=${read.sha && read.sha.slice(0, 12)}`);
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, 15000));
}

// ---------- transport ----------
function startRelay() {
  // The egress proxy TLS-intercepts with a CA Chromium
  // cannot read, so integrity anchors on served bytes.
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!raw) return null;
  const proxy = new URL(raw);
  if (!proxy.username) return { direct: proxy.protocol + '//' + proxy.host };
  const auth = 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64');
  const server = http.createServer();
  server.on('connect', (req, client, head) => {
    const up = net.connect(Number(proxy.port), proxy.hostname, () => {
      up.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${auth}\r\n\r\n`);
    });
    // The session credential stays in memory only: it is
    // never logged, printed or written to a file.
    let buf = Buffer.alloc(0);
    const onData = d => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      up.removeListener('data', onData);
      if (!/ 200/.test(buf.slice(0, buf.indexOf('\r\n')).toString())) { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); up.destroy(); return; }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = buf.slice(i + 4);
      if (rest.length) client.write(rest);
      if (head && head.length) up.write(head);
      up.pipe(client); client.pipe(up);
    };
    up.on('data', onData);
    up.on('error', () => client.destroy());
    client.on('error', () => up.destroy());
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ server, direct: 'http://127.0.0.1:' + server.address().port })));
}

const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let relay = null, proc = null, ws = null, profile = null;
const consoleLog = [];
async function launch(proxyArg) {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'live-walk-'));
  const flags = ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=420,900'];
  if (proxyArg) flags.push('--ignore-certificate-errors', '--proxy-server=' + proxyArg);
  flags.push('about:blank');
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    proc = spawn(CHROME, flags, { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const wsUrl = await new Promise((res, rej) => {
        let buf = ''; proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
        setTimeout(() => rej(new Error('no devtools line')), 25000);
      });
      ws = new WebSocket(wsUrl);
      await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); setTimeout(() => j(new Error('ws open timeout')), 15000); });
      lastErr = null; break;
    } catch (e) { lastErr = e; try { proc.kill('SIGKILL'); } catch {} proc = null; ws = null; }
  }
  if (lastErr) throw lastErr;
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; consoleLog.push({ type: 'EXCEPTION', text: String((d.exception && d.exception.description) || d.text).slice(0, 300) }); }
  });
  const send = (method, params = {}, sessionId) => { const id = nextId++; return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); };
  const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
  const S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, S);
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const poll = async (expr, ms, step) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 30000)) { let v; try { v = await ev(expr); } catch { v = undefined; } if (v === true) return true; await sleep(step || 200); }
    return false;
  };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }, S); fs.writeFileSync(name, Buffer.from(r.result.data, 'base64')); };
  return { send, S, ev, poll, shot };
}
function cleanup() {
  try { proc && proc.kill('SIGKILL'); } catch {}
  try { ws && ws.close(); } catch {}
  try { relay && relay.server && relay.server.close(); } catch {}
  try { profile && fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}

// ---------- the walk ----------
let surface = 'startup', step = 'launch', finished = false;
const errors = () => consoleLog.filter(x => x.type === 'EXCEPTION');
async function finding(expectedValue, observed) {
  const f = { surface, step, expected: expectedValue, observed, pageErrors: errors(), screenshot: null };
  report.findings.push(f); write();
  if (walkRig) { try { f.screenshot = path.join(out, `finding-${report.findings.length}.png`); await walkRig.shot(f.screenshot); } catch { f.screenshot = null; } }
  write();
}
const visible = id => `(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; const r = e.getBoundingClientRect(); `
  + `return e.checkVisibility() && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`;
let walkRig = null;
async function checkErrors() { if (errors().length) { await finding('no uncaught page errors', errors()); throw new Error('page error'); } }
async function snowOk() {
  await walkRig.poll(`!!window.__snow && window.__snow.running()`, 15000, 100);
  const sample = `(() => { const h = window.__snow; const cv = document.getElementById('snowCv'); if (!h || !cv) return { missing: true }; `
    + `let o = 1, n = cv; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); if (n === document.documentElement) break; n = n.parentElement; } `
    + `return { running: h.running(), frames: h.frames(), vis: getComputedStyle(cv).visibility, away: cv.classList.contains('away'), op: Math.round(o * 1000) / 1000 }; })()`;
  const before = await walkRig.ev(sample);
  await sleep(600);
  const after = await walkRig.ev(sample);
  const good = before && after && !before.missing && before.running === true && after.running === true && after.frames > before.frames && before.vis === 'visible' && before.away === false && before.op >= 0.99;
  if (!good) await finding('running snow with advancing frames', { before, after });
  return good;
}
async function stop(name, paneId, extra) {
  surface = name; step = 'reach surface';
  await checkErrors();
  if (paneId) {
    const on = await walkRig.poll(`document.getElementById('${paneId}').classList.contains('on')`, 10000, 100);
    const vis = on && await walkRig.ev(visible(paneId));
    if (!vis) { await finding('visible surface', { pane: paneId, on }); throw new Error('unreachable surface ' + paneId); }
  }
  if (!report.surfaces.includes(name)) report.surfaces.push(name);
  if (extra) await extra();
  step = 'snow advances';
  await snowOk();
  await checkErrors();
}
async function tap(id, paneId) {
  step = `tap ${id}`;
  if (!await walkRig.ev(visible(id))) { await finding('reachable control', id); throw new Error('unreachable control ' + id); }
  const p = await walkRig.ev(`(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await walkRig.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }, walkRig.S);
  await walkRig.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, walkRig.S);
  await sleep(400);
  await checkErrors();
  if (paneId && !await walkRig.poll(`document.getElementById('${paneId}').classList.contains('on')`, 10000, 100)) {
    surface = paneId; step = 'reach surface';
    await finding('visible surface', { pane: paneId, on: false });
    throw new Error('unreachable surface ' + paneId);
  }
}
const watchdog = setTimeout(async () => {
  report.findings.push({ surface, step, expected: 'finish within 180 seconds', observed: 'wall-clock budget exhausted', pageErrors: errors(), screenshot: null });
  report.finishedAt = new Date().toISOString(); write(); cleanup();
  console.log('live-walk: WATCHDOG - the walk did not finish within 180 seconds');
  process.exit(1);
}, 180000);
try {
  relay = await startRelay();
  walkRig = await launch(relay && relay.direct);
  step = 'navigate';
  await walkRig.send('Page.navigate', { url: walkUrl }, walkRig.S);
  surface = 'splash'; step = 'splash renders';
  if (!await walkRig.poll(`!!document.getElementById('splash')`, 15000, 100)) { await finding('splash element at cold start', false); throw new Error('no splash'); }
  await stop('splash', null);
  step = 'rendered version label';
  const rendered = await walkRig.ev(`document.getElementById('ver')?.textContent?.trim()`);
  if (rendered !== expectedLabel) { await finding(expectedLabel, rendered ?? null); throw new Error('rendered label mismatch'); }
  step = 'boot to the route menu';
  if (!await walkRig.poll(`document.getElementById('routeMenu').classList.contains('show')`, 30000, 100)) { await finding('route menu shown after boot', false); throw new Error('no route menu'); }
  await stop('rmMain', 'rmMain');
  await tap('rmChoose', 'rmListPane');
  await stop('rmListPane', 'rmListPane', async () => {
    step = 'first-run route list';
    const rows = await walkRig.ev(`document.querySelectorAll('#rmRoutes .routeRow').length`);
    if (!(rows >= 1)) await finding('at least one shipped route row', rows);
  });
  await tap('rmBack', 'rmMain');
  await tap('rmCreate', 'rmCreatePane');
  await stop('rmCreatePane', 'rmCreatePane');
  await tap('crDoorList', 'rmCityListPane');
  await stop('rmCityListPane', 'rmCityListPane', async () => {
    step = 'bundled city list renders';
    const rows = await walkRig.poll(`document.querySelectorAll('#crCityList .routeRow:not(.crLoadingRow)').length >= 1`, 15000, 200);
    if (!rows) await finding('at least one bundled city row', await walkRig.ev(`document.querySelectorAll('#crCityList .routeRow').length`));
  });
  await tap('rmCityListBack', 'rmCreatePane');
  await tap('crDoorManual', 'rmCityPane');
  await stop('rmCityPane', 'rmCityPane', async () => {
    step = 'manual search empty state';
    if (!await walkRig.ev(visible('crCityInput'))) await finding('visible city search input', false);
  });
  await tap('crCityBack', 'rmCreatePane');
  await tap('rmBack2', 'rmMain');
  try { await walkRig.shot(path.join(out, 'final.png')); } catch {}
  finished = true;
} catch (e) {
  if (!report.findings.length) await finding('walk completes', String(e && e.message || e));
} finally {
  clearTimeout(watchdog);
  report.ok = finished && !report.findings.length;
  report.finishedAt = new Date().toISOString();
  write(); cleanup();
}
console.log(report.ok
  ? `live-walk: OK - walked ${report.surfaces.length} surfaces, live label ${report.observed.label}, sha ${report.observed.sha.slice(0, 12)}; outputs in ${out}`
  : `live-walk: FINDINGS (${report.findings.length}) - see ${path.join(out, 'report.md')}`);
process.exitCode = report.ok ? 0 : 1;
