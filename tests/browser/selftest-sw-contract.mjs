// Phase 5 (C4) test-change gate: the service worker's cache names and tile
// cap are CONTRACT values (docs/OFFLINE-CONTRACT.md v1). This selftest pins
// the literals in BOTH shipped copies of the worker (repo-root sw.js and
// src/sw.js, byte-identical by build) - and the pack-migration flag key in
// app4 - to the contract constants carried by gen-offline-fixture.mjs, so a
// rename or cap change in code without a contract bump fails the build.
import { readFileSync } from 'node:fs';
import { CONTRACT } from './gen-offline-fixture.mjs';

let fail = 0;
const t = (name, cond) => { if (!cond) { fail++; console.log('FAIL', name); } };
for (const rel of ['../../sw.js', '../../src/sw.js']) {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const grab = (re) => { const m = re.exec(src); return m ? m[1] : null; };
  t(rel + ' shell cache name', grab(/const CACHE = '([^']+)'/) === CONTRACT.shellCache);
  t(rel + ' tiles cache name', grab(/TILES = '([^']+)'/) === CONTRACT.tilesCache);
  t(rel + ' offline cache name', grab(/OFFLINE = '([^']+)'/) === CONTRACT.packCache);
  t(rel + ' MAX_TILES', grab(/MAX_TILES = (\d+)/) === String(CONTRACT.maxTiles));
}
const app4 = readFileSync(new URL('../../parts/app4.js', import.meta.url), 'utf8');
t('app4 PACKMIG_KEY is the contract flag key', app4.includes("const PACKMIG_KEY = '" + CONTRACT.flagKey + "';"));
console.log('sw-contract selftest:', fail ? 'FAIL' : 'PASS');
process.exit(fail ? 1 : 0);
