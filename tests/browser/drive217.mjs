import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, shot, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);
if (!await poll(`!!(window.map && map.getSource && map.getSource('fades'))`, 45000)) throw new Error('drive217: the GL stack never landed - the fade counts would measure an empty map and pass vacuously');

// drive217: Beta 1.264 - the create-mode feather leak (Andrew's report,
// 2026-11-21, with his screenshot: in the create-route flow the loaded
// Route 5W's feathered road-end tips showed as small dark/gold ticks at
// the map edges - Valeria and Greenpark on Weston Road, Valeria S at
// Langstaff - while the route's coloured paint was correctly gone).
// Diagnosis (create-mode-feather-leak-2026-11-21/RECORD.md, CONFIRMED):
// the create backdrop (crSetBackdrop, parts/create-pick.js) hides exactly
// the layer ids in CR_ROUTE_LAYERS; Beta 1.259 added nine route-stack
// feather layers in engine.js's addStack and none joined that list, so
// the fades rendered for the whole creation session (14 features at
// Andrew's framing). The fix adds the nine ids; the list's membership is
// pinned statically by proof-1264 (derived from addStack), and this drive
// grades the rendered behaviour: route mode renders the feathers, create
// mode renders NONE of them (board and selection fades alike), a
// mid-create theme swap (which re-creates the route stack visible, then
// the styledata hook re-hides it) keeps them hidden, and exitCreate
// restores them exactly. The backdrop's contract is visibility only -
// the 'fades' source keeps its DATA throughout (section B4 reads the
// source's serialized data: querySourceFeatures reads retained tiles,
// which the renderer drops for hidden layers and reloads on restore -
// the tile count is not the data).
// Both-ways: on the 1.263 tree B1/B2 fail with 14 rendered features and
// all five board fade layers standing visible inside create mode.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const BOARD_FADES = ['fade-casing', 'fade-surf-y', 'fade-surf-r', 'fade-band-g', 'fade-fill-g'];
const SEL_FADES = ['selfade-y', 'selfade-r', 'selfade-g', 'selfade-fill'];
const ALL_FADES = BOARD_FADES.concat(SEL_FADES);
const probe = () => J(`(() => {
  const out = { vis: {}, rendered: {}, boardRendered: 0, allRendered: 0, fadesSrc: -1, selFadesSrc: -1, poi: -1, hidden: null };
  for (const id of ${JSON.stringify(ALL_FADES)}) {
    if (!map.getLayer(id)) { out.vis[id] = null; out.rendered[id] = -1; continue; }
    out.vis[id] = map.getLayoutProperty(id, 'visibility') || 'visible';
    try { out.rendered[id] = map.queryRenderedFeatures({ layers: [id] }).length; } catch (e) { out.rendered[id] = -1; }
  }
  out.boardRendered = ${JSON.stringify(BOARD_FADES)}.reduce((a, id) => a + Math.max(0, out.rendered[id] || 0), 0);
  out.allRendered = ${JSON.stringify(ALL_FADES)}.reduce((a, id) => a + Math.max(0, out.rendered[id] || 0), 0);
  try { const d = map.getSource('fades').serialize().data; out.fadesSrc = d && d.features ? d.features.length : -1; } catch (e) {}
  try { const d = map.getSource('selFades').serialize().data; out.selFadesSrc = d && d.features ? d.features.length : -1; } catch (e) {}
  try { out.poi = map.getLayer('crPoiDot') ? map.queryRenderedFeatures({ layers: ['crPoiDot'] }).length : -1; } catch (e) {}
  out.hidden = (typeof crHiddenLayers !== 'undefined' && crHiddenLayers) ? crHiddenLayers.map(p => p[0]) : null;
  return out;
})()`);
const settle = async () => { await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000); await sleep(900); };

// ---------- A: route mode baseline (Andrew's framing) ----------
await ev(`(() => { map.jumpTo({ center: [-79.5598, 43.8147], zoom: 13.4 }); return true; })()`);
await settle();
const A = await probe();
ok('A1 route mode: the board feathers render at the 7 shipped ends (14 features: 7 casing + 7 centre) | got ' + A.boardRendered + ' (casing ' + A.rendered['fade-casing'] + ', surf-y ' + A.rendered['fade-surf-y'] + ', surf-r ' + A.rendered['fade-surf-r'] + ')',
  A.boardRendered === 14 && A.rendered['fade-casing'] === 7);
ok('A2 route mode: all nine fade layers stand visible | ' + JSON.stringify(ALL_FADES.map(id => A.vis[id])),
  ALL_FADES.every(id => A.vis[id] === 'visible'));
ok('A3 route mode: the fades source is populated | features ' + A.fadesSrc, A.fadesSrc >= 14);

// ---------- B: create mode - nothing of the loaded route's feathers ----------
await ev(`(() => { enterCreate('pick'); return true; })()`);
await poll(`!!(typeof creating !== 'undefined' && creating && crHiddenLayers)`, 15000);
await settle();
const B = await probe();
ok('B1 create mode: ZERO rendered features across all nine fade layers (the leak rendered 14) | got ' + B.allRendered + ' ' + JSON.stringify(B.rendered),
  B.allRendered === 0);
ok('B2 create mode: every fade layer is hidden by the backdrop, selection fades included | ' + JSON.stringify(ALL_FADES.map(id => B.vis[id])),
  ALL_FADES.every(id => B.vis[id] === 'none'));
ok('B3 create mode: the backdrop\'s recorded hide list names all nine fade layers | recorded ' + (B.hidden ? B.hidden.length : 'null'),
  Array.isArray(B.hidden) && ALL_FADES.every(id => B.hidden.includes(id)));
ok('B4 create mode: the fades source keeps its features (visibility only - the loaded route\'s data is untouched) | route ' + A.fadesSrc + ' -> create ' + B.fadesSrc,
  B.fadesSrc === A.fadesSrc && B.fadesSrc >= 14);
ok('B5 create mode: the by-design route POI stands (the backdrop did not over-hide) | rendered ' + B.poi, B.poi === 1);

// ---------- C: a mid-create theme swap must not resurrect the feathers ----------
// A basemap swap wipes the custom layers; GLP.init re-creates the route
// stack VISIBLE, and the create styledata hook re-applies the backdrop
// over the recorded list - the fades ride that list since this round.
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`);
await poll(`!!(window.map && map.getLayer && map.getLayer('fade-casing'))`, 30000);
await settle();
const C = await probe();
ok('C1 theme swap mid-create (to night): the re-created fade layers are re-hidden - still zero rendered | got ' + C.allRendered + ', vis ' + JSON.stringify(ALL_FADES.map(id => C.vis[id])),
  C.allRendered === 0 && ALL_FADES.every(id => C.vis[id] === 'none'));
await ev(`(() => { setThemeOverride(false); applyNight(); setBasemap(); return true; })()`);
await poll(`!!(window.map && map.getLayer && map.getLayer('fade-casing'))`, 30000);
await settle();
const C2 = await probe();
ok('C2 theme swap mid-create (back to day): still zero rendered fade features | got ' + C2.allRendered + ', vis ' + JSON.stringify(ALL_FADES.map(id => C2.vis[id])),
  C2.allRendered === 0 && ALL_FADES.every(id => C2.vis[id] === 'none'));

// ---------- D: exit restores the feathers exactly ----------
await ev(`(() => { exitCreate(); return true; })()`);
await settle();
const D = await probe();
ok('D1 after exitCreate: the board feathers render again at the route-mode count | route ' + A.boardRendered + ' -> after exit ' + D.boardRendered,
  D.boardRendered === A.boardRendered && D.boardRendered === 14);
ok('D2 after exitCreate: every fade layer\'s visibility is restored to its route-mode value | ' + JSON.stringify(ALL_FADES.map(id => D.vis[id])),
  ALL_FADES.every(id => D.vis[id] === A.vis[id]));
ok('D3 after exitCreate: the create POI layers are gone | crPoiDot rendered ' + D.poi, D.poi === -1);

finish(R, proc);
