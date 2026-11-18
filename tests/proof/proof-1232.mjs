// proof-1232.mjs - Beta 1.232 (fix_id: search-1232).
// Andrew's search round (2026-11-17 evening, from approved samples). (1)
// Intersection search resolved ON-DEVICE: a two-street query's crossing is
// computed from the prepared extract (crCov.byName's per-street polylines)
// in create-pick.js - segment intersections plus the app's own 4 m vertex
// junction rule, deduped at 15 m, clustered at 30 m - and rendered as the
// top result; it is computed before the fetch and renders alone when the
// network fails, under the standing sequence guard. (2) Cross-street
// labels: same-name results within 100 m collapse before rendering, and a
// result that IS a street in the extract is labelled by the cross street
// nearest its point (' · near X' inside the name, at the area grey); all
// other rows stay plain. (3) The monochrome bar (variant A): day white +
// the half-strength Soft Lift shadow on bar and back pill, night the bar
// wears the back pill's N2 glass recipe exactly, glyphs theme-variant.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const pick = read('parts/create-pick.js');
const app4 = read('parts/app4.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- Piece 1: the on-device crossing ----------
check('1a: the crossings machinery stands in create-pick (segment cross + projection)', pick.includes('function crSegCrossPt(a, b, c, d)') && pick.includes('function crSegProjM(p, a, b)') && pick.includes('function crCrossingsOf(name)'));
check('1b: a crossing follows the app junction semantics - vertex on the line within 4 m', pick.includes('if (pr.d <= 4) add(e[0], pr.pt);'));
check('1c: one pair\'s points dedupe at 15 m and cluster at 30 m', pick.includes('if (distM(p, pt) <= 15) return;') && pick.includes('crClusterPts(pts, 30)'));
check('1d: a street never crosses itself', pick.includes('if (e[0] === name || seen.has(e[1])) continue;'));
check('1e: the index is lazy and keyed by the extract stamp', pick.includes('function crXIndex()') && pick.includes('crXIndexCache.stamp === stamp') && pick.includes('const stamp = crCovStamp();'));
check('1f: no prepared city, no engagement - both geometry pieces gate on the extract boxes', pick.includes('function crIntersectionItem(q)') && (pick.match(/!crCov\.boxes\.length/g) || []).length >= 2);
check('1g: the two-street parse takes and / & / at / comma forms only', pick.includes("(?:,|&)") && pick.includes('(?:and|at)'));
check('1h: names match on the full name, the short form, or a spelled-out abbreviation (one stamp-keyed key map, not a per-query rescan)', pick.includes('for (const k of [crNameKey(nm), crNameKey(shortStreetName(nm))])') && pick.includes('const hit = crNameKeys().get(key);') && pick.includes("rd: 'road'") && pick.includes("ave: 'avenue'"));
check('1i: the synthetic result carries the two full names and the isect mark', pick.includes("display_name: best.A + ' & ' + best.B") && pick.includes('_isect: true'));
check('1j: the crossing is computed BEFORE the fetch and leads the rendered list', pick.indexOf('const isect = crIntersectionItem(q);') > -1 && pick.indexOf('const isect = crIntersectionItem(q);') < pick.indexOf("let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q='") && pick.includes('renderCrResults(isect ? [isect].concat(results) : results);'));
check('1k: a dead network still renders the crossing, under the sequence guard', pick.includes('if (isect && crSearchCurrent(seq)) renderCrResults([isect]);'));
check('1l: several clusters resolve to the one nearest the map centre', pick.includes('const ctr = (typeof map !== \'undefined\' && map) ? map.getCenter() : null;'));

// ---------- Piece 2: collapse + cross-street labels ----------
check('2a: same-name points within 100 m collapse, first stands', pick.includes('function crCollapseResults(list)') && pick.includes('k.head === head && distM([la, lo], k.pt) <= 100'));
check('2b: the collapse runs on the results before rendering', pick.indexOf('results = crCollapseResults(results);') > -1 && pick.indexOf('results = crCollapseResults(results);') < pick.indexOf('renderCrResults(isect ?'));
check('2c: a row is labelled only when it IS the street (head is the pack name)', pick.includes('if (road && head === road && crCov.byName[road]) nm = road;') && pick.includes('else if (head && crCov.byName[head]) nm = head;'));
check('2d: the label is the crossing nearest the result point, in short form', pick.includes('return best ? shortStreetName(best.other) : null;'));
check('2e: the label rides inside the name as a .crNear span, and never on the intersection row', pick.includes("ns.className = 'crNear'; ns.textContent = ' · near ' + near;") && pick.includes('if (!it._isect) { const near = crNearCrossName(it);'));
check('2f: the .crNear style stands at the area greys in both themes', head.includes('.crNear { font-weight: 400; color: #7a8194; }') && head.includes('body.night .crNear { color: #9aa3b2; }'));

// ---------- Piece 3: the monochrome bar ----------
const SOFT = '3px 4px 8px rgba(20,30,60,.10), -2px -2px 5px rgba(255,255,255,.35), inset 0 1px 1px rgba(255,255,255,.6), inset 0 -2px 4px rgba(90,100,120,.10)';
const wrapLine = head.split('\n').find(l => l.startsWith('#crSearchWrap {')) || '';
const pillLine = head.split('\n').find(l => l.startsWith('#crExit {')) || '';
check('3a: the day bar is white with the hairline border and the Soft Lift shadow', wrapLine.includes('background: #fff;') && wrapLine.includes('border: 1px solid rgba(20,25,40,.08);') && wrapLine.includes('box-shadow: ' + SOFT + ';'));
check('3b: the day back pill wears the same border and shadow', pillLine.includes('border: 1px solid rgba(20,25,40,.08);') && pillLine.includes('box-shadow: ' + SOFT + ';'));
check('3c: no app blue survives in the day bar rule', !wrapLine.includes('#3D65EF') && !wrapLine.includes('#1B2FB6'));
const NIGHT_BG = 'linear-gradient(180deg, rgba(78,81,90,.94), rgba(43,45,51,.94))';
const NIGHT_SH = 'inset 0 1px 1px rgba(255,255,255,.35), 0 8px 24px rgba(0,0,0,.45)';
const wrapNight = head.split('\n').find(l => l.startsWith('body.night #crSearchWrap {')) || '';
const pillNight = head.split('\n').find(l => l.startsWith('body.night #crExit {')) || '';
check('3d: the night bar wears the pill\'s N2 glass recipe exactly (background, top border, shadow)', wrapNight.includes('background: ' + NIGHT_BG + ';') && wrapNight.includes('border-top: 1px solid rgba(255,255,255,.55);') && wrapNight.includes('box-shadow: ' + NIGHT_SH + ';') && pillNight.includes('background: ' + NIGHT_BG + ';') && pillNight.includes('box-shadow: ' + NIGHT_SH + ';'));
check('3e: the input ink follows the theme (dark by day, white by night)', head.includes('color: #111111; background: transparent; }') && head.includes('body.night #crSearchInput { color: #fff; }') && head.includes('#crSearchInput::placeholder { color: rgba(17,17,17,.42); }') && head.includes('body.night #crSearchInput::placeholder { color: rgba(255,255,255,.75); }'));
check('3f: the magnifier and the clear disc wear the theme glyph fill', app4.includes('night ? GLYPH_CREATE.search.n : GLYPH_CREATE.search.d') && app4.includes('night ? GLYPH_CREATE.cancel.n : GLYPH_CREATE.cancel.d'));
check('3g: the first-row tint went neutral and the old blue tint is gone from the page', head.includes('.crResult:first-child { border-top: none; background: #f2f3f5; }') && !head.includes('#f2f5ff'));
check('3h: the bar geometry stands (50px pill and bar, 25px radius)', pillLine.includes('width: 50px; height: 50px;') && wrapLine.includes('height: 50px;') && wrapLine.includes('border-radius: 25px;'));

// ---------- Version agreement ----------
check('V: the #ver label reads Beta 1.232', head.includes('<div class="ver" id="ver">Beta 1.232</div>'));
check('V: WHATSNEW is the Beta 1.232 entry with the three short bullets', app4.includes("v: 'Beta 1.232', items: [\"Type two street names - like Weston and Rutherford - and search jumps to where they cross.\", \"Street results now name the nearest cross street, so same-name streets are easy to tell apart.\", \"The create search bar is black and white now - white by day, dark glass by night.\"]"));
check('V: the CHANGELOG top entry is Beta 1.232', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.232 — 2026-11-18');

console.log(`proof-1232: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
