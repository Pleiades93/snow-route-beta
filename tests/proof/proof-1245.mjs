// proof-1245.mjs - Beta 1.245 (fix_id: longroad-1245).
// THE LONG-ROAD TAP (Andrew's phone report, 2026-11-19): tapping
// Highway 400 in Vaughan put up "Checking the whole of Highway 400…"
// and the app sat locked for the top-up's whole 90-second budget
// before adding nothing. The audit (the round's RECORD.md: every long
// road in all twelve packs measured on the 1.244 build) found why:
// the extract's ways carry their FULL geometry, so the stitch follows
// a tapped road OUT of the working city; the completeness check then
// finds the run's ends outside every verified box and fires the one
// targeted top-up for out-of-city geometry - 10 of the 17 audited
// roads resolved that way, every 400-series highway and the QEW among
// them, plus Brampton's Airport Road. The fix: (1) THE CITY CLIP in
// crResolve (parts/create-citydata.js) - when a working city is in
// force, the tap lies inside it, and the chosen run reaches past the
// city box, the run is cut at the box first (crClipLineToBox); a cut
// end is complete by definition, an original in-city end still faces
// the coverage test, and an unproven one falls through to the exact
// pre-1.245 logic (edge, the one top-up, pending). (2) chainWays'
// seed lengths are computed once (parts/create-pick.js) - the values
// and the strict comparison are the same, so the runs are unchanged
// (the round's node differential over all 44,405 pack names: zero
// differences). The behaviour itself is graded by drive166 (J7a/J7b
// the clip cases, J7d the fail-closed top-up, J8c/J8d the resolver
// seam, J9c the wider-preparation sweep) and by the round's rendered
// audit re-run (every previously-edge road resolves locally as its
// in-city stretch; the ordinary roads' selections byte-identical to
// 1.244; the Highway 400 headline settles in ~0.5 s, street added).
// Run from the repo root:  node tests/proof/proof-1245.mjs
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const citydata = read('parts/create-citydata.js');
const pick = read('parts/create-pick.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');
const partsDir = new URL('parts/', root);
const allParts = readdirSync(partsDir).filter(f => f.endsWith('.js') || f.endsWith('.html')).map(f => read('parts/' + f)).join('\n');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the clip helper ----------
check('1: crClipLineToBox exists in create-citydata.js and nowhere else in parts (one home)',
  citydata.includes('function crClipLineToBox(line, box)') && (allParts.match(/crClipLineToBox/g) || []).length === 2);
check('2: the helper records which ends the cut made (startCut / endCut)',
  citydata.includes('cur = { line: [A], startCut: t0 > 0, endCut: false }') && citydata.includes('cur.endCut = t1 < 1;'));

// ---------- the clip's seat in crResolve ----------
const CLIP_GUARD = 'if (!boundary && crCity && crCity.bbox && crInBox(crCity.bbox, lngLat.lat, lngLat.lng) && best.line.some(p => !crInBox(crCity.bbox, p[0], p[1]))) {';
check('3: the clip engages only with no explicit boundary, a working city in force, the tap inside it, and a run that reaches past the box',
  citydata.includes(CLIP_GUARD));
check('4: a proven clipped piece resolves ok as the one stitched in-city line',
  citydata.includes("if (!unproven) return { status: 'ok', segs: [piece.line] };"));
check('5: the fall-through stands AFTER the clip: the pre-1.245 completeness check is intact and later in crResolve (an unproven in-city end still edges)',
  citydata.includes('const closed = boundary ? crInBox(boundary, end[0], end[1]) : crInAnyBox(cov.boxes, end[0], end[1]);')
  && citydata.indexOf(CLIP_GUARD) > -1 && citydata.indexOf(CLIP_GUARD) < citydata.indexOf('const closed = boundary'));
check('6: a cut end skips the coverage test; an original end faces it (the clip\'s ends loop)',
  citydata.includes('if (!end.cut && !crInAnyBox(cov.boxes, end.pt[0], end.pt[1])) { unproven = true; break; }'));
check('6b: the piece is chosen by distance to its SEGMENTS (crSegProjM), not its vertices (the PR #128 Codex catch: a re-entering road\'s wrong piece)',
  citydata.includes('const sd = crSegProjM([lngLat.lat, lngLat.lng], pc.line[i - 1], pc.line[i]).d;'));

// ---------- the top-up path is untouched ----------
check('7: the edge path still fires its ONE top-up on the same budgets (the clip narrows when it is reached, it does not remove it)',
  pick.includes('const got = await crSourceExtract(box, osmName, CR_TIMING.topupBudgetMs, CR_TIMING.topupAttempt1Ms,') && pick.includes("'Checking the whole of ' + shortStreetName(name) + '…'"));

// ---------- chainWays: lengths computed once ----------
check('8: the seed scan reads precomputed lengths (computed once per way)',
  pick.includes('const lens = pool.map(w => crLineLen(w));') && pick.includes('if (lens[i] > lens[bi]) bi = i;'));
check('9: the old re-walk form is gone from parts (no seed scan recomputes a pooled way\'s length)',
  !allParts.includes('crLineLen(pool[i])'));
check('10: the lengths splice in lockstep with the pool (seed pick and growth join)',
  pick.includes('const first = pool.splice(bi, 1)[0]; lens.splice(bi, 1);') && pick.includes('segs.push(addSeg); pool.splice(i, 1); lens.splice(i, 1); grew = true; break;'));

// ---------- the frame ----------
const wnM = whatsnew.match(/items: \["([^"]*)"/); // Beta 1.259 premise update: the extractor took the entry's ONLY item (items: ["..."] end-bracketed); the 1.259 entry carries three bullets (one per change in the round, per the addenda), so the match now takes the FIRST item - the claim below (the current entry's lead bullet, the cap, no em dash) is unchanged
check('11: What\'s New carries the CURRENT bullet (rolled to 1.251: this check tracks the current entry each round), within the 108-char cap (and stays em-dash free)',
  !!wnM && wnM[1] === 'Under the hood: note editing now runs through one session owner, so drafts and autosaves stay in step.' && wnM[1].length <= 108 && !whatsnew.includes('—'));
check('12: the CHANGELOG top entry is Beta 1.245',
  changelog.indexOf('## Beta 1.245') > -1 && changelog.indexOf('## Beta 1.245') < changelog.indexOf('## Beta 1.244'));

console.log(`proof-1245: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
