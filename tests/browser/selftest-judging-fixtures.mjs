// Judging-logic fixtures, Tranche 2 (Improvement Programme, 2026-11-07).
// The street-geometry / snapshot / pace functions below DECIDE things:
// where one street part ends and the next begins (marking, totals), what
// coverage samples exist (suggestions), whether a stored cancel snapshot
// is trustworthy enough to restore, and what pace/ETA the user is shown.
// Per the test-change gate (docs/TESTING.md rule 1) they are proven in
// plain Node against fixtures whose expectations are HAND-DERIVED from
// the documented semantics in the functions' own header comments - there
// are NO golden masters here: no expected value was captured from the
// implementation. Where floats are involved the comparison tolerance is
// stated at the helper: 1e-9 relative for coordinates/distances derived
// from the metric constants, exact for counts and structure.
//
// Loading follows the established pattern of selftest-trail-segments.mjs:
// the shipped functions are extracted VERBATIM from the parts by
// balanced-brace extraction, and a failed extraction fails this test
// loudly. State-dependent functions receive their state through factory
// `let` bindings plus a setter, exactly like that file's trail pattern.
import { readFileSync } from 'node:fs';

const app1 = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
const app3 = readFileSync(new URL('../../parts/app3.js', import.meta.url), 'utf8');

function extract(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('extraction failed: ' + sig + ' not found');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); } }
  throw new Error('extraction failed: unbalanced ' + sig);
}
const mline = app1.match(/const MLAT = [0-9]+, MLNG = [0-9]+/)[0];
const covline = app1.match(/const COV_SAMPLE_M = [0-9]+/)[0];
const factory = new Function(`
  ${mline};
  ${covline};
  let ROADS = {}, STREETNAMES = [], STREETSET = new Set(), STRETCH = {}, SAMPLES = {};
  let history = [], runStart = 0, pieces = {}, pieceTimes = {};
  ${extract(app1, 'function distM(')}
  ${extract(app1, 'function segLenM(')}
  ${extract(app1, 'function stitchRuns(')}
  ${extract(app1, 'function projOnLine(')}
  ${extract(app1, 'function sliceLine(')}
  ${extract(app1, 'function finishJunctionCuts(')}
  ${extract(app1, 'function computeStretches(')}
  ${extract(app1, 'function sanitizePieceTimes(')}
  ${extract(app1, 'function workDoneM(')}
  ${extract(app1, 'function liveWorkM(')}
  ${extract(app1, 'function totalWorkM(')}
  ${extract(app1, 'function fmtDur(')}
  ${extract(app1, 'function fmtClock(')}
  ${extract(app3, 'function samplesFor(')}
  ${extract(app3, 'function validateSnap(')}
  ${extract(app3, 'function refRun(')}
  ${extract(app3, 'function cleanWorkM(')}
  ${extract(app3, 'function workRateMh(')}
  ${extract(app3, 'function paceInfo(')}
  return { distM, segLenM, stitchRuns, projOnLine, sliceLine, finishJunctionCuts, computeStretches,
    sanitizePieceTimes, workDoneM, liveWorkM, totalWorkM, fmtDur, fmtClock,
    samplesFor, validateSnap, refRun, cleanWorkM, workRateMh, paceInfo,
    COV_SAMPLE_M,
    set: (s) => {
      if ('ROADS' in s) ROADS = s.ROADS;
      if ('STREETNAMES' in s) STREETNAMES = s.STREETNAMES;
      if ('STREETSET' in s) STREETSET = s.STREETSET;
      if ('STRETCH' in s) STRETCH = s.STRETCH;
      if ('SAMPLES' in s) SAMPLES = s.SAMPLES;
      if ('history' in s) history = s.history;
      if ('runStart' in s) runStart = s.runStart;
      if ('pieces' in s) pieces = s.pieces;
      if ('pieceTimes' in s) pieceTimes = s.pieceTimes;
    } };
`);
const A = factory();

// ---------- assertion helpers ----------
let fails = 0, checks = 0;
function ok(cond, label, extra) {
  checks++;
  if (!cond) { fails++; console.log('FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); }
}
function approx(a, b, label, rel = 1e-9) { // coordinates/distances: 1e-9 RELATIVE (stated tolerance)
  ok(typeof a === 'number' && Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), label, { got: a, want: b });
}
function approxPt(p, q, label) { approx(p && p[0], q[0], label + ' lat'); approx(p && p[1], q[1], label + ' lng'); }
function eqJSON(got, want, label) { ok(JSON.stringify(got) === JSON.stringify(want), label, { got, want }); }

// Shared geometry constants. Points are [lat, lng]. A latitude step of
// 0.001 is 0.001 * MLAT = 111.32 m; a longitude step of 0.001 is 80.386 m.
const LAT0 = 43.82, LNG0 = -79.57;
const P = (i) => [LAT0 + i * 0.001, LNG0]; // points north along lng -79.57, 111.32 m apart

// =====================================================================
// STITCHRUNS - chaining by EXACT endpoint equality, scan order, each
// segment used once; disconnected components become separate runs.
// =====================================================================
{
  const roads1 = { S: [[P(0), P(1)]] };
  eqJSON(A.stitchRuns('S', roads1), [[P(0), P(1)]], 'S1 single segment -> one identical run');

  const roads2 = { S: [[P(0), P(1)], [P(1), P(2)]] };
  eqJSON(A.stitchRuns('S', roads2), [[P(0), P(1), P(2)]], 'S2 end-to-start chain, joint not duplicated');

  const roads3 = { S: [[P(0), P(1)], [P(2), P(1)]] }; // second segment reversed: its END meets the line end
  eqJSON(A.stitchRuns('S', roads3), [[P(0), P(1), P(2)]], 'S3 reversed append, joint not duplicated');

  const segEnd = [[LAT0 - 0.001, LNG0], P(0)]; // END meets line start
  eqJSON(A.stitchRuns('S', { S: [[P(0), P(1)], segEnd] }), [[[LAT0 - 0.001, LNG0], P(0), P(1)]], 'S4a prepend (segment end at line start)');
  const segStart = [P(0), [LAT0 - 0.001, LNG0]]; // START meets line start -> reversed prepend
  eqJSON(A.stitchRuns('S', { S: [[P(0), P(1)], segStart] }), [[[LAT0 - 0.001, LNG0], P(0), P(1)]], 'S4b prepend (segment start at line start, reversed)');

  const far = [[43.90, -79.60], [43.901, -79.60]];
  const runs5 = A.stitchRuns('S', { S: [[P(0), P(1)], far] });
  ok(runs5.length === 2, 'S5 disconnected -> two runs');
  eqJSON(runs5[0], [P(0), P(1)], 'S5 runs in scan order; first run (= stitchLine) is segment 1');
  eqJSON(runs5[1], far, 'S5 second run is segment 2');

  // Listed out of order: segC joins only AFTER segB has landed (second growth pass).
  const runs6 = A.stitchRuns('S', { S: [[P(0), P(1)], [P(2), P(3)], [P(1), P(2)]] });
  eqJSON(runs6, [[P(0), P(1), P(2), P(3)]], 'S6 second growth pass -> one run in geometric order');

  eqJSON(A.stitchRuns('E', { E: [] }), [], 'S7 street with empty segment list -> []');
}

// =====================================================================
// FINISHJUNCTIONCUTS - straight 3-point line along latitude.
// seg = 111.32 m; cum [0, 111.32, 222.64], total 222.64; sliceLine
// interpolates linearly between vertices.
// Policy (header): sort cuts; merge a cut closer than 15 m to the last
// KEPT cut; drop cuts within 12 m of either end (>= 12 and <= total-12
// survive); slice at the surviving bounds.
// =====================================================================
{
  const line = [P(0), P(1), P(2)], cum = [0, 111.32, 222.64], total = 222.64;
  const F = (cuts) => A.finishJunctionCuts(line, cum, total, cuts.slice());
  const atLat = (d) => LAT0 + (d / 111.32) * 0.001; // hand interpolation along the first segment

  const f1 = F([]);
  ok(f1.length === 1, 'F1 no cuts -> exactly 1 part'); eqJSON(f1[0], line, 'F1 the part is the whole line');

  const f2 = F([111.32]);
  ok(f2.length === 2, 'F2 cut at the middle vertex -> 2 parts');
  eqJSON(f2[0], [P(0), P(1)], 'F2 part 1 ends at the middle vertex'); eqJSON(f2[1], [P(1), P(2)], 'F2 part 2 starts there');

  const f3 = F([55.66]);
  ok(f3.length === 2, 'F3 mid-segment cut -> 2 parts');
  approxPt(f3[0][f3[0].length - 1], [43.8205, LNG0], 'F3 shared point is the interpolated midpoint');
  approxPt(f3[1][0], [43.8205, LNG0], 'F3 part 2 starts at the same shared point');

  const f4 = F([30, 44, 59]); // 44 dropped (44-30=14 < 15 vs last KEPT 30); 59 kept (59-30=29 >= 15)
  ok(f4.length === 3, 'F4 merge compares to last KEPT cut -> parts split at 30 and 59 only');
  approxPt(f4[0][f4[0].length - 1], [atLat(30), LNG0], 'F4 first split at 30 m');
  approxPt(f4[1][f4[1].length - 1], [atLat(59), LNG0], 'F4 second split at 59 m');
  const f4b = F([30, 45]); // 45-30 = 15 is NOT < 15 -> kept (exact boundary)
  ok(f4b.length === 3, 'F4b cut exactly 15 m after the kept cut is KEPT -> 3 parts');

  ok(F([11.9]).length === 1, 'F5a cut at 11.9 m dropped (within 12 m of the start)');
  ok(F([12]).length === 2, 'F5b cut at exactly 12 m kept');
  ok(F([210.64]).length === 2, 'F5c cut at exactly total-12 (210.64) kept');
  ok(F([210.65]).length === 1, 'F5d cut at 210.65 dropped (within 12 m of the end)');

  const short = [[LAT0, LNG0], [LAT0 + 0.001, LNG0]];
  const f6 = A.finishJunctionCuts(short, [0, 20], 20, [10]); // keep window [12, 8] is empty
  ok(f6.length === 1, 'F6 short line (total 20), cut at 10 -> window empty -> 1 part');

  const f7 = F([100, 30]); // unsorted input is sorted before the policy runs
  ok(f7.length === 3, 'F7 unsorted cuts -> 3 parts');
  approxPt(f7[0][f7[0].length - 1], [atLat(30), LNG0], 'F7 first split at 30 m (not 100)');
  approxPt(f7[1][f7[1].length - 1], [atLat(100), LNG0], 'F7 second split at 100 m');
}

// =====================================================================
// COMPUTESTRETCHES - junction tolerance: another street's vertex within
// <= 4 m of a run's line cuts it; a street never cuts itself.
// =====================================================================
{
  const lineA = [[P(0), P(1), P(2)]]; // street A segments (one segment, 3 points)

  // C1: B crosses A exactly at A's middle vertex; B's own middle vertex IS that point.
  const crossB = [[[43.821, -79.571], [43.821, -79.57], [43.821, -79.569]]];
  const c1 = A.computeStretches({ A: lineA, B: crossB });
  ok(c1.A.parts.length === 2, 'C1 A cut at its middle vertex -> 2 parts', { got: c1.A.parts.length });
  // Hand computation for B: of A's three vertices, only the middle one
  // (43.821, -79.57) lies on B's line (the others are 111.32 m away in
  // latitude); it projects at d = 0.001 * MLNG = 80.386 m along B, inside
  // [12, 160.772-12], so B is cut exactly once -> 2 parts.
  ok(c1.B.parts.length === 2, 'C1 B cut once by A middle vertex -> 2 parts', { got: c1.B.parts.length });
  approx(c1.A.total, 222.64, 'C1 A total is the full line length', 1e-9);
  approx(c1.B.total, 160.772, 'C1 B total is 2 x 80.386 m', 1e-9);

  // C2: a vertex 3.9 m off A's line cuts; 4.1 m off does not. The other
  // vertex of the probe street is ~800 m off, so only this vertex can cut.
  const probe = (offM) => [[[43.821, LNG0 + offM / 80386], [43.821, -79.56]]];
  ok(A.computeStretches({ A: lineA, X: probe(3.9) }).A.parts.length === 2, 'C2 vertex 3.9 m off -> cut lands (A in 2 parts)');
  ok(A.computeStretches({ A: lineA, X: probe(4.1) }).A.parts.length === 1, 'C2 vertex 4.1 m off -> no cut (A in 1 part)');

  // C3: self-crossing street - its last vertex lies ON its own first
  // segment. With no other street present there is no cutter at all.
  const selfX = [[[LAT0, LNG0], [43.822, LNG0], [43.822, -79.569], [43.821, LNG0]]];
  const c3 = A.computeStretches({ S: selfX });
  ok(c3.S.parts.length === 1, 'C3 self-crossing street -> NO self-cut (1 part)', { got: c3.S.parts.length });

  // C4: disconnected street, no other streets.
  const c4 = A.computeStretches({ D: [[P(0), P(1)], [[43.83, LNG0], [43.831, LNG0]]] });
  ok(c4.D.runs.length === 2, 'C4 disconnected street -> runs length 2');
  approx(c4.D.total, 222.64, 'C4 total is the SUM of both segment lengths (111.32 + 111.32)');
  ok(c4.D.parts.length === 2, 'C4 parts = concatenation of per-run parts (1 per run here)', { got: c4.D.parts.length });
  eqJSON(c4.D.line, [P(0), P(1)], 'C4 line is the first run');
  eqJSON(c4.D.cum, c4.D.runs[0].cum, 'C4 cum is the first run cum');

  // C5: the junction vertex belongs to street D's SECOND run and lies on E.
  const roadsE = {
    E: [[[43.82, -79.58], [43.821, -79.58], [43.822, -79.58]]],
    D: [[[43.84, -79.60], [43.841, -79.60]], [[43.821, -79.581], [43.821, -79.58], [43.821, -79.579]]]
  };
  const c5 = A.computeStretches(roadsE);
  ok(c5.D.runs.length === 2, 'C5 D really has two runs (precondition)');
  ok(c5.E.parts.length === 2, 'C5 vertex from D run 2 cuts E -> E in 2 parts', { got: c5.E.parts.length });
}

// =====================================================================
// SAMPLESFOR - COV_SAMPLE_M = 15; per run, samples at d = 0, 15, 30, ...
// <= run.total, linearly interpolated. (Synthetic stretch objects pin
// exact cum/total values; a run built from raw lat steps would carry
// 15/111320 * 111320 = 14.999999999999998 m steps and blur the boundary
// these cases exist to pin.)
// =====================================================================
{
  ok(A.COV_SAMPLE_M === 15, 'M0 COV_SAMPLE_M extracted as 15');
  const mkRun = (line, cum) => ({ line, cum, total: cum[cum.length - 1], parts: null });
  const dLat = (m) => m / 111320;

  // M1: one run, total exactly 30 (two 15 m segments).
  const line1 = [[LAT0, LNG0], [LAT0 + dLat(15), LNG0], [LAT0 + dLat(30), LNG0]];
  const m1 = A.samplesFor({ S: { runs: [mkRun(line1, [0, 15, 30])] } }, ['S']).S;
  ok(m1.length === 3, 'M1 total 30 -> 3 samples (d 0/15/30)', { got: m1.length });
  approxPt(m1[0], line1[0], 'M1 sample at d 0 is the line start');
  approxPt(m1[1], line1[1], 'M1 sample at d 15 is the middle vertex');
  approxPt(m1[2], line1[2], 'M1 sample at d 30 is the line end');

  // M2: total 29.9 -> the d=30 sample does not exist.
  const line2 = [[LAT0, LNG0], [LAT0 + dLat(29.9), LNG0]];
  const m2 = A.samplesFor({ S: { runs: [mkRun(line2, [0, 29.9])] } }, ['S']).S;
  ok(m2.length === 2, 'M2 total 29.9 -> 2 samples', { got: m2.length });

  // M3: zero-length run -> exactly one sample, the point itself.
  const m3 = A.samplesFor({ S: { runs: [mkRun([[LAT0, LNG0], [LAT0, LNG0]], [0, 0])] } }, ['S']).S;
  ok(m3.length === 1, 'M3 zero-length run -> exactly 1 sample', { got: m3.length });
  eqJSON(m3[0], [LAT0, LNG0], 'M3 the sample is the point');

  // M4: multi-run street (the C4 geometry, via computeStretches).
  // Each run totals 111.32 m -> samples at 0,15,...,105 = 8 per run.
  const stretch4 = A.computeStretches({ D: [[P(0), P(1)], [[43.83, LNG0], [43.831, LNG0]]] });
  const m4 = A.samplesFor(stretch4, ['D']).D;
  ok(m4.length === 16, 'M4 samples come from BOTH runs (8 + 8 = 16)', { got: m4.length });
  eqJSON(m4[0], P(0), 'M4 first sample is run 1 start');
  approxPt(m4[8], [43.83, LNG0], 'M4 sample 9 is run 2 start');

  // M5: bent line - vertex at 20 m, second segment heads east 20 m.
  const bent = [[LAT0, LNG0], [LAT0 + dLat(20), LNG0], [LAT0 + dLat(20), LNG0 + 20 / 80386]];
  const m5 = A.samplesFor({ S: { runs: [mkRun(bent, [0, 20, 40])] } }, ['S']).S;
  ok(m5.length === 3, 'M5 total 40 -> 3 samples (d 0/15/30)', { got: m5.length });
  approxPt(m5[1], [LAT0 + dLat(15), LNG0], 'M5 d=15 lies on segment 1 at t = 0.75');
  approxPt(m5[2], [LAT0 + dLat(20), LNG0 + 10 / 80386], 'M5 d=30 lies on segment 2 at t = 0.5');
}

// =====================================================================
// VALIDATESNAP - G built from computeStretches + samplesFor over a
// synthetic roads object: A is cut by B (at its middle vertex) and by C
// (at 55.66 m along it) -> A has 3 parts; B is cut once by A's middle
// vertex -> 2 parts; C is cut by nobody -> 1 part.
// Samples: A 15 (d 0..210 of 222.64), B 11 (0..150 of 160.772), C 11.
// =====================================================================
const EXPECT_AT = 1700000000000;
const ISO1 = '2026-01-01T00:00:00.000Z', ISO2 = '2026-01-01T01:00:00.000Z';
let VG, VNAMES; // the real-geometry G for the V cases
{
  const roads = {
    A: [[P(0), P(1), P(2)]],
    B: [[[43.821, -79.571], [43.821, -79.57], [43.821, -79.569]]],
    C: [[[43.8205, -79.571], [43.8205, -79.57], [43.8205, -79.569]]]
  };
  const stretch = A.computeStretches(roads);
  VNAMES = Object.keys(roads);
  const samples = A.samplesFor(stretch, VNAMES);
  VG = { set: new Set(VNAMES), names: VNAMES, stretch, samples };
  // Preconditions, hand-derived above - if these fail the V fixtures
  // below are judging against the wrong geometry, so say so here.
  eqJSON(VNAMES.map(n => stretch[n].parts.length), [3, 2, 1], 'V0 part counts are A 3 / B 2 / C 1');
  eqJSON(VNAMES.map(n => samples[n].length), [15, 11, 11], 'V0 sample counts are A 15 / B 11 / C 11');

  const validRaw = () => ({
    at: EXPECT_AT,
    pieces: { A: [0, 3, 1], B: [1, 2], C: [0] },
    pieceTimes: { A: [[ISO1, null], [null, ISO2], [null, null]], B: [[ISO1, null], [null, null]], C: [[null, null]] },
    done: ['A'], times: { A: ISO1 }, via: { A: 'tap' }, cov: { A: [0, 14], B: [10], C: [] }
  });

  // V1: fully valid -> normalized deep copy.
  const raw1 = validRaw();
  const v1 = A.validateSnap(raw1, EXPECT_AT, VG);
  eqJSON(v1, { pieces: raw1.pieces, pieceTimes: raw1.pieceTimes, done: ['A'], times: { A: ISO1 }, via: { A: 'tap' }, cov: { A: [0, 14], B: [10], C: [] } }, 'V1 valid snapshot returns the expected normalization');
  raw1.pieces.A[0] = 9; raw1.pieceTimes.A[0][0] = '1999-01-01T00:00:00.000Z'; raw1.cov.A.push(3);
  ok(v1.pieces.A[0] === 0 && v1.pieceTimes.A[0][0] === ISO1 && v1.cov.A.length === 2, 'V1 result is a deep copy (mutating the input afterwards does not alter it)');

  // V2: raw is not a snapshot object at all.
  for (const [lbl, bad] of [['null', null], ['42', 42], ['"x"', 'x'], ['[]', []]])
    ok(A.validateSnap(bad, EXPECT_AT, VG) === null, 'V2 raw = ' + lbl + ' -> null');

  // V3: the stamp must match EXACTLY (strict !==).
  const r3 = validRaw(); r3.at = EXPECT_AT + 1;
  ok(A.validateSnap(r3, EXPECT_AT, VG) === null, 'V3 raw.at !== expectAt -> null');
  const r3b = validRaw(); r3b.at = String(EXPECT_AT);
  ok(A.validateSnap(r3b, EXPECT_AT, VG) === null, 'V3 raw.at as the STRING form -> null (strict)');

  // V4: pieces shape.
  const r4a = validRaw(); delete r4a.pieces.B;
  ok(A.validateSnap(r4a, EXPECT_AT, VG) === null, 'V4 pieces missing a street -> null');
  const r4b = validRaw(); r4b.pieces.ZZZ = [0];
  ok(A.validateSnap(r4b, EXPECT_AT, VG) === null, 'V4 pieces with an extra unknown street -> null');
  for (const [lbl, val] of [['4', 4], ['-1', -1], ['"1" (string)', '1']]) {
    const r = validRaw(); r.pieces.A[1] = val;
    ok(A.validateSnap(r, EXPECT_AT, VG) === null, 'V4 part value ' + lbl + ' -> null');
  }
  const r4c = validRaw(); r4c.pieces.A = [0, 3];
  ok(A.validateSnap(r4c, EXPECT_AT, VG) === null, 'V4 wrong parts length -> null');

  // V5: pieceTimes through the sanitizer.
  const r5a = validRaw(); r5a.pieceTimes.A = 7;
  ok(A.validateSnap(r5a, EXPECT_AT, VG) === null, 'V5 a street pieceTimes entry as a scalar -> null');
  const r5b = validRaw(); r5b.pieceTimes.A = { 0: [ISO1, null], 1: [null, ISO2], 2: [null, null] };
  const v5b = A.validateSnap(r5b, EXPECT_AT, VG);
  ok(v5b !== null && Array.isArray(v5b.pieceTimes.A), 'V5 numeric-keyed OBJECT form is accepted');
  eqJSON(v5b && v5b.pieceTimes.A, [[ISO1, null], [null, ISO2], [null, null]], 'V5 numeric-keyed form normalizes to the array form');
  const r5c = validRaw(); r5c.pieceTimes.A[0][0] = 'not-a-date';
  ok(A.validateSnap(r5c, EXPECT_AT, VG) === null, 'V5 unparseable stamp string in a pair -> null');
  const r5d = validRaw(); r5d.pieceTimes.A[0][0] = 123; // non-string, non-null: the sanitizer coerces it to null
  const v5d = A.validateSnap(r5d, EXPECT_AT, VG);
  ok(v5d !== null && v5d.pieceTimes.A[0][0] === null, 'V5 non-string stamp (123) is coerced to null by the sanitizer and ACCEPTED');

  // V6: SPARSE numeric-keyed object, keys {0, 2} only, parts length 3.
  // Observed outcome (pinned 2026-11-07, builder run): validateSnap
  // returns NULL. Rationale: sanitizePieceTimes accepts the numeric-
  // keyed object form and builds a SPARSE array (index 1 stays a hole);
  // validateSnap then walks pieceTimes with for..of, which yields
  // `undefined` for the hole, and reading pr[0] on undefined throws -
  // the function's own try/catch converts that throw into the null
  // rejection. So a sparse stamp record is rejected as a whole, never
  // partially applied - consistent with the header's "any violation
  // rejects the WHOLE snapshot", though the rejection arrives via the
  // catch rather than an explicit check. Whether that is the INTENDED
  // treatment of sparse records is flagged for adjudication in the
  // tranche report; this fixture pins the observed behaviour either way.
  const r6 = validRaw(); r6.pieceTimes.A = { 0: [ISO1, null], 2: [null, ISO2] };
  ok(A.validateSnap(r6, EXPECT_AT, VG) === null, 'V6 SPARSE numeric-keyed pieceTimes {0,2} of 3 -> null (observed; see rationale comment)');

  // V7: done list.
  const r7a = validRaw(); r7a.done = ['A', 'ZZZ'];
  ok(A.validateSnap(r7a, EXPECT_AT, VG) === null, 'V7 done containing an unknown street -> null');
  const r7b = validRaw(); r7b.done = ['A', 42];
  ok(A.validateSnap(r7b, EXPECT_AT, VG) === null, 'V7 done containing a non-string -> null');
  const r7c = validRaw(); r7c.done = ['B', 'A', 'B'];
  const v7c = A.validateSnap(r7c, EXPECT_AT, VG);
  eqJSON(v7c && v7c.done, ['B', 'A'], 'V7 done duplicates are deduped, first occurrence order');

  // V8: times / via.
  const r8a = validRaw(); r8a.times = { A: 'not-a-date' };
  ok(A.validateSnap(r8a, EXPECT_AT, VG) === null, 'V8 times value unparseable as a date -> null');
  const r8b = validRaw(); r8b.times = { ZZZ: ISO1 };
  ok(A.validateSnap(r8b, EXPECT_AT, VG) === null, 'V8 times with an unknown street key -> null');
  const r8c = validRaw(); r8c.via = { A: 42 };
  ok(A.validateSnap(r8c, EXPECT_AT, VG) === null, 'V8 via with a non-string value -> null');
  const r8d = validRaw(); r8d.via = { ZZZ: 'tap' };
  ok(A.validateSnap(r8d, EXPECT_AT, VG) === null, 'V8 via with an unknown key -> null');

  // V9: coverage indexes.
  for (const [lbl, idx] of [['index == samples length (15)', 15], ['index -1', -1], ['index 1.5', 1.5]]) {
    const r = validRaw(); r.cov = { A: [idx] };
    ok(A.validateSnap(r, EXPECT_AT, VG) === null, 'V9 cov ' + lbl + ' -> null');
  }
  const r9d = validRaw(); r9d.cov = { ZZZ: [0] };
  ok(A.validateSnap(r9d, EXPECT_AT, VG) === null, 'V9 cov with an unknown street -> null');
  const r9e = validRaw(); r9e.cov = { A: [14] }; // length - 1 = the valid max
  ok(A.validateSnap(r9e, EXPECT_AT, VG) !== null, 'V9 cov valid max index (length-1) accepted');

  // V10: the default-G path - G omitted, the factory's live containers
  // (STREETSET / STREETNAMES / STRETCH / SAMPLES) carry the same geometry.
  A.set({ STREETNAMES: VNAMES, STREETSET: VG.set, STRETCH: VG.stretch, SAMPLES: VG.samples });
  ok(A.validateSnap(validRaw(), EXPECT_AT) !== null, 'V10 default-G path (G omitted) accepts the same valid snapshot');
  A.set({ STREETNAMES: [], STREETSET: new Set(), STRETCH: {}, SAMPLES: {} });
}

// =====================================================================
// PACEINFO (+ refRun / cleanWorkM / workRateMh) - factory state:
// STREETNAMES / STRETCH from tiny geometries; pieces / pieceTimes /
// history / runStart injected per case. Timestamps are ISO strings so
// Date.parse is exact. Live cases set runStart = Date.now() - X just
// before the call; the rate assertion allows 0.5% for the clock time
// between setting runStart and paceInfo reading Date.now().
// =====================================================================
{
  // Two disjoint streets, one segment each, 111.32 m long, no junctions:
  // total per street 111.32; full-clean items work = (111.32+111.32)*2.
  const roads2 = { A: [[P(0), P(1)]], B: [[[43.90, -79.60], [43.901, -79.60]]] };
  const stretch2 = A.computeStretches(roads2);
  const names2 = Object.keys(roads2);
  const setGeom = (stretch, names) => A.set({ STRETCH: stretch, STREETNAMES: names, STREETSET: new Set(names), history: [], runStart: 0, pieces: {}, pieceTimes: {} });
  const iso = (ms) => new Date(ms).toISOString();
  const T0 = 1767225600000; // 2026-01-01T00:00:00.000Z

  // P1: no history, no run.
  setGeom(stretch2, names2);
  const p1 = A.paceInfo();
  ok(p1.rateMh === null && p1.refRateMh === null && p1.live === false && p1.etaTxt === '', 'P1 no history, no run -> {rateMh:null, refRateMh:null, live:false, etaTxt:""}', p1);

  // P2: reference only. Duration gate is h > 0.05 STRICT: exactly
  // 180 s (0.05 h) yields no rate; 181 s yields cleanWorkM / (181/3600).
  setGeom(stretch2, names2);
  const fullEntry = (durMs) => ({ at: iso(T0 + durMs), startedAt: iso(T0), items: { A: iso(T0), B: iso(T0) } });
  A.set({ history: [fullEntry(180000)] });
  ok(A.paceInfo().refRateMh === null, 'P2 full run of exactly 180 s (h = 0.05, not > 0.05) -> refRateMh null');
  A.set({ history: [fullEntry(181000)] });
  const p2 = A.paceInfo();
  approx(p2.refRateMh, 445.28 / (181 / 3600), 'P2 full run of 181 s -> refRateMh = cleanWorkM/(181/3600), cleanWorkM = 445.28', 1e-6);
  approx(A.cleanWorkM(fullEntry(181000)), 445.28, 'P2 cleanWorkM (items fallback) = sum of street totals x2', 1e-9);

  // P3: refRun preference. Geometry: SIX disjoint streets (totals
  // 111.32 each), so a 5-item entry qualifies for the >= 5 fallback
  // tier while only a 6-item entry is a full run.
  const roads6 = {}; for (let i = 0; i < 6; i++) roads6['S' + i] = [[[43.82 + i * 0.01, -79.60], [43.821 + i * 0.01, -79.60]]];
  const stretch6 = A.computeStretches(roads6), names6 = Object.keys(roads6);
  setGeom(stretch6, names6);
  const itemsOf = (ns) => Object.fromEntries(ns.map(n => [n, iso(T0)]));
  const fullOld = { at: iso(T0 + 3600000), startedAt: iso(T0), items: itemsOf(names6) };
  const partial = { at: iso(T0 + 7200000), startedAt: iso(T0 + 3600000), items: itemsOf(names6.slice(0, 5)) };
  const fullNew = { at: iso(T0 + 10800000), startedAt: iso(T0 + 7200000), items: itemsOf(names6) };
  A.set({ history: [fullOld, partial, fullNew] });
  ok(A.refRun() === fullNew, 'P3 ref is the NEWER full run (full tier searched from the end)');
  A.set({ history: [fullOld, partial] });
  // Hand-derived from refRun's two passes: the full tier is searched
  // over the WHOLE history before the fallback tier is consulted, so
  // with the newer full run removed the OLD full run still wins over
  // the newer partial - the fallback only ever fires when NO full run
  // exists. (The tranche brief's shorthand "the >=5 fallback picks…"
  // for this removal is pinned here as the code's actual two-pass
  // semantics; the pure fallback case is P3b.)
  ok(A.refRun() === fullOld, 'P3 with newer full removed, the older FULL run still beats the newer partial (two-pass preference)');
  const partialNewer = { at: iso(T0 + 14400000), startedAt: iso(T0 + 10800000), items: itemsOf(names6.slice(1)) };
  const tiny = { at: iso(T0 + 18000000), startedAt: iso(T0 + 14400000), items: itemsOf(names6.slice(0, 4)) };
  A.set({ history: [partial, partialNewer, tiny] });
  ok(A.refRun() === partialNewer, 'P3b no full run anywhere -> >=5 fallback picks the NEWEST qualifying (the 4-item newest entry does not qualify)');

  // P4: cleanWorkM sides path. Geometry: the C1 crossing pair -
  // A parts are two 111.32 m pieces; B parts are two 80.386 m pieces.
  const roadsX = { A: [[P(0), P(1), P(2)]], B: [[[43.821, -79.571], [43.821, -79.57], [43.821, -79.569]]] };
  const stretchX = A.computeStretches(roadsX), namesX = Object.keys(roadsX);
  setGeom(stretchX, namesX);
  const sidesEntry = { at: iso(T0 + 3600000), startedAt: iso(T0), items: { A: iso(T0) }, sides: { p: { A: [1, 0], B: [2, 0] } } };
  approx(A.cleanWorkM(sidesEntry), 111.32 + 80.386, 'P4 sides path: work = only the set side bits (A part0 side1 + B part0 side2)', 1e-9);
  const zeroSides = { at: iso(T0 + 3600000), startedAt: iso(T0), items: { A: iso(T0) }, sides: { p: { A: [0, 0], B: [0, 0] } } };
  approx(A.cleanWorkM(zeroSides), 445.28, 'P4 sides present but all-zero -> falls back to the items computation (A total x2)', 1e-9);

  // P5: live rate. A part0 side1 stamped during the run counts (L =
  // 111.32); B part0 side1 marked but stamped BEFORE runStart does not.
  setGeom(stretchX, namesX);
  const now5 = Date.now(), rs5 = now5 - 120000; // 120 s > the 0.02 h (72 s) live gate
  A.set({ runStart: rs5, pieces: { A: [1, 0], B: [1, 0] },
    pieceTimes: { A: [[iso(rs5 + 60000), null], [null, null]], B: [[iso(rs5 - 10000), null], [null, null]] } });
  const p5 = A.paceInfo();
  ok(p5.live === true, 'P5 live: run older than 72 s with in-run stamped work -> live true');
  const expectRate5 = 111.32 / ((Date.now() - rs5) / 3600000);
  ok(Math.abs(p5.rateMh - expectRate5) <= 0.005 * expectRate5, 'P5 rateMh ~= L / elapsed hours within 0.5% (pre-run stamp excluded)', { got: p5.rateMh, want: expectRate5 });
  ok(p5.etaTxt.startsWith('ETA '), 'P5 etaTxt starts with "ETA " while work remains', { got: p5.etaTxt });

  // P6: below the live gate (60 s < 72 s): live stays false and the rate
  // falls back to the reference - but the ETA is still computed, since
  // runStart is set and rateMh (the ref rate) is non-null.
  setGeom(stretchX, namesX);
  const refEntryX = { at: iso(T0 + 181000), startedAt: iso(T0), items: { A: iso(T0), B: iso(T0) } };
  const rs6 = Date.now() - 60000;
  A.set({ history: [refEntryX], runStart: rs6, pieces: { A: [1, 0], B: [0, 0] },
    pieceTimes: { A: [[iso(rs6 + 30000), null], [null, null]], B: [[null, null], [null, null]] } });
  const p6 = A.paceInfo();
  ok(p6.live === false, 'P6 run of 60 s (< 72 s gate) with stamped work -> live false');
  ok(p6.rateMh === p6.refRateMh && p6.refRateMh !== null, 'P6 rateMh falls back to refRateMh');
  ok(p6.etaTxt.startsWith('ETA '), 'P6 etaTxt still computed from the REF rate while runStart is set', { got: p6.etaTxt });

  // P7: run complete - every side of every part marked, all stamped in
  // the run, so leftM = totalWorkM - workDoneM = 0 and no ETA is shown
  // even with a live rate.
  setGeom(stretchX, namesX);
  const rs7 = Date.now() - 120000;
  A.set({ runStart: rs7, pieces: { A: [3, 3], B: [3, 3] },
    pieceTimes: { A: [[iso(rs7 + 1000), iso(rs7 + 1000)], [iso(rs7 + 1000), iso(rs7 + 1000)]], B: [[iso(rs7 + 1000), iso(rs7 + 1000)], [iso(rs7 + 1000), iso(rs7 + 1000)]] } });
  const p7 = A.paceInfo();
  ok(p7.live === true && p7.rateMh !== null, 'P7 complete run still has a live rate (precondition)');
  approx(A.workDoneM(), A.totalWorkM(), 'P7 workDoneM == totalWorkM when fully marked', 1e-9);
  ok(p7.etaTxt === '', 'P7 leftM = 0 -> etaTxt "" even with a live rate', { got: p7.etaTxt });
}

// ---------- fmt helpers (extracted; used by paceInfo's ETA text) ----------
{
  ok(A.fmtDur(0) === '0s' && A.fmtDur(45000) === '45s', 'fmtDur sub-minute');
  ok(A.fmtDur(3600000) === '1h 00m' && A.fmtDur(3660000) === '1h 01m', 'fmtDur hours');
  ok(A.fmtClock(new Date(2026, 0, 1, 13, 5)) === '1:05 PM', 'fmtClock PM');
  ok(A.fmtClock(new Date(2026, 0, 1, 0, 0)) === '12:00 AM', 'fmtClock midnight');
}

if (fails) { console.log('selftest-judging-fixtures: ' + fails + ' FAILURE(S) of ' + checks + ' checks'); process.exit(1); }
console.log('selftest-judging-fixtures: all fixtures hold (' + checks + ' checks: stitchRuns, finishJunctionCuts, computeStretches, samplesFor, validateSnap, paceInfo/refRun/cleanWorkM, fmt helpers)');
