// proof-1263.mjs - Beta 1.263 (fix_id: labelrevert-1263).
// THE NAMING REVERT (Andrew's decision, 2026-11-21): "We should revert the
// naming system to before all this" - before the changes the names "were
// perfect minus a few times where a couple of them were off, then a refresh
// fixed it." The 1.261 mix's standing heal (armTitleHeal) re-decided the
// titles' anchors after EVERY camera settle by tearing the labelpts source
// down and rebuilding it; until the worker re-parsed, every route name
// vanished - the flicker diagnosis (label-flicker-2026-11-21) measured 33
// of 33 titles dropped at every settle. Andrew knowingly trades the heal's
// on-street guarantee back for the old behaviour (an occasional off-street
// name, cured by a refresh) in exchange for a system with no teardown in
// it, so nothing can blink.
// This proof pins the restored shape, which is the Beta 1.257 tree
// (b494fb51) state of the naming system on top of 1.262:
// (1) the title system as it was - labelpts source, streetnamespt1-4 at
// the original tier minzooms (13.7/13.35/13.0/12.6), NO maxzoom cap;
// (2) the basemap exclusion of route streets restored at EVERY zoom (the
// pre-1.258 filter in glUnifyLabels, blanket 13-24 zoom range), and the
// 1.261 '-pre15' band split deleted whole - no '-pre15' anywhere in parts;
// (3) armTitleHeal/titleCamSig deleted; app5's one-flight hook
// (armTitleRePlace, Beta 1.248) restored verbatim [Beta 1.290 premise
// update: the label round deletes that hook and its cure whole -
// check 8 now pins the deletion; the titles' sides are geometry data];
// (4) labelFeatures/LABELS restored as data, exactly as 1.257 carried
// them (the 'labels' source is still not added, as in 1.257);
// (5) the 1.259 priority lane stays deleted (it never existed pre-1.258).
// ONE NAMED EXCEPTION: R1 - symbol-spacing 500 on both basemap road-label
// layers, Andrew's standalone pick from the 2026-11-20 repetition sample,
// now set inside the restored exclusion branch (check 6).
// TWO DEVIATIONS from pure b494fb51 fidelity, both deliberate: the 1.261
// gate-fix SPOT guard stays (own-entry-only read - check 11 carries its
// behavioural fixture over from proof-1261), and the label pass keeps its
// 1.258 name glUnifyLabels while its body is restored verbatim.
// The rendered behaviour is graded by drive214's reworked M sections and
// by drive216 (the flicker's standing presence-during-settle regression
// drive). Fail-first baseline: on the Beta 1.262 tree checks 2, 3, 4, 7,
// 8 and 9 fail (cap present, band split present, heal present, hook
// absent, residue absent).
// Pin the shared switch boundary so titles and clones cannot drift apart.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const app1 = read('parts/app1.js');
const app2 = read('parts/app2.js');
const app5 = read('parts/app5.js');
const createPick = read('parts/create-pick.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- (1) the title system as it was ----------
// Beta 1.290 (label round) re-point, claim strengthened: the source is
// created ONCE - the re-place that used to rebuild it mid-session is
// deleted, and rebuildRoute's setData is the only rewrite door.
check('1: the labelpts source is created once from LABELPTS by the naming owner at stack build (never removed, never re-added), ' +
  'a route switch rewrites it by setData alone through the unify pass, and the tier layers ride it at the original tier minzooms',
  (app2.split("addSource('labelpts'").length - 1) === 1 &&
  app2.includes("m.addSource('labelpts', { type: 'geojson', data })") &&
  engine.includes('stack: { newStack, data: LABELPTS, ids: LAYERS.titles, fontStack }') &&
  !engine.includes("removeSource('labelpts')") && !app2.includes("removeSource('labelpts')") &&
  (app2.split("getSource('labelpts').setData(routeData)").length - 1) === 1 &&
  engine.includes('H.glUnifyLabels({ m: GLM, routeData: LABELPTS });') &&
  app2.includes('const PT_MIN = [13.7, 13.35, 13.0, 12.6];') &&
  app2.includes('minzoom: PT_MIN[t - 1], maxzoom: ROUTE_LABEL_ZOOM') &&
  engine.includes('function nudgeFifth()') && engine.includes('function assignTiers()'));

// ---------- (2) the cap at the switch ----------
check('2: the title layers are capped at maxzoom 15.2 and the spec opacity carries no 15-16 fade stops (the 12.6 fade-in is untouched)',
  app2.includes('const ROUTE_LABEL_ZOOM = 15.2;') &&
  app2.includes('minzoom: PT_MIN[t - 1], maxzoom: ROUTE_LABEL_ZOOM, filter:') &&
  app2.includes("'text-opacity': ['interpolate', ['linear'], ['zoom'], 12.59, 0, 12.62, 1]"));

// ---------- (3) the exclusion restored at every zoom; the split deleted ----------
check("3: glUnifyLabels sets the pre-1.258 exclusion (stock kind filter AND name not in ROUTE_TILE_NAMES) on the originals under the blanket 13-24 zoom range, with the day readability paint - and no '-pre15' band exists anywhere in parts (Beta 1.265 premise update: the exclusion literal is now built once as exclF and applied under the create-mode condition - outside create mode the computed filter is this same shape; proof-1265 pins the condition)",
  app2.includes("const exclF = ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]];") &&
  app2.includes("(baseF ? ['all', baseF, exclF] : exclF)") &&
  app2.includes('const minZoom = isClone ? ROUTE_LABEL_ZOOM : 13;') &&
  app2.includes('m.setLayerZoomRange(L.id, minZoom, 24)') &&
  app2.includes("setP(L.id, 'text-color', '#333333')") &&
  !app2.includes('-pre15') && !engine.includes('-pre15') && !app5.includes('-pre15') &&
  !createPick.includes('-pre15') && !app1.includes('-pre15') &&
  app2.includes('const ROUTE_TILE_NAMES = [];'));

// ---------- (4) the lane stays deleted ----------
check("4: the 1.259 priority lane stays deleted - no lane layer id, no 'route-labels' source, in any part",
  !app2.includes('roads_labels_minor-priority') && !engine.includes('roads_labels_minor-priority') &&
  !app2.includes("'route-labels'") && !engine.includes("'route-labels'"));

// ---------- (5) the '-route' clones: removed every pass, rebuilt only for the handover ----------
check("5: the '-route' clone layers are removed at the top of the label pass and rebuilt only in the handover state, route names only (Beta 1.294 premise update: the 1.208 retirement is superseded by the handover)",
  app2.includes("const cloneId = baseId + '-route';") && app2.includes('if (m.getLayer(cloneId))') &&
  app2.includes("const handover = titlesOn && !(typeof creating !== 'undefined' && creating);") &&
  app2.includes("const routeF = ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]], baseIds = ['roads_labels_major', 'roads_labels_minor'];"));

// ---------- (6) THE NAMED EXCEPTION: R1 ----------
check("6: R1 symbol-spacing is owned in glUnifyLabels at the top of the road branch, value 250 (Beta 1.294 premise update: Andrew re-picked the repetition on 2026-11-24; the write now covers the originals and the handover clones)",
  app2.includes("setL(L.id, 'symbol-spacing', 250);") &&
  app2.includes('LABEL RULE: titles name the route below 15.2') &&
  app2.indexOf("setL(L.id, 'symbol-spacing', 250);") > app2.indexOf('LABEL RULE: titles name the route below 15.2'));

// ---------- (7) the heal is retired ----------
check('7: the standing heal is gone - no armTitleHeal, no titleCamSig, no init call in the engine',
  !engine.includes('armTitleHeal') && !engine.includes('titleCamSig'));

// ---------- (8) the one-flight hook is deleted (Beta 1.290 re-point) ----------
check("8: the one-flight hook and its cure are DELETED whole (label round, Beta 1.290): no armTitleRePlace, no titleGuardArmed, no rePlaceTitles in app5 or the engine - a title's side is geometry data decided before the flight begins, so no mid-flight placement can need curing (proof-1270 pins the deletion's full shape)",
  !app5.includes('armTitleRePlace') && !app5.includes('titleGuardArmed') &&
  !app5.includes('rePlaceTitles') && !engine.includes('rePlaceTitles'));

// ---------- (9) labelFeatures / LABELS restored as data ----------
check('9: labelFeatures/LABELS are restored as in 1.257 (declared, reset per build, pushed per street, collected in LABELS) - data only, the labels source is not re-added',
  engine.includes('const labelFeatures = [];') && engine.includes('labelFeatures.length = 0;') &&
  engine.includes('labelFeatures.push({ type: \'Feature\', properties: { name: n }, geometry: { type: \'LineString\', coordinates: GJ(segs[li]) } });') &&
  engine.includes("const LABELS = { type: 'FeatureCollection', features: labelFeatures };") &&
  !engine.includes("addSource('labels'"));

// ---------- (10) LEFTBIT stayed - it is read ----------
check('10: LEFTBIT is present AND read by the label-anchor computation (load-bearing, not residue)',
  engine.includes('const LEFTBIT = {};') && engine.includes('const leftOff = LEFTBIT[n] === 0 ? off0 : off1'));

// ---------- (11) the create backdrop hides the titles ----------
// Beta 1.282 (#13) re-point, claim unchanged: the hide list no longer spells
// the titles itself - CR_ROUTE_LAYERS IS the engine catalogue's stack, and
// the catalogue's title group (in its stack) is the four tiers.
check('11: the backdrop hide list carries the four title layers',
  app2.includes('const CR_ROUTE_LAYERS = GLP.layers.stack;') &&
  engine.includes("titles: [1, 2, 3, 4].map(t => 'streetnamespt' + t),") &&
  engine.includes('LAYERS.stack = [...LAYERS.paint, ...LAYERS.poi, ...LAYERS.titles, ...LAYERS.glow];'));

// ---------- (12) the SPOT read stays own-entry-only (deviation 1, carried from proof-1261) ----------
// The engine fixture pattern of proof-leftside-removal-b05, narrowed to
// the hazard: a street named 'constructor', SPOT empty (sparse - no own
// entry). On a plain-read build GLP.init throws inside the label build;
// on this build it completes and the street gets its label point.
// Reverting this guard would reintroduce the proven route-load crash of
// PR #154 - it changes no naming behaviour for real streets.
// Beta 1.293: the fixture carries the switch ON, as an assembled boot always carries the flag.
const fixMLAT = 111132, fixMLNG = 82000;
const fixPt = (xM, yM) => [43.8 + yM / fixMLAT, -79.5 + xM / fixMLNG];
const fixSeg = (x0, y0, x1, y1) => { const pts = []; const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 20)); for (let k = 0; k <= n; k++) pts.push(fixPt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)); return pts; };
const fixSTRETCH = {
  'constructor': { runs: [{ parts: [fixSeg(-120, 0, 0, 0), fixSeg(0, 0, 60, 0), fixSeg(60, 0, 120, 0)] }] },
  LongAve: { runs: [{ parts: [fixSeg(-120, 60, 0, 60), fixSeg(0, 60, 60, 60), fixSeg(60, 60, 120, 60)] }] },
};
const fixNames = Object.keys(fixSTRETCH);
let fixOk = false, fixNamesOut = [];
try {
  const host = {
    PRIMARIES: new Set(), MLAT: fixMLAT, MLNG: fixMLNG,
    jDistM: (a, b) => Math.hypot((b[1] - a[1]) * fixMLNG, (b[0] - a[0]) * fixMLAT),
    ptSegM(p, a, b) { const px = p[1] * fixMLNG, py = p[0] * fixMLAT; const ax = a[1] * fixMLNG, ay = a[0] * fixMLAT; const bx = b[1] * fixMLNG, by = b[0] * fixMLAT; const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1; const tt = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)); return Math.hypot(px - (ax + tt * vx), py - (ay + tt * vy)); },
    names: fixNames, STRETCH: fixSTRETCH,
    ROADS: Object.fromEntries(fixNames.map(n => [n, fixSTRETCH[n].runs.flatMap(r => r.parts)])),
    SPOT: {}, pieces: { 'constructor': [1, 1, 1], LongAve: [1, 1, 1] },
    selStretch: null, selSet: [], isNight: () => false,
    activeRoute: { name: 'Proof' },
    // Phase 6: the stub honours the hook contract, creating the title source from the stack context.
    glUnifyLabels: ({ m, stack }) => { if (stack && stack.newStack) m.addSource('labelpts', { type: 'geojson', data: stack.data }); },
  };
  const sources = {}, layers = [];
  const mockGLM = {
    getStyle: () => ({ layers }), getSource: id => sources[id],
    addSource: (id, spec) => { sources[id] = { data: spec.data, setData(d) { this.data = d; } }; },
    getLayer: id => layers.find(l => l.id === id), addLayer: l => { layers.push(l); },
    setLayerZoomRange: () => {}, setLayoutProperty: () => {}, setPaintProperty: () => {},
    on: () => {}, once: () => {},
  };
  const ctx = { GL_HOST: host, window: {}, setInterval: () => 1, clearInterval: () => {}, ROUTE_TITLES_ON: true };
  vm.runInNewContext(engine, ctx);
  ctx.window.GLP.init(mockGLM, host);
  fixNamesOut = sources.labelpts && sources.labelpts.data ? sources.labelpts.data.features.map(f => f.properties.name) : [];
  fixOk = fixNamesOut.includes('constructor') && fixNamesOut.includes('LongAve');
} catch (e) { fixOk = false; }
check('12: a street named like an inherited object key (constructor) with no SPOT entry still loads and gets its label point - the SPOT read is own-entry-only (the 1.261 gate fix, kept by the revert as a named deviation)',
  engine.includes('Object.prototype.hasOwnProperty.call(H.SPOT, n)') && fixOk);

// ---------- (13) the release editorial ----------
check("13: the CHANGELOG orders Beta 1.266 above 1.265",
  changelog.indexOf('## Beta 1.266') > -1 && changelog.indexOf('## Beta 1.266') < changelog.indexOf('## Beta 1.265'));

console.log(`proof-1263: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
