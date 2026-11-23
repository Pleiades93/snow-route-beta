// proof-1257.mjs - Beta 1.257 (fix_id: confirm-backdrop).
// THE CONFIRMATION'S BACKDROP (Andrew's pick from the backdrop ladder
// samples, 2026-11-20 - rung B1). Through 1.256 the shared
// confirmation pill floated scrim-free; over an open sheet it read as
// one thing stacked on another, with nothing pulling the eye to the
// question. The surface now owns ONE full-screen backdrop
// (#confirmBackdrop) wearing the exact sampled pair - background
// rgba(0,0,0,.25) + backdrop-filter blur(3px), no re-tuning - above
// everything else and below the pill (z 1199 under its 1200), shown
// and hidden by showConfirm/hideConfirm (never per call site), and
// fading on the shared motion tokens on its opacity only (the blur
// value never animates). Dismissal stays buttons-only: app5.js's
// sheet click-away exempts the backdrop exactly like the pill, so a
// tap on it does nothing and cannot fall through and close the sheet
// underneath. The 1.255 design point recording the pill as
// deliberately scrim-free is superseded by the pick and gone.
// On the Beta 1.256 tree every mechanism check fails. Behaviour is
// graded by drive212 in the real app (the computed values read back
// from the live element, hit-test stacking, a real backdrop tap,
// both doors, both themes).
// Run from the repo root:  node tests/proof/proof-1257.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app3 = read('parts/app3.js');
const app5 = read('parts/app5.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const slice = (src, from, to) => { const a = src.indexOf(from); const b = a < 0 ? -1 : src.indexOf(to, a); return a < 0 || b < 0 ? '' : src.slice(a, b); };

// ---------- the backdrop exists, wearing the picked pair ----------
check('1: the backdrop markup is in the page, beside the pill it serves',
  head.includes('id="confirmBackdrop"') && head.includes('id="confirmPill"'));
const bdCss = slice(head, '#confirmBackdrop {', '}');
check('2: the backdrop wears the sampled pair exactly (dim rgba(0,0,0,.25), blur 3px, the app\'s prefixed pair), below the pill',
  bdCss.includes('background: rgba(0,0,0,.25)') && bdCss.includes('-webkit-backdrop-filter: blur(3px)')
  && bdCss.includes('backdrop-filter: blur(3px)') && bdCss.includes('z-index: 1199')
  && slice(head, '#confirmPill {', '}').includes('z-index: 1200'));
const bdTrans = (bdCss.split('transition:')[1] || '').split(';')[0];
check('3: the fade rides the shared tokens on the opacity only - the blur value never animates; the .on state stands fully in',
  bdTrans.includes('opacity var(--anim-dur) var(--ease-close)') && !bdTrans.includes('blur') && !bdTrans.includes('backdrop-filter')
  && slice(head, '#confirmBackdrop.on {', '}').includes('opacity: 1')
  && slice(head, '#confirmBackdrop.on {', '}').includes('visibility: visible'));

// ---------- ownership: the shared surface shows and hides it ----------
check('4: showConfirm raises the backdrop with the pill; hideConfirm takes it down (one owner, no call site adds its own)',
  slice(app3, 'function showConfirm(o)', '}').includes("$('confirmBackdrop').classList.add('on')")
  && slice(app3, 'function hideConfirm()', '}').includes("$('confirmBackdrop').classList.remove('on')"));

// ---------- a tap on the backdrop does nothing ----------
check('5: the sheet click-away exempts the backdrop alongside the pill (no fall-through close, no dismissal)',
  app5.includes("!e.target.closest('#confirmBackdrop')") && app5.includes("!e.target.closest('#confirmPill')"));

// ---------- the superseded design point is gone ----------
check('6: the scrim-free design claims are superseded and removed (the pill comment, the surface comment)',
  !head.includes('the pill floats scrim-free') && !app3.includes('there is no backdrop and no outside-tap dismissal')
  && !app3.includes('centred, no scrim'));

// ---------- the release editorial ----------
check('7: the CHANGELOG top entry is Beta 1.257', changelog.includes('## Beta 1.257'));
check('8: What\'s New carries the 1.257 bullet, short and dash-free',
  whatsnew.includes('Under the hood: one model now measures every saved clean, so its count, time and pace always agree.')
  && 'Under the hood: one model now measures every saved clean, so its count, time and pace always agree.'.length <= 108
  && !whatsnew.includes('—'));

console.log(`proof-1257: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
