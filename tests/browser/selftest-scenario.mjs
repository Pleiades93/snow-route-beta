// Scenario-layer fixtures (Improvement Tranche 4 / T3, 2026-11-08).
// The adjudication of the improvement scan made the T3 pilot valid
// ONLY with negative fixtures: a helper layer that lets a failed
// click, an absent element, a page exception, a timeout or a
// truthy-but-not-true value pass silently would falsify every drive
// migrated onto it. These fixtures run in a real browser (the
// selftest-cleanup mould: launch via the harness, boot the real app)
// and prove the layer in tests/browser/harness.mjs preserves the
// harness's failure semantics EXACTLY:
//   1. failed click - absent element THROWS (the evaluate
//      exceptionDetails path); a disabled element returns non-true
//      and its click handler never runs.
//   2. absent element - expectVisible / expectText return literal
//      false, never a pass, never the element.
//   3. evaluation exception - a throwing page expression surfaces
//      the throw through a helper, message intact; nothing is
//      swallowed into a false-y pass.
//   4. timeout - waitTrue on a never-true condition returns literal
//      false by its timeout path, in bounded time.
//   5. strict boolean - values 1 / 'yes' / ['x'] fed through
//      expectStrict into a drive-shaped ok() (cond === true) record
//      as FAILURES; only literal true records as a pass.
// Plus the positive fixtures: every helper's happy path on the real
// page. A layer that cannot fail is not a layer (the test-change
// rule) - if a fixture here cannot pass without weakening the
// semantics, the layer does not ship.
import { launchDrive, bootThrough, tapById, tapSelector, expectVisible, expectText, expectStrict, markDone, markUndone, waitTrue, waitAbsent, pinDayTheme } from './harness.mjs';

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failures++; };
const thrown = async (p) => { try { await p; return null; } catch (e) { return e; } };

const { proc, ev, poll } = await launchDrive();
try {
  await bootThrough(ev, poll);
  await ev(`(() => { const b = document.createElement('button'); b.id = 't3-live'; b.textContent = 'T3 live'; b.addEventListener('click', () => { window.__t3clicks = (window.__t3clicks || 0) + 1; }); document.body.appendChild(b); const d = document.createElement('button'); d.id = 't3-disabled'; d.disabled = true; d.textContent = 'T3 disabled'; d.addEventListener('click', () => { window.__t3disabled = (window.__t3disabled || 0) + 1; }); document.body.appendChild(d); const v = document.createElement('div'); v.id = 't3-vis'; v.textContent = 'T3 visible text'; document.body.appendChild(v); const h = document.createElement('div'); h.id = 't3-hidden'; h.style.display = 'none'; h.textContent = 'T3 hidden'; document.body.appendChild(h); return true; })()`);

  // ---- positive fixtures: happy paths return literal true / act ----
  check('positive: tapById returns literal true', (await tapById(ev, 't3-live')) === true);
  check('positive: tapById dispatched the click', (await ev(`window.__t3clicks || 0`)) === 1);
  check('positive: tapSelector returns literal true', (await tapSelector(ev, '#t3-live')) === true);
  check('positive: tapSelector dispatched the click', (await ev(`window.__t3clicks || 0`)) === 2);
  check('positive: expectVisible on a visible element is literal true', (await expectVisible(ev, '#t3-vis')) === true);
  check('positive: expectVisible on a display:none element is literal false', (await expectVisible(ev, '#t3-hidden')) === false);
  check('positive: expectText on matching text is literal true', (await expectText(ev, '#t3-vis', 'T3 visible text')) === true);
  check('positive: expectText on different text is literal false', (await expectText(ev, '#t3-vis', 'something else')) === false);
  check('positive: expectStrict returns a literal-true result as true', (await expectStrict(ev, `1 === 1`)) === true);
  check('positive: waitTrue on a true condition is literal true', (await waitTrue(poll, `true`, 3000)) === true);
  check('positive: waitAbsent on the removed splash is literal true', (await waitAbsent(poll, 'splash', 5000)) === true);
  check('positive: pinDayTheme returns literal true', (await pinDayTheme(ev)) === true);
  check('positive: pinDayTheme leaves the app in day mode', (await ev(`isNight()`)) === false);
  check('positive: markDone returns literal true', (await markDone(ev, 'Woolacott', 'tap')) === true);
  check('positive: markDone moved the count to 1-of', String(await ev(`$('count').textContent`)).includes('1 of'));
  check('positive: markUndone returns literal true', (await markUndone(ev, 'Woolacott')) === true);
  check('positive: markUndone moved the count back to 0-of', String(await ev(`$('count').textContent`)).includes('0 of'));

  // ---- fixture 1: failed click ----
  const eAbsent = await thrown(tapById(ev, 't3-no-such-el'));
  check('fixture 1a (failed click, absent): tapById THROWS, never a silent pass', !!eAbsent && /page evaluation threw/.test(eAbsent.message));
  const rDisabled = await tapById(ev, 't3-disabled');
  check('fixture 1b (failed click, disabled): tapById returns non-true (literal false)', rDisabled === false);
  check('fixture 1b (failed click, disabled): the click handler never ran', (await ev(`window.__t3disabled || 0`)) === 0);

  // ---- fixture 2: absent element ----
  check('fixture 2 (absent element): expectVisible returns literal false', (await expectVisible(ev, '#t3-absent')) === false);
  check('fixture 2 (absent element): expectText returns literal false', (await expectText(ev, '#t3-absent', 'anything')) === false);

  // ---- fixture 3: evaluation exception ----
  const eBoom = await thrown(expectStrict(ev, `throw new Error('t3 fixture boom')`));
  check('fixture 3 (evaluation exception): the throw surfaces through the helper', !!eBoom && /page evaluation threw/.test(eBoom.message) && eBoom.message.includes('t3 fixture boom'));
  const eSel = await thrown(expectVisible(ev, '###'));
  check('fixture 3 (evaluation exception): a page-side throw inside expectVisible propagates, not a swallowed false', !!eSel && /page evaluation threw/.test(eSel.message));

  // ---- fixture 4: timeout, bounded ----
  const t0 = Date.now();
  const rTimeout = await waitTrue(poll, `false`, 900);
  const elapsed = Date.now() - t0;
  check('fixture 4 (timeout): waitTrue on a never-true condition returns literal false', rTimeout === false);
  check(`fixture 4 (timeout): the failure arrived by the timeout path in bounded time (${elapsed}ms)`, elapsed >= 800 && elapsed < 8000);

  // ---- fixture 5: strict boolean (drive ok() semantics, verbatim) ----
  const R = { checks: [] };
  const ok = (name, cond) => R.checks.push([name, cond === true]);
  ok('truthy number', await expectStrict(ev, `1`));
  ok('truthy string', await expectStrict(ev, `'yes'`));
  ok('truthy array', await expectStrict(ev, `(['x'])`));
  ok('literal true', await expectStrict(ev, `1 === 1`));
  check('fixture 5 (strict boolean): truthy 1 records as FAILURE under drive ok() semantics', R.checks[0][1] === false);
  check("fixture 5 (strict boolean): truthy 'yes' records as FAILURE under drive ok() semantics", R.checks[1][1] === false);
  check('fixture 5 (strict boolean): truthy array records as FAILURE under drive ok() semantics', R.checks[2][1] === false);
  check('fixture 5 (strict boolean): literal true records as a pass', R.checks[3][1] === true);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
}
console.log(failures === 0 ? 'SCENARIO SELF-TEST: PASS' : `SCENARIO SELF-TEST: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
