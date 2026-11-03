import { readFileSync } from 'node:fs';
import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive118: audit remediation regression suite (spec 2026-10-29). Covers the gaps the older drives do not:
// invalid coverage indexes (F-2), invalid GPS fixes (G-1), coverage suggestion behaviour incl. parallel
// streets (spec GPS), restore write failure + rollback (suite 5), failed rollback verification (suite 6),
// invalid nested history (suite 3), current-format backup round-trip (suite 1), failed history write at
// finish (suite 11), partial multi-key save consistency (suite 12).
// drive143: Beta 1.70 audit fixes (full audit of 1.69, adjudicated 2026-11-02).
// U1: Undo reports a failed metadata save instead of claiming full restoration (A01).
// C1/C2: coverage + suggestions are run-scoped - Cancel clears them, Clear counts them (A04).
// G1-G3: archived distance/path are measured from the run's true start (A05).
// D1: the piece-time sanitizer is bounded by the street's stretch count (A06).
// G4: GPX splits sessions into separate track segments (A07). H1: no duplicate sheet IDs (A08).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const src = readFileSync(new URL('../../src/tracker-source.html', import.meta.url), 'utf8');
ok('H1 sheet panels use shared classes, no duplicate IDs | sheetHead ids ' + (src.split('id="sheetHead"').length - 1) + ' classes ' + (src.split('class="sheetHead"').length - 1), (src.split('id="sheetHead"').length - 1) === 0 && (src.split('id="sheetTitle"').length - 1) === 0 && (src.split('class="sheetHead"').length - 1) === 3 && (src.split('class="sheetTitle"').length - 1) === 3);
ok('T0 app script and map object are live', await poll120(`typeof map !== 'undefined' && !!map && typeof finishRun === 'function' && typeof buildSnap === 'function'`, 90000));
// U1: finish a 3-street clean, then undo with the notes/times saves broken.
await ev(`(() => { runStart = Date.now() - 3600000; markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); suggested = new Set(['Boddy']); finishRun(); return true; })()`);
await sleep(300);
const u0 = JSON.parse(await ev(`(() => JSON.stringify({ undo: !!undoSnap, btn: $('resetBtn').textContent, sug: suggested.size }))()`));
ok('U0 setup: finish archived and undo is on offer; the finish cleared the suggestion set (A04) | ' + JSON.stringify(u0), u0.undo === true && u0.btn === 'Undo' && u0.sug === 0);
await ev(`(() => { window.__lsSet = lsSet; lsSet = (k, v) => (k === LS.notes || k === LS.times) ? false : window.__lsSet(k, v); doUndo(); return true; })()`);
await sleep(200);
const u1 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, done: doneSet.size, run: !!runStart }))()`));
await ev(`(() => { lsSet = window.__lsSet; return true; })()`);
ok('U1 undo with metadata saves broken warns instead of claiming a clean restore | ' + JSON.stringify(u1), u1.done === 3 && u1.run === true && u1.toast.indexOf('could not be saved') >= 0);
// C1: cancel a clean that has coverage but no marks - coverage and suggestions die with it.
await ev(`(() => { runStart = Date.now(); coveredIdx = { Velmar: [0, 1, 2] }; suggested = new Set(['Velmar']); cancelStart(); return true; })()`);
const c1 = JSON.parse(await ev(`(() => JSON.stringify({ cov: Object.keys(coveredIdx).length, sug: suggested.size, toast: $('toast').textContent }))()`));
ok('C1 cancel clears the cancelled run coverage and suggestions | ' + JSON.stringify(c1), c1.cov === 0 && c1.sug === 0 && c1.toast === 'Start cancelled');
// C2: Clear with coverage-only state clears it instead of claiming nothing to do.
await ev(`(() => { coveredIdx = { Velmar: [0] }; suggested = new Set(['Velmar']); clearAllMarks(); return true; })()`);
const c2 = JSON.parse(await ev(`(() => JSON.stringify({ cov: Object.keys(coveredIdx).length, sug: suggested.size, toast: $('toast').textContent }))()`));
ok('C2 clear counts coverage-only state as something to clear | ' + JSON.stringify(c2), c2.cov === 0 && c2.sug === 0 && c2.toast !== 'Nothing marked to clear');
// G1/G2: a segment straddling the run start is not counted; only whole in-run segments are.
const g = JSON.parse(await ev(`(() => { const t0 = 1700000000; trail = [[43.82, -79.560, t0 - 60], [43.82, -79.559, t0 + 60], [43.82, -79.558, t0 + 120]]; const km = trailKm(t0 * 1000); const segIn = distM(trail[1], trail[2]) / 1000; const segStraddle = distM(trail[0], trail[1]) / 1000; return JSON.stringify({ km, segIn, segStraddle }); })()`));
ok('G1/G2 distance from run start counts only segments with both endpoints in the run | km ' + g.km.toFixed(3) + ' in-run ' + g.segIn.toFixed(3) + ' straddle ' + g.segStraddle.toFixed(3), Math.abs(g.km - g.segIn) < 0.002 && g.km < g.segIn + g.segStraddle - 0.01);
// G3: the archive measures km from the run start and its path admits no earlier point.
const g3 = JSON.parse(await ev(`(() => { const t0 = 1700000000; runStart = t0 * 1000; trail = [[43.82, -79.560, t0 - 60], [43.82, -79.559, t0 + 60], [43.82, -79.558, t0 + 120]]; doneSet = new Set(['Velmar']); doneTimes = { Velmar: new Date((t0 + 180) * 1000).toISOString() }; const snap = buildSnap(); const out = { km: snap.km, expectKm: +trailKm(t0 * 1000).toFixed(1), path0: snap.path ? snap.path[0][2] * 1000 : null, started: Date.parse(snap.startedAt) }; doneSet = new Set(); doneTimes = {}; runStart = 0; trail = []; return JSON.stringify(out); })()`));
ok('G3 archive km comes from the run start and the archived path starts no earlier | ' + JSON.stringify(g3), g3.km === g3.expectKm && g3.expectKm > 0 && g3.path0 !== null && g3.path0 >= g3.started);
// D1: the sanitizer is bounded by the street's real stretch count.
const d1 = JSON.parse(await ev(`(() => { const o = sanitizePieceTimes({ '10000': ['a', 'b'], '100000': ['x', 'y'], '1': ['c', 'd'] }, 3); const a = sanitizePieceTimes(Array.from({ length: 50 }, () => ['t', 't']), 3); return JSON.stringify({ olen: o.length, one: o[1], alen: a.length }); })()`));
ok('D1 oversized sparse indexes cannot inflate piece-times | ' + JSON.stringify(d1), d1.olen <= 3 && JSON.stringify(d1.one) === '["c","d"]' && d1.alen === 3);
// G4: GPX splits two sessions into two segments.
const g4 = JSON.parse(await ev(`(() => { const t0 = 1700000000; trail = [[43.82, -79.560, t0], [43.82, -79.559, t0 + 10], [43.82, -79.558, t0 + 20], [43.83, -79.550, t0 + 3600], [43.83, -79.549, t0 + 3610]]; const g = buildGpx(); trail = []; return JSON.stringify({ segs: g.split('<trkseg>').length - 1, pts: g.split('<trkpt').length - 1 }); })()`));
ok('G4 GPX exports separate sessions as separate segments | ' + JSON.stringify(g4), g4.segs === 2 && g4.pts === 5);
// ---- Beta 1.71 (audit of 1.70): B01, B02, B03, B04, B05 + independent distance ----
// X1 (B01): Clear dismisses the live suggestion panel and its street reference.
await ev(`(() => { coveredIdx = { Velmar: [0, 1] }; suggested = new Set(['Velmar']); showSuggest('Velmar'); return true; })()`);
const x1 = JSON.parse(await ev(`(() => { const visBefore = !$('suggest').classList.contains('hidden'); clearAllMarks(); return JSON.stringify({ visBefore, visAfter: !$('suggest').classList.contains('hidden'), n: $('suggest').dataset.n || null, cov: Object.keys(coveredIdx).length }); })()`));
ok('X1 (B01) clear dismisses the suggestion panel and clears its street | ' + JSON.stringify(x1), x1.visBefore === true && x1.visAfter === false && x1.n === null && x1.cov === 0);
// X2 (audit section 9 + B03): distance checked against GEODESY, not the app -
// ten 0.001-degree steps due north along a meridian. Earth's meridian arc at
// this latitude is ~111.11 m per step (the app's equirectangular constant says
// 111.32 m); either way the total must land in [1.10, 1.12] km.
const x2 = JSON.parse(await ev(`(() => { const t0 = 1700001000; trail = []; for (let i = 0; i <= 10; i++) trail.push([43.82 + i * 0.001, -79.56, t0 + i * 60]); const km = trailKm(t0 * 1000); trail = []; return JSON.stringify({ km }); })()`));
ok('X2 distance matches an independent meridian-arc expectation | km ' + x2.km.toFixed(3) + ' expected ~1.111', x2.km >= 1.10 && x2.km <= 1.12);
// X2b (B03): a >1000 m jump is a break, not distance - two honest steps, one
// teleport, one honest step must total the honest steps only (~0.222 km).
const x2b = JSON.parse(await ev(`(() => { const t0 = 1700001000; trail = [[43.82, -79.56, t0], [43.821, -79.56, t0 + 60], [43.832, -79.56, t0 + 70], [43.833, -79.56, t0 + 130]]; const km = trailKm(t0 * 1000); trail = []; return JSON.stringify({ km }); })()`));
ok('X2b (B03) a >1000 m jump segment is excluded from distance | km ' + x2b.km.toFixed(3) + ' expected ~0.222', x2b.km >= 0.21 && x2b.km <= 0.235);
// X3 (B04): the run starts 500 ms into a second - the first segment still counts.
const x3 = JSON.parse(await ev(`(() => { const t0 = 1700001000; trail = [[43.82, -79.56, t0], [43.821, -79.56, t0 + 60], [43.822, -79.56, t0 + 120]]; const km = trailKm(t0 * 1000 + 500); trail = []; return JSON.stringify({ km }); })()`));
ok('X3 (B04) a mid-second run start keeps the first segment | km ' + x3.km.toFixed(3) + ' expected ~0.222', x3.km >= 0.21 && x3.km <= 0.235);
// X4 (B05): the snow log's Started/Duration come from the real run start.
const x4 = JSON.parse(await ev(`(() => { const T = 1700001000000; runStart = T; doneSet = new Set(['Velmar', 'Astona']); doneTimes = { Velmar: new Date(T + 20 * 60000).toISOString(), Astona: new Date(T + 100 * 60000).toISOString() }; const rep = buildReport(); const line = rep.split(String.fromCharCode(10)).find(l => l.indexOf('Started:') >= 0) || ''; const out = { line, wantStart: fmtStamp(new Date(T).toISOString()), wantDur: fmtDur(100 * 60000), badStart: fmtStamp(new Date(T + 20 * 60000).toISOString()) }; doneSet = new Set(); doneTimes = {}; runStart = 0; return JSON.stringify(out); })()`));
ok('X4 (B05) snow log starts at the clean start, duration spans the whole clean | ' + x4.line, x4.line.indexOf('Started: ' + x4.wantStart) === 0 && x4.line.indexOf('Duration: ' + x4.wantDur) >= 0 && x4.line.indexOf(x4.badStart) < 0);
// X5 (B02): recorded session markers split adjacent cleans in the GPX export;
// without markers the same points stay one segment (legacy heuristic kept).
const x5 = JSON.parse(await ev(`(() => { const t0 = 1700001000; trail = [[43.82, -79.56, t0], [43.8201, -79.56, t0 + 10], [43.8202, -79.56, t0 + 20], [43.8203, -79.56, t0 + 50], [43.8204, -79.56, t0 + 60]]; trailSessions = [t0, t0 + 50]; const withM = buildGpx().split('<trkseg>').length - 1; trailSessions = []; const withoutM = buildGpx().split('<trkseg>').length - 1; trail = []; return JSON.stringify({ withM, withoutM }); })()`));
ok('X5 (B02) session markers split cleans 30 s apart; the gap heuristic alone does not | ' + JSON.stringify(x5), x5.withM === 2 && x5.withoutM === 1);
// X5b (B02): starting a clean records and persists its marker.
const x5b = JSON.parse(await ev(`(() => { trailSessions = []; runStart = 1700001000123; noteSessionStart(); const stored = JSON.parse(lsGet(LS.sess) || '[]'); const out = { mem: trailSessions.slice(), stored }; trailSessions = []; saveSess(); runStart = 0; return JSON.stringify(out); })()`));
ok('X5b (B02) a clean start appends its marker and saves it | ' + JSON.stringify(x5b), x5b.mem.length === 1 && x5b.mem[0] === 1700001000 && x5b.stored[0] === 1700001000);
const x6 = JSON.parse(await ev(`(() => { const t0 = 1700010000; trail = []; for (let i = 0; i < 120; i++) trail.push([43.82 + i * 0.0001, -79.56, t0 + i * 10]); trailSessions = []; for (let k = 0; k < 25; k++) trailSessions.push(t0 + 37 + k * 47); const g = buildGpx(); const starts = []; const parts = g.split('<trkseg>'); for (let s = 1; s < parts.length; s++) { const mm = parts[s].match(/<time>([^<]+)<\\/time>/); if (mm) starts.push(Math.floor(Date.parse(mm[1]) / 1000)); } const naive = [trail[0][2]]; for (let i = 1; i < trail.length; i++) { if (trail[i][2] - trail[i - 1][2] > 300 || distM(trail[i - 1], trail[i]) > 1000 || trailSessions.some(m => trail[i - 1][2] < m && m <= trail[i][2])) naive.push(trail[i][2]); } trail = []; trailSessions = []; return JSON.stringify({ starts, naive }); })()`));
ok('X6 (C07) GPX pointer walk segments identically to the naive marker scan (120 pts, 25 markers) | segs ' + x6.starts.length + ' vs ' + x6.naive.length, JSON.stringify(x6.starts) === JSON.stringify(x6.naive) && x6.starts.length > 10);
// X7 (Beta 1.74, audit D01): X6's trail is chronological. A stored trail is
// NOT guaranteed ordered (legacy trails, restored backups - the loader sorts
// the markers, never the points), and the 1.73 pointer walk only advances:
// a trail that crosses a marker, steps BACK below it, and crosses again
// within the gap window lost the second split. Same oracle as X6.
const x7 = JSON.parse(await ev(`(() => { const t0 = 1700020000; trail = [[43.82, -79.56, t0], [43.8201, -79.56, t0 + 200], [43.8202, -79.56, t0 + 50], [43.8203, -79.56, t0 + 250]]; trailSessions = [t0 + 100]; const g = buildGpx(); const parts = g.split('<trkseg>'); const starts = []; for (let s = 1; s < parts.length; s++) { const seg = parts[s].split('<time>')[1]; if (seg) starts.push(Math.floor(Date.parse(seg.split('<')[0]) / 1000)); } const naive = [trail[0][2]]; for (let i = 1; i < trail.length; i++) { if (trail[i][2] - trail[i - 1][2] > 300 || distM(trail[i - 1], trail[i]) > 1000 || trailSessions.some(m => trail[i - 1][2] < m && m <= trail[i][2])) naive.push(trail[i][2]); } trail = []; trailSessions = []; return JSON.stringify({ starts, naive }); })()`));
ok('X7 (D01) out-of-order trail re-crossing a marker segments identically to the naive scan | segs ' + x7.starts.length + ' vs ' + x7.naive.length, JSON.stringify(x7.starts) === JSON.stringify(x7.naive) && x7.naive.length === 3);
// X8 (Beta 1.74 audit E01): deterministic SEEDED parity sweep of the shipped
// buildGpx against the naive per-point predicate, across the edge classes the
// fixed fixtures cannot enumerate: chronological and non-monotonic trails,
// multiple backward jumps, duplicate timestamps, empty and dense marker
// arrays, markers before/within/after the trail span, large time gaps and
// >1000 m jumps. Fixed seed (mulberry32) so any failure reproduces exactly.
// The coverage counters are asserted too - a sweep that never generates the
// hard classes proves nothing.
const x8 = JSON.parse(await ev(`(() => { let a = 0x5EED174; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)); const cov = { backward: 0, dup: 0, emptyM: 0, denseM: 0, edgeM: 0, distBreak: 0, gapBreak: 0, snapM: 0 }; const mism = []; let cases = 0; for (let c = 0; c < 320; c++) { const t0 = 1700030000 + c * 100003; const n = c % 17 === 0 ? 1 : ri(2, 40); const pts = []; let t = t0, lat = 43.82, lng = -79.56; let hasBack = false, hasDup = false, hasDist = false, hasGap = false; for (let i = 0; i < n; i++) { if (i > 0) { const r = rnd(); if (r < 0.52) t += ri(1, 120); else if (r < 0.62) { hasDup = true; } else if (r < 0.82) { t -= ri(5, 400); hasBack = true; if (t < t0 - 5000) t = t0 - 5000 + ri(0, 60); } else if (r < 0.92) { t += ri(301, 900); hasGap = true; } else t += ri(121, 300); if (rnd() < 0.10) { lat += 0.02 * (rnd() < 0.5 ? 1 : -1); hasDist = true; } else { lat += (rnd() - 0.5) * 0.0006; lng += (rnd() - 0.5) * 0.0006; } } pts.push([+lat.toFixed(6), +lng.toFixed(6), t]); } const cls = c % 6; let marks = []; if (cls === 0) marks = []; else if (cls === 1) { for (let m = t0 - 100; m <= t + 100; m += ri(15, 40)) marks.push(m); } else if (cls === 2) { const k = ri(1, 6); for (let j = 0; j < k; j++) marks.push(t0 - 600 + ri(0, (t - t0) + 1200)); } else if (cls === 3) { const k = ri(1, 5); for (let j = 0; j < k; j++) marks.push(pts[ri(0, n - 1)][2]); } else if (cls === 4) { marks = [t0 - ri(1000, 5000), t + ri(1000, 5000)]; } else { const k = ri(2, 10); for (let j = 0; j < k; j++) marks.push(t0 + ri(0, Math.max(1, t - t0))); } marks = Array.from(new Set(marks)).sort((x, y) => x - y); trail = pts; trailSessions = marks; const g = buildGpx(); const parts = g.split('<trkseg>'); const starts = []; for (let s = 1; s < parts.length; s++) { const seg = parts[s].split('<time>')[1]; if (seg) starts.push(Math.floor(Date.parse(seg.split('<')[0]) / 1000)); } const naive = n ? [pts[0][2]] : []; for (let i = 1; i < pts.length; i++) { if (pts[i][2] - pts[i - 1][2] > 300 || distM(pts[i - 1], pts[i]) > 1000 || marks.some(m => pts[i - 1][2] < m && m <= pts[i][2])) naive.push(pts[i][2]); } cases++; if (hasBack) cov.backward++; if (hasDup) cov.dup++; if (hasDist) cov.distBreak++; if (hasGap) cov.gapBreak++; if (!marks.length) cov.emptyM++; if (marks.length >= 8) cov.denseM++; if (marks.some(m => m < Math.min.apply(null, pts.map(p => p[2]))) || marks.some(m => m > Math.max.apply(null, pts.map(p => p[2])))) cov.edgeM++; if (cls === 3) cov.snapM++; if (JSON.stringify(starts) !== JSON.stringify(naive) && mism.length < 5) mism.push({ c, cls, starts, naive }); } trail = []; trailSessions = []; return JSON.stringify({ cases, mism, cov }); })()`));
ok('X8 (E01) seeded parity sweep: buildGpx matches the naive predicate on every generated trail | cases ' + x8.cases + ' mismatches ' + x8.mism.length + ' ' + JSON.stringify(x8.mism), x8.cases === 320 && x8.mism.length === 0);
ok('X8 (E01) sweep coverage: the hard classes were actually generated | ' + JSON.stringify(x8.cov), x8.cov.backward >= 40 && x8.cov.dup >= 20 && x8.cov.emptyM >= 40 && x8.cov.denseM >= 20 && x8.cov.edgeM >= 20 && x8.cov.distBreak >= 10 && x8.cov.gapBreak >= 10 && x8.cov.snapM >= 40);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);

