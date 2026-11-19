// proof-1238.mjs - Beta 1.238 (fix_id: sheet-boot-1238), RE-DERIVED by
// Beta 1.239 (fix_id: sheet-correction-1239) to guard the restored state.
// What 1.238 was: Andrew's report (2026-11-18, two phone screenshots) -
// the Select City floating sheet (1.236) floated over the map in tab
// mode as designed, but on a COLD OPEN a flat blue backdrop stood
// around it, so the sheet read as a card laid on the blue menu. The
// fix was ONE exemption at the showRmPane choke point: while
// #routeMenu carried .boot, the Select City pane did not hide the snow
// canvas, so the sheet floated over the falling snow.
// What Andrew ruled on 2026-11-18 (19:59 EST, with a photo of the
// sheet's bottom edge): the sheet itself was never his ask - the
// sample he picked from did not render the two-tone bubble it became
// (a different-shaded rounded card carrying the title, the city list
// and Back, sitting ON the blue menu) - and the snow was never wanted
// anywhere except the splash screen and the load screen. Beta 1.239
// reverts BOTH the sheet and the exemption: the pane is the plain
// blue menu again (its three rules restored verbatim from the 1.235
// tree) and the canvas toggle is the plain Beta 1.159 form in every
// mode. This file's claims flip with the revert: it now FAILS if the
// sheet or the exemption returns. The rendered behaviour is measured
// in qa-1239 (the round-sheet-correction work dir): pixels sampled
// where the sheet's edges used to be, in both entry states, read as
// the menu's own blue gradient - no splash, no snow, no second shade.
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

// ---------- the restored choke point ----------
check('1: the canvas toggle is the PLAIN 1.159 form at the showRmPane choke point (no exemption rides on it)', app2.includes("__cv.classList.toggle('away', __away);"));
check('2: the brand layer toggle is UNCHANGED (the title still lives only on the main pane)', app2.includes("__bl.classList.toggle('away', __away);"));
check('3: no step-aside toggle rides the choke point (showRmPane never raises a sheet class)', !app2.includes("classList.toggle('citySheet'"));
check('4: the exemption is absent in every form (no pane is named in a boot condition, no negated away conjunction)', !app2.includes("id === 'rmCityListPane' && $('routeMenu').classList.contains('boot')") && !app2.includes('__away && !('));

// ---------- the restored pane ----------
check('5: the sheet rule is gone and the plain full-bleed pane rule stands (the 1.235 form, restored verbatim in 1.239; Beta 1.241 roll: the block centres in the pane - the HUD-line padding retired, the sheet absences stand)', !head.includes('#rmCityListPane { height: calc(100% - 76px);') && head.includes('#rmCityListPane { height: 100%; justify-content: center; }'));
check('6: the citySheet step-aside rule is gone (the menu background never steps aside for this pane)', !head.includes('#routeMenu.citySheet'));
check('7: the snow canvas .away rule stands (opacity 0 - the lifetime rule is the toggle and the rule, as through 1.235)', head.includes('#snowCv.away { opacity: 0; }'));


console.log(`proof-1238: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
