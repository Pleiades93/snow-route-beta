// proof-1304.mjs - the state-models contract: the invariant map is
// complete and the source seats hold the shapes the models state.
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const doc = read('docs/STATE-MODELS.md');
const app1 = read('parts/app1.js');
const app2 = read('parts/app2.js');
const app3 = read('parts/app3.js');
const head = read('parts/head.html');
const flags = read('flags.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond === true) { pass++; } else { fail++; console.log('FAIL: ' + name); } };
const count = (s, sub) => s.split(sub).length - 1;

// ---------- the map is complete ----------
const IDS = [...Array(8)].map((_, i) => 'C' + (i + 1))
  .concat([...Array(7)].map((_, i) => 'F' + (i + 1)))
  .concat([...Array(9)].map((_, i) => 'L' + (i + 1)));
const rows = {};
for (const line of doc.split('\n')) {
  const m = line.match(/^\| ((?:C|F|L)\d) \| ([a-z]+) \|/);
  if (m) { (rows[m[1]] = rows[m[1]] || []).push({ status: m[2], line }); }
}
for (const id of IDS) {
  check('map: ' + id + ' has exactly one row', !!rows[id] && rows[id].length === 1);
  if (!rows[id] || rows[id].length !== 1) continue;
  const row = rows[id][0];
  check('map: ' + id + ' status is existing, new or gap',
    ['existing', 'new', 'gap'].includes(row.status));
  const tokens = row.line.match(/drive\d+|proof-\d+|GAP-\d+/g) || [];
  check('map: ' + id + ' names at least one check or gap', tokens.length >= 1);
  for (const t of tokens) {
    if (t.startsWith('drive')) {
      check('map: ' + id + ' -> ' + t + ' exists',
        existsSync(new URL('tests/browser/' + t + '.mjs', root)));
    } else if (t.startsWith('proof-')) {
      check('map: ' + id + ' -> ' + t + ' exists',
        existsSync(new URL('tests/proof/' + t + '.mjs', root)));
    } else {
      check('map: ' + id + ' -> ' + t + ' is written up in the gaps section',
        doc.includes('**' + t + ' ('));
    }
  }
}
check('map: the gaps section carries GAP-1 and GAP-2',
  doc.includes('**GAP-1 (') && doc.includes('**GAP-2 ('));

// ---------- finish seats (parts/app3.js) ----------
const finYesAt = app3.indexOf("$('finYes').addEventListener");
const finYes = finYesAt >= 0 ? app3.slice(finYesAt, finYesAt + 500) : '';
check('finish: the finYes handler exists', finYes.length > 0);
check('finish: finishRun() is called before the gap advisory in the handler',
  finYes.indexOf('const finished = finishRun();') >= 0 &&
  finYes.indexOf('const finished = finishRun();') < finYes.indexOf("showBanner('GPS gap in this clean'"));
check('finish: the advisory is guarded by the returned snapshot stamp',
  finYes.includes('if (finished && finished.gpsGap)'));
check('finish: buildSnap stamps only the live clean flag',
  app3.includes('if (gpsGapRuns.get(LS.start) === runStart) snap.gpsGap = true;'));
check('finish: the archiving rule is the modelled one',
  app3.includes('doneSet.size >= 3 || (doneSet.size > 0 && STREETNAMES.every(n => doneSet.has(n)))'));
check('finish: the transaction arms the finclean obligation first',
  app3.includes("fSteps.push({ name: 'finclean',"));

// ---------- watchdog seats ----------
check('watchdog: GPS_STALE_MS is 45000', app1.includes('const GPS_STALE_MS = 45000;'));
const dogAt = app3.indexOf('staleWatchTimer = setInterval');
const dog = dogAt >= 0 ? app3.slice(dogAt, dogAt + 700) : '';
check('watchdog: the stale interval exists', dog.length > 0);
check('watchdog: silence is measured from the later of last fix and watch start',
  dog.includes('Math.max(lastFixAt, watchStartedAt)') && dog.includes('Date.now() - silentSince > GPS_STALE_MS'));
check('watchdog: the gap flag is set for the live clean only',
  dog.includes('if (wasRunGps && runStart && Date.now() - runStart > GPS_STALE_MS) gpsGapRuns.set(LS.start, runStart);'));
check('watchdog: the poll is 15 s', dog.includes('}, 15000);'));

// ---------- banner seats ----------
check('banner: exactly one #banner element', count(head, 'id="banner"') === 1);
check('banner: exactly one showBanner definition', count(app1, 'function showBanner(') === 1);
check('banner: the drop and exit timing is the modelled one',
  head.includes('bannerDrop .55s') && head.includes('bannerExit .4s ease-in 3.55s'));
const bannerRuleAt = head.indexOf('#banner { position: fixed;');
check('banner: the carrier never takes pointer events',
  bannerRuleAt >= 0 && head.slice(bannerRuleAt, bannerRuleAt + 500).includes('pointer-events: none'));
check('banner: reduced motion holds the plain stay',
  head.includes('#banner.show { animation: none;'));
const sbAt = app1.indexOf('function showBanner(');
const sb = sbAt >= 0 ? app1.slice(sbAt, sbAt + 900) : '';
check('banner: showBanner replaces and restarts on a re-fire',
  sb.includes("b.classList.remove('show');") && sb.includes("b.classList.add('show');"));
check('banner: the reduced-motion stay is a 3000 ms timer',
  sb.includes("matchMedia('(prefers-reduced-motion: reduce)')") && sb.includes('}, 3000);'));

// ---------- label seats (parts/app2.js, flags.js) ----------
check('labels: the shipped switch is on', flags.includes('var ROUTE_TITLES_ON = true;'));
check('labels: one handover constant, read by both carriers',
  count(app2, 'const ROUTE_LABEL_ZOOM = 15.2;') === 1 &&
  app2.includes('maxzoom: ROUTE_LABEL_ZOOM') && app2.includes('clone.minzoom = ROUTE_LABEL_ZOOM;'));
check('labels: tier minimums are the modelled ones',
  app2.includes('const PT_MIN = [13.7, 13.35, 13.0, 12.6];'));
check('labels: the low-zoom ramp is the modelled one, with no top fade',
  app2.includes("'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.59, 0, 12.62, 1]") &&
  app2.includes("'text-opacity-transition': { duration: 0, delay: 0 }"));
check('labels: clone zoom range and inclusion filter',
  app2.includes('clone.minzoom = ROUTE_LABEL_ZOOM; clone.maxzoom = 24;') &&
  app2.includes("const routeF = ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]"));
check('labels: the original exclusion is the modelled one',
  app2.includes("const exclF = ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]]"));
check('labels: floor 13 for originals, spacing 250',
  app2.includes('const minZoom = isClone ? ROUTE_LABEL_ZOOM : 13;') &&
  app2.includes("setL(L.id, 'symbol-spacing', 250);"));
check('labels: the handover predicate excludes create mode',
  app2.includes("const handover = titlesOn && !(typeof creating !== 'undefined' && creating);"));
const backdropAt = app2.indexOf('function setRouteBackdrop');
check('labels: the creation backdrop re-runs the unify pass',
  backdropAt >= 0 && app2.slice(backdropAt, backdropAt + 1600).includes('glUnifyLabels({ m });'));

console.log(`proof-1304: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
