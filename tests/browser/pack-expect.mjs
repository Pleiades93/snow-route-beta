// pack-expect.mjs - premise derivations for the browser drives
// (Improvement Tranche 4 / T2 premise sweep round 2, 2026-11-08).
//
// A drive's hard-coded expectation about the SHIPPED world - how many
// streets Route 5W has, how many stretches its geometry builds, what
// the offline preload census is - expires silently when the catalogue
// changes (the failure family the 1.141 INDEXFX fix started retiring
// for packs/index.json). This module is the single derivation the
// converted drives share:
//
//   PACK5W / PACK_COUNT - from parts/data.js (ROUTE_PACKS), read as
//     data in a vm context (the gen-offline-fixture.mjs pattern), with
//     the stretch geometry computed by the SHIPPED computeStretches
//     extracted verbatim from parts/app1.js (the
//     selftest-judging-fixtures.mjs pattern) - never a hand-copied
//     second list, and never the live page's own state.
//   OFFLINE - from tests/browser/fixtures/offline-pack.json, the
//     frozen Offline Contract v1 fixture (the contract's single
//     source; the app's preloadUrlList()/packMigFingerprint() are the
//     units under test and are NEVER read here). The tiles/glyphs/
//     sprites breakdown is counted from the fixture's own urls.
//
// Deliberate exception: drive165's 5W anchor does NOT use this module -
// it stays literal by design, as the canary that fails loudly if the
// pack data itself drifts (deriving it would derive the tripwire away).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const { ROUTE_PACKS } = vm.runInNewContext(read('../../parts/data.js') + '\n;({ ROUTE_PACKS })');
export const PACK_COUNT = ROUTE_PACKS.length;

function extract(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('pack-expect: extraction failed: ' + sig + ' not found in parts/app1.js');
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); } }
  throw new Error('pack-expect: extraction failed: unbalanced ' + sig);
}
const app1 = read('../../parts/app1.js');
const mline = app1.match(/const MLAT = [0-9]+, MLNG = [0-9]+/)[0];
const geom = new Function(`
  ${mline};
  ${extract(app1, 'function distM(')}
  ${extract(app1, 'function segLenM(')}
  ${extract(app1, 'function stitchRuns(')}
  ${extract(app1, 'function projOnLine(')}
  ${extract(app1, 'function sliceLine(')}
  ${extract(app1, 'function finishJunctionCuts(')}
  ${extract(app1, 'function computeStretches(')}
  return { computeStretches };
`)();

function census(pack) {
  const stretch = geom.computeStretches(pack.roads);
  const names = Object.keys(pack.roads);
  const partsByStreet = {};
  let parts = 0, stretchTotal = 0;
  for (const n of names) { partsByStreet[n] = stretch[n].parts.length; parts += stretch[n].parts.length; stretchTotal += stretch[n].total; }
  return {
    id: pack.id, name: pack.name, area: pack.area,
    names: names.length, nameList: names,
    mains: (pack.main || []).length, mainList: (pack.main || []).slice(),
    tiles: (pack.tileNames || []).length,
    parts, partsByStreet,
    stretchTotal: Math.round(stretchTotal),
    totalWork: Math.round(stretchTotal * 2),
    velmar: Math.round(stretch.Velmar ? stretch.Velmar.total : NaN),
    box: pack.box || null,
  };
}
export const PACK5W = census(ROUTE_PACKS.find(p => p.id === '5w'));
export const packById = (id) => census(ROUTE_PACKS.find(p => p.id === id));

const FIX = JSON.parse(read('./fixtures/offline-pack.json'));
export const OFFLINE = {
  count: FIX.count,
  fingerprint: FIX.fingerprint,
  tiles: FIX.urls.filter(u => u.endsWith('.mvt')).length,
  glyphs: FIX.urls.filter(u => u.endsWith('.pbf')).length,
  sprites: FIX.urls.filter(u => u.includes('/sprites/')).length,
};
