// proof-1234.mjs - Beta 1.234 (fix_id: citypane-isearch-1234).
// Andrew's combined round (2026-11-18, both halves from his morning session
// on live 1.233). A: the Select City pane takes the map's own anchor lines -
// its title pads down by the #hud formula (25px + the safe-area var, less
// the menu's 24px the pane already sits inside) so it lands where the map
// title lands, and its Back pins absolutely so the row's centre sits on the
// bottom tab bar's content centre line (var(--sab) + 27.5px above the
// viewport bottom: the bar's 3px + safe-area bottom padding plus half its
// 49px content; the row is 32px, so its bottom edge sits var(--sab) +
// 11.5px above the viewport bottom, measured from the pane's bottom edge
// 24px up). The list keeps the 1.233 bound exactly (bottom edge 12px above
// the X's top) with the margin re-derived now that Back is out of the flow.
// Scope: the city pane only - the routes list keeps its 52% cap, the other
// panes gain no height rule.
// B: the create STREET search is intersections only, answered on-device.
// The placeholder teaches the form; crRunSearch is synchronous and fetches
// nothing (the one Nominatim URL left in the file is the CITY search's, a
// different search); a fully resolving pair still narrows to exactly its
// crossing (crSearchResolve tries crIntersectionItem first); every other
// query is one live fragment filter - a fragment matches a street as a
// prefix of its full name, its short form, or any word of it, on the pair
// path's normalized keys, closeness-ordered (exact, then shorter names);
// a single fragment renders every matched street's crossings grouped by
// street, along-the-road order (crAlongSorter's principal axis), deduped
// by cross-street name, city-bound like the pair path, capped at 40 rows;
// two fragments filter both sides, either orientation. No match renders
// ONE non-interactive hint row (a div: no button, no pin, no handler) -
// H1 with no city loaded, H2 with one. The results box scrolls under a
// height cap. The network-row machinery the old search fed (crResultName,
// crStreetIdentity, crCollapseResults, crNearCrossName and the .crNear
// styles) is GONE, pinned absent here so it cannot creep back; crInOntario
// stays (the city search still filters with it).
// The populate animation (Andrew, from his approved sample): the render is
// a keyed diff (crRenderRows) - entering rows ride the city search's own
// .crRowIn shape, staggered 55ms on a fresh populate and 30ms on a typing
// re-populate; rows that stop matching fade out (.crRowOut, 180ms) and are
// removed at 190ms; under reduced motion the CSS rests the animation and
// the renderer reads the same media query to remove at once.
// Run from the repo root:  node tests/proof/proof-1234.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const pick = read('parts/create-pick.js');
const citydata = read('parts/create-citydata.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const runSearchBody = pick.slice(pick.indexOf('function crRunSearch(fromTyping, cont) {'), pick.indexOf("document.addEventListener('pointerdown'"));

// ---------- A: the city pane anchors ----------
check('A1 (Beta 1.239 roll: the 1.236 floating sheet retired - the full-bleed pane restored, pinned whole in proof-1236 A1): the pane pads its top by the HUD formula less the menu padding', head.includes('#rmCityListPane { height: 100%; padding-top: calc(25px + var(--sat) - 24px); }'));
check('A2: the anchor it follows stands - the HUD pads its title calc(25px + var(--sat))', head.includes('padding: calc(25px + var(--sat)) calc(12px + var(--sar)) 8px calc(12px + var(--sal));'));
check('A3 (Beta 1.240 roll: the tab-bar pin retired at Andrew\'s word): Back stands in the flow under the capped list (no position in its rule, the 32px row stands)', head.includes('#rmCityListPane #rmCityListBack { height: 32px; }') && !head.includes('#rmCityListPane #rmCityListBack { position: absolute;'));
check('A4 (Beta 1.240 roll: the stretch and the close-X margin retired): the list caps at six row pitches (408px), grow off so a short list hugs its rows, no bottom margin', head.includes('#rmCityListPane #crCityList { max-height: 408px; flex: 0 1 auto; min-height: 0; margin-bottom: 0; }'));
check('A5: scope - the routes list keeps its 52% cap and no other pane gains the full-height rule', head.includes('#crCityList, #rmRoutes { max-height: calc(var(--vvh, 100dvh) * .52);') && !head.includes('#rmListPane { height: 100%') && !head.includes('#rmCityPane { height: 100%'));

// ---------- B: intersections only, on-device ----------
check('B1 (Beta 1.236 roll: the placeholder is Andrew\'s shorter wording now - the intersection example retired)', head.includes('placeholder="Select a road or intersection"') && !head.includes('Search an intersection - Weston & Rutherford'));
check('B2: the street search fetches nothing - crRunSearch is synchronous, its span holds no fetch call and no service URL, and the file\'s one Nominatim URL is the city search\'s', pick.includes('function crRunSearch(fromTyping, cont) {') && !pick.includes('async function crRunSearch') && !runSearchBody.includes('fetch(') && !runSearchBody.includes('nominatim.openstreetmap.org') && (pick.match(/nominatim\.openstreetmap\.org/g) || []).length === 1);
check('B3: the resolve tries the exact pair first and a hit renders as exactly that crossing', pick.includes('const pair = crIntersectionItem(q);') && pick.includes('if (pair) return { items: [pair], streets: new Set([pair.display_name.split(\' & \')[0]]) };') && pick.indexOf('const pair = crIntersectionItem(q);') < pick.indexOf('crFragmentStreetItems(q)'));
check('B4: the fragment matcher - full name, short form, or any word, on the normalized keys, closeness-ordered', pick.includes('function crMatchFragment(frag)') && pick.includes("else if (full.split(' ').some(w => w.startsWith(key))) s = 2;") && pick.includes('scored.sort((a, b) => a.s - b.s || a.len - b.len'));
check('B5: a street\'s crossings are deduped by cross-street name and city-bound like the pair path', pick.includes('function crCrossingRows(name)') && pick.includes('if (seen.has(x.other)) continue;') && (pick.match(/crInBox\(cityBox, x\.pt\[0\], x\.pt\[1\]\)/g) || []).length >= 2);
check('B6: the along-road order is the principal axis of the street\'s own points', pick.includes('function crAlongSorter(name)') && pick.includes('const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);'));
check('B7: the rendered list caps at 40 rows on both fragment paths', pick.includes('if (items.length >= 40) return { items, streets };') && pick.includes('if (out.length >= 40) return out;'));
check('B8: the pair-fragment filter applies to both sides, either orientation', pick.includes('let items = scan(A, new Set(B));') && pick.includes('if (!items.length) items = scan(B, new Set(A));'));
check('B9: both hint wordings stand verbatim, chosen by whether a city is loaded', pick.includes("hint: crCity ? 'No crossing found - try two streets, like Weston & Rutherford' : 'Choose a city first, then search an intersection'"));
check('B10: the hint row is a plain div - no button, no handler in its factory', pick.includes("function crHintRowEl(text) {") && pick.includes("d.className = 'crHintRow'; d.textContent = text; return d;") && !pick.slice(pick.indexOf('function crHintRowEl(text) {'), pick.indexOf('function crResultRowEl(it) {')).includes('addEventListener'));
check('B11 (Beta 1.236 roll: the cap is a proportion now - 34% of the visible viewport height, his Option B)', head.includes('max-height: calc(var(--vvh, 100dvh) * .34); overflow-x: hidden; overflow-y: auto;'));
check('B12: the retired network-row machinery is absent and cannot creep back', !pick.includes('function crResultName') && !pick.includes('function crStreetIdentity') && !pick.includes('function crCollapseResults') && !pick.includes('function crNearCrossName') && !pick.includes('crNear') && !head.includes('.crNear'));
check('B13: crInOntario stays - the city search still filters with it', pick.includes('function crInOntario(it)') && pick.includes('.filter(crIsPlace).filter(crInOntario)'));
check('B14: a crossing pick keeps the picked city as its area (the name step\'s pre-fill cannot blank)', pick.includes("(cur._isect && crCity ? crCity.name : '')")); // fix round 1: the operand rolled it -> cur with the F1 tap-time read; the rule (a crossing pick's area is the picked city) is unchanged
check('B15: Enter still cancels the pending debounce and runs the typed query NOW (the 1.227 form, driving the synchronous search)', pick.includes('function crSearch() { // Enter: cancel any pending debounce and run the typed query NOW') && pick.includes('crRunSearch(false);'));

// ---------- The populate animation ----------
check('N1: entering rows ride the city search\'s own shape; leaving rows fade in place', head.includes('#createResults .crRowIn { animation: crRowIn 260ms var(--ease-open) both; }') && head.includes('#createResults .crRowOut { transition: opacity 180ms ease; opacity: 0; pointer-events: none; }'));
check('N2 (Beta 1.236 roll: the stagger reaches only the first screenful now - the first 8 rows by list position at 30ms steps; the 55ms fresh step and the entering-order counter are gone)', pick.includes("el.style.animationDelay = (ei * 30) + 'ms';") && !pick.includes('const stagger = fresh ? 55 : 30;') && !pick.includes('enterIdx'));
check('N3: the render is a keyed diff - survivors keep their nodes (the row-state map and the shares-a-street continuation rule)', pick.includes('let crRowState = new Map();') && pick.includes('function crSharesStreet(a, b)'));
check('N4: a leaving row is removed just past its fade, and reduced motion removes at once', pick.includes('}, 190);') && pick.includes("matchMedia('(prefers-reduced-motion: reduce)').matches") && head.includes('#createResults .crRowIn { animation: none; }') && head.includes('#createResults .crRowOut { transition: none; }'));
check('N5: the hint row carries its own quiet style in both themes', head.includes('.crHintRow { padding: 11px 16px; font-size: 15.5px; color: rgba(20,24,31,.55); }') && head.includes('body.night .crHintRow { color: rgba(242,244,248,.55); }'));

// ---------- F: fix round 1 (PR #114, Codex P2s 4618470453 + 4618470463) ----------
// F1: a retained row's pick destination refreshes on every render. The row
// text is the reuse key, but crRowState survives exitCreate (which only
// hides the box), so the same crossing name in another city's extract - or
// a different crossing of the same pair within a session - rendered into a
// node whose creation-time click closure still held the FIRST coordinates.
// The row now carries its current item (el._crItem, set at creation,
// refreshed for every retained row in crRenderRows) and the click reads it
// at tap time. The rendered behaviour is measured in the round's QA
// (qa-fix1.mjs): re-render the same display name with new coordinates, tap,
// the fly-to target is the NEW point.
check('F1a: a result row carries its current item from creation', pick.includes('b._crItem = it;'));
check('F1b: every render refreshes a retained row\'s item to the current render\'s', pick.includes('if (st && e.it) st.el._crItem = e.it;'));
check('F1c: the click reads the row\'s current item at tap time, not the creation closure', pick.includes('const cur = b._crItem || it;') && pick.includes('const lat = parseFloat(cur.lat), lon = parseFloat(cur.lon);'));
// F2: a leaving row's entrance animation is released as its exit starts.
// .crRowIn runs fill-mode both, so its final keyframe (opacity 1) kept
// overriding .crRowOut's opacity 0 - narrowed-away rows stayed opaque and
// vanished at the 190ms removal timer. The exit seat removes .crRowIn,
// forces a reflow so the release commits, THEN adds .crRowOut: folded into
// one style update, the two changes cancel the transition before it starts
// and the row jumps straight to invisible (measured). Measured end-to-end
// in qa-fix1.mjs on a LEAVING row's computed opacity mid-fade (the
// original QA measured only a survivor's delay).
check('F2: the exit seat releases the entrance animation, commits it, then starts the fade-out', pick.includes("st.el.classList.remove('crRowIn'); void st.el.offsetWidth; st.el.classList.add('crRowOut');"));

// ---------- R: fix round 3 (PR #114, Codex P2 4619119230) ----------
// A search run before its city's extract finished landing answered against
// the empty or partial coverage and stood stale: only typing and Enter
// invoked crRunSearch, and neither crCovMerge nor the prepare completions
// (which call crRenderHint) re-ran it. crRefreshSearch now re-runs the
// CURRENTLY OPEN search when coverage changes - from crCovMerge as each
// extract folds in, and from crRenderHint's tail (every prepare completion
// renders the hint as it lands coverage; the saved-city fold rebuilds the
// index directly and then renders it). Its guards keep a dismissed search
// dismissed: every closing seat removes the box's 'on' as it bumps the
// sequence, so the refresh requires the box open, the flow live and a
// non-empty query - and it routes through crRunSearch itself (the sequence
// guard), never around it. The render is a continuation (cont): the same
// search's answer arriving, at the 30ms re-populate stagger - pinned here,
// measured end-to-end in the round's rendered QA (qa-fix3.mjs), whose
// search-before-coverage and partial-to-full pins fail on the pre-fix page.
const refreshBody = pick.slice(pick.indexOf('function crRefreshSearch() {'), pick.indexOf('function crSearchResolve(q)'));
check('R1: the coverage refresh exists and is guarded - flow live, box open, non-empty query, then through crRunSearch itself', pick.includes('function crRefreshSearch() {') && refreshBody.includes('if (!creating) return;') && refreshBody.includes("if (!box.classList.contains('on')) return;") && refreshBody.includes("if (!$('crSearchInput').value.trim()) return;") && refreshBody.includes('crRunSearch(false, true);'));
check('R2: crCovMerge re-runs the open search as each extract folds in', citydata.slice(citydata.indexOf('function crCovMerge(elements, box)'), citydata.indexOf('function crResolve(osmName')).includes('crRefreshSearch();'));
check('R3: crRenderHint\'s tail carries the second trigger (the prepare completions and the saved-city fold land coverage through it), exactly one call in the file', (pick.match(/crRefreshSearch\(\);/g) || []).length === 1 && pick.includes('every coverage landing renders this hint as it lands'));
check('R4: a refresh render is a continuation, never a fresh populate - the renderer takes cont and the freshness rule yields to it', pick.includes('function crRenderRows(res, cont)') && pick.includes('const fresh = !cont && (') && pick.includes('crRenderRows(res, cont);'));


console.log(`proof-1234: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
