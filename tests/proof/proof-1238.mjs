// proof-1238.mjs - guards the Select City pane's plain form.
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
check('1: showRmPane never touches the snow canvas (the step-aside toggle retired, Beta 1.301)', !app2.includes("$('snowCv')"));
check('2: the brand layer toggle is UNCHANGED (the title still lives only on the main pane)', app2.includes("__bl.classList.toggle('away', __away);"));
check('3: no step-aside toggle rides the choke point (showRmPane never raises a sheet class)', !app2.includes("classList.toggle('citySheet'"));
check('4: the exemption is absent in every form (no pane is named in a boot condition, no negated away conjunction)', !app2.includes("id === 'rmCityListPane' && $('routeMenu').classList.contains('boot')") && !app2.includes('__away && !('));

// ---------- the restored pane ----------
check('5: the sheet rule is gone and the plain full-bleed pane rule stands (the 1.235 form, restored verbatim in 1.239; Beta 1.241 roll: the block centres in the pane - the HUD-line padding retired, the sheet absences stand)', !head.includes('#rmCityListPane { height: calc(100% - 76px);') && head.includes('#rmCityListPane { height: 100%; justify-content: center; }'));
check('6: the citySheet step-aside rule is gone (the menu background never steps aside for this pane)', !head.includes('#routeMenu.citySheet'));
check('7: the snow canvas .away rule is GONE (no CSS seat can fade the canvas out, Beta 1.301)', !head.includes('#snowCv.away'));


console.log(`proof-1238: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
