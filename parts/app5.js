function renderAbout() {
  const cur = $('ver').textContent.trim();
  $('wnHead').textContent = "WHAT'S NEW · " + cur; // the header names the LIVE version, read from the title's version element - never a second hard-coded copy that can go stale
  const list = $('wnList'); list.innerHTML = '';
  for (const item of WHATSNEW.items) { const d = document.createElement('div'); d.className = 'm-wnItem'; const dot = document.createElement('span'); dot.className = 'm-wnDot'; dot.innerHTML = '&middot;'; const tx = document.createElement('span'); tx.textContent = item; d.appendChild(dot); d.appendChild(tx); list.appendChild(d); } // exactly one version block: the current release's items directly under the header, no older-version subheads (1.114)
}
$('aboutBtn').addEventListener('click', () => { renderAbout(); showSetPane('setAboutPane'); });
$('aboutBack').addEventListener('click', () => showSetPane('setMainPane'));

// Click-away (Andrew, Beta 1.14): tapping anywhere outside an open menu closes it - no hunting for a
// Close button. Header buttons keep their own toggle behaviour; a tap on a dialog's dimmed backdrop
// acts as that dialog's Cancel / Not yet / Close (each is a plain hide - nothing gets committed).
document.addEventListener('pointerdown', e => {
  const anySheet = !!document.querySelector('.sheet.open'); // Beta 1.77 (Andrew, live catch): ANY open sheet, read from the DOM - the hand-listed pair missed the Routes sheet in 1.76, so tapping away from it did nothing (and the tap fell through to the map)
  if (anySheet && !e.target.closest('.sheet') && !e.target.closest('#hud') && !e.target.closest('.modal') && !e.target.closest('#confirmPill') && !e.target.closest('#confirmBackdrop')) { closeSheets(); spendTap(400); } // Beta 1.30 (Andrew): the closing tap is spent here - the map never sees it. Beta 1.255 (gate round 2, Codex P2): the confirmation pill is exempt like the modals - a real press on its buttons bubbles through here first, and without the exemption Keep going closed the sheet it was asked over before its own click landed. Beta 1.257: the confirmation's backdrop is exempt the same way - it covers the whole screen while the question is up, so without the exemption a tap on it would close the sheet underneath; the tap does nothing instead (dismissal stays buttons-only)
});
['finModal', 'noteModal'].forEach(id => { const mEl = $(id); mEl.addEventListener('pointerdown', e => { if (e.target === mEl) mEl.classList.add('hidden'); }); });
// Beta 1.226: the press shrink for the DIV row families. Buttons shrink through the stylesheet's
// :active rule, but a plain div row never enters :active on a press in some browsers (verified in
// the test browser: a div with an :active rule stays unshrunk while every button shrinks) - so the
// row families (.srow street rows, .crPRow pick rows, .cvRow cover rows, .prow.histRow history
// rows) get the same scale through this class. A press that lands on a real button (the street
// row's Locate pill included) is the button's own press - it shrinks through :active and the row does not
// compound a second scale on top of it.
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
// Beta 1.231 (Andrew, from his 1.226 verdict - "on buttons that open something I rarely
// notice it"): the MINIMUM PRESS. A button that opens a surface (a sheet, a menu, a pane,
// a modal, the note editor) fires its open on release, but never earlier than 150ms after
// touch-down - exactly the press shrink's own duration (head.html), so the shrink completes
// just as the open is allowed to land. A press held past the floor fires on release with
// zero added delay. The gate is this one block: capture-phase listeners match the press
// against the opener set below; a short press's click is swallowed here and the SAME
// element is re-dispatched its click when the floor arrives, so the button's own handler -
// tapGuard and all - runs exactly once, unchanged. The set is ids for the fixed furniture
// plus the three dynamic row families that open a surface (one of them exempt at match
// time - see OPEN_FOCUS_EXEMPT_SEL below). A press that lands on a real
// <button> belongs to that button (the street row's Locate pill is the pill's own press,
// never the row's - the same guard the pressOn block above keeps). Finger and pen presses
// only: a mouse press passes through untouched (the feedback this fixes is a finger
// phenomenon). A press that becomes a drag or a scroll (>10px of travel) fires nothing at
// all. A fresh press on the same element supersedes a pending dispatch, so a rapid
// double-tap opens exactly once.
const OPEN_MIN_MS = 150;
const OPEN_ID_SEL = '#streetsBtn, #paceBtn, #routesBtn, #setBtn, #selNote, #rmChoose, #rmCreate, #rmBack, #rmBack2, #setBack, #jobBtn, #jobBack, #chimeRow, #chimeBack, #stBtn, #statusBack, #aboutBtn, #aboutBack, #exportBtn, #xRes, #xImpText, #crDoorList, #crDoorManual, #rmCityListBack, #crCityBack, #crCityChange, #pvStartOverBtn, #pvSaveBtn, #crNameBack, #crDoneBtn, #crReviewBtn, #pvAddBtn';
const OPEN_ROW_SEL = '.srow, .crPRow, .prow.histRow';
// The street row is EXEMPT from the floor (Beta 1.231, Codex fix round on PR #111): its
// handler (app2) opens the inline note editor and focuses the editor's textarea inside
// the same gesture, and iOS raises the software keyboard only for a focus() called
// within the real user-gesture handler - a deferred synthetic click would open the
// editor with no keyboard and force a second tap on the field, so this opener's real
// click runs untouched, exactly as before this round. Any opener whose handler focuses
// a text field synchronously belongs in this exemption, never in the gated set; the
// gated set was re-audited for this fix and the street row is the only one (the note
// modal's openNote does not focus on open, the create panes never focus their inputs,
// and the app's only other focus() rides the ungated #crClear handler).
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
function applyNight() { // Beta 1.231 (Andrew): the swap is INSTANT - the theme-swap guard (head.html) suppresses every transition while the class flips, so colours step in one frame instead of animating across; the flush below commits the flipped theme under the guard, which then lifts on the next frame (a timer also lifts it, in case frames pause in a hidden tab)
  const de = document.documentElement; de.classList.add('theme-swap');
  document.body.classList.toggle('night', isNight()); const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', isNight() ? '#14171d' : '#eceff2'); $('nightBtn').innerHTML = isNight() ? ICONS.sun : ICONS.moon; renderIcons();
  void de.offsetWidth; // the flush: the flipped theme's styles commit now, transition-free
  const lift = () => de.classList.remove('theme-swap');
  requestAnimationFrame(lift); setTimeout(lift, 150);
} // the button shows where it TAKES you (Beta 1.28, Andrew): in day it offers Night (moon), in night it offers Day (sun). Beta 1.88: the button is the round chip at top-right - the icon alone flips, there is no label
$('nightBtn').addEventListener('click', () => { if (!tapGuard('nightBtn')) return; setThemeOverride(!isNight()); applyNight(); setBasemap(); }); // Beta 1.77: the button sets a session override - the sun takes over again at the next sunrise/sunset or the next full app open (theme block, app1)
function goHomeView() { // Beta 1.203 (Andrew): the DEFAULT view - the route framed exactly as the flat fit frames it, tilted to 45 degrees, north up. The fit is computed FLAT (cameraForBounds with no pitch or bearing options is the flat fit: its centre and zoom are the fitBounds centre and zoom this replaces, bit for bit), and the tilt is applied AT that centre/zoom by the ease - never folded into the fit, because a pitch-aware fit recomputes a different zoom and Andrew's call was "keep the zoom level the same, just tilt it". Home and a route switch land here; the load-in flight (introToRoute) lands on the same view.
  if (!routeBox) return;
  const b = [[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]];
  let fit = null; try { fit = map.cameraForBounds(b, { padding: 28 }); } catch (e) {}
  if (fit && fit.center && typeof fit.zoom === 'number') { try { map.easeTo({ center: fit.center, zoom: fit.zoom, pitch: 45, bearing: 0 }); return; } catch (e) {} }
  try { map.fitBounds(b, { padding: 28 }); map.jumpTo({ pitch: 45, bearing: 0 }); } catch (e) {}
}
$('homeBtn').addEventListener('click', () => { if (!tapGuard('homeBtn')) return; if (!routeBox) return; goHomeView(); }); // Beta 1.117: no route loaded (or an empty pack) - no box to frame
// ===== SERVICE WORKER + BOOT =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => { window.__swErr = (e && e.name) || 'error'; }); // Beta 1.53: a refused registration (e.g. policy-blocked) used to vanish into this catch - record WHY; online use is unaffected either way, but the offline preload below refuses to run without the worker and can now say why
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist().then(v => { storagePersist = (v === true); }).catch(() => {}); } catch (e) {} } // Beta 1.57 (second audit, item 6): ask the platform to exempt this origin's data (progress + offline maps) from automatic storage eviction where supported. An installed home-screen app is already outside Safari's 7-day tab eviction; this covers tab use and other browsers. Beta 1.183 (storage audit §3 item 2): the answer is RECORDED now (storagePersist) and surfaced by the Status storage row - through 1.182 it was fire-and-forget, so a refusal was invisible
  // Stage 2 (audit G-6): the first-ever boot is not worker-controlled, so the map's own style
  // fetches cache nothing and the map cannot load offline until some later visit. Once the
  // worker is ready this page IS controlled - warm both style files through it if they are
  // missing, so a first install becomes offline-ready on its first boot.
  window.__warm = 'pending';
  navigator.serviceWorker.ready.then(async () => {
    try {
      // 'ready' can resolve before THIS page is actually controlled (the claim lands a beat
      // later); a fetch sent in that gap bypasses the worker and caches nothing - the exact
      // failure drive119 caught (warm=fetched:200/200, cache empty). Wait for control.
      if (!navigator.serviceWorker.controller) await Promise.race([
        new Promise(res => navigator.serviceWorker.addEventListener('controllerchange', res, { once: true })),
        new Promise(res => setTimeout(res, 3000))]);
      // Beta 1.33: both basemap styles are embedded in this page (pmstyles.js), so a first
      // install is offline-ready by construction - no style fetch exists to warm. (Tiles and
      // glyphs still warm through ordinary use and the Preload button.)
      window.__warm = 'embedded';
      // Beta 1.41: pre-warm the OTHER theme's sprites through the worker - the two sprite
      // flavours are a theme flip's only network fetch, so the first flip should never
      // wait on them. (After an offline Preload both flavours are cached already.)
      try { const otherKey = isNight() ? 'day' : 'night'; const oSpr = GL_STYLES[otherKey] && (Array.isArray(GL_STYLES[otherKey].sprite) ? GL_STYLES[otherKey].sprite[0].url : GL_STYLES[otherKey].sprite); if (oSpr) { window.__spriteWarm = otherKey; for (const suf of ['.json', '.png', '@2x.json', '@2x.png']) fetch(oSpr + suf).catch(() => {}); } } catch (e) {}
    } catch (e) { window.__warm = 'error:' + (e && e.message || e); }
  }).catch(() => { window.__warm = 'no-worker'; });
}
// Beta 1.94 (audit F-03, one-time migration): installs that downloaded the offline pack
// before 1.94 hold it in the browsing cache ('snowroute-tiles-v1'), where the tile
// eviction can still eat it. While a preload record exists and the pack cache is still
// empty, copy the browsing cache's contents into the pack cache ('snowroute-offline-v1')
// so the protection applies without a re-download; a flag key ends the migration. After
// it, the pack cache is the pack's only home (new downloads write there directly and
// clean their browsing duplicates up). Best-effort: a failed copy retries on the next
// boot, and a fresh Download offline maps always rebuilds the pack cache directly.
const PACKMIG_KEY = 'snowroute.v5.packmig';
let packWriteChain = Promise.resolve(); async function takePackWriteTurn() { if (navigator.locks && navigator.locks.request) { let release; const held = new Promise(res => { release = res; }); let acquired; const acq = new Promise(res => { acquired = res; }); let lockFailed = false; const done = navigator.locks.request('snowroute-pack-write', async () => { acquired(); await held; }); done.catch(() => { lockFailed = true; acquired(); }); await acq; if (!lockFailed) return release; } let release; const held = new Promise(res => { release = res; }); const prev = packWriteChain; packWriteChain = prev.then(() => held); await prev; return release; } // Beta 1.183 (Codex P2, PR #21): the pack has TWO writers - this download (the xPre handler above) and migratePack's boot heal - and ONE deleter, the Status pane's stDel, which takes the same turn since the C-02 fix (2026-11-15): it weighs nothing and writes nothing, but deleting the cache under a writer strands that writer's writes in a detached cache it can still confirm against - and a byte budget is only SHARED if they take turns: each writer censuses the pack when its own turn starts, so serialized writers see each other's finished writes in their census and account against the true total; two writers holding independent snapshots could each pass the cap check and together overshoot it. A turn is held for the writer's whole run and released in its finally. The turn is a WEB LOCK (navigator.locks) whenever the platform offers one: the lock is origin-wide, so two tabs of this app writing the same shared pack cache serialize as well - a per-page chain alone could not do that (Codex P2, PR #21) - and where Web Locks do not exist (older engines) the in-page promise chain is the fallback and the budget is shared within the page only. Either way a dead page takes its turn with it (the platform releases a Web Lock when its holder's context dies; the chain is page memory), so no stale lock can persist.
function packMigFingerprint(list) { // Beta 1.96 (deep audit SR-195-03): the pack-migration completion flag stops being the constant '1' and becomes a fingerprint of the manifest it certifies - a stored flag is believable only for the exact manifest it was earned on (a styles update changes tile/glyph URLs, hence the list, hence the fingerprint, and the full pass runs again). djb2 over the joined list: deterministic, dependency-free, cheap at 897 entries.
  let h = 0; const s = list.join('\n');
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return 'v1:' + list.length + ':' + (h >>> 0).toString(36);
}
function anyPreloadRecord() { // Beta 1.170 (Carbon fix round Phase 2, C-03): was a pack EVER downloaded on this device, under ANY route? The two callers below used to read only the ACTIVE route's preload record (LS names whichever route is active - at boot, the eval-time default), so a pack downloaded under another route alone never earned its migration/heal pass. Every route's own record is the honest test; the manifest migratePack heals against is already the union over all packs (preloadUrlList).
  return ROUTE_PACKS.some(p => !!parseJ(lsGet(routeKeys(p.id).pre), null));
}
async function migratePack() { let migRelease = () => {}; // Beta 1.95 (deep audit SR-194-05/06): the one-time move of a pre-1.94 pack from the browsing cache into the protected pack cache, under an honest contract. 1.94 copied EVERY browsing-cache key (any stray the map had ever fetched came along) through per-file catch-alls, then set the completion flag unconditionally - a partial copy was marked complete and never retried. Now: only the deterministic preload manifest (preloadUrlList) is migrated; non-manifest entries already in the pack cache are pruned, so the pack is exactly the manifest; the completion flag is set only after VERIFYING that everything that exists in either cache is present in the pack cache; any failed copy leaves the flag unset and the next boot retries (the function is idempotent). Returns a status object so the test battery can drive it directly.
  try {
    migRelease = await takePackWriteTurn(); if (!('caches' in window)) return { ok: false, why: 'nocache' };
    if (!anyPreloadRecord()) return { ok: true, skipped: true }; // no pack was ever downloaded on this install (Beta 1.170, C-03: under any route - see anyPreloadRecord)
    const list = preloadUrlList();
    const fp = packMigFingerprint(list);
    if (lsGet(PACKMIG_KEY) === fp) { try { const ocF = await caches.open('snowroute-offline-v1'); if ((await ocF.keys()).length === list.length) return { ok: true, skipped: true, fast: true }; } catch (e) { /* a census that cannot run proves nothing - fall through to the full pass */ } } // Beta 1.96 (SR-195-03): the FAST PATH - 1.95 wrote the completion flag and never read it, so every boot with a preload record re-ran the full ~1,800-match verification sweep. The flag is now read, and believed only with a cheap census agreeing (exactly the manifest's count in the pack); any doubt - flag absent or stale, count off - runs the full pass below, which also HEALS a shrunken pack from the browsing cache
    const want = new Set(list.map(u => { try { return new URL(u).href; } catch (e) { return u; } })); // stored cache keys are URL-normalized (the glyph ranges' 'Noto Sans Regular' is stored %20-encoded) - the prune below must compare like with like, or it deletes the pack's own glyphs (the first CI run of 1.95 did exactly that: pack 897 -> 641)
    const oc = await caches.open('snowroute-offline-v1');
    const tc = await caches.open('snowroute-tiles-v1');
    let pruneOk = true;
    for (const rq of await oc.keys()) { if (!want.has(rq.url)) { try { await oc.delete(rq.url); } catch (e) { pruneOk = false; /* a stray that will not delete is inert - the pack still serves the manifest; Beta 1.96 (SR-195-07): the failure is REPORTED in the status now, not swallowed - copies are the readiness question, the prune is maintenance */ } } } // Beta 1.183 (Codex P2, PR #21): the prune runs FIRST - obsolete entries counted toward the heal budget below could refuse every copy and return before this loop ever ran, leaving their space unreclaimable on every boot; freed space counts toward the budget
    let failed = 0, migBytes = 0; try { for (const req of await oc.keys()) { try { const r0 = await oc.match(req); if (r0) migBytes += (await r0.blob()).size; } catch (e) {} } } catch (e) {} // Beta 1.183 (Codex P2, PR #21): the pack budget binds this door too - migratePack is the pack's second write path (the boot heal), so after the prune above it weighs what remains and counts a copy that would cross OFFLINE_PACK_CAP_BYTES as failed (the flag stays unset and the next boot retries, exactly like a failed copy); a copy whose size cannot be read proceeds unweighed, the download path's own rule
    for (const u of list) {
      if (await oc.match(u)) continue;
      const hit = await tc.match(u);
      if (!hit) continue; // exists in neither cache - nothing to migrate (a re-download rebuilds the pack directly)
      let hSz = -1; try { hSz = (await hit.clone().blob()).size; } catch (e) {} if (hSz >= 0 && migBytes + hSz > OFFLINE_PACK_CAP_BYTES) failed++; else { try { await oc.put(u, hit); if (hSz >= 0) migBytes += hSz; } catch (e) { failed++; } }
    }
    if (failed > 0) return { ok: false, failed };
    for (const u of list) { if (!(await oc.match(u)) && (await tc.match(u))) return { ok: false, why: 'verify' }; } // verify BEFORE the flag: everything recoverable must be in the pack cache
    const flagOk = lsSet(PACKMIG_KEY, fp); // Beta 1.96 (SR-195-07): the flag write is CHECKED - the fast path believes this flag, so a migration whose flag could not be persisted is not complete and must not report ok
    return { ok: flagOk, flag: flagOk ? fp : null, pruneOk };
  } catch (e) { return { ok: false, why: String((e && e.message) || e) }; } finally { migRelease(); }
}
// Beta 1.143 (DA-07): the boot invocation of migratePack() no longer lives here. It fired during
// this part's evaluation and captured preloadUrlList() as its manifest BEFORE create.js evaluated
// and registered the created packs - the captured set was the shipped packs only, so the migration
// pruned a created route's downloaded tiles and certified the smaller set. The call now sits in
// create.js immediately after mergeUserPacks(), where the manifest is the true union.
// Beta 1.18 (Andrew's phone report): the on-screen keyboard shrinks the VISIBLE screen
// (visualViewport) and iOS pans the page to the focused note box, stranding the header
// and menus off-screen - and it does not pan back. Track the visible screen in CSS vars
// (--vvt top offset, --vvh height, --vvb hidden strip below) that the chrome is anchored
// to, and cancel any leftover page pan once no text field is focused.
// Beta 1.54 (Andrew's deep-dive, 2026-11-01): SETTLED-SIZE ANCHOR. The old code sized
// everything from whatever the phone LAST reported as the visible height - and iOS
// sometimes reports a too-short height and then says nothing more: at cold start
// (his ~2-in-10 launches with a strip under the bottom bar) and after the keyboard
// closes (the strip would return until the app was relaunched once or twice). The
// app now remembers the true height (fullH: the tallest report with no keyboard up;
// in a home-screen install the web view IS the full screen, so screen.height is
// knowable from the first frame) and, when a short report arrives with no keyboard
// up, trusts the settled size instead - a stuck report can no longer paint a strip.
// Beta 1.55 CORRECTION: 1.54 additionally PINNED the top/bottom offsets while the
// keyboard was up - that stopped the menus riding above the keyboard (their
// pre-1.54 behaviour) and put the note box behind it, out of sight (Andrew,
// 2026-11-01). The pin is OUT: offsets follow the live report while typing, as
// before; the settled anchor and the settle-release remain.
let fullH = 0;
const inStandalone = () => !!(window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
function syncViewport() {
  try {
    const vv = window.visualViewport; if (!vv) return;
    const de = document.documentElement;
    const kb = document.body.classList.contains('kb');
    if (kb) return; // Beta 1.61: while typing, the layout variables stay frozen at their pre-keyboard values - the keyboard overlays the app instead of resizing it. The live-chase (1.55) re-fit the sheets on every keyboard animation tick and the note menus flickered and jumped (Andrew, 2026-11-01). The settle sampler reads the live report directly and this function republishes everything when the keyboard leaves.
    if (!kb && vv.height > fullH) fullH = vv.height;
    if (!kb && inStandalone() && window.innerHeight >= window.innerWidth && window.screen.height > fullH) fullH = window.screen.height;
    const t = vv.offsetTop, h = vv.height, b = Math.max(0, window.innerHeight - t - h); // Beta 1.62: the live report rules, always. The 1.54 trust override (publishing the remembered full height when a report ran short) is retired together with the 1.58 nudges: since 1.60 the document-height floor is what guarantees the full stage - the browser's own sizing, not an app override - and the strip is device-confirmed gone.
    de.style.setProperty('--vvt', t + 'px');
    de.style.setProperty('--vvh', h + 'px');
    de.style.setProperty('--vvb', b + 'px');
    if (DP_ANDROID && !kb && inStandalone() && fullH > h && window.innerHeight >= fullH - 2) { de.style.setProperty('--vvh', fullH + 'px'); de.style.setProperty('--vvb', Math.max(0, window.innerHeight - t - fullH) + 'px'); } // Beta 1.230 (Andrew's Pixel 7 report): the ANDROID anchor - behind the device profile's platform gate (app1), so the iOS lines above stay byte-identical in effect. Android has no 1.60-style floor making the browser's own sizing trustworthy, and Chrome there can report the visual viewport SHORT of the screen the app window actually spans (the gesture strip counted out), which strands every --vvh-sized surface and --vvb-anchored floater above the true bottom and leaves the pale frame showing as a white strip. Where the settled full height (fullH, which already folds screen.height in standalone) exceeds the live report with no keyboard up, the settled size publishes instead - the 1.54 trust, revived for Android only. On iOS this line never runs. BOUND (Codex P2, PR #110): the anchor stands in only while the window itself still spans the settled height (window.innerHeight >= fullH - 2, the settle sampler's own at-the-settled-size test applied to the window) - in split-screen or any shrunken window the live report rules, so a --vvh-sized surface (the .modal card) can never be centred outside the visible window.
    const ae = document.activeElement;
    if ((!ae || (ae.tagName !== 'TEXTAREA' && ae.tagName !== 'INPUT')) && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
    if (typeof map !== 'undefined' && map) { const mc = map.getContainer(); const mw = mc.clientWidth, mh = mc.clientHeight; if (mw !== syncViewport._w || mh !== syncViewport._h) { syncViewport._w = mw; syncViewport._h = mh; map.resize(); } } // Beta 1.50 (audit P10): this fires on every visual-viewport scroll tick - only pay for a map resize when the container actually changed size
  } catch (e) { /* map/viewport not up yet */ }
}
if (window.visualViewport) { window.visualViewport.addEventListener('resize', syncViewport); window.visualViewport.addEventListener('scroll', syncViewport); }
window.addEventListener('resize', syncViewport);
// Beta 1.31: the keyboard state - while ANY text field has focus, the sheets stop resizing and
// animating (body.kb rules in the stylesheet). This is what made note editing feel broken:
// the sheet kept re-animating its height against the keyboard's own motion on every viewport tick.
// Beta 1.54/1.55: the keyboard lifecycle. Closing: do NOT drop the frozen state the moment the field blurs (1.31 did, while the
// keyboard was still sliding away and the reported height still growing - the sheet's
// animation switched back on against a moving target and 'reanimated up like opening
// for the first time', Andrew 2026-11-01). Instead wait until the reported height
// SETTLES (back at the settled size, or unchanged across samples, capped ~1.5s), then
// release in one clean state change and re-measure. Every wait terminates.
let kbSettle = null;
let kbInSettle = null, kbShiftHost = null, kbVisH = -1, kbShiftPx = 0;
document.addEventListener('focusin', e => {
  if (!e.target.matches('textarea, input')) return;
  if (kbSettle) { clearInterval(kbSettle); kbSettle = null; }
  if (kbShiftHost) { kbShiftHost.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; }
  document.body.classList.add('kb');
  // Beta 1.61: once the keyboard's rise settles, make sure the field is
  // actually visible above it - by scrolling the menu's own list or
  // shifting its card, never by resizing the layout (see syncViewport).
  if (kbInSettle) clearInterval(kbInSettle);
  // Beta 1.69 (audit N02): unchanged samples alone no longer prove the keyboard has settled - iOS can report the full height for the first few hundred ms BEFORE the keyboard starts moving the viewport, and the old sampler concluded 'settled' inside that window and lined the field up against the wrong geometry, never to recheck. Early conclusion now requires a real observed drop from the focus-time height; the 700 ms cap still bounds the wait, and a viewport resize while the keyboard is open re-runs the visibility check (below).
  let lastH = -1, stable = 0, sawDrop = false; const t0 = Date.now(); const h0 = window.visualViewport ? window.visualViewport.height : 0;
  const step = () => {
    const vv = window.visualViewport; const h = vv ? vv.height : 0;
    if (h0 && h < h0 - 20) sawDrop = true;
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
    if ((sawDrop && stable >= 2) || Date.now() - t0 > 700) { clearInterval(kbInSettle); kbInSettle = null; ensureFieldVisible(); }
  };
  kbInSettle = setInterval(step, 80); step();
});
function ensureFieldVisible() { // Beta 1.61: the keyboard overlays the frozen layout, so a field it would cover is surfaced locally - the sheet's own list scrolls (instantly, as in 1.56) or the pop-up/modal card shifts up by the overlap; the shift is cleared when the keyboard leaves (startKbSettle's release, or the next focusin).
  try {
    const ae = document.activeElement; if (!ae || (ae.tagName !== 'TEXTAREA' && ae.tagName !== 'INPUT')) return;
    const vv = window.visualViewport; if (!vv) return;
    kbVisH = vv.height;
    const floor = vv.height - 8; // the visible bottom edge while the keyboard is up
    const r = ae.getBoundingClientRect();
    if (r.bottom <= floor && r.top >= 0 && !kbShiftHost) return; // Beta 1.70 (audit A02): with a card shift already applied, fall through - the host branch below may need to grow, shrink or clear it
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
// Beta 1.69 (audit N02, second half): while the keyboard is open, a viewport
// resize that materially changes the height re-runs the field-visibility check -
// the layout variables stay frozen (syncViewport still returns early); only the
// local scroll/shift that surfaces the field is re-evaluated, so a late-arriving
// keyboard can no longer leave the field covered after an early conclusion.
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
  if (!document.body.classList.contains('kb') || kbInSettle) return;
  const h = window.visualViewport.height;
  if (kbVisH >= 0 && Math.abs(h - kbVisH) > 4) ensureFieldVisible();
});
function startKbSettle() { // Beta 1.56: the settle sampler has ONE home - focusout and kbSync both start it here
  if (!document.body.classList.contains('kb')) return;
  if (kbSettle) clearInterval(kbSettle);
  // Beta 1.70 (audit A03): the mirror of the N02 opening fix - two unchanged samples at the still-short height no longer prove the keyboard has retracted (iOS can sit at the short height for a few hundred ms after blur before it starts growing). An early release now requires an observed RISE from the blur-time height (or the confirmed full height); the 1.5 s cap still bounds every dismissal.
  let lastH = -1, stable = 0, sawRise = false; const t0 = Date.now(); const hB = window.visualViewport ? window.visualViewport.height : 0;
  const step = () => {
    const ae2 = document.activeElement;
    if (ae2 && (ae2.tagName === 'TEXTAREA' || ae2.tagName === 'INPUT')) { clearInterval(kbSettle); kbSettle = null; return; }
    const vv = window.visualViewport; const h = vv ? vv.height : 0;
    if (hB && h > hB + 20) sawRise = true;
    if (h === lastH) stable++; else { stable = 0; lastH = h; }
    if ((sawRise && stable >= 2) || (fullH && h >= fullH - 2) || Date.now() - t0 > 1500) {
      clearInterval(kbSettle); kbSettle = null;
      if (kbShiftHost) { kbShiftHost.style.transform = ''; kbShiftHost = null; kbShiftPx = 0; } // Beta 1.61: undo the field-visibility shift with the keyboard gone
      document.body.classList.remove('kb'); syncViewport(); setTimeout(syncViewport, 350);
    }
  };
  kbSettle = setInterval(step, 100); step();
}
function kbSync() { // Beta 1.56: the keyboard state's single owner is this lifecycle. A render that destroys the focused editor (app2) calls kbSync() instead of removing the class itself - the release then goes through the same settle path as a normal blur, never an instant mid-animation unfreeze (external audit Issue B1, 2026-11-01)
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
// Beta 1.51: iOS sometimes hands a home-screen app a too-short screen height
// at launch and corrects it silently, with no resize event (Andrew's report:
// the bottom bar floats with a pale-or-dark band under it - and merely
// reopening the app often just RESUMES the same frozen page, keeping the bad
// measurement, which is why a reopen only sometimes fixed it). Measuring is
// cheap and changes nothing when the size was already right, so re-measure at
// every moment the size is known to have settled: page shown or resumed,
// return to the front, rotation, and a short ladder of post-boot re-checks.
window.addEventListener('pageshow', syncViewport);
window.addEventListener('orientationchange', () => { fullH = 0; setTimeout(syncViewport, 250); }); // Beta 1.54: the settled size belongs to the old rotation - forget it and let it re-derive
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncViewport(); });
[400, 1200, 3000, 6500].forEach(ms => setTimeout(syncViewport, ms));
let __tailDone = false;
window.__tailAt = Date.now();
function __bootTail() { if (__tailDone) return; __tailDone = true; bootMap(); applyNight(); } // Beta 1.76: the route-scoped boot steps (state load, render, stale check, wake sync, in-progress run resume) happen in loadRoute, when a route is chosen
// Beta 1.44: the heavy boot waits for the splash intro to finish, so the
// animation gets the phone to itself and every open feels like a warm one.
// Reduced-motion (no splash) and no-splash pages boot immediately, as before.
const __splashEl = document.getElementById('splash');
if (__splashEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Boot the moment the intro has actually finished on THIS device, plus a
  // breath - never on a fixed clock, so a slow first paint cannot push the
  // boot chunks back into the animation. Beta 1.180: the trigger re-anchors
  // from the retired title slide to the icon's own fade (splashIconIn, the
  // intro's remaining CSS entrance). The icon's animation ends at 1.6s,
  // where the title's slide ended at 2.15s, so the breath is 700ms rather
  // than 150ms and the boot tail lands at the same ~2.3s point it always
  // has. The 2.6s timer remains only a fallback if the event never lands.
  const __iconEl = document.getElementById('splashIcon');
  if (__iconEl) __iconEl.addEventListener('animationend', () => setTimeout(__bootTail, 700), { once: true });
  setTimeout(__bootTail, 2600);
} else __bootTail();
// Beta 1.33: no other-style pre-warm fetch - both Protomaps styles are embedded in the page, so the first day/night swap is instant by construction.

// ===== ROUTE LOADING + SPLASH EXIT (Beta 1.76, Andrew) =====
// The intro plays on its own (CSS). The gate waits for the app to be genuinely
// ready behind the splash - map live (glOk) and at least one basemap tile drawn
// (tilesOk) - with a minimum beat so the moment never just flashes, and a 6s
// failsafe so a dead network can never trap anyone behind the splash. At the
// gate the BRAND slides out to the right and the route menu takes the same
// blue screen: Choose a route / Create new route (a placeholder). The map
// behind carries NO route until one is chosen. Picking a route loads it
// (state, paint, camera, run resume), fades the blue, and REMOVES the splash.
// Beta 1.78: the splash plays once per cold load and can never replay - but
// the route menu is NOT removed with it: finish() parks it below the screen
// and the Routes tab slides it back up (app2's openRouteMenu).
function introToRoute() { // Beta 1.77 (Andrew): a pick opens WIDE on the route's area and flies in to the fitted view as the splash leaves, instead of the map simply appearing already zoomed in. Beta 1.81 (Andrew): the wide view dwells longer on the Route 5W point of interest and the flight in is slower and gentler - the old one was over before he could take the map in
  if (!routeBox) { return; } // Beta 1.117: an empty pack has no area to fly to - the map simply stays where it is. Beta 1.270: and no flight means no title placed mid-flight, so no guard check is owed either
  const liGen = loadInGen; // the pick generation this intro belongs to - a newer pick landing during the dwell below retires this flight whole (its timeout checks the generation before it flies)
  const b = [[routeBox.w, routeBox.s], [routeBox.e, routeBox.n]];
  const fit0 = () => { try { map.fitBounds(b, { padding: 28, animate: false }); map.jumpTo({ pitch: 45 }); } catch (e) {} }; // Beta 1.203: the no-flight fallback (reduced motion, no cameraForBounds) lands on the same tilted default, instantly - the flat fit first, the tilt applied at its centre/zoom
  if (!map.cameraForBounds || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { fit0(); return; } // the instant fit decides the anchors at the settled camera in one pass - no flight, no mid-flight placement, no guard check owed
  let fit = null; try { fit = map.cameraForBounds(b, { padding: 28 }); } catch (e) {}
  if (!fit || !fit.center || typeof fit.zoom !== 'number') { fit0(); return; } // same instant-fit settle as above
  try { map.jumpTo({ center: fit.center, zoom: Math.max(8, fit.zoom - 3) }); } catch (e) { fit0(); return; } // same instant-fit settle as above
  setTimeout(() => { if (!map || liGen !== loadInGen) return; try { map.flyTo({ center: fit.center, zoom: fit.zoom, pitch: 45, duration: 3000, curve: 1.2, essential: false }); armTitleRePlace(); } catch (e) {} }, 1500); // 1500ms: the splash's exit (780ms) has finished and the wide view - the Route 5W point of interest - has had a moment to sit, before the slow flight in. Beta 1.203 (Andrew): the flight tilts into the 45-degree default as it comes in - centre and zoom are the flat fit's own, unchanged
}
// ===== TITLE PLACEMENT GUARD (Beta 1.270, Andrew's synchronised-streaming design, 2026-11-21) =====
// The names stream in with the map now - no hold, no unconditional rebuild
// (the 1.266 hold-then-reveal cycle is retired: Andrew's lived verdict was a
// nameless wait, then a pop; the investigation in loadin-warm-2026-11-21
// measured the two tile pipelines finishing 23 ms apart when nothing
// interferes). What survives of the 1.248 hook is its CURE, made
// conditional: the defect it answered is real but phone-only (a title that
// places DURING the flight's final approach can keep a mid-flight side
// anchor for the session - names beside their streets until a theme swap).
// So at moveend the guard counts the titles placed so far: ZERO placed
// means every title's first placement happens against the settled scene,
// the precondition the rebuild exists to defeat is absent, and the
// teardown is skipped (the investigation's pixel audit: the rebuild in
// that case is a complete visual no-op, 0 differing pixels of 1,512,000).
// Any title placed means the cure runs once, at idle, wrapped in app2's
// TITLES-ONLY hold so the cure cannot blink either - the basemap names are
// never held in any path (a paint or visibility write on a basemap layer
// is banned outright by the drive216 P3 finding). Worst case on a fired
// pick is the 1.266 behaviour scoped to the route titles alone.
let loadInGen = 0;
let titleGuardArmed = false;
let titleCureRelease = null; // the standing cure's one-shot release, or null - loadRoute and unloadRouteToBoot call it so a pick or a delete never leaves a previous pick's cure holding the new scene's titles
function releaseTitleCure() { const f = titleCureRelease; if (f) f(); } // Beta 1.270 (PR #166, Codex P1): invoke the release WHILE IT IS STILL REGISTERED - the closure opens with an identity check (titleCureRelease !== release -> stand down) that retires stale invocations, so clearing the registration first makes the callback refuse itself and the hold never releases (titles invisible indefinitely, the incoming route's included). The closure clears the registration as its own first act, so invoke-first loses no safety; proof-1270 check 5b pins this order
function armTitleRePlace() {
  if (!map || titleGuardArmed) return; titleGuardArmed = true;
  const liGen = loadInGen; // the generation this guard belongs to - a newer pick retires it whole: its check stands down, because the newer pick's own flight arms its own guard
  let done = false;
  const finish = () => { if (done) return; done = true; titleGuardArmed = false; };
  const check = () => { // at moveend (or the arm-time backstop below): count the titles placed so far - the guard's whole decision is this one number
    if (done) return;
    if (liGen !== loadInGen) { finish(); return; }
    let placed = 0;
    try { const ids = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].filter((id) => map.getLayer(id)); if (ids.length) placed = map.queryRenderedFeatures({ layers: ids }).length; } catch (e) {}
    if (!placed) { finish(); return; } // the streaming path: nothing placed mid-flight, nothing owed
    const cure = () => { // at idle (the settled scene - a re-decision against a half-arrived scene could stick the same way the original defect did)
      if (done) return; finish();
      if (liGen !== loadInGen) return;
      nameHoldSet(true, true); // titles only - the basemap is never held
      try { if (window.GLP && window.GLP.rePlaceTitles) window.GLP.rePlaceTitles(); } catch (e) {}
      const release = () => { if (titleCureRelease !== release) return; titleCureRelease = null; nameHoldSet(false); };
      titleCureRelease = release;
      try { map.once('idle', release); } catch (e) { release(); }
      setTimeout(release, 6000); // backstop: a stalled rebuild must not hold the titles forever - the diagnosis measured the rebuilt source's re-parse at ~4.9 s under 6x CPU throttle, so a healthy rebuild always lands inside it
    };
    try { map.once('idle', cure); } catch (e) { cure(); }
    setTimeout(cure, 2500); // the idle backstop, as the 1.248 hook had: a tile source that never settles must not strand the cure
  };
  try { map.once('moveend', check); } catch (e) { titleGuardArmed = false; }
  setTimeout(check, 6500); // arm-time backstop: an interrupted animation can swallow moveend itself; armed at the flight's launch it lands strictly after the moveend path's own latest fire, and the done flag keeps the check single
}

function resetSwitchSession() { // Beta 1.117 (F3/F4): the ONE reset block a route switch runs - everything that names the OUTGOING route's session dies here, before the new pack's geometry or state exists. Runs after the F2 flush (loadRoute calls collapseNoteEditor first, so an open note draft has already finalized against the outgoing street).
  // Beta 1.148 (Tranche 5, A4(ii)): the reset knowledge now lives with the state
  // owners - this block only CALLS the owners' hooks (each hook preserves the
  // order its own writes ran in below) and clears app1's dirty flags through
  // markClean, app1's own accessor. It writes no foreign global itself: a new
  // session field's reset is added in its owner's hook, not here.
  resetNotesHistorySession(); // app3: runSnap, history panel + clean-delete arming, modal note, suggestion set + banners
  resetStreetsSession(); // app2: selection (deselect), note editor + its timer, Streets filter, street-row cache, storage-warning episode
  markClean('trail'); markClean('sess'); markClean('snap'); markClean('start'); markClean('aux'); markClean('primary'); // the dirty flags described the outgoing route's pending writes; the flush above landed what it could, and the incoming route's state (loaded next) starts clean - a stale flag must never re-fire against the new slot
  // (The two hook calls above replace this block's former inline writes, line
  // for line in count, so every census-pinned line below this block stands.)
}
function loadRoute(id) {
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) return;
  if (routeLoaded && activeRoute && activeRoute.id === id) return; // picking the route already loaded changes nothing (the Routes tab handler guards this too)
  loadInGen++; titleGuardArmed = false; releaseTitleCure(); // Beta 1.270: every effective pick starts a new generation - a guard or cure an earlier pick left pending is stale from this line on (the guard's check reads the generation and stands down, and a standing cure hold is released here rather than left over the incoming route's titles; loadRoute owns both resets for the same reason)
  hideConfirm(); // Beta 1.255 (gate round 2, Codex P1): a route switch clears any pending confirmation - the scrim-free pill permits navigation while it is up, and its question belongs to the route and run it was asked over, never to the one switched to
  // Beta 1.117: loadRoute is BOTH the boot pick and the live switch (pre-1.117 a
  // `if (routeLoaded) return;` guard made it boot-only, and the Routes tab's pick
  // was a silent no-op - segregation audit F1-F4). SWITCH SEMANTICS (= a cold
  // boot on the target route, plus the pre-flush a reboot only gets via
  // pagehide): a run in progress on the outgoing route is NOT ended - it
  // persists whole in its own slot (start, board, trail, sessions, persisted
  // cancel snapshot) and resumes through this same path when its route is
  // picked again; the GPS watch is device state (F8) and is not stopped or
  // restarted by a switch beyond the resume call below.
  const switching = routeLoaded;
  if (switching) {
    collapseNoteEditor(); // an open note draft finalizes against the OUTGOING street first (renderStreets' draft flush, through saveAllWarned)
    flushAux(true); // F2: the outgoing route's pending trail/session/snapshot/start/coverage writes land in ITS slot before LS repoints
    if (writePending('primary')) { const okPrim = saveAll(); if (!okPrim.ok) toast('Storage problem - some changes on the route you left could not be saved', 4200); } // F2: one verified retry of a failed primary save before the repoint; a failure is said out loud, never silently dropped
    resetSwitchSession(); // F3/F4
  }
  document.documentElement.classList.remove('boot'); /* Beta 1.86: a loaded route IS the end of the boot state, whichever path loaded it - the boot pick, a relaunch, a test harness. The chrome returns as the state flips (in the pick flow that is still before the blue fade, so the reveal choreography is unchanged) */
  buildGeometry(pack); // Beta 1.117 (F1): geometry BEFORE state - loadRouteState's sanitizers filter against the NEW pack's streets
  loadRouteState(id);
  activeRoute = pack; routeLoaded = true;
  renderRouteLists();
  if (map) {
    if (window.GLP) window.GLP.rebuildRoute(); // Beta 1.117: the engine's geometry + CUR follow the pack on EVERY load - the boot pick included (pre-1.117 the engine's geometry existed from script eval, so init could build from it; now rebuildRoute is what builds it, and it is safe before the style is ready: its map touches are source-guarded and the deferred init in onStyleReady then finds CUR already correct)
    if (typeof glOk !== 'undefined' && glOk && window.GLP) {
      if (!map.getSource('centres')) window.GLP.init(map, GL_HOST); else if (!switching) window.GLP.sync();
    }
    if (switching) { try { addReferenceLayers(); } catch (e) {} if (routeBox) goHomeView(); } // a switch frames the new route at once, on the same tilted default Home lands on (Beta 1.203) - the wide dwell + slow flight (introToRoute) is boot choreography only. Beta 1.270: a switch arms no guard - it frames at once on the settled view, so no title places mid-flight
    else { introToRoute(); } // Beta 1.270: nothing is held back - the names stream in with the map from the pick itself; the flight's guard (armTitleRePlace, inside introToRoute) checks at moveend whether any title placed mid-flight and only then runs its cure
  }
  refreshAll(); checkStale(); syncWake();
  // Beta 1.221: the resumed-clean pill is cut (Andrew's toast rule - the resumed board and the Finish button are the mechanism). The 1.95 snapshot-honesty note that rode it lives on in the cancel path's own warning, which fires if he actually cancels.e snow), but a run whose cancel snapshot is missing or damaged is resumed with its reduced Cancel guarantee stated, not silent
  if (runStart) startGps(true);
}
function unloadRouteToBoot() { // Beta 1.124: the ACTIVE route was deleted - return the app to the boot-picker state, mirroring a cold boot before any pick (no geometry at eval, no state loaded, LS at its eval default, the menu in boot mode over rmMain). The mirror is of the RESTING picker, whose html carries NO boot class (Beta 1.126 - see the remove() below). Unlike a route SWITCH there is no flush: the outgoing slot's keys are wiped by deleteRoute right after, so nothing may write into them here - resetSwitchSession's clearing (note timer, dirty flags) is exactly the teardown needed, and its flush steps are deliberately NOT run.
  loadInGen++; titleGuardArmed = false; releaseTitleCure(); // Beta 1.270: the route a guard or cure was watching is gone - retire both here rather than leaving a cure hold standing over the boot view
  const hadRun = !!runStart;
  resetSwitchSession();
  if (hadRun) stopGps(true); // a clean on a deleted route cannot keep recording - its trail's slot no longer exists
  buildGeometry({ roads: {}, reference: {}, primaries: [] }); // the eval-time emptiness a cold boot shows before any pick (drive149's zero-geometry state)
  if (map && window.GLP) window.GLP.rebuildRoute();
  BOARD.emptyBoard(); notes = {}; history = []; runStart = 0; trail = []; trailSessions = []; // the eval empties (app1's declarations) - Arch-2: the board's six are emptied by the module
  resetHistorySnapshot(); // 2026-11-15 (denylist fix round, A-05): the A-05 history snapshot dies with the route it describes - this slot is about to be wiped, and a stale snapshot must never merge into another route's slot
  LS = { ...routeKeys('5w'), ...LS_GLOBAL }; // the eval default - the next pick repoints it via loadRoute
  activeRoute = null; routeLoaded = false;
  document.documentElement.classList.remove('boot'); // Beta 1.126: NOT add. A cold boot's RESTING picker carries no html.boot - the boot tail's arm() removes it when the menu arms (finish()/loadRoute are backstops), because while it stands the 1.86 chrome-absence rule (html.boot body > *:not(#splash):not(#routeMenu):not(#map) { display: none !important }) force-hides every other body child. 1.124 re-added it here and nothing on the create path removed it again, so after deleting the active route the whole create stage (#createBar, #createSheet, #createResults, #createHint - and the 'Route deleted' toast) was display:none for the rest of the session: Andrew's search bar and selected-roads panel never painted, though the map (excepted from the rule) still took taps and the draft filled invisibly. drive155 A1-A4 pin the resting state + computed visibility.
  const rm = $('routeMenu'); rm.classList.remove('tab', 'open'); rm.classList.add('boot', 'show'); const bl = $('brandLayer'); if (bl) bl.classList.remove('off', 'bye'); /* Beta 1.155: the picker return revives the landed title in its layer (finish() parked it at the pick) */ showRmPane('rmMain'); renderRouteLists();
  syncWake();
}
async function deleteRoute(id) { // Beta 1.124 (Andrew): delete a route HE created. Beta 1.271 (Andrew, 2026-11-21: EVERY route gets a Delete, the shipped 5W included) SUPERSEDES the 1.124 shipped refusal below - the order discipline is unchanged, only step (1)'s target differs by kind: a SHIPPED pack's step (1) writes the tombstone record (create-packs' SHIPPED_DELETED_KEY, strict read + verified write) because its definition is data.js, not a stored record; a created route's step (1) is the store delete + shadow removal, exactly as before. Order is the safety: (1) the userpacks definition goes first, through a strict read and a VERIFIED write - on any failure nothing else is touched, the route stays listed and fully intact, and a toast names the storage problem; (2) only then is the pack unregistered and every key of its slot wiped - enumerated from routeKeys (ROUTE_FIELDS + snap + mig + its preload record), never hand-listed, so a future field joins the sweep by construction; (3) if it was the active route, the app returns to the boot picker; (4) the list re-renders without it. Beta 1.166: the definition's home is the IndexedDB store - step (1) is a verified store delete, PLUS the removal of any not-yet-drained legacy shadow copy (while a legacy record stands, its copy wins at boot, so leaving one would resurrect the route); a shadow-removal failure puts the store entry back rather than strand a half-deleted route.
  const ix = ROUTE_PACKS.findIndex(p => p.id === id); if (ix < 0) return;
  const pack = ROUTE_PACKS[ix];
  if (SHIPPED_PACK_IDS.has(id)) { // Beta 1.271: the shipped step (1) - the tombstone write, verified before anything is wiped, on the same storage-outcome contract
    const dead = readShippedDeleted(); // strict: a tombstone record that cannot be read is never rewritten blind
    if (dead === null) { toast('Storage problem - the route could not be deleted', 4000); return; }
    if (!dead.includes(id) && !(lsSet(SHIPPED_DELETED_KEY, JSON.stringify([...dead, id])) && (readShippedDeleted() || []).includes(id))) { toast('Storage problem - the route could not be deleted', 4000); return; }
  } else {
    const legacy = readUserPacks(); // strict, as ever: a legacy record that cannot be read is never rewritten blind - rescuing one deletion must never cost every created route
    if (legacy === null) { toast('Storage problem - the route could not be deleted', 4000); return; }
    if (!(await upDel(id))) { toast('Storage problem - the route could not be deleted', 4000); return; } // the storage-outcome contract, unchanged: the definition's removal is verified before any data is wiped - a route whose definition survived keeps its data and its row
    if (legacy[id]) {
      const shadow = { ...legacy }; delete shadow[id];
      const okShadow = Object.keys(shadow).length ? (lsSet(USERPACKS_KEY, JSON.stringify(shadow)) && !(readUserPacks() || {})[id]) : (lsDel(USERPACKS_KEY) && localStorage.getItem(USERPACKS_KEY) === null);
      if (!okShadow) { await upPut(id, pack); toast('Storage problem - the route could not be deleted', 4000); return; }
    }
  }
  delete userPackCache[id]; // the backup picture joins the commit
  const wasActive = !!(activeRoute && activeRoute.id === id && routeLoaded);
  ROUTE_PACKS.splice(ix, 1);
  const rk = routeKeys(id); let wipeFailed = false; for (const k of Object.values(rk)) { if (!txDel(k).ok) wipeFailed = true; } // Beta 1.146 (census C2): the slot wipe is VERIFIED like the definition write above it (txDel - the app's own verified delete), every key attempted even after a failure. The old lsDel loop ignored every result: a failed delete left residue in an orphaned slot, and uniqueRouteId checks ROUTE_PACKS only, so a later same-named route regenerated the same slug and loadRouteState loaded the residue as the new route's own progress/history/notes.
  // Reference sweep (1.124): nothing else keys on a route id - the IndexedDB city cache is keyed by CITY (a deleted route's city stays cached for the next route there), LS_GLOBAL.lastArea is a city name, and PACKMIG's fingerprint derives from preloadUrlList() over ROUTE_PACKS, so removing the pack honestly un-certifies the old union download (the tiles themselves stay cached; the Settings line simply offers the current set's download again).
  if (wasActive) unloadRouteToBoot(); else renderRouteLists();
  if (wipeFailed) toast('Route deleted, but some of its saved data could not be deleted (storage problem)', 4200); // Beta 1.146 (census C2): the definition IS gone (verified above) and the pack stays unregistered - in-memory tenancy matches storage - but the success toast must NOT fire over a slot that could not be fully wiped; the failure is said out loud, on deleteRoute's own storage-problem surface (the same toast form its definition-write failures use)
}
function askDeleteRoute(id) { // Beta 1.124: the Delete on a route's row - the shared create confirm asks, with the deletion labels; the confirm's card is the theme-token surface in both day and night. Beta 1.271: the ask opens for EVERY route, shipped packs included (the 1.124 shipped refusal is superseded by Andrew's 2026-11-21 ruling).
  const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) return;
  crConfirm('Delete ' + pack.name + '?', 'The route and everything saved for it on this phone (progress, notes, history) will be removed. This can’t be undone.', () => deleteRoute(id), { yes: 'Delete', no: 'Cancel', danger: true });
}
