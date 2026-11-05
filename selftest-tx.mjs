// Phase 4 (C3) test-change gate fixtures: the transaction coordinator decides
// whether a multi-step save committed, rolled back, or degraded - judging logic,
// proven here in plain Node against written cases BEFORE any CI run consumes it.
// Extracts the SHIPPED storeOk/storeFail/txSet/txDel/runTx/finishReconcileAction
// from parts/app1.js by balanced-brace extraction and drives them with FAKE
// storage primitives (the app functions close over lsSet/lsDel/lsGet; the fakes
// are injected through the Function scope, mirroring the app's bool/null contract).
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in app1.js');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
// ---- fake storage: modes per case ----
function makeFake(mode) {
  const m = new Map();
  const lsSet = (k, v) => { if (mode.setThrows) return false; m.set(k, mode.corrupt ? v + 'X' : v); return true; };
  const lsDel = k => { if (mode.delThrows) return false; if (!mode.delLies) m.delete(k); return true; };
  const lsGet = k => m.has(k) ? m.get(k) : null;
  return { m, lsSet, lsDel, lsGet };
}
function build(mode) {
  const f = makeFake(mode);
  const api = new Function('lsSet', 'lsDel', 'lsGet',
    extract('storeOk') + '\n' + extract('storeFail') + '\n' + extract('txSet') + '\n' + extract('txDel') + '\n' + extract('runTx') + '\n' + extract('finishReconcileAction') + '\nreturn { txSet, txDel, runTx, finishReconcileAction };')(f.lsSet, f.lsDel, f.lsGet);
  return { f, api };
}
// ---- txSet / txDel verification semantics ----
{ const { api } = build({}); t('txSet ok when write+readback agree', api.txSet('k', 'v').ok === true); }
{ const { api } = build({ setThrows: true }); const r = api.txSet('k', 'v'); t('txSet fails when the write fails', r.ok === false && r.failedKey === 'k'); }
{ const { api } = build({ corrupt: true }); t('txSet fails when read-back disagrees', api.txSet('k', 'v').ok === false); }
{ const { f, api } = build({}); f.m.set('k', 'v'); t('txDel ok when delete+absence agree', api.txDel('k').ok === true); }
{ const { api } = build({ delThrows: true }); t('txDel fails when the delete fails', api.txDel('k').ok === false); }
{ const { f, api } = build({ delLies: true }); f.m.set('k', 'v'); t('txDel fails when the key survives', api.txDel('k').ok === false); }
// ---- runTx ordering + outcomes ----
function steps(spec, log) { return spec.map(s => ({ name: s[0], write: () => { log.push('w:' + s[0]); return s[1] ? { ok: true, failedKey: null, retryPending: false } : { ok: false, failedKey: s[0], retryPending: true }; }, undo: () => { log.push('u:' + s[0]); return s[2] ? { ok: true, failedKey: null, retryPending: false } : { ok: false, failedKey: s[0], retryPending: true }; } })); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 1, 1]], log)); t('runTx all commit', r.outcome === 'committed' && r.failedStep === null && log.join() === 'w:a,w:b'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 0, 1], ['c', 1, 1]], log)); t('runTx failure at b rolls a back, c never runs', r.outcome === 'rolled-back' && r.failedStep === 'b' && log.join() === 'w:a,w:b,u:a'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 1, 1], ['c', 0, 1]], log)); t('runTx rollback order is reverse', r.outcome === 'rolled-back' && log.join() === 'w:a,w:b,w:c,u:b,u:a'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 1, 0], ['c', 0, 1]], log)); t('runTx an undo failure degrades but later undos still run', r.outcome === 'degraded' && r.failedStep === 'c' && log.join() === 'w:a,w:b,w:c,u:b,u:a'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 0, 1]], log)); t('runTx first-step failure rolls nothing back', r.outcome === 'rolled-back' && r.failedStep === 'a' && log.join() === 'w:a'); }
{ const { api } = build({}); const r = api.runTx([]); t('runTx empty commits', r.outcome === 'committed'); }
// ---- finishReconcileAction truth table ----
{ const { api } = build({}); const A = api.finishReconcileAction;
  t('reconcile: no start -> none', A(0, 111, false) === 'none' && A(0, 111, true) === 'none');
  t('reconcile: no archive -> none', A(111, 0, false) === 'none');
  t('reconcile: different run -> none', A(222, 111, false) === 'none' && A(222, 111, true) === 'none');
  t('reconcile: match + live board -> rollback', A(111, 111, false) === 'rollback');
  t('reconcile: match + empty board -> complete', A(111, 111, true) === 'complete');
  // Round 103 (CG-103-02): the second argument is now the archive entry's
  // dedicated run identity (runId), no longer its startedAt - strictness is
  // the whole fix: a near-miss or a previous run's identity must NEVER match
  // (the <= alternative was rejected in debate - it could delete a legitimate
  // archive mid-run), and an entry carrying no identity matches nothing.
  t('reconcile: near-miss identity -> none (no tolerance)', A(111, 112, false) === 'none' && A(112, 111, true) === 'none');
  t('reconcile: previous run identity vs new start -> none', A(999999, 111, false) === 'none' && A(999999, 111, true) === 'none');
  t('reconcile: entry without identity -> none', A(111, 0, false) === 'none' && A(111, 0, true) === 'none'); }
console.log(`tx selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
