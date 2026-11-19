import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Mutation-run proof (2026-11-19, snow-mutation-run): crIdbOpen
// (parts/create-cache.js) is the one door to the create flow's IndexedDB
// cache. Its contract: it ALWAYS returns a Promise; with no IndexedDB it
// resolves null (the cache is simply off); with IndexedDB present it
// resolves the opened database, and null only on error/blocked. The
// mutation run showed the fast suite caught none of: the function
// returning null instead of the Promise, the undefined-check flipping to
// !== (so a present IndexedDB resolves null and the cache never opens),
// or the check being negated. This proof extracts crIdbOpen verbatim and
// runs it against both scopes (the harness supplies CR_IDB_NAME /
// CR_IDB_STORE and the indexedDB global, or its absence).
// On the clean tree all checks pass; each break fails at least one.

const src = readFileSync('parts/create-cache.js', 'utf8');
const start = src.indexOf('function crIdbOpen()');
if (start < 0) { console.log('FAIL: crIdbOpen not found'); process.exit(1); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
}
const fnText = src.slice(start, end);

let fails = 0;
function check(label, cond) { console.log((cond ? 'PASS: ' : 'FAIL: ') + label); if (!cond) fails++; }

function load(extra) {
  const ctx = vm.createContext({ CR_IDB_NAME: 'cr-test', CR_IDB_STORE: 'cities', ...extra });
  vm.runInContext(fnText + '\nthis.__open = crIdbOpen;', ctx);
  return ctx.__open;
}

// No IndexedDB in scope: a Promise that resolves null.
{
  const open = load({});
  const p = open();
  check('returns a Promise when IndexedDB is absent', !!p && typeof p.then === 'function');
  check('resolves null when IndexedDB is absent', (await p) === null);
}
// IndexedDB present and opening fine: resolves the database itself.
{
  const fakeDb = { name: 'fake-db' };
  const fakeIdb = {
    open(name, ver) {
      const rq = { result: fakeDb };
      setTimeout(() => rq.onsuccess && rq.onsuccess(), 0);
      return rq;
    },
  };
  const open = load({ indexedDB: fakeIdb });
  const p = open();
  check('returns a Promise when IndexedDB is present', !!p && typeof p.then === 'function');
  check('resolves the opened database when IndexedDB is present', (await p) === fakeDb);
}
console.log(fails ? `proof-mut-idb-open: ${fails} FAILING` : 'proof-mut-idb-open: all pass');
process.exit(fails ? 1 : 0);
