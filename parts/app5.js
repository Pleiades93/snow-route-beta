function renderAbout() {
  const cur = $('ver').textContent.trim();
  $('wnHead').textContent = "WHAT'S NEW · " + cur; // the header names the live version from the title's element: never a second hard-coded copy to go stale
  const list = $('wnList'); list.innerHTML = '';
  for (const item of WHATSNEW.items) { const d = document.createElement('div'); d.className = 'm-wnItem'; const dot = document.createElement('span'); dot.className = 'm-wnDot'; dot.innerHTML = '&middot;'; const tx = document.createElement('span'); tx.textContent = item; d.appendChild(dot); d.appendChild(tx); list.appendChild(d); } // exactly one version block: the current release's items directly under the header, no older-version subheads (1.114)
}
$('aboutBtn').addEventListener('click', () => { renderAbout(); showSetPane('setAboutPane'); });
$('aboutBack').addEventListener('click', () => showSetPane('setMainPane'));

// click-away closes open menus; a dialog's backdrop tap is its Cancel (a plain hide, nothing committed)
document.addEventListener('pointerdown', e => {
  const anySheet = !!document.querySelector('.sheet.open'); // any open sheet, read from the DOM: a hand-listed pair once missed one and the tap fell through
  // the tap is spent here, never reaching the map; the confirmation's backdrop is exempt - dismissal stays buttons-only
  if (anySheet && !e.target.closest('.sheet') && !e.target.closest('#hud') && !e.target.closest('.modal') && !e.target.closest('#confirmPill') && !e.target.closest('#confirmBackdrop')) { closeSheets(); spendTap(400); }
});
['finModal', 'noteModal'].forEach(id => { const mEl = $(id); mEl.addEventListener('pointerdown', e => { if (e.target === mEl) hideSurface(mEl); }); });
// div rows never enter :active in some browsers: they take the press shrink through this class instead
let pressRowEl = null;
const pressRowOff = () => { if (pressRowEl) { pressRowEl.classList.remove('pressOn'); pressRowEl = null; } };
document.addEventListener('pointerdown', e => {
  pressRowOff();
  if (e.target.closest('button')) return;
  const row = e.target.closest('.srow, .crPRow, .cvRow, .prow.histRow');
  if (row) { pressRowEl = row; row.classList.add('pressOn'); }
});
document.addEventListener('pointerup', pressRowOff);
document.addEventListener('pointercancel', pressRowOff); // a scroll takeover cancels the pointer - the row must not stay shrunk
window.addEventListener('blur', pressRowOff);
// the minimum press: openers fire on release, never before 150 ms (the shrink's duration); a drag fires nothing
const OPEN_MIN_MS = 150;
const OPEN_ID_SEL = '#streetsBtn, #paceBtn, #routesBtn, #setBtn, #selNote, #rmChoose, #rmCreate, #rmBack, #rmBack2, #setBack, #jobBtn, #jobBack, #chimeRow, #chimeBack, #stBtn, #statusBack, #aboutBtn, #aboutBack, #exportBtn, #xRes, #xImpText, #crDoorList, #crDoorManual, #rmCityListBack, #crCityBack, #crCityChange, #pvStartOverBtn, #pvSaveBtn, #crNameBack, #crDoneBtn, #crReviewBtn, #pvAddBtn';
const OPEN_ROW_SEL = '.srow, .crPRow, .prow.histRow';
// exempt: the row's handler focuses the editor synchronously, and iOS raises the keyboard only inside the real gesture
const OPEN_FOCUS_EXEMPT_SEL = '.srow';
let openPressRec = null, openPendingEl = null, openPendingTimer = 0;
/** @param {any} t @returns {Element | null} */
const openerElOf = t => { // the opener a press belongs to, or null
  if (!t || !t.closest) return null;
  const btn = t.closest('button');
  const el = btn ? (btn.matches(OPEN_ID_SEL) ? btn : null) : t.closest(OPEN_ID_SEL + ', ' + OPEN_ROW_SEL);
  return el && el.matches(OPEN_FOCUS_EXEMPT_SEL) ? null : el; // a focus-exempt opener's press is no press to the gate: its click proceeds synchronously
};
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const el = openerElOf(e.target);
  if (el && el === openPendingEl) { clearTimeout(openPendingTimer); openPendingTimer = 0; openPendingEl = null; } // a fresh press on the same element supersedes its pending open
  openPressRec = el ? { el, t: performance.now(), x: e.clientX, y: e.clientY, moved: false } : null;
}, true);
document.addEventListener('pointermove', e => { if (openPressRec && (Math.abs(e.clientX - openPressRec.x) > 10 || Math.abs(e.clientY - openPressRec.y) > 10)) openPressRec.moved = true; }, true);
document.addEventListener('pointercancel', () => { openPressRec = null; }, true);
document.addEventListener('click', e => {
  const rec = openPressRec; openPressRec = null;
  if (!rec) return;
  if (openerElOf(e.target) !== rec.el) return;
  if (rec.moved) { e.stopPropagation(); e.preventDefault(); return; } // the press became a drag/scroll: no open fires from it
  const wait = OPEN_MIN_MS - (performance.now() - rec.t);
  if (wait <= 0) return; // held past the floor: the real click proceeds untouched
  e.stopPropagation(); e.preventDefault();
  openPendingEl = rec.el;
  openPendingTimer = setTimeout(() => { openPendingTimer = 0; openPendingEl = null; rec.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }, wait);
}, true);
function applyNight() { // the swap is instant: the guard suppresses transitions while the class flips, so colours step in one frame
  const de = document.documentElement; de.classList.add('theme-swap');
  document.body.classList.toggle('night', isNight()); const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', isNight() ? '#14171d' : '#eceff2');
  $('nightBtn').innerHTML = nightBtnHTML(); renderIcons();
  void de.offsetWidth; // the flush: the flipped theme's styles commit now, transition-free
  const lift = () => de.classList.remove('theme-swap');
  requestAnimationFrame(lift); setTimeout(lift, 150);
} // the button shows where it takes you (day offers Night, night offers Day); the icon flips, no label
$('nightBtn').addEventListener('click', ev => { if (!tapGuard('nightBtn', ev)) return; setThemeOverride(!isNight()); applyNight(); setBasemap(); }); // a session override only: the sun takes over at the next sunrise/sunset or full app open
function goHomeView() { // view: the flat fit tilted to 45 at its centre/zoom; folding tilt into the fit changes the zoom
  if (!routeBox) return;
  const b = [[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]];
  let fit = null; try { fit = map.cameraForBounds(b, { padding: 28 }); } catch (e) {}
  if (fit && fit.center && typeof fit.zoom === 'number') { try { map.easeTo({ center: fit.center, zoom: fit.zoom, pitch: 45, bearing: 0 }); return; } catch (e) {} }
  try { map.fitBounds(b, { padding: 28 }); map.jumpTo({ pitch: 45, bearing: 0 }); } catch (e) {}
}
$('homeBtn').addEventListener('click', ev => { if (!tapGuard('homeBtn', ev)) return; if (!routeBox) return; goHomeView(); }); // no route loaded (or an empty pack): no box to frame
// ===== SERVICE WORKER + BOOT =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => { window.__swErr = (e && e.name) || 'error'; }); // a refused registration records why: the preload refuses to run without the worker and can say why
  void (async () => {
    const reloadKey = 'snowroute.bootUpdateReloaded';
    try {
      if (sessionStorage.getItem(reloadKey)) return;
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      reg.update().catch(() => {});
      const probe = new AbortController();
      const timeout = setTimeout(() => probe.abort(), 1500);
      try {
        const served = parseVerLabel(await probeServedVer(probe.signal));
        const running = parseVerLabel($('ver').textContent);
        if (served && running && (served[0] > running[0] || (served[0] === running[0] && served[1] > running[1]))) {
          sessionStorage.setItem(reloadKey, '1');
          location.replace(location.pathname + '?updnav=1&v=' + Date.now());
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {}
  })();
  // ask to exempt this origin's data from eviction; the answer is recorded and surfaced by the Status row
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist().then(v => { storagePersist = (v === true); }).catch(() => {}); } catch (e) {} }
  // a first boot is not worker-controlled and caches nothing: once controlled, warm both style files through the worker
  window.__warm = 'pending';
  navigator.serviceWorker.ready.then(async () => {
    try {
      // 'ready' can resolve before page control; a fetch in that gap caches nothing - wait for control
      if (!navigator.serviceWorker.controller) await Promise.race([
        new Promise(res => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true })),
        new Promise(res => setTimeout(res, 3000))]);
      // both styles are embedded in the page (pmstyles.js): a first install is offline-ready by construction
      window.__warm = 'embedded';
      // pre-warm the other theme's sprites: a flip's only network fetch, so the first flip never waits
      try { const otherKey = isNight() ? 'day' : 'night'; const oSpr = GL_STYLES[otherKey] && (Array.isArray(GL_STYLES[otherKey].sprite) ? GL_STYLES[otherKey].sprite[0].url : GL_STYLES[otherKey].sprite); if (oSpr) { window.__spriteWarm = otherKey; for (const suf of ['.json', '.png', '@2x.json', '@2x.png']) fetch(oSpr + suf).catch(() => {}); } } catch (e) {}
    } catch (e) { window.__warm = 'error:' + (e && e.message || e); }
  }).catch(() => { window.__warm = 'no-worker'; });
}
// packs in the browsing cache can be evicted: copy them into the pack cache; a flag ends the migration
const PACKMIG_KEY = 'snowroute.v5.packmig';
const PACKMIG_CENSUS_KEY = 'snowroute.v5.packmigcensus'; // the partial-pack recognition record migratePack persists (see its recognition path)
let packWriteChain = Promise.resolve(); async function takePackWriteTurn() { if (navigator.locks && navigator.locks.request) { let release; const held = new Promise(res => { release = res; }); let acquired; const acq = new Promise(res => { acquired = res; }); let lockFailed = false; const done = navigator.locks.request('snowroute-pack-write', async () => { acquired(); await held; }); done.catch(() => { lockFailed = true; acquired(); }); await acq; if (!lockFailed) return release; } let release; const held = new Promise(res => { release = res; }); const prev = packWriteChain; packWriteChain = prev.then(() => held); await prev; return release; } // Beta 1.183 (Codex P2, PR #21): the pack has TWO writers - this download (the xPre handler above) and migratePack's boot heal - and ONE deleter, the Status pane's stDel, which takes the same turn since the C-02 fix (2026-11-15): it weighs nothing and writes nothing, but deleting the cache under a writer strands that writer's writes in a detached cache it can still confirm against - and a byte budget is only SHARED if they take turns: each writer censuses the pack when its own turn starts, so serialized writers see each other's finished writes in their census and account against the true total; two writers holding independent snapshots could each pass the cap check and together overshoot it. A turn is held for the writer's whole run and released in its finally. The turn is a WEB LOCK (navigator.locks) whenever the platform offers one: the lock is origin-wide, so two tabs of this app writing the same shared pack cache serialize as well - a per-page chain alone could not do that (Codex P2, PR #21) - and where Web Locks do not exist (older engines) the in-page promise chain is the fallback and the budget is shared within the page only. Either way a dead page takes its turn with it (the platform releases a Web Lock when its holder's context dies; the chain is page memory), so no stale lock can persist.
function packMigFingerprint(list) { // the flag is a fingerprint of the manifest it certifies: a changed list means the full pass runs again
  let h = 0; const s = list.join('\n');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return 'v1:' + list.length + ':' + (h >>> 0).toString(36);
}
function packCensusFingerprint(urls) { return packMigFingerprint([...urls].sort()); } // a stored pack's key-set fingerprint: the manifest fingerprint of the sorted set, so set equality is one string compare
function anyPreloadRecord() { // ever downloaded under any route? Every route's own record is the test; the active route's alone misses others
  return ROUTE_PACKS.some(p => !!parseJ(lsGet(routeKeys(p.id).pre), null));
}
async function migratePack() { let migRelease = () => {}; // the move, honestly: only manifest entries migrate, strays are pruned, and the flag sets only after verification
  try {
    migRelease = await takePackWriteTurn(); if (!('caches' in window)) return { ok: false, why: 'nocache' };
    const list = preloadUrlList();
    const fp = packMigFingerprint(list);
    const want = new Set(list.map(u => { try { return new URL(u).href; } catch (e) { return u; } })); // keys are URL-normalized (%20-encoded): the prune compares like with like, or it deletes the pack's own glyphs
    if (!anyPreloadRecord()) { // no pack was ever downloaded on this install (under any route - see anyPreloadRecord)
      let evidence = false; // Record gate exception: an all-manifest recordless pack is an interrupted first download; off-manifest keys are a deleted route's leftover
      try { const ocG = await caches.open('snowroute-offline-v1'); const gk = await ocG.keys(); evidence = gk.length > 0 && gk.every(rq => want.has(rq.url)); } catch (e) {}
      if (!evidence) return { ok: true, skipped: true };
    }
    if (lsGet(PACKMIG_KEY) === fp) { try { const ocF = await caches.open('snowroute-offline-v1'); if ((await ocF.keys()).length === list.length) return { ok: true, skipped: true, fast: true }; } catch (e) { /* a census that cannot run proves nothing - fall through to the full pass */ } } // Beta 1.96 (SR-195-03): the FAST PATH - 1.95 wrote the completion flag and never read it, so every boot with a preload record re-ran the full ~1,800-match verification sweep. The flag is now read, and believed only with a cheap census agreeing (exactly the manifest's count in the pack); any doubt - flag absent or stale, count off - runs the full pass below, which also HEALS a shrunken pack from the browsing cache
    if (lsGet(PACKMIG_KEY) === fp) { // Recognition: census and key set unchanged, nothing healable waiting - the partial pack skips without weighing a byte
      const cen = parseJ(lsGet(PACKMIG_CENSUS_KEY), null);
      if (cen && cen.fp === fp && cen.n < list.length) {
        try {
          const ocR = await caches.open('snowroute-offline-v1'); const rk = await ocR.keys(); const rUrls = rk.map(r => r.url);
          if (rk.length === cen.n && cen.set === packCensusFingerprint(rUrls)) {
            const have = new Set(rUrls); const tcR = await caches.open('snowroute-tiles-v1'); let healable = false;
            for (const u of list) { let h = u; try { h = new URL(u).href; } catch (e) {} if (!have.has(h) && (await tcR.match(u))) { healable = true; break; } }
            if (!healable) return { ok: true, skipped: true, fast: true, partial: true };
          }
        } catch (e) { /* a census that cannot run proves nothing - fall through to the full pass */ }
      }
    }
    const oc = await caches.open('snowroute-offline-v1');
    const tc = await caches.open('snowroute-tiles-v1');
    let pruneOk = true;
    for (const rq of await oc.keys()) { if (!want.has(rq.url)) { try { await oc.delete(rq.url); } catch (e) { pruneOk = false; /* a stray that will not delete is inert - the pack still serves the manifest; Beta 1.96 (SR-195-07): the failure is REPORTED in the status now, not swallowed - copies are the readiness question, the prune is maintenance */ } } } // Beta 1.183 (Codex P2, PR #21): the prune runs FIRST - obsolete entries counted toward the heal budget below could refuse every copy and return before this loop ever ran, leaving their space unreclaimable on every boot; freed space counts toward the budget
    // the budget binds here too: a copy crossing OFFLINE_PACK_CAP_BYTES counts as failed (flag unset, next boot retries)
    let failed = 0, migBytes = 0, unweighed = false; try { for (const req of await oc.keys()) { try { const r0 = await oc.match(req); if (r0) migBytes += (await r0.blob()).size; } catch (e) {} } } catch (e) {}
    for (const u of list) {
      if (await oc.match(u)) continue;
      const hit = await tc.match(u);
      if (!hit) continue; // exists in neither cache - nothing to migrate (a re-download rebuilds the pack directly)
      let hSz = -1; try { hSz = (await hit.clone().blob()).size; } catch (e) {} if (hSz >= 0 && migBytes + hSz > OFFLINE_PACK_CAP_BYTES) failed++; else { try { await oc.put(u, hit); if (hSz >= 0) migBytes += hSz; else unweighed = true; } catch (e) { failed++; } }
    }
    if (failed > 0) return { ok: false, failed };
    for (const u of list) { if (!(await oc.match(u)) && (await tc.match(u))) return { ok: false, why: 'verify' }; } // verify BEFORE the flag: everything recoverable must be in the pack cache
    const flagOk = lsSet(PACKMIG_KEY, fp); // the flag write is checked: the fast path believes it, so an unpersisted flag must not report complete
    if (flagOk) { // A still-partial pack persists its census for recognition; a completed pack deletes it; an unweighed copy persists nothing
      try {
        const fk = await oc.keys();
        if (fk.length >= list.length) lsDel(PACKMIG_CENSUS_KEY);
        else if (!unweighed) lsSet(PACKMIG_CENSUS_KEY, JSON.stringify({ fp, set: packCensusFingerprint(fk.map(r => r.url)), n: fk.length, bytes: migBytes }));
      } catch (e) {}
    }
    return { ok: flagOk, flag: flagOk ? fp : null, pruneOk };
  } catch (e) { return { ok: false, why: String((e && e.message) || e) }; } finally { migRelease(); }
}
// migratePack() runs from create.js after mergeUserPacks (here the manifest would miss created packs); offsets follow the live report while typing
let fullH = 0;
const inStandalone = () => !!(window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
function syncViewport() {
  try {
    const vv = window.visualViewport; if (!vv) return;
    const de = document.documentElement;
    const kb = document.body.classList.contains('kb');
    if (kb) return; // while typing, layout variables freeze at pre-keyboard values: the keyboard overlays the app instead of resizing it
    if (!kb && vv.height > fullH) fullH = vv.height;
    if (!kb && inStandalone() && window.innerHeight >= window.innerWidth && window.screen.height > fullH) fullH = window.screen.height;
    const t = vv.offsetTop, h = vv.height, b = Math.max(0, window.innerHeight - t - h); // the live report rules: the document-height floor guarantees the full stage (the browser's sizing, not an app override)
    de.style.setProperty('--vvt', t + 'px');
    de.style.setProperty('--vvh', h + 'px');
    de.style.setProperty('--vvb', b + 'px');
    // Android only: the settled height publishes over a short report while the window still spans the settled height
    if (DP_ANDROID && !kb && inStandalone() && fullH > h && window.innerHeight >= fullH - 2) { de.style.setProperty('--vvh', fullH + 'px'); de.style.setProperty('--vvb', Math.max(0, window.innerHeight - t - fullH) + 'px'); }
    const ae = document.activeElement;
    if ((!ae || (ae.tagName !== 'TEXTAREA' && ae.tagName !== 'INPUT')) && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
    if (typeof map !== 'undefined' && map) { const mc = map.getContainer(); const mw = mc.clientWidth, mh = mc.clientHeight; if (mw !== syncViewport._w || mh !== syncViewport._h) { syncViewport._w = mw; syncViewport._h = mh; map.resize(); } } // Beta 1.50 (audit P10): this fires on every visual-viewport scroll tick - only pay for a map resize when the container actually changed size
  } catch (e) { /* map/viewport not up yet */ }
}
if (window.visualViewport) { window.visualViewport.addEventListener('resize', syncViewport); window.visualViewport.addEventListener('scroll', syncViewport); }
window.addEventListener('resize', syncViewport);
// keyboard state: while a field has focus, sheets stop resizing; on close, release only once the height settles
let kbSettle = null;
let kbInSettle = null, kbShiftHost = null, kbVisH = -1, kbShiftPx = 0;
document.addEventListener('focusin', e => {
  if (!e.target.matches('textarea, input')) return;
  if (kbSettle) { clearInterval(kbSettle); kbSettle = null; }
  if (kbShiftHost) { kbShiftHost.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; }
  document.body.classList.add('kb');
  // once settled, surface the field above the keyboard: scroll the list or shift the card, never resize
  if (kbInSettle) clearInterval(kbInSettle);
  // unchanged samples do not prove settlement (iOS reports full height early): conclusion requires an observed drop
  let lastH = -1, stable = 0, sawDrop = false; const t0 = Date.now(); const h0 = window.visualViewport ? window.visualViewport.height : 0;
  const step = () => {
    const vv = window.visualViewport; const h = vv ? vv.height : 0;
    if (h0 && h < h0 - 20) sawDrop = true;
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
    if ((sawDrop && stable >= 2) || Date.now() - t0 > 700) { clearInterval(kbInSettle); kbInSettle = null; ensureFieldVisible(); }
  };
  kbInSettle = setInterval(step, 80); step();
});
function ensureFieldVisible() { // a covered field surfaces locally (list scroll or card shift, cleared at leave): the layout stays frozen
  try {
    const ae = document.activeElement; if (!ae || (ae.tagName !== 'TEXTAREA' && ae.tagName !== 'INPUT')) return;
    const vv = window.visualViewport; if (!vv) return;
    kbVisH = vv.height;
    const floor = vv.height - 8; // the visible bottom edge while the keyboard is up
    const r = ae.getBoundingClientRect();
    if (r.bottom <= floor && r.top >= 0 && !kbShiftHost) return; // with a shift already applied, fall through: the host branch may need to grow, shrink or clear it
    const sb = $('sheetBody');
    if (sb && sb.contains(ae)) {
      if (r.bottom > floor) sb.scrollTop += (r.bottom - floor) + 12;
      else if (r.top < sb.getBoundingClientRect().top) sb.scrollTop -= (sb.getBoundingClientRect().top - r.top) + 12;
      return;
    }
    const host = ae.closest('#selPop, .modal .card');
    if (host) { const rawBottom = r.bottom + (host === kbShiftHost ? kbShiftPx : 0); if (rawBottom > floor) { const over = Math.ceil(rawBottom - floor) + 12; host.style.transform = 'translateY(' + (-over) + 'px)'; kbShiftHost = host; kbShiftPx = over; } else if (host === kbShiftHost) { host.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; } } // Beta 1.70 (audit A02): measure from the UNSHIFTED rect (the tracked shift added back) - the old code measured the already-shifted card and replaced its shift with a smaller one, dropping the field back under a grown keyboard
  } catch (e) { /* visibility is best-effort; the layout never depends on it */ }
}
// while open, a material resize re-runs the visibility check (layout frozen; only the local scroll/shift re-evaluates)
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
  if (!document.body.classList.contains('kb') || kbInSettle) return;
  const h = window.visualViewport.height;
  if (kbVisH >= 0 && Math.abs(h - kbVisH) > 4) ensureFieldVisible();
});
function startKbSettle() { // the settle sampler has ONE home: focusout and kbSync both start it here
  if (!document.body.classList.contains('kb')) return;
  if (kbSettle) clearInterval(kbSettle);
  // the mirror rule: unchanged samples at the short height do not prove retraction; release requires an observed rise
  let lastH = -1, stable = 0, sawRise = false; const t0 = Date.now(); const hB = window.visualViewport ? window.visualViewport.height : 0;
  const step = () => {
    const ae2 = document.activeElement;
    if (ae2 && (ae2.tagName === 'TEXTAREA' || ae2.tagName === 'INPUT')) { clearInterval(kbSettle); kbSettle = null; return; }
    const vv = window.visualViewport; const h = vv ? vv.height : 0;
    if (hB && h > hB + 20) sawRise = true;
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
    if ((sawRise && stable >= 2) || (fullH && h >= fullH - 2) || Date.now() - t0 > 1500) {
      clearInterval(kbSettle); kbSettle = null;
      if (kbShiftHost) { kbShiftHost.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; } // undo the field-visibility shift with the keyboard gone
      document.body.classList.remove('kb'); syncViewport(); setTimeout(syncViewport, 350);
    }
  };
  kbSettle = setInterval(step, 100); step();
}
function kbSync() { // the owner: a render destroying the focused editor calls kbSync(), releasing through the blur's own settle path
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return; // still typing in another field
  startKbSettle();
}
document.addEventListener('focusout', e => {
  if (!e.target.matches('textarea, input')) return;
  setTimeout(() => {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return;   // moved to another field - still typing
    startKbSettle();
  }, 0);
});
document.addEventListener('focusout', () => setTimeout(syncViewport, 60));
syncViewport();
// iOS can hand a too-short launch height, corrected silently with no event: re-measure at every settled moment
window.addEventListener('pageshow', syncViewport);
window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(syncViewport, 250); }); // the settled size belongs to the old rotation: forget it and let it re-derive
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncViewport(); });
[400, 1200, 3000, 6500].forEach(ms => setTimeout(syncViewport, ms));
let __tailDone = false;
window.__tailAt = Date.now();
function __bootTail() { if (__tailDone) return; __tailDone = true; bootMap(); applyNight(); } // the route-scoped boot steps happen in loadRoute, when a route is chosen
// the boot waits for the intro to finish (the animation gets the phone to itself); reduced-motion boots immediately
const __splashEl = document.getElementById('splash');
if (__splashEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // boot when the intro finishes, plus a breath - never a fixed clock; the timer is a fallback
  const __iconEl = document.getElementById('splashIcon');
  if (__iconEl) __iconEl.addEventListener('animationend', () => setTimeout(__bootTail, 700), { once: true });
  setTimeout(__bootTail, 2600);
} else __bootTail();
// no style pre-warm fetch: both styles are embedded, so the first day/night swap is instant by construction

// ===== ROUTE LOADING + SPLASH EXIT ===== readiness = map live + one tile drawn; the failsafe is 6 s
function prefetchIntroTiles(b, zoom) { // the ruled prefetch: a user-initiated flight to a known destination, never route preloading
  try {
    const style = map.getStyle();
    for (const src of Object.values((style && style.sources) || {})) {
      if (src.type !== 'vector' || !src.tiles || !src.tiles.length) continue;
      const z = Math.min(Math.round(zoom), src.maxzoom ?? Infinity);
      const [west, north] = tileNums(b[0][0], b[1][1], z);
      const [east, south] = tileNums(b[1][0], b[0][1], z);
      const last = 2 ** z - 1;
      for (let x = Math.max(0, west - 1); x <= Math.min(last, east + 1); x++) { // one-tile ring: the 45-degree seat sees past the flat fit
        for (let y = Math.max(0, north - 1); y <= Math.min(last, south + 1); y++) {
          for (const tpl of src.tiles) fetch(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)).catch(() => {});
        }
      }
    }
  } catch (e) {}
}
function introToRoute() { // a pick opens wide and flies in slowly as the splash leaves: dwell and pace are deliberate
  if (!routeBox) { return; } // an empty pack has no area to fly to: the map simply stays where it is
  const liGen = loadInGen; // this intro's pick generation: a newer pick during the dwell retires the flight (the timeout checks it)
  const b = [[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]];
  const fit0 = () => { try { map.fitBounds(b, { padding: 28, animate: false }); map.jumpTo({ pitch: 45 }); } catch (e) {} }; // the no-flight fallback lands on the same tilted default instantly: flat fit first, tilt at its centre/zoom
  if (!map.cameraForBounds || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { fit0(); return; } // the instant fit settles the camera in one pass - no flight, no mid-flight placement
  let fit = null; try { fit = map.cameraForBounds(b, { padding: 28 }); } catch (e) {}
  if (!fit || !fit.center || typeof fit.zoom !== 'number') { fit0(); return; } // same instant-fit settle as above
  try { map.jumpTo({ center: fit.center, zoom: Math.max(8, fit.zoom - 3) }); } catch (e) { fit0(); return; } // same instant-fit settle as above
  prefetchIntroTiles(b, fit.zoom); // after the wide jump lands, before the dwell: the destination's tiles stream while the wide view sits
  // Let destination tiles prefetch during the splash fade so the flight starts as it clears.
  setTimeout(() => { if (!map || liGen !== loadInGen) return; try { map.flyTo({ center: fit.center, zoom: fit.zoom, pitch: 45, duration: 3000, curve: 1.2, essential: false }); } catch (e) {} }, 800);
}
let loadInGen = 0;

function resetSwitchSession() { // the reset a switch runs: everything naming the outgoing route's session dies here, before the new pack exists
  // the knowledge lives with the owners: this block only calls their hooks and clears dirty flags via markClean
  resetNotesHistorySession(); // app3: runSnap, history panel + clean-delete arming, modal note, suggestion set + banners
  resetStreetsSession(); // app2: selection (deselect), note editor + its timer, Streets filter, street-row cache, storage-warning episode
  markClean('trail'); markClean('sess'); markClean('snap'); markClean('start'); markClean('aux'); markClean('primary'); // the flags described the outgoing route's writes; the incoming route starts clean - a stale flag never re-fires
}
function loadRoute(id) {
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) return;
  if (routeLoaded && activeRoute && activeRoute.id === id) return; // picking the route already loaded changes nothing (the Routes tab handler guards this too)
  loadInGen++; // every effective pick starts a new generation: a pending intro flight from an earlier pick retires on it
  hideConfirm(); // a switch clears any pending confirmation: its question belongs to the route asked over, never the new one
  // boot pick and live switch alike: an in-progress run persists whole in its slot, resuming on re-pick
  const switching = routeLoaded;
  if (switching) {
    collapseNoteEditor(); // an open note draft finalizes against the OUTGOING street first (renderStreets' draft flush, through saveAllWarned)
    PERSIST.flush(true); // F2: the outgoing route's pending trail/session/snapshot/start/coverage writes land in ITS slot before LS repoints
    // one verified retry of a failed save before the repoint; a failure is said out loud, never dropped
    if (writePending('primary')) { const okPrim = saveAll(); if (!okPrim.ok) showBanner('Changes not saved', 'Some changes on the route you left did not save'); }
    resetSwitchSession(); // F3/F4
  }
  document.documentElement.classList.remove('boot'); /* a loaded route ends boot state, whichever path loaded it: chrome returns as the state flips */
  buildGeometry(pack); // geometry BEFORE state: loadRouteState's sanitizers filter against the NEW pack's streets
  loadRouteState(id);
  activeRoute = pack; routeLoaded = true;
  renderRouteLists();
  if (map) {
    if (window.GLP) window.GLP.rebuildRoute(); // geometry + CUR follow the pack on every load via rebuildRoute, safe pre-style (its map touches are source-guarded)
    if (typeof glOk !== 'undefined' && glOk && window.GLP) {
      if (!map.getSource('centres')) window.GLP.init(map, GL_HOST); else if (!switching) window.GLP.sync();
    }
    if (switching) { try { addReferenceLayers(); } catch (e) {} if (routeBox) goHomeView(); } // a switch frames the new route at once on the tilted default; the dwell + flight is boot choreography only
    else { introToRoute(); } // nothing is held back - the names stream in with the map from the pick itself
  }
  refreshAll(); checkStale(); syncWake();
  // a run resumed with a missing or damaged cancel snapshot states its reduced Cancel guarantee - never silent
  if (runStart) startGps(true);
  else if (watchId != null) { gpsFromRun = false; $('gpsBtn').classList.toggle('rec', false); renderIcons(); } // switching to a route with no live clean retires the recording face; the watch runs on as view-only
}
function unloadRouteToBoot() { // route deleted while active: return to the boot picker, cold-boot style, no flush (the slot wipes next)
  loadInGen++; // the route is gone - a pending intro flight retires on the generation bump
  const hadRun = !!runStart;
  resetSwitchSession();
  if (hadRun) stopGps(true); // a clean on a deleted route cannot keep recording - its trail's slot no longer exists
  buildGeometry({ roads: {}, reference: {}, primaries: [] }); // the eval-time emptiness a cold boot shows before any pick (drive149's zero-geometry state)
  if (map && window.GLP) window.GLP.rebuildRoute();
  BOARD.emptyBoard(); notes = {}; runStart = 0; trail = []; trailSessions = []; // the eval empties (app1's declarations) - Arch-2: the board's six are emptied by the module
  HIST.unload(); // history empties and its snapshot retires with the route: a snapshot must never merge into another slot
  LS = { ...routeKeys('5w'), ...LS_GLOBAL }; // the eval default - the next pick repoints it via loadRoute
  activeRoute = null; routeLoaded = false;
  document.documentElement.classList.remove('boot'); // do NOT add html.boot here: while it stands, the chrome-absence rule force-hides every other body child
  const rm = $('routeMenu'); rm.classList.remove('tab', 'open'); rm.classList.add('boot', 'show'); const bl = $('brandLayer'); if (bl) bl.classList.remove('off', 'bye'); /* Beta 1.155: the picker return revives the landed title in its layer (finish() parked it at the pick) */ showRmPane('rmMain'); renderRouteLists();
  syncWake();
}
async function deleteRoute(id) { // order is the safety: definition first, verified (failure touches nothing); then unregister, wipe, picker, re-render
  const ix = ROUTE_PACKS.findIndex(p => p.id === id); if (ix < 0) return;
  const pack = ROUTE_PACKS[ix];
  if (SHIPPED_PACK_IDS.has(id)) { // the shipped step (1): the tombstone write, verified before anything is wiped, on the same storage-outcome contract
    const dead = readShippedDeleted(); // strict: a tombstone record that cannot be read is never rewritten blind
    if (dead === null) { showBanner('Route not deleted', 'It stays in your list'); return; }
    if (!dead.includes(id) && !(lsSet(SHIPPED_DELETED_KEY, JSON.stringify([...dead, id])) && (readShippedDeleted() || []).includes(id))) { showBanner('Route not deleted', 'It stays in your list'); return; }
  } else {
    const legacy = readUserPacks(); // strict: an unreadable legacy record is never rewritten blind - one deletion must never cost every created route
    if (legacy === null) { showBanner('Route not deleted', 'It stays in your list'); return; }
    if (!(await upDel(id))) { showBanner('Route not deleted', 'It stays in your list'); return; } // removal is verified before any wipe: a route whose definition survived keeps its data and its row
    if (legacy[id]) {
      const shadow = { ...legacy }; delete shadow[id];
      const okShadow = Object.keys(shadow).length ? (lsSet(USERPACKS_KEY, JSON.stringify(shadow)) && !(readUserPacks() || {})[id]) : (lsDel(USERPACKS_KEY) && localStorage.getItem(USERPACKS_KEY) === null);
      if (!okShadow) { await upPut(id, pack); showBanner('Route not deleted', 'It stays in your list'); return; }
    }
  }
  delete userPackCache[id]; // the backup picture joins the commit
  const wasActive = !!(activeRoute && activeRoute.id === id && routeLoaded);
  ROUTE_PACKS.splice(ix, 1);
  const rk = routeKeys(id); for (const k of Object.values(rk)) txDel(k); // the wipe is verified (txDel), every key attempted: residue would load as a later same-named route's state
  // nothing else keys on a route id (cache by city): removing the pack un-certifies the old union download
  if (wasActive) unloadRouteToBoot(); else renderRouteLists();
}
function askDeleteRoute(id) { // Delete on a row: the shared confirm asks with the deletion labels, for EVERY route, shipped included
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) return;
  crConfirm('Delete ' + pack.name + '?', 'The route and everything saved for it on this phone (progress, notes, history) will be removed. This can’t be undone.', () => deleteRoute(id), { yes: 'Delete', no: 'Cancel', danger: true });
}
