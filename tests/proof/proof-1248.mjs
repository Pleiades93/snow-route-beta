// proof-1248.mjs - Beta 1.248 (fix_id: labelbug-1248).
// THE STREET-NAME LABEL FIX (Andrew's report, 2026-11-18): on a cold
// open, after the pick and the fly-in, some street names sat OFF their
// streets - zooming did not fix it, a night-to-day swap fixed it for the
// session, the next cold open brought it back on varying streets. The
// round's diagnosis (measured on the live 1.247 build): the title
// anchors are computed on their streets and always sit on them; the
// rendered TEXT is what sits off, placed beside its anchor by MapLibre's
// variable-anchor placement, which PREFERS the anchor the previous
// placement pass chose and keeps it while it still places
// (maplibre-gl 4.7.1, symbol/placement.ts - prevPlacement.variableOffsets,
// keyed by crossTileID, which lives with the source's cross-tile index).
// The first passes run mid-flight, so a side anchor chosen there sticks
// for the session; only a fresh style (the theme swap) re-decided. The
// fix: when the pick flight ends and the map reports idle, the engine
// rebuilds the labelpts source in place (GLP.rePlaceTitles - same data,
// the four tier layers re-added with their live specs at their stack
// seats), giving the titles a fresh cross-tile index so the next pass
// decides against the settled scene. The rendered grading (zero
// off-street names across repeated cold opens on the fixed build; the
// pristine 1.247 build flagged under the same conditions) is the round's
// measurement suite, recorded in the round's RECORD.md.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const app5 = read('parts/app5.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const body = (src, marker) => { const i = src.indexOf(marker); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }', i) + 4); };

// ---------- the engine helper ----------
check('1: the engine carries the re-placement helper',
  engine.includes('function rePlaceTitles()'));
check('2: the helper rebuilds the labelpts source with the standing data object',
  engine.includes("GLM.addSource('labelpts', { type: 'geojson', data: LABELPTS });"));
check('3: the source definition is shared - the stack build and the rebuild add it identically (two call sites, one form)',
  engine.split("GLM.addSource('labelpts', { type: 'geojson', data: LABELPTS });").length - 1 === 2);
check('4: the helper removes the tier layers before the source, then the source',
  (() => { const b = body(engine, 'function rePlaceTitles()'); const rl = b.indexOf('GLM.removeLayer(id)'); const rs = b.indexOf("GLM.removeSource('labelpts')"); return rl > -1 && rs > rl; })());
check('5: the helper re-adds exactly the four tier layers, read from the live style',
  engine.includes("[1, 2, 3, 4].map(t => 'streetnamespt' + t)") && body(engine, 'function rePlaceTitles()').includes('style.layers.find(l => l.id === id)'));
check('6: the helper is exported on the public API',
  engine.includes('tapTolPx, mute, rePlaceTitles }'));

// ---------- the flight hook ----------
check('7: the pick flight arms the re-placement as it launches',
  app5.includes('essential: false }); armTitleRePlace();'));
check('8: the hook waits for the flight to end, then for the map to idle',
  app5.includes("map.once('moveend'") && app5.includes("map.once('idle', run)"));
check('9: the hook calls the engine helper through the public API',
  app5.includes('window.GLP.rePlaceTitles()'));
check('10: exactly one arm call site - the no-flight fallback (fit0) never arms',
  app5.split('armTitleRePlace();').length - 1 === 1 &&
  (() => { const i = app5.indexOf('const fit0'); const line = i < 0 ? '' : app5.slice(i, app5.indexOf('\n', i)); return !line.includes('armTitleRePlace'); })());

// ---------- the fences: styling and label set untouched ----------
check('11: the title layers keep their standing placement spec (variable anchors, radial offset, no overlap)',
  engine.includes("'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right']") &&
  engine.includes("'text-radial-offset': 0.8") &&
  engine.includes("'text-allow-overlap': false"));
check('12: the tier minzooms stand (which labels show is unchanged)',
  engine.includes('const PT_MIN = [13.7, 13.35, 13.0, 12.6];'));

// ---------- the release editorial ----------
check('13: the CHANGELOG top entry is Beta 1.248',
  changelog.indexOf('## Beta 1.248') > -1 && changelog.indexOf('## Beta 1.248') < changelog.indexOf('## Beta 1.247'));
check('14: the What\'s New bullet is the round\'s own line, within the 108-char cap, em-dash free',
  whatsnew.includes('Street names now sit on their streets after the opening fly-in.') &&
  'Street names now sit on their streets after the opening fly-in.'.length <= 108 &&
  !whatsnew.includes('—'));

console.log(`proof-1248: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
