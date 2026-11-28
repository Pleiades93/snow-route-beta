// Post-ship live walk: a cold-session visit to the live
// page after a ship (docs/LIVE-LOOP.md owns the procedure).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { ensureProxyBridge } from '../tests/browser/proxy-bridge.mjs';
import { launchCdp } from '../tests/browser/cdp-client.mjs';
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
  observed: { sha: null, label: null, browserSha: null, reads: [] },
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
    const bytes = Buffer.from(await res.arrayBuffer());
    const m = bytes.toString('utf8').match(/id="ver">([^<]+)/);
    return { sha: shaOf(bytes), label: m ? m[1].trim() : null };
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
// The browser rides the drives' own proxy bridge: it
// cannot authenticate to this VM's egress proxy itself.
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bridge = null, profile = null;
async function launch(proxyArg) {
  const doc = { requestId: null };
  const onEvent = msg => { if (msg.method === 'Network.responseReceived' && msg.params.type === 'Document') doc.requestId = msg.params.requestId; };
  let rig = null, lastErr = null;
  for (let attempt = 0; attempt < 3 && !rig; attempt++) {
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'live-walk-'));
    const args = ['--disable-gpu', '--hide-scrollbars', '--user-data-dir=' + profile, '--window-size=420,900'];
    if (proxyArg) args.push('--ignore-certificate-errors', '--proxy-server=' + proxyArg);
    else args.push('--no-proxy-server');
    try { rig = await launchCdp({ args, onEvent }); } catch (e) { lastErr = e; try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} profile = null; }
  }
  if (!rig) throw lastErr || new Error('chrome launch failed');
  rig.doc = doc;
  await rig.send('Page.enable', {}, rig.S);
  await rig.send('Runtime.enable', {}, rig.S);
  await rig.send('Network.enable', {}, rig.S);
  await rig.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true }, rig.S);
  return rig;
}
function cleanup() {
  try { walkRig && walkRig.close(); } catch {}
  try { profile && fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}

// ---------- the walk ----------
let surface = 'startup', step = 'launch', finished = false;
const errors = () => (walkRig ? walkRig.consoleLog : []).filter(x => x.type === 'EXCEPTION');
async function finding(expectedValue, observed) {
  const f = { surface, step, expected: expectedValue, observed, pageErrors: errors(), screenshot: null };
  report.findings.push(f); write();
  if (walkRig) { try { f.screenshot = path.join(out, `finding-${report.findings.length}.png`); await walkRig.shot(f.screenshot); } catch { f.screenshot = null; } }
  write();
}
const visible = id => `(() => { const e = document.getElementById(${JSON.stringify(id)}); if (!e) return false; const r = e.getBoundingClientRect(); `
  + `return e.checkVisibility({ checkOpacity: true }) && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`;
let walkRig = null;
async function checkErrors() { if (errors().length) { await finding('no uncaught page errors', errors()); throw new Error('page error'); } }
async function snowOk(menuId) {
  await walkRig.poll(`!!window.__snow && window.__snow.running()`, 15000, 100);
  // Rendering, not just running: canvas laid out,
  // menu transparent over it (drive228's trio + display).
  const sample = `(() => { const h = window.__snow; const cv = document.getElementById('snowCv'); if (!h || !cv) return { missing: true }; `
    + `let o = 1, n = cv; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); if (n === document.documentElement) break; n = n.parentElement; } `
    + `const cs = getComputedStyle(cv), r = cv.getBoundingClientRect(), menu = ${menuId ? `document.getElementById('${menuId}')` : 'null'}; `
    + `return { running: h.running(), frames: h.frames(), vis: cs.visibility, disp: cs.display, laidOut: r.width > 0 && r.height > 0, away: cv.classList.contains('away'), `
    + `op: Math.round(o * 1000) / 1000, menuBg: menu ? getComputedStyle(menu).backgroundImage : 'skip' }; })()`;
  const before = await walkRig.ev(sample);
  await sleep(600);
  const after = await walkRig.ev(sample);
  const base = before && after && !before.missing && before.running === true && after.running === true && after.frames > before.frames;
  const seen = base && before.vis === 'visible' && before.disp !== 'none' && before.laidOut === true && before.away === false && before.op >= 0.99;
  const good = seen && (before.menuBg === 'skip' || before.menuBg === 'none');
  if (!good) await finding('snow standing and rendering', { before, after });
  return good;
}
async function stop(name, paneId, extra) {
  surface = name; step = 'reach surface';
  await checkErrors();
  if (paneId) {
    const on = await walkRig.poll(`document.getElementById('${paneId}').classList.contains('on')`, 10000, 100);
    const vis = on && await walkRig.poll(visible(paneId), 10000, 100);
    if (!vis) { await finding('visible surface', { pane: paneId, on }); throw new Error('unreachable surface ' + paneId); }
  }
  if (!report.surfaces.includes(name)) report.surfaces.push(name);
  if (extra) await extra();
  step = 'snow advances';
  await snowOk(paneId ? 'routeMenu' : null);
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
  bridge = await ensureProxyBridge();
  walkRig = await launch(bridge && 'http://127.0.0.1:' + bridge.port);
  step = 'navigate';
  await walkRig.send('Page.navigate', { url: walkUrl }, walkRig.S);
  surface = 'splash'; step = 'splash renders';
  if (!await walkRig.poll(`!!document.getElementById('splash')`, 15000, 100)) { await finding('splash element at cold start', false); throw new Error('no splash'); }
  // The label does not establish byte identity: the
  // document Chromium loaded is hashed before walking.
  surface = 'live page'; step = 'document the browser loaded';
  let browserSha = null;
  for (let i = 0; i < 75 && !browserSha; i++) {
    const rid = walkRig.doc.requestId;
    if (rid) {
      const r = await walkRig.send('Network.getResponseBody', { requestId: rid }, walkRig.S);
      if (r.result) browserSha = shaOf(r.result.base64Encoded ? Buffer.from(r.result.body, 'base64') : Buffer.from(r.result.body, 'utf8'));
    }
    if (!browserSha) await sleep(200);
  }
  report.observed.browserSha = browserSha;
  if (browserSha !== expectedSha) { await finding(expectedSha, browserSha); throw new Error('browser document mismatch'); }
  // The splash stop asserts the artwork itself: the
  // brand layer rendered, before the menu cuts it.
  await stop('splash', null, async () => {
    step = 'splash content renders';
    const expr = `(() => { const el = document.getElementById('brandLayer'); if (!el) return { missing: true }; const cs = getComputedStyle(el), r = el.getBoundingClientRect(); `
      + `let o = 1, n = el; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity); if (n === document.documentElement) break; n = n.parentElement; } `
      + `return { vis: el.checkVisibility(), disp: cs.display, laidOut: r.width > 0 && r.height > 0, op: Math.round(o * 1000) / 1000, cut: el.classList.contains('cut') }; })()`;
    let s = null, rendered = false;
    for (let i = 0; i < 15 && !rendered; i++) { s = await walkRig.ev(expr); rendered = !!(s && !s.missing && s.vis === true && s.laidOut === true && s.op >= 0.99); if (!rendered) await sleep(200); }
    if (!rendered) { await finding('splash artwork rendered', s); throw new Error('splash content not rendered'); }
  });
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
