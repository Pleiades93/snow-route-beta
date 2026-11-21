// proof-1259.mjs - Beta 1.259 (fix_id: feather-1259).
// Three of Andrew's decisions of 2026-11-20 in one round.
// (1) ROAD-END FEATHERS (option C from the road-ends sample; flush sampled
// twice and rejected): where route paint ends at a boundary while the street
// continues, the paint ends AT the join with a gradient fade over the last
// 15 m. The boundary-end concept is data: a pack field `ends`, computed by
// ONE function (computeBoundaryEnds, create-packs.js), cleaned leniently by
// normalizePack, carried through PACK_FIELDS, attached to STRETCH by
// buildGeometry, and applied by the engine's boundarySplit - fade features
// in the lineMetrics fades/selFades sources, one literal-gradient layer per
// colour. Dead ends and route junctions carry no record by construction.
// (2) ROUTE NAMES AT THE HOME ZOOM: the priority lane in glUnifyLabels - a
// symbol layer copied live from roads_labels_minor, fed by one point anchor
// per route street carrying the tiles' full spelling, alive 12.5-15.
// (3) REPETITION R1: symbol-spacing 500 owned in glUnifyLabels on both
// basemap road-label layers (it was set nowhere before; the engine default
// 250 decided silently).
// The rendered behaviour of all three is graded by drive214; this proof
// pins the code shape.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const app1 = read('parts/app1.js');
const app2 = read('parts/app2.js');
const createPacks = read('parts/create-packs.js');
const createSave = read('parts/create-save.js');
const data = read('parts/data.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- (1) the feather: one computation, a cleaned field, the split ----------
check('1: computeBoundaryEnds is defined once, in create-packs.js, and called nowhere in app1/engine',
  createPacks.includes('function computeBoundaryEnds(roads, allStreets)') && !app1.includes('computeBoundaryEnds(') && !engine.includes('computeBoundaryEnds('));
check('2: the create save computes the field from its extract',
  createSave.includes('computeBoundaryEnds(roads, all)'));
check('3: normalizePack cleans the ends field (and keeps it in the cleaned literal)',
  createPacks.includes('const ends = {};') && createPacks.includes('roads: rc.roads, reference, ends'));
check('4: PACK_FIELDS carries ends, and buildGeometry attaches it to STRETCH',
  app1.includes("'reference', 'ends']") && app1.includes('STRETCH[n].ends = endsIn[n]'));
check('5: the shipped 5W pack carries exactly the census fixture (7 records, Topper absent)',
  data.includes('"Valeria":[[43.815217,-79.553531,43.815187,-79.553677],[43.806726,-79.557991,43.806726,-79.557991]]') &&
  data.includes('"Velmar":[[43.822621,-79.557839,43.822621,-79.557839],[43.820752,-79.566989,43.820752,-79.566989]]') &&
  !data.includes('"Topper":['));
check('6: the engine splits at the join (boundarySplit, FADE_M 15, the shared-vertex defence)',
  engine.includes('function boundarySplit(n, ab, pts, kind, col, withCasing)') && engine.includes('const FADE_M = 15;') && engine.includes('e.n !== n'));
check('7: the fade sources are lineMetrics (line-gradient precondition) and the nine layers exist',
  engine.includes("addSource('fades', { type: 'geojson', lineMetrics: true") && engine.includes("addSource('selFades', { type: 'geojson', lineMetrics: true") &&
  ['fade-casing', 'fade-surf-y', 'fade-surf-r', 'fade-band-g', 'fade-fill-g', 'selfade-y', 'selfade-r', 'selfade-g', 'selfade-fill'].every(id => engine.includes("'" + id + "'")));
check('8: gradients are literal per colour via fadeGrad, casing follows the theme',
  engine.includes('function fadeGrad(hex)') && engine.includes("setPaintProperty('fade-casing', 'line-gradient', fadeGrad(casing))"));

// ---------- (2) the priority lane ----------
// Beta 1.261 ROLL (labelmix-1261): the lane this section pinned is DELETED
// whole by Andrew's label-mix decision of 2026-11-20 (the 34-of-34-at-home
// requirement it served was reversed the same evening; the mix restores
// the app titles below 15 instead). Checks 9-11 flip to absence pins with
// the reason here; the mix's own shape is pinned by proof-1261. The
// feather checks (1-8) and the R1 check (12) stand untouched - both ship
// on in 1.261 exactly as this round built them.
check('9: RETIRED by 1.261 - the lane layer is gone from glUnifyLabels (was: managed there, copied from the live minor layer)',
  !app2.includes("const laneId = 'roads_labels_minor-priority';") && !app2.includes("lane.source = 'route-labels';"));
check('10: RETIRED by 1.261 - the lane angle machinery is gone (was: point-anchored, bearing-turned, overlap-guaranteed, handing over at 15)',
  !app2.includes('__applyRouteLabelBearing') && !app2.includes('lane.maxzoom = 15;'));
check('11: RETIRED by 1.261 - the ordinal spelling lookup is gone with the lane (the spellings are pack data, tileNames in data.js, as since 1.117)',
  !app2.includes("Fifth: '5th'"));

// ---------- (3) R1 repetition ----------
check('12: symbol-spacing 500 is set in the normalization path on the road-label originals',
  app2.includes("setL(L.id, 'symbol-spacing', 500);"));

// ---------- the release editorial ----------
check('13: the CHANGELOG top entry is Beta 1.259',
  changelog.indexOf('## Beta 1.259') > -1 && changelog.indexOf('## Beta 1.259') < changelog.indexOf('## Beta 1.258'));
check('14: What\'s New carries the CURRENT entry\'s bullet (rolled to 1.261: this check tracks the current entry each round, like the other release-editorial checks; the bullets it shipped with live in the CHANGELOG), within the 108-char cap, em-dash free',
  whatsnew.includes("Street names now show everywhere while you create a route.") &&
  "Street names now show everywhere while you create a route.".length <= 108 &&
  !whatsnew.includes('—'));

console.log(`proof-1259: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
