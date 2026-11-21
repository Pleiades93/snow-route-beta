// proof-1266 - Beta 1.266 (unified name load-in, Andrew's approved design
// 2026-11-21): on a route pick, every name - the basemap's text layers and
// the route's own street titles - is held invisible for the whole load-in
// window, the one anchor re-place runs inside the hold, and at the settled
// idle all names fade in together over one 350 ms ramp, with two backstop
// reveals so names never wait forever. The diagnosis this answers:
// cold-start-flicker-2026-11-21 (the hook's labelpts teardown at idle
// blinked all 33 titles for the worker re-parse, exactly as the basemap
// names finished fading in). These are the static pins; the behaviour is
// proven by drive219 (the boot-phase presence lane).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const app2 = read('parts/app2.js');
const app5 = read('parts/app5.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? pass++ : fail++; };
const count = (hay, needle) => hay.split(needle).length - 1;

// ---------- (1) the hold lives in app2, beside the label pass it rides ----------
check('1: app2 owns the name hold: the 350 ms fade constant and the hold/apply/layer functions are declared there',
  app2.includes('const NAME_FADE_MS = 350;') &&
  app2.includes('function nameHoldSet(on)') &&
  app2.includes('function nameHoldApply(m)') &&
  app2.includes('function nameLayerIds(m)'));

// ---------- (1b) the multiplier transforms the paint - it never wraps it ----------
check("1b: the multiplier is applied by TRANSFORMING the paint (scaleNameStops rebuilds a zoom interpolate/step with scaled outputs) and never by wrapping it in a ['*', natural, mult] value - this MapLibre's paint validator silently refuses the wrap (measured in the round's harness: the wrap reads back unchanged, the titles sat visible under a bookkeeping 0), and a set that does not take is recorded in nameFade.unheld with a flat fallback",
  app2.includes('function scaleNameStops(expr, mult)') &&
  !app2.includes("['*', o, nameFade.mult]") &&
  app2.includes('nameFade.unheld[id] = true;'));

// ---------- (2) the held set is names only: titles + basemap text, never the POI ----------
const idsStart = app2.indexOf('function nameLayerIds(m)');
const idsBody = idsStart > -1 ? app2.slice(idsStart, app2.indexOf('\n}\n', idsStart)) : '';
check('2: the held set is the four title tiers plus the basemap text discriminator - and the route POI text is never in it (the POI sits through the dwell, Beta 1.203)',
  ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'].every((id) => idsBody.includes(`'${id}'`)) &&
  idsBody.includes("L['source-layer']") && !idsBody.includes('routepoi'));

// ---------- (3) the label pass re-lands the hold on every restack ----------
const unifyStart = app2.indexOf('function glUnifyLabels(m)');
const unifyBody = unifyStart > -1 ? app2.slice(unifyStart, app2.indexOf('function addReferenceLayers()', unifyStart)) : '';
check('3: glUnifyLabels re-applies the hold at the end of its pass - the one seat every stack build (and so every theme swap) runs after the title layers exist',
  unifyBody.includes('nameHoldApply(m);'));

// ---------- (4) the load-in state machine lives in app5 ----------
check('4: app5 owns the cycle: the generation counter and the begin/note/reveal functions are declared there',
  app5.includes('let loadInGen = 0;') &&
  app5.includes('function beginNameLoadIn()') &&
  app5.includes('function noteNameLoadInReplaced()') &&
  app5.includes('function noteNameLoadInNoFlight()') &&
  app5.includes('function noteNameLoadInSwitch()') &&
  app5.includes('function revealNameLoadIn()'));

// ---------- (5) the backstops are the designed values ----------
check('5: the backstop reveals are the designed values: an absolute 15 s from the pick (armed at begin and re-armed on a switch) and 6 s after the re-place',
  count(app5, 'liTimer(revealNameLoadIn, 15000);') === 2 &&
  count(app5, 'liTimer(revealNameLoadIn, 6000);') === 1);

// ---------- (6) the hook survives, integrated - not deleted, not duplicated ----------
check('6: the one re-place hook survives intact (its idle gate, its 2.5 s backstop, its single arming from the flight) and now notes the load-in from inside its run, with the 6.5 s arm-time backstop behind moveend',
  app5.includes("map.once('idle', run)") && app5.includes('setTimeout(run, 2500);') &&
  count(app5, 'essential: false }); armTitleRePlace();') === 1 &&
  app5.includes('window.GLP.rePlaceTitles()') &&
  app5.includes('noteNameLoadInReplaced(); };') &&
  app5.includes('setTimeout(run, 6500);'));

// ---------- (7) the pick wiring: hold before the flight, generation per pick ----------
check('7: loadRoute bumps the generation and disarms a stale hook on every effective pick, engages the hold BEFORE the intro flight, and notes a switch; the intro dwell timeout stands down for a superseded pick',
  count(app5, 'loadInGen++; titleRePlaceArmed = false;') === 2 && // loadRoute + unloadRouteToBoot
  app5.includes('else { beginNameLoadIn(); introToRoute(); }') &&
  app5.includes('noteNameLoadInSwitch();') &&
  app5.includes('if (!map || liGen !== loadInGen) return;'));

// ---------- (8) the instant-fit paths settle the load-in (no re-place owed) ----------
check('8: every instant-fit path in introToRoute notes the no-flight settle - no load-in can wait on a re-place that is not coming',
  count(app5, 'noteNameLoadInNoFlight();') === 4); // the empty-pack return + the three fit0 fallbacks

// ---------- (9) the release editorial ----------
const BULLET = 'Street names now fade in together when a route loads, instead of blinking.';
check("9: What's New carries the 1.266 bullet (plain words: names fade in together on load), within the 108-char cap, em-dash free, and the CHANGELOG top entry is Beta 1.266 above 1.265",
  whatsnew.includes(BULLET) && BULLET.length <= 108 && !whatsnew.includes('—') &&
  changelog.indexOf('## Beta 1.266') > -1 && changelog.indexOf('## Beta 1.266') < changelog.indexOf('## Beta 1.265'));

console.log(`proof-1266: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
