// proof-1242.mjs - Beta 1.242 (fix_id: buttons-1242).
// The black buttons round, four items (Andrew's decisions, 2026-11-18/19):
// (1) NIGHT DOCK BUTTONS - "Bar black, rim light" (row 4 of the
// night-buttons-v2 research sample, his pick 2026-11-18): the night
// face of .dockBtn ONLY wears the tab bar's own black - the --card
// token itself as the padding-box layer, never a copied colour - with
// NO inset highlight line; the depth is a gradient rim fading down the
// border (white 16% top, 5% at 55%, 2% bottom) drawn circle-safe as a
// border-box layer over a transparent border, over the two-layer
// shadow. The 1.224 elevation recipe is superseded for .dockBtn only:
// the create search bar and the back pill keep their own rounds'
// recipes (pinned below as a scope guard). Day .dockBtn, .runBtn in
// both themes and the glass readouts are untouched. (Beta 1.244
// supersedes the scope sentence: Andrew's one-black ruling extends
// the recipe to the back pill and the search bar, from this one
// shared grouped rule - proof-1244 pins the unified form and
// check 4 below re-derives to it.) (The rendered
// pixel comparison - button face vs tab bar face over the same map
// backdrop - is measured in the round's QA, qa-1242 in the
// round-buttons-1242 work dir.)
// (2) POP-UP CUTS: 'Clean in progress' and the plain 'Start cancelled'
// were already removed in Beta 1.221 - these pins make their absence
// permanent checks. The cancel chain's warning variants (unsaved
// trail cleanup, damaged snapshot, save failure) are adjudicated
// keeps and stand. The sector-session hint pill ('Tap sectors to add
// or remove them', Beta 1.127) is cut HERE: while trimming, the hint
// renders silence; the sector bar's own 'Tap sectors to trim it'
// stays - it is the mechanism that made the pill redundant. The GPS
// trio are named keeps and stand.
// (3) HINT WORDING ONLY: 'Tap row to adjust' -> 'Tap a road to adjust
// sectors' (Andrew's exact words). The styling is the original
// .crPSub - he sampled restyles and rejected them all.
// Run from the repo root:  node tests/proof/proof-1242.mjs
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app3 = read('parts/app3.js');
const pick = read('parts/create-pick.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');
const partsDir = new URL('parts/', root);
const allParts = readdirSync(partsDir).filter(f => f.endsWith('.js')).map(f => read('parts/' + f)).join('\n');
const allPartsNoWn = readdirSync(partsDir).filter(f => f.endsWith('.js') && f !== 'whatsnew.js').map(f => read('parts/' + f)).join('\n'); // the What's New editorial may NAME a cut pop-up; history comments may quote retired text - the pins below are on the painting calls, the codebase's own convention (app3's comments quote the cancel texts they adjudicate)
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i)); };

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- (1) the night dock recipe ----------
check('1: the night dock surface is the tab bar token itself over a fading rim (the exact two-layer background; Beta 1.244: the rule is the shared cluster rule - grouped selector, the recipe values byte-identical)',
  rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('background: linear-gradient(var(--card), var(--card)) padding-box, linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.05) 55%, rgba(255,255,255,.02)) border-box;'));
check('2: the rim rides a transparent border and the shadow is the two-layer pair',
  rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('border: 1px solid transparent;') && rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('box-shadow: 0 1px 2px rgba(0,0,0,.45), 0 12px 28px -6px rgba(0,0,0,.55);'));
check('3: NO inset highlight line and NO top-border step in the night rule (the 1.224 recipe is gone from it)',
  !rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('inset') && !rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('border-top-color') && !rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('rgba(78,81,90,.94), rgba(43,45,51,.94)'));
check('4: scope guard, re-derived (Beta 1.244: Andrew\'s one-black ruling EXTENDS the recipe deliberately - the back pill and the search bar wear this same shared rule now; the guard\'s new form: the grouped rule names all three, and the retired glass stands nowhere in the stylesheet)',
  head.includes('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {') && !head.includes('rgba(78,81,90,.94)') && !head.includes('rgba(43,45,51,.94)'));
check('5: the tab bar wears the same token the button now wears (one token, never a copied colour)',
  rule('#tabBar {').includes('background: var(--card);') && head.includes('body.night { --card: rgba(32,33,37,.94);'));
check('6: the day dock face is byte-identical to 1.241 (opaque light gradient, half lift stack, no border)',
  rule('.dockBtn {').includes('background: linear-gradient(145deg, #ffffff, #eceef2);') && rule('.dockBtn {').includes('border: none; box-shadow: 3px 4px 8px rgba(20,30,60,.10), -2px -2px 5px rgba(255,255,255,.35), inset 0 1px 1px rgba(255,255,255,.6), inset 0 -2px 4px rgba(90,100,120,.10);'));
check('7: the fences stand - night Start keeps the float token, the speed readout keeps its glass',
  rule('body.night .runBtn {').includes('box-shadow: var(--shadow-float);') && rule('#spdPill {').includes('background: var(--glass-day);'));

// ---------- (2) the pop-up cuts ----------
check('8: the sector pill is never painted (no part assigns its text to the hint)',
  !allParts.includes("hint.textContent = 'Tap sectors to add or remove them'") && !allParts.includes('hint.textContent = "Tap sectors to add or remove them"'));
check('9: while trimming, the hint renders silence and offers no button (the early return stands)',
  pick.includes("if (crSectorSession.street) { hint.textContent = ''; hint.classList.remove('on'); btn.style.display = 'none'; return; }"));
check('10: the mechanism that made the pill redundant stays - the sector bar still says it',
  pick.includes("'Entire road picked · ' + fmtLenM(rec.total) + '. Tap sectors to trim it'"));
check('11: \'Clean in progress\' stays cut (no part paints it; its recording line stands nowhere in code)',
  !allParts.includes("toast('Clean in progress") && !allPartsNoWn.includes('Clean in progress — recording your route') && !allPartsNoWn.includes('recording your route'));
check('12: the plain \'Start cancelled\' stays cut (no bare call stands)',
  !app3.includes("toast('Start cancelled - clean erased',") && !app3.includes('toast("Start cancelled - clean erased",'));
check('13: the cancel chain\'s adjudicated warning keeps stand verbatim',
  app3.includes("toast('Start cancelled - warning: the cancellation could not be saved; the clean may return on reload', 4200)") && app3.includes('Start cancelled - clean erased (the saved snapshot was damaged'));
check('14: the GPS trio are named keeps and stand untouched',
  app3.includes("toast('Location is off - allow location for this site in your browser settings', 4200)") && app3.includes("toast('GPS signal weak - still trying', 2600)") && app3.includes("toast('This device has no GPS access here', 3000)"));

// ---------- (3) the hint wording ----------
check('15: the hint carries Andrew\'s exact words and the old assignment stands nowhere',
  pick.includes("hint.textContent = 'Tap a road to adjust sectors';") && !allParts.includes("hint.textContent = 'Tap row to adjust'"));
check('16: the hint styling is the original .crPSub (13px, the dim ink token) - wording only, no restyle',
  head.includes('.crPSub { font-size: 13px; color: var(--ink-dim); }'));

// ---------- the frame ----------
check('17: What\'s New carries the current entry\'s bullet (rolled to 1.251: this check tracks the CURRENT entry each round; and stays em-dash free)',
  whatsnew.includes('Under the hood: start, cancel, finish and route switches now run through one owner, in one set order.') && !whatsnew.includes('—'));
check('18: the CHANGELOG order stands (1.242 above 1.241; the 1.244 entry rides above both - proof-1244 pins the top)', changelog.indexOf('## Beta 1.242') > -1 && changelog.indexOf('## Beta 1.242') < changelog.indexOf('## Beta 1.241'));

console.log(`proof-1242: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
