// Phase 3 (C2) test-change gate fixture: the storage-outcome shape is the contract
// every caller branches on, so its constructors are proven here in plain Node
// against written fixtures BEFORE any CI run consumes them. Extracts the SHIPPED
// storeOk/storeFail from parts/app1.js by balanced-brace extraction (same method
// as selftest-trail-segments.mjs).
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in app1.js');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
const { storeOk, storeFail } = new Function(extract('storeOk') + '\n' + extract('storeFail') + '\nreturn { storeOk, storeFail };')();
const F = JSON.parse(readFileSync(new URL('./fixtures/store-result.json', import.meta.url), 'utf8'));
const val = v => v === 'UNDEF' ? undefined : v;
let pass = 0, fail = 0;
for (const c of F.cases) {
  const got = c.call === 'ok' ? storeOk() : storeFail(val(c.args[0]), val(c.args[1]));
  if (JSON.stringify(got) === JSON.stringify(c.expect)) { pass++; } else { fail++; console.log('FAIL', c.name, 'got', JSON.stringify(got), 'want', JSON.stringify(c.expect)); }
}
console.log(`store-result selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
