// Phase 3 (C2) test-change gate fixture: the storage-outcome shape is the contract
// every caller branches on, so its constructors are proven here in plain Node
// against written fixtures BEFORE any CI run consumes them. Extracts the SHIPPED
// storeOk/storeFail from parts/app1.js by balanced-brace extraction (same method
// as selftest-trail-segments.mjs).
import { readFileSync } from 'node:fs';
import { extractFn } from './extract-fn.mjs';
const src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
const { storeOk, storeFail } = new Function(
  extractFn(src, 'function storeOk(') + '\n' + extractFn(src, 'function storeFail(') + '\nreturn { storeOk, storeFail };')();
const F = JSON.parse(readFileSync(new URL('./fixtures/store-result.json', import.meta.url), 'utf8'));
const val = v => v === 'UNDEF' ? undefined : v;
let pass = 0, fail = 0;
for (const c of F.cases) {
  const got = c.call === 'ok' ? storeOk() : storeFail(val(c.args[0]), val(c.args[1]));
  if (JSON.stringify(got) === JSON.stringify(c.expect)) { pass++; } else { fail++; console.log('FAIL', c.name, 'got', JSON.stringify(got), 'want', JSON.stringify(c.expect)); }
}
console.log(`store-result selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
