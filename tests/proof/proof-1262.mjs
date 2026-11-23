// proof-1262.mjs - Beta 1.262 (fix_id: intersection-1262).
// THE INTERSECTION POI (Andrew's decisions, 2026-11-20). Through 1.261 a
// result tap in the create flow's intersection search flew the map to
// max(current zoom, 15) and left the search bar holding the typed
// fragment: the picked crossing was named nowhere and marked nowhere.
// 1.262: (1) the tap writes the FULL chosen intersection name into the
// bar (crIsectSet, the surface's one writer); (2) the flight lands at
// zoom 17 - the max() form stands, so a pick from closer never zooms
// out; (3) the marker is a NATIVE map layer of the GPS stack's family -
// a GeoJSON source ('crIsect') with two circle layers, engine-drawn,
// never a DOM overlay: solid #2C4AD2 core, radius 7, NO white ring, and
// a halo of the same blue on the confirmed sample's motion (1800 ms
// cycle, easeOutQuad, radius 7 -> 21, alpha 0.38 -> 0); under reduced
// motion the pulse does not run and the halo rests invisible, and every
// stop resets the halo to its rest frame explicitly (crIsectHaloRest);
// (4) bar and marker are ONE surface with ONE teardown (crIsectClear),
// called at the first road selection (crAddStreet + crAddRun), at the
// clear disc, when the search text is emptied, and at the flow close -
// the disc's and exitCreate's field-emptying runs through it. The
// styledata hook re-seats the layers after a basemap swap.
// The rendered behaviour is graded by drive215; this proof pins the
// code shape. Fail-first baseline: on the Beta 1.261 tree every check
// below fails (no surface, the 15 floor, the fragment left in the bar).
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const pick = read('parts/create-pick.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const span = (from, to) => { const a = pick.indexOf(from); const b = pick.indexOf(to, a + 1); return a > -1 && b > a ? pick.slice(a, b) : ''; };
const block = span('// ---- Beta 1.262 (Andrew, 2026-11-20): the intersection POI', "$('crClear').addEventListener('click'");

// ---------- the surface ----------
check('1: the surface state stands: one GeoJSON source id, one POI record, one frame handle',
  pick.includes("const CR_ISECT_SRC = 'crIsect';") && pick.includes('let crIsectPoi = null;') && pick.includes('let crIsectRaf = 0;'));
check('2: the marker is two native circle layers on that source - halo under dot, the decided paints (core-sized blue halo at rest opacity 0 with zero-duration transitions, gate fix PR #158; solid blue core, radius 7)',
  block.includes("map.addLayer({ id: 'crIsectHalo', type: 'circle', source: CR_ISECT_SRC, paint: { 'circle-radius': 7, 'circle-color': '#2C4AD2', 'circle-opacity': 0, 'circle-radius-transition': { duration: 0, delay: 0 }, 'circle-opacity-transition': { duration: 0, delay: 0 } } }, before)") &&
  block.includes("map.addLayer({ id: 'crIsectDot', type: 'circle', source: CR_ISECT_SRC, paint: { 'circle-radius': 7, 'circle-color': '#2C4AD2' } }, before)") &&
  block.indexOf('crIsectHalo') < block.indexOf('crIsectDot'));
check('3: NO ring and NO DOM mechanism: the surface block carries no circle stroke paint, creates no element, and uses no Marker class',
  !block.includes('circle-stroke') && !block.includes('createElement') && !block.includes('Marker(') && !block.includes('setDOMContent'));
check('4: the pair stacks below the first label layer (the sample\'s seat - street names draw over the marker) - through the shared finder since Beta 1.267 (crFirstLabelLayerId, whose own body carries the symbol/text-field test)',
  block.includes('const before = crFirstLabelLayerId();') && pick.includes("l.type === 'symbol' && l.layout && l.layout['text-field']"));

// ---------- the pick ----------
const pickSeat = span("b.addEventListener('click', () => {", '});\n  return b;');
check('5: the pick lands the surface with the row\'s CURRENT full name, before the flight',
  pickSeat.includes('crIsectSet(lat, lon, cur.display_name);') && pickSeat.indexOf('crIsectSet(lat, lon, cur.display_name);') < pickSeat.indexOf('map.flyTo'));
check('6: the flight\'s floor is the decided 17, in the standing max() form; the 15 floor is gone from the pick',
  pickSeat.includes('zoom: Math.max(map.getZoom(), 17)') && !pick.includes('zoom: Math.max(map.getZoom(), 15)'));
check('7: crIsectSet is the ONE writer - defined once, called only at the pick - and it writes the full name into the bar with the disc synced',
  (pick.match(/crIsectSet\(/g) || []).length === 2 && block.includes("$('crSearchInput').value = name; crSyncClear();"));

// ---------- the pulse ----------
check('8: the pulse constants are the sample\'s: 1800 ms cycle, easeOutQuad, halo radius 7 + 14*ease (to 3x), alpha 0.38*(1-t)',
  block.includes('const t = (performance.now() % 1800) / 1800;') && block.includes('const ease = 1 - (1 - t) * (1 - t);') &&
  block.includes("map.setPaintProperty('crIsectHalo', 'circle-radius', 7 + 14 * ease);") && block.includes("map.setPaintProperty('crIsectHalo', 'circle-opacity', 0.38 * (1 - t));"));
check('9: the motion contract\'s rest: reduced motion starts no pulse, and the halo\'s rest frame is set explicitly at pulse start and at teardown',
  block.includes("matchMedia('(prefers-reduced-motion: reduce)').matches) return;") &&
  block.includes('function crIsectHaloRest()') && span('function crIsectPulseStart()', 'function crIsectPulseStop()').includes('crIsectHaloRest();') &&
  span('function crIsectClear()', "$('crClear').addEventListener").includes('crIsectHaloRest();'));

// ---------- the lifecycle ----------
check('10: the teardown is called at every closing seat: first road selection (both add doors), the clear disc, the emptied bar, the flow close',
  span('addStreet(name, segs) {', 'addRun(name, segs) {').includes('crIsectClear();') && // Architecture #14: the add bodies live on the DRAFT owner; the crAddStreet / crAddRun doorways delegate to these methods
  span('addRun(name, segs) {', 'removeStreet(name) {').includes('crIsectClear();') &&
  span("$('crClear').addEventListener('click'", "$('crSearchInput').addEventListener('input'").includes('crIsectClear();') &&
  span("$('crSearchInput').addEventListener('input'", 'function crSearch()').includes("if (!$('crSearchInput').value) crIsectClear();") &&
  span('function exitCreate()', 'function openDoors()').includes('crIsectClear();'));
check('11: the teardown itself kills the whole pair: state nulled, pulse stopped, source emptied, bar emptied and disc synced',
  span('function crIsectClear()', "$('crClear').addEventListener").includes('crIsectPoi = null; crIsectPulseStop(); crIsectHaloRest();') &&
  span('function crIsectClear()', "$('crClear').addEventListener").includes("map.getSource(CR_ISECT_SRC).setData({ type: 'FeatureCollection', features: [] })") &&
  span('function crIsectClear()', "$('crClear').addEventListener").includes("$('crSearchInput').value = ''; crSyncClear();"));
check('12: a basemap swap mid-create re-seats the surface (the styledata hook re-ensures it beside the draft and the backdrop, behind the gate fix\'s stand-down guard)',
  pick.includes("map.on('styledata'") && pick.includes("renderDraft(); crSetBackdrop(true); crIsectEnsure(); } }));"));

check('14: the frame loop cannot storm the creation sources (gate fixes, PR #158): the styledata restoration stands down while the custom layers stand (a missing sentinel is the swap signal), the ensure pushes the point only on change, and the stand-down still re-applies the backdrop when a recorded route layer stands visible again (the order-sensitive piece: GLP.init re-creates the route stack after this listener\'s turn on a swap)',
  pick.includes("if (map.getLayer('crDraftCase') && (!crIsectPoi || map.getLayer('crIsectDot'))) {") &&
  pick.includes("crHiddenLayers.some(pr => { try { return map.getLayer(pr[0]) && (map.getLayoutProperty(pr[0], 'visibility') || 'visible') !== 'none'; } catch (e) { return false; } }) || CR_ROUTE_LAYERS.some(id => { try { return map.getLayer(id) && !crHiddenLayers.some(pr => pr[0] === id) && (map.getLayoutProperty(id, 'visibility') || 'visible') !== 'none'; } catch (e) { return false; } }))) crSetBackdrop(true);") && // Beta 1.266: the re-apply condition grew the unrecorded-layer clause (the backdrop top-up) - the recorded-layer clause this check pins stands unchanged inside it
  block.includes('if (want !== crIsectPushed)') && block.includes("let crIsectPushed = null;"));

// ---------- the release editorial ----------
check('13: What\'s New carries the 1.266 bullet (rolled by the unified-load-in round), within the 108-char cap, em-dash free, and the CHANGELOG top entry is Beta 1.266 above 1.265',
  whatsnew.includes('Under the hood: backup and restore now each run through one owner, so exports and restores stay in step.') &&
  'Under the hood: backup and restore now each run through one owner, so exports and restores stay in step.'.length <= 108 &&
  !whatsnew.includes('—') &&
  changelog.indexOf('## Beta 1.266') > -1 && changelog.indexOf('## Beta 1.266') < changelog.indexOf('## Beta 1.265'));

console.log(`proof-1262: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
