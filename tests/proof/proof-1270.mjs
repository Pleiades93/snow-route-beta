// proof-1270 - Beta 1.270 (SYNC round, Andrew's synchronised-streaming
// design 2026-11-21): the 1.266 hold-then-reveal cycle is retired whole -
// nothing is held on a pick and the street titles stream in with the map's
// own load-in - and the 1.248 anchor re-place survives only as a
// CONDITIONAL cure inside app5's title guard: at the flight's moveend the
// guard counts the titles placed so far, skips the teardown when the count
// is zero (the investigation's pixel audit: in that case the rebuild is a
// complete visual no-op), and on a fired pick runs the one re-place at
// idle inside a TITLES-ONLY hold, so the cure cannot blink either and the
// basemap is never touched in any path. These are the static pins; the
// behaviour is proven by drive219 (the streaming presence lane).
//
// Beta 1.290 premise update (the label round): the guard, its cure and
// the hold are now DELETED whole - a title's side is geometry data
// (assignAnchors, read through a data-driven text-anchor), decided in
// the build before any flight, so a mid-flight placement keeps a correct
// side by construction and nothing remains for a cure to fix. The checks
// below are re-pointed to the deletion contract: what each check pinned
// about the guard's behaviour is restated as the absence that makes the
// behaviour unnecessary, and no claim is dropped silently - each new
// check names the hazard its predecessor guarded and why it cannot
// recur. drive219 is re-pointed in the same round.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const app2 = read('parts/app2.js');
const app5 = read('parts/app5.js');
const engine = read('parts/engine.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? pass++ : fail++; };
const count = (hay, needle) => hay.split(needle).length - 1;

// ---------- (1) the 1.266 cycle is retired whole ----------
check('1: the unified load-in cycle is GONE from app5 - no beginNameLoadIn, no settle gate, no reveal, no note functions, no load-in timers (the hold-then-pop design Andrew rejected on lived use leaves no fourth behaviour standing beside its replacement)',
  !app5.includes('function beginNameLoadIn') &&
  !app5.includes('function revealNameLoadIn') &&
  !app5.includes('function noteNameLoadIn') &&
  !app5.includes('function liIdle') &&
  !app5.includes('function liTimer') &&
  count(app5, 'beginNameLoadIn(') === 0 &&
  count(app5, 'noteNameLoadIn') === 0);

// ---------- (2) the pick holds nothing and arms the guard ----------
const loadStart = app5.indexOf('function loadRoute(id)');
const loadBody = loadStart > -1 ? app5.slice(loadStart, app5.indexOf('\n}\n', loadStart)) : '';
check('2: loadRoute\'s boot path goes straight to the flight (no hold engages on a pick) and a switch arms no guard - it frames at once on the settled view',
  loadBody.includes('else { introToRoute(); }') &&
  !loadBody.includes('nameHoldSet(') &&
  !loadBody.includes('noteNameLoadInSwitch'));
const introStart = app5.indexOf('function introToRoute()');
const introBody = introStart > -1 ? app5.slice(introStart, app5.indexOf('\n}\n', introStart)) : '';
check('2b: introToRoute arms NOTHING (Beta 1.290 re-point): its instant-fit paths and its flown path contain no guard, hold or cure call - the flight is only a flight, and the titles\' sides were decided in the geometry build before it began',
  !introBody.includes('armTitleRePlace') &&
  !introBody.includes('nameHoldSet') &&
  !introBody.includes('noteNameLoadIn') &&
  introBody.includes('map.flyTo(') &&
  introBody.includes('if (!routeBox) { return; }'));

// ---------- (3) the guard is gone (Beta 1.290 re-point) ----------
check('3: the guard is GONE: app5 has no armTitleRePlace, takes no placed-title count and makes no cure decision - and no part calls the deleted re-place (the conditional the 1.270 design rested on is retired because the defect it answered, a mid-flight side sticking, cannot occur when the side is stored data)',
  !app5.includes('armTitleRePlace') &&
  !app5.includes('queryRenderedFeatures({ layers: ids })') &&
  !app5.includes('rePlaceTitles') && !engine.includes('rePlaceTitles') &&
  engine.includes("titles: [1, 2, 3, 4].map(t => 'streetnamespt' + t),")); // the title catalogue itself is untouched - only its cure is gone

// ---------- (4) no hold can engage anywhere (Beta 1.290 re-point) ----------
const createPickTxt = read('parts/create-pick.js');
check('4: no hold can engage in any part: nameHoldSet occurs nowhere, and app5 carries no cure release and none of the cure\'s backstop timers (6 s release, 2.5 s idle, 6.5 s arm-time) - there is nothing left to fire, release or strand',
  !app5.includes('nameHoldSet') && !app2.includes('nameHoldSet') && !engine.includes('nameHoldSet') && !createPickTxt.includes('nameHoldSet') &&
  !app5.includes('titleCureRelease') &&
  !app5.includes('setTimeout(release, 6000)') && !app5.includes('setTimeout(cure, 2500)') && !app5.includes('setTimeout(check, 6500)'));

// ---------- (5) a pick or a delete has nothing to release (Beta 1.290 re-point) ----------
check('5: loadRoute and unloadRouteToBoot retire only the pick generation beside their other work - no guard to disarm, no cure to release, so no hold can be left standing over a new scene (the 1.270 check\'s hazard, retired with its mechanism)',
  count(app5, 'loadInGen++;') === 2 &&
  !app5.includes('releaseTitleCure') && !app5.includes('titleGuardArmed'));

// ---------- (5b) the PR #166 hazard is retired with its mechanism (Beta 1.290 re-point) ----------
// The cure's release closure opened with an identity check that retired
// stale invocations; releaseTitleCure therefore had to invoke before
// clearing, or the hold never released. With the hold and the cure both
// deleted, the failure shape itself is gone - this check pins that the
// machinery the hazard lived in occurs nowhere in app5.
check('5b: releaseTitleCure and titleCureRelease occur nowhere in app5 - a release that could refuse itself cannot exist when there is no hold to release',
  !app5.includes('releaseTitleCure') && !app5.includes('titleCureRelease'));

// ---------- (6) the hold machinery is deleted whole (Beta 1.290 re-point) ----------
check('6: app2\'s hold machinery is DELETED whole: no nameHoldSet, no nameHoldApply, no nameHoldHideOnly, no nameFade state - the titles-only scope question is moot when nothing holds any name in any path',
  !app2.includes('nameHoldSet') && !app2.includes('nameHoldApply') &&
  !app2.includes('nameHoldHideOnly') && !app2.includes('nameFade'));
const unifyStart = app2.indexOf('function glUnifyLabels(m)');
const unifyBody = unifyStart > -1 ? app2.slice(unifyStart, app2.indexOf('\n}\n', unifyStart)) : '';
check('6b: the basemap label pass re-applies no hold at its tail (the seat the hold rode on every restack): glUnifyLabels\' body names no hold machinery - its writes are the standing unification alone (the drive216 P3 ban\'s substance: app code never writes a basemap name\'s paint or visibility to hide it)',
  unifyStart > -1 && !unifyBody.includes('nameHold') && unifyBody.includes('setLayerZoomRange'));

// ---------- (7) the cure mechanism itself is deleted (Beta 1.290 re-point) ----------
check('7: the engine exports no re-place: rePlaceTitles occurs nowhere in the engine - no teardown door exists for any caller to reach',
  !engine.includes('rePlaceTitles'));

// ---------- (8) no ROUTE preloading: the one ruled exception is the destination-tile prefetch ----------
const prefetchBody = app5.slice(app5.indexOf('function prefetchIntroTiles'), app5.indexOf('function introToRoute'));
check('8: no route preloading rides the load path (Andrew, 2026-11-21: the app must never warm a route before the user picks it) - loadRoute contains no preload and no fetch, and introToRoute\'s only fetch-ward call is the single ruled exception (Andrew, 2026-11-23): prefetchIntroTiles, fired once after the wide jump lands, fetching only basemap tile URLs built from the live style\'s vector sources over the fit bounds plus a one-tile ring - no pack, no route data, nothing warmed before the pick',
  !loadBody.includes('preload') && !loadBody.includes('fetch(') &&
  !introBody.includes('preload') && !introBody.includes('fetch(') &&
  (introBody.match(/prefetchIntroTiles\(b, fit\.zoom\)/g) || []).length === 1 &&
  prefetchBody.includes('src.tiles') && prefetchBody.includes('tileNums(') &&
  !prefetchBody.includes('packs/') && !prefetchBody.includes('loadRoute') && !prefetchBody.includes('.json'));

// ---------- (9) the backdrop reads live visibility (Beta 1.290 re-point) ----------
const createPick = read('parts/create-pick.js');
check('9: the create backdrop snapshots LIVE visibility (crVisPair reads getLayoutProperty directly): with the hold deleted there is no transient none a snapshot could misrecord as the state to restore - the PR #162 hazard\'s precondition is gone, and nameHoldNaturalVis occurs in no part',
  createPick.includes("const crVisPair = (id) => [id, map.getLayoutProperty(id, 'visibility') || 'visible'];") &&
  !createPick.includes('nameHoldNaturalVis') && !app2.includes('nameHoldNaturalVis'));

// ---------- (10) editorial ----------
check('10: the CHANGELOG orders Beta 1.270 above 1.269',
  changelog.indexOf('## Beta 1.270') > -1 && changelog.indexOf('## Beta 1.270') < changelog.indexOf('## Beta 1.269'));

console.log(`proof-1270: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
