// Snow Route service worker: lets the page open with NO
// signal, and re-uses map data already fetched (CARTO vector tiles,
// Protomaps glyphs/sprites/styles, CDN libraries). Host this file in
// the SAME folder as index.html, over https. Without it the page still works
// online. The activate step deletes this app's older caches (and, once, the
// pre-rename beta caches) so no stale page survives an update.
const CACHE = 'snowroute-shell-v1', TILES = 'snowroute-tiles-v1', OFFLINE = 'snowroute-offline-v1', MAX_TILES = 3000;   // App identity: own cache names - production and this app share an origin (same Pages domain), and 'snowroute-' does not match production's 'snow5w-' cleanup prefix, so neither app's worker can delete the other's caches. Beta 1.94 (audit F-03): OFFLINE is the downloaded map pack's own cache - mapFetch checks it FIRST for map data, and the browsing cache's FIFO eviction (MAX_TILES, in bumpTileCount) only ever receives the TILES cache, so the pack the operator downloaded can no longer be silently evicted by ordinary browsing. Beta 1.285 (issue #175): that FIFO counts and trims vector tiles only - see bumpTileCount.
// SEC-1 (external audit, 2026-10-27): the library files are cached ONLY
// through integrity-checked fetches. The old c.add(url) stored ANY ok
// response - a captive-portal page cached as maplibre-gl.js would then be
// refused by the page's own SRI on every load and never refetched:
// a permanent brick. The hashes below must match the page tags exactly;
// build-pages.py asserts that on every build and fails on drift.
const CORE = [
  ['https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css', 'sha384-MinO0mNliZ3vwppuPOUnGa+iq619pfMhLVUXfC4LHwSCvF9H+6P/KO4Q7qBOYV5V'],
  ['https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js', 'sha384-SYKAG6cglRMN0RVvhNeBY0r3FYKNOJtznwA0v7B5Vp9tr31xAHsZC0DqkQ/pZDmj']
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await Promise.all(CORE.map(async ([u, integrity]) => {
      const res = await fetch(new Request(u, { integrity, mode: 'cors' }));
      if (!res || !res.ok) throw new Error('core fetch failed during install: ' + u);
      await c.put(u, res);
    }));   // Beta 1.221 (webperf piece 6): a CORE failure is FATAL now, like the shell fetch below. Through 1.220 it was swallowed ('cache nothing, the page fetches live instead') - so an interrupted or integrity-failed first install still ACTIVATED, holding a shell whose map library was never cached: the next offline launch opened a page that could never draw its map. Install is all-or-nothing: any failure discards the worker (the previous one, if any, keeps serving; a first install retries on the next visit) and the page online is unaffected - it loads its libraries live either way.
    // Beta 1.170 (Carbon fix round Phase 2, C-07): the shell fetch is FATAL on failure and lands under TWO keys. Through 1.169 the add rode a swallowed catch, so a first install over a broken or portaled network still activated - a worker claiming offline capability while its shell cache held no HTML at all, and every later offline launch fell to Response.error(). A failed shell fetch now fails the install itself (the previous worker, if any, keeps serving; a first install simply retries on the next visit). The second key covers the explicit-file launch (scope + 'index.html') some launchers and shortcuts use.
    const shellRes = await fetch(new Request(self.registration.scope, { cache: 'reload' }));
    if (!shellRes || !shellRes.ok) throw new Error('app shell fetch failed during install');
    await c.put(self.registration.scope, shellRes.clone());
    await c.put(self.registration.scope + 'index.html', shellRes);
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // one-time cleanup: the two exact legacy names below are the pre-rename beta caches
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('snowroute-') || k === 'snow5wbeta1-shell-v1' || k === 'snow5wbeta1-tiles-v1') && k !== CACHE && k !== TILES && k !== OFFLINE).map(k => caches.delete(k))))
    .then(async () => {
      // Beta 1.285 (issue #171): prune QUERY-KEYED variants of the two shell keys (scope?…, index.html?…) left behind by pre-1.285 launches. Under the old ignoreSearch lookups such an entry sat ahead of the canonical key in insertion order and won every offline or slow launch with a frozen build; netFirst now matches the exact scope key, and this prune removes the poison outright. ONLY shell-key variants are pruned: the CORE library URLs and the entries netFirst stores under their own URLs (manifest, icons, launch images) are legitimate residents of this cache and stay.
      const scope = self.registration.scope;
      const bare = u => { const p = new URL(u); p.search = ''; return p.href; };
      const c = await caches.open(CACHE);
      await Promise.all((await c.keys()).filter(r => { const b = bare(r.url); return (b === scope || b === scope + 'index.html') && r.url !== b; }).map(r => c.delete(r)));
    })
    .then(() => self.clients.claim()));
});
async function netFirst(r, cacheName, ev) {   // fresh when the network answers fast, cached otherwise
  const c = await caches.open(cacheName);
  const shell = cacheName === CACHE && r.mode === 'navigate' ? self.registration.scope : null;
  const matchCached = () => shell ? c.match(shell) : c.match(r, { ignoreSearch: true });
  const storeShell = res => Promise.all([
    c.put(shell, res.clone()).catch(() => {}),
    c.put(shell + 'index.html', res.clone()).catch(() => {})
  ]);
  let fp; try { fp = fetch(r); } catch (e) { fp = Promise.reject(e); }   // a synchronous throw becomes a rejection the fallback below already handles
  let res = null, netErr = false, timedOut = false;
  const TIMEOUT = Symbol('timeout');
  try { const w = await Promise.race([fp, new Promise(done => setTimeout(() => done(TIMEOUT), 2000))]); if (w === TIMEOUT) timedOut = true; else res = w; }
  catch (e) { netErr = true; }   // the network answered with a rejection (offline, DNS, reset): straight to the cache fallback below, as before
  if (timedOut && shell) {
    // Beta 1.221 (webperf piece 6): a NAVIGATION that has not answered in 2 s checks the cache NOW instead of waiting out the old second race (3.5 s + 5 s = ~8.5 s before an installed app opened on a hanging connection). A cached shell is served at once and the SAME fetch keeps running in the background - bound to the fetch event's lifetime where the caller passed it - so a genuinely new version still lands in the cache for the next launch, and the page's own update check (network-only probe + forced reload) is untouched. With NOTHING cached there is no shell to serve, so the bounded wait stays: a further 5 s for the real answer (SEC-7's slow-network respect, ~7 s worst case, down from ~8.5 s).
    // Beta 1.285 (issue #171): the shortcut matches the scope key EXACTLY - the old ignoreSearch lookup returned the first insertion-order match, so an older query-keyed entry won over the current shell.
    const early = await matchCached().catch(() => undefined);
    if (early) {
      const bg = fp.then(late => { if (late && late.ok) return storeShell(late); }).catch(() => {}); // Beta 1.221 gate fix (Codex P2, PR #98): the refresh lands under the CANONICAL shell keys (the install's two), so a query-bearing launch refreshes the shell the next launch reads
      if (ev) { try { ev.waitUntil(bg); } catch (err) {} }
      return early;
    }
    try { res = await Promise.race([fp, new Promise((_, j) => setTimeout(() => j(new Error('stalled')), 5000))]); } catch (e2) { netErr = true; }
  } else if (timedOut) {   // Beta 1.64 (audit F09): non-navigations keep their bounded wait - 8 s still honours a slow-but-working network before the cache fallback engages; a never-settling fetch used to hang a map JSON request forever despite a cached copy
    try { res = await Promise.race([fp, new Promise((_, j) => setTimeout(() => j(new Error('stalled')), 8000))]); } catch (e2) { netErr = true; }
  }
  try {
    if (res && res.ok) {
      // Beta 1.285 (issue #171): a fast shell navigation refreshes BOTH canonical keys and never stores under its own URL - the old put under the request URL is what created the query-keyed entries (a launch carrying ?share=, ?utm… froze that build into the cache).
      try {
        if (shell) await storeShell(res);
        else await c.put(r, res.clone());
      } catch (e) {}   // NEW-02 (audit 5): a failed cache write must never sink a good response or escape as an unhandled rejection
      return res;
    }
    // Server answered with an error status (503 etc.): prefer a good cached copy
    // (BUG-03, ChatGPT audit #2) - surface the error only when nothing is cached.
    // The app-shell fallback applies ONLY to page navigations (ISSUE-03,
    // audit #2): a map style or data request must never be handed HTML.
    // Beta 1.285 (issue #171): the error fallback reads the exact scope key for a shell navigation - it answers query-bearing and explicit-file launches alike and no stale variant can be picked. (Beta 1.170's C-07 ignoreSearch scope match is superseded: exact matching is safe now because install and every refresh write the canonical keys.)
    const hitErr = await matchCached();
    return hitErr || res || Response.error();   // res is null exactly when the network failed outright (netErr) and nothing is cached
  } catch (e) {
    const hit = await matchCached();
    return hit || Response.error();
  }
}
async function updNav(r, cacheName) {   // Beta 1.221 gate fix (Codex P2, PR #98): the Settings Update reload's OWN path. The probe has already confirmed a newer version on the server; the reload navigation must LOAD it, not race it - under netFirst's 2 s navigation shortcut a slower answer served the OLD cached shell for that launch, and the background refresh stored the new one under the timestamped ?v= key, leaving the canonical shell stale. An updnav navigation waits for the network (bounded at 10 s), stores the answer under the canonical shell keys (the install's two), and only a failed or errored network falls back to the cached shell - an update reload must never strand him on a browser error page.
  const c = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(r), new Promise((_, j) => setTimeout(() => j(new Error('updnav stalled')), 10000))]);
    if (res && res.ok) {
      try { await c.put(self.registration.scope, res.clone()); await c.put(self.registration.scope + 'index.html', res.clone()); } catch (e) {}   // a failed cache write must not sink the fresh shell he is about to run
      return res;
    }
    const hit = await c.match(self.registration.scope).catch(() => undefined);   // BUG-03 discipline: an error status prefers the cached shell
    return hit || res;
  } catch (e) {
    const hit = await c.match(self.registration.scope).catch(() => undefined);
    return hit || Response.error();
  }
}
async function bumpTileCount(c) { // Beta 1.57 (second audit, item 2): the 1.50 batched-eviction counter lived only in worker memory - iOS stops the worker constantly, resetting it, so the trim check could go long stretches without ever firing and the tile cache drifted past its cap. On the first cache-first browsing put after a wake, seed the counter from the full post-put cache size. The counter schedules checks every 25 increments.
  if (cacheFirst._n === undefined) { try { cacheFirst._n = (await c.keys()).length; } catch (e) { cacheFirst._n = 0; } }
  cacheFirst._n++;
  if (cacheFirst._n % 25 === 0) {
    // Beta 1.285 (issue #175): the cap counts VECTOR TILES ONLY. Glyph ranges (.pbf), sprites and style JSON share this cache but are never evicted: a cache hit does not re-insert an entry, so a glyph range fetched on the first map view stayed oldest and was evicted after ~3000 newer entries - and in MapLibre a failed glyph fetch rejects the whole tile parse, blanking labelled tiles offline. CLASSIFICATION RISK: tiles are recognised by the provider's '.mvt' URL suffix - a provider or tile-format change must update this filter and re-verify it (tests/sw.test.mjs case 14a), or tiles will silently stop being trimmed (or worse, non-tiles start being evicted again).
    const tiles = (await c.keys()).filter(key => new URL(key.url).pathname.endsWith('.mvt'));
    for (let i = 0; i < tiles.length - MAX_TILES; i++) await c.delete(tiles[i]);
  }
}
async function cacheFirst(r, cacheName, e) {
  const c = await caches.open(cacheName);
  const hit = await c.match(r.url || r);
  if (hit) return hit;
  if (cacheName === TILES) {
    // SEC-6d: refetch map data with CORS so the status is VISIBLE - an error
    // page must never be cached as if it were a tile (opaque no-cors responses
    // hid the status and got stored). Uncacheable answers pass through live.
    try {
      const res = await fetch(new Request(r.url, { mode: 'cors' }));
      if (res && res.ok) {
        const write = (async () => { // the cache copy lands in the background: the tile serves now, the write and the eviction check finish under the fetch event's waitUntil (an eventless caller still awaits them)
          try {
            await c.put(r.url, res.clone());
            await bumpTileCount(c); // Beta 1.50/1.57: batched eviction check (see bumpTileCount)
          } catch (err) {}
        })();
        if (e) { try { e.waitUntil(write); } catch (err) {} } else await write;
      }
      return res;
    } catch (e) {
      try { return await fetch(r); } catch (e2) { return Response.error(); }
    }
  }
  try {
    const res = await fetch(r);
    if (res && res.ok) { // Beta 1.57 (second audit, item 3): opaque responses are no longer cached here - their status is unknowable, so an error page could be stored as if it were the asset (the tile branch has refused them since SEC-6d; MapLibre arrives via CORS + SRI, so nothing legitimate needs this)
      try {
        await c.put(r.url || r, res.clone());
        if (cacheName === TILES) await bumpTileCount(c); // Beta 1.50/1.57: batched eviction check, as above
      } catch (e) {}   // a failed cache write must not sink a good network response
    }
    return res;
  } catch (e) {
    return Response.error();
  }
}
async function staleWhileRevalidate(r, cacheName, e) {   // Beta 1.41: answer from cache at once, refresh it in the background - for assets whose URL is not versioned (the sprite sheets), where pure cache-first would freeze them forever and netFirst makes a theme flip wait out a network race
  const c = await caches.open(cacheName);
  const hit = await c.match(r);
  const np = fetch(r).then(res => { if (res && res.ok) c.put(r, res.clone()).catch(() => {}); return res; }).catch(() => null);
  if (hit) { if (e) { try { e.waitUntil(np); } catch (err) {} } return hit; } // Beta 1.48 (audit B07): bind the background refresh to the fetch event's lifetime - unbound, the worker may sleep before the cache update lands
  const res = await np;
  return res || Response.error();
}
async function mapFetch(r, e) { // Beta 1.94 (audit F-03): map data is served from the offline pack cache FIRST - a pack hit needs no network and no strategy race. Only a pack miss falls through to the per-kind strategies in the browsing cache, exactly as before 1.94.
  if (r.cache === 'reload') { try { return await fetch(r); } catch (err) { return Response.error(); } } // Beta 1.96 (audit-2, N-2): a reload-mode request (the Download button's deliberate re-download fetches with cache:'reload') bypasses the pack AND the browsing strategies and goes straight to the network - otherwise a re-download re-stores the pack's own responses and the pack can never refresh. No cache write here: the downloading page stores the fresh response into the pack itself
  const oc = await caches.open(OFFLINE);
  const pack = await oc.match(r.url || r);
  if (pack) return pack;
  const u = new URL(r.url);
  if (u.pathname.includes('/sprites/') && u.pathname.endsWith('.json')) return staleWhileRevalidate(r, TILES, e);
  if (u.pathname.endsWith('.json') || u.pathname.includes('/styles/')) return netFirst(r, TILES);
  return cacheFirst(r, TILES, e);
}
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === self.location.origin && u.pathname.includes('/packs/')) return; // Beta 1.123: the city street packs (packs/*.json) are NETWORK-ONLY - the worker does not intercept them at all. The generic same-origin branch below (netFirst into the shell cache) would otherwise store multi-megabyte JSON beside the app page AND serve a stale cached copy whenever the server answers an error status - a removed or broken pack must read as a failure, because that failure is exactly the signal the create flow's grid fallback keys on. Not the tile cache, not the offline pack: straight to the network, and offline it simply fails.
  const mapHost = u.hostname === 'tiles.basemaps.cartocdn.com' || u.hostname === 'protomaps.github.io'; // Beta 1.33: Protomaps tiles (CARTO-hosted) + glyphs/sprites; the styles themselves are embedded in the page
  if (u.origin === self.location.origin && u.searchParams.has('updprobe')) { e.respondWith(fetch(r)); return; } // Beta 1.150 (security-audit fix round, finding update-check-reports-cached-copy-as-server-copy): the Settings update check must hear the SERVER, not this worker - the generic same-origin branch below (netFirst) substitutes the cached shell on any error status, rejection or stall, so the check reported 'Up to date' from the cache when the server never answered. A probe request is answered by the network itself or fails as a network error, and its response is never cached
  if (u.origin === self.location.origin && u.searchParams.has('updnav')) { e.respondWith(updNav(r, CACHE)); return; } // Beta 1.221 gate fix (Codex P2, PR #98): the Update reload navigation carries updnav - it follows the probe's confirmation, so it takes updNav's network path (see updNav), never netFirst's early cached serve
  if (mapHost) e.respondWith(mapFetch(r, e));
  else if (u.hostname === 'unpkg.com' || u.hostname === 'cdn.jsdelivr.net') e.respondWith(cacheFirst(r, CACHE));
  else if (r.mode === 'navigate' || u.origin === self.location.origin) e.respondWith(netFirst(r, CACHE, e));
});
