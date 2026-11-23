// proof-1267.mjs - Beta 1.267 (fix_id: create-round-1267).
// THE CREATE ROUND - four of Andrew's 2026-11-21 calls, pinned statically
// (the rendered behaviour is graded by drive220):
// (1) DEAD-END FEATHER (Option 1): a sibling computation computeDeadEnds
//     beside computeBoundaryEnds in parts/create-packs.js writes dead-end
//     records (join == end, fade 10) into the same pack `ends` field the
//     boundary records (fade 15) ride; the fade length is per-record data
//     (element 5) the engine reads through fadeMOf - the single global
//     FADE_M survives only as the legacy default. Both call sites (the
//     create save, scripts/derive-pack-ends.mjs) merge both computations.
//     Route 5W's shipped field carries exactly 15 records: the 7 boundary
//     (fade 15) and the 8 proven dead ends (fade 10) by street name.
// (2) NAMES ON TOP: ensureDraftLayers seats all five draft layers below
//     the first label layer via the shared crFirstLabelLayerId finder.
// (3) DONE FLIGHT: fitDraft flies (flyTo, curve 1.2) to the flat
//     cameraForBounds fit of the draft box; an empty draft returns
//     before any flight call. (Beta 1.269 re-pin: the flight's landing
//     changed - pitch 0, and the fit's bottom padding is the Review
//     sheet's measured height + 24, so the draft lands in the visible
//     area above the sheet; 1.267's pitch-45 full-screen fit was
//     rejected by Andrew live. Check 3a pins the 1.269 shape.)
// (4) SETTINGS WORDING: the Display & Sound row reads "Keep screen
//     awake" / "Screen won't dim while cleaning" (aria follows); the old
//     strings are gone from parts/.
// Fail-first baseline: on the Beta 1.266 tree every section fails (no
// computeDeadEnds, no element 5, no beforeId on the draft layers, the
// fitBounds fitDraft, the long settings strings).
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const packs = read('parts/create-packs.js');
const save = read('parts/create-save.js');
const engine = read('parts/engine.js');
const pick = read('parts/create-pick.js');
const head = read('parts/head.html');
const data = read('parts/data.js');
const derive = read('scripts/derive-pack-ends.mjs');
const whatsnew = read('parts/whatsnew.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- (1) dead-end feather ----------
check('1a: the fade lengths are named constants in create-packs.js - BOUNDARY_FADE_M 15, DEAD_FADE_M 10',
  packs.includes('const BOUNDARY_FADE_M = 15;') && packs.includes('const DEAD_FADE_M = 10;'));
check('1b: computeDeadEnds exists as the sibling computation and calls computeBoundaryEnds (the boundary class wins its ends)',
  packs.includes('function computeDeadEnds(roads, allStreets)') && packs.includes('const boundary = computeBoundaryEnds(roads, allStreets);'));
check('1b2: the street\'s own geometry is never vetoed by route membership at either filter (the CREATE full-name keying - Codex P2, PR #163): ownNames carries no routeNames veto and the scan skips only non-own route streets',
  packs.includes("const ownNames = Object.keys(allStreets).filter(m => m === n || m.startsWith(n + ' ') || n.startsWith(m + ' '));") &&
  packs.includes('if (routeNames.includes(m) && !isOwn) continue;') &&
  !packs.includes('!routeNames.includes(m) && (m === n'));
check('1c: a dead record carries join == end and DEAD_FADE_M; a boundary record carries BOUNDARY_FADE_M as element 5',
  packs.includes('(out[n] = out[n] || []).push([r6(E[0]), r6(E[1]), r6(E[0]), r6(E[1]), DEAD_FADE_M]);') &&
  packs.includes('(out[n] = out[n] || []).push([r6(E[0]), r6(E[1]), r6(join[0]), r6(join[1]), BOUNDARY_FADE_M]);'));
check('1d: both call sites merge both computations - the create save and the derive script',
  save.includes('const de = computeDeadEnds(roads, all);') && derive.includes('const de = computeDeadEnds(pack.roads, all);'));
check('1e: normalizePack preserves a sane element 5 (the per-record fade length survives validation)',
  packs.includes("if (isFinite(r[4]) && r[4] > 0 && r[4] <= 100) rec.push(Math.round(r[4] * 10) / 10);"));
check('1f: the engine reads the length per record - fadeMOf(rec) feeds splitBoundaryEnd, whose body splits on the parameter (fm), never the global',
  engine.includes('function fadeMOf(rec) { return (rec && isFinite(rec[4]) && rec[4] > 0) ? rec[4] : FADE_M; }') &&
  engine.includes('const sp = splitBoundaryEnd(solid, [rec[2], rec[3]], atStart, fadeMOf(rec));') &&
  engine.includes('fade: sub(Math.max(0, dJ - fm), dJ)') && !engine.includes('dJ - FADE_M'));
const m = data.match(/ends: (\{.*?\}),\n  roads:/s);
let ends = null; try { ends = m ? JSON.parse(m[1]) : null; } catch (e) {}
const allRecs = ends ? Object.entries(ends).flatMap(([k, v]) => v.map(r => [k, r])) : [];
const deadStreets = allRecs.filter(([, r]) => r[4] === 10).map(([k]) => k).sort();
const DEAD8 = ['Angie', 'Bayside', 'Boddy', 'Dianawood', 'Ferrari', 'Julian', 'Tina', 'Topper'];
check('1g: the shipped 5W ends field carries exactly 15 records - 7 boundary at fade 15, 8 dead at fade 10, the dead on exactly the 8 proven streets | total ' + allRecs.length + ', dead ' + JSON.stringify(deadStreets),
  !!ends && allRecs.length === 15 && allRecs.filter(([, r]) => r[4] === 15).length === 7 &&
  JSON.stringify(deadStreets) === JSON.stringify(DEAD8) &&
  allRecs.filter(([, r]) => r[4] === 10).every(([, r]) => r[0] === r[2] && r[1] === r[3]));

// ---------- (2) names on top ----------
const draftIds = ['crDraftCase', 'crDraftLineDim', 'crDraftLine', 'crDraftLineActive', 'crDraftHit'];
check('2a: the shared first-label finder exists in create-pick.js',
  pick.includes('function crFirstLabelLayerId()'));
check('2b: every draft layer is added with the beforeId (below the first label layer) | ' + draftIds.map(id => id + ':' + (pick.includes("id: '" + id + "'") && new RegExp("id: '" + id + "'[\\s\\S]{0,3000}\\}, before\\)").test(pick))).join(' '),
  draftIds.every(id => new RegExp("id: '" + id + "'[\\s\\S]{0,3000}\\}, before\\)").test(pick)));
check('2c: the trim glow still inserts before crDraftCase (it follows the draft stack below the labels)',
  pick.includes("map.addLayer(crGlowLayerObj(), 'crDraftCase')"));

// ---------- (3) Done flight ----------
const fdStart = pick.indexOf('function fitDraft() {');
const fdBody = fdStart > -1 ? pick.slice(fdStart, pick.indexOf('\n}\n', fdStart)) : '';
check('3a: fitDraft flies with the load-in motion family, FLAT (Beta 1.269 re-pin) - flyTo pitch 0, curve 1.2, the cameraForBounds fit whose bottom padding is the sheet\'s measured height + 24',
  fdBody.includes('map.cameraForBounds(b, { padding: pad })') && fdBody.includes('bottom: (sheet ? sheet.offsetHeight : 0) + 24') && fdBody.includes('map.flyTo({ center: fit.center, zoom: fit.zoom, pitch: 0, bearing: 0, duration: 2000, curve: 1.2, essential: false })'));
check('3b: an empty draft returns before any flight (the box guard stands ahead of the flyTo)',
  fdBody.indexOf('if (!bb) return;') > -1 && fdBody.indexOf('if (!bb) return;') < fdBody.indexOf('map.flyTo'));
check('3c: setCreateStage still routes the preview through fitDraft',
  pick.includes("if (stage === 'preview') fitDraft();"));

// ---------- (4) settings wording ----------
check('4a: the row reads "Keep screen awake" / "Screen won\'t dim while cleaning", the aria-label following the title',
  head.includes('<div class="m-togLbl">Keep screen awake</div><div class="m-togDesc">Screen won\'t dim while cleaning</div>') &&
  head.includes('aria-label="Keep screen awake"'));
check('4b: the old strings are gone from parts/',
  !head.includes('Keep screen awake during a clean') && !head.includes("Screen won't dim while a clean is running"));

// ---------- editorial ----------
check('5: What\'s New carries the round\'s headline bullet (dead ends feather) and no em dash',
  whatsnew.includes('The route dropdown now grows out of its pill, same width and colour, and tucks away a little quicker.') && !whatsnew.includes('—'));

console.log('proof-1267: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
