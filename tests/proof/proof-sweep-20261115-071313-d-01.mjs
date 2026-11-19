import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const src = readFileSync('parts/create-citydata.js', 'utf8');
const endIdx = src.indexOf('function crIndexWays');
assert.ok(endIdx > 0, 'could not locate slice boundary in parts/create-citydata.js');
const slice = src.slice(0, endIdx);

function makeEnv(indexCities) {
  const fetched = [];
  const sandbox = {
    Promise, Error, Object, Array, String, Number, Math, Date, RegExp, isFinite,
    setTimeout, clearTimeout,
    crRenderHint: () => {},
    fetch: async (url) => {
      fetched.push(url);
      // Beta 1.249 fixture roll: the pack download reads the body as a
      // stream / text since 1.249 (it used r.json() when this stub was
      // written), so the fake Response now carries text() beside json() -
      // the same payload either way; every assertion in this proof is
      // unchanged.
      if (url === 'packs/index.json') {
        const payload = { cities: indexCities };
        return {
          ok: true,
          status: 200,
          json: async () => payload,
          text: async () => JSON.stringify(payload),
        };
      }
      const payload = { streets: { 'Main St': [[[45.0, -75.0], [45.01, -75.01]]] } };
      return {
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(slice, sandbox);
  return { sandbox, fetched };
}

const bbox = { s: 45.0, w: -75.5, n: 45.5, e: -75.0 };
const packBbox = [44.9, -75.6, 45.6, -74.9];

let failed = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log('PASS:', label);
  } catch (err) {
    failed++;
    console.error('FAIL:', label, '-', err.message);
  }
}

const badSlugs = [
  '../manifest',
  '../../secret',
  'foo/bar',
  'foo\\bar',
  'city?x=1',
  'city#frag',
  'city%2f..%2fsecret',
  '.hidden',
  '',
  'index',
  '__proto__',
];

for (const bad of badSlugs) {
  await check(`crPackResolveCity rejects unsafe slug ${JSON.stringify(bad)}`, async () => {
    const { sandbox } = makeEnv([{ name: 'BadCity', slug: bad, bbox: packBbox }]);
    const res = await sandbox.crPackResolveCity('BadCity', bbox);
    assert.equal(res, null, `expected null for slug ${JSON.stringify(bad)}, got ${JSON.stringify(res)}`);
  });

  await check(`crPackLoad rejects unsafe slug ${JSON.stringify(bad)} without fetching`, async () => {
    const { sandbox, fetched } = makeEnv([]);
    let rejected = false;
    try {
      await sandbox.crPackLoad(bad);
    } catch {
      rejected = true;
    }
    assert.equal(rejected, true, `expected rejection for slug ${JSON.stringify(bad)}`);
    assert.deepEqual(fetched, [], `expected zero fetches for slug ${JSON.stringify(bad)}, got ${JSON.stringify(fetched)}`);
  });
}

await check('valid city slug still resolves and loads from packs/<slug>.json', async () => {
  const { sandbox, fetched } = makeEnv([
    { name: 'Ottawa', slug: 'ottawa-on_1', bbox: packBbox },
  ]);
  const resolved = await sandbox.crPackResolveCity('ottawa', bbox);
  assert.ok(resolved && resolved.slug === 'ottawa-on_1', 'expected valid slug to resolve');
  const els = await sandbox.crPackLoad(resolved.slug);
  assert.equal(Array.isArray(els) && els.length, 1, 'expected pack elements');
  assert.deepEqual(fetched, ['packs/index.json', 'packs/ottawa-on_1.json']);
});

if (failed > 0) process.exit(1);
