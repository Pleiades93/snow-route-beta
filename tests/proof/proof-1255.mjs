// proof-1255.mjs - Beta 1.255 (fix_id: audit-r6-confirm).
// O-03: CANCEL START ASKS FIRST (Andrew's decision 2026-11-19,
// variant A from the measured cancel-confirm samples). The Pace
// sheet's Cancel start discarded the run in one tap through 1.254;
// the tap now opens THE shared confirmation surface (showConfirm /
// #confirmPill - one reusable surface, not a fourth one-off confirm
// pattern) and the discard runs only from its danger button, through
// the existing cancelStart path unchanged. The pill wears the
// selection pill's measured faces and box in both themes. On the
// Beta 1.254 tree every mechanism check fails. Behaviour is graded
// by drive210 in the real app.
// Run from the repo root:  node tests/proof/proof-1255.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app3 = read('parts/app3.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const slice = (src, from, to) => { const a = src.indexOf(from); const b = a < 0 ? -1 : src.indexOf(to, a); return a < 0 || b < 0 ? '' : src.slice(a, b); };

// ---------- the surface exists, wearing the pill's faces ----------
check('1: the confirm pill markup is in the page (pill, Keep and Danger buttons)',
  head.includes('id="confirmPill"') && head.includes('id="cfKeep"') && head.includes('id="cfDanger"'));
const pillCss = slice(head, '#confirmPill {', '}');
check('2: the pill wears the selection pill\'s box (262px, 16px radius, centred, day face white)',
  pillCss.includes('width: min(262px, 92vw)') && pillCss.includes('border-radius: 16px')
  && pillCss.includes('transform: translate(-50%, -50%)') && pillCss.includes('background: #ffffff'));
check('3: the night face is the selection pill\'s night face',
  slice(head, 'body.night #confirmPill {', '}').includes('background: rgba(20,21,27,.97)'));
check('4: the danger button wears the app\'s destructive red; the row stands at the pill action geometry',
  slice(head, '#confirmPill #cfDanger {', '}').includes('background: #e63a2e')
  && slice(head, '#confirmPill .cfRow button {', '}').includes('height: 42px'));

// ---------- the shared surface and its wiring ----------
check('5: showConfirm / hideConfirm are the one shared surface, and the danger button runs only the stored callback, after hiding',
  app3.includes('function showConfirm(o)') && app3.includes('function hideConfirm()')
  && app3.includes('const f = confirmDangerCb; hideConfirm(); if (f) f();')
  && app3.includes("$('cfKeep').addEventListener('click', hideConfirm);"));
const paceLine = slice(app3, "const c = $('paceCancel');", '\n');
const askBody = slice(app3, 'function askCancelStart()', '\n');
check('6: both Cancel start entry points route through the one ask, which carries Andrew\'s copy and the unchanged discard path',
  paceLine.includes('askCancelStart()')
  && app3.includes("$('cancelStartBtn').addEventListener('click', () => { if (!tapGuard('cancelStartBtn')) return; askCancelStart(); });")
  && askBody.includes("title: 'Cancel this run?'") && askBody.includes("sub: 'All progress will be lost.'")
  && askBody.includes("keep: 'Keep going'") && askBody.includes("danger: 'Yes, cancel'")
  && askBody.includes('cancelStart(); closeSheets();'));
check('7: the old one-tap discard listeners are gone (Pace and dock forms)',
  !app3.includes("c.addEventListener('click', () => { cancelStart(); closeSheets(); })")
  && !app3.includes("return; cancelStart(); });"));
// Gate rounds 2-3 (Codex P1 + P2 + P2, all real): the question is bound
// to its route and run, a route switch clears it, the pill is exempt
// from the sheet click-away its buttons bubble through, and the dock's
// second Cancel start button asks too.
const app5 = read('parts/app5.js');
check('10 (gate P1): the ask captures the route and run, and the callback validates both before discarding',
  askBody.includes('const forRoute = activeRoute ? activeRoute.id : null; const forRun = runStart;')
  && askBody.includes('if (runStart === forRun && (activeRoute ? activeRoute.id : null) === forRoute) { cancelStart(); closeSheets(); }'));
check('11 (gate P1): a route switch clears any pending confirmation',
  app5.slice(app5.indexOf('function loadRoute(id) {'), app5.indexOf('function loadRoute(id) {') + 700).includes('hideConfirm();'));
check('12 (gate P2): the sheet click-away handler exempts the confirmation pill',
  app5.includes("!e.target.closest('#confirmPill')"));

// ---------- the release editorial ----------
check('8: the CHANGELOG top entry is Beta 1.255', changelog.includes('## Beta 1.255'));
check('9: What\'s New carries the 1.255 bullet, short and dash-free',
  whatsnew.includes('Where your paint meets a bigger street, it now fades out gently instead of stopping dead.')
  && 'Where your paint meets a bigger street, it now fades out gently instead of stopping dead.'.length <= 108
  && !whatsnew.includes('—'));

console.log(`proof-1255: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
