// proof-1236.mjs - Beta 1.236 (fix_id: create-polish-1236).
// Andrew's create-flow polish round (2026-11-18, on live 1.235), five
// pieces. A: the Select City pane is a FLOATING SHEET (his Option 1 from
// the shrink sample) - the pane carries the menu's own blue itself, pulled
// in from every edge of the full-bleed pane it replaces (top edge 62px
// below the viewport top, bottom edge 62px above the viewport bottom,
// sides 8px from the viewport edges, 26px corners, the sample's soft
// shadow), and the menu's background steps aside while it is on stage
// (showRmPane toggles #routeMenu.citySheet at the one choke point), so
// the map shows above and below it. The 1.234 anchors re-derive against
// the sheet: the title rides inside on the sheet's top padding (the
// HUD-line padding retires), the list's bottom bound is the sheet itself
// (the calc margin to the close X retires), and Back stands in the flow
// at the sheet's bottom-left (the tab-bar pin retires). Scope: this pane
// only. B: the intersection results box caps at 34% of the visible
// viewport height (his Option B from the results-box sample) instead of
// running to 16px above the screen's foot, so its last row reads fully
// inside the box, above the create sheet. C: the populate lands in sync -
// on a fresh populate the rows seat first and the card fades in with them
// (.crCardIn, 160ms), and the entrance stagger reaches only the first
// screenful (the first 8 rows by list position, 30ms steps); a row past
// the eighth carries no entrance. D: the search placeholder is Andrew's
// exact wording. E: exitCreate clears the street search field and its
// clear-disc state - the text dies with the session (through 1.235 the
// teardown never emptied the field, so the last typed street sat in the
// bar when a later creation opened). The rendered behaviour of every
// piece is measured in the round's QA (qa-1236.mjs).
// Run from the repo root:  node tests/proof/proof-1236.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const pick = read('parts/create-pick.js');
const app2 = read('parts/app2.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const exitBody = pick.slice(pick.indexOf('function exitCreate() {'), pick.indexOf('function openDoors()'));
const renderBody = pick.slice(pick.indexOf('function crRenderRows(res, cont) {'), pick.indexOf('function crSharesStreet(a, b)'));

// ---------- A: the floating sheet ----------
check('A1: the pane is the sheet - pulled-in height, widened width, inner padding, its own blue, the sample corners and shadow', head.includes('#rmCityListPane { height: calc(100% - 76px); width: calc(100% + 32px); max-width: 640px; padding: 26px 16px 14px; background: linear-gradient(135deg, #3d65ef, #1b2fb6); border-radius: 26px; box-shadow: 0 14px 34px rgba(15,23,64,.35); }'));
check('A2: the sheet blue is the menu blue (the same gradient the menu itself wears)', head.includes('#routeMenu { position: fixed; inset: 0; z-index: 10000; background: linear-gradient(135deg, #3d65ef, #1b2fb6);'));
check('A3: the menu background steps aside under the sheet (the citySheet rule)', head.includes('#routeMenu.citySheet { background: transparent; }'));
check('A4: showRmPane owns the step-aside at the choke point - on for the city list pane, off for every other', app2.includes("$('routeMenu').classList.toggle('citySheet', id === 'rmCityListPane');"));
check('A5: the list flexes inside the sheet and its old close-X margin is gone', head.includes('#rmCityListPane #crCityList { max-height: none; flex: 1 1 auto; min-height: 0; margin-bottom: 0; }') && !head.includes('margin-bottom: calc(58px + var(--sab))'));
check('A6: Back stands in the flow inside the sheet (the tab-bar pin is gone, the 32px row stays)', head.includes('#rmCityListPane #rmCityListBack { height: 32px; }') && !head.includes('#rmCityListPane #rmCityListBack { position: absolute'));
check('A7: the 1.234 HUD-line padding retires with the full-bleed pane', !head.includes('#rmCityListPane { height: 100%; padding-top: calc(25px + var(--sat) - 24px); }'));
check('A8: scope - no other pane gains the sheet (the routes pane and the city step keep their own shapes)', !head.includes('#rmListPane { height: calc(100% - 76px)') && !head.includes('#rmCityPane { height: calc(100% - 76px)') && head.includes('#crCityList, #rmRoutes { max-height: calc(var(--vvh, 100dvh) * .52);'));
check('A9: the close X keeps its fixed bottom-centre seat (it bounds nothing in the sheet, and it did not move)', head.includes('#rmClose, #setClose { position: fixed; left: 50%; bottom: calc(26px + env(safe-area-inset-bottom, 0px));'));

// ---------- B: the shorter box ----------
check('B1: the results box caps at 34% of the visible viewport height', head.includes('max-height: calc(var(--vvh, 100dvh) * .34); overflow-x: hidden; overflow-y: auto;'));
check('B2: the old run-to-the-foot cap is gone', !head.includes('max-height: calc(var(--vvh, 100dvh) - 88px'));

// ---------- C: the synced populate ----------
check('C1: the card landing exists - 160ms, fade plus a 4px settle, on the class the renderer hangs', head.includes('@keyframes crCardIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }') && head.includes('#createResults.crCardIn { animation: crCardIn 160ms ease-out; }'));
check('C2: the card landing rests under reduced motion', head.includes('#createResults.crCardIn { animation: none; }'));
check('C3: the renderer hangs the card landing on fresh populates only, restarted through a reflow after the rows seat', renderBody.includes("if (fresh) { box.classList.remove('crCardIn'); void box.offsetWidth; box.classList.add('crCardIn'); }") && renderBody.indexOf("box.classList.add('crCardIn')") > renderBody.indexOf('place(st.el);'));
check('C4: the stagger gate - only the first 8 rows by list position take an entrance, at 30ms steps', renderBody.includes("if (ei < 8) { el.classList.add('crRowIn'); el.style.animationDelay = (ei * 30) + 'ms'; }") && renderBody.includes("if (ei < 8) { st.el.classList.add('crRowIn'); st.el.style.animationDelay = (ei * 30) + 'ms'; }"));
check('C5: the old all-rows stagger is gone (no 55ms fresh step, no entering-order counter)', !pick.includes('const stagger = fresh ? 55 : 30;') && !pick.includes('enterIdx'));
check('C6: a fresh survivor past the eighth has its stale entrance stripped, so it rests present', renderBody.includes("else { st.el.classList.remove('crRowIn'); st.el.style.animationDelay = ''; }"));
check('C7: the narrowing fade-out keeps its 1.234 fix-1 form (release, reflow, fade)', renderBody.includes("st.el.classList.remove('crRowIn'); void st.el.offsetWidth; st.el.classList.add('crRowOut');") && renderBody.includes('}, 190);'));
check('C8: the freshness rule still yields to a coverage continuation (the 1.234 fix-3 contract)', renderBody.includes('const fresh = !cont && ('));

// ---------- D: the placeholder ----------
check('D1: the placeholder is Andrew\'s exact wording, and the old example is gone', head.includes('placeholder="Select a road or intersection"') && !head.includes('Search an intersection - Weston & Rutherford'));
check('D2: the hint wordings keep their text (only the placeholder changed)', pick.includes("hint: crCity ? 'No crossing found - try two streets, like Weston & Rutherford' : 'Choose a city first, then search an intersection'"));

// ---------- E: the search text dies with the session ----------
check('E1: exitCreate clears the street search field and syncs the clear disc, inside the teardown', exitBody.includes("$('crSearchInput').value = ''; crSyncClear();"));
check('E2: the clear sits with the search teardown (after the sequence bump, before the chrome closes)', exitBody.indexOf("$('crSearchInput').value = '';") > exitBody.indexOf('crSearchSeq++;') && exitBody.indexOf("$('crSearchInput').value = '';") < exitBody.indexOf("document.body.classList.remove('creating');"));
check('E3: the clear-disc path itself is untouched (its listener still empties the field, closes the box and refocuses)', pick.includes("$('crClear').addEventListener('click', () => {") && pick.slice(pick.indexOf("$('crClear').addEventListener('click'"), pick.indexOf("$('crClear').addEventListener('click'") + 500).includes("$('createResults').classList.remove('on'); $('crSearchInput').value = '';") && pick.includes("crSyncClear(); $('crSearchInput').focus();"));

// ---------- V: version agreement ----------
check('V: the #ver label reads Beta 1.237', head.includes('<div class="ver" id="ver">Beta 1.237</div>'));
check('V: WHATSNEW is the Beta 1.237 entry', app4.includes("v: 'Beta 1.237', items:"));
check('V: the CHANGELOG top entry is Beta 1.237', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.237 — 2026-11-18');

console.log(`proof-1236: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
