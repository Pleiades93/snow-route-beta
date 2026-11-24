// proof-1271 - Beta 1.271 (MENUS round, Andrew's six rulings 2026-11-21):
// the route list grows a dropdown (Option D, SMALL) with a live Delete on
// EVERY route; the danger red becomes ONE shared solid (#e63a2e) with the
// forms Andrew kept (tint, ghost, glyph) untouched; the tab-bar Clear and
// the stale-clean question both move onto the shared confirmation pill;
// the GPS suggestion banner is REMOVED whole (its coverage computation
// stands); and the re-centre button's selection-open drop is retired -
// the button holds its seat in every state. These are the static pins;
// the behaviour is proven by drive154/155 (the dropdown), drive188 C
// (coverage without an offer), drive196 T5/F5 (the Clear ask, the last
// bottom bar) and drive128 M13c (the anchored button).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const head = read('parts/head.html');
const app1 = read('parts/app1.js');
const app2 = read('parts/app2.js');
const app3 = read('parts/app3.js');
const app4 = read('parts/app4.js');
const app5 = read('parts/app5.js');
const packs = read('parts/create-packs.js');
const whatsnew = read('parts/whatsnew.js');
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? pass++ : fail++; };

// ---- the one danger solid -------------------------------------------------
check('1a the shared danger solid: ONE rule, every solid wearer, #e63a2e on white',
  head.includes('#confirmPill #cfDanger, #stDel, #stDel:active, #finYes, #crModalYes.danger, #crHintBtn.danger, .routeDrop .dropDel, #pvStartOverBtn { background: #e63a2e; color: #fff; }'));
check('1b the copied second red is retired from the solid wearers (no #c22f24 backgrounds, no stDel tint)',
  !head.includes('#finYes { background: #c22f24') && !head.includes('#crModalYes.danger { background: #c22f24') &&
  !head.includes('#crHintBtn.danger { background: #c22f24') && !head.includes('rgba(230,58,46,.14)'));
check('1c the forms Andrew kept stand: #warn keeps the family red, the .crPDel glyph keeps its tint at the app red',
  head.includes('#warn { display: none; background: #c22f24;') &&
  head.includes('.crPDel { border: none; background: rgba(230,58,46,.10); color: #e63a2e;'));
check('1d Start over is a full button: the create geometry rule stands (its fill comes from the shared solid)',
  head.includes('#pvStartOverBtn { border-radius: 14px; padding: 13px 18px; font-size: 16px; font-weight: 700; }'));

// ---- the route dropdown ----------------------------------------------------
check('2a the dropdown card: size defined ONCE in its custom properties (SMALL: 40px pills, 14px text)',
  head.includes('.routeDrop { --drop-pill: 40px; --drop-fs: 14px; --drop-pad: 6px; --drop-gap: 5px; --drop-rad: 10px;') &&
  head.includes('.routeDrop button { appearance: none; -webkit-appearance: none; border: none; height: var(--drop-pill);'));
check('2b every row renders with its dropdown sibling; the builder and the delegation stand',
  app2.includes('function routeDropEl(p)') &&
  app2.includes('ROUTE_PACKS.flatMap(p => [routeRowEl(p), routeDropEl(p)])') &&
  app2.includes("const del = e.target.closest('.dropDel'); if (del) { askDeleteRoute(del.closest('.routeDrop').dataset.route); return; }") &&
  app2.includes("const load = e.target.closest('.dropLoad'); if (load) { choose(load.closest('.routeDrop').dataset.route); return; }"));
check('2c the in-row Delete is retired (no routeDel anywhere in app2 or the stylesheet rules)',
  !app2.includes('routeDel') && !head.includes('.routeDel {') && !head.includes('.routeRow:has(> .routeDel)'));
check('2d the shipped-route Delete is WIRED, not just drawn (Codex P2, PR #167): the ask opens for every pack, deleteRoute refuses nothing but a missing pack, and a shipped deletion writes the tombstone the boot applies before the created-pack merge',
  // issue #179: the pack-lookup pin is scoped to askDeleteRoute's own body -
  // the identical line also stands in loadRoute, so the whole-file pin could
  // pass on the wrong function.
  app5.slice(app5.indexOf('function askDeleteRoute(id)')).includes('const pack = ROUTE_PACKS.find(p => p.id === id); if (!pack) return;') &&
  app5.includes('const ix = ROUTE_PACKS.findIndex(p => p.id === id); if (ix < 0) return;') &&
  app5.includes("lsSet(SHIPPED_DELETED_KEY, JSON.stringify([...dead, id]))") &&
  packs.includes("const SHIPPED_DELETED_KEY = 'snowroute.v2.shippeddeleted';") &&
  packs.includes('if (shippedDead.includes(ROUTE_PACKS[i].id)) ROUTE_PACKS.splice(i, 1);') &&
  packs.indexOf('shippedDead.includes') < packs.indexOf('mergeUserPacks();') &&
  packs.includes('SHIPPED_PACK_IDS.has(id) || Object.prototype.hasOwnProperty.call(userPackCache, id)') &&
  app4.includes('if (SHIPPED_PACK_IDS.has(id) && !ROUTE_PACKS.some(p => p.id === id)) { deadSkipped.push(id); continue; }') &&
  app4.includes("const dead5 = SHIPPED_PACK_IDS.has('5w') && !pack5; if (dead5) deadSkipped.push('5w');") &&
  app4.includes('if (deadSkipped.includes(rid)) continue; entries.push([routeKeys(rid).finclean, null]);'));

// ---- Clear and stale on the shared confirmation ---------------------------
check('3a the Clear ask stands, bound to its route, running clearAllMarks on the danger seat',
  app3.includes('function askClearAll()') &&
  app3.includes("showConfirm({ title: 'Clear all marks?', sub: 'Every mark, time and coverage on this route will be wiped. The run itself keeps going.', keep: 'Keep marks', danger: 'Clear all', onDanger: () => { if ((activeRoute ? activeRoute.id : null) === forRoute) clearAllMarks(); } })") &&
  app3.includes("$('clearBtn').addEventListener('click', ev => { if (!tapGuard('clearBtn', ev)) return; if (boardHasMarks()) askClearAll(); });"));
check('3b the board predicate is shared: the handler asks only over a marked board, clearAllMarks keeps the same first check',
  app3.includes('function boardHasMarks() { return doneSet.size > 0 || STREETNAMES.some(n => pieces[n].some(v => v !== 0)) || Object.keys(coveredIdx).length > 0; }') &&
  app3.includes('const any = boardHasMarks();'));
check('3c the stale question stands on the pill: Keep going left, Finish it right, the Finish click on the danger seat',
  app3.includes("showConfirm({ title: 'Finish this clean?', sub: 'It started ' + fmtClock(new Date(runStart)) + ', over 12 hours ago.', keep: 'Keep going', danger: 'Finish it', onDanger: () => { if (runStart === forRun) $('resetBtn').click(); } })") &&
  !app3.includes("$('staleYes')") && !app3.includes("$('staleNo')"));

// ---- the suggestion banner is gone; its coverage stands --------------------
check('4a no banner markup, no banner rules: neither #suggest nor #stale exists in the page',
  !head.includes('id="suggest"') && !head.includes('id="stale"') && !head.includes('#suggest {') && !head.includes('#stale {') && !head.includes('.banner {'));
check('4b the offer machinery is gone from app3/app5/app1 (no showSuggest, no queue, no banner handlers or resets)',
  !app3.includes('function showSuggest') && !app3.includes('let sugQueue') && !app3.includes("$('sugYes')") && !app3.includes("$('sugNo')") &&
  !app3.includes('suggested = new Set') && !app5.includes("$('suggest')") && !app5.includes("$('stale')") && !app1.includes('sugQueue'));
check('4c the coverage computation stands: coverFix still fills coveredIdx - and the offer constant (COV_FRAC, the 85% suggestion threshold) retired with the offer',
  app3.includes('function coverFix(ll)') && app3.includes('coveredIdx[n]') && !app1.includes('COV_FRAC') && !app3.includes('COV_FRAC'));

// ---- the re-centre button holds its seat -----------------------------------
check('5a the selection-open drop is retired: no body.selOpen #centreBtn rule, no 267px, renderPanel touches no such class',
  !head.includes('body.selOpen #centreBtn') && !head.includes('267px') && !app2.includes("classList.add('selOpen')") && !app2.includes("classList.remove('selOpen')"));

// ---- the What's New line ----------------------------------------------------

console.log(`proof-1271: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
