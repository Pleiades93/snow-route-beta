// proof-paint-model.mjs - Section 2 step 1 (Architecture #12, Beta 1.282).
// THE PAINT INPUTS HAVE ONE OWNER. Through Beta 1.281 the paint model's
// pieces were scattered across the engine: buildFamilies and selectedGeom
// each computed the piece classification (band vs colour family) and the
// end-clip decision inline, fillSlicePts carried a third per-side family
// predicate, the board's merged strands reached buildSelFill through the
// LASTCHAINS module global, and buildSelFill's boundary-end fades reached
// their three assembly sites through the SEL_FILL_FADES module global.
// PAINT (parts/engine.js) owns them now: classify (the one classification),
// clipEnds (the one clip decision, both rules), fillCont (the fill family's
// continuation) and strands (the merged strand set buildFamilies publishes
// and buildSelFill reads); buildSelFill returns { fill, fades } like
// buildSelC returns its fades. Checks 1-3 pin the ownership shape; checks
// 4-6 run the model's decisions for real against a fixture board (the
// palette and the junction clip itself are stubbed - this proof grades
// the model's DECISIONS, not the palette or the clip geometry, which the
// drives and proof-green-half-road grade rendered). The mutation receipt
// for this file lives in tests/mutation-receipts.json.
// Run from the repo root:  node tests/proof/proof-paint-model.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

function extractFn(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0, str = null, esc = false, line = false, block = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}

// ---------- 1: the side-channels are gone as code ----------
check('1a: LASTCHAINS survives nowhere as code (no declaration, no assignment, no read)',
  !engine.includes('let LASTCHAINS') && !engine.includes('LASTCHAINS = {') && !engine.includes('LASTCHAINS.fills') && !engine.includes('LASTCHAINS &&'));
check('1b: SEL_FILL_FADES survives nowhere as code (no declaration, no reset, no push, no read)',
  !engine.includes('let SEL_FILL_FADES') && !engine.includes('SEL_FILL_FADES = []') && !engine.includes('SEL_FILL_FADES.push') && !engine.includes('...SEL_FILL_FADES'));

// ---------- 2: the owner and its seats ----------
const paintAt = engine.indexOf('const PAINT = {');
check('2a: the PAINT model is declared in engine.js with its three decisions and the strand seat',
  paintAt > -1 && engine.includes('classify(n, idx)') && engine.includes('clipEnds(n, idx, pts, half, bandRule)') && engine.includes('fillCont(n, i, side)') && engine.includes('strands: null,'));
check('2b: buildFamilies publishes its merged strands into the model',
  extractFn(engine, 'function buildFamilies()').includes('PAINT.strands = { centres, bands, edges, fills };'));
check('2c: buildSelFill reads the corner strands from the model and returns its fades through its return',
  extractFn(engine, 'function buildSelFill()').includes('PAINT.strands.fills') && extractFn(engine, 'function buildSelFill()').includes('return { fill: { type: \'FeatureCollection\', features: feats }, fades };'));
check('2d: the three selFades assembly sites consume the return, not a global (rebuildData, init, syncSel)',
  (engine.match(/\.\.\.SF\.fades/g) || []).length === 3 && (engine.match(/selFill: SF\.fill/g) || []).length === 1 && (engine.match(/CUR\.selFill = SF\.fill/g) || []).length === 2);
check('2e: the classification and the clip decision each live exactly once - buildFamilies and selectedGeom both call the model',
  (engine.match(/PAINT\.classify\(n, idx\)/g) || []).length >= 3 && (engine.match(/PAINT\.clipEnds\(n, idx, /g) || []).length === 3
  && extractFn(engine, 'function selectedGeom(it)').includes('PAINT.clipEnds(n, idx, pts, half, isBand)')
  && !extractFn(engine, 'function selectedGeom(it)').includes('famKey'));

// ---------- 3-5: the model's decisions, run for real ----------
const paintSrc = engine.slice(paintAt, engine.indexOf('\n};', paintAt) + 3);
check('3a: the PAINT block extracted whole', paintSrc.includes('fillCont') && paintSrc.endsWith('};'));
const prelude = [
  // fixture board: street S with five pieces [0, 1, 3, 2, 0] (none, side0, band, side1, none); street T with two pieces [3, 1]
  'const H = { pieces: { S: [0, 1, 3, 2, 0], T: [3, 1] } };',
  'const GEO = { S: { cuts: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] }, T: { cuts: [[0, 1], [1, 2]] } };',
  // Beta 1.283 (#11): the run gap the T fixture used to carry as a GEO field is TOPO's now - the real owner, extracted and seated: S is one run, T's second piece opens a later run at vertex 1
  engine.slice(engine.indexOf('const TOPO = {'), engine.indexOf('\n};', engine.indexOf('const TOPO = {')) + 3),
  "TOPO.seat('S', [{ start: 0, end: 5 }]); TOPO.seat('T', [{ start: 0, end: 0 }, { start: 1, end: 2 }]);",
  // palette stubs: the muted colour of a piece is its family letter - A for side bits 1, B for 2, C for 0
  'const colOf = (n, bits) => "col" + bits;',
  'const mute = (c) => "mute(" + c + ")";',
  // the junction clip itself, stubbed as a recording pass-through: the model decides WHETHER an end clips; the clip's geometry is clipEndAtJunction's own, graded elsewhere
  'const clipCalls = [];',
  'const clipEndAtJunction = (n, vi, pts, atStart, half) => { clipCalls.push([n, vi, atStart]); return pts; };',
  paintSrc,
].join('\n');
check('3b: the prelude carries the model', prelude.includes('const PAINT = {'));
const out = vm.runInNewContext(prelude + `
  const res = {};
  const cS2 = PAINT.classify('S', 2), cS1 = PAINT.classify('S', 1), cS0 = PAINT.classify('S', 0);
  res.band = [cS2.bits, cS2.isBand, cS2.key];
  res.side = [cS1.bits, cS1.isBand, cS1.key, cS1.famKey(2), cS1.famKey(1), cS1.famKey(0)];
  res.none = [cS0.isBand, cS0.key];
  res.fillCont = [PAINT.fillCont('S', 1, 0), PAINT.fillCont('S', 1, 1), PAINT.fillCont('S', 2, 0), PAINT.fillCont('S', 2, 1), PAINT.fillCont('S', 3, 0), PAINT.fillCont('S', 3, 1), PAINT.fillCont('S', 0, 0)];
  clipCalls.length = 0; PAINT.clipEnds('S', 1, ['p'], 4.95, false); res.famClipSide = clipCalls.slice();       // family rule, piece 1 (side A): prev piece 0 is family C -> start clips; next piece 2 is band -> end clips
  clipCalls.length = 0; PAINT.clipEnds('S', 2, ['p'], 4.95, false); res.famClipBand = clipCalls.slice();       // family rule on the band piece itself: prev/next are A and B families -> both ends clip
  clipCalls.length = 0; PAINT.clipEnds('S', 2, ['p'], 4.95, true); res.bandClipBand = clipCalls.slice();       // band rule on the band: prev marks side0, next marks side1 -> NEITHER end clips (the green continues both ways)
  clipCalls.length = 0; PAINT.clipEnds('S', 3, ['p'], 4.95, true); res.bandClipSide = clipCalls.slice();       // band rule judged on piece 3: prev is the band (marked) -> start keeps; next is 0 -> end clips
  clipCalls.length = 0; PAINT.clipEnds('T', 1, ['p'], 4.95, false); res.gapClip = clipCalls.slice();           // piece T1: a run gap at its start vertex -> start clips even though judged by family; it is also the last piece -> end clips
  res;`, {});
check('4a: classify reads a band piece as the band family', JSON.stringify(out.band) === JSON.stringify([3, true, 'band']));
check('4b: classify reads a one-side piece by its muted colour family, and famKey judges neighbours (band next door is the band family, not this piece\'s)',
  JSON.stringify(out.side) === JSON.stringify([1, false, 'mute(col1)', 'band', 'mute(col1)', 'mute(col0)']));
check('4c: classify reads an unmarked piece in its own family', JSON.stringify(out.none) === JSON.stringify([false, 'mute(col0)']));
check('5a: fillCont continues a side through its own marks and through a band, never through the other side or an unmarked piece',
  JSON.stringify(out.fillCont) === JSON.stringify([true, false, true, true, false, true, false]));
check('5b: the family clip rule clips both ends of a lone-family piece and both ends of the band piece judged as a centre',
  JSON.stringify(out.famClipSide) === JSON.stringify([['S', 1, true], ['S', 2, false]]) && JSON.stringify(out.famClipBand) === JSON.stringify([['S', 2, true], ['S', 3, false]]));
check('5c: the band clip rule keeps BOTH ends of a band flanked by marked pieces - the completed side runs through (the 1.208 LongAve rule)',
  JSON.stringify(out.bandClipBand) === JSON.stringify([]));
check('5d: the band clip rule keeps the end facing a marked neighbour and clips the end facing an unmarked one',
  JSON.stringify(out.bandClipSide) === JSON.stringify([['S', 4, false]]));
check('5e: a run gap earns the clip even at a continuing family boundary, and the street\'s last piece clips its end',
  JSON.stringify(out.gapClip) === JSON.stringify([['T', 1, true], ['T', 2, false]]));

console.log(`proof-paint-model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
