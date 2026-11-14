import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive194: Beta 1.189 - the raw fix log. A DEBUGGING instrument in the trail's
// family: every fix the watch delivers is recorded in acceptFix BEFORE any gate
// can refuse it (raw fields verbatim, nulls included), with the estimator's
// outputs for the same fix beside it, segmented by locate-on session, persisted
// on-device, capped, and carried ONLY inside the backup JSON. Claims:
//   L1 fixes fed through the REAL watch path (a stubbed geolocation whose
//      captured callback is startGps's own) are recorded verbatim and in order -
//      a null-speed/null-heading fix keeps its nulls, an accuracy-gated fix and
//      an out-of-order fix are recorded with a null output slot - and each
//      accepted fix's recorded outputs equal the app's own gpsPos / dispPos /
//      smHeading at that same synchronous instant. The session stamps the live
//      version; fixes carry the live run stamp (0 idle, the run's start inside).
//   L2 the log persists across a reload (the stored record and memory agree).
//   L3 a backup carries the log field-for-field; after wiping the device's log
//      and restoring, the log is the backup's, exactly.
//   L4 a pre-1.189 backup (no fixlog field) restores clean and leaves the
//      device's resident log byte-untouched (the missing-key rule).
//   L4b a fix delivered with a NON-FINITE coordinate - recorded before
//      acceptFix refuses it, serialized with a null coordinate, retained by
//      the on-device loader - survives a backup round-trip whole, session
//      included (the restore validator keeps what the loader keeps).
//   L5 the stationary behaviour is unchanged with logging on: drive127's own
//      noise table at its own corridor - the filtered position ends within
//      3 m of truth.
//   L6 the cap holds: FIXLOG_MAX is 36000; a flood evicts the oldest session
//      whole, then head-trims a lone session to its newest 36000 fixes.
//   L7 (Beta 1.190) the long clean fits and the bytes fit: a synthetic 8-hour
//      session (28,800 fixes) survives WHOLE under the 36,000 cap, zero
//      trimmed; a worst-case full-cap log (36,000 full-precision transit-speed
//      fixes with outputs and run stamps) written through the real save path
//      measures within the shared localStorage budget (the fixlog at most
//      4.0 MB; fixlog + 250 KB trail + 250 KB board/settings allowance at most
//      4.5 MB); and a 1.189-format (v1) fixture log loads field-for-field,
//      survives the validator, and re-saves in the e2 form without losing or
//      altering a single field (the stored-form equivalence proof).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const canon = v => { if (v === null || typeof v !== 'object') return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'; };
const hav = (a, b) => Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 80386);
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const reloadPage = async () => { // drive169's proven reload idiom
  await ev(`(() => { window.__d194probe = 1; location.reload(); return true; })()`).catch(() => {});
  let gone = false; for (let i = 0; i < 40 && !gone; i++) { try { gone = await ev(`typeof window.__d194probe === 'undefined' && !!document.getElementById('ver')`); } catch (e) {} if (!gone) await sleep(300); }
  await waitBoot(); await bootThrough(ev, poll); return gone;
};

ok('S0 app boots with the map active', await poll(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// ---------- L1: the real watch path records verbatim ----------
const base = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));
const T0 = 1760000000000;
const started = await J(`(() => { window.__wp = null; Object.defineProperty(navigator, 'geolocation', { value: { watchPosition: (okCb, errCb) => { window.__wp = okCb; return 777; }, clearWatch: () => {} }, configurable: true }); const t0 = Date.now(); startGps(false); return { wid: watchId, t0, sess: fixLogSession ? { v: fixLogSession.v, t0: fixLogSession.t0, n: fixLogSession.f.length } : null, sessions: fixLog.length }; })()`); // the stub must go through defineProperty: navigator.geolocation is a read-only prototype accessor, so a plain assignment is a silent no-op and the app would start the REAL watch (found on this drive's first run - the session still opened, the fixes never arrived)
ok('L1 startGps opens a log session stamped with the live version | ' + JSON.stringify(started),
  started.wid === 777 && !!started.sess && started.sess.v === 'Beta 1.190' && Math.abs(started.sess.t0 - started.t0) < 1000 && started.sess.n === 0);
const feed = async (f) => J(`(() => { window.__wp({ coords: { latitude: ${f[0]}, longitude: ${f[1]}, accuracy: ${f[2]}, speed: ${f[3]}, heading: ${f[4]} }, timestamp: ${f[5]} }); const s = fixLog[fixLog.length - 1]; return { ent: s.f[s.f.length - 1], gps: gpsPos, dsp: dispPos, smh: smHeading }; })()`);
const M = (e, n) => [base.lat + n / 111320, base.lng + e / 80386];
const p1 = M(0, 0), p2 = M(4, 1), p5 = M(14, 2);
const r1 = await feed([p1[0], p1[1], 8, 3.2, 90, T0]);
const r2 = await feed([p2[0], p2[1], 12, null, null, T0 + 1000]);
const r3 = await feed([p2[0], p2[1], 200, 3.0, 90, T0 + 2000]); // accuracy-gated (200 > 65 with a fresh lastGood): recorded, refused
const r4 = await feed([p1[0], p1[1], 9, 3.0, 90, T0 + 500]); // out of order (< lastFixTs T0+1000): recorded, refused
const r5 = await feed([p5[0], p5[1], 6, 4.0, 92, T0 + 3000]);
const log1 = await J(`({ sessions: fixLog.length, entries: fixLog[fixLog.length - 1].f })`);
ok('L1 all five delivered fixes are recorded, in order | sessions=' + log1.sessions + ' entries=' + (log1.entries || []).length,
  log1.sessions >= 1 && !!log1.entries && log1.entries.length === 5);
const rawEq = (ent, f) => !!ent && ent[0] === f[5] && ent[1] === f[0] && ent[2] === f[1] && ent[3] === f[2] && ent[4] === f[3] && ent[5] === f[4] && ent[7] === 0;
ok('L1 the raw fields are verbatim - every field, in order | ' + JSON.stringify((log1.entries || []).map(e => e && e.slice(0, 6))),
  rawEq(log1.entries[0], [p1[0], p1[1], 8, 3.2, 90, T0]) && rawEq(log1.entries[1], [p2[0], p2[1], 12, null, null, T0 + 1000]) && rawEq(log1.entries[2], [p2[0], p2[1], 200, 3.0, 90, T0 + 2000]) && rawEq(log1.entries[3], [p1[0], p1[1], 9, 3.0, 90, T0 + 500]) && rawEq(log1.entries[4], [p5[0], p5[1], 6, 4.0, 92, T0 + 3000]));
ok('L1 nulls are kept as delivered (the stationary-style fix reports no speed, no heading)',
  log1.entries[1][4] === null && log1.entries[1][5] === null);
ok('L1 the refused fixes carry a null output slot; the accepted carry outputs',
  log1.entries[2][6] === null && log1.entries[3][6] === null && Array.isArray(log1.entries[0][6]) && Array.isArray(log1.entries[1][6]) && Array.isArray(log1.entries[4][6]));
const outEq = (r) => !!r.ent && Array.isArray(r.ent[6]) && Math.abs(r.ent[6][0] - r.gps[0]) <= 1e-6 && Math.abs(r.ent[6][1] - r.gps[1]) <= 1e-6 && Math.abs(r.ent[6][2] - r.dsp[0]) <= 1e-6 && Math.abs(r.ent[6][3] - r.dsp[1]) <= 1e-6 && (r.smh === null ? r.ent[6][4] === null : Math.abs(r.ent[6][4] - Math.round(r.smh * 10) / 10) <= 0.051);
ok('L1 each accepted fix\'s recorded outputs equal the app\'s own filtered position, display position and smoothed heading at that instant',
  outEq(r1) && outEq(r2) && outEq(r5));
// the run stamp inside the stream: a fix delivered while a clean runs carries its start
await ev(`(() => { runStart = ${T0}; gpsFromRun = true; return true; })()`);
const p6 = M(20, 3);
const r6 = await feed([p6[0], p6[1], 7, 4.2, 95, T0 + 4000]);
await ev(`(() => { runStart = 0; gpsFromRun = false; stopGps(); return true; })()`);
ok('L1 a fix delivered inside a clean carries the run\'s stamp; the session closes with the watch | run=' + (r6.ent && r6.ent[7]),
  !!r6.ent && r6.ent[7] === T0 && Array.isArray(r6.ent[6]));
const closed = await J(`({ sessNull: fixLogSession === null, wid: watchId, entries: fixLog[fixLog.length - 1].f.length })`);
ok('L1 stopGps closes the session (the watch is off, six entries kept)', closed.sessNull === true && closed.wid === null && closed.entries === 6);

// ---------- L2: persistence across a reload ----------
await ev(`(() => { flushAux(true); return true; })()`);
const stored = await J(`(() => { const raw = localStorage.getItem(LS.fixlog); return { raw, mem: fixLog }; })()`);
const storedDec = await J(`fixLogDecodeSessions(JSON.parse(localStorage.getItem(LS.fixlog)))`);
ok('L2 the forced flush lands the log in storage in the e2 form, decoding back to memory exactly',
  typeof stored.raw === 'string' && JSON.parse(stored.raw).e === 2 && canon(storedDec) === canon(stored.mem));
await reloadPage();
const afterReload = await J(`({ fixLog, storedRaw: localStorage.getItem(LS.fixlog) })`);
ok('L2 the log survives a reload - memory rebuilt from storage, field-for-field',
  canon(afterReload.fixLog) === canon(stored.mem) && afterReload.storedRaw === stored.raw);

// ---------- L3: the backup round-trip ----------
await ev(`(() => { markDone('Velmar', 'tap'); saveAll(); return true; })()`); await sleep(300); // a non-trivial board, so L4 can prove the old backup's board lands
const bakStr = await ev(`buildBackup()`);
const bak = bakStr ? JSON.parse(bakStr) : null;
const bakDec = bak && typeof bak.fixlog === 'string' ? await J(`fixLogDecodeSessions(JSON.parse(${JSON.stringify(bak.fixlog)}))`) : null;
ok('L3 the backup carries the fix log, field-for-field | fixlog=' + (bak ? typeof bak.fixlog : 'NO BACKUP'),
  !!bak && typeof bak.fixlog === 'string' && canon(bakDec) === canon(stored.mem));
await ev(`(() => { localStorage.removeItem(LS.fixlog); return true; })()`);
await reloadPage();
const wiped = await J(`fixLog.length`);
ok('L3 setup: with the stored log wiped, the rebuilt log is empty', wiped === 0);
await ev(`(async () => { await restoreBackup(JSON.parse(${JSON.stringify(JSON.stringify(bak))})); return true; })()`);
await sleep(3500); // the restore reloads
await waitBoot(); await bootThrough(ev, poll);
const restored = await J(`fixLog`);
ok('L3 after the restore, the device log IS the backup\'s log, exactly', canon(restored) === canon(stored.mem));

// ---------- L4: a pre-1.189 backup restores clean, the resident log untouched ----------
const marker = [{ v: 'MARKER', t0: T0, f: [[T0, base.lat, base.lng, 10, null, null, null, 0]] }];
await ev(`(() => { localStorage.setItem(LS.fixlog, ${JSON.stringify(JSON.stringify(marker))}); return true; })()`);
await reloadPage();
const oldBak = { ...bak }; delete oldBak.fixlog; // the pre-1.189 shape: every field but the log
await ev(`(async () => { await restoreBackup(JSON.parse(${JSON.stringify(JSON.stringify(oldBak))})); return true; })()`);
await sleep(3500); // the restore reloads
await waitBoot(); await bootThrough(ev, poll);
const afterOld = await J(`({ fixLog, storedRaw: localStorage.getItem(LS.fixlog), done: [...doneSet].length })`);
ok('L4 the old-format backup restores clean (its board lands) and the resident log is byte-untouched | done=' + afterOld.done,
  afterOld.done > 0 && afterOld.storedRaw === JSON.stringify(marker) && canon(afterOld.fixLog) === canon(marker));

// ---------- L4b: the refused non-finite fix survives the round-trip ----------
await ev(`(() => { fixLogOpen(); acceptFix({ coords: { latitude: NaN, longitude: ${base.lng}, accuracy: 10, speed: null, heading: null }, timestamp: ${T0} + 9000 }); fixLogClose(); flushAux(true); return true; })()`);
const nanBakStr = await ev(`buildBackup()`);
const nanBak = nanBakStr ? JSON.parse(nanBakStr) : null;
const nanEntry = (log) => { for (const s of log || []) for (const e of s.f || []) if (e[1] === null && e[2] === base.lng) return e; return null; };
const nanInBak = nanBak && typeof nanBak.fixlog === 'string' ? nanEntry(await J(`fixLogDecodeSessions(JSON.parse(${JSON.stringify(nanBak.fixlog)}))`)) : null;
ok('L4b the backup itself carries the refused non-finite fix (null coordinate, null output slot) | ' + JSON.stringify(nanInBak),
  !!nanInBak && nanInBak[6] === null);
await ev(`(() => { localStorage.removeItem(LS.fixlog); return true; })()`);
await reloadPage();
await ev(`(async () => { await restoreBackup(JSON.parse(${JSON.stringify(JSON.stringify(nanBak))})); return true; })()`);
await sleep(3500); // the restore reloads
await waitBoot(); await bootThrough(ev, poll);
const afterNan = await J(`fixLog`);
ok('L4b after the restore, the refused fix AND its session survive whole (the validator keeps what the loader keeps) | sessions=' + (afterNan || []).length,
  !!nanEntry(afterNan) && afterNan.length === 2);

// ---------- L5: stationary behaviour unchanged with logging on ----------
const NOISE = [[0, 0], [5, -3], [-6, 2], [3, 6], [-2, -6], [7, 1], [-5, -4], [1, 7], [-7, -1], [4, -5], [-3, 3], [6, 5], [-1, -7], [2, 2], [-4, 6], [5, -2]]; // drive127's own table
await ev(`(() => { window.__fakeT0 = Date.now(); window.__fakeNow = window.__fakeT0; const rp = performance.now(); Date.now = () => window.__fakeNow; performance.now = () => rp - 3600000 + (window.__fakeNow - window.__fakeT0); fixLogClose(); fixLogOpen(); return true; })()`);
for (const [e, n] of NOISE) { const ll = M(e, n); await ev(`(() => { window.__fakeNow += 300; acceptFix({ coords: { latitude: ${ll[0]}, longitude: ${ll[1]}, accuracy: 12, speed: 0, heading: null }, timestamp: Date.now() }); return true; })()`); }
const s5 = await J(`({ gps: gpsPos, entries: fixLog[fixLog.length - 1].f.length, withOut: fixLog[fixLog.length - 1].f.filter(x => Array.isArray(x[6])).length })`);
ok('L5 a stationary dot under +-7 m fix noise ends within 3 m of truth (drive127\'s corridor) | err ' + (s5.gps ? hav([base.lat, base.lng], s5.gps).toFixed(2) : 'NO GPS') + ' m',
  !!s5.gps && hav([base.lat, base.lng], s5.gps) < 3);
ok('L5 every stationary fix was logged with its estimator output', s5.entries === NOISE.length && s5.withOut === NOISE.length);

// ---------- L6: the cap ----------
const cap = await J(`(() => { const T = Date.now() + 1000; fixLogClose(); fixLogOpen(); for (let i = 1; i <= 100; i++) acceptFix({ coords: { latitude: 44 + i * 1e-7, longitude: -79.5, accuracy: 10, speed: 2, heading: 10 }, timestamp: T + i * 1000 }); fixLogClose(); fixLogOpen(); const S = fixLogSession; for (let i = 1; i <= 36050; i++) { S.f.push([T + 100000 + i * 1000, 44.1 + i * 1e-7, -79.5, 10, 2, 10, null, 0]); fixLogCount++; if (i % 5000 === 0) fixLogTrim(); } fixLogTrim(); const s = fixLog[fixLog.length - 1]; return { MAX: FIXLOG_MAX, sessions: fixLog.length, count: fixLogCount, lastN: s.f.length, firstLat: s.f[0][1], markerGone: !fixLog.some(x => x.v === 'MARKER') }; })()`); // Beta 1.190: the flood entries are pushed in the logger's own in-memory shape (2,000+ acceptFix calls proved the append path in 1.189; the claim here is the trim's end state, and the trim converges to it from any append cadence)
ok('L6 the cap constant is 36000 and the flood respects it | ' + JSON.stringify(cap),
  cap.MAX === 36000 && cap.count === 36000 && cap.lastN === 36000);
ok('L6 the oldest sessions are evicted whole; the lone surviving session is head-trimmed to its newest fixes (first survivor is flood fix 51)',
  cap.sessions === 1 && cap.markerGone === true && Math.abs(cap.firstLat - (44.1 + 51 * 1e-7)) < 1e-9);

// ---------- L7 (Beta 1.190): the long clean fits, the bytes fit, the old form replays ----------
const eight = await J(`(() => { fixLog = []; fixLogCount = 0; fixLogSession = null; fixLogOpen(); const S = fixLogSession; const T = 1761000000000; for (let i = 0; i < 28800; i++) { S.f.push([T + i * 1000, 44.2 + i * 1e-7, -79.6, 10, 2, 10, null, T]); fixLogCount++; } fixLogTrim(); return { n: S.f.length, count: fixLogCount, first: S.f[0][0], last: S.f[S.f.length - 1][0] }; })()`);
ok('L7 a full 8-hour clean (28,800 fixes in one session) survives WHOLE under the cap - zero trimmed | ' + JSON.stringify(eight),
  eight.n === 28800 && eight.count === 28800 && eight.first === 1761000000000 && eight.last === 1761000000000 + 28799000);
const bytes = await J(`(() => { let lat = 43.8147013, lng = -79.5593017; const T = 1762000000000, f = []; for (let i = 0; i < 36000; i++) { lat += 0.00013489871; lng -= 0.00002134567; f.push([T + i * 1000, lat, lng, Math.fround(5 + (i % 61) * 0.983), 14.9 + (i % 37) * 0.0137123456789, 355.12345678901234, [+lat.toFixed(6), +lng.toFixed(6), +lat.toFixed(6), +lng.toFixed(6), 355.1], T - 600000]); } fixLog = [{ v: 'Beta 1.190', t0: T, f }]; fixLogCount = 36000; fixLogSession = null; const r = saveFixLog(); const raw = localStorage.getItem(LS.fixlog); return { ok: !!(r && r.ok), len: raw ? raw.length : -1 }; })()`);
ok('L7 the stored log at the full 36,000 cap, written through the real save path on a worst-case stream, fits the shared budget (fixlog <= 4.0 MB; + 250 KB trail + 250 KB board/settings <= 4.5 MB) | bytes=' + bytes.len + ' (' + (bytes.len / 36000).toFixed(1) + '/fix)',
  bytes.ok === true && bytes.len > 0 && bytes.len <= 4000000 && bytes.len + 250 * 1024 + 250 * 1024 <= 4500000);
const FIXV1 = [{ v: 'Beta 1.189', t0: 1760500000000, f: [
  [1760500001000, 43.814701299999997, -79.55930129999999, 8.5, 3.2123456789012345, 90.12345678901234, [43.814701, -79.559301, 43.8147, -79.5593, 90.1], 0],
  [1760500002000, 43.81471021234568, -79.55931304567892, 12, null, null, [43.81471, -79.559313, 43.81471, -79.559313, null], 0],
  [1760500003000, null, -79.55932000000001, 10, null, null, null, 0],
  [1760500004000, 43.81472567890123, -79.55933012345678, 6.25, 4.0, 92.5, [43.814726, -79.55933, 43.814725, -79.559329, 92.4], 1760499000000],
  [1760500005000, 43.81473000000001, -79.55933500000002, 200, 4.1, 93, null, 1760499000000]] }];
const v1Canon = await J(`fixLogDecodeSessions(JSON.parse(canonicalFixLog(${JSON.stringify(JSON.stringify(FIXV1))})))`);
ok('L7 the backup validator takes a 1.189-format log and loses nothing: its canonical form decodes back field-for-field',
  canon(v1Canon) === canon(FIXV1));
await ev(`(() => { localStorage.setItem(LS.fixlog, ${JSON.stringify(JSON.stringify(FIXV1))}); return true; })()`);
await reloadPage();
const v1Loaded = await J(`fixLog`);
ok('L7 a 1.189-format log planted in storage loads field-for-field (every full-precision field, the nulls, the refused fix, the run-stamp change)',
  canon(v1Loaded) === canon(FIXV1));
const v1Resaved = await J(`(() => { saveFixLog(); const raw = localStorage.getItem(LS.fixlog); return { e: JSON.parse(raw).e, dec: fixLogDecodeSessions(JSON.parse(raw)) }; })()`);
ok('L7 re-saving that log writes the e2 form, and the e2 form decodes back to the same fields exactly',
  v1Resaved.e === 2 && canon(v1Resaved.dec) === canon(FIXV1));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
