// Phase 5 (C4) test-change gate: the frozen offline-pack fixture must equal
// what the contract generator produces TODAY, byte for byte. The fixture may
// change only under a contract version bump with the set diff reviewed
// (docs/OFFLINE-CONTRACT.md, the freeze rule) - this selftest is the tripwire
// that makes an unreviewed change fail the build instead of drifting.
import { readFileSync } from 'node:fs';
import { fixtureText, buildOfflinePack } from './gen-offline-fixture.mjs';

const frozen = readFileSync(new URL('./fixtures/offline-pack.json', import.meta.url), 'utf8');
const regenerated = fixtureText();
let fail = 0;
if (frozen !== regenerated) {
  fail++;
  const a = JSON.parse(frozen), b = JSON.parse(regenerated);
  console.log('FAIL fixture differs from the generator output');
  console.log('  frozen:     count', a.count, 'fingerprint', a.fingerprint);
  console.log('  generated:  count', b.count, 'fingerprint', b.fingerprint);
  const A = new Set(a.urls), B = new Set(b.urls);
  const onlyA = [...A].filter(u => !B.has(u)), onlyB = [...B].filter(u => !A.has(u));
  if (onlyA.length) console.log('  only in frozen fixture (' + onlyA.length + '):', onlyA.slice(0, 5));
  if (onlyB.length) console.log('  only in generated (' + onlyB.length + '):', onlyB.slice(0, 5));
  if (!onlyA.length && !onlyB.length) console.log('  same set, different order or formatting');
  console.log('  A fixture change requires a contract version bump + reviewed set diff (docs/OFFLINE-CONTRACT.md).');
}
const pack = buildOfflinePack();
if (pack.contract !== 1 || pack.count !== pack.urls.length || pack.count < 1) { fail++; console.log('FAIL generated pack shape is wrong'); }
console.log('offline-fixture selftest:', fail ? 'FAIL' : 'PASS', '(' + pack.count + ' urls, ' + pack.fingerprint + ')');
process.exit(fail ? 1 : 0);
