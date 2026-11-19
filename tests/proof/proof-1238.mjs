// proof-1238.mjs - Beta 1.238 (fix_id: sheet-boot-1238).
// Andrew's report (2026-11-18, two phone screenshots): the Select City
// floating sheet (1.236) floats over the map in tab mode as designed,
// but on a COLD OPEN a flat blue backdrop stood around it, so the sheet
// read as a card laid on the blue menu. The painter was never the menu:
// its step-aside computes no background on the sheet pane in both
// modes. At boot the scene behind the menu is the splash - its blue
// ground (#splashBg) plus the one snow canvas (#snowCv) - and
// showRmPane's snow lifetime rule (Beta 1.159: the snowfall appears
// only on the main pane) carried .away on the canvas for this pane
// too, leaving the ground standing alone; the ground is the menu's own
// gradient, hence the read. The fix is ONE exemption at the choke
// point: while #routeMenu carries .boot (the only state where the
// splash still exists), the Select City pane does not hide the canvas,
// so the sheet floats over the falling snow. The brand layer's .away
// is untouched, the sheet geometry is untouched, tab mode is inert
// (the splash is removed there). Proven by layer isolation and by the
// rendered pixel QA in the round record (qa-1238): hiding #splashBg
// alone reproduced the tab-mode surround pixel-for-pixel on the
// unfixed tree; the boot surround after the fix carries the snowfall.
// Run from the repo root:  node tests/proof/proof-1238.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app2 = read('parts/app2.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the exemption seat ----------
check('1: the canvas toggle carries the boot sheet exemption at the showRmPane choke point', app2.includes("__cv.classList.toggle('away', __away && !(id === 'rmCityListPane' && $('routeMenu').classList.contains('boot')))"));
check('2: the brand layer toggle is UNCHANGED (the title still lives only on the main pane)', app2.includes("__bl.classList.toggle('away', __away);"));
check('3: the citySheet toggle is unchanged (the menu step-aside stands as 1.236 shipped it)', app2.includes("$('routeMenu').classList.toggle('citySheet', id === 'rmCityListPane')"));
check('4: the exemption names ONLY the city list pane (no other pane is exempted)', !app2.includes("id === 'rmCreatePane' && $('routeMenu').classList.contains('boot')") && !app2.includes("id === 'rmCityPane' && $('routeMenu').classList.contains('boot')") && !app2.includes("id === 'rmListPane' && $('routeMenu').classList.contains('boot')"));

// ---------- the sheet itself is untouched ----------
check('5: the sheet rule stands byte-identical to 1.236 (geometry, radius, shadow)', head.includes('#rmCityListPane { height: calc(100% - 76px); width: calc(100% + 32px); max-width: 640px; padding: 26px 16px 14px; background: linear-gradient(135deg, #3d65ef, #1b2fb6); border-radius: 26px; box-shadow: 0 14px 34px rgba(15,23,64,.35); }'));
check('6: the citySheet step-aside rule stands', head.includes('#routeMenu.citySheet { background: transparent; }'));
check('7: the snow canvas .away rule stands (opacity 0 - the exemption is the toggle, not the rule)', head.includes('#snowCv.away { opacity: 0; }'));


console.log(`proof-1238: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
