// proof-1244.mjs - Beta 1.244 (fix_id: oneblack-1244).
// ONE TOKEN BLACK (Andrew's ruling, 2026-11-19, from the one-black
// sample he approved): every night black in the create search cluster
// is the ONE token black - the --card token the tab bar wears. The
// Beta 1.242 rim recipe becomes ONE shared definition (a single
// grouped rule) worn by .dockBtn, #crExit and #crSearchWrap at night;
// the dropdown takes the token surface ONLY (no rim, its own shadow
// stands) and its hard-coded blue-black retires. This round also
// corrects the Beta 1.243 scope error: his white-pill order covered
// the create MENU text boxes, not the street search bar over the map -
// the bar's white night face retires, its input ink and its magnifier /
// clear glyphs flip with the theme again (the pre-1.243 forms), and
// the back pill's private 1.224 glass retires. Day faces are
// untouched everywhere. (The rendered medians - pill (32,33,37), bar
// (33,34,38) family, dropdown (31,32,36) over the map, the dock face
// pixel-identical to 1.243 - are measured in the round's QA, qa-1244
// in the round-oneblack-1244 work dir.)
// Run from the repo root:  node tests/proof/proof-1244.mjs
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');
const partsDir = new URL('parts/', root);
const allParts = readdirSync(partsDir).filter(f => f.endsWith('.js') || f.endsWith('.html')).map(f => read('parts/' + f)).join('\n');
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i)); };
const SHARED = 'body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {';
const RECIPE_BG = 'background: linear-gradient(var(--card), var(--card)) padding-box, linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05) 55%, rgba(255,255,255,.02)) border-box;';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the one shared definition ----------
check('1: the shared night rule exists ONCE, grouping all three selectors in one rule',
  head.includes(SHARED) && (head.match(/body\.night \.dockBtn/g) || []).length === 1);
check('2: the shared rule carries the exact rim recipe (token padding-box, fading rim border-box, transparent border, two-layer shadow, light ink)',
  rule(SHARED).includes(RECIPE_BG) && rule(SHARED).includes('color: #f2f4f8;') && rule(SHARED).includes('border: 1px solid transparent;') && rule(SHARED).includes('box-shadow: 0 1px 2px rgba(0,0,0,.45), 0 12px 28px -6px rgba(0,0,0,.55);'));
check('3: no second copy of the recipe background survives anywhere in parts (one home, never copies)',
  (allParts.match(/linear-gradient\(var\(--card\), var\(--card\)\) padding-box/g) || []).length === 1);
check('4: the back pill has NO night rule of its own any more (it wears the shared rule)',
  !head.includes('body.night #crExit {'));
// ---------- the retirements ----------
check('5: the retired 1.224 glass gradient is gone from parts entirely (no surface keeps it)',
  !allParts.includes('rgba(78,81,90,.94)') && !allParts.includes('rgba(43,45,51,.94)'));
check('6: the dropdown hard-coded blue-black is gone from parts entirely',
  !allParts.includes('#1b1e26'));
// ---------- the dropdown: token surface only ----------
check('7: the night dropdown wears the token background, its own shadow standing, no rim layers',
  rule('body.night #createResults {').includes('background: var(--card);') && rule('body.night #createResults {').includes('box-shadow: 0 12px 28px rgba(0,0,0,.5);') && !rule('body.night #createResults {').includes('padding-box'));
// ---------- the bar: day pill stands, night ink + glyphs flip ----------
check('8: the day wrap still wears the 1.243 white pill (day face untouched)',
  rule('\n#crSearchWrap {').includes('background: #fff;') && rule('\n#crSearchWrap {').includes('border: none;') && rule('\n#crSearchWrap {').includes('box-shadow: 0 6px 18px rgba(0,0,0,.18);'));
check('9: the night input ink is light again (the pre-1.243 rules: #fff text, 75% placeholder)',
  head.includes('body.night #crSearchInput { color: #fff; }') && head.includes('body.night #crSearchInput::placeholder { color: rgba(255,255,255,.75); }'));
check('10: the day input ink stands (#14161c, the day placeholder governs the day)',
  rule('#crSearchInput {').includes('color: #14161c;') && head.includes('#crSearchInput::placeholder { color: rgba(17,17,17,.42); }'));
check('11: the magnifier and clear glyphs wear the theme variant again (the 1.232 stamps restored)',
  app4.includes('night ? GLYPH_CREATE.search.n : GLYPH_CREATE.search.d') && app4.includes('night ? GLYPH_CREATE.cancel.n : GLYPH_CREATE.cancel.d'));
check('12: the back arrow keeps its theme variant (it never stopped flipping)',
  app4.includes('night ? GLYPH_CREATE.back.n : GLYPH_CREATE.back.d'));
// ---------- the fences ----------
check('13: the tab bar still wears the token the cluster now shares',
  rule('#tabBar {').includes('background: var(--card);') && head.includes('body.night { --card: rgba(32,33,37,.94);'));
check('14: night Start keeps its float fence and the speed readout keeps its glass (not buttons, not swept in)',
  rule('body.night .runBtn {').includes('box-shadow: var(--shadow-float);') && rule('#spdPill {').includes('background: var(--glass-day);'));
// ---------- the frame ----------
check('16: the CHANGELOG order stands (1.244 above 1.243; the 1.245 entry rides above both - proof-1245 pins the top)',
  changelog.indexOf('## Beta 1.244') > -1 && changelog.indexOf('## Beta 1.244') < changelog.indexOf('## Beta 1.243'));

console.log(`proof-1244: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
