// PR #23 bug-hunt fix fixtures (Beta 1.185 gate). The external Claude bug-hunt
// branch (PR #23, commit b262cd0) claimed five fixes; the 2026-11-13 assessment
// adjudicated all five REAL and SOUND (work/pr23-assessment/REPORT.md), and
// Andrew approved the landing with proof coverage as a condition - bugs 2 and 3
// were invisible to the battery, which is how they survived. This file proves
// the four JavaScript fixes in plain Node, extracting the shipped functions
// (and, for bug 1, the shipped scan block) verbatim from parts/ - a regression
// to the pre-fix form fails here before any browser run. Bug 5 (the tier
// selector) is proven by scripts/select-tier-fixtures/run-fixtures.py.
import { readFileSync } from 'node:fs';
const app3 = readFileSync(new URL('../../parts/app3.js', import.meta.url), 'utf8');
const packs = readFileSync(new URL('../../parts/create-packs.js', import.meta.url), 'utf8');
const eng = readFileSync(new URL('../../parts/engine.js', import.meta.url), 'utf8');
function extractFrom(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };

// ---- Bug 2: cleanWorkM - a null-time completed street missing from the sides
// map must still price at its full both-sides length (the assessment's
// constructed legacy clean: pre-fix returns 1000, correct is 1400) ----
const cleanWorkM = new Function('STRETCH', 'STREETNAMES', 'segLenM',
  extractFrom(app3, 'cleanWorkM') + '\nreturn cleanWorkM;')(
  { Alpha: { total: 200, parts: ['a1'] }, Beta: { total: 500, parts: ['b1'] } },
  ['Alpha', 'Beta'],
  p => ({ a1: 200, b1: 500 }[p]));
t('W1 legacy clean: null-time street missing from sides map prices in full (1400, not 1000)',
  cleanWorkM({ items: { Alpha: null, Beta: 1700000000000 }, sides: { p: { Beta: [3] } } }) === 1400);
t('W2 stored workM is read verbatim', cleanWorkM({ workM: 42, items: {}, sides: null }) === 42);
t('W3 no sides map: items derivation alone', cleanWorkM({ items: { Alpha: 1700000000000 } }) === 400);
t('W4 partial-side work on a never-completed street still prices from its bits',
  cleanWorkM({ items: {}, sides: { p: { Beta: [1] } } }) === 500);
t('W5 null-time street WITH a sides entry prices by its bits, not the fallback',
  cleanWorkM({ items: { Alpha: null }, sides: { p: { Alpha: [1] } } }) === 200);

// ---- Bug 3: headDelta - correct for unnormalized accumulated headings. The
// smoothed heading (app3 updateHeading) accumulates headDelta(sm, hdg) * 0.35
// and is never normalized; past ~540 deg of accumulation the pre-fix formula
// returned -321.4 deg for a true +38.6 deg step (a -112 deg map jerk) ----
const headDelta = new Function(extractFrom(app3, 'headDelta') + '\nreturn headDelta;')();
const refDelta = (a, b) => Math.atan2(Math.sin((b - a) * Math.PI / 180), Math.cos((b - a) * Math.PI / 180)) * 180 / Math.PI;
t('H1 accumulated heading: headDelta(691.4, 10) is +38.6, in range',
  Math.abs(headDelta(691.4, 10) - 38.6) < 0.05 && headDelta(691.4, 10) > -180 && headDelta(691.4, 10) <= 180);
{ let ok = true;
  for (let a = -2000; a <= 2000 && ok; a += 137.5) for (let b = 0; b < 360; b += 7) {
    const d = headDelta(a, b), r = refDelta(a, b);
    // compare CIRCULARLY (refDelta of the two answers): at the +-180 seam the
    // formula's -180 and the reference's +180 are the same heading, not a 360 gap
    if (!(d >= -180 && d <= 180) || Math.abs(refDelta(r, d)) > 1e-6) { ok = false; break; }
  }
  t('H2 sweep vs atan2 reference over accumulated headings (-2000..2000 deg)', ok); }
{ let sm = null, ok = true, course = 0;
  for (let k = 0; k < 80; k++) { // circling: course steps +10 deg a fix, wrapped as GPS delivers it
    const d = sm === null ? 0 : headDelta(sm, course);
    if (!(d > -180 && d <= 180)) { ok = false; break; }
    sm = sm === null ? course : sm + d * 0.35; // updateHeading's exact recurrence (app3)
    course = (course + 10) % 360;
  }
  t('H3 circling recurrence: every delta in range, smoother still tracking after 2+ laps',
    ok && Math.abs(refDelta(sm, course)) < 45); }
t('H4 ordinary headings unchanged', headDelta(350, 10) === 20 && headDelta(10, 350) === -20 && headDelta(45, 45) === 0);

// ---- Bug 4: uniqueRouteId - an id held only by the user-pack cache (a stored
// pack that failed normalization, so it never entered ROUTE_PACKS) must not be
// re-minted: the save would overwrite that route's stored record ----
const mkUnique = (routePacks, cache) => new Function('ROUTE_PACKS', 'userPackCache',
  extractFrom(packs, 'uniqueRouteId') + '\nreturn uniqueRouteId;')(routePacks, cache);
t('R1 cache-held id is not re-minted', mkUnique([], { 'my-route': {} })('My Route') === 'my-route-2');
t('R2 shipped-id collision still suffixes', mkUnique([{ id: 'my-route' }], {})('My Route') === 'my-route-2');
t('R3 shipped + cache collisions walk to -3', mkUnique([{ id: 'my-route' }], { 'my-route-2': {} })('My Route') === 'my-route-3');
t("R4 'constructor' slug: prototype names are not phantom collisions", mkUnique([], {})('Constructor') === 'constructor');
t("R5 a cache entry literally named 'constructor' does collide", mkUnique([], { constructor: {} })('Constructor') === 'constructor-2');
t('R6 free name mints its plain slug', mkUnique([], {})('New Street') === 'new-street');

// ---- Bug 1: edgeRunSlices' other-arm crossing scan - the street's own name
// must SKIP (continue), not ABORT (break) the scan of the other streets: with
// the street first in H.names the pre-fix code checked NO other street, so a
// marked side line crossing this run went unseen and the junction was wrongly
// granted an unclipped run to the vertex. The scan block is extracted VERBATIM
// from parts/engine.js (the enclosing function needs the full junction
// machinery; the block itself is the unit that was wrong), with the engine's
// own segCross/lineHit/XYOf and plane-geometry stubs for H's distance fns
// (MLAT = MLNG = 1: a consistent Euclidean plane in [lat, lng] pairs) ----
const xyLine = eng.split('\n').find(l => l.startsWith('const XYOf ='));
if (!xyLine) throw new Error('XYOf definition not found in engine.js');
const a0 = eng.indexOf('let crosses = false;');
const a1 = eng.indexOf('if (!crosses) skip.add(J);');
if (a0 < 0 || a1 < 0) throw new Error('crossing-scan anchors not found in engine.js');
const scanBlock = eng.slice(a0, a1 + 'if (!crosses) skip.add(J);'.length);
const jDistM = (a, b) => Math.hypot(b[1] - a[1], b[0] - a[0]);
const ptSegM = (p, a, b) => {
  const vx = b[1] - a[1], vy = b[0] - a[0], L2 = vx * vx + vy * vy || 1;
  const tt = Math.max(0, Math.min(1, ((p[1] - a[1]) * vx + (p[0] - a[0]) * vy) / L2));
  return Math.hypot(p[1] - (a[1] + tt * vx), p[0] - (a[0] + tt * vy));
};
const mkScan = names => new Function('H', 'GEO', 'CORRIDOR', 'n',
  xyLine + '\n' + extractFrom(eng, 'segCross') + '\n' + extractFrom(eng, 'lineHit') +
  '\nreturn function scan(run, J, skip) {\n' + scanBlock + '\nreturn crosses;\n};')(
  { MLAT: 1, MLNG: 1, names, pieces: { Crosser: [1], Self: [3] }, jDistM, ptSegM },
  { Crosser: { cuts: [[0, 2]], stitched: [[0, 0], [1, 1], [2, 2]], off0: [[-6, -6], [6, 6]], off1: [[-6, -6], [6, 6]], gaps: new Set() } },
  5.2, 'Self');
const RUN = { pts: [[0, -30], [0, 4]] }; // this street's side line, running through the vertex
const JV = { V: [0, 0] };
{ const skip = new Set(); const crosses = mkScan(['Self', 'Crosser'])(RUN, JV, skip);
  t('S1 own name first: the crossing street after it is still checked (crosses seen, junction NOT skipped)',
    crosses === true && skip.size === 0); }
{ const skip = new Set(); const crosses = mkScan(['Crosser', 'Self'])(RUN, JV, skip);
  t('S2 crossing street first: crossing seen (the order the pre-fix code happened to get right)',
    crosses === true && skip.size === 0); }
{ const far = new Function('H', 'GEO', 'CORRIDOR', 'n',
    xyLine + '\n' + extractFrom(eng, 'segCross') + '\n' + extractFrom(eng, 'lineHit') +
    '\nreturn function scan(run, J, skip) {\n' + scanBlock + '\nreturn crosses;\n};')(
    { MLAT: 1, MLNG: 1, names: ['Self', 'Crosser'], pieces: { Crosser: [1], Self: [3] }, jDistM, ptSegM },
    { Crosser: { cuts: [[0, 2]], stitched: [[0, 0], [1, 1], [2, 2]], off0: [[40, 40], [50, 50]], off1: [[40, 40], [50, 50]], gaps: new Set() } },
    5.2, 'Self');
  const skip = new Set(); const crosses = far(RUN, JV, skip);
  t('S3 no crossing line near the junction: no cross, junction skipped for the kerb clip as before',
    crosses === false && skip.has(JV) === true); }

console.log(`selftest-pr23-fixes: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
