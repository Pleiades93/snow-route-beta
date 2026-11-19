// Proof: create-flow class pills + doors menu + city list (Andrew, 2026-11-15; Beta 1.207).
// Static-source proof over parts/ (the canonical source). Every check FAILS on
// unmodified main (Beta 1.205) and PASSES with the fix:
//  1. Both class-chip sites spell SECONDARY in full; '2ND' is gone from create-pick.js.
//  2. The review chip's secondary is the filled raspberry twin (#ef476f / #fff), not grey.
//  3. The pick chip wears the SAME filled pill metrics as the review chip (999px radius,
//     12px/800, .3px spacing, 6px 10px padding) with the same two filled colours, and its
//     old tinted day/night rules are gone.
//  4. The doors are titles only: exact new titles, no m-sub span inside any door button,
//     old titles ("Search manually", "From a photo") absent from head.html, the photo
//     pane's title renamed to match, and the failure note names "Manual search".
//  5. City rows pass sub null (name only); "ready to load" is gone from create-pick.js;
//     the gold last-used span survives, re-hosted on the row's .routeName.
import { readFileSync } from 'node:fs';

const pick = readFileSync('parts/create-pick.js', 'utf8');
const head = readFileSync('parts/head.html', 'utf8');
const app2 = readFileSync('parts/app2.js', 'utf8');
const save = readFileSync('parts/create-save.js', 'utf8');

let failed = 0;
function ok(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) failed++; }
const count = (s, sub) => s.split(sub).length - 1;

// 1 — chip text at both render sites
ok('chip text PRIMARY/SECONDARY at both sites', count(pick, "chip.textContent = primary ? 'PRIMARY' : 'SECONDARY';") === 2);
ok("'2ND' absent from create-pick.js", !pick.includes("'2ND'") && !pick.includes('PRIMARY/2ND'));

// 2 — review chip colours
ok('.crChip.sec is filled raspberry with dark ink (1.209S: Beta 1.209 superseded the 1.208 #4a3200 ink — Andrew picked TRUE BLACK #000000 (the 1.208 ink read faded on the raspberry))', head.includes('.crChip.sec { background: #ef476f; color: #000000; }'));
ok('.crChip.primary unchanged (solid gold)', head.includes('.crChip.primary { background: #ffc233; color: #000000; }'));

// 3 — pick chip = same pill design
ok('.crPChip base wears the .crChip pill metrics', head.includes('.crPChip { border: none; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: .3px; padding: 6px 10px;'));
ok('.crPChip.primary solid gold', head.includes('.crPChip.primary { background: #ffc233; color: #000000; }'));
ok('.crPChip.sec filled raspberry with dark ink (1.209S: Beta 1.209 superseded the 1.208 #4a3200 ink — Andrew picked TRUE BLACK #000000 (the 1.208 ink read faded on the raspberry))', head.includes('.crPChip.sec { background: #ef476f; color: #000000; }'));
ok('pick chip tint rules gone (no rgba gold/pink chip fills, no night tints)', !head.includes('.crPChip.primary { background: rgba(') && !head.includes('body.night .crPChip'));

// 4 — doors
ok('door titles exact (Beta 1.243: TWO doors - the Upload photo door is removed)', head.includes('id="crDoorList">Select from list</button>') && head.includes('id="crDoorManual">Manual search</button>') && !head.includes('crDoorPhoto'));
ok('no m-sub inside the create pane', !head.slice(head.indexOf('id="rmCreatePane"'), head.indexOf('id="rmCityListPane"')).includes('m-sub'));
ok('old door titles absent from head.html', !head.includes('Search manually') && !head.includes('From a photo'));
ok('photo pane GONE (Beta 1.243)', !head.includes('rmPhotoPane'));
ok('failure note names Manual search', pick.includes('Go back and use Manual search.') && !pick.includes('Search manually'));

// 5 — city rows
ok('city rows built with sub null (name only)', pick.includes("routeRowShell('button', e.name, null, { chevron: true })"));
ok("'ready to load' absent from create-pick.js", !pick.includes('ready to load'));
ok('last-used span survives on .routeName', pick.includes("lu.className = 'crLastUsed'") && pick.includes("b.querySelector('.routeName')"));

// 6 — the loaded marker (through 1.232 the badge beside the name; Beta 1.233: the disc check at the right edge) + the save confirmation (a pill through 1.220; cut in 1.221, the menu transition confirms)
ok('badge gone, disc check stamped (Beta 1.233)', !app2.includes('routeBadge') && !app2.includes('routeNameRow') && app2.includes("ck.className = 'routeCheck'") && app2.includes('ck.src = GLYPH_MENU.check') && !app2.includes("bd.textContent = 'Currently loaded'; b.appendChild(bd); }"));
ok('name-row group CSS gone with the badge (Beta 1.233); the check CSS stands', !head.includes('.routeNameRow') && head.includes('#routeMenu .routeCheck { width: 25px; height: 25px; flex: none; }'));
ok("the save success path fires NO pill since 1.221 (the route menu opening on the new route is the confirmation) and the long maps-note variant stays absent", !save.includes("toast('Route saved'") && save.includes('exitCreate();') && save.includes("showRmPane('rmListPane')") && !save.includes('its maps are not downloaded yet'));

console.log(failed === 0 ? 'ALL PASS' : failed + ' FAILED');
process.exit(failed === 0 ? 0 : 1);
