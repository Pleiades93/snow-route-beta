import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive86: v5.51 audit-5 battery (NEW-01, ISSUE-02 snapshot, NEW-03 legacy)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;
const seedReload = async (obj) => {
  await ev(`(() => { for (const k in ${JSON.stringify(obj)}) localStorage.setItem(k, ${JSON.stringify(obj)}[k]); location.reload(); return true; })()`);
  await sleep(3000);
  await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76: a reload lands on the route menu
};
await sleep(3000);
// T1 NEW-01 success: clear persists across reload
await seedReload({ 'snowroute.5w.v4.trail': '[[43.81,-79.56,1767225600],[43.82,-79.57,1767225700]]' });
let A = JSON.parse(await ev(`(() => JSON.stringify({ tl: trail.length }))()`));
ok('T1 trail seeded (2 pts)', A.tl === 2);
await ev(`(() => { clearTrailAll(); return true; })()`); await sleep(700); // Beta 1.88: the Clear trail button is gone (re-home comes later) - the drives call the clearing itself, which is what the button's second tap did
A = JSON.parse(await ev(`(() => JSON.stringify({ ls: localStorage.getItem('snowroute.5w.v4.trail'), toast: $('toast').textContent }))()`));
ok('T1 clear writes [] to storage', A.ls === '[]');
ok('T1 toast says Trail cleared', A.toast === 'Trail cleared');
await ev(`(() => { location.reload(); return true; })()`); await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600);
A = JSON.parse(await ev(`(() => JSON.stringify({ tl: trail.length }))()`));
ok('T1 clear survives reload (no resurrection)', A.tl === 0);
// T2 NEW-01 failure: honest toast, pending flag, recovery persists
await ev(`(() => { trail.push([43.81,-79.56,1767225600],[43.82,-79.57,1767225700]); saveTrail();
  window.__origSI = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k, v) { if (k === 'snowroute.5w.v4.trail') throw new Error('quota'); return window.__origSI.call(this, k, v); };
  return true; })()`);
await ev(`(() => { clearTrailAll(); return true; })()`); await sleep(700); // Beta 1.88: the Clear trail button is gone (re-home comes later) - the drives call the clearing itself, which is what the button's second tap did
A = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, dirty: trailDirty, ls: localStorage.getItem('snowroute.5w.v4.trail') }))()`));
ok('T2 toast reports the save failure honestly', /saving failed/.test(A.toast));
ok('T2 clear stays pending (trailDirty)', A.dirty === true);
ok('T2 stored trail untouched by failed clear', A.ls !== '[]');
await ev(`(() => { Storage.prototype.setItem = window.__origSI; flushAux(true); return true; })()`); await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ ls: localStorage.getItem('snowroute.5w.v4.trail'), dirty: trailDirty }))()`));
ok('T2 after recovery the pending clear persists', A.ls === '[]' && A.dirty === false);
// T3 NEW-03: legacy import drops inherited names
await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(3000);
const t3org = await ev(`(() => { const o = performance.timeOrigin; $('xText').value = JSON.stringify({ app: 'snowroute-backup', v: 1, data: { 'snowroute.v2': JSON.stringify({ constructor: true, Velmar: true, __proto__: true }) } }); doRestore(); return o; })()`);
await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ ls: localStorage.getItem('snowroute.5w.v2') }))()`));
ok('T3 legacy migration keeps only real streets', A.ls === '["Velmar"]');
// Hardened (Beta 1.15): this read crashed 1.14 attempt 1 - after doRestore's reload the app's state can
// lag the drive's fixed sleep on a slow runner, and the raw JSON.parse(await ev(...)) idiom dies on the
// non-string result. Poll until doneSet exists, then read. Assertions unchanged.
// Diagnostic round (Beta 1.16): the 1.15 wait took the FIRST readable sample, which can be the post-clear
// page (doneSet empty) before doRestore's reload lands - poll until the condition itself holds, and dump
// what was actually seen (stored value + last sample + sample count) into the result either way.
// Reload-wait (Beta 1.117): the poll below can now satisfy its condition on the PRE-reload page - the
// restore has already written storage and loadRoute reads it back at once, so the drive reached T4 while
// doRestore's scheduled reload (600 ms) was still in flight, and T4's evaluate died in the navigating
// page (CI branch attempts 1+2 and a pristine-1.116 local run all crashed at T4's JSON.parse; the app
// behaviour is correct - this is the drive's own race, third hardening of this read). Wait for the
// reload to LAND (timeOrigin changes) before polling state. Assertions unchanged.
let reloadLanded = false;
for (let i = 0; i < 40 && !reloadLanded; i++) { const o = await ev(`(() => performance.timeOrigin)()`).catch(() => null); if (typeof o === 'number' && o !== t3org) reloadLanded = true; else await sleep(200); }
A = {}; let samples = 0;
for (let i = 0; i < 48 && !(A.n === 1 && A.has); i++) {
  const raw = await ev(`(() => { try { if (typeof routeLoaded !== 'undefined' && !routeLoaded && typeof loadRoute === 'function') loadRoute('5w'); return JSON.stringify({ n: doneSet.size, has: doneSet.has('Velmar'), ls: localStorage.getItem('snowroute.5w.v2') }); } catch (e) { return ''; } })()`);
  if (typeof raw === 'string' && raw) { try { A = JSON.parse(raw); samples++; } catch { /* keep waiting */ } }
  if (!(A.n === 1 && A.has)) await sleep(250);
}
R.diagT3 = { samples, last: A, reloadLanded };
ok('T3 after reload doneSet is exactly {Velmar}', A.n === 1 && A.has);
// T4 ISSUE-02: snapshot read failure aborts honestly, nothing written, no throw
A = JSON.parse(await ev(`(() => { window.__origGI = Storage.prototype.getItem;
  Storage.prototype.getItem = function() { throw new Error('denied'); };
  $('xText').value = JSON.stringify({ app: 'snowroute-backup', v: 1, data: { 'snowroute.v2': '["Angie"]' } });
  let threw = false; try { doRestore(); } catch (e) { threw = true; }
  const toast = $('toast').textContent;
  Storage.prototype.getItem = window.__origGI;
  return JSON.stringify({ threw, toast, ls: localStorage.getItem('snowroute.5w.v2') }); })()`));
ok('T4 doRestore does not throw on snapshot failure', A.threw === false);
ok('T4 toast reports the abort honestly', /nothing was changed/.test(A.toast));
ok('T4 current data untouched', A.ls === '["Velmar"]');
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);

