import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('parts/create-pick.js', 'utf8');

function extractFn(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Function not found: ' + name);
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced braces in ' + name);
}

const importDraftSrc = extractFn(src, 'importDraft');
const crStreetPartsSrc = extractFn(src, 'crStreetParts');
// Sweep re-run D-04 fix: crStreetParts now also reads the coverage stamp
// helper beside it - extract it when present so this harness keeps running
// the shipped pair, not a fragment.
const crCovStampSrc = src.includes('function crCovStamp(') ? extractFn(src, 'crCovStamp') : '';

const line = [[43.8, -79.5], [43.801, -79.5], [43.802, -79.5]];

const ctx = vm.createContext({
  Object, Array, Set, JSON, Math,
  MLAT: 111320, MLNG: 80000,
  draft: null,
  crSectorSession: { street: null, snapshot: undefined, collapsed: false, face: 'panel' }, // the D-04 fix's cache read consults the session's snapshot pin; no session in flight here
  crCov: { // the full coverage shape (crCovFromWays): the D-04 stamp reads gen/boxes/byId as well as byName
    gen: 0,
    byName: (() => {
      const m = Object.create(null);
      m['__proto__'] = [{ pts: line }];
      return m;
    })(),
    byId: { 1: { name: '__proto__', pts: line } },
    boxes: [],
    fetchedAt: 0
  },
  newDraft() {
    return {
      roads: Object.create(null),
      mains: new Set(),
      osmNames: Object.create(null),
      sectors: Object.create(null),
      parts: Object.create(null),
      name: '',
      area: '',
      tileNames: []
    };
  },
  normalizePack(raw) {
    const roads = Object.create(null);
    for (const k of Object.keys(raw.roads)) roads[k] = raw.roads[k];
    return { ok: true, pack: { roads, main: [], name: 'Test', area: 'TestCity', tileNames: [] } };
  },
  enterCreate() {},
  toast() {},
  stitchRuns(name, obj) { return obj[name]; },
  distM(a, b) {
    return Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 80000);
  },
  projOnLine(ln, cum, v) {
    for (let i = 0; i < ln.length; i++) {
      const d = Math.hypot((ln[i][0] - v[0]) * 111320, (ln[i][1] - v[1]) * 80000);
      if (d < 0.01) return { off: 0, d: cum[i] };
    }
    return { off: 999, d: 0 };
  },
  finishJunctionCuts(ln, cum, total, cuts) {
    const valid = cuts.filter(c => c > 12 && c < total - 12);
    if (!valid.length) return [ln];
    return [ln.slice(0, 2), ln.slice(1)];
  }
});

vm.runInContext(importDraftSrc + '\n' + crCovStampSrc + '\n' + crStreetPartsSrc, ctx);

const json = '{"roads":{"__proto__":' + JSON.stringify([line]) + ',"Main Street":' + JSON.stringify([line]) + '}}';
ctx.importDraft(json);

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

check('draft.osmNames has null prototype', Object.getPrototypeOf(ctx.draft.osmNames) === null);
check('draft.osmNames has own property __proto__', Object.prototype.hasOwnProperty.call(ctx.draft.osmNames, '__proto__'));
check('Object.values(draft.osmNames) includes __proto__', Object.values(ctx.draft.osmNames).includes('__proto__'));

const rec = ctx.crStreetParts('__proto__');
check('crStreetParts skips own ways for __proto__ (1 uncut part)', rec && rec.parts.length === 1);

if (failures > 0) process.exit(1);
