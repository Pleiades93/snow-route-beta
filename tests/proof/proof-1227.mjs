// proof-1227.mjs - Beta 1.227 (fix_id: search-bar-1227).
// The create search becomes ONE blue bar (Andrew's approved samples): a round
// back pill (white by day, the night dock recipe by night - his N2 pick) that
// ONLY goes back, the app-blue bar with the Glyph Neue magnifier, an input
// whose placeholder fits in full, and the set's Cancel disc that ONLY clears
// and only while text is present. No Search button: typing (300 ms debounce)
// and Enter run the same crRunSearch. Results rows are the set's pin (no
// chip) + the display name split at its first comma (name semibold, the
// remainder lighter at the right edge), on the samples' card surfaces.
// Beta 1.232 supersession: the bar's BLUE left with the monochrome package
// (variant A) - the surface pins below (2a, 2b, 2e, 3d, 6c) now pin the
// 1.232 surfaces; everything else in this proof (markup, pill, card
// geometry, press groups, the two-control contract, the glyph payloads)
// stands exactly as 1.227 built it.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app4 = read('parts/app4.js');
const pick = read('parts/create-pick.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i) + 1); };
const sha = (uri) => createHash('sha256').update(Buffer.from(uri.split(',')[1], 'base64')).digest('hex');
const payload = (map, key, side) => {
  const i = app4.indexOf('const ' + map + ' = {'); if (i < 0) return '';
  const blk = app4.slice(i, app4.indexOf('};', i));
  const ki = blk.indexOf(key + ': {'); if (ki < 0) return '';
  const seg = blk.slice(ki, blk.indexOf('}', ki));
  const m = seg.match(new RegExp(side + ": '(data:image/webp;base64,[A-Za-z0-9+/=]+)'"));
  return m ? m[1] : '';
};

// ---------- The bar markup ----------
check('1a: the bar markup is the pill + bar (back button first, magnifier host, input, clear disc) (Beta 1.236 roll: the input\'s placeholder is Andrew\'s shorter wording now - the markup claim is unchanged)', head.includes('<div id="createBar"><button id="crExit" aria-label="Back"></button><div id="crSearchWrap"><span id="crSearchIco" aria-hidden="true"></span><input id="crSearchInput" type="search" placeholder="Select a road or intersection" autocomplete="off"><button id="crClear" aria-label="Clear search"></button></div></div>'));
check('1b: the Search button survives nowhere in the parts', !head.includes('crSearchBtn') && !app4.includes('crSearchBtn') && !pick.includes('crSearchBtn'));
check('1c: the old x tile is gone (no text-glyph exit, no Exit creating title)', !head.includes('title="Exit creating"') && !head.includes('<button id="crExit" title'));

// ---------- The bar surfaces ----------
check('2a: the bar is white at radius 25 with the mono day shadow (Beta 1.232 supersedes the 1.227 blue: variant A - white, hairline border, half-strength Soft Lift)', rule('#crSearchWrap {').includes('background: #fff;') && rule('#crSearchWrap {').includes('border: 1px solid rgba(20,25,40,.08);') && rule('#crSearchWrap {').includes('border-radius: 25px;') && rule('#crSearchWrap {').includes('box-shadow: 3px 4px 8px rgba(20,30,60,.10), -2px -2px 5px rgba(255,255,255,.35), inset 0 1px 1px rgba(255,255,255,.6), inset 0 -2px 4px rgba(90,100,120,.10);') && rule('#crSearchWrap {').includes('height: 50px;'));
check('2b: at night the bar wears the back pill\'s N2 glass (Beta 1.232)', rule('body.night #crSearchWrap {').includes('background: linear-gradient(180deg, rgba(78,81,90,.94), rgba(43,45,51,.94));') && rule('body.night #crSearchWrap {').includes('box-shadow: inset 0 1px 1px rgba(255,255,255,.35), 0 8px 24px rgba(0,0,0,.45);'));
check('2c: the back pill is a 50px white circle by day', rule('#crExit {').includes('width: 50px; height: 50px;') && rule('#crExit {').includes('border-radius: 50%;') && rule('#crExit {').includes('background: #fff;'));
check('2d: the back pill wears the N2 night recipe (top-lit gradient, brightest top border, inset highlight)', rule('body.night #crExit {').includes('background: linear-gradient(180deg, rgba(78,81,90,.94), rgba(43,45,51,.94));') && rule('body.night #crExit {').includes('border-top: 1px solid rgba(255,255,255,.55);') && rule('body.night #crExit {').includes('box-shadow: inset 0 1px 1px rgba(255,255,255,.35), 0 8px 24px rgba(0,0,0,.45);'));
check('2e: the input is 16px (the iOS no-zoom floor) with theme ink (Beta 1.232: dark by day with the mono placeholder, white by night)', rule('#crSearchInput {').includes('font-size: 16px;') && rule('#crSearchInput {').includes('color: #111111;') && head.includes('#crSearchInput::placeholder { color: rgba(17,17,17,.42); }') && head.includes('body.night #crSearchInput { color: #fff; }') && head.includes('body.night #crSearchInput::placeholder { color: rgba(255,255,255,.75); }'));
check('2f: the OS search clear is suppressed so it can never double the bar disc', head.includes('#crSearchInput::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }'));
check('2g: the clear disc exists only in its .on state', rule('#crClear {').includes('display: none;') && rule('#crClear.on {').includes('display: flex;'));

// ---------- The results card ----------
check('3a: the card hangs at the sampled offset (bar top + 62) with the day surface', rule('#createResults {').includes('top: calc(72px + var(--cr-shift)') && rule('#createResults {').includes('background: #fff;') && rule('#createResults {').includes('border-radius: 18px;'));
check('3b: the night card is the night sample literal #1b1e26', rule('body.night #createResults {').includes('background: #1b1e26;'));
check('3c: rows are pin + name (flex, sampled padding and hairlines; Beta 1.233: the area tail retired - pin + name only)', rule('.crResult {').includes('display: flex; align-items: center; gap: 11px;') && rule('.crResult {').includes('padding: 11px 16px;') && rule('.crResult {').includes('border-top: 1px solid #e7e9ee;') && rule('.crResult {').includes('color: #14181f;'));
check('3d: the first row wears the tint in both modes and holds it on press (Beta 1.232: the day tint went neutral with the bar)', rule('.crResult:first-child {').includes('background: #f2f3f5;') && rule('body.night .crResult:first-child {').includes('background: rgba(255,255,255,.06);') && rule('.crResult:first-child:active {').includes('background: #f2f3f5;'));
check('3e: the name is semibold and WRAPS in the rows, and the area tail is gone (Beta 1.233 supersedes the 1.227 split row)', rule('.crName {').includes('font-weight: 600;') && head.includes('white-space: normal; overflow: visible; text-overflow: clip;') && !head.includes('.crArea'));
check('3e2: the pick-list .crName rule cannot leak into the rows (scoped colour + size; Beta 1.233: the wrap rides the same scoped rule)', head.includes('#createResults .crName { color: inherit; font-size: 15.5px; white-space: normal; overflow: visible; text-overflow: clip; }'));
check('3e3: while the results card is open the hint pill is not painted beneath it', head.includes('#createResults.on ~ #createHint { visibility: hidden; }'));
check('3f: the pin host is a bare 17px glyph (no chip)', rule('.crPin img {').includes('width: 17px; height: 17px;'));

// ---------- The press groups ----------
const transLine = head.split('\n').find(l => l.includes('.tabItem, .dockBtn, .runBtn,') && l.includes('transition: transform 150ms ease-out;')) || '';
const scaleLine = head.split('\n').find(l => l.includes('.tabItem:active, .dockBtn:active, .runBtn:active,') && l.includes('transform: scale(.97);')) || '';
check('4a: the clear disc joins the 1.226 press groups and the Search button is out of them', transLine.includes('#crClear') && scaleLine.includes('#crClear:active') && !transLine.includes('#crSearchBtn') && !scaleLine.includes('#crSearchBtn'));
check('4b: the back pill keeps its press shrink', transLine.includes('#crExit') && scaleLine.includes('#crExit:active'));

// ---------- The two-control contract (create-pick) ----------
const exitBlock = pick.slice(pick.indexOf("$('crExit').addEventListener"), pick.indexOf("$('crExit').addEventListener") + 700);
check('5a: the back pill is a pure exit (the discard-guarded exitCreate path, no clearing branch)', exitBlock.includes('askDiscard') && exitBlock.includes('exitCreate()') && !exitBlock.includes("value = ''"));
check('5b: the clear disc clears text + results, syncs itself, and keeps the focus in the input', pick.includes("$('crClear').addEventListener('click'") && pick.includes("crSyncClear(); $('crSearchInput').focus();"));
check('5c: the disc visibility is one function, driven by the input and the stage setter', pick.includes("function crSyncClear() { $('crClear').classList.toggle('on', !!$('crSearchInput').value); }") && pick.includes("if (stage === 'pick') crSyncClear();"));
check('5d: typing runs the same search at a 300 ms debounce; Enter runs it now', pick.includes('crRunSearch(true); }, 300);') && pick.includes("if (e.key === 'Enter') crSearch();"));
check('5e: the rows are named by the crossing display name outright and wear the set pin (Beta 1.234 re-derived: crResultName and the network rows it named are gone - the display name IS the row text)', pick.includes('nameEl.textContent = it.display_name;') && !pick.includes('function crResultName') && pick.includes("pin.className = 'crPin'; pin.innerHTML = ICONS.pin;") && pick.includes("nameEl.className = 'crName'") && !pick.includes('areaEl'));

// ---------- The glyphs ----------
check('6a: GLYPH_CREATE carries search/cancel/back and NO pin (the rows reuse the set pin)', app4.includes('const GLYPH_CREATE = {') && payload('GLYPH_CREATE', 'search', 'd') !== '' && payload('GLYPH_CREATE', 'cancel', 'd') !== '' && payload('GLYPH_CREATE', 'back', 'd') !== '' && !app4.slice(app4.indexOf('const GLYPH_CREATE = {'), app4.indexOf('};', app4.indexOf('const GLYPH_CREATE = {'))).includes('pin:'));
check('6b: the six payloads are byte-pinned (set treatment: alpha fills, lossless WebP 200x200)',
  sha(payload('GLYPH_CREATE', 'search', 'd')) === '07bdd5ecdb9fc3ba24c97ad6d685cf8ca6c0180c6171830b98e3d58ff916a822' &&
  sha(payload('GLYPH_CREATE', 'search', 'n')) === 'eb70b2316224b4a8f55178de3da47a3cd8f8accbbeeacfa8a8d411fb66853bad' &&
  sha(payload('GLYPH_CREATE', 'cancel', 'd')) === '7be05f60394bd2a47f1baf9b57ac9bdaa7753b1c71459865440de9edfeca7379' &&
  sha(payload('GLYPH_CREATE', 'cancel', 'n')) === 'a3c2e27fa54072de020a0e3a0b811afdd6c2c893d738719109f8ea67fe9cc72c' &&
  sha(payload('GLYPH_CREATE', 'back', 'd')) === 'cfbcf0d124b7d315b5a5bed7c217529a6bf50e36d3854ef1737d415ecb381d72' &&
  sha(payload('GLYPH_CREATE', 'back', 'n')) === '3bd81894f992b53e259fa847ce7ba12a9f96289823eb7478a44a82741f9ee293');
check('6c: renderIcons stamps the bar hosts (theme variants throughout since Beta 1.232 - the magnifier and disc follow the theme like the arrow) and re-stamps row pins', app4.includes('GLYPH_CREATE.back.n : GLYPH_CREATE.back.d') && app4.includes('night ? GLYPH_CREATE.search.n : GLYPH_CREATE.search.d') && app4.includes('night ? GLYPH_CREATE.cancel.n : GLYPH_CREATE.cancel.d') && app4.includes("document.querySelectorAll('.crPin').forEach(el => { el.innerHTML = ICONS.pin; });"));


console.log(`proof-1227: ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
