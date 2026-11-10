import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive177: Beta 1.152 (NV-recommendation fix round, NV4 + NV3b page level) -
// the writers' array caps were load-optional: a crafted backup or planted
// slot handed load/restore arrays of any size, and the first Finish
// afterwards fed them to trimHistory, which is quadratic (2,000 full entries
// measured at 33 s; 20,000 never returned). 1.152 enforced the caps at
// loadRouteState and inside restore validation (pushField), and capped
// trail-session markers at the trail's own 8000.
// Beta 1.167 REWORK (run/pace fix round, B1): the HISTORY cap is retired at
// every enforcement point (Andrew's unlimited-retention requirement), and
// the quadratic trim it defended against no longer exists - so Phase L/R
// below now prove history is retained WHOLE at load and at restore, while
// the trail/session caps (a storage bound on raw GPS points, unrelated to
// retention) remain exactly as 1.152 left them and are still proven here.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof restoreBackup === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };

const seedOversized = async (n) => {
  await ev(`(() => { const rk = routeKeys('5w');
    const hist = []; for (let i = 0; i < ${n}; i++) hist.push({ at: new Date(1700000000000 + i * 1000).toISOString(), items: { Velmar: null } });
    localStorage.setItem(rk.hist, JSON.stringify(hist));
    const trail = []; for (let i = 0; i < ${n}; i++) trail.push([43.8, -79.4, 1700000000 + (i % 50000)]);
    localStorage.setItem(rk.trail, JSON.stringify(trail));
    const sess = []; for (let i = 0; i < ${n}; i++) sess.push(1700000000 + i);
    localStorage.setItem(rk.sess, JSON.stringify(sess));
    return true; })()`);
};

try {
  // ---- Phase L: oversized slot arrays at load - history whole, trail/sess capped ----
  // bootThrough has already PICKED 5W from the empty profile, and loadRoute
  // no-ops on the already-loaded route - so reload to the menu first (the
  // drive176 pattern), then seed, then pick.
  await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200);
  await seedOversized(20000);
  await ev(`loadRoute('5w'); true`);
  await sleep(1800);
  const L = await J(`({ hist: history.length, firstAt: history.length ? history[0].at : '', trail: trail.length, sess: trailSessions.length })`);
  ok('L1 load retains a 20,000-entry history WHOLE (the 1.167 uncapped store) | ' + JSON.stringify(L), L.hist === 20000);
  ok('L2 the retained history starts at the OLDEST entry (first = entry 0 - nothing evicted)', L.firstAt === new Date(1700000000000).toISOString());
  ok('L3 load caps a 20,000-point trail at TRAIL_MAX 8000', L.trail === 8000);
  ok('L4 load caps 20,000 session markers at 8000', L.sess === 8000);

  // ---- Phase R: backup fields at restore - history stored whole, trail/sess capped ----
  await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200);
  await ev(`(() => { const mk = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return JSON.stringify(a); };
    window.__bk177 = { app: 'snowroute-backup', v: 2, routes: { '5w': {
      hist: mk(500, i => ({ at: new Date(1700000000000 + i * 1000).toISOString(), items: { Velmar: null } })),
      trail: mk(9000, i => [43.8, -79.4, 1700000000 + (i % 50000)]),
      sess: mk(9000, i => 1700000000 + i) } } };
    return true; })()`);
  await ev(`restoreBackup(window.__bk177); true`);
  await sleep(2500); // success path reloads at 600 ms
  await waitBoot(); await sleep(1200);
  const Rr = await J(`(() => { const rk = routeKeys('5w'); const len = k => { const v = localStorage.getItem(rk[k]); return v ? JSON.parse(v).length : -1; };
    return { hist: len('hist'), trail: len('trail'), sess: len('sess') }; })()`);
  ok('R1 the restored history is STORED whole at 500 (restore no longer caps history) | ' + JSON.stringify(Rr), Rr.hist === 500);
  ok('R2 the restored trail is STORED capped at 8000', Rr.trail === 8000);
  ok('R3 the restored session markers are STORED capped at 8000', Rr.sess === 8000);

  // ---- Phase T: CUT (test-suite restructure, 2026-11-09) ----
  // T1 (preloadUrlList() === the frozen 897) and T2 (a worldwide-box pack
  // enumerates bounded, <= 20000) duplicated selftest-nv1152's NV3b, which
  // runs in build-and-test on every run - and proves both claims STRONGER:
  // the 897 in exact order against the fixture, and the worldwide bound in
  // a child process with a timeout (so an unbounded enumeration fails as a
  // timeout instead of hanging this drive). Phases L and R above remain
  // this drive's own: the LOAD and RESTORE retention/cap paths in a real page.
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
