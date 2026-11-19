// proof-1241.mjs - Beta 1.241 (fix_id: citylist-1241).
// Andrew's picks from the two Select City sample pages (2026-11-19):
// the list grows to seven cities with the eighth peeking, the peek
// works at both ends, a plain down-arrow stands below the list under
// his exact conditions, and the pane's whole block centres on the
// screen. Four pieces, all scoped to #rmCityListPane:
// (1) CAP: 510px = 7.5 row pitches on the measured 68px pitch - seven
// rows full, the eighth's top 34px cut by the box's bottom edge. The
// content is 816px, so max scroll (306px) is exactly 4.5 pitches: at
// the bottom the last city sits flush and the TOP edge cuts a row in
// half; mid-scroll both edges cut. (The rendered geometry is measured
// in the round's QA - qa-1241 in the round-citylist-1241 work dir.)
// (2) CENTRING: the pane keeps the menu's full height and centres its
// block in it (justify-content on its own flex column); the Beta
// 1.234 HUD-line padding retires with the top flow it served. On a
// short screen the list still flexes and scrolls inside the pane.
// (3) THE ARROW: #crCityArrow, a flex child between the list and
// Back - 20px tall on -8px margins, so the pane's 12px gaps narrow
// to 4px above and below the glyph (28px list-to-Back, chevron dead
// centre, touching neither). The glyph is the rows' own chevron
// ('›', .routeChev) in plain white, rotated a quarter turn down. No
// disc, no button, pointer-events none.
// (4) ONE OWNER: menuListFade (app2.js) seats the arrow from the
// same two quantities as the feather, on the same refreshes - shown
// only at the very top with more below (.hide keeps the seat when
// scrolled, so the centred block never jumps; .gone releases the
// seat when the list fits without scrolling). There is NO up arrow.
// Run from the repo root:  node tests/proof/proof-1241.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app2 = read('parts/app2.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the centred pane ----------
check('1: the pane keeps the full height and centres its block in it', head.includes('#rmCityListPane { height: 100%; justify-content: center; }'));
check('2: the HUD-line padding is retired from the pane rule (no padding form stands)', !head.includes('#rmCityListPane { height: 100%; padding-top:'));
check('3: scope - the centred pane rule stands exactly once', (head.match(/#rmCityListPane \{ height: 100%; justify-content: center; \}/g) || []).length === 1);

// ---------- the cap ----------
check('4: the list caps at 510px (7.5 pitches), grow off, no bottom margin', head.includes('#rmCityListPane #crCityList { max-height: 510px; flex: 0 1 auto; min-height: 0; margin-bottom: 0; }'));
check('5: the six-pitch cap is gone', !head.includes('#rmCityListPane #crCityList { max-height: 408px;'));

// ---------- the arrow: markup ----------
check('6: the arrow element stands between the list and Back, starting seatless', head.includes('<div id="crCityList"></div><div id="crCityArrow" class="gone" aria-hidden="true"><span>&#8250;</span></div><button class="rmBack" id="rmCityListBack">'));
check('7: exactly one arrow element exists', (head.match(/id="crCityArrow"/g) || []).length === 1);

// ---------- the arrow: seat and states ----------
check('8: the seat - 20px tall on -8px margins, flex-centred, never tappable', head.includes('#rmCityListPane #crCityArrow { height: 20px; margin: -8px 0; display: flex; align-items: center; justify-content: center; pointer-events: none;'));
check('9: the glyph - the rows own chevron in plain white, turned a quarter turn down', head.includes('#rmCityListPane #crCityArrow span { display: block; font-size: 22px; line-height: 1; color: #fff; transform: rotate(90deg); }'));
check('10: the scrolled form fades but keeps the seat', head.includes('#rmCityListPane #crCityArrow.hide { opacity: 0; visibility: hidden;'));
check('11: the fits-without-scrolling form takes no seat at all', head.includes('#rmCityListPane #crCityArrow.gone { display: none; }'));
check('12: NO up arrow in any form (no counter-rotated glyph, no second element)', !head.includes('rotate(-90deg)') && !head.includes('crCityArrowUp'));

// ---------- the owner ----------
const fadeBody = app2.slice(app2.indexOf('function menuListFade(el)'), app2.indexOf('function wireRouteRows'));
check('13: menuListFade seats the arrow for the city list only, from the same quantities', fadeBody.includes("if (el.id === 'crCityList')") && fadeBody.includes("a.classList.toggle('gone', !over);") && fadeBody.includes("a.classList.toggle('hide', over && el.scrollTop > 1);"));
check('14: the arrow has exactly one seating call in app2 (no second owner)', (app2.match(/\$\('crCityArrow'\)/g) || []).length === 1);

// ---------- the frame ----------
check('15: Back stands as ever (the 32px flow row, no pin)', head.includes('#rmCityListPane #rmCityListBack { height: 32px; }') && !head.includes('#rmCityListPane #rmCityListBack { position: absolute;'));
check('16: What\'s New carries the 1.241 line', whatsnew.includes('Select City now shows seven cities with the next one peeking - and a small arrow that points the way.'));
check('17: the CHANGELOG top entry is Beta 1.241', changelog.indexOf('## Beta 1.241') > -1 && changelog.indexOf('## Beta 1.241') < changelog.indexOf('## Beta 1.240'));

console.log(`proof-1241: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
