// Cold-start measurement: throttled and control boots of
// the assembled app over local HTTP, observed from outside
// (docs/COLD-START-BASELINE.md owns the protocol).
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { ensureProxyBridge } from './proxy-bridge.mjs';
import { launchCdp } from './cdp-client.mjs';

const pickerBudgetMs = null; // Fill from the measured baseline after Andrew accepts the budget.
const slow3G = { offline: false, latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 };
const profile = process.argv.includes('--profile');
const baseline = !profile && process.argv.includes('--baseline');
const results = { networkProfile: { name: 'slow-3g', ...slow3G }, cpuRate: 4, budgetMs: pickerBudgetMs, checks: [], exceptions: [], runs: [] };
const check = (name, passed) => results.checks.push([name, passed === true]);

const files = new Map();
for (const [path, type] of [
  ['src/sw.js', 'text/javascript'],
  ['manifest.json', 'application/json'],
  ['packs/index.json', 'application/json'],
  ['favicon.svg', 'image/svg+xml'],
  ...['icon-16.png', 'icon-32.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'].map(path => [path, 'image/png'])
]) {
  const body = readFileSync(new URL('../../' + path, import.meta.url));
  files.set('/' + path.replace(/^src\//, ''), { body, type });
}
let shell;
try {
  shell = gzipSync(readFileSync(new URL('../../src/tracker-source.html', import.meta.url)));
} catch {
  console.error('coldstart: src/tracker-source.html missing - run python3 scripts/assemble.py first');
  process.exit(2);
}
const index = { body: shell, type: 'text/html; charset=utf-8', encoding: 'gzip' };
files.set('/', index);
files.set('/index.html', index);
const server = createServer((req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!file) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Length', file.body.length);
  if (file.encoding) res.setHeader('Content-Encoding', file.encoding);
  res.end(file.body);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = 'http://127.0.0.1:' + server.address().port + '/';

// Start at the app-owned reveal and timestamp the frame after its paint.
function observePicker() {
  document.addEventListener('DOMContentLoaded', () => {
    const menu = document.getElementById('routeMenu');
    const observer = new MutationObserver(onReveal);
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
    onReveal();
    const mapPoll = setInterval(() => {
      try {
        if (glOk && tilesOk > 0) { window.__mapReadyAt = performance.now(); clearInterval(mapPoll); }
      } catch {}
    }, 100);
    setTimeout(() => clearInterval(mapPoll), 120000);

    function onReveal() {
      if (!menu.matches('.boot.show')) return;
      observer.disconnect();
      const pane = menu.querySelector('#rmMain.on');
      const shownAt = performance.now();
      const mapReadyAtShow = glOk && tilesOk > 0;
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      void (async () => {
        await frame();
        await Promise.all([...menu.getAnimations(), ...pane.getAnimations()].map(animation => animation.finished));
        await frame();
        await frame();
        const readyAt = performance.now();
        const button = pane.querySelector('#rmChoose');
        const rect = button.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        if (getComputedStyle(menu).opacity === '1' && getComputedStyle(pane).opacity === '1' &&
            !button.disabled && button.contains(document.elementFromPoint(x, y))) {
          const paint = Object.fromEntries(performance.getEntriesByType('paint').map(e => [e.name, e.startTime]));
          window.__pickerAt = {
            readyAt, shownAt, mapReadyAtShow, x, y, timeOrigin: performance.timeOrigin,
            tailAt: window.__tailAt - performance.timeOrigin,
            mapAt: window.__bootAt - performance.timeOrigin,
            mapReadyAt: window.__mapReadyAt ?? null,
            firstPaint: paint['first-paint'] ?? null,
            firstContentfulPaint: paint['first-contentful-paint'] ?? null
          };
        }
      })();
    }
  }, { once: true });
}

async function launch(proxyArg) {
  let rig = null, lastErr = null;
  for (let attempt = 0; attempt < 3 && !rig; attempt++) {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coldstart-'));
    const args = ['--disable-gpu', '--hide-scrollbars', '--user-data-dir=' + profileDir, '--window-size=420,900'];
    if (proxyArg) args.push('--ignore-certificate-errors', '--proxy-server=' + proxyArg);
    else args.push('--no-proxy-server');
    const network = [], exceptions = [];
    try {
      rig = await launchCdp({
        args,
        onEvent(msg) {
          if (!msg.method) return;
          if (msg.method.startsWith('Network.')) network.push({ method: msg.method, params: msg.params });
          if (msg.method === 'Runtime.exceptionThrown' || (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')) {
            exceptions.push({ method: msg.method, timestamp: msg.params.timestamp, text: msg.params.exceptionDetails?.exception?.description ??
              msg.params.exceptionDetails?.text ??
              msg.params.args.map(arg => arg.value ?? arg.description ?? arg.type).join(' ') });
          }
        }
      });
      rig.profileDir = profileDir;
      rig.network = network;
      rig.exceptions = exceptions;
    } catch (e) { lastErr = e; try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {} }
  }
  if (!rig) throw lastErr || new Error('chrome launch failed');
  return rig;
}

async function measure(throttled, run, bridge) {
  const name = run.leg + ' #' + run.number;
  let rig;
  let command;
  let cutoff = Infinity;
  try {
    rig = await launch(bridge && 'http://127.0.0.1:' + bridge.port);
    command = async (method, params) => {
      const response = await rig.send(method, params, rig.S);
      if (response.error) throw new Error(method + ': ' + response.error.message);
      return response.result;
    };
    await command('Network.enable');
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
    await command('Emulation.setTouchEmulationEnabled', { enabled: true });
    if (throttled) {
      await command('Network.emulateNetworkConditions', slow3G);
      await command('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await command('Page.addScriptToEvaluateOnNewDocument', { source: '(' + observePicker.toString() + ')()' });
    if (profile) {
      await command('Profiler.enable');
      await command('Profiler.start');
    }
    await command('Page.navigate', { url });

    if (!await rig.poll('!!window.__pickerAt', 90000)) throw new Error('picker never reached settled paint and hit-test readiness');
    const ready = await rig.ev('window.__pickerAt');
    cutoff = ready.timeOrigin + ready.readyAt;
    run.navigationToPickerMs = ready.readyAt;
    run.mapBootToPickerMs = ready.readyAt - ready.mapAt;
    run.phasesMs = {
      navigationToBootTail: ready.tailAt,
      introToMapBoot: ready.mapAt - ready.tailAt,
      mapBootToReveal: ready.shownAt - ready.mapAt,
      revealToSettledPaint: ready.readyAt - ready.shownAt
    };
    run.splitsMs = {
      firstPaint: ready.firstPaint,
      firstContentfulPaint: ready.firstContentfulPaint,
      bootTail: ready.tailAt,
      mapBoot: ready.mapAt,
      mapReady: ready.mapReadyAt,
      reveal: ready.shownAt
    };
    run.mapReadyAtReveal = ready.mapReadyAtShow;
    run.revealAtMs = ready.shownAt;
    run.navigation = await rig.ev(`(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return { responseStart: nav.responseStart, responseEnd: nav.responseEnd,
        encodedBodySize: nav.encodedBodySize, transferSize: nav.transferSize,
        workerStart: nav.workerStart };
    })()`);
    run.splitsMs.responseStart = run.navigation.responseStart;
    run.splitsMs.responseEnd = run.navigation.responseEnd;
    if (profile) {
      const { profile: capture } = await command('Profiler.stop');
      run.hotV8Frames = capture.nodes.filter(node => node.hitCount > 0)
        .sort((a, b) => b.hitCount - a.hitCount).slice(0, 10)
        .map(({ callFrame, hitCount }) => ({ ...callFrame, hitCount }));
    }

    const { x, y } = ready;
    if (await rig.ev("document.querySelector('#rmListPane.on') !== null")) {
      throw new Error('route list opened before the touch');
    }
    await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    run.tapOpenedRouteList = await rig.poll(
      "document.querySelector('#rmListPane.on #rmRoutes .routeRow') !== null", 5000);
  } catch (error) {
    run.error = String(error);
  } finally {
    if (!rig) {
      run.requests = []; run.requestCount = 0; run.encodedBytes = 0;
      run.failedRequests = 0; run.exceptions = 0; run.consoleErrors = 0;
      check(name + ' transferred cold shell and MapLibre through Chromium', false);
      check(name + ' reached picker after map boot and a real touch opened the populated route list', false);
      check(name + ' boot completed without errors', false);
      run.valid = false;
    }
    if (rig) {
      const network = rig.network, exceptions = rig.exceptions;
      rig.close();
      try { fs.rmSync(rig.profileDir, { recursive: true, force: true }); } catch {}
      const requests = new Map();
      const nav = network.find(({ method, params }) =>
        method === 'Network.requestWillBeSent' && params.type === 'Document' && params.request.url === url)?.params;
      if (nav) {
        const toWall = timestamp => (nav.wallTime + timestamp - nav.timestamp) * 1000;
        for (const { method, params } of network) {
          if (!params.timestamp || toWall(params.timestamp) > cutoff) continue;
          const id = params.requestId;
          if (method === 'Network.requestWillBeSent') {
            requests.set(id, { url: params.request.url, type: params.type, startMs: (params.timestamp - nav.timestamp) * 1000, bytes: 0 });
          }
          const request = requests.get(id);
          if (!request) continue;
          if (method === 'Network.responseReceived') {
            request.status = params.response.status;
            request.cached = Boolean(params.response.fromDiskCache || params.response.fromServiceWorker);
          }
          if (method === 'Network.dataReceived') request.bytes += params.encodedDataLength;
          if (method === 'Network.loadingFinished') {
            request.bytes = Math.max(request.bytes, params.encodedDataLength);
            request.endMs = (params.timestamp - nav.timestamp) * 1000;
          }
          if (method === 'Network.loadingFailed') request.failure = params.errorText;
        }
      }
      run.requests = [...requests.values()];
      run.requestCount = run.requests.length;
      run.encodedBytes = run.requests.reduce((total, request) => total + request.bytes, 0);
      // The boot update probe aborts itself at 1.5 s by
      // design (app5's controller); its abort is not a failure.
      const probeAborted = request => request.url.includes('updprobe=1') && request.failure === 'net::ERR_ABORTED';
      run.updateProbeAborted = run.requests.some(probeAborted);
      run.failedRequests = run.requests.filter(request => !probeAborted(request) && (request.failure || request.status >= 400)).length;
      const bootErrors = exceptions.filter(error => error.timestamp <= cutoff);
      run.exceptions = bootErrors.filter(error => error.method === 'Runtime.exceptionThrown').length;
      run.consoleErrors = bootErrors.length - run.exceptions;
      results.exceptions.push(...bootErrors.map(error => name + ': ' + error.text));

      const n = run.navigation;
      const freshShell = Boolean(n && n.workerStart === 0 && n.transferSize > 0 && n.encodedBodySize === shell.length);
      const library = run.requests.filter(request =>
        request.url.startsWith('https://cdn.jsdelivr.net/npm/maplibre-gl@') &&
        request.status === 200 && !request.cached && request.bytes > 0 && request.endMs !== undefined);
      const coldLibrary = ['Script', 'Stylesheet'].every(type => library.some(request => request.type === type));
      const throttledShell = !throttled || (freshShell && n.responseEnd >= shell.length / slow3G.downloadThroughput * 1000);
      if (n) {
        run.limiterEvidence = {
          longestPhase: Object.entries(run.phasesMs).sort((a, b) => b[1] - a[1])[0][0],
          shellResponseEndMs: n.responseEnd,
          libraryResponseEndMs: coldLibrary ? Math.max(...library.map(request => request.endMs)) : null,
          tileResponsesBeforeReveal: run.requests.filter(request => request.url.includes('.mvt') &&
            request.endMs <= run.revealAtMs).length,
          revealGate: run.mapReadyAtReveal ? 'map ready by reveal' : 'reveal without map readiness'
        };
      }
      const transferred = freshShell && coldLibrary && throttledShell;
      const interacted = run.mapBootToPickerMs > 0 && run.tapOpenedRouteList === true;
      const healthy = !run.error && !run.failedRequests && !bootErrors.length;
      check(name + ' transferred cold shell and MapLibre through Chromium', transferred);
      check(name + ' reached picker after map boot and a real touch opened the populated route list', interacted);
      check(name + ' boot completed without errors', healthy);
      run.valid = transferred && interacted && healthy;
      if (!baseline && !profile && pickerBudgetMs !== null) {
        check(name + ' met accepted navigation-to-picker budget (observed ' + run.navigationToPickerMs + ' ms)',
          run.valid && run.navigationToPickerMs <= pickerBudgetMs);
      }
    }
  }
}

try {
  const bridge = await ensureProxyBridge();
  for (let number = 1; number <= (baseline ? 5 : 1); number++) {
    for (const leg of baseline ? ['slow-3g-cpu4', 'control'] : ['slow-3g-cpu4']) {
      const run = { leg, number };
      results.runs.push(run);
      await measure(leg !== 'control', run, bridge);
    }
  }
  if (baseline) {
    results.verdict = 'inconclusive';
    results.verdictReason = 'Review both ranges and establish the limiter from the request timeline and a separate diagnostic capture.';
    const statKeys = ['navigationToPickerMs', 'mapBootToPickerMs',
      'splitsMs.responseEnd', 'splitsMs.firstContentfulPaint', 'splitsMs.bootTail',
      'splitsMs.mapBoot', 'splitsMs.mapReady', 'splitsMs.reveal'];
    const read = (run, key) => key.split('.').reduce((o, part) => o?.[part], run);
    results.baseline = ['slow-3g-cpu4', 'control'].map(leg => {
      const runs = results.runs.filter(run => run.leg === leg);
      const stats = key => {
        const times = runs.filter(run => run.valid).map(run => read(run, key)).filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
        if (!times.length) return null;
        const middle = Math.floor(times.length / 2);
        return { median: (times[middle] + times[Math.floor((times.length - 1) / 2)]) / 2,
          min: times[0], max: times.at(-1), samples: times.length };
      };
      return { leg, attempted: runs.length, valid: runs.filter(run => run.valid).length,
        failedRequests: runs.reduce((sum, run) => sum + (run.failedRequests || 0), 0),
        exceptions: runs.reduce((sum, run) => sum + (run.exceptions || 0), 0),
        consoleErrors: runs.reduce((sum, run) => sum + (run.consoleErrors || 0), 0),
        milestonesMs: Object.fromEntries(statKeys.map(key => [key, stats(key)])) };
    });
  }
} finally {
  server.closeAllConnections();
  server.close();
}
console.log(JSON.stringify(results, null, 1));
if (results.checks.some(([, passed]) => !passed)) process.exitCode = 1;
