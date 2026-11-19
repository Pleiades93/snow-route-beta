import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Mutation-run proof (2026-11-19, snow-mutation-run): onMapReady
// (parts/app2.js) is the map boot's callback door - a callback registered
// before the map exists is QUEUED (__onMap), and one registered after
// runs IMMEDIATELY. The mutation run showed the fast suite did not catch
// negating its condition, which inverts both halves (early callbacks
// would run against a null map; late ones would queue forever). This
// proof extracts onMapReady verbatim and runs both states against a
// stub map/__onMap scope. On the clean tree all checks pass; the
// negation fails every check.

const src = readFileSync('parts/app2.js', 'utf8');
const line = src.split('\n').find(l => l.includes('function onMapReady'));
if (!line) { console.log('FAIL: onMapReady not found'); process.exit(1); }

let fails = 0;
function check(label, cond) { console.log((cond ? 'PASS: ' : 'FAIL: ') + label); if (!cond) fails++; }

function load(mapVal) {
  const ctx = vm.createContext({ map: mapVal, __onMap: [] });
  vm.runInContext(line + '\nthis.__f = onMapReady; this.__q = __onMap;', ctx);
  return ctx;
}
{
  const ctx = load(null);
  let ran = 0;
  ctx.__f(() => ran++);
  check('callback is queued, not run, before the map exists', ran === 0 && ctx.__q.length === 1);
}
{
  const ctx = load({});
  let ran = 0;
  ctx.__f(() => ran++);
  check('callback runs immediately once the map exists', ran === 1 && ctx.__q.length === 0);
}
console.log(fails ? `proof-mut-map-ready: ${fails} FAILING` : 'proof-mut-map-ready: all pass');
process.exit(fails ? 1 : 0);
