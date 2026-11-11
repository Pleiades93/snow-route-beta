import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive190: Beta 1.170 (Carbon fix round, Phase 2) - the session/app-side
// graded fixes, proven end-to-end in a real page:
//   A: A-04 - the interrupted-finish reconciliation judges the RAW stored
//      history: a newest entry the load sanitizer drops (every street
//      stripped by a pack edit) no longer hides its interrupted finish,
//      and the rollback writes the raw array minus its tail - entries the
//      sanitizer stripped stay in storage byte-for-byte.
//   B: B-12 - buildSnap on a live run whose streets carry NO recorded
//      stamps still archives the run's startedAt (the run start is the
//      fallback), and the startMs-keyed bake (workM) lands.
//   C: C-02 + A-08 - failed saves SURFACE: the Stay-awake switch reverts
//      and toasts on a failed saveSettings, and a theme-override write
//      that fails answers with the same toast.
//   D: C-06 - Settings' Back runs the backup pane's xMode walk ONLY
//      while the backup pane is active; from any other pane it returns
//      to the main pane, and the walk still works on its own pane.
//   E: C-09 - doRestore is single-flight: a second call while a restore
//      is in flight starts no competing restore; the door reopens after.
//   F: C-03 + C-04 - the "was anything ever downloaded" test reads EVERY
//      route's preload record; Status names the union when more than
//      one route exists, adds the active route's own share, and the
//      reset line falls back to any route's download record.
//   G: B-04 + B-09 (map-live) - a multi-select's glow carries one feature
//      per selected stretch, and GLP.setFont re-fonts the label layers
//      already on the map.
//   H: B-10 + A-05 (map-live, destructive - runs last) - unloading to the
//      boot picker keeps the route POI at its last real centre instead
//      of [0,0], and the counter on the empty geometry reads 0%, not NaN%.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const JA = async (expr) => { const raw = await ev(`(async () => { try { return JSON.stringify(await (${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof restoreBackup === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const toMenu = async () => { await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200); };
const loadSettled = async () => { await ev(`loadRoute('5w'); true`); await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000); await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000); await sleep(300); };
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;

try {
  await toMenu(); await loadSettled();

  // ---- A: A-04 raw-history reconciliation ----
  const a = await J(`(() => {
    const rk = LS; // seed through the LIVE key set - on a fresh install the loader runs on the legacy keyspace, whose start key is not routeKeys('5w')'s
    const T = 1767225600000; // the interrupted run's start (2026-01-01T00:00:00Z)
    const older = { at: new Date(T - 86400000).toISOString(), items: { Velmar: new Date(T - 86000000).toISOString(), 'Ghost Street': new Date(T - 85000000).toISOString() }, runId: T - 86400000, sides: { p: {}, t: {} } };
    const phantom = { at: new Date(T + 3600000).toISOString(), items: { 'Ghost Street': new Date(T + 60000).toISOString() }, runId: T, sides: { p: {}, t: {} } }; // every street it names is unknown to the current pack - the load sanitizer drops the whole entry
    localStorage.setItem(rk.hist, JSON.stringify([older, phantom]));
    localStorage.setItem(rk.start, String(T));
    localStorage.setItem(rk.sides, JSON.stringify({ p: { Velmar: STRETCH['Velmar'].parts.map(() => 3) }, t: {} })); // the interrupted run's board, never cleared: the phantom's own street is gone from the pack (its marks vanish with it), but the run's in-progress marks on a surviving street keep the board non-empty - the rollback signature (matching run identity + board not cleared)
    loadRouteState('5w');
    const stored = JSON.parse(localStorage.getItem(rk.hist) || '[]');
    return { storedLen: stored.length, ghostKept: !!(stored[0] && stored[0].items && 'Ghost Street' in stored[0].items), memLen: history.length, runStart };
  })()`);
  ok('A1 the rollback fired on the RAW tail: storage lost the phantom entry (2 -> 1) | ' + JSON.stringify({ storedLen: a.storedLen }), a.storedLen === 1);
  ok('A2 the surviving entry is stored byte-for-byte RAW - the sanitizer\'s strip of its unknown street was never persisted | ghostKept: ' + a.ghostKept, a.ghostKept === true);
  ok('A3 memory holds the one real clean and the interrupted run stays live for its own resolution | ' + JSON.stringify({ memLen: a.memLen, runStart: a.runStart }), a.memLen === 1 && a.runStart === 1767225600000);

  await toMenu(); await loadSettled();

  // ---- B: B-12 buildSnap with no recorded stamps ----
  const b = await J(`(() => {
    const T = 1767225600000;
    const savedPieces = pieces['Velmar'];
    pieces['Velmar'] = pieces['Velmar'].map(() => 3);
    doneSet.clear(); doneSet.add('Velmar');
    doneTimes['Velmar'] = null; // completed, but its moment was never recorded
    runStart = T;
    const snap = buildSnap();
    pieces['Velmar'] = savedPieces; doneSet.clear(); delete doneTimes['Velmar']; runStart = 0;
    return { startedAt: snap && snap.startedAt, hasWorkM: !!snap && 'workM' in snap, items: snap && snap.items && snap.items['Velmar'] };
  })()`);
  ok('B1 a stamp-less live run still archives its startedAt (the run start is the fallback) | ' + JSON.stringify(b), b.startedAt === new Date(1767225600000).toISOString() && b.items === null);
  ok('B2 the startMs-keyed bake lands (workM present on the entry) | hasWorkM: ' + b.hasWorkM, b.hasWorkM === true);

  // ---- C: C-02 + A-08 failed saves surface ----
  const c1 = await J(`(() => {
    const before = settings.awake;
    const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error('quota'); };
    document.getElementById('swAwake').click();
    Storage.prototype.setItem = orig;
    const t = document.getElementById('toast');
    return { before, after: settings.awake, toast: t.textContent, shown: t.classList.contains('show') };
  })()`);
  ok('C1 a failed Stay-awake save REVERTS the value and toasts (the 1.113 contract) | ' + JSON.stringify(c1), c1.after === c1.before && c1.toast === 'Not saved — storage problem' && c1.shown === true);
  const c2 = await J(`(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === LS.night || k === LS.nightExp) throw new Error('quota'); return orig.call(this, k, v); };
    setThemeOverride(true);
    Storage.prototype.setItem = orig;
    const t = document.getElementById('toast');
    return { toast: t.textContent, shown: t.classList.contains('show'), override: themeOverride };
  })()`);
  ok('C2 a failed theme-override write answers with the not-saved toast; the override still applies for the session | ' + JSON.stringify(c2), c2.toast === 'Not saved — storage problem' && c2.shown === true && c2.override === true);

  // ---- D: C-06 Back walks xMode only on the backup pane ----
  const d = await J(`(() => {
    showSetPane('setMainPane');
    xMode = 'text'; // left over from an earlier Backup visit
    document.getElementById('setBack').click();
    const offPane = { xMode, mainOn: document.getElementById('setMainPane').classList.contains('on') };
    showSetPane('setBackupPane'); showX('text');
    document.getElementById('setBack').click();
    const onPane = { xMode };
    showSetPane('setMainPane');
    return { offPane, onPane };
  })()`);
  ok('D1 Back from a NON-backup pane leaves the hidden backup view alone and lands on the main pane | ' + JSON.stringify(d.offPane), d.offPane.xMode === 'text' && d.offPane.mainOn === true);
  ok('D2 Back on the backup pane still walks the backup tree (text -> restore) | ' + JSON.stringify(d.onPane), d.onPane.xMode === 'restore');

  // ---- E: C-09 doRestore single-flight ----
  const e1 = await JA(`(async () => {
    const origRB = restoreBackup; let calls = 0;
    restoreBackup = async (p) => { calls++; await new Promise(r => setTimeout(r, 250)); return origRB(p); };
    document.getElementById('xText').value = 'null';
    doRestore(); doRestore();
    const during = calls;
    await new Promise(r => setTimeout(r, 500));
    doRestore();
    const after = calls;
    restoreBackup = origRB;
    return { during, after };
  })()`);
  ok('E1 a second doRestore while one is in flight starts NO competing restore | calls during: ' + e1.during, e1.during === 1);
  ok('E2 the door reopens once the restore settles | calls after: ' + e1.after, e1.after === 2);

  // ---- F: C-03 + C-04 any-route records + Status labels ----
  const f = await JA(`(async () => {
    const noneAtAll = anyPreloadRecord();
    const fake = { id: 'zztest', name: 'ZZ Test', area: 'Nowhere', mains: [], roads: {}, reference: {}, box: { w: -79.60, s: 43.80, e: -79.50, n: 43.90 } };
    ROUTE_PACKS.push(fake);
    const rkz = routeKeys('zztest');
    const zTotal = packTileUrls(fake).size;
    localStorage.setItem(rkz.pre, JSON.stringify({ at: Date.now(), saved: 3, total: 999, routeSaved: 3, routeTotal: zTotal }));
    const anyRec = anyPreloadRecord();
    const ps = await packState();
    const zz = ps.countsByRoute.find(r => r.id === 'zztest');
    await renderStatus(false);
    const sub = document.getElementById('stMapsSub').textContent;
    localStorage.removeItem(routeKeys('5w').pre);
    await renderStatus(true);
    const pre = document.getElementById('xPreStat').textContent;
    ROUTE_PACKS.splice(ROUTE_PACKS.indexOf(fake), 1);
    localStorage.removeItem(rkz.pre);
    return { noneAtAll, anyRec, zTotal, zzTotal: zz && zz.total, sub, pre };
  })()`);
  ok('F1 with NO records anywhere the downloaded test reads false; a record under ANOTHER route alone reads true | ' + JSON.stringify({ noneAtAll: f.noneAtAll, anyRec: f.anyRec }), f.noneAtAll === false && f.anyRec === true);
  ok('F2 packState carries the other route\'s own count (its tile list, not the union) | ' + JSON.stringify({ zTotal: f.zTotal, zzTotal: f.zzTotal }), f.zTotal > 0 && f.zzTotal === f.zTotal);
  ok('F3 the Status sub-line names the UNION and the active route\'s own share | sub: ' + f.sub, /2 routes/.test(f.sub || '') && /this route:/.test(f.sub || ''));
  ok('F4 the reset line falls back to any route\'s download record instead of contradicting the maps line | pre: ' + f.pre, /^Offline maps downloaded /.test(f.pre || ''));

  // ---- G: B-04 + B-09 on the live map ----
  const mapUp = await poll(`typeof map !== 'undefined' && !!map && !!map.getSource && !!map.getSource('selGlow') && !!map.getLayer && !!map.getLayer('streetnamespt1')`, 20000).catch(() => false);
  const g = mapUp ? await J(`(() => {
    selSet = [{ name: 'Velmar', idx: 0 }, { name: 'Mellings', idx: 0 }];
    sel = selSet[0];
    GLP.syncSel();
    const glow = map.getSource('selGlow').serialize().data;
    const fontBefore = map.getLayoutProperty('streetnamespt1', 'text-font');
    GLP.setFont(['ZZ Test Font']);
    const fontAfter = map.getLayoutProperty('streetnamespt1', 'text-font');
    const poiAfter = map.getLayoutProperty('routepoi-txt', 'text-font');
    GLP.setFont(fontBefore);
    return { glowN: glow && glow.features ? glow.features.length : -1, fontBefore, fontAfter, poiAfter };
  })()`) : { glowN: -1 };
  ok('G1 a two-stretch selection glows TWO features (one per stretch, not just the anchor) | glowN: ' + g.glowN + (mapUp ? '' : ' (map never came up in this environment)'), g.glowN === 2);
  ok('G2 setFont re-fonts the LIVE label layers (street names + route POI) | ' + JSON.stringify({ before: g.fontBefore, after: g.fontAfter, poi: g.poiAfter }), JSON.stringify(g.fontAfter) === JSON.stringify(['ZZ Test Font']) && JSON.stringify(g.poiAfter) === JSON.stringify(['ZZ Test Font']));

  // ---- H: B-10 + A-05 after unload (destructive - last) ----
  const h = mapUp ? await J(`(() => {
    const poi = map.getSource('routepoi').serialize().data;
    const before = poi && poi.geometry ? poi.geometry.coordinates.slice() : null;
    unloadRouteToBoot();
    const poi2 = map.getSource('routepoi').serialize().data;
    const after = poi2 && poi2.geometry ? poi2.geometry.coordinates.slice() : null;
    updateCount();
    return { before, after, count: document.getElementById('countTxt').textContent, width: document.getElementById('countFill').style.width };
  })()`) : { before: null, after: null, count: '', width: '' };
  ok('H1 the route POI survives an empty-geometry unload at its real centre (never [0,0]) | ' + JSON.stringify({ before: h.before, after: h.after }), !!h.before && !!h.after && h.after[0] === h.before[0] && h.after[1] === h.before[1] && !(h.after[0] === 0 && h.after[1] === 0));
  ok('H2 the counter on empty geometry reads 0%, not NaN% | ' + JSON.stringify({ count: h.count, width: h.width }), /· 0%$/.test(h.count || '') && h.width === '0%');
  ok('H3 no page exception across drive190 | exc: ' + exc(), exc() === 0);
} catch (e) {
  ok('drive190 completed without a harness-level throw: ' + String(e && e.message || e), false);
}
finish(R, proc);
