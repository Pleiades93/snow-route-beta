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
check('2b: introToRoute\'s instant-fit paths note nothing and owe no check (one jump decides the anchors at the settled camera), and the flown path arms the guard at the flyTo',
  introBody.includes('armTitleRePlace();') &&
  !introBody.includes('noteNameLoadIn') &&
  introBody.includes('if (!routeBox) { return; }'));

// ---------- (3) the guard: count at moveend, skip on zero ----------
const guardStart = app5.indexOf('function armTitleRePlace()');
const guardBody = guardStart > -1 ? app5.slice(guardStart, app5.indexOf('\n}\n', guardStart)) : '';
check('3: the guard counts placed titles at moveend through the rendered-features query over the four title tiers, and the zero case finishes WITHOUT the re-place - the conditional the whole design rests on',
  guardBody.includes("map.once('moveend', check)") &&
  guardBody.includes('map.queryRenderedFeatures({ layers: ids })') &&
  guardBody.includes('window.GLP.layers.titles.filter') && engine.includes("titles: [1, 2, 3, 4].map(t => 'streetnamespt' + t),") && // Beta 1.282 (#13) re-point, claim unchanged: the guard reads the four tiers from the engine catalogue (GLP.layers.titles IS streetnamespt1-4 by its defining expression)
  guardBody.includes('if (!placed) { finish(); return; }') &&
  count(guardBody, 'rePlaceTitles') === 2); // the existence test and the one call - there is no second road to the re-place

// ---------- (4) the cure: idle-gated, titles-only hold, one-shot release with backstops ----------
check('4: a fired guard cures at idle inside a TITLES-ONLY hold (nameHoldSet(true, true) - the only hold engage left in app5), releases one-shot at the rebuilt source\'s idle, and is bounded by the 6 s release backstop and the 2.5 s idle backstop, with the 6.5 s arm-time backstop keeping the check single when moveend is swallowed',
  guardBody.includes("map.once('idle', cure)") &&
  guardBody.includes('nameHoldSet(true, true)') &&
  count(app5, 'nameHoldSet(true') === 1 &&
  guardBody.includes('titleCureRelease = release;') &&
  guardBody.includes('setTimeout(release, 6000)') &&
  guardBody.includes('setTimeout(cure, 2500)') &&
  guardBody.includes('setTimeout(check, 6500)'));

// ---------- (5) a pick or a delete releases a standing cure ----------
check('5: loadRoute and unloadRouteToBoot both retire the guard and release a standing cure beside the generation bump - a cure hold can never be left standing over a new scene',
  count(app5, 'loadInGen++; titleGuardArmed = false; releaseTitleCure();') === 2 &&
  app5.includes('function releaseTitleCure()'));

// ---------- (5b) the release is invoked while still registered (PR #166, Codex P1) ----------
// The cure's release closure opens with an identity check (titleCureRelease
// !== release -> stand down) - that check is what retires STALE invocations
// (the idle listener and the 6 s backstop racing a release already done).
// releaseTitleCure must therefore invoke the callback BEFORE clearing the
// registration - clear-first makes the callback's own check fail, the hold
// never releases, and the titles stay invisible indefinitely, the incoming
// route's included. The closure clears the registration itself as its
// first act, so invoke-first loses no safety.
check('5b: releaseTitleCure invokes the standing release while it is still registered (the closure clears the registration itself) - the clear-first order is absent',
  app5.includes('function releaseTitleCure() { const f = titleCureRelease; if (f) f(); }') &&
  !app5.includes('titleCureRelease = null; if (f) f();'));

// ---------- (6) the hold machinery is scoped: titles-only never touches the basemap ----------
check('6: app2\'s hold carries the scope: nameHoldSet takes the titlesOnly flag, nameFade records the scope, and nameHoldApply skips the basemap loop entirely under a titles scope - not its paint, not its visibility',
  app2.includes('function nameHoldSet(on, titlesOnly)') &&
  app2.includes("scope: 'all'") &&
  app2.includes("nameFade.scope !== 'titles'") &&
  app2.includes("nameFade.scope = titlesOnly ? 'titles' : 'all'"));
const hideStart = app2.indexOf('function nameHoldHideOnly(m, id)');
const hideBody = hideStart > -1 ? app2.slice(hideStart, app2.indexOf('\n}\n', hideStart)) : '';
check('6b: the basemap ban stands verbatim - nameHoldHideOnly still contains no paint write at all (a single text-opacity write on a basemap symbol layer resets its tiles\' placement state: Bell Harbour, drive216\'s P3)',
  hideStart > -1 && hideBody.includes('setLayoutProperty') && !hideBody.includes('setPaintProperty'));

// ---------- (7) the cure mechanism itself is untouched ----------
check('7: the engine still exports the one re-place the cure calls (the mechanism is 1.248\'s; only its trigger changed)',
  engine.includes('function rePlaceTitles()') &&
  engine.includes('rePlaceTitles }'));

// ---------- (8) no preloading: the guard region fetches and warms nothing ----------
const guardRegion = app5.slice(app5.indexOf('// ===== TITLE PLACEMENT GUARD'), guardStart + guardBody.length);
check('8: no preloading of any kind rides the new design (Andrew, 2026-11-21: the app must never warm a route before the user picks it) - the guard region and the intro contain no preload and no fetch: the guard only counts, cures and releases',
  !guardRegion.includes('preload') && !guardRegion.includes('fetch(') &&
  !introBody.includes('preload') && !introBody.includes('fetch('));

// ---------- (9) the backdrop coordination survives ----------
const createPick = read('parts/create-pick.js');
check('9: the create backdrop still snapshots the UNDERLYING visibility through nameHoldNaturalVis (a cure hold\'s transient none must never be recorded as the state to restore - the PR #162 finding, carried over the retired cycle)',
  app2.includes('function nameHoldNaturalVis(id)') &&
  createPick.includes('nameHoldNaturalVis(id)'));

// ---------- (10) editorial ----------
check('10: the CHANGELOG orders Beta 1.270 above 1.269',
  changelog.indexOf('## Beta 1.270') > -1 && changelog.indexOf('## Beta 1.270') < changelog.indexOf('## Beta 1.269'));

console.log(`proof-1270: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
