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
// (armTitleRePlace, Beta 1.248) restored verbatim;
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
check('1: the labelpts source is built and rebuilt from LABELPTS, and the tier layers ride it at the original tier minzooms',
  engine.includes("GLM.addSource('labelpts', { type: 'geojson', data: LABELPTS });") &&
  engine.includes('const PT_MIN = [13.7, 13.35, 13.0, 12.6];') &&
  engine.includes("const id = 'streetnamespt' + t;") &&
  engine.includes('function nudgeFifth()') && engine.includes('function assignTiers()'));

// ---------- (2) NO cap - the titles name route streets at every zoom ----------
check('2: the title layers carry NO maxzoom - the addLayer spec is the pre-1.258 form (minzoom from PT_MIN, then the filter)',
  engine.includes('minzoom: PT_MIN[t - 1], filter:') && !engine.includes('maxzoom: 15'));

// ---------- (3) the exclusion restored at every zoom; the split deleted ----------
check("3: glUnifyLabels sets the pre-1.258 exclusion (stock kind filter AND name not in ROUTE_TILE_NAMES) on the originals under the blanket 13-24 zoom range, with the day readability paint - and no '-pre15' band exists anywhere in parts (Beta 1.265 premise update: the exclusion literal is now built once as exclF and applied under the create-mode condition - outside create mode the computed filter is this same shape; proof-1265 pins the condition)",
  app2.includes("const exclF = ['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]];") &&
  app2.includes("(baseF ? ['all', baseF, exclF] : exclF)") &&
  app2.includes('m.setLayerZoomRange(L.id, 13, 24)') &&
  app2.includes("setP(L.id, 'text-color', '#333333')") &&
  !app2.includes('-pre15') && !engine.includes('-pre15') && !app5.includes('-pre15') &&
  !createPick.includes('-pre15') && !app1.includes('-pre15') &&
  app2.includes('const ROUTE_TILE_NAMES = [];'));

// ---------- (4) the lane stays deleted ----------
check("4: the 1.259 priority lane stays deleted - no lane layer id, no 'route-labels' source, in any part",
  !app2.includes('roads_labels_minor-priority') && !engine.includes('roads_labels_minor-priority') &&
  !app2.includes("'route-labels'") && !engine.includes("'route-labels'"));

// ---------- (5) the '-route' clone removal rides again (the 1.208 retirement guard) ----------
check("5: the retired '-route' clone layers are removed, never rebuilt (the Beta 1.208 guard at the top of the label pass)",
  app2.includes("const cloneId = baseId + '-route';") && app2.includes('if (m.getLayer(cloneId))'));

// ---------- (6) THE NAMED EXCEPTION: R1 ----------
check("6: R1 symbol-spacing 500 is owned in glUnifyLabels, inside the restored exclusion branch (the revert's one named exception)",
  app2.includes("setL(L.id, 'symbol-spacing', 500);") &&
  app2.indexOf("setL(L.id, 'symbol-spacing', 500);") > app2.indexOf('LABEL RULE (Andrew, Beta 1.40; revised Beta 1.208)'));

// ---------- (7) the heal is retired ----------
check('7: the standing heal is gone - no armTitleHeal, no titleCamSig, no init call in the engine',
  !engine.includes('armTitleHeal') && !engine.includes('titleCamSig'));

// ---------- (8) the one-flight hook restored ----------
check("8: app5's one-flight hook (armTitleRePlace, restored as in b494fb51) is armed by the pick flight and rePlaceTitles is exported for it - Beta 1.270 re-pins the trigger: the hook is now the conditional title guard (moveend -> placed-title count -> the cure at idle with its 2.5 s backstop only when a title placed mid-flight), per Andrew's synchronised-streaming decision; the unconditional shape this check pinned through 1.269 is retired with the 1.266 cycle (proof-1270 pins the guard)",
  app5.includes('let titleGuardArmed = false;') && app5.includes('function armTitleRePlace()') &&
  app5.includes('essential: false }); armTitleRePlace();') &&
  app5.includes('setTimeout(cure, 2500);') &&
  engine.includes('mute, rePlaceTitles }') && engine.includes("Beta 1.248: rePlaceTitles exported for app5's post-flight hook"));

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
check('11: the create-pick hide list carries the four title layers',
  createPick.includes("[1, 2, 3, 4].map(t => 'streetnamespt' + t)"));

// ---------- (12) the SPOT read stays own-entry-only (deviation 1, carried from proof-1261) ----------
// The engine fixture pattern of proof-leftside-removal-b05, narrowed to
// the hazard: a street named 'constructor', SPOT empty (sparse - no own
// entry). On a plain-read build GLP.init throws inside the label build;
// on this build it completes and the street gets its fallback anchor.
// Reverting this guard would reintroduce the proven route-load crash of
// PR #154 - it changes no naming behaviour for real streets.
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
    activeRoute: { name: 'Proof' }, glUnifyLabels: () => {},
  };
  const sources = {}, layers = [];
  const mockGLM = {
    getStyle: () => ({ layers }), getSource: id => sources[id],
    addSource: (id, spec) => { sources[id] = { data: spec.data, setData(d) { this.data = d; } }; },
    getLayer: id => layers.find(l => l.id === id), addLayer: l => { layers.push(l); },
    setLayerZoomRange: () => {}, setLayoutProperty: () => {}, setPaintProperty: () => {},
    on: () => {}, once: () => {},
  };
  const ctx = { GL_HOST: host, window: {}, setInterval: () => 1, clearInterval: () => {} };
  vm.runInNewContext(engine, ctx);
  ctx.window.GLP.init(mockGLM, host);
  fixNamesOut = sources.labelpts && sources.labelpts.data ? sources.labelpts.data.features.map(f => f.properties.name) : [];
  fixOk = fixNamesOut.includes('constructor') && fixNamesOut.includes('LongAve');
} catch (e) { fixOk = false; }
check('12: a street named like an inherited object key (constructor) with no SPOT entry still loads and anchors - the SPOT read is own-entry-only (the 1.261 gate fix, kept by the revert as a named deviation)',
  engine.includes('Object.prototype.hasOwnProperty.call(H.SPOT, n)') && fixOk);

// ---------- (13) the release editorial ----------
const BULLET = "Street names now load in with the map, in sync, instead of popping in after a wait.";
check("13: What's New carries the 1.266 bullet (rolled by the unified-load-in round), em-dash free, and the CHANGELOG top entry is Beta 1.266 above 1.265",
  whatsnew.includes(BULLET) && BULLET.length <= 108 && !whatsnew.includes('—') &&
  changelog.indexOf('## Beta 1.266') > -1 && changelog.indexOf('## Beta 1.266') < changelog.indexOf('## Beta 1.265'));

console.log(`proof-1263: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
