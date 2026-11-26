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
// Beta 1.243 supersession: the search WRAP leaves the 1.232 family for the
// create text boxes' white pill in both themes - 2a/2b/2e/6c re-pin to the
// pill (white fill, no border, the city shadow, the pill ink in both
// themes, the dark glyph variants stamped in both themes). The back pill,
// the results card and everything else stand.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
// Phase 5 re-pin: app4 reads resolve @@GLYPH tokens from assets/glyphs; payload claims and sha pins unchanged.
const resolveGlyphs = (s) => s.replace(/@@GLYPH:([a-z0-9-]+)@@/g, (m, stem) => readFileSync(new URL('assets/glyphs/' + stem + '.webp', root)).toString('base64'));
const app4 = resolveGlyphs(read('parts/app4.js'));
const pick = read('parts/create-pick.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i) + 1).replace(/\s+/g, ' '); };
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
check('1a: the bar markup is the pill + bar (back button first, magnifier host, input, clear disc) (Beta 1.236 roll: the input\'s placeholder is Andrew\'s shorter wording now - the markup claim is unchanged)',
   head.replace(/\n/g, '').includes('<div id="createBar"><button id="crExit" aria-label="Back"></button><div id="crSearchWrap"><span id="crSearchIco" aria-hidden="true"></span>' +
     '<input id="crSearchInput" type="search" placeholder="Select a road or intersection" autocomplete="off"><button id="crClear" aria-label="Clear search"></button></div></div>'));
check('1b: the Search button survives nowhere in the parts', !head.includes('crSearchBtn') && !app4.includes('crSearchBtn') && !pick.includes('crSearchBtn'));
check('1c: the old x tile is gone (no text-glyph exit, no Exit creating title)', !head.includes('title="Exit creating"') && !head.includes('<button id="crExit" title'));

// ---------- The bar surfaces ----------
check('2a: the bar is white at radius 25 wearing the create pill (Beta 1.243 supersedes the 1.232 mono shadow: white fill, NO border, the city box shadow)', rule('\n#crSearchWrap {').includes('background: #fff;') && rule('\n#crSearchWrap {').includes('border: none;') && rule('\n#crSearchWrap {').includes('border-radius: 25px;') && rule('\n#crSearchWrap {').includes('box-shadow: 0 6px 18px rgba(0,0,0,.18);') && rule('\n#crSearchWrap {').includes('height: 50px;'));
check('2b: at night the bar wears the ONE shared token black (Beta 1.244 supersedes the 1.243 both-themes pill: the grouped rim rule names the wrap, and the retired glass stands nowhere in the stylesheet)', head.includes('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {') && !head.includes('rgba(78,81,90,.94)'));
check('2c: the back pill is a 50px white circle by day', rule('#crExit {').includes('width: 50px; height: 50px;') && rule('#crExit {').includes('border-radius: 50%;') && rule('#crExit {').includes('background: #fff;'));
check('2d: the back pill wears the shared rim recipe at night (Beta 1.244 supersedes the N2 glass: the grouped rule names the pill, it has no standalone night rule, and the glass values stand nowhere)', rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('background: linear-gradient(var(--card), var(--card)) padding-box') && rule('body.night .dockBtn, body.night #crExit, body.night #crSearchWrap {').includes('box-shadow: 0 1px 2px rgba(0,0,0,.45), 0 12px 28px -6px rgba(0,0,0,.55);') && !head.includes('body.night #crExit {') && !head.includes('rgba(43,45,51,.94)'));
check('2e: the input is 16px (the iOS no-zoom floor) with the pill ink by day and LIGHT ink at night (Beta 1.244 supersedes the 1.243 both-themes ink: the pre-1.243 night rules restored)', rule('#crSearchInput {').includes('font-size: 16px;') && rule('#crSearchInput {').includes('color: #14161c;') && head.includes('#crSearchInput::placeholder { color: rgba(17,17,17,.42); }') && head.includes('body.night #crSearchInput { color: #fff; }') && head.includes('body.night #crSearchInput::placeholder { color: rgba(255,255,255,.75); }'));
check('2f: the OS search clear is suppressed so it can never double the bar disc', head.includes('#crSearchInput::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }'));
check('2g: the clear disc exists only in its .on state', rule('#crClear {').includes('display: none;') && rule('#crClear.on {').includes('display: flex;'));

// ---------- The results card ----------
check('3a: the card hangs at the sampled offset (bar top + 62) with the day surface', rule('#createResults {').includes('top: calc(72px + var(--cr-shift)') && rule('#createResults {').includes('background: #fff;') && rule('#createResults {').includes('border-radius: 18px;'));
check('3b: the night card wears the --card token (Beta 1.244 supersedes the 1.227 sample literal: one token black, and the literal stands nowhere in the stylesheet)', rule('body.night #createResults {').includes('background: var(--card);') && !head.includes('#1b1e26'));
check('3c: rows are pin + name (flex, sampled padding and hairlines; Beta 1.233: the area tail retired - pin + name only)', rule('.crResult {').includes('display: flex; align-items: center; gap: 11px;') && rule('.crResult {').includes('padding: 11px 16px;') && rule('.crResult {').includes('border-top: 1px solid #e7e9ee;') && rule('.crResult {').includes('color: #14181f;'));
check('3d: the first row wears the tint in both modes and holds it on press (Beta 1.232: the day tint went neutral with the bar)', rule('.crResult:first-child {').includes('background: #f2f3f5;') && rule('body.night .crResult:first-child {').includes('background: rgba(255,255,255,.06);') && rule('.crResult:first-child:active {').includes('background: #f2f3f5;'));
check('3e: the name is semibold and WRAPS in the rows, and the area tail is gone (Beta 1.233 supersedes the 1.227 split row)', rule('.crName {').includes('font-weight: 600;') && head.includes('white-space: normal; overflow: visible; text-overflow: clip;') && !head.includes('.crArea'));
check('3e2: the pick-list .crName rule cannot leak into the rows (scoped colour + size; Beta 1.233: the wrap rides the same scoped rule)', head.includes('#createResults .crName { color: inherit; font-size: 15.5px; white-space: normal; overflow: visible; text-overflow: clip; }'));
check('3e3: the hint pill is gone entirely - no surface can be painted beneath the results card', !head.includes('#createHint'));
check('3f: the pin host is a bare 17px glyph (no chip)', rule('.crPin img {').includes('width: 17px; height: 17px;'));

// ---------- The press groups ----------
const ruleText = (startFrag) => { const ls = head.split('\n'); const i = ls.findIndex(l => l.includes(startFrag)); if (i < 0) return '';
  let out = ''; for (let k = i; k < ls.length; k++) { out += (out ? ' ' : '') + ls[k].trim(); if (ls[k].includes('}')) break; } return out; };
const transLine = ruleText('.tabItem, .dockBtn, .runBtn,');
const scaleLine = ruleText('.tabItem:active, .dockBtn:active, .runBtn:active,');
check('4a: the clear disc joins the 1.226 press groups and the Search button is out of them', transLine.includes('#crClear') && scaleLine.includes('#crClear:active') && !transLine.includes('#crSearchBtn') && !scaleLine.includes('#crSearchBtn'));
check('4b: the back pill keeps its press shrink', transLine.includes('#crExit') && scaleLine.includes('#crExit:active'));

// ---------- The two-control contract (create-pick) ----------
const exitBlock = pick.slice(pick.indexOf("$('crExit').addEventListener"), pick.indexOf("$('crExit').addEventListener") + 700);
check('5a: the back pill is a pure exit (the discard-guarded exitCreate path, no clearing branch)', exitBlock.includes('askDiscard') && exitBlock.includes('exitCreate()') && !exitBlock.includes("value = ''"));
check('5b: the clear disc clears text + results, syncs itself, and keeps the focus in the input (Beta 1.262: the field emptying runs through the POI teardown crIsectClear, the focus still follows)',
  pick.slice(pick.indexOf("$('crClear').addEventListener('click'"), pick.indexOf("$('crSearchInput').addEventListener('input'")).includes('crResetSearch();') &&
  pick.slice(pick.indexOf("$('crClear').addEventListener('click'"), pick.indexOf("$('crSearchInput').addEventListener('input'")).includes('crIsectClear();') &&
  pick.indexOf('crIsectClear();', pick.indexOf("$('crClear').addEventListener('click'")) > -1 && 
  pick.indexOf("$('crSearchInput').focus();", pick.indexOf("$('crClear').addEventListener('click'")) > pick.indexOf('crIsectClear();', pick.indexOf("$('crClear').addEventListener('click'")));
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
check('6c: renderIcons stamps the bar hosts (Beta 1.244: the magnifier and disc wear the THEME variant again - the bar is dark at night once more; the arrow keeps the theme variant) and re-stamps row pins', app4.includes('GLYPH_CREATE.back.n : GLYPH_CREATE.back.d') && app4.includes('night ? GLYPH_CREATE.search.n : GLYPH_CREATE.search.d') && app4.includes('night ? GLYPH_CREATE.cancel.n : GLYPH_CREATE.cancel.d') && app4.includes("document.querySelectorAll('.crPin').forEach(el => { el.innerHTML = ICONS.pin; });"));


console.log(`proof-1227: ${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
