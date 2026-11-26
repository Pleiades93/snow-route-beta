import { readFileSync } from 'node:fs';

// Beta 1.223 proof (fix_ids: create-states-1223, about-room-1223, city-bar-1223,
// popup-style-1223). Andrew's morning phone review of 1.221/1.222, four pieces:
//  1: creating a route paints his corrected three-state model - a picked road
//     rests GENTLE-MUTED (saturation x0.65: gold #dbb457, red #d2647e), the
//     road tapped again (the sector session's street) paints FULL colour on
//     its own layer, and a removed sector is flat GREY #b9c1cb again (the
//     1.221 engine-mute paint for removed sectors is reverted whole).
//  2: the Settings menu gains breathing room (top safe-area inset, an 88px
//     bottom) so no pane title clips under the top blur and no last row
//     slides under the fixed ✕; What's New is the short point-form entry.
//  3: the city control is option E: a slim full-width bar above Done
//     ('Working in <City> · change', change in var(--link)), same element
//     id, out of the panel title.
//  4: ONE pop-up style (option A) on #toast, #createHint and #crHintBtn -
//     the app blue gradient pill, one declaration set; the loaded-city
//     confirmation is GONE from the hint's state machine (its clock with
//     it); and no user-facing string in any part carries an em dash.
// The rendered behaviour (painted colours per state in the page, the About
// measurements at both entry lengths, the bar's clearances, the pop-up
// computed styles day and night) is judged by the round's QA drive and the
// re-derived drives (151/153/166/178/204); this proof is the static pin.
// On unmodified main (Beta 1.222) every section fails.
//
// Run from the repo root:  node tests/proof/proof-1223.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  [' + detail + ']' : '')); }
}
const head = readFileSync('parts/head.html', 'utf8');
const app4 = readFileSync('parts/app4.js', 'utf8');
const whatsnew = readFileSync('parts/whatsnew.js', 'utf8'); // Arch-1: the What's New entry's own data part
const pick = readFileSync('parts/create-pick.js', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');
function rule(selector) {
  const i = head.indexOf(selector + ' {');
  if (i < 0) return '';
  const j = head.indexOf('}', i);
  return head.slice(i, j);
}

// ---------- 1: the three create states ----------
check('1a: the removed-sector layer wears flat grey #b9c1cb (the pre-1.221 value)',
  pick.includes("id: 'crDraftLineDim', type: 'line', source: DRAFT_SRC, filter: ['!=', ['get', 'chosen'], 1]") && pick.includes("'line-color': '#b9c1cb'"));
check('1b: no draft layer paints through the engine mute any more (the 1.221 paint is reverted whole)',
  !pick.includes("GLP.mute('#ffc233')") && !pick.includes("GLP.mute('#ef476f')"));
check('1c: the chosen-not-active layer wears the gentle mutes (gold #dbb457, red #d2647e)',
  pick.includes("id: 'crDraftLine', type: 'line', source: DRAFT_SRC, filter: ['all', ['==', ['get', 'chosen'], 1], ['!=', ['get', 'active'], 1]]") && pick.includes("'line-color': ['case', ['==', ['get', 'primary'], 1], '#dbb457', '#d2647e']"));
check('1d: the active layer exists, session features only, at full category colour',
  pick.includes("id: 'crDraftLineActive', type: 'line', source: DRAFT_SRC, filter: ['all', ['==', ['get', 'chosen'], 1], ['==', ['get', 'active'], 1]]") && pick.includes("'line-color': ['case', ['==', ['get', 'primary'], 1], '#ffc233', '#ef476f']"));
check('1e: renderDraft stamps active=1 only on the sector session street',
  pick.includes("active: crSectorSession.street === n ? 1 : 0") && pick.includes("active: 0, sector: -1"));
check('1g: the Done close path re-renders the draft (the active flags live in the source; without the rebuild the closed street stays vibrant - Codex P2, PR #100)',
  pick.includes('function crCloseSectors() { if (!crSectorSession.street) return; crSectorReset(); renderDraft();'));
check('1f: both chosen layers keep the bare crZoomW(6.75) width (no case-nested width curve)',
  (pick.match(/'line-width': crZoomW\(6\.75\)/g) || []).length >= 2 && !/'line-width': \['case'/.test(pick));

// ---------- 2: About breathing room + short What's New ----------
check('2a: #setMenu top padding carries the safe-area inset (Beta 1.256: the top is now the bottom\'s equal - 88px + the larger inset at both ends - so the panes centre on the viewport; both 1.223 clearances stand, the top carries its inset and more, the bottom never drops below 88 + an inset)',
  rule('#setMenu').includes('padding: calc(88px + max(env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px))) 24px calc(88px + max(env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)))'));
check('2a2: #setMenu lays its column from flex-start (a centred column clips an overflowing pane top beyond the scroller)',
  rule('#setMenu').includes('justify-content: flex-start'));
check('2b: WHATSNEW stands in its own data part carrying the stamp token (the assembler fills it from the CHANGELOG top)', whatsnew.includes("v: '@@VERSION@@', items:"));
// ---------- 3: the city bar (option E) ----------
check('3a: the city element is out of the panel title',
  head.includes('<div class="crPanelTitle">Current selection</div>'));
check('3b: the city bar stands directly above the Done row, same element id',
  head.includes('</div><button id="crCityChange" type="button" style="display:none"></button><div class="crBtns crPanelBtns">'));
check('3c: the bar wears the sheet chip tint, full width, slim radius - no outline pill left',
  rule('#crCityChange').includes('background: var(--chip)') && rule('#crCityChange').includes('width: 100%') && !rule('#crCityChange').includes('border: 1px solid var(--hair)'));
check('3d: the word change wears the app link token (var(--link)) - no new colour',
  rule('.crCityGo').includes('color: var(--link)'));
check('3e: the bar text is built from text nodes (the typed city name never becomes markup)',
  pick.includes("b.textContent = crCity.name") && pick.includes("cc.append('Working in ',\n        b,\n        ' · ',\n        go)"));
check('3f: the old chip text is gone from the app',
  !pick.includes("'City: ' + crCity.name"));

// ---------- 4: one pop-up style + no confirmation + no em dashes ----------
const POP = 'background: linear-gradient(135deg, #3d65ef, #1b2fb6); color: #fff; font-size: 15px; font-weight: 700; padding: 10px 18px; border-radius: 999px; box-shadow: 0 8px 20px rgba(20,35,110,.45)';
check('4a: the toast pill is gone - the banner is the one pop-up surface', rule('#toast') === '' && !head.includes('id="toast"') && head.includes('#banner {'));
check('4b: the hint pill is gone with the toast', !head.includes('#createHint'));
check('4c: #crHintBtn wears the card face now (the blue pill set is retired)', rule('#crHintBtn').includes('background: var(--card-solid)') && !rule('#crHintBtn').includes('linear-gradient'));
check('4d: the toast\'s old dark-box style is gone', !rule('#toast').includes('background: rgba(20,22,28,.95)'));
check('4e: the hint\'s old dark-blue glass is gone', !rule('#createHint').includes('background: rgba(20,33,61,.92)'));
check('4f: the loaded-city confirmation text is gone - the renderer writes no hint text at all',
  !pick.includes("' — loaded'") && !pick.includes("' — loaded '") && !pick.includes('createHint'));
check('4g: the confirmation clock machinery retired with it (no crPillKey/crPillGone writers)',
  !pick.includes('let crPillT = 0') && !pick.includes('const pillKey ='));
check('4h: the failure states are silent now (audit v2); their remedy button still stands',
  !pick.includes("'Loading ' + crGrid.name + ', '") && !pick.includes('crFailText') && pick.includes("crPrepState === 'failed'"));
check('4i: the road message is cut with the other guidance (audit v2 row 70)', !pick.includes('No road there'));
// the dash census: no string literal in any part carries an em dash
import { readdirSync } from 'node:fs';
let dashFree = true, dashWhere = '';
for (const f of readdirSync('parts')) {
  if (!f.endsWith('.js')) continue;
  const src = readFileSync('parts/' + f, 'utf8');
  // strip comments crudely but safely for this census: line comments and block comments
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
  if (code.includes('—') || code.includes('\\u2014')) { dashFree = false; dashWhere = f; }
}
check('4j: no em dash in any part\'s code (strings included; comments stripped)', dashFree, dashWhere);
check('4k: the static sheet texts are dash-free too', !head.includes('Not saving —') && !head.includes("can't load —"));


console.log(`\nproof-1223: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
