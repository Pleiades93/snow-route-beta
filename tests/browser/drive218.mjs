import { launchDrive, finish, bootThrough, forceRouteTitlesOn } from './harness.mjs';
const { proc, send, S, ev, shot, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);
await forceRouteTitlesOn(ev, poll); // Beta 1.293: this drive grades the exclusion in title mode - force the source switch on
if (!await poll(`!!(window.map && map.getLayer && map.getLayer('roads_labels_major'))`, 45000)) throw new Error('drive218: the basemap label layers never landed - the naming reads would measure an empty map and pass vacuously');

// drive218: Beta 1.265 - create-mode naming reverts to MAP DEFAULTS
// (Andrew's rule, 2026-11-21: while creating a route, street naming
// reverts to map defaults everywhere - the basemap names every street
// including an existing route's streets; on exit the normal system
// restores exactly). Through 1.264 the create backdrop hid the loaded
// route's own titles with the route stack (streetnamespt1-4 in
// CR_ROUTE_LAYERS) while glUnifyLabels' basemap exclusion of route
// streets still applied, so the loaded route's area showed NO street
// names at all - a nameless hole exactly where he is picking.
// The fix: the create-mode state (`creating`) becomes the single
// condition inside glUnifyLabels (parts/app2.js) - while creating, the
// road-label layers' target filter is the basemap's own stock filter
// with NO route-name exclusion clause; outside create mode the computed
// filter is byte-for-byte the pre-1.265 one. crSetBackdrop re-runs the
// label pass on both flips so the lift lands on entry and the restore
// on exit; restacks (mid-create theme swaps) recompute from the same
// state. No label layer is forked.
// Frame below the switch so route titles remain visible while
// grading create-mode exclusions (basemap rendering, titles placed):
// route mode = exclusion on, zero basemap route names, titles naming;
// create mode = exclusion off, basemap names PRESENT on route streets,
// title layers hidden (exactly one naming system - no doubles);
// theme swaps mid-create keep the lift in both directions; exit
// restores the exclusion and the titles exactly; a second enter/exit
// cycle repeats cleanly (no latched state).
// Both-ways: on the 1.264 tree B1/B2/C1/C2/E1 fail - the exclusion
// never lifts, so the basemap prints zero route names in create mode.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const TITLE_LAYERS = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'];
const snap = () => J(`(() => {
  const out = { excl: {}, titleVis: {}, titleFeats: 0, routeHits: [], baseNames: 0, nonRouteNames: 0 };
  const tileNames = (typeof ROUTE_TILE_NAMES !== 'undefined' && Array.isArray(ROUTE_TILE_NAMES)) ? ROUTE_TILE_NAMES : [];
  for (const id of ['roads_labels_major', 'roads_labels_minor']) {
    if (!map.getLayer(id)) { out.excl[id] = null; continue; }
    const fs = JSON.stringify(map.getFilter(id) || '');
    out.excl[id] = tileNames.some(n => fs.includes(JSON.stringify(n)));
  }
  for (const id of ${JSON.stringify(TITLE_LAYERS)}) {
    if (!map.getLayer(id)) { out.titleVis[id] = null; continue; }
    out.titleVis[id] = map.getLayoutProperty(id, 'visibility') || 'visible';
  }
  const tLayers = ${JSON.stringify(TITLE_LAYERS)}.filter(id => map.getLayer(id));
  try { for (const f of map.queryRenderedFeatures({ layers: tLayers })) out.titleFeats++; } catch (e) {}
  const bLayers = ['roads_labels_major', 'roads_labels_minor'].filter(id => map.getLayer(id));
  const seen = new Set();
  try { for (const f of map.queryRenderedFeatures({ layers: bLayers })) { const nm = f.properties && f.properties.name; if (nm) seen.add(nm); } } catch (e) {}
  out.baseNames = seen.size;
  out.routeHits = tileNames.filter(n => seen.has(n));
  out.nonRouteNames = [...seen].filter(n => !tileNames.includes(n)).length;
  return out;
})()`);
const settle = async () => { await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000); await sleep(700); };
const routeHitsPoll = () => poll(`(() => { try { const tileNames = ROUTE_TILE_NAMES; const seen = new Set(); for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] })) { if (f.properties && f.properties.name) seen.add(f.properties.name); } return tileNames.some(n => seen.has(n)); } catch (e) { return false; } })()`, 30000);

// ---------- framing: home, then 14.8 (below the 15.2 switch) ----------
await ev(`(() => { goHomeView(); return true; })()`);
await settle();
await ev(`(() => { map.jumpTo({ zoom: 14.8 }); return true; })()`);
await poll(`(() => { try { const seen = new Set(); for (const f of map.queryRenderedFeatures({ layers: ['roads_labels_major', 'roads_labels_minor'] })) { if (f.properties && f.properties.name) seen.add(f.properties.name); } return seen.size >= 5; } catch (e) { return false; } })()`, 30000); // basemap provably rendering before any exclusion read counts
await poll(`(() => { try { let n = 0; for (const f of map.queryRenderedFeatures({ layers: ${JSON.stringify(TITLE_LAYERS)} })) n++; return n >= 5; } catch (e) { return false; } })()`, 30000); // titles provably placed
await settle();

// ---------- A: route mode - the 1.263 system, unchanged ----------
const A = await snap();
ok('A1 route mode: the exclusion sits in BOTH road-label filters | ' + JSON.stringify(A.excl),
  A.excl['roads_labels_major'] === true && A.excl['roads_labels_minor'] === true);
ok('A2 route mode: the basemap prints ZERO route street names (the titles own them) | hits ' + JSON.stringify(A.routeHits) + ', basemap names in frame ' + A.baseNames + ' (liveness proven by the pre-section polls: >=5 basemap names and >=5 titles seen in this frame)',
  Array.isArray(A.routeHits) && A.routeHits.length === 0 && A.baseNames >= 3);
ok('A3 route mode: the title layers stand visible and placed | vis ' + JSON.stringify(A.titleVis) + ', title features ' + A.titleFeats,
  TITLE_LAYERS.every(id => A.titleVis[id] === 'visible') && A.titleFeats >= 5);

// ---------- B: create mode - the basemap names every street ----------
await ev(`(() => { enterCreate('pick'); return true; })()`);
await poll(`!!(typeof creating !== 'undefined' && creating && crHiddenLayers)`, 15000);
const bLive = await routeHitsPoll(); // the lift must actually print a route name, not merely drop a filter clause
await settle();
const B = await snap();
ok('B1 create mode: the exclusion is LIFTED from both road-label filters | ' + JSON.stringify(B.excl),
  B.excl['roads_labels_major'] === false && B.excl['roads_labels_minor'] === false);
ok('B2 create mode: basemap labels render ON route streets (through 1.264 there were none - the nameless hole) | live poll ' + bLive + ', route names printed: ' + JSON.stringify(B.routeHits),
  bLive === true && Array.isArray(B.routeHits) && B.routeHits.length >= 1);
ok('B3 create mode: the route title layers stay hidden - exactly ONE naming system on route streets, no doubles | vis ' + JSON.stringify(B.titleVis) + ', title features ' + B.titleFeats,
  TITLE_LAYERS.every(id => B.titleVis[id] === 'none') && B.titleFeats === 0);
ok('B4 create mode: the basemap still names the non-route streets around them | non-route names in frame ' + B.nonRouteNames,
  B.nonRouteNames >= 3);

// ---------- C: mid-create theme swaps keep the lift, both directions ----------
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`);
await poll(`!!(window.map && map.getLayer && map.getLayer('roads_labels_major'))`, 30000);
const cLive = await routeHitsPoll();
await settle();
const C = await snap();
ok('C1 theme swap mid-create (to night): the restack recomputes from the create state - exclusion still lifted, basemap route names still print, titles still hidden | excl ' + JSON.stringify(C.excl) + ', hits ' + JSON.stringify(C.routeHits) + ', title features ' + C.titleFeats,
  C.excl['roads_labels_major'] === false && C.excl['roads_labels_minor'] === false && cLive === true && C.routeHits.length >= 1 && C.titleFeats === 0);
await ev(`(() => { setThemeOverride(false); applyNight(); setBasemap(); return true; })()`);
await poll(`!!(window.map && map.getLayer && map.getLayer('roads_labels_major'))`, 30000);
const c2Live = await routeHitsPoll();
await settle();
const C2 = await snap();
ok('C2 theme swap mid-create (back to day): still lifted, still printing | excl ' + JSON.stringify(C2.excl) + ', hits ' + JSON.stringify(C2.routeHits),
  C2.excl['roads_labels_major'] === false && C2.excl['roads_labels_minor'] === false && c2Live === true && C2.routeHits.length >= 1);

// ---------- D: exit after the swaps restores the normal system exactly ----------
await ev(`(() => { exitCreate(); return true; })()`);
await poll(`(() => { try { let n = 0; for (const f of map.queryRenderedFeatures({ layers: ${JSON.stringify(TITLE_LAYERS)} })) n++; return n >= 5; } catch (e) { return false; } })()`, 30000);
await settle();
const D = await snap();
ok('D1 after exitCreate: the exclusion is restored in BOTH filters | ' + JSON.stringify(D.excl),
  D.excl['roads_labels_major'] === true && D.excl['roads_labels_minor'] === true);
ok('D2 after exitCreate: the basemap prints zero route street names again | hits ' + JSON.stringify(D.routeHits),
  Array.isArray(D.routeHits) && D.routeHits.length === 0);
ok('D3 after exitCreate: the title layers are restored to their route-mode visibility and place again | vis ' + JSON.stringify(D.titleVis) + ', title features ' + D.titleFeats,
  TITLE_LAYERS.every(id => D.titleVis[id] === A.titleVis[id]) && D.titleFeats >= 5);

// ---------- E: a second enter/exit cycle - no latched state ----------
await ev(`(() => { enterCreate('pick'); return true; })()`);
await poll(`!!(typeof creating !== 'undefined' && creating && crHiddenLayers)`, 15000);
const eLive = await routeHitsPoll();
await settle();
const E = await snap();
ok('E1 second entry: the lift applies again | excl ' + JSON.stringify(E.excl) + ', hits ' + JSON.stringify(E.routeHits),
  E.excl['roads_labels_major'] === false && E.excl['roads_labels_minor'] === false && eLive === true && E.routeHits.length >= 1);
await ev(`(() => { exitCreate(); return true; })()`);
await settle();
const E2 = await snap();
ok('E2 second exit: the exclusion restores again, no residue | excl ' + JSON.stringify(E2.excl) + ', hits ' + JSON.stringify(E2.routeHits),
  E2.excl['roads_labels_major'] === true && E2.excl['roads_labels_minor'] === true && Array.isArray(E2.routeHits) && E2.routeHits.length === 0);

finish(R, proc);
