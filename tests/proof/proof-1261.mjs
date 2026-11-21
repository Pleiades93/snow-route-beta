// proof-1261.mjs - Beta 1.261 (fix_id: labelmix-1261).
// THE LABEL MIX (Andrew's decision, 2026-11-20, from the label-mix sample:
// "Build the mix as shown", plus his same-evening addendum "Just make sure
// names are on their street").
// (1) The pre-1.258 app title system is restored verbatim from the b494fb51
// tree - labelpts source, streetnamespt1-4 with the original tier minzooms
// (13.7/13.35/13.0/12.6), nudgeFifth, assignTiers, rePlaceTitles, the
// ROUTE_TILE_NAMES refill, the create-pick hide list - with ONE change:
// the title layers are capped at maxzoom 15.
// (2) The 1.259 priority lane is deleted whole (layer, 'route-labels'
// source, its angle machinery). The 34-of-34-at-home requirement it served
// is dead by Andrew's reversal the same evening.
// (3) The basemap split at the end of glUnifyLabels: roads_labels_major
// becomes the 15-and-up band (stock filter) plus a '-pre15' copy cloned
// from the live normalized layer carrying the pre-1.258 route-name
// exclusion filter across 11-15; roads_labels_minor stays stock from 15.
// R1 symbol-spacing 500 stays on both basemap road-label layers.
// (4) THE HEAL (the addendum's delta beyond the sample): 1.248's heal
// covered only the pick flight (a one-shot app5 hook), and the restored
// build re-stuck titles on later camera moves - measured in this round's
// harness on the unhealed mix (occlusion-free blob geometry, night):
// rotate +45 dealt Frankie (centroid 11.6 px off its street) and Boddy
// (11.2); rotate back left Boddy at 19.9 and Topper at 10.8; pan, pan-back
// and a route re-pick all left them off; only a theme swap cured them.
// The engine now owns a standing heal (armTitleHeal): after ANY camera
// move that settles at a new camera signature, at next idle with the
// scene complete, the labelpts source is rebuilt and the anchors are
// re-decided against the settled scene. The app5 hook retires into it.
// Healed measurements (same harness): 0 names off their streets at
// settle, mid zoom, back-home, zoom excursion, rotate-back, pan,
// pan-back, re-pick and theme swap, day and night; Santa Barbara (the
// name Andrew flagged) centred on its street in every capture. The one
// named residual: while the map is HELD at bearing 45, Frankie and Boddy
// take side anchors in the settled placement itself (a fresh re-decision
// chooses the same anchors; restricting the layers to centre anchors
// only was tested and drops both names entirely - and Frankie even at
// the home framing - so it was not adopted).
// (5) Trim: the restore revived labelFeatures/LABELS, rebuilt per load
// and read by nothing (proven by tree-wide grep) - removed. LEFTBIT was
// named in the same sample note but is LOAD-BEARING (the label-anchor
// computation reads LEFTBIT[n]) and stays, pinned below.
// The rendered behaviour is graded by drive214's M sections; this proof
// pins the code shape.
// Fail-first baselines: on the Beta 1.260 tree checks 1, 2, 4, 6, 7, 9,
// 10 and 11 fail (no titles, no band split, no heal, LEFTBIT absent);
// on a tree whose title cap is 16 the seam check (3) fails; on a tree
// with the band split removed (exclusion lifted below 15) check 4 fails
// and drive214 M2 catches the doubles in the rendered page.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const app2 = read('parts/app2.js');
const app5 = read('parts/app5.js');
const createPick = read('parts/create-pick.js');
const pmstyles = read('parts/pmstyles.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- (1) the restored title system, verbatim shape ----------
check('1: the labelpts source is built and rebuilt from LABELPTS, and the tier layers ride it at the original tier minzooms',
  engine.includes("GLM.addSource('labelpts', { type: 'geojson', data: LABELPTS });") &&
  engine.includes('const PT_MIN = [13.7, 13.35, 13.0, 12.6];') &&
  engine.includes("const id = 'streetnamespt' + t;") &&
  engine.includes('function nudgeFifth()') && engine.includes('function assignTiers()'));

// ---------- (2) the cap ----------
check('2: the title layers are capped at maxzoom 15 (the ONE change to the restored specs)',
  engine.includes('minzoom: PT_MIN[t - 1], maxzoom: 15, filter:'));

// ---------- (3) THE SEAM PIN: three numbers, two files, one value ----------
// The z15 handover is held by the title cap (engine.js), the band split
// literals (app2.js) and the stock minor minzoom (pmstyles.js, both
// styles). If any one drifts, the handover opens a gap (no names) or an
// overlap (doubles). This check extracts all of them and pins them equal.
const capM = engine.match(/minzoom: PT_MIN\[t - 1\], maxzoom: (\d+), filter:/);
const bandBaseM = app2.match(/m\.setLayerZoomRange\(baseId, (\d+), sMax\)/);
const bandPreM = app2.match(/m\.setLayerZoomRange\(preId, sMin, (\d+)\)/);
const minorZooms = [];
for (const styleName of ['PM_DAY', 'PM_NIGHT']) {
  const sm = pmstyles.match(new RegExp(styleName + ' = (\\{.*?\\});', 's'));
  const style = JSON.parse(sm[1]);
  const minor = style.layers.find(l => l.id === 'roads_labels_minor');
  minorZooms.push(minor && typeof minor.minzoom === 'number' ? minor.minzoom : null);
}
check('3: THE SEAM PIN - title cap, both band-split literals and the stock minor minzoom (both styles) are the same number, 15',
  !!capM && !!bandBaseM && !!bandPreM &&
  Number(capM[1]) === 15 && Number(bandBaseM[1]) === 15 && Number(bandPreM[1]) === 15 &&
  minorZooms[0] === 15 && minorZooms[1] === 15);

// ---------- (4) the band split ----------
check("4: the '-pre15' band split exists - original narrowed to start at 15, copy cloned from the live layer with the route-name exclusion filter, minor (stock from 15) skipped",
  app2.includes("const preId = baseId + '-pre15';") &&
  app2.includes('dup.maxzoom = 15; dup.filter = exclF;') &&
  app2.includes("['!', ['in', ['get', 'name'], ['literal', ROUTE_TILE_NAMES]]]") &&
  app2.includes('if (sMin >= 15) continue;') &&
  app2.includes('const ROUTE_TILE_NAMES = [];'));

// ---------- (5) the lane is gone ----------
check("5: the 1.259 priority lane is deleted whole - no lane layer id, no 'route-labels' source, in any part",
  !app2.includes('roads_labels_minor-priority') && !engine.includes('roads_labels_minor-priority') &&
  !app2.includes("'route-labels'") && !engine.includes("'route-labels'"));

// ---------- (6) R1 spacing kept on the stock layers ----------
check("6: R1 symbol-spacing 500 is still owned in glUnifyLabels",
  app2.includes("setL(L.id, 'symbol-spacing', 500);"));

// ---------- (7) the engine-owned heal ----------
check('7: the standing heal is installed from init and rePlaceTitles is exported again',
  engine.includes('function armTitleHeal(gl)') && engine.includes('function titleCamSig(gl)') &&
  engine.includes('armTitleHeal(GLM);') && engine.includes('mute, rePlaceTitles }'));

// ---------- (8) the one-flight hook retired ----------
check('8: the app5 one-shot hook (armTitleRePlace / titleRePlaceArmed) is gone - the engine rule replaces it',
  !app5.includes('function armTitleRePlace') && !app5.includes('titleRePlaceArmed') && !app5.includes('armTitleRePlace();'));

// ---------- (9) the trim ----------
check('9: the proven-unread residue (labelFeatures / LABELS) did not come back with the restore',
  !engine.includes('labelFeatures.push(') && !engine.includes('const labelFeatures') && !engine.includes('const LABELS = {'));

// ---------- (10) LEFTBIT stayed - it is read ----------
check('10: LEFTBIT is present AND read by the label-anchor computation (load-bearing, not residue)',
  engine.includes('const LEFTBIT = {};') && engine.includes('const leftOff = LEFTBIT[n] === 0 ? off0 : off1'));

// ---------- (11) the create backdrop hides the titles again ----------
check('11: the create-pick hide list carries the four title layers again',
  createPick.includes("[1, 2, 3, 4].map(t => 'streetnamespt' + t)"));

// ---------- (12) the release editorial ----------
const BULLET = "Street names are the app's own labels when zoomed out, and the map's full names when you zoom in close.";
check("12: What's New carries the 1.261 bullet (the brief's bullet, shortened only to fit the standing 108-char cap, meaning kept), em-dash free, and the CHANGELOG top entry is Beta 1.261",
  whatsnew.includes(BULLET) && BULLET.length <= 108 && !whatsnew.includes('—') &&
  changelog.indexOf('## Beta 1.261') > -1 && changelog.indexOf('## Beta 1.261') < changelog.indexOf('## Beta 1.260'));

console.log(`proof-1261: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
