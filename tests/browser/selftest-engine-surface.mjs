// Phase 6 (C5) test-change gate: the paint engine's surface is FROZEN.
// After the host-adapter conversion, engine.js may touch the app ONLY
// through the host object (GL_HOST, built in app1.js, aliased as H inside
// the engine, passed to GLP.init). This selftest proves it mechanically:
//   1. every app name the engine consumed at the Phase 6 census (the frozen
//      list below) occurs in engine.js ONLY as H.<name> - never as a free
//      read - with the one documented exception of clipPieces' local
//      `pieces` shadow;
//   2. every frozen name is actually read through H at least once (the
//      surface is exactly the census list, no more, no less);
//   3. the host literal in app1.js carries every frozen name;
//   4. the doorway itself is present: `let H = GL_HOST` in engine.js and
//      `function init(gl, host)` as the init signature.
// A future app-side rename that the engine still depends on - or a new
// free read smuggled into the engine - fails the build here instead of
// silently changing what the engine paints.
import { readFileSync } from 'node:fs';

// The frozen census (work/phase6/CENSUS.md, 2026-11-04): 172 free reads
// across these 15 names, zero free writes, grouped (a) data/constants,
// (b) functions called, (c) mutable state read live (via getters).
const FROZEN = [
  'MLAT', 'MLNG', 'MAIN', 'SPOT', 'STRETCH', 'ROADS', 'names',       // (a)
  'jDistM', 'ptSegM', 'isNight', 'glHideLabels',                     // (b)
  'pieces', 'selSet', 'selStretch', 'activeRoute',                   // (c)
];

function strip(src) { // comments + string/template contents -> spaces (offsets preserved)
  let out = '', i = 0, st = 'code'; const tpl = [];
  while (i < src.length) {
    const c = src[i], n = src[i + 1] || '';
    if (st === 'code') {
      if (c === '/' && n === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { st = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { st = 'sq'; out += ' '; i++; continue; }
      if (c === '"') { st = 'dq'; out += ' '; i++; continue; }
      if (c === '`') { st = 'tpl'; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (st === 'line') { if (c === '\n') { st = 'code'; out += '\n'; } else out += ' '; i++; continue; }
    if (st === 'block') { if (c === '*' && n === '/') { st = 'code'; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i++; } continue; }
    if (st === 'sq' || st === 'dq') { const q = st === 'sq' ? "'" : '"'; if (c === '\\') { out += '  '; i += 2; continue; } if (c === q) { st = 'code'; out += ' '; i++; continue; } out += c === '\n' ? '\n' : ' '; i++; continue; }
    if (st === 'tpl') { if (c === '\\') { out += '  '; i += 2; continue; } if (c === '`') { st = 'code'; out += ' '; i++; continue; } if (c === '$' && n === '{') { tpl.push(1); st = 'tplExpr'; out += '  '; i += 2; continue; } out += c === '\n' ? '\n' : ' '; i++; continue; }
    if (st === 'tplExpr') {
      if (c === '{') { tpl[tpl.length - 1]++; out += c; i++; continue; }
      if (c === '}') { tpl[tpl.length - 1]--; out += c; i++; if (tpl[tpl.length - 1] === 0) { tpl.pop(); st = 'tpl'; } continue; }
      if (c === '/' && n === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === "'") { st = 'sq'; out += ' '; i++; continue; }
      if (c === '"') { st = 'dq'; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
  }
  return out;
}

let fail = 0;
const t = (name, cond) => { if (!cond) { fail++; console.log('FAIL', name); } };

const engine = readFileSync(new URL('../../parts/engine.js', import.meta.url), 'utf8');
const app1 = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
const code = strip(engine);

// clipPieces span (the documented local shadow of `pieces`)
const cpStart = code.indexOf('function clipPieces(');
t('clipPieces found', cpStart >= 0);
let cpEnd = -1;
if (cpStart >= 0) { let d = 0, j = code.indexOf('{', cpStart); const s0 = j; while (j < code.length) { if (code[j] === '{') d++; else if (code[j] === '}') { d--; if (!d) { cpEnd = j + 1; break; } } j++; } void s0; }
t('clipPieces span closed', cpEnd > cpStart);

for (const name of FROZEN) {
  const re = new RegExp('(?<![A-Za-z0-9_$])' + name + '(?![A-Za-z0-9_$])', 'g');
  let viaHost = 0, free = [];
  for (const m of code.matchAll(re)) {
    const before = code.slice(Math.max(0, m.index - 2), m.index);
    if (before === 'H.') { viaHost++; continue; }
    if (name === 'pieces' && cpStart >= 0 && m.index >= cpStart && m.index < cpEnd) continue; // the local shadow
    free.push(m.index);
  }
  t(name + ': read through the host at least once', viaHost >= 1);
  t(name + ': zero free reads (found ' + free.length + ')', free.length === 0);
}
t('engine aliases the host', code.includes('let H = GL_HOST'));
t('init takes the host', code.includes('function init(gl, host)'));

// the host literal in app1.js carries every frozen name
const hStart = app1.indexOf('const GL_HOST = {');
t('GL_HOST literal present in app1.js', hStart >= 0);
if (hStart >= 0) {
  let d = 0, j = app1.indexOf('{', hStart); const end = (() => { while (j < app1.length) { if (app1[j] === '{') d++; else if (app1[j] === '}') { d--; if (!d) return j + 1; } j++; } return -1; })();
  const lit = app1.slice(hStart, end);
  for (const name of FROZEN) {
    const present = new RegExp('(^|[{,\\s])' + name + '(\\s*[:,}]|\\s*\\()').test(lit) || lit.includes('get ' + name + '(');
    t('GL_HOST carries ' + name, present);
  }
}
console.log('engine-surface selftest:', fail ? 'FAIL' : 'PASS', '(' + FROZEN.length + ' frozen names)');
process.exit(fail ? 1 : 0);
