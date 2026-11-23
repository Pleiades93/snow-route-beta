// Service worker fetch-strategy tests: the worker's cacheFirst/netFirst
// functions from src/sw.js, run in Node with mocked caches/fetch.
// Cases: 200 -> network; 503 + cache -> cache; 503 + no cache -> the 503;
//        network throw + cache -> cache; throw + no cache -> Response.error().
import { readFileSync } from 'fs';

import { fileURLToPath } from 'node:url';
const sw = readFileSync(fileURLToPath(new URL('../src/sw.js', import.meta.url)), 'utf8');
const start = sw.indexOf('async function netFirst');
const end = sw.indexOf("self.addEventListener('fetch'");
if (start < 0 || end < 0) throw new Error('worker functions not found');
const fnSrc = sw.slice(start, end);

const store = new Map();   // url -> Response
const withoutSearch = url => {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.href;
};
const cacheMock = {
  async match(r, { ignoreSearch = false } = {}) {
    const url = typeof r === 'string' ? r : r.url;
    if (!ignoreSearch) return store.get(url)?.clone();
    const target = withoutSearch(url);
    for (const [key, response] of store) {
      if (withoutSearch(key) === target) return response.clone();
    }
  },
  async put(r, res) {
    const url = typeof r === 'string' ? r : r.url;
    store.delete(url);
    store.set(url, res);
  }
};
globalThis.caches = { async open() { return cacheMock; } };
globalThis.self = { registration: { scope: 'https://example.test/app/' } };

let fetchImpl = async () => { throw new Error('unset'); };
globalThis.fetch = (...a) => fetchImpl(...a);
let putThrows = false;
const origPut = cacheMock.put.bind(cacheMock);
cacheMock.put = async (r, res) => { if (putThrows) throw new Error('quota'); return origPut(r, res); };

const constLine = sw.split('\n').find(l => l.startsWith('const CACHE'));
eval(constLine + '\n' + fnSrc + '\nglobalThis.netFirst = netFirst; globalThis.cacheFirst = cacheFirst; globalThis.staleWhileRevalidate = staleWhileRevalidate; globalThis.mapFetch = mapFetch; globalThis.updNav = updNav;');
const netFirst = globalThis.netFirst;
const updNav = globalThis.updNav;
const cacheFirst = globalThis.cacheFirst;
const staleWhileRevalidate = globalThis.staleWhileRevalidate;
const mapFetch = globalThis.mapFetch;

// Fake clock (testing-efficiency rollout, 2026-11-23): this suite used to
// burn ~34 s of real time per run waiting out the worker's real bounds
// (the 2 s navigation shortcut, the 5 s/8 s stall races, slow-network
// fetches landing at 4.2 s). The worker's bounds are plain setTimeout
// races, so the suite now runs on a virtual clock: setTimeout /
// clearTimeout / Date.now are faked, and each timed case starts its
// promise, advances virtual time past the relevant bound, and awaits.
// EVERY assertion is unchanged - the time-based ones (bounded <20 s,
// served FAST <4 s) now read the virtual serve instant, which is the
// quantity they always meant. Cases with no timers complete on
// microtasks alone, exactly as before.
let vNow = 0;
let timerSeq = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms = 0, ...args) => { const id = ++timerSeq; timers.set(id, { at: vNow + Math.max(0, Number(ms) || 0), fn, args }); return id; };
globalThis.clearTimeout = id => { timers.delete(id); };
Date.now = () => vNow;
const flushMicro = () => new Promise(r => setImmediate(r));
async function advance(ms) {
  const until = vNow + ms;
  for (;;) {
    // Flush FIRST each round: an async function registers its timers only
    // after its first await yields, so scanning before flushing would see
    // an empty queue and strand the promise (the suite's first fake-clock
    // run hung exactly here).
    await flushMicro();
    let next = null;
    for (const [id, t] of timers) if (t.at <= until && (!next || t.at < next.t.at || (t.at === next.t.at && id < next.id))) next = { id, t };
    if (!next) break;
    timers.delete(next.id);
    vNow = Math.max(vNow, next.t.at);
    next.t.fn(...next.t.args);
  }
  vNow = until;
  await flushMicro();
}

const req = new Request('https://example.test/app/');
const shellCacheName = 'snowroute-shell-v1';
const cachedResp = new Response('CACHED-SHELL', { status: 200 });
const results = [];
const check = (name, cond) => results.push([name, !!cond]);

// 1. 200 online -> network response, and it gets cached
store.clear();
fetchImpl = async () => new Response('NETWORK-OK', { status: 200 });
let r = await netFirst(req, 'c');
check('200 returns network body', (await r.text()) === 'NETWORK-OK');
check('200 gets cached', store.has(req.url));

// 2. 503 with cache -> cached copy wins
store.clear(); store.set(req.url, cachedResp.clone());
fetchImpl = async () => new Response('SERVER ERROR', { status: 503 });
r = await netFirst(req, 'c');
check('503 + cache returns cached body', (await r.text()) === 'CACHED-SHELL');

// 3. 503 without cache -> the 503 surfaces (honest failure)
store.clear();
fetchImpl = async () => new Response('SERVER ERROR', { status: 503 });
r = await netFirst(req, 'c');
check('503 + no cache returns 503', r.status === 503);

// 4. network throw with cache -> cached copy
store.clear(); store.set(req.url, cachedResp.clone());
fetchImpl = async () => { throw new Error('offline'); };
r = await netFirst(req, 'c');
check('throw + cache returns cached body', (await r.text()) === 'CACHED-SHELL');

// 5. network throw without cache -> Response.error() (type 'error', status 0)
store.clear();
fetchImpl = async () => { throw new Error('offline'); };
r = await netFirst(req, 'c');
check('throw + no cache returns error response', r.type === 'error' || r.status === 0);

// 6. ISSUE-03: a NON-navigation request (map style) failing with only the shell
// cached must NOT be handed the HTML shell.
store.clear(); store.set('https://example.test/app/', cachedResp.clone());
const styleReq = new Request('https://tiles.openfreemap.org/styles/positron');
fetchImpl = async () => new Response('SERVER ERROR', { status: 503 });
r = await netFirst(styleReq, 'c');
check('style 503 + only shell cached returns 503, not HTML', r.status === 503);
fetchImpl = async () => { throw new Error('offline'); };
r = await netFirst(styleReq, 'c');
check('style offline + only shell cached returns error, not HTML', r.type === 'error' || r.status === 0);

// 7. R-11: cache-write failure must not sink a good network response (cacheFirst)
store.clear(); putThrows = true;
const tileReq = new Request('https://server.arcgisonline.com/tile/15/1/2');
fetchImpl = async () => new Response('TILE', { status: 200 });
r = await cacheFirst(tileReq, 'snowroute-tiles-v1');
check('cache write fails -> network response still returned', (await r.text()) === 'TILE');
putThrows = false;

// 8. SEC-7 (v5.47): a SLOW but working network (answers after the 3.5 s race)
// must be awaited and used, not abandoned for an error/cache miss.
store.clear();
fetchImpl = async () => { await new Promise(res => setTimeout(res, 4200)); return new Response('SLOW-OK', { status: 200 }); };
const p8 = netFirst(req, 'c'); await advance(5000); r = await p8;
check('SEC-7 slow network response is awaited and returned', (await r.text()) === 'SLOW-OK');
check('SEC-7 slow response gets cached', store.has(req.url));

// 9. SEC-6d (v5.47): tile fetches go through CORS so the status is visible -
// an error tile response is returned but NEVER cached; a good one is cached.
store.clear();
const tileReq2 = new Request('https://server.arcgisonline.com/tile/15/3/4');
fetchImpl = async () => new Response('ERR', { status: 503 });
r = await cacheFirst(tileReq2, 'snowroute-tiles-v1');
check('SEC-6d tile 503 returned, not cached', r.status === 503 && !store.has(tileReq2.url));
fetchImpl = async () => new Response('TILE-OK', { status: 200 });
r = await cacheFirst(tileReq2, 'snowroute-tiles-v1');
check('SEC-6d tile 200 returned and cached', (await r.text()) === 'TILE-OK' && store.has(tileReq2.url));

// 10. NEW-02 (v5.51): a failing cache write on the netFirst path must not sink
// a good network response (and with the write awaited + caught, no unhandled
// rejection can escape).
store.clear(); putThrows = true;
fetchImpl = async () => new Response('NETWORK-OK', { status: 200 });
r = await netFirst(req, 'c');
check('NEW-02 netFirst put fails -> network response still returned', (await r.text()) === 'NETWORK-OK');
putThrows = false;

// 11. Beta 1.48 (audit B03): a NAVIGATION whose network never answers at all
// must fall back to the cached shell within a bounded time, not hang forever.
// (Non-navigations keep the unbounded SEC-7 wait - case 8 still proves it.)
store.clear(); store.set(req.url, cachedResp.clone());
fetchImpl = () => new Promise(() => {});   // never settles
const navReq = { url: req.url, mode: 'navigate' };
const t0 = Date.now();
let servedAt = null;
const p11 = netFirst(navReq, shellCacheName).then(v => { servedAt = Date.now() - t0; return v; });
await advance(3000);
r = await p11;
check('B03 stalled navigation falls back to cache', (await r.text()) === 'CACHED-SHELL');
check('B03 fallback is bounded (<20s)', servedAt < 20000);
check('1.221 stalled navigation serves the cache FAST (<4s, was ~8.5s)', servedAt < 4000);

// 11b. Beta 1.221 (webperf piece 6): a stalled navigation with a cached shell
// serves the shell at the 2 s mark, and the SAME fetch, still running in the
// background, refreshes the cache when it finally lands - update freshness
// survives the early serve.
store.clear(); store.set(req.url, cachedResp.clone());
fetchImpl = async () => { await new Promise(res => setTimeout(res, 4200)); return new Response('FRESH-SHELL', { status: 200 }); };
const navReq2 = { url: req.url, mode: 'navigate' };
const t1 = Date.now();
let servedAt1 = null;
const p11b = netFirst(navReq2, shellCacheName).then(v => { servedAt1 = Date.now() - t1; return v; });
await advance(2500);
r = await p11b;
check('1.221 slow navigation serves the cached shell at once', (await r.text()) === 'CACHED-SHELL' && servedAt1 < 4000);
await advance(3000);   // let the background fetch land (4.2s mark + the put)
check('1.221 background refresh updates the cached shell', (await store.get(req.url).text()) === 'FRESH-SHELL');

// 11c. Beta 1.221: a slow navigation with NOTHING cached still awaits the real
// answer inside the bounded wait (SEC-7 for first launches - no shell exists
// to serve early).
store.clear();
fetchImpl = async () => { await new Promise(res => setTimeout(res, 4200)); return new Response('FIRST-SHELL', { status: 200 }); };
const p11c = netFirst(navReq2, shellCacheName); await advance(5000); r = await p11c;
check('1.221 uncached slow navigation awaits the network answer', (await r.text()) === 'FIRST-SHELL');

// 11d. Beta 1.221 gate fix (Codex P2, PR #98): the Update reload navigation
// (updnav) must LOAD the confirmed new version even when the network is
// slower than netFirst's 2 s navigation shortcut - the old shell is never
// served for it - and the fresh shell lands under the canonical keys.
store.clear(); store.set(req.url, cachedResp.clone());
fetchImpl = async () => { await new Promise(res => setTimeout(res, 3000)); return new Response('NEW-SHELL', { status: 200 }); };
const updReq = { url: req.url + '?updnav=1&v=1', mode: 'navigate' };
const p11d = updNav(updReq, 'c'); await advance(3500); r = await p11d;
check('1.221 updnav slow network serves the NEW shell, not the cached one', (await r.text()) === 'NEW-SHELL');
check('1.221 updnav stores the new shell under the canonical scope key', (await store.get(req.url).text()) === 'NEW-SHELL');
check('1.221 updnav stores the new shell under the index.html key', (await store.get(req.url + 'index.html').text()) === 'NEW-SHELL');

// 11e. Beta 1.221 gate fix (Codex P2, PR #98): an ordinary navigation that
// arrives carrying a query and answers late - its background refresh updates
// the CANONICAL shell, not a junk query key.
store.clear(); store.set(req.url, cachedResp.clone());
fetchImpl = async () => { await new Promise(res => setTimeout(res, 4200)); return new Response('FRESH-SHELL', { status: 200 }); };
const navReqQ = { url: req.url + '?from=shortcut', mode: 'navigate' };
const p11e = netFirst(navReqQ, shellCacheName); await advance(2500); r = await p11e;
check('1.221 query navigation serves the cached shell at once', (await r.text()) === 'CACHED-SHELL');
await advance(3000);
check('1.221 query navigation background refresh updates the canonical shell', (await store.get(req.url).text()) === 'FRESH-SHELL');

// #171: an older query entry precedes the rewritten canonical shell.
store.clear();
const shareNav = { url: req.url + '?share=1', mode: 'navigate' };
await cacheMock.put(req.url, new Response('BUILD-A'));
await cacheMock.put(shareNav, new Response('BUILD-B'));
await cacheMock.put(req.url, new Response('BUILD-C'));
fetchImpl = async () => { throw new Error('offline'); };
r = await netFirst(navReq, shellCacheName);
check('#171 offline root navigation serves BUILD-C', (await r.text()) === 'BUILD-C');
fetchImpl = async () => new Response('SERVER ERROR', { status: 503 });
r = await netFirst(shareNav, shellCacheName);
check('#171 HTTP 503 on a query navigation serves BUILD-C', (await r.text()) === 'BUILD-C');
fetchImpl = () => new Promise(() => {});
const stalledShare = netFirst(shareNav, shellCacheName);
await advance(2000);
r = await stalledShare;
check('#171 stalled query navigation serves BUILD-C at the shortcut', (await r.text()) === 'BUILD-C');

store.clear();
fetchImpl = async () => new Response('BUILD-D');
r = await netFirst(shareNav, shellCacheName);
check('#171 fast query navigation returns BUILD-D', (await r.text()) === 'BUILD-D');
check('#171 fast query navigation stores only the two canonical keys',
  store.size === 2 && (await store.get(req.url)?.text()) === 'BUILD-D'
    && (await store.get(req.url + 'index.html')?.text()) === 'BUILD-D');

// 12. Beta 1.48 (audit B07): SWR answers from cache at once AND binds the
// background refresh to the fetch event's lifetime; the refresh lands.
store.clear();
const sprReq = new Request('https://protomaps.github.io/sprites/v4/light.json');
store.set(sprReq.url, new Response('SPRITE-OLD', { status: 200 }));
fetchImpl = async () => new Response('SPRITE-NEW', { status: 200 });
let wu = null;
const fakeEv = { waitUntil(p) { wu = p; } };
r = await staleWhileRevalidate(sprReq, 'c', fakeEv);
check('B07 SWR returns cached copy immediately', (await r.text()) === 'SPRITE-OLD');
check('B07 SWR binds refresh with waitUntil', !!wu && typeof wu.then === 'function');
await wu;
check('B07 refresh updates the cache', (await store.get(sprReq.url).text()) === 'SPRITE-NEW');

// 13. Beta 1.57 (second audit, item 2): the tile-eviction counter is seeded
// from the cache's REAL size on the first tile put after a worker wake, so
// the platform stopping the worker can no longer quietly disable the trim.
const tileStore = new Map();
for (let i = 0; i < 24; i++) tileStore.set('https://tiles.basemaps.cartocdn.com/t/' + i, new Response('T'));
const tileCacheMock = {
  async match(r) { const u = typeof r === 'string' ? r : r.url; return tileStore.get(u); },
  async put(r, res) { const u = typeof r === 'string' ? r : r.url; tileStore.set(u, res); },
  async keys() { return [...tileStore.keys()].map(u => ({ url: u })); },
  async delete(r) { const u = typeof r === 'string' ? r : r.url; return tileStore.delete(u); }
};
// 10. F09 (Beta 1.64): a map JSON request whose network NEVER settles must
// still reach its cached fallback - the wait is bounded (3.5 s race + 8 s);
// it used to hang forever despite a cached copy. (This case waits out the
// full ~11.5 s bound - on the suite's virtual clock, so it costs no real
// time. It sits before the seed section
// below replaces the caches mock.)
store.clear(); store.set(styleReq.url, cachedResp.clone());
fetchImpl = () => new Promise(() => {});
const pF09 = netFirst(styleReq, 'c'); await advance(12000); r = await pF09;
check('F09 stalled style request falls back to cache', (await r.text()) === 'CACHED-SHELL');

globalThis.caches = { async open() { return tileCacheMock; } };
delete cacheFirst._n; // simulate a fresh worker
fetchImpl = async () => new Response('TILE-NEW', { status: 200 });
r = await cacheFirst(new Request('https://tiles.basemaps.cartocdn.com/t/new'), 'snowroute-tiles-v1');
check('1.57 seed: counter starts from the real cache size (seed reads the post-put cache: 25 stored, +1 = 26)', cacheFirst._n === 26);
delete cacheFirst._n; // worker stopped and restarted by the platform
await cacheFirst(new Request('https://tiles.basemaps.cartocdn.com/t/new2'), 'snowroute-tiles-v1');
check('1.57 seed: after a restart the counter re-seeds from the real size (26 stored, +1 = 27)', cacheFirst._n === 27);

// 14. Beta 1.94 (audit F-03): the downloaded offline pack lives in its OWN
// cache (snowroute-offline-v1). mapFetch serves a pack hit with the network
// DOWN, and the browsing cache's FIFO eviction (which trims vector tiles
// in snowroute-tiles-v1 to MAX_TILES) can never reach into the pack cache -
// before 1.94 the pack shared the browsing cache and ordinary browsing
// could silently evict the download the operator was relying on. This case
// needs NAME-AWARE cache mocks; the earlier cases shared one store.
const namedStores = new Map();
const namedCache = name => ({
  async match(r) { const s = namedStores.get(name); const u = typeof r === 'string' ? r : r.url; const hit = s ? s.get(u) : undefined; return hit ? hit.clone() : undefined; }, // real Cache Storage hands back a fresh body per match - clone, or the second read of a stored Response throws
  async put(r, res) { if (!namedStores.has(name)) namedStores.set(name, new Map()); const u = typeof r === 'string' ? r : r.url; namedStores.get(name).set(u, res); },
  async keys() { const s = namedStores.get(name); return s ? [...s.keys()].map(u => ({ url: u })) : []; },
  async delete(r) { const s = namedStores.get(name); const u = typeof r === 'string' ? r : r.url; return s ? s.delete(u) : false; }
});
globalThis.caches = { async open(name) { return namedCache(name); } };
const packTile = new Request('https://tiles.basemaps.cartocdn.com/v/t/15/1/2.mvt');
namedStores.set('snowroute-offline-v1', new Map([[packTile.url, new Response('PACK-TILE', { status: 200 })]]));
fetchImpl = async () => { throw new Error('offline'); };
r = await mapFetch(packTile, null);
check('F-03 pack hit is served with the network down', (await r.text()) === 'PACK-TILE');
const floodStore = new Map();
for (let i = 0; i < 3010; i++) floodStore.set('https://tiles.basemaps.cartocdn.com/v/t/15/1/' + i + '.mvt', new Response('F'));
namedStores.set('snowroute-tiles-v1', floodStore);
fetchImpl = async () => new Response('FRESH-TILE', { status: 200 });
delete cacheFirst._n; // fresh worker: the eviction counter re-seeds from the flooded cache
for (let i = 0; i < 14; i++) await cacheFirst(new Request('https://tiles.basemaps.cartocdn.com/v/t/15/2/' + i + '.mvt'), 'snowroute-tiles-v1'); // 14 puts cross the seeded counter's first batch boundary (3025): the trim fires exactly there - between boundaries the cache may sit up to 24 over the cap by design (Beta 1.50 batching)
check('F-03 eviction trims the browsing cache back to its cap at the batch boundary', floodStore.size === 3000);
check('F-03 the pack entry survives browsing-cache eviction', namedStores.get('snowroute-offline-v1').has(packTile.url));
fetchImpl = async () => { throw new Error('offline'); };
r = await mapFetch(packTile, null);
check('F-03 pack hit still served after the eviction ran', (await r.text()) === 'PACK-TILE');

// 14a. Beta 1.285 (issue #175): the earliest glyph and sprite survive a browsing trim,
// and the glyph still answers a map request when the network is down.
const glyphReq = new Request('https://protomaps.github.io/basemaps-assets/fonts/Noto%20Sans%20Regular/0-255.pbf');
const spriteReq = new Request('https://protomaps.github.io/basemaps-assets/sprites/v4/light.png');
const mixedStore = new Map([
  [glyphReq.url, new Response('BROWSING-GLYPH')],
  [spriteReq.url, new Response('BROWSING-SPRITE')]
]);
for (let i = 0; i < 3010; i++) mixedStore.set('https://tiles.basemaps.cartocdn.com/v/t/15/1/' + i + '.mvt', new Response('TILE'));
namedStores.set('snowroute-tiles-v1', mixedStore);
delete cacheFirst._n;
fetchImpl = async () => new Response('FRESH-TILE');
// 3012 seeded entries plus 12 puts and the initial post-put increment reach 3025.
for (let i = 0; i < 12; i++) {
  await mapFetch(new Request('https://tiles.basemaps.cartocdn.com/v/t/15/2/' + i + '.mvt?v=1'), null);
}
check('#175 the oldest browsing glyph survives the trim', mixedStore.has(glyphReq.url));
check('#175 the oldest browsing sprite survives the trim', mixedStore.has(spriteReq.url));
const mixedTileCount = [...mixedStore.keys()].filter(url => url.includes('.mvt')).length;
check('#175 browsing vector tiles trim to exactly 3000 in the mixed cache', mixedTileCount === 3000);
fetchImpl = async () => { throw new Error('offline'); };
r = await mapFetch(glyphReq, null);
check('#175 the browsing glyph is still served offline', (await r.text()) === 'BROWSING-GLYPH');

// 15. Beta 1.96 (audit-2, N-2): a request in reload mode (the Download button's
// deliberate re-download, which fetches with cache:'reload') must BYPASS the
// pack and reach the network - before 1.96 mapFetch answered from the pack
// first, so re-downloading re-stored the pack's own responses and the pack
// could never refresh.
fetchImpl = async () => new Response('NETWORK-TILE', { status: 200 });
r = await mapFetch(new Request(packTile.url, { cache: 'reload' }), null);
check('N-2 a reload-mode request bypasses the pack and returns the network response', (await r.text()) === 'NETWORK-TILE');

// 16. Beta 1.170 (Carbon fix round Phase 2, C-07): the install handler -
// a failed shell fetch must FAIL the install (through 1.169 the add rode
// a swallowed catch and the worker activated with no HTML cached at
// all), and a good shell lands under BOTH the scope and
// scope + 'index.html' (the explicit-file launch).
{
  const iStart = sw.indexOf("self.addEventListener('install'");
  const iEnd = sw.indexOf('async function netFirst');
  const coreStart = sw.indexOf('const CORE = [');
  const coreEnd = sw.indexOf('];', coreStart) + 2;
  const shellStore = new Map();
  const shellCache = {
    async put(r, res) { const u = typeof r === 'string' ? r : r.url; shellStore.set(u, res); },
    async add(r) { const res = await fetch(r); if (!res || !res.ok) throw new Error('add failed'); shellStore.set(typeof r === 'string' ? r : r.url, res); },
    async keys() { return [...shellStore.keys()].map(url => ({ url })); },
    async delete(r) { return shellStore.delete(r.url); }
  };
  const handlers = {}; let skipped = false;
  globalThis.caches = { async open() { return shellCache; }, async keys() { return [shellCacheName]; } };
  globalThis.self = { registration: { scope: 'https://example.test/app/' }, addEventListener: (n, f) => { handlers[n] = f; }, skipWaiting: async () => { skipped = true; } };
  eval(constLine + '\n' + sw.slice(coreStart, coreEnd) + '\n' + sw.slice(iStart, iEnd));
  const runInstall = async () => { let wu = null, err = null; handlers.install({ waitUntil(p) { wu = p; } }); try { await wu; } catch (e) { err = e; } return err; };
  fetchImpl = async () => new Response('SHELL-HTML', { status: 200 });
  let err = await runInstall();
  check('C-07 install succeeds on a good shell fetch', err === null);
  check('C-07 shell cached under the scope', shellStore.has('https://example.test/app/'));
  check('C-07 shell cached under scope + index.html', shellStore.has('https://example.test/app/index.html'));
  check('C-07 skipWaiting follows a good install', skipped === true);
  // #171: activation keeps the install's shell and CORE entries before claiming clients.
  const installedKeys = [...shellStore.keys()];
  shellStore.set(shareNav.url, new Response('STALE'));
  shellStore.set(req.url + 'index.html?v=1', new Response('STALE'));
  // Takeover adjudication: the prune is NARROW - only shell-key variants go.
  // Legitimate non-shell residents of the shell cache (a same-origin asset
  // netFirst stored under its own URL, a non-CORE CDN file) must survive.
  const residentKeys = ['https://example.test/app/favicon.svg', 'https://cdn.jsdelivr.net/npm/other-lib@1/file.js'];
  for (const u of residentKeys) shellStore.set(u, new Response('RESIDENT'));
  let claimedKeys;
  self.clients = { async claim() { claimedKeys = [...shellStore.keys()]; } };
  let activation;
  handlers.activate({ waitUntil(p) { activation = p; } });
  await activation;
  check('#171 activation prunes only stray entries before claiming clients',
    claimedKeys?.length === 4 + residentKeys.length && installedKeys.every(url => claimedKeys.includes(url)));
  check('#171 activation keeps legitimate non-shell residents (narrow prune)',
    residentKeys.every(url => claimedKeys.includes(url)));

  shellStore.clear(); skipped = false;
  fetchImpl = async (r) => { const u = typeof r === 'string' ? r : r.url; if (u === 'https://example.test/app/') throw new Error('offline'); return new Response('LIB', { status: 200 }); };
  err = await runInstall();
  check('C-07 a failed shell fetch FAILS the install', err !== null);
  check('C-07 no skipWaiting after a failed install', skipped === false);
  // Beta 1.221 (webperf piece 6): a failed CORE (map library) fetch now fails
  // the install too - through 1.220 it was swallowed and the worker activated
  // holding a shell whose map library was never cached, so an offline launch
  // opened a page that could never draw its map.
  shellStore.clear(); skipped = false;
  fetchImpl = async (r) => { const u = typeof r === 'string' ? r : r.url; if (u.includes('cdn.jsdelivr.net')) throw new Error('offline'); return new Response('SHELL-HTML', { status: 200 }); };
  err = await runInstall();
  check('1.221 a failed CORE fetch FAILS the install', err !== null);
  check('1.221 no skipWaiting after a CORE-failed install', skipped === false);
  shellStore.clear(); skipped = false;
  fetchImpl = async (r) => { const u = typeof r === 'string' ? r : r.url; if (u.includes('cdn.jsdelivr.net')) return new Response('PORTAL', { status: 503 }); return new Response('SHELL-HTML', { status: 200 }); };
  err = await runInstall();
  check('1.221 a non-ok CORE answer FAILS the install', err !== null);
}

let fail = 0;
for (const [n, ok] of results) { console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
