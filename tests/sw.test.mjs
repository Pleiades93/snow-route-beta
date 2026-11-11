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
const cacheMock = {
  async match(r) { const u = typeof r === 'string' ? r : r.url; return store.get(u); },
  async put(r, res) { const u = typeof r === 'string' ? r : r.url; store.set(u, res); }
};
globalThis.caches = { async open() { return cacheMock; } };
globalThis.self = { registration: { scope: 'https://example.test/app/' } };

let fetchImpl = async () => { throw new Error('unset'); };
globalThis.fetch = (...a) => fetchImpl(...a);
let putThrows = false;
const origPut = cacheMock.put.bind(cacheMock);
cacheMock.put = async (r, res) => { if (putThrows) throw new Error('quota'); return origPut(r, res); };

const constLine = sw.split('\n').find(l => l.startsWith('const CACHE'));
eval(constLine + '\n' + fnSrc + '\nglobalThis.netFirst = netFirst; globalThis.cacheFirst = cacheFirst; globalThis.staleWhileRevalidate = staleWhileRevalidate; globalThis.mapFetch = mapFetch;');
const netFirst = globalThis.netFirst;
const cacheFirst = globalThis.cacheFirst;
const staleWhileRevalidate = globalThis.staleWhileRevalidate;
const mapFetch = globalThis.mapFetch;

const req = new Request('https://example.test/app/');
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
r = await netFirst(req, 'c');
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
r = await netFirst(navReq, 'c');
check('B03 stalled navigation falls back to cache', (await r.text()) === 'CACHED-SHELL');
check('B03 fallback is bounded (<20s)', Date.now() - t0 < 20000);

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
// it used to hang forever despite a cached copy. (This case takes ~11.5 s
// by design - it waits out the real bound. It sits before the seed section
// below replaces the caches mock.)
store.clear(); store.set(styleReq.url, cachedResp.clone());
fetchImpl = () => new Promise(() => {});
r = await netFirst(styleReq, 'c');
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
// DOWN, and the browsing cache's FIFO eviction (which trims
// snowroute-tiles-v1 to MAX_TILES) can never reach into the pack cache -
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
for (let i = 0; i < 3010; i++) floodStore.set('https://tiles.basemaps.cartocdn.com/flood/' + i, new Response('F'));
namedStores.set('snowroute-tiles-v1', floodStore);
fetchImpl = async () => new Response('FRESH-TILE', { status: 200 });
delete cacheFirst._n; // fresh worker: the eviction counter re-seeds from the flooded cache
for (let i = 0; i < 14; i++) await cacheFirst(new Request('https://tiles.basemaps.cartocdn.com/fresh/' + i), 'snowroute-tiles-v1'); // 14 puts cross the seeded counter's first batch boundary (3025): the trim fires exactly there - between boundaries the cache may sit up to 24 over the cap by design (Beta 1.50 batching)
check('F-03 eviction trims the browsing cache back to its cap at the batch boundary', floodStore.size === 3000);
check('F-03 the pack entry survives browsing-cache eviction', namedStores.get('snowroute-offline-v1').has(packTile.url));
fetchImpl = async () => { throw new Error('offline'); };
r = await mapFetch(packTile, null);
check('F-03 pack hit still served after the eviction ran', (await r.text()) === 'PACK-TILE');

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
  const iEnd = sw.indexOf("self.addEventListener('activate'");
  const coreStart = sw.indexOf('const CORE = [');
  const coreEnd = sw.indexOf('];', coreStart) + 2;
  const shellStore = new Map();
  const shellCache = {
    async put(r, res) { const u = typeof r === 'string' ? r : r.url; shellStore.set(u, res); },
    async add(r) { const res = await fetch(r); if (!res || !res.ok) throw new Error('add failed'); shellStore.set(typeof r === 'string' ? r : r.url, res); }
  };
  const handlers = {}; let skipped = false;
  globalThis.caches = { async open() { return shellCache; } };
  globalThis.self = { registration: { scope: 'https://example.test/app/' }, addEventListener: (n, f) => { handlers[n] = f; }, skipWaiting: async () => { skipped = true; } };
  eval(constLine + '\n' + sw.slice(coreStart, coreEnd) + '\n' + sw.slice(iStart, iEnd));
  const runInstall = async () => { let wu = null, err = null; handlers.install({ waitUntil(p) { wu = p; } }); try { await wu; } catch (e) { err = e; } return err; };
  fetchImpl = async () => new Response('SHELL-HTML', { status: 200 });
  let err = await runInstall();
  check('C-07 install succeeds on a good shell fetch', err === null);
  check('C-07 shell cached under the scope', shellStore.has('https://example.test/app/'));
  check('C-07 shell cached under scope + index.html', shellStore.has('https://example.test/app/index.html'));
  check('C-07 skipWaiting follows a good install', skipped === true);
  shellStore.clear(); skipped = false;
  fetchImpl = async (r) => { const u = typeof r === 'string' ? r : r.url; if (u === 'https://example.test/app/') throw new Error('offline'); return new Response('LIB', { status: 200 }); };
  err = await runInstall();
  check('C-07 a failed shell fetch FAILS the install', err !== null);
  check('C-07 no skipWaiting after a failed install', skipped === false);
}

let fail = 0;
for (const [n, ok] of results) { console.log((ok ? 'PASS' : 'FAIL') + '  ' + n); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
