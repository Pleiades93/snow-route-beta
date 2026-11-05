// Round 103 (CG-103-01) test-change gate fixtures: the history trim decides
// which clean's record survives the 10-entry cap - judging logic, proven here
// in plain Node against written cases BEFORE any CI run consumes it.
// Extracts the SHIPPED isFullRun/trimHistory/trimHistoryForFinish from
// parts/app1.js by balanced-brace extraction and drives them with synthetic
// entries (isFullRun reads STREETNAMES.length; a 34-name stand-in is injected
// through the Function scope, mirroring the route's real street count).
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in app1.js');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
const STREETNAMES = Array.from({ length: 34 }, (_, i) => 'S' + i);
const api = new Function('STREETNAMES',
  extract('isFullRun') + '\n' + extract('trimHistory') + '\n' + extract('trimHistoryForFinish') + '\nreturn { isFullRun, trimHistory, trimHistoryForFinish };')(STREETNAMES);
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const entry = (tag, nItems) => ({ at: 'T' + tag, items: Object.fromEntries(Array.from({ length: nItems }, (_, i) => ['S' + i, null])) });
const full = tag => entry(tag, 34);
const partial = (tag, n) => entry(tag, n || 3);
const tags = list => list.map(h => h.at).join(',');
// ---- trimHistoryForFinish: the incoming entry is NEVER an eviction candidate ----
{ const old = Array.from({ length: 10 }, (_, i) => full(i)); const inc = partial('new');
  const out = api.trimHistoryForFinish(old, inc);
  t('B1 10 full + incoming partial: retained, oldest pre-existing evicted', out.length === 10 && out[9] === inc && tags(out) === 'T1,T2,T3,T4,T5,T6,T7,T8,T9,Tnew'); }
{ const old = Array.from({ length: 10 }, (_, i) => i === 3 ? partial(i) : full(i)); const inc = partial('new');
  const out = api.trimHistoryForFinish(old, inc);
  t('B2 older non-full present: THAT one evicted, incoming retained, oldest full kept', out.length === 10 && out[9] === inc && tags(out) === 'T0,T1,T2,T4,T5,T6,T7,T8,T9,Tnew'); }
{ const old = Array.from({ length: 9 }, (_, i) => full(i)); const inc = partial('new');
  const out = api.trimHistoryForFinish(old, inc);
  t('B3 9 existing + incoming: nothing evicted', out.length === 10 && tags(out) === 'T0,T1,T2,T3,T4,T5,T6,T7,T8,Tnew'); }
{ const old = [full(0), partial(1), full(2)]; const inc = partial('new');
  const out = api.trimHistoryForFinish(old, inc);
  t('B4 short list: plain append', out.length === 4 && out[3] === inc && tags(out) === 'T0,T1,T2,Tnew'); }
{ const old = Array.from({ length: 12 }, (_, i) => full(i)); const inc = partial('new');
  const out = api.trimHistoryForFinish(old, inc);
  t('B5 over-cap existing list: trimmed to 9 pre-existing, incoming retained', out.length === 10 && out[9] === inc && tags(out) === 'T3,T4,T5,T6,T7,T8,T9,T10,T11,Tnew'); }
{ const old = Array.from({ length: 10 }, (_, i) => full(i)); const inc = full('new');
  const out = api.trimHistoryForFinish(old, inc);
  t('B6 incoming full run: retained, oldest evicted', out.length === 10 && out[9] === inc && tags(out).endsWith(',Tnew')); }
{ const old = Array.from({ length: 11 }, (_, i) => (i === 2 || i === 7) ? partial(i) : full(i)); const inc = partial('new');
  const out = api.trimHistoryForFinish(old, inc);
  t('B7 two evictions needed: oldest non-full first, then next non-full', out.length === 10 && out[9] === inc && tags(out) === 'T0,T1,T3,T4,T5,T6,T8,T9,T10,Tnew'); }
{ const old = Array.from({ length: 10 }, (_, i) => full(i)); const inc = partial('new');
  api.trimHistoryForFinish(old, inc);
  t('B8 inputs are not mutated', old.length === 10 && inc.at === 'Tnew'); }
// ---- trimHistory controls: the shared/saveHistory behaviour is UNCHANGED ----
{ const list = Array.from({ length: 11 }, (_, i) => i === 5 ? partial(i) : full(i));
  const out = api.trimHistory(list);
  t('C1 trimHistory: first non-full evicted over cap', out.length === 10 && tags(out) === 'T0,T1,T2,T3,T4,T6,T7,T8,T9,T10'); }
{ const list = Array.from({ length: 11 }, (_, i) => full(i));
  const out = api.trimHistory(list);
  t('C2 trimHistory: all full -> oldest evicted', out.length === 10 && tags(out) === 'T1,T2,T3,T4,T5,T6,T7,T8,T9,T10'); }
{ const list = Array.from({ length: 10 }, (_, i) => full(i));
  const out = api.trimHistory(list);
  t('C3 trimHistory: at cap -> untouched', out.length === 10 && tags(out) === tags(list)); }
console.log(`history selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
