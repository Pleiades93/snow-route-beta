import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive171: Beta 1.150 (security-audit fix round, finding
// restore-start-scalar-unvalidated, MEDIUM) - the restore's per-field
// validation table (FIELD_SHAPES, app4) had no 'start' entry, so pushField
// applied only the string-type check and a crafted backup's run-start was
// committed verbatim through the verified write set (both the v2 route loop
// and the v1 legacy loop); the loader then coerced it with
// +lsGet(LS.start) || 0 - no digit, finiteness or range check - although the
// storage contract defines the value as an epoch-ms digit string and the
// same loader range-bounds every other epoch it accepts (946684800..
// 4102444800 s). A tiny value like '1' installed a phantom run whose Cancel
// (journal fallback, no matching snapshot) wiped the route's board, trail
// and coverage. 'night' rode the same unshaped pushField path while its
// writer stores only '0'/'1'. The fix validates both scalars at restore
// (start: /^\d+$/ and inside the loader's epoch-ms band; night: the enum
// '0'/'1') in the shared pushField, so both loops inherit it, and hardens
// the loader to parse LS.start strictly (digit string, finite, in band)
// with any other value read as no run.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const reloadToRoute = async () => { await ev(`location.reload(); true`); await waitBoot(); await sleep(2500); try { await ev(`loadRoute('5w'); true`); } catch (e) {} await sleep(600); };

try {
  // ---- Build a genuine backup with the app's own exporter, then craft it ----
  await ev(`markDone('Velmar', 'd171'); true`); await sleep(300);
  const bkStr = await ev(`buildBackup()`);
  ok('setup: buildBackup() produced a backup string', typeof bkStr === 'string' && bkStr.length > 100);

  // T1: a v2 backup whose run-start is the tiny string '1' must be REFUSED,
  // naming the field - and nothing may be written (no reload, slot untouched).
  const t1 = JSON.parse(await ev(`(() => { const bk = JSON.parse(${JSON.stringify(bkStr)}); bk.routes['5w'].start = '1'; delete bk.routes['5w'].snap;
    window.__d171probe = 1; restoreBackup(bk); return JSON.stringify({ toast: $('toast').textContent }); })()`));
  await sleep(1200); // a wrongful accept would reload at 600 ms and the probe flag would vanish
  const t1b = await J(`({ probe: typeof window.__d171probe !== 'undefined', start: localStorage.getItem(LS.start), done: localStorage.getItem(LS.done) })`);
  ok('T1 crafted start="1" refused with a named bad-value message', /bad value for .*start/i.test(t1.toast || ''));
  ok('T1 refused restore wrote nothing and did not reload', t1b.probe === true && t1b.start === null && JSON.parse(t1b.done || '[]').includes('Velmar'));

  // T2: the v1 legacy loop shares the same pushField - a v1 backup carrying
  // a crafted start under its legacy key is refused the same way.
  const t2 = JSON.parse(await ev(`(() => { const bk = { app: 'snowroute-backup', v: 1, data: { 'snowroute.v5.start': '1' } };
    window.__d171probe = 1; restoreBackup(bk); return JSON.stringify({ toast: $('toast').textContent }); })()`));
  await sleep(1200);
  const t2b = await J(`({ probe: typeof window.__d171probe !== 'undefined', start: localStorage.getItem(LS.start) })`);
  ok('T2 v1-loop crafted start refused with a named message', /bad value for .*start/i.test(t2.toast || ''));
  ok('T2 v1 refusal wrote nothing and did not reload', t2b.probe === true && t2b.start === null);

  // T3: other non-digit / out-of-band starts are refused too ('123abc',
  // 'Infinity', and a digit string below the epoch band).
  for (const bad of ['123abc', 'Infinity', '99999999999']) {
    const t = JSON.parse(await ev(`(() => { const bk = JSON.parse(${JSON.stringify(bkStr)}); bk.routes['5w'].start = ${JSON.stringify(bad)}; delete bk.routes['5w'].snap;
      restoreBackup(bk); return JSON.stringify({ toast: $('toast').textContent }); })()`));
    ok('T3 crafted start=' + JSON.stringify(bad) + ' refused', /bad value for .*start/i.test(t.toast || ''));
  }

  // T4: 'night' is the writer's enum '0'/'1' - a crafted value is refused
  // through the same pushField path; a genuine '1' restores normally.
  // (The app itself persists night='0' at first boot, so the refusal is
  // graded as UNCHANGED, not absent.)
  const nightBefore = await J(`localStorage.getItem(LS_GLOBAL.night)`);
  const t4 = JSON.parse(await ev(`(() => { const bk = { app: 'snowroute-backup', v: 2, routes: {}, night: 'banana' };
    window.__d171probe = 1; restoreBackup(bk); return JSON.stringify({ toast: $('toast').textContent }); })()`));
  await sleep(1200);
  const t4b = await J(`({ probe: typeof window.__d171probe !== 'undefined', night: localStorage.getItem(LS_GLOBAL.night) })`);
  ok('T4 crafted night="banana" refused with a named message', /bad value for night/i.test(t4.toast || ''));
  ok('T4 night refusal wrote nothing and did not reload (night stays ' + JSON.stringify(nightBefore) + ')', t4b.probe === true && t4b.night === nightBefore && t4b.night !== 'banana');
  await ev(`(() => { const bk = { app: 'snowroute-backup', v: 2, routes: {}, night: '1' }; restoreBackup(bk); return true; })()`);
  await sleep(3500); // an accepted restore reloads
  await waitBoot(); await sleep(1500);
  const t4c = await J(`localStorage.getItem(LS_GLOBAL.night)`);
  ok('T4 control: a genuine night="1" backup restores and reloads', t4c === '1');
  await ev(`localStorage.removeItem(LS_GLOBAL.night); true`);

  // T5: the loader layer - a poisoned stored start is read as NO RUN,
  // whatever its shape; a genuine epoch-ms digit string still resumes.
  await bootThrough(ev, poll);
  for (const [seed, want, label] of [['1', 0, 'tiny digit string'], ['Infinity', 0, 'non-finite'], ['123abc', 0, 'non-digit']]) {
    await ev(`localStorage.setItem(LS.start, ${JSON.stringify(seed)}); true`);
    await reloadToRoute();
    const got = await J(`runStart`);
    ok('T5 loader reads stored start ' + label + ' as no run', got === want);
    await ev(`localStorage.removeItem(LS.start); true`);
  }
  const nowMs = Date.now();
  await ev(`localStorage.setItem(LS.start, ${JSON.stringify(String(nowMs))}); true`);
  await reloadToRoute();
  const t5c = await J(`runStart`);
  ok('T5 control: a genuine epoch-ms start still resumes as a run', t5c === nowMs);
  await ev(`localStorage.removeItem(LS.start); true`);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
