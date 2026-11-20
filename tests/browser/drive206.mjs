import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive206: Beta 1.249 - the PACK STALL (Andrew's ruling, 2026-11-19):
// the city pack download (crPackLoad) gains the byte-level stall rule
// the service fetch got in 1.246, on the pack's own two windows -
// CR_TIMING.packFirstByteMs (120 s at full size) of silence before the
// first byte is tolerated (the static host spends real time producing
// a big city's file), then packStallMs (60 s) of silence once bytes
// flow. A silence kill retries INSIDE the cached promise, so nothing
// already landed is discarded. The sections grade the loader seam
// directly (drive191/drive205's pattern: the real app, window.fetch
// stubbed, the windows shrunk through the CR_TIMING seam - scaled to
// 3000 / 1500 with the loop's stallMs bound at 30000, so a kill inside
// a window can only be the silence rule's). Every load is raced
// against a drive-side deadline: on the Beta 1.248 tree the seams do
// not exist and a silent load pends forever, so P1/P3/P4 fail there
// (timeout / no retry), and P2's timing leg fails there too - the old
// reader never streamed (it buffered the whole body via r.json()), so
// a timed trickle was invisible to it; the stub therefore also speaks
// r.json() (each plan's full payload) so the old reader can run at
// all. The pure guards (P5) hold on both trees, as they must - they
// pin behaviour the round promised not to change.
//   P1 a host that NEVER answers is killed at the first-byte bound
//      (measured by the retry's start) and the retry's answer commits.
//   P2 a first byte inside the window, then bytes flowing inside the
//      flowing window, completes from the ONE attempt - never killed.
//   P3 bytes flow, then silence: killed on the flowing window, the
//      (C9/A-01 tightening, /correct Phase 2: P3a's kill window is
//      capped BELOW the first-byte bound, so the check discriminates
//      WHICH window killed - the sawByte mutation's ~3 150 ms
//      first-byte kill now fails it, where the old 7 000 cap passed)
//      retry completes, the SAME cached promise resolves (it never
//      rejected), and coverage committed before the load is untouched.
//   P4 the killed attempt's poison chunk never enters the result, and
//      the cache keeps serving the retry's answer afterwards.
//   P5 the healthy path is 1.248's: an instant pack adapts to exactly
//      the elements the old whole-body read produced; an HTTP error
//      rejects at once with NO retry (only silence retries).
// Every stub honours the AbortSignal, as a real fetch does - a stub
// that ignores aborts grades nothing (drive166's lesson). The stubs
// answer only the scenarios' own slugs (packs/pack*.json); all other
// traffic passes through to the real fetch.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKFX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'browser', 'fixtures', 'city-pack-vaughan.json'), 'utf8'));
const INDEXFX = JSON.parse(fs.readFileSync(path.join(REPO, 'packs', 'index.json'), 'utf8'));
const { R, ok } = makeResults();

const { server, ORIGIN } = await serveRepo(REPO);
async function fulfil(sessionId, p, H) {
  const send = H.send;
  const url = p.request.url;
  const json = (obj, code) => H.json(sessionId, p, obj, code);
  try {
    const pn = new URL(url).pathname;
    if (pn.endsWith('/packs/index.json')) return await json(INDEXFX);
    if (pn.endsWith('/packs/vaughan.json')) return await json(PACKFX);
    if (/\/packs\/[^/]+\.json$/.test(pn)) return await json('nf', 404);
    if (url.indexOf('overpass') >= 0) return await json({ elements: [] });
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } });
    const buf = Buffer.from(await r.arrayBuffer());
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: r.status, responseHeaders: [{ name: 'Content-Type', value: r.headers.get('content-type') || 'application/octet-stream' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: buf.toString('base64') }, sessionId);
  } catch (e) { try { await send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }, sessionId); } catch (e2) {} }
}
const rig = await startCreateRig({ profile: '/tmp/d206profile-' + Date.now(), fulfil, jsonMode: 'coded' });
const { proc, send, PAGE_S, ev2 } = rig;
const JA = async (expr) => { const raw = await ev2(`(async () => { try { return JSON.stringify(await (${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// The scenario prelude: shrink the pack windows through the seam and
// install the scripted pack host. A plan is a list of steps per call:
// { never: true } (the host never answers; only the abort settles it),
// { http: 500 }, or { steps: [{ at, chunk }..., { at, close: true }] }
// (a plan with no close step hangs mid-body until the abort errors the
// stream, as a wedged host's would).
const PRELUDE = `(() => {
  window.__realFetch = window.fetch;
  window.__t0 = { fb: CR_TIMING.packFirstByteMs, ps: CR_TIMING.packStallMs, sm: CR_TIMING.stallMs };
  CR_TIMING.packFirstByteMs = 3000; CR_TIMING.packStallMs = 1500; CR_TIMING.stallMs = 30000;
  window.__payload = JSON.stringify({ streets: { 'Alpha Street': [[[43.8, -79.5], [43.801, -79.499]]], 'Beta Road': [[[43.81, -79.51], [43.811, -79.509], [43.812, -79.508]]] } });
  window.__poison = JSON.stringify({ streets: { 'Poison Avenue': [[[43.9, -79.6], [43.901, -79.599]]] } });
  window.__expected = JSON.stringify([
    { type: 'way', id: -1, tags: { name: 'Alpha Street' }, geometry: [{ lat: 43.8, lon: -79.5 }, { lat: 43.801, lon: -79.499 }] },
    { type: 'way', id: -2, tags: { name: 'Beta Road' }, geometry: [{ lat: 43.81, lon: -79.51 }, { lat: 43.811, lon: -79.509 }, { lat: 43.812, lon: -79.508 }] }]);
  window.__plans = {}; window.__calls = [];
  window.__mkRes = (steps, signal, full) => {
    const enc = new TextEncoder();
    const stream = new ReadableStream({ start(c) {
      const timers = [];
      for (const st of steps) timers.push(setTimeout(() => { try { if (st.close) c.close(); else if (st.chunk != null) c.enqueue(enc.encode(st.chunk)); } catch (e) {} }, st.at));
      if (signal) signal.addEventListener('abort', () => { for (const t of timers) clearTimeout(t); try { c.error(new Error('aborted')); } catch (e) {} });
    } });
    return { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), body: stream, text: async () => (full || window.__payload), json: async () => JSON.parse(full || window.__payload) };
  };
  window.fetch = (url, opts) => {
    const m = String(url).match(/packs\\/(pack[a-z])\\.json$/);
    if (!m) return window.__realFetch(url, opts);
    const slug = m[1];
    const plans = window.__plans[slug] || [];
    const idx = window.__calls.filter(c => c.slug === slug).length;
    window.__calls.push({ slug, at: Date.now() });
    const plan = plans[Math.min(idx, plans.length - 1)] || { steps: [{ at: 0, chunk: window.__payload }, { at: 10, close: true }] };
    const signal = opts && opts.signal;
    if (plan.never) return new Promise((res, rej) => { if (signal) signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
    if (plan.http) return Promise.resolve({ ok: false, status: plan.http, headers: new Headers({}), body: null, text: async () => 'fixture status' });
    return Promise.resolve(window.__mkRes(plan.steps, signal, plan.full));
  };
  window.__load = (slug, deadlineMs) => Promise.race([crPackLoad(slug), new Promise(r => setTimeout(() => r('__timeout'), deadlineMs))]);
  window.__callsFor = slug => window.__calls.filter(c => c.slug === slug).map(c => c.at);
  return true;
})()`;
const RESTORE = `(() => { window.fetch = window.__realFetch; CR_TIMING.packFirstByteMs = window.__t0.fb; CR_TIMING.packStallMs = window.__t0.ps; CR_TIMING.stallMs = window.__t0.sm; return true; })()`;

try {
  await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
  await rig.bootRoute();
  await ev2(PRELUDE);

  // ---- P1: the host never answers -> killed at the first-byte bound, the retry commits ----
  const p1 = await JA(`(async () => {
    window.__plans.packa = [{ never: true }, { steps: [{ at: 0, chunk: window.__payload }, { at: 10, close: true }] }];
    const t0 = Date.now();
    const els = await window.__load('packa', 12000);
    const ats = window.__callsFor('packa');
    return { timeout: els === '__timeout', match: JSON.stringify(els) === window.__expected, calls: ats.length, killMs: ats.length > 1 ? ats[1] - ats[0] : -1, totalMs: Date.now() - t0 };
  })()`);
  ok('P1a a silent host is killed at the scaled first-byte bound (~3 s), not left pending | ' + JSON.stringify(p1), p1.timeout === false && p1.killMs >= 2700 && p1.killMs <= 8000);
  ok('P1b the retry inside the same load commits the pack, well inside the loop bound | ' + JSON.stringify(p1), p1.match === true && p1.calls === 2 && p1.totalMs < 10000);

  // ---- P2: a late first byte inside the window, then flowing bytes - never killed ----
  const p2 = await JA(`(async () => {
    const full = window.__payload, q = Math.ceil(full.length / 4);
    const pieces = [full.slice(0, q), full.slice(q, 2 * q), full.slice(2 * q, 3 * q), full.slice(3 * q)];
    window.__plans.packb = [{ steps: [{ at: 2400, chunk: pieces[0] }, { at: 3400, chunk: pieces[1] }, { at: 4400, chunk: pieces[2] }, { at: 5400, chunk: pieces[3] }, { at: 5450, close: true }] }];
    const t0 = Date.now();
    const els = await window.__load('packb', 12000);
    return { timeout: els === '__timeout', match: JSON.stringify(els) === window.__expected, calls: window.__callsFor('packb').length, totalMs: Date.now() - t0 };
  })()`);
  ok('P2 a first byte at 2.4 s (inside the 3 s window) then a chunk every 1 s (inside the 1.5 s flowing window) completes from the ONE attempt - the rule never fires on a live download | ' + JSON.stringify(p2), p2.timeout === false && p2.match === true && p2.calls === 1 && p2.totalMs >= 5000);

  // ---- P3: mid-flow silence -> killed on the flowing window; the retry completes; landed state intact ----
  const p3 = await JA(`(async () => {
    const byId = Object.create(null);
    crIndexWays([{ type: 'way', id: 900001, tags: { name: 'Seed Street' }, geometry: [{ lat: 43.8, lon: -79.5 }, { lat: 43.801, lon: -79.499 }] }], byId);
    crCov = crCovFromWays(byId, [{ s: 43.7, w: -79.6, n: 43.9, e: -79.4 }]);
    const covBefore = JSON.stringify({ boxes: crCov.boxes, names: Object.keys(crCov.byName), ids: Object.keys(crCov.byId) });
    const half = Math.ceil(window.__payload.length / 2);
    window.__plans.packc = [
      { steps: [{ at: 150, chunk: window.__payload.slice(0, half) }] },
      { steps: [{ at: 0, chunk: window.__payload }, { at: 10, close: true }] }];
    const p = crPackLoad('packc');
    const els = await Promise.race([p, new Promise(r => setTimeout(() => r('__timeout'), 12000))]);
    const ats = window.__callsFor('packc');
    return { timeout: els === '__timeout', match: JSON.stringify(els) === window.__expected, calls: ats.length, killMs: ats.length > 1 ? ats[1] - ats[0] : -1,
      samePromise: crPackLoads.packc === p, covIntact: JSON.stringify({ boxes: crCov.boxes, names: Object.keys(crCov.byName), ids: Object.keys(crCov.byId) }) === covBefore };
  })()`);
  ok('P3a a mid-flow silence is killed on the scaled flowing window (~150 ms of bytes + 1.5 s of silence) and the retry commits - the upper bound sits BELOW the scaled first-byte bound (2 600 < 3 000), so the kill must have come from the FLOWING window: with the read loop\'s sawByte assignment deleted (the R-04 mutation), the timer never leaves the first-byte window, the kill lands at ~3 150 ms and this check FAILS - the pre-C9 window (7 000) passed both, which was Codex A-01\'s blind spot | ' + JSON.stringify(p3), p3.timeout === false && p3.match === true && p3.calls === 2 && p3.killMs >= 1400 && p3.killMs <= 2600);
  ok('P3b the SAME cached promise resolved (the kill never surfaced to callers) and the coverage committed before the load is byte-identical after it | ' + JSON.stringify(p3), p3.samePromise === true && p3.covIntact === true);

  // ---- P4: the killed attempt's poison never lands; the cache keeps the retry's answer ----
  const p4 = await JA(`(async () => {
    const half = Math.ceil(window.__poison.length / 2);
    window.__plans.packd = [
      { full: window.__poison, steps: [{ at: 100, chunk: window.__poison.slice(0, half) }] },
      { steps: [{ at: 0, chunk: window.__payload }, { at: 10, close: true }] }];
    const els = await window.__load('packd', 12000);
    const names1 = Array.isArray(els) ? els.map(e => e.tags.name) : [];
    await new Promise(r => setTimeout(r, 2500)); // outlast another flowing window: nothing from the killed attempt may surface late
    const again = await crPackLoad('packd');
    return { timeout: els === '__timeout', names: names1, againMatch: JSON.stringify(again) === window.__expected, calls: window.__callsFor('packd').length };
  })()`);
  ok('P4 the killed attempt\'s poison chunk never enters the result, and the settled cache keeps serving the retry\'s answer with no new download | ' + JSON.stringify(p4), p4.timeout === false && JSON.stringify(p4.names) === '["Alpha Street","Beta Road"]' && p4.againMatch === true && p4.calls === 2);

  // ---- P5: the healthy path is 1.248's; real failures reject at once, unretried ----
  const p5 = await JA(`(async () => {
    window.__plans.packe = [{ steps: [{ at: 0, chunk: window.__payload }, { at: 10, close: true }] }];
    const t0 = Date.now();
    const els = await window.__load('packe', 12000);
    const fastMs = Date.now() - t0;
    window.__plans.packf = [{ http: 500 }];
    let rejected = '';
    try { await crPackLoad('packf'); } catch (e) { rejected = String(e && e.message || e); }
    return { match: JSON.stringify(els) === window.__expected, fastMs, callsE: window.__callsFor('packe').length, rejected, callsF: window.__callsFor('packf').length };
  })()`);
  ok('P5a an instant healthy pack adapts to exactly the elements the old whole-body read produced (ids, names, geometry) | ' + JSON.stringify(p5), p5.match === true && p5.fastMs < 2000 && p5.callsE === 1);
  ok('P5b an HTTP error rejects at once and is NOT retried - only silence retries | ' + JSON.stringify(p5), p5.rejected === 'pack HTTP 500' && p5.callsF === 1);

  await ev2(RESTORE);
} catch (e) {
  ok('drive206 completed without a harness-level throw: ' + String(e && e.message || e), false);
}
finishCreate(R, proc, server);
