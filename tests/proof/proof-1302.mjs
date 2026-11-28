// proof-1302.mjs - lastResortConnect characterization: local
// junction repairs and geometric vetoes, pinned before its split.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { extractFn } from '../browser/extract-fn.mjs';

const read = name => readFileSync(new URL('../../parts/' + name, import.meta.url), 'utf8');
const engine = read('engine.js');
const app1 = read('app1.js');
const MLAT = 111132, MLNG = 82000;
const pt = (x, y) => [y / MLAT, x / MLNG];
const V = pt(0, 0);
const jDistM = (a, b) => Math.hypot((a[0] - b[0]) * MLAT, (a[1] - b[1]) * MLNG);
const frame = { A: [{ B: 'B', V: pt(1.5, 0), nB: [0, 1] }], B: [{ B: 'A', V: pt(1.5, 0), nB: [1, 0] }] };
const chain = (n, pts, ends = {}) => ({ pts, mem: [{ n }], ...ends });
const end = { n: 'A' };
const eq = (a, b) => jDistM(a, b) < 1e-7;
let builds = 0;
const context = vm.createContext({
  MLAT, MLNG, SURF_HALF: 4.29,
  H: { MLAT, MLNG, jDistM, names: ['A', 'B'] },
  GEO: { A: { stitched: [V, pt(0, 20)] }, B: { stitched: [V, pt(20, 0)] } },
  TOPO: { verts: () => ({ shared: [{ n: 'A', vi: 0 }, { n: 'B', vi: 0 }] }), segReal: () => true },
  JUNC: null,
  buildJunctions: () => { builds++; context.JUNC = frame; },
});
const run = vm.runInContext([
  ...['XYOf', 'coordKey'].map(name => engine.match(new RegExp('^const ' + name + ' = [^;]+;', 'm'))[0]),
  ...['segCross', 'lineHit', 'junctionPairFrame', 'properCross', 'buildLocalFragmentComponents', 'findLocalRepairCandidates', 'allowsJunctionRepair', 'lastResortConnect'].map(name => extractFn(engine, 'function ' + name + '(')),
  extractFn(app1, 'function ptSegM('), 'H.ptSegM = ptSegM;', 'lastResortConnect;',
].join('\n'), context);
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond === true) pass++; else { fail++; console.log('FAIL:', name); } };

run([], []);
run([], []);
check('empty geometry warms junctions once and exits', builds === 1);

const target = chain('B', [pt(8, 3), pt(8, 7)]);
const tip = pt(3, 5);
const landing = pt(8, 5);
const farther = chain('B', [pt(9, 3), pt(9, 5)]);
for (const atEnd of [false, true]) {
  const edge = atEnd ? chain('A', [pt(2, 5), tip], { e1: end }) : chain('A', [tip, pt(2, 5)], { e0: end });
  run([edge], [farther, target]);
  check('lands on the nearest band interior at the ' + (atEnd ? 'tail' : 'head'),
    edge.pts.length === 3 && eq(edge.pts[atEnd ? 2 : 0], landing) && target.pts.length === 2);
}
const attempt = (target, extra = [], endpoint = tip) => {
  const edge = chain('A', [pt(2, 5), endpoint], { e1: end });
  run([edge, ...extra], [target]);
  return edge.pts.length;
};
check('band touch satisfies the endpoint without extending it',
  attempt(chain('B', [pt(6, 3), pt(6, 7)])) === 2);
check('opposite quadrant offers no candidate',
  attempt(chain('B', [pt(-2, 3), pt(-2, 7)])) === 2 &&
  attempt(chain('B', [pt(8, -1), pt(8, -5)])) === 2);
check('missing reciprocal junction leaves the endpoint in place',
  (() => { context.JUNC = { A: frame.A }; const count = attempt(target); context.JUNC = frame; return count === 2; })());
check('endpoint exactly 11 metres away is outside the candidate window',
  (() => { const edge = chain('A', [pt(11, 2), pt(11, 0)], { e1: end });
    run([edge], [chain('B', [pt(6, -5), pt(6, -2)])]); return edge.pts.length === 2; })());
check('a proper crossing of unrelated green paint vetoes an otherwise-valid landing',
  attempt(target, [chain('C', [pt(5, 4), pt(5, 6)])]) === 2);

context.H.names = ['A', 'B', 'C'];
context.GEO.C = { stitched: [pt(5, 0), pt(5, 9)] };
check('crossing a real centreline beyond six metres vetoes the repair',
  (() => {
    const edge = chain('A', [pt(2, 7), pt(3, 7)], { e1: end });
    run([edge], [target]);
    return edge.pts.length === 2;
  })());

console.log(`proof-last-resort-connect: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
