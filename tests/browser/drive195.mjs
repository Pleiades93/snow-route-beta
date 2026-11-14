import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive195: Beta 1.193 - THE KILL TEST (Andrew's acceptance gate for the trail
// redesign + counter hardening round). A simulated long clean is fed through
// the real recording path (acceptFix, synthetic fixes on a fake clock, the
// drive194 pattern) along a straight line at a constant 2.5 m/s. The property
// under test is LOSSLESSNESS: what a kill/reload recovers must equal what the
// live counter had banked, within a few metres - that banked figure is the
// reference at every kill. As a sanity bound the banked figure is also held
// within 0.25% of the fed path's spherical-haversine length (computed
// in-page, independently): the app's distM is a flat-earth measure with
// route-calibrated constants (MLAT 111320 / MLNG 80386, app1), which prices
// this eastward path ~0.2% above the sphere - a model difference, not a
// loss, and the bound exists to catch real losses (dropped or doubled
// segments would blow far past it).
// Claims:
//   K1 the app is killed/reloaded at simulated hour 1: the banked records
//      were current to the last fix (primary and mirror both hold the live
//      figure), adoption recovers it within a few metres, and the resident
//      trail is the window (<= 3601 points, span <= 3600 s).
//   K2 the same at simulated hour 5 (path ~45 km).
//   K3 the same at simulated hour 7.5 (path ~67.5 km) - past the old trail
//      cap's span and past a full real clean's length.
//   K4 with the PRIMARY record destroyed (in-page, drive187's P2 idiom - a
//      reload's pagehide flush would honestly re-bank it, so the adoption
//      order is isolated in-page), adoption recovers the MIRROR's figure
//      within the same few metres.
//   K5 with BOTH copies destroyed, recovery equals the window's own trailKm
//      exactly - the named residual (the last hour), and nothing more: it is
//      tens of kilometres below the 7.5 h total.
//   K6 no trail surface exists on the map (no 'trail' source, no
//      'trail-line' layer) at any point.
//   K9 the crash Codex's gate review found (PR #38, P2): per-fix banking
//      leaves the counter AHEAD of the stored trail when the process dies
//      inside the trail's flush buffer. Fault-injected deterministically -
//      the stored trail is truncated by 40 points (500 m) under a live
//      banked counter, the app reloads with NO flush, and the first segment
//      banked after adoption must be one step (~12.5 m), not the ~512 m
//      re-measure of already-banked travel. The banked record's endpoint
//      (end) is what adoption restores into the trail to make it so.
//   K7 finishing the run (3 streets marked - the archive path; an under-3
//      finish is the board-clear path by standing rule) archives a clean
//      with NO path and NO pathShortened, and Finish clears the stored
//      window and both counter records.
//   K8 a Beta 1.190-format backup (a long finished-run trail + an archived
//      clean carrying a path and the truncation flag) restores cleanly: the
//      archived entry keeps its path, the restored trail is windowed to the
//      pack's live run - none - so it lands EMPTY, and the app boots sane.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const reloadPage = async () => { // drive194's proven reload idiom
  await ev(`(() => { window.__d195probe = 1; location.reload(); return true; })()`).catch(() => {});
  let gone = false; for (let i = 0; i < 40 && !gone; i++) { try { gone = await ev(`typeof window.__d195probe === 'undefined' && !!document.getElementById('ver')`); } catch (e) {} if (!gone) await sleep(300); }
  await waitBoot(); await bootThrough(ev, poll); return gone;
};
// The fake clock + feeder install (re-run after every reload). fakeNow starts
// at the run's own timeline position; the feeder advances it 5 s per fix.
const install = async (fakeNowMs, seedPrev) => J(`(() => {
  window.__fakeT0 = Date.now(); window.__fakeNow = ${Math.round(fakeNowMs)};
  const rp = performance.now();
  Date.now = () => window.__fakeNow;
  performance.now = () => rp - 3600000 + (window.__fakeNow - window.__fakeT0);
  window.__lat195 = 43.82; window.__dlng195 = (12.5 / 6371000) * (180 / Math.PI) / Math.cos(43.82 * Math.PI / 180); // one fix every 5 s of fake time at 2.5 m/s = 12.5 m per step (the pair rule's 300 s gap allowance makes the cadence free; the timeline, not the fix count, is what the window and the kills measure)
  window.__prev195 = ${seedPrev ? JSON.stringify(seedPrev) : 'null'}; window.__truth195 = 0;
  window.__hav195 = (a, b) => { const dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(h)); };
  window.__feed195 = (n) => { for (let i = 0; i < n; i++) { window.__fakeNow += 5000; const p = window.__prev195 ? [window.__lat195, window.__prev195[1] + window.__dlng195] : [window.__lat195, -79.5660]; if (window.__prev195 && !window.__skip195) window.__truth195 += window.__hav195(window.__prev195, p); window.__skip195 = false; window.__prev195 = p; acceptFix({ coords: { latitude: p[0], longitude: p[1], accuracy: 8, speed: 2.5, heading: 90 }, timestamp: Date.now() }); } return { truth: window.__truth195, prev: window.__prev195 }; };
  return { at: Date.now() };
})()`);
try {
  ok('S0 app boots with the map active', await poll(`typeof glOk !== 'undefined' && glOk === true`, 30000));
  await install(Date.now(), null);
  // Warm-up (mirrors real use - location is ON and tracking before Start Clean
  // is pressed): 120 view-only fixes converge the estimator at the feed speed,
  // so the run's truth is not polluted by the filter's cold-start transient
  // (the counter sums segments over the SMOOTHED positions the trail stores;
  // a cold feed at instant full speed lengthened that path by ~17 m in the
  // first hour on this drive's first run). Nothing records in view-only mode.
  await J(`(() => { Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: (okCb, errCb) => { window.__wp = okCb; return 777; }, clearWatch: () => {} }, configurable: true }); startGps(false); return true; })()`);
  await J(`window.__feed195(24)`); // 24 fixes x 5 s = 120 s of warm tracking
  const started = await J(`(() => { startClean(); window.__skip195 = true; window.__truth195 = 0; return { rs: runStart, wid: watchId, gfr: gpsFromRun, tl: trail.length }; })()`);
  ok('S1 the clean starts on the already-running stubbed watch, estimator warm, trail empty | ' + JSON.stringify(started), started.rs > 0 && started.wid === 777 && started.gfr === true && started.tl === 0);
  // After a kill the app resumes the run's GPS itself on the phone; the drive
  // mirrors that resume path explicitly (re-stub + startGps(true)) - recording
  // is gated on gpsFromRun (Beta 1.49: only a clean's own GPS records), and a
  // bare bootThrough leaves it false.
  const resumeRun = async () => J(`(() => { Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: (okCb, errCb) => { window.__wp = okCb; return 777; }, clearWatch: () => {} }, configurable: true }); startGps(true); return { wid: watchId, gfr: gpsFromRun }; })()`);
  let truth = 0; // metres, summed from the feeder's independent haversine per leg
  const leg = async (n) => { const r = await J(`window.__feed195(${n})`); truth += r.truth; return r; };
  const banked = async () => J(`(() => { flushAux(true); return { m: runDist.m, pri: JSON.parse(localStorage.getItem(LS.rundist) || 'null'), mir: JSON.parse(localStorage.getItem(LS.rundist2) || 'null'), tl: trail.length, newest: trail.length ? trail[trail.length - 1][2] : 0, oldest: trail.length ? trail[0][2] : 0 }; })()`);
  const recover = async () => J(`(() => { adoptRunDist(); return { rec: runDist.m, tl: trail.length, newest: trail.length ? trail[trail.length - 1][2] : 0, oldest: trail.length ? trail[0][2] : 0 }; })()`);

  // ---- K1: kill at hour 1 ----
  await leg(720);
  const b1 = await banked();
  ok('K1a at hour 1 the banked primary AND mirror both hold the live figure exactly (banking is current to the last fix), and the figure is within 0.25% of the fed path\u2019s spherical length | ' + JSON.stringify({ truth, b1m: b1.m, pri: b1.pri && b1.pri.m, mir: b1.mir && b1.mir.m }),
    Math.abs((b1.pri || {}).m - b1.m) < 0.01 && Math.abs((b1.mir || {}).m - b1.m) < 0.01 && Math.abs(b1.m - truth) <= 0.0025 * truth);
  await reloadPage();
  await resumeRun();
  const rs1 = await J(`runStart`);
  await install(rs1 + 3600000, null);
  const r1 = await recover();
  // reseed the feeder's cursor from the resident trail's last point
  await J(`(() => { const last = trail[trail.length - 1]; window.__prev195 = [last[0], last[1]]; return true; })()`);
  ok('K1b after the hour-1 kill, adoption recovers the banked figure within a few metres (lossless), and the resident trail is exactly the window | ' + JSON.stringify({ banked: b1.m, rec: r1.rec, tl: r1.tl, span: r1.newest - r1.oldest }),
    Math.abs(r1.rec - b1.m) <= 5 && r1.tl <= 3601 && (r1.newest - r1.oldest) <= 3600);

  // ---- K2: kill at hour 5 ----
  await leg(2880);
  const b2 = await banked();
  await reloadPage();
  await resumeRun();
  const rs2 = await J(`runStart`);
  await install(rs2 + 18000000, null);
  const r2 = await recover();
  await J(`(() => { const last = trail[trail.length - 1]; window.__prev195 = [last[0], last[1]]; return true; })()`);
  ok('K2 after the hour-5 kill, adoption recovers the banked figure within a few metres, and the bank is within 0.25% of the ~45 km path | ' + JSON.stringify({ truth, banked: b2.m, rec: r2.rec }),
    Math.abs(r2.rec - b2.m) <= 5 && Math.abs(b2.m - truth) <= 0.0025 * truth);

  // ---- K3: kill at hour 7.5 ----
  await leg(1800);
  const b3 = await banked();
  await reloadPage();
  await resumeRun();
  const r3 = await recover();
  ok('K3 after the hour-7.5 kill, adoption recovers the banked figure within a few metres, and the bank is within 0.25% of the ~67.5 km path | ' + JSON.stringify({ truth, banked: b3.m, rec: r3.rec }),
    Math.abs(r3.rec - b3.m) <= 5 && Math.abs(b3.m - truth) <= 0.0025 * truth);
  const surf = await J(`(() => ({ src: !!map.getSource('trail'), layer: !!map.getLayer('trail-line') }))()`);
  ok('K6 no trail surface exists on the map (no trail source, no trail-line layer) | ' + JSON.stringify(surf), surf.src === false && surf.layer === false);

  // ---- K9: crash with the trail's buffered write lost (Codex PR #38, P2) ----
  const rs3 = await J(`runStart`);
  await install(rs3 + 27000000, null);
  await J(`(() => { const last = trail[trail.length - 1]; window.__prev195 = [last[0], last[1]]; return true; })()`);
  await leg(240); // 20 more minutes in this page; counter and trail advance together
  const tail9 = await J(`trail[trail.length - 1]`); // the true tail - the phone never moves; only storage is about to lose it
  const b9 = await J(`(() => { const st = JSON.parse(localStorage.getItem(LS.trail) || '[]'); localStorage.setItem(LS.trail, JSON.stringify(st.slice(0, -40))); return { m: runDist.m, cut: st.length - 40 }; })()`); // the fault: the stored trail now ends 40 points (500 m) behind the banked counter. NO flush - a flush would land the true trail and heal the fault, which is exactly what a hard crash prevents
  await reloadPage();
  await resumeRun();
  await install(rs3 + 28200000, null);
  const r9 = await recover();
  await J(`(() => { window.__prev195 = [${tail9[0]}, ${tail9[1]}]; return true; })()`); // the feeder continues from the TRUE position, not from the stored trail's truncated tail
  await leg(1);
  const m9 = await J(`runDist.m`);
  ok('K9 after a crash that loses the trail\u2019s buffered tail, adoption recovers the banked figure AND the first new segment is one step (~12.5 m), not a re-measure of banked travel | ' + JSON.stringify({ banked: b9.m, rec: r9.rec, firstSeg: m9 - r9.rec, storedAfterCut: b9.cut }),
    Math.abs(r9.rec - b9.m) <= 5 && (m9 - r9.rec) >= 0 && (m9 - r9.rec) <= 13.5);
  await leg(120); // 10 more minutes - the run continues clean on the restored endpoint
  const b9b = await banked();
  ok('K9b the continued run stays within 0.25% of the fed path (no double-count residue) | ' + JSON.stringify({ truth, banked: b9b.m }),
    Math.abs(b9b.m - truth) <= 0.0025 * truth);

  // ---- K4: primary destroyed - the mirror carries it ----
  const k4 = await J(`(() => { localStorage.removeItem(LS.rundist); runDist = { run: 0, m: 0 }; adoptRunDist(); return { rec: runDist.m, mir: JSON.parse(localStorage.getItem(LS.rundist2) || 'null') }; })()`);
  ok('K4 with the primary record destroyed, adoption recovers the MIRROR\u2019s figure within a few metres of the banked total | ' + JSON.stringify({ banked: b9b.m, rec: k4.rec, mirM: k4.mir && k4.mir.m }),
    Math.abs(k4.rec - b9b.m) <= 5 && Math.abs((k4.mir || {}).m - b9b.m) < 0.01);

  // ---- K5: both copies destroyed - exactly the window, nothing more ----
  const k5 = await J(`(() => { localStorage.setItem(LS.rundist, 'corrupt'); localStorage.setItem(LS.rundist2, 'corrupt'); runDist = { run: 0, m: 0 }; adoptRunDist(); return { rec: runDist.m, tk: trailKm(runStart) * 1000, tl: trail.length }; })()`);
  ok('K5 with BOTH copies destroyed, recovery equals the window\u2019s own distance exactly (the named residual) and is tens of km below truth | ' + JSON.stringify({ truth, rec: k5.rec, tk: k5.tk, tl: k5.tl }),
    Math.abs(k5.rec - k5.tk) < 0.001 && k5.rec > 8000 && (truth - k5.rec) > 30000);

  // ---- K7: finish archives no path; the window and records clear ----
  await J(`(() => { markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); return true; })()`);
  await ev(`finishRun(); true`);
  await ev(`flushAux(true); true`); // the page-death flush: Finish flags the cleared trail dirty and the buffered write lands here (the app's own cadence - the load window makes any lag harmless)
  let k7 = {};
  for (let i = 0; i < 33; i++) { k7 = await J(`(() => { const e = history[history.length - 1] || {}; return { km: e.km, hasPath: 'path' in e, hasFlag: 'pathShortened' in e, trailStored: localStorage.getItem(LS.trail), pri: localStorage.getItem(LS.rundist), mir: localStorage.getItem(LS.rundist2) }; })()`); if (typeof k7.km === 'number') break; await sleep(300); }
  ok('K7 the finished clean archives with NO path and NO pathShortened, and Finish clears the stored window and both counter records | ' + JSON.stringify(k7),
    k7.hasPath === false && k7.hasFlag === false && k7.km > 8 && k7.trailStored === '[]' && k7.pri === null && k7.mir === null);

  // ---- K8: a Beta 1.190-format backup restores cleanly ----
  const k8prep = await J(`(() => { const bak = JSON.parse(buildBackup()); const f = bak.routes['5w']; if (!f) return { err: 'no 5w pack' }; const nowS = Math.floor(Date.now() / 1000); const pts = []; for (let i = 0; i < 300; i++) pts.push([+(43.82 + i * 0.00001).toFixed(6), -79.566, nowS - 10800 + i * 36]); f.trail = JSON.stringify(pts); delete f.start; const hist = JSON.parse(f.hist || '[]'); hist.push({ at: new Date((nowS - 9000) * 1000).toISOString(), items: { Velmar: null }, via: {}, notes: {}, sides: { p: {}, t: {} }, km: 12.3, startedAt: new Date((nowS - 10800) * 1000).toISOString(), path: [[43.82, -79.566, nowS - 10800], [43.821, -79.565, nowS - 10740]], pathShortened: true }); f.hist = JSON.stringify(hist); window.__bak195 = JSON.stringify(bak); return { pts: pts.length, histN: hist.length }; })()`);
  ok('K8a the 1.190-format fixture builds (300 finished-run trail points + an archived clean with a path) | ' + JSON.stringify(k8prep), k8prep.pts === 300);
  await ev(`(() => { restoreBackup(JSON.parse(window.__bak195)); return true; })()`);
  let k8 = {};
  for (let i = 0; i < 20; i++) { k8 = await J(`(() => { const h = JSON.parse(localStorage.getItem(LS.hist) || '[]'); const leg = h[h.length - 1] || {}; return { trailStored: localStorage.getItem(LS.trail), legKm: leg.km, legPath: Array.isArray(leg.path) ? leg.path.length : -1, legFlag: leg.pathShortened === true }; })()`); if (k8.legKm === 12.3) break; await sleep(300); }
  ok('K8b the restore windows the legacy trail to the pack\u2019s live run - none - so it lands EMPTY, while the archived clean keeps its path and flag | ' + JSON.stringify(k8),
    k8.trailStored === '[]' && k8.legKm === 12.3 && k8.legPath === 2 && k8.legFlag === true);
  await reloadPage();
  const k8c = await J(`(() => ({ tl: trail.length, boots: typeof runDist === 'object' }))()`);
  ok('K8c after the restore the app boots sane with an empty resident trail | ' + JSON.stringify(k8c), k8c.tl === 0 && k8c.boots === true);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
