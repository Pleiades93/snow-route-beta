// proof-1258.mjs - Beta 1.258 (fix_id: labelretire-1258).
// THE MAP'S OWN NAMES (Andrew's decision, 2026-11-20, from the label
// comparison sample): the app's own street titles are retired and the
// basemap's native road labels become the street-name system for every
// route and pack. Through 1.257 the route streets were named by the
// engine's streetnamespt1-4 point layers over the labelpts source (one
// short name per street at a computed anchor), and app2's glHideLabels
// excluded the route names from the basemap's roads_labels_major /
// roads_labels_minor layers by filter so the two systems never printed
// together. The titles carried the placement defect Beta 1.248 diagnosed
// (MapLibre's variable-anchor preference keeping a side anchor chosen
// mid-flight for the whole session); it recurred in a cold session on
// 2026-11-20 (Valeria, Ferrari), and the round's measurements on the
// live 1.257 build showed the 1.248 one-shot heal could not hold the
// class - after a clean settle, one zoom in and back re-stuck Marconi
// 21.1 px and Flatbush 14.4 px off their streets. Andrew chose the
// basemap's names instead: full suffixed spellings (Ferrari Court,
// Santa Barbara Place), minor names from zoom 15, repeats along long
// streets. This proof pins the retirement's code shape; the rendered
// behaviour is graded by drive130 (rewritten to the new rule) and the
// round's measurement harness. proof-1248 is retired with its subject.
import { readFileSync } from 'node:fs';

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

// ---------- the title system is gone ----------
check('1: the engine builds no labelpts source and no title layers',
  !engine.includes("addSource('labelpts'") && !engine.includes("'streetnamespt' + t") && !engine.includes("getSource('labelpts')"));
check('2: the label data builders are gone (anchors, tiers, the Fifth nudge)',
  !engine.includes('labelPointFeatures') && !engine.includes('function assignTiers()') && !engine.includes('function nudgeFifth()') && !engine.includes('const LABELPTS'));
check('3: the 1.248 re-placement helper and its export are gone',
  !engine.includes('function rePlaceTitles()') && !engine.includes('rePlaceTitles'));
check('4: the app5 flight hook is gone (no arm, no call site)',
  !app5.includes('armTitleRePlace()') && !app5.includes('function armTitleRePlace') && !app5.includes('titleRePlaceArmed'));
check('5: the create backdrop hide list carries no title layers',
  !createPick.includes("'streetnamespt' + t"));

// ---------- the basemap names every street ----------
check('6: the route-name exclusion is gone from app2 (no tile-names list, no name filter)',
  !app2.includes('ROUTE_TILE_NAMES') && !app2.includes("['literal', ROUTE_TILE_NAMES]"));
check('7: the two road-label originals keep their stock filter from the embedded spec',
  app2.includes('const targetF = specL && specL.filter ? convF(specL.filter) : null;'));
check('8: the two road-label originals take their zoom range from the spec (stock 11 / 15), not the blanket 13',
  app2.includes('const sMin = specL0 && typeof specL0.minzoom === \'number\' ? specL0.minzoom : 0;') && app2.includes('m.setLayerZoomRange(L.id, sMin, sMax)'));
check('9: the label pass is renamed for what it does - glUnifyLabels, defined once, hosted, called by the engine',
  app2.includes('function glUnifyLabels(m)') && !app2.includes('glHideLabels') &&
  app1.includes('get glUnifyLabels() { return glUnifyLabels; }') &&
  (engine.split('H.glUnifyLabels(GLM)').length - 1) === 2);
check('10: buildGeometry no longer refills a tile-names list',
  !app1.includes('ROUTE_TILE_NAMES'));

// ---------- what survives ----------
check('11: the route POI still wears the route name (a place marker, not a street name)',
  engine.includes("add({ id: 'routepoi-txt'") && engine.includes("'routepoi-txt'"));
check('12: font and theme passes now serve the POI label only',
  engine.includes("['routepoi-txt']") && !engine.includes('streetnamespt1'));
check('13: the retired Beta 1.40 clone layers are still removed if an older build left one',
  app2.includes('removeLayer(cloneId)'));

// ---------- the release editorial ----------
check('14: the CHANGELOG top entry is Beta 1.258',
  changelog.indexOf('## Beta 1.258') > -1 && changelog.indexOf('## Beta 1.258') < changelog.indexOf('## Beta 1.257'));
check('15: the What\'s New bullet is the round\'s own line, within the 108-char cap, em-dash free',
  whatsnew.includes('Street names now come from the map itself, spelled in full.') &&
  'Street names now come from the map itself, spelled in full.'.length <= 108 &&
  !whatsnew.includes('—'));

console.log(`proof-1258: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
