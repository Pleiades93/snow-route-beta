// proof-1265.mjs - Beta 1.265 (fix_id: createmodenaming-1265).
// CREATE-MODE NAMING REVERTS TO MAP DEFAULTS (Andrew's rule, 2026-11-21:
// while creating a route, street naming reverts to map defaults
// everywhere - the basemap names every street, including an existing
// route's streets; on exit the normal system restores exactly).
// Through 1.264 the create backdrop hid the loaded route's own title
// layers with the route stack (streetnamespt1-4 in CR_ROUTE_LAYERS)
// while glUnifyLabels' basemap exclusion of route streets kept
// applying, so the loaded route's area showed NO street names at all -
// a nameless hole exactly where he is picking.
// The fix makes the create-mode state the SINGLE condition inside
// glUnifyLabels (parts/app2.js): while `creating`, the road-label
// layers' target filter is the basemap's own stock filter (baseF) with
// the exclusion clause not added; outside create mode the target is
// byte-for-byte the pre-1.265 filter. crSetBackdrop (create-pick.js)
// re-runs the label pass on both backdrop flips so the lift lands on
// entry and the restore on exit; engine restacks (mid-create theme
// swaps) recompute from the same state. No label layer is forked.
// This proof pins that shape statically; the rendered behaviour is
// graded by drive218. Fail-first baseline: on the Beta 1.264 tree
// checks 1, 2, 3 and 4 fail (no condition, no backdrop re-run).
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app2 = read('parts/app2.js');
const createPick = read('parts/create-pick.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- (1) the single condition in glUnifyLabels ----------
check("1: glUnifyLabels computes the road-label target from the create-mode state - while creating the target is the basemap's own stock filter (baseF), otherwise the pre-1.265 exclusion shape",
  app2.includes("const targetF = (typeof creating !== 'undefined' && creating) ? baseF : (baseF ? ['all', baseF, exclF] : exclF);"));

// ---------- (2) the exclusion is built in exactly one place, applied by one call ----------
const exclBuilds = (app2.match(/\['!', \['in', \['get', 'name'\], \['literal', ROUTE_TILE_NAMES\]\]\]/g) || []).length;
const setFilterCalls = (app2.match(/m\.setFilter\(L\.id, targetF\)/g) || []).length;
check('2: the exclusion clause is built exactly once (the exclF literal) and reaches the layers through the single guarded setFilter - no second construction site a future edit could diverge from | builds ' + exclBuilds + ', setFilter calls ' + setFilterCalls,
  exclBuilds === 1 && setFilterCalls === 1 && app2.includes("const exclF = ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]];"));

// ---------- (3) no forked label layers ----------
check('3: no part forks the road-label layers for create mode (no addLayer of a roads_labels clone anywhere in parts) - the same two layers carry both states',
  !/addLayer\(\{[^}]*id: 'roads_labels/.test(app2) && !/addLayer\(\{[^}]*id: 'roads_labels/.test(createPick) &&
  !app2.includes("roads_labels_major-create") && !app2.includes("roads_labels_minor-create"));

// ---------- (4) the backdrop re-runs the label pass on the flip ----------
const bdStart = createPick.indexOf('function crSetBackdrop(on) {');
const bdEnd = bdStart > -1 ? createPick.indexOf('\n}\n', bdStart) : -1;
const bdBody = bdStart > -1 && bdEnd > bdStart ? createPick.slice(bdStart, bdEnd) : '';
check('4: crSetBackdrop re-runs glUnifyLabels(map) as part of the backdrop flip (both directions ride the same function - the on/off branches above it set the layer visibility and the POI)',
  bdBody.includes("if (typeof glUnifyLabels === 'function') glUnifyLabels(map);"));

// ---------- (5) the enter/exit ordering the re-run depends on ----------
const enStart = createPick.indexOf('function enterCreate(stage) {');
const enEnd = enStart > -1 ? createPick.indexOf('\n}\n', enStart) : -1;
const enBody = enStart > -1 && enEnd > enStart ? createPick.slice(enStart, enEnd) : '';
const exStart = createPick.indexOf('function exitCreate() {');
const exEnd = exStart > -1 ? createPick.indexOf('\n}\n', exStart) : -1;
const exBody = exStart > -1 && exEnd > exStart ? createPick.slice(exStart, exEnd) : '';
check('5: enterCreate sets `creating` BEFORE crSetBackdrop(true) and exitCreate clears it BEFORE crSetBackdrop(false) - the re-run computes the right side in both directions',
  enBody.indexOf('creating = true;') > -1 && enBody.indexOf('creating = true;') < enBody.indexOf('crSetBackdrop(true)') &&
  exBody.indexOf('creating = false;') > -1 && exBody.indexOf('creating = false;') < exBody.indexOf('crSetBackdrop(false)'));

// ---------- (6) the release editorial ----------
const BULLET = 'Under the hood: start, cancel, finish and route switches now run through one owner, in one set order.';
check("6: What's New carries the 1.265 bullet (plain words: names fade in together on load, instead of blinking), within the 108-char cap, em-dash free, and the CHANGELOG top entry is Beta 1.266 above 1.265",
  whatsnew.includes(BULLET) && BULLET.length <= 108 && !whatsnew.includes('—') &&
  changelog.indexOf('## Beta 1.266') > -1 && changelog.indexOf('## Beta 1.266') < changelog.indexOf('## Beta 1.265'));

console.log(`proof-1265: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
