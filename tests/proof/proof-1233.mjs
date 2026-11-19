// proof-1233.mjs - Beta 1.233 (fix_id: menus-mini-1233).
// Andrew's combined round (2026-11-18): the ruled mini-round, the decided
// blue-menu round, and his same-morning clean-search-rows ask, built as one.
// A: (1) directional street names count in crossing searches - the name-key
// cache builds a stem map beside the exact map (a trailing East/West/North/
// South registers its stem's two key forms), and the matcher consults the
// stems only on an exact miss, so exact names always win and a pair that
// resolves neither way falls back to the network exactly as before. Tier 2:
// when the exact pair names real streets that never touch (Toronto's plain
// Bloor Street vs the Bloor Street East segment at Yonge), the crossing scan
// retries once with each side widened to its directional family.
// (2) The note editor's failure line reads 'Not saved - Storage problem'
// at all four hint sites (the lowercase toast form elsewhere is a different
// line and stands).
// B: the blue menus - every pill exactly 58px (.rmBtn, .quiet, .bkBtn, the
// list rows, the skeleton stand-ins); the 'Currently loaded' badge retired
// for the Glyph disc check at the loaded pill's right edge; the city list
// stretches to end 12px above the bottom-centre X; 30px feathered scroll
// edges shown only on edges hiding content (menuListFade owns the classes);
// Back wears the 'Back To' disc beside its word, Home is 'Home Page', Clear
// is 'Dustpan' (payloads re-pinned in proof-icon-glyph-1221), Settings'
// gear untouched; the About pane loses both credit lines and carries the
// approved condensed description verbatim.
// C: create-search rows show the result's NAME only (crResultName: street
// identity's road, else house number + road, else the display head), the
// grey tail is never built, and the name wraps instead of truncating; the
// ' · near X' label stays inside the name.
// Fix round 1 (PR #113, Codex P2s): crResultName gains the named-place
// branch ahead of the house-number branch - a result with its own name
// (the answer's name field, else the display head) keeps it, so a named
// place carrying a full address block no longer renders as its own
// address and two places at one address stay tellable apart; and the
// loaded route's disc check carries alt="Currently loaded" - the loaded
// state has an accessible name while the words stay off the screen.
// On the Beta 1.232 tree every section fails somewhere: no stem map, the
// period form of the note line, 68px rows, the badge present, no stretch,
// no fade masks, the old Home/Clear faces, the credits standing, and the
// tail built on every row.
//
// Run from the repo root:  node tests/proof/proof-1233.mjs
// Beta 1.234 RE-DERIVATION (the citypane + intersection-search round): B3's
// geometry literals rolled - the pane gained the HUD-line padding and Back
// left the flow, so the list margin is the re-derived calc(58px +
// var(--sab)); the 12px-above-the-X geometry itself is unchanged and is
// pinned with the new literals in proof-1234 (A1/A3/A4). Section C's
// subject (crResultName naming NETWORK rows) left the app with the network
// rows: its checks re-derive to the surviving contract - every row is an
// on-device crossing named by its display name outright, and the label
// machinery is absent (proof-1232 piece 2 holds the same absence). A1, A2,
// B1, B2, B4, B5, B6 stand untouched.
// Beta 1.240 RE-DERIVATION (the list-cap round): B3's subject changes
// again - the list no longer stretches to fill the pane; it caps at
// six row pitches (408px) with grow off, and the calc(58px +
// var(--sab)) margin is retired with the bound it served. B3b rolls
// to the new literals; the new geometry is pinned with them in
// proof-1234 (A3/A4). B3a and B4 stand untouched.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const pick = read('parts/create-pick.js');
const app2 = read('parts/app2.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');
const sha = b => createHash('sha256').update(b).digest('hex');
const payload = (table, key) => {
  const blk = app4.slice(app4.indexOf('const ' + table + ' = {'));
  const m = new RegExp(key + ": 'data:image/webp;base64,([A-Za-z0-9+/=]+)'").exec(blk);
  return m ? m[1] : '';
};

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- A1: directional stems ----------
check('A1a: the stem map is built in the one stamp-keyed cache pass', pick.includes('const map = new Map(), stem = new Map();') && pick.includes('crNameKeysCache = { stamp, map, stem };'));
check('A1b: only a trailing directional on a 3+ token name makes a stem', pick.includes("const CR_DIR_TOKENS = ['east', 'west', 'north', 'south'];") && pick.includes('toks.length > 2 && CR_DIR_TOKENS.includes('));
check('A1c: the stem registers under both of its key forms', pick.includes('const stemName = toks.slice(0, -1).join(\' \');') && pick.includes('for (const k of [crNameKey(stemName), crNameKey(shortStreetName(stemName))]) put(stem, k, nm);'));
check('A1d: exact names win - the stem map is consulted only on an exact miss', pick.includes('const hit = keys.map.get(key) || keys.stem.get(key);'));
check('A1e: the widening lives in the matcher (its only caller is the intersection item)', pick.includes('function crMatchStreetName(part)') && (pick.match(/crMatchStreetName\(/g) || []).length === 3);
check('A1f: tier 2 - the family is exact names plus directional kin, exact first', pick.includes('function crStreetFamily(part)') && pick.includes('for (const src of [keys.map.get(key), keys.stem.get(key)]) if (src) for (const n of src) if (!out.includes(n)) out.push(n);'));
check('A1g: tier 2 - the crossing scan retries widened only when the exact pair finds no crossing', pick.includes('let best = scan(As, Bs);') && pick.includes('if (fA.length > As.length || fB.length > Bs.length) best = scan(fA, fB);'));

// ---------- A2: the note line ----------
check('A2a: the note editor line is the ruled form at all four hint sites', (app2.match(/'Not saved - Storage problem'/g) || []).length === 4);
check('A2b: the period form is gone from app2', !app2.includes("'Not saved. Storage problem'"));
check('A2c: the lowercase toast form elsewhere stands untouched', read('parts/app1.js').includes("'Not saved - storage problem'"));

// ---------- B1: 58px pills ----------
check('B1a: the pill class pins exactly 58px', head.includes('font-size: 19px; font-weight: 650; height: 58px; padding: 0 20px;'));
check('B1b: the quiet door joins the one height', head.includes('.rmBtn.quiet { font-size: 16px; font-weight: 600; height: 58px; padding: 0 20px;'));
check('B1c: the Settings sub-pane buttons join the one height', head.includes('.bkBtn { font-size: 16px; height: 58px; padding: 0 16px;'));
check('B1d: the list rows are exactly 58 with the tightened padding', head.includes('justify-content: flex-end; height: 58px; padding: 8px 16px;'));
check('B1e: no menu row keeps the old 68 minimum', !head.includes('min-height: 68px'));
check('B1f: the skeleton stand-ins match the rows at 58', head.includes('.crSkel { height: 58px;'));
check('B1g: the tallest meta still fits - the pair leading is tightened', head.includes('#routeMenu .routeName { font-size: 19px; line-height: 1.08;') && head.includes('#routeMenu .routeArea { font-weight: 500; line-height: 1.12;'));

// ---------- B2: the disc check ----------
check('B2a: the badge build is gone from app2 (no visible loaded text is built; fix round 1: the words survive only as the check alt)', !app2.includes('routeBadge') && !app2.includes('routeNameRow') && !app2.includes("textContent = 'Currently loaded'"));
check('B2b: the loaded row is stamped with the disc check, tab mode only, after Delete', app2.includes("ck.className = 'routeCheck'; ck.alt = 'Currently loaded'; ck.src = GLYPH_MENU.check; b.appendChild(ck);") && app2.indexOf("ck.className = 'routeCheck'") > app2.indexOf('b.appendChild(del);'));
check('B2e (fix round 1): the loaded state has exactly one accessible name - the check alt - and no visible loaded text returns', (app2.match(/ck\.alt = 'Currently loaded';/g) || []).length === 1 && !app2.includes("ck.alt = '';") && !head.includes('Currently loaded'));
check('B2c: the badge CSS is gone and the check stands at 25px', !head.includes('.routeBadge') && !head.includes('.routeNameRow') && head.includes('#routeMenu .routeCheck { width: 25px; height: 25px; flex: none; }'));
check('B2d: a loaded created route clears both right-edge controls', head.includes('#routeMenu .routeRow:has(> .routeDel):has(> .routeCheck) .routeMeta { padding-right: 157px; }'));
check('B2e: the check payload is byte-pinned', sha(Buffer.from(payload('GLYPH_MENU', 'check'), 'base64')) === 'a629ee0b2959ea4604e566af0f2def1ffc5aeb18653b2407fc65a4b02ee9c9fb');

// ---------- B3: the city list stretch ----------
check('B3a: the city pane takes the menu full height (Beta 1.239 roll: the 1.236 floating sheet retired - the full-bleed pane restored; the rule now also carries the HUD-line padding - proof-1234 A1 pins the whole rule)', head.includes('#rmCityListPane { height: 100%;'));
check('B3b: the list box is capped, not stretched (Beta 1.240 roll: six row pitches at 408px, grow off, the calc(58px + var(--sab)) margin retired with the stretch - pinned in proof-1234 A4)', head.includes('#rmCityListPane #crCityList { max-height: 408px; flex: 0 1 auto; min-height: 0; margin-bottom: 0; }'));

// ---------- B4: feathered edges ----------
check('B4a: the three mask states stand for both lists (one gradient, mirrored)', head.includes('#crCityList.fadeT, #rmRoutes.fadeT {') && head.includes('#crCityList.fadeB, #rmRoutes.fadeB {') && head.includes('#crCityList.fadeT.fadeB, #rmRoutes.fadeT.fadeB {') && (head.match(/transparent 0, #000 30px/g) || []).length >= 4);
check('B4b: menuListFade toggles from the scroll position alone', app2.includes('function menuListFade(el)') && app2.includes("el.classList.toggle('fadeT', el.scrollTop > 1);") && app2.includes("el.classList.toggle('fadeB', max > 1 && el.scrollTop < max - 1);"));
check('B4c: the updater is wired to scroll, render, pane show and resize', app2.includes("el.addEventListener('scroll', () => menuListFade(el), { passive: true });") && app2.includes('menuListFade($(\'crCityList\')); menuListFade($(\'rmRoutes\'));') && pick.includes('menuListFade(boxEl);'));

// ---------- B5: icon swaps ----------
check('B5a: the Back payload is byte-pinned', sha(Buffer.from(payload('GLYPH_MENU', 'back'), 'base64')) === '6aca616ccc89e3a8261a9607f9588c378fee7c3082dc406d6a2bd1b5afd14d4f');
check('B5b: renderIcons stamps every Back with the disc beside its word', app4.includes("document.querySelectorAll('.rmBack').forEach(el => { el.innerHTML = `<img class=\"rmBackIco\" alt=\"\" src=\"${GLYPH_MENU.back}\"> Back`; });"));
check('B5c: the Back button is a flex row and the glyph stands at 20px', head.includes('display: flex; align-items: center; gap: 8px; }') && head.includes('.rmBackIco { width: 20px; height: 20px; display: block; flex: none; }'));
check('B5d: Settings keeps its gear - the gear payload is the 1.221 cog, byte-for-byte', (() => { const m = /gear: \{ d: 'data:image\/webp;base64,([A-Za-z0-9+/=]+)'/.exec(app4); return !!m && sha(Buffer.from(m[1], 'base64')) === '903ed9f57d1aa48fe28fc1f0d75a3723afe6d966dfd2f3ac56e7ff0a4172691e'; })());

// ---------- B6: About ----------
check('B6a: both credit lines are gone from the pane and the stylesheet', !head.includes('m-credits') && !head.includes('Icons by') && !head.includes('Map data: &copy; OpenStreetMap'));
check('B6b: the approved description stands verbatim', head.includes('Snow Route tracks snow-clearing work route by route. Create a route or pick an existing one, mark streets and each side as you clear them, and see what\'s done and what\'s left at a glance. GPS follow, pace, day and night maps, and offline maps - all stored on your device, no account needed.'));
check('B6c: the old one-liner is gone', !head.includes('Route tracker for driveway snow clearing'));

// ---------- C: clean rows (Beta 1.234 re-derived) ----------
// Through 1.233 the rows were network results named by crResultName. The
// network rows are gone; every row is now an on-device crossing whose
// display name IS the row text - the name-only rule survives in its
// strongest form (there is no address tail anywhere in this search).
check('C1 (Beta 1.234): the row is named by the crossing display name outright - no naming function stands between the data and the row', pick.includes('nameEl.textContent = it.display_name;') && !pick.includes('function crResultName'));
check('C2: the row builds pin + name only - no tail element anywhere', pick.includes('b.append(pin, nameEl);') && !pick.includes('areaEl') && !head.includes('.crArea'));
check('C3: the name wraps in the rows instead of truncating', head.includes('#createResults .crName { color: inherit; font-size: 15.5px; white-space: normal; overflow: visible; text-overflow: clip; }'));
check('C4 (Beta 1.234): the cross-street label is gone with the network rows it labelled', !pick.includes('crNear') && !head.includes('.crNear'));


console.log(`proof-1233: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
