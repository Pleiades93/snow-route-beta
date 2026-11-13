// In-repo copy of the basemap style generator (Beta 1.94, audit F-02):
// run from scripts/ (cd scripts && npm ci && node genstyles.mjs) - npm ci
// installs EXACTLY the pinned @protomaps/basemaps from package-lock.json
// (Beta 1.95, deep audit SR-194-11: before this round the dependency was an
// unpinned range with no lockfile, so a regeneration could silently change
// the shipped styles; the pinned 5.7.2 reproduces the shipped pmstyles.js
// byte-for-byte). It writes ../parts/pmstyles.js,
// after which scripts/assemble.py + scripts/build-pages.py rebuild the page.
// Generates parts/pmstyles.js - the app's two basemaps (Beta 1.33, Andrew's pick:
// Protomaps, one map in two flavours). The tile endpoint comes from the VENDORED
// CARTO dark-matter style (scripts/carto-dark-matter-style.json) - Beta 1.96 (deep
// audit SR-195-08): before this round the generator fetched that style LIVE at
// generation time and stamped the run date into the banner, so the shipped file
// could be reproduced from the lockfile alone only for as long as CARTO served the
// identical style, and every regeneration dirtied the diff with a new date. Now the
// input is a file in this repo with a recorded hash (provenance below); refreshing
// it is a deliberate act: node genstyles.mjs --refresh-carto re-fetches, overwrites
// the vendored copy, and the resulting banner hash change is the review signal.
// DO NOT hand-edit pmstyles.js.
import fs from 'fs';
import crypto from 'crypto';
import { layers, namedFlavor } from '@protomaps/basemaps';

const CARTO_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const VENDORED = 'carto-dark-matter-style.json'; // fetched from CARTO_URL on 2026-11-04; sha256 of the committed copy is computed at generation time and stamped into the banner
if (process.argv.includes('--refresh-carto')) {
  const live = await (await fetch(CARTO_URL)).text();
  fs.writeFileSync(VENDORED, live);
  console.log('vendored CARTO style refreshed:', live.length, 'bytes');
}
const vendoredRaw = fs.readFileSync(VENDORED, 'utf8');
const cartoSha = crypto.createHash('sha256').update(vendoredRaw).digest('hex').slice(0, 12);
const dm = JSON.parse(vendoredRaw);
const tiles = dm.sources.protomaps.tiles;
if (!Array.isArray(tiles) || !tiles[0].includes('tiles.basemaps.cartocdn.com')) throw new Error('unexpected dark-matter source: ' + JSON.stringify(dm.sources).slice(0, 200));

function style(flavor) {
  return {
    version: 8,
    name: 'protomaps-' + flavor,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/' + flavor,
    sources: { protomaps: { type: 'vector', tiles, minzoom: 0, maxzoom: 15, attribution: '© OpenStreetMap contributors © CARTO' } },
    layers: layers('protomaps', namedFlavor(flavor), { lang: 'en' })
  };
}
function add3d(s) { // Beta 1.90 (Andrew): 3D buildings - the flat footprint fill hands over to a fill-extrusion twin parked just below the labels. The route tiles carry footprints but no heights (checked on his streets: 492 buildings, none with a height), so the height is an estimate - a standard two-storey 7 m, using a real recorded height where the tile happens to carry one. Beta 1.182 (Andrew, picked from the 3D samples): every height x 1.5 - the recorded height and the 7 m estimate scale together inside the same expression, and the zoom ramp (0 below z15, full by z15.3) is unchanged. Top-down is unchanged: the extrusion's top face is the old fill (same colour, same 0.5 blend, height 0 below z15, rising to full by z15.3).
  const flat = s.layers.find(l => l.id === 'buildings');
  flat.paint['fill-opacity'] = 0;
  const i = s.layers.findIndex(l => l.type === 'symbol');
  s.layers.splice(i, 0, { id: 'buildings-3d', type: 'fill-extrusion', source: 'protomaps', 'source-layer': 'buildings', minzoom: 14, filter: ['in', 'kind', 'building', 'building_part'], paint: { 'fill-extrusion-color': flat.paint['fill-color'], 'fill-extrusion-opacity': 0.5, 'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.3, ['*', ['coalesce', ['get', 'height'], 7], 1.5]], 'fill-extrusion-base': 0 } });
  return s;
}
const ROAD_WIDTH_K = 1.5;   // Beta 1.181 (Andrew): EVERY basemap road is 1.5x wider, the same factor as the route paint's WIDTH_K (parts/engine.js) - day and night are ONE width, so this transform runs on both flavours identically. Generation-time on purpose (road-width audit Q5, Option A): the shipped styles stay self-contained, no runtime override exists to drift on a day/night restyle.
function scaleRoadWidths(s) {
  const scaleVal = v => (typeof v === 'number') ? Math.round(v * ROAD_WIDTH_K * 1000) / 1000 : v;
  const scaleExpr = e => {
    if (typeof e === 'number') return scaleVal(e);
    if (Array.isArray(e) && e[0] === 'interpolate') { const out = e.slice(); for (let i = 4; i < out.length; i += 2) out[i] = scaleVal(out[i]); return out; }
    throw new Error('unhandled road width expression form: ' + JSON.stringify(e).slice(0, 120));
  };
  for (const l of s.layers) {
    if (l.type !== 'line' || !l.id.startsWith('roads')) continue;   // symbol layers (roads_labels_*) are not roads: their text-halo-width must NOT scale
    for (const key of ['line-width', 'line-gap-width']) if (l.paint && key in l.paint) l.paint[key] = scaleExpr(l.paint[key]);
  }
  return s;
}
const day = scaleRoadWidths(add3d(style('light'))), night = scaleRoadWidths(add3d(style('dark')));
if (day.layers.length !== night.layers.length) throw new Error('flavour layer counts differ');
let bmVer = 'UNPINNED'; try { bmVer = JSON.parse(fs.readFileSync('node_modules/@protomaps/basemaps/package.json', 'utf8')).version; } catch (e) { /* the banner says UNPINNED - a generation without the lockfile install must not masquerade as reproducible */ }
const out = '// GENERATED by scripts/genstyles.mjs (@protomaps/basemaps ' + bmVer + ' (pinned exactly by scripts/package.json + package-lock.json - install with npm ci), tiles ' + tiles[0].split('/')[4] + ' from the vendored CARTO dark-matter style scripts/carto-dark-matter-style.json sha256 ' + cartoSha + ', road line-width/line-gap-width x' + ROAD_WIDTH_K + ' on roads* layers (Beta 1.181)) - do not hand-edit; regenerate instead.\n' + // Beta 1.96 (SR-195-08): no generation date in the banner - every input is pinned or vendored, so a regeneration from the same repo state is byte-identical, and any input change shows up as exactly one thing in the diff
  '// Beta 1.33 (Andrew): BOTH basemaps are Protomaps - one map, two flavours - embedded in the page so a day/night switch is a local setStyle with nothing to fetch and nothing to break.\n' +
  'const PM_DAY = ' + JSON.stringify(day) + ';\n' +
  'const PM_NIGHT = ' + JSON.stringify(night) + ';\n';
fs.writeFileSync('../parts/pmstyles.js', out);
console.log('pmstyles.js written:', day.layers.length, 'layers per flavour, tiles:', tiles[0]);
