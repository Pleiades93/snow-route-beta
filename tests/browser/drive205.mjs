import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCreateRig, serveRepo, makeResults, finishCreate, sleep } from './harness-create.mjs';

// drive205: Beta 1.246 - the ATTEMPT STALL (Andrew's Apple-standard
// rule): inside crOverpassFetch, an attempt that produces NO BYTES for
// CR_TIMING.attemptStallMs is aborted and the fetch moves to its next
// instance inside the same budget. The sections grade the fetch seam
// directly (drive191's pattern: the real app, window.fetch stubbed,
// the budgets shrunk through the CR_TIMING seam - the scaled form is
// attemptStallMs 3000 against a 20000 attempt cap and a 30000 budget,
// so a kill inside the window can only be the silence rule's):
//   S1 a SILENT first attempt is killed at the silence bound (measured,
//      not the cap) and the fallback instance's answer is committed.
//   S2 a TRICKLING answer (a chunk every 1200 ms, ~9.6 s inside one
//      attempt - three silence windows) is NEVER cut by the rule: it
//      completes from the first instance alone.
//   S3 a killed attempt's late answer lands NOWHERE: the kill severs
//      its channel (the abort settles its fetch), the committed result
//      is the fallback's, and releasing the poison afterwards changes
//      nothing. (The preparation level's generation orphaning is
//      untouched 1.229 machinery, graded by drive166/drive181.)
//   S4 the healthy path is Beta 1.245's: an instant answer commits
//      from the first instance; an HTTP error moves to the fallback
//      exactly as before.
//   S5 the no-stream fallback branch: a text() that wedges is cut by
//      the silence rule (its timer runs from the answer landing) and
//      the fetch still commits the fallback instance's answer.
// Every stub honours the AbortSignal, as a real fetch does - a stub
// that ignores aborts grades nothing (drive166's lesson). The stubs
// answer only the scenarios' own calls (body 'data=x'); the app's own
// background Overpass traffic passes through to the real fetch, whose
// CDP layer answers it benignly - the first run's S1 log showed five
// host entries for one scenario call without the discriminator. On the
// Beta 1.245 tree the seam does not exist: S1/S3/S5 run to the 20 s
// attempt cap and fail their windows.
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
const rig = await startCreateRig({ profile: '/tmp/d205profile-' + Date.now(), fulfil, jsonMode: 'coded' });
const { proc, send, PAGE_S, ev2 } = rig;
const JA = async (expr) => { const raw = await ev2(`(async () => { try { return JSON.stringify(await (${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

// The scenario prelude: shrink the silence bound through the seam and
// install the per-section fetch stub. GOOD is the fallback's answer,
// POISON the killed attempt's late one - the ids keep them apart.
const PRELUDE = `(() => {
  window.__realFetch = window.fetch;
  window.__stall0 = CR_TIMING.attemptStallMs; CR_TIMING.attemptStallMs = 3000;
  window.__log = [];
  window.__host = u => String(u).indexOf('kumi') >= 0 ? 'kumi' : 'de';
  window.__mine = opts => String((opts && opts.body) || '') === 'data=x';
  window.__good = id => ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), body: (() => { const t = new TextEncoder().encode(JSON.stringify({ elements: [{ type: 'way', id }] })); return new ReadableStream({ start(c) { c.enqueue(t); c.close(); } }); })(), text: async () => JSON.stringify({ elements: [{ type: 'way', id }] }) });
  return true;
})()`;
const RESTORE = `(() => { window.fetch = window.__realFetch; CR_TIMING.attemptStallMs = window.__stall0; return true; })()`;

try {
  await send('Page.navigate', { url: ORIGIN + '/index.html' }, PAGE_S);
  await rig.bootRoute();
  await ev2(PRELUDE);

  // ---- S1: silent attempt 1 -> killed at the silence bound, fallback commits ----
  const s1 = await JA(`(async () => {
    window.__log = []; window.__abortedAt = 0;
    window.fetch = (url, opts) => {
      if (!window.__mine(opts)) return window.__realFetch(url, opts);
      const h = window.__host(url); window.__log.push(h);
      if (h === 'kumi') return Promise.resolve(window.__good(42));
      return new Promise((res, rej) => { const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { window.__abortedAt = Date.now(); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
    };
    const t0 = Date.now();
    const r = await crOverpassFetch('x', 30000, 20000, null, null);
    return { ok: r.ok, id: r.json && r.json.elements && r.json.elements[0] && r.json.elements[0].id, killMs: window.__abortedAt - t0, totalMs: Date.now() - t0, log: window.__log };
  })()`);
  ok('S1a the silent first attempt is aborted at the silence bound (~3 s scaled), not its 20 s cap | ' + JSON.stringify(s1), s1.killMs >= 2700 && s1.killMs <= 8000);
  ok('S1b the fetch then commits the FALLBACK instance\'s answer, well inside the budget | ' + JSON.stringify(s1), s1.ok === true && s1.id === 42 && s1.totalMs < 12000 && JSON.stringify(s1.log) === '["de","kumi"]');

  // ---- S2: a trickling answer is never cut by the silence rule ----
  const s2 = await JA(`(async () => {
    window.__log = [];
    window.fetch = (url, opts) => {
      if (!window.__mine(opts)) return window.__realFetch(url, opts);
      window.__log.push(window.__host(url));
      const full = JSON.stringify({ elements: [{ type: 'way', id: 7, geometry: [{ lat: 43.8, lon: -79.5 }, { lat: 43.801, lon: -79.499 }] }] });
      const pieces = []; for (let i = 0; i < full.length; i += Math.ceil(full.length / 9)) pieces.push(full.slice(i, i + Math.ceil(full.length / 9)));
      const enc = new TextEncoder();
      const stream = new ReadableStream({ start(c) {
        let i = 0; c.enqueue(enc.encode(pieces[i++]));
        const iv = setInterval(() => { if (i < pieces.length) { c.enqueue(enc.encode(pieces[i++])); } if (i >= pieces.length) { clearInterval(iv); c.close(); } }, 1200);
        const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { clearInterval(iv); try { c.error(new Error('aborted')); } catch (e) {} });
      } });
      return Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), body: stream, text: async () => full });
    };
    const t0 = Date.now();
    const r = await crOverpassFetch('x', 30000, 20000, null, null);
    return { ok: r.ok, id: r.json && r.json.elements && r.json.elements[0] && r.json.elements[0].id, totalMs: Date.now() - t0, log: window.__log };
  })()`);
  ok('S2 a chunk every 1200 ms (~9.6 s, three silence windows) completes from the FIRST instance alone - the silence rule never fires on a live download | ' + JSON.stringify(s2), s2.ok === true && s2.id === 7 && s2.totalMs >= 9000 && JSON.stringify(s2.log) === '["de"]');

  // ---- S3: the killed attempt's late answer lands nowhere ----
  const s3 = await JA(`(async () => {
    window.__log = []; window.__poisonReleased = false;
    let poisonResolve = null;
    window.fetch = (url, opts) => {
      if (!window.__mine(opts)) return window.__realFetch(url, opts);
      const h = window.__host(url); window.__log.push(h);
      if (h === 'kumi') return Promise.resolve(window.__good(42));
      const p = new Promise((res, rej) => { const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });
      poisonResolve = () => { window.__poisonReleased = true; }; // the server's answer finally exists - but its fetch was settled by the abort long before
      return p;
    };
    const t0 = Date.now();
    const r = await crOverpassFetch('x', 30000, 20000, null, null);
    const committed = JSON.stringify(r.json);
    poisonResolve(); // the late answer arrives into a settled channel
    await new Promise(r2 => setTimeout(r2, 3500));
    return { ok: r.ok, id: r.json && r.json.elements && r.json.elements[0] && r.json.elements[0].id, stable: JSON.stringify(r.json) === committed, poisonReleased: window.__poisonReleased, totalMs: Date.now() - t0, log: window.__log };
  })()`);
  ok('S3 the killed attempt\'s late answer changes nothing: the result is the fallback\'s, byte-stable after the poison is released | ' + JSON.stringify(s3), s3.ok === true && s3.id === 42 && s3.stable === true && s3.poisonReleased === true && JSON.stringify(s3.log) === '["de","kumi"]');

  // ---- S4: the healthy path is 1.245's ----
  const s4 = await JA(`(async () => {
    window.__log = [];
    window.fetch = (url, opts) => { if (!window.__mine(opts)) return window.__realFetch(url, opts); window.__log.push(window.__host(url)); return Promise.resolve(window.__good(42)); };
    const t0 = Date.now();
    const r1 = await crOverpassFetch('x', 30000, 20000, null, null);
    const fastMs = Date.now() - t0;
    window.__log = [];
    window.fetch = (url, opts) => { if (!window.__mine(opts)) return window.__realFetch(url, opts); const h = window.__host(url); window.__log.push(h); if (h === 'de') return Promise.resolve({ ok: false, status: 503, headers: new Headers({}), body: null, text: async () => 'fixture status' }); return Promise.resolve(window.__good(43)); };
    const r2 = await crOverpassFetch('x', 30000, 20000, null, null);
    return { ok1: r1.ok, id1: r1.json.elements[0].id, fastMs, ok2: r2.ok, id2: r2.json.elements[0].id, log: window.__log };
  })()`);
  ok('S4a an instant healthy answer commits from the first instance, fast | ' + JSON.stringify(s4), s4.ok1 === true && s4.id1 === 42 && s4.fastMs < 2000);
  ok('S4b an HTTP error still moves to the fallback and commits its answer | ' + JSON.stringify(s4), s4.ok2 === true && s4.id2 === 43 && JSON.stringify(s4.log) === '["de","kumi"]');

  // ---- S5: the no-stream fallback's wedged read is bounded by the rule ----
  const s5 = await JA(`(async () => {
    window.__log = []; window.__abortedAt = 0;
    window.fetch = (url, opts) => {
      if (!window.__mine(opts)) return window.__realFetch(url, opts);
      const h = window.__host(url); window.__log.push(h);
      if (h === 'kumi') return Promise.resolve(window.__good(42));
      return Promise.resolve({ ok: true, status: 200, headers: new Headers({}), body: null,
        text: () => new Promise((res, rej) => { const s = opts && opts.signal; if (s) s.addEventListener('abort', () => { window.__abortedAt = Date.now(); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); }) });
    };
    const t0 = Date.now();
    const r = await crOverpassFetch('x', 30000, 20000, null, null);
    return { ok: r.ok, id: r.json && r.json.elements && r.json.elements[0] && r.json.elements[0].id, killMs: window.__abortedAt - t0, totalMs: Date.now() - t0, log: window.__log };
  })()`);
  ok('S5 a wedged text() in the no-stream branch is cut at the silence bound and the fallback\'s answer commits | ' + JSON.stringify(s5), s5.killMs >= 2700 && s5.killMs <= 8000 && s5.ok === true && s5.id === 42 && JSON.stringify(s5.log) === '["de","kumi"]');

  await ev2(RESTORE);
} catch (e) {
  ok('drive205 completed without a harness-level throw: ' + String(e && e.message || e), false);
}
finishCreate(R, proc, server);
