import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive118: audit remediation regression suite (spec 2026-10-29). Covers the gaps the older drives do not:
// invalid coverage indexes (F-2), invalid GPS fixes (G-1), coverage suggestion behaviour incl. parallel
// streets (spec GPS), restore write failure + rollback (suite 5), failed rollback verification (suite 6),
// invalid nested history (suite 3), current-format backup round-trip (suite 1), failed history write at
// finish (suite 11), partial multi-key save consistency (suite 12).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);

// drive120 (Stage 2, v1.0 plan): visual-geometry regression for the beta's CURRENT UI shapes.
// Every check measures the FAILURE property directly (overflow, overlap, out-of-bounds) in the
// rendered page at phone size, in both themes - never a proxy like a radius or a class name.
const RECTS = (sel) => `(() => [...document.querySelectorAll('${sel}')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }))()`;
const overlaps = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
const inView = (r) => r.x >= -1 && r.y >= -1 && r.r <= 421 && r.b <= 901;
const noOverlap = (rs) => rs.every((a, i) => rs.every((b, j) => i === j || !overlaps(a, b)));
let A;

ok('V0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// V1 (Beta 1.21 layout): the dock - List | round run button | Pace on one level,
// centred and symmetrical; the gear alone at the top left; the header is title-only.
const dockGeom = async () => JSON.parse(await ev(`(() => { const r = (id) => { const b = $(id).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom, cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; };
  return JSON.stringify({ list: r('streetsBtn'), pace: r('paceBtn'), start: r('startBtn'), tabs: [...document.querySelectorAll('#tabBar .tabItem')].map(e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom, lbl: e.querySelector('.tabLbl').textContent, svg: !!e.querySelector('svg') }; }), vw: window.innerWidth }); })()`));
let D = await dockGeom();
let rects = [D.list, D.pace, D.start];
ok('V1 dock buttons all inside the viewport | dock ' + JSON.stringify(D), rects.every(inView));
ok('V1 dock buttons do not overlap each other', noOverlap(rects));
ok('V1 run button is centred and List/Pace are symmetrical around it | dock ' + JSON.stringify(D),
  Math.abs(D.start.cx - D.vw / 2) <= 2 && Math.abs((D.start.cx - D.list.cx) - (D.pace.cx - D.start.cx)) <= 2 && Math.abs(D.list.cy - D.start.cy) <= 2 && Math.abs(D.pace.cy - D.start.cy) <= 2);
ok('V1 tab bar carries five labelled, iconned actions | tabs ' + JSON.stringify(D.tabs), D.tabs.length === 5 && D.tabs.every(t => t.lbl.length > 0 && t.svg));
A = await J(`({ sw: $('hud').scrollWidth, cw: $('hud').clientWidth })`);
ok('V1 header content does not overflow horizontally', A.sw <= A.cw + 1);

// V2: same with a street selected (selection strip visible - the state whose old
// floating-panel version overflowed the header in the production app's history)
await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; map.jumpTo({ center: mid, zoom: 16 }); selectStretch('Velmar', 0, mid); return true; })()`); // a real tap always passes an anchor point; without one the chip layout cannot run
await sleep(700);
rects = JSON.parse(await ev(`JSON.stringify(${RECTS('#hud button')})`));
ok('V2 with selection strip: header buttons inside the viewport', rects.every(inView));
ok('V2 with selection strip: header buttons do not overlap', noOverlap(rects));
D = await dockGeom();
ok('V2 dock stays centred with a street selected | dock ' + JSON.stringify(D), Math.abs(D.start.cx - D.vw / 2) <= 2 && [D.list, D.pace, D.start].every(inView));

// V3: side chips are 40px, in bounds, and do not overlap each other
const chips = JSON.parse(await ev(`JSON.stringify(${RECTS('.sideChip .chipBtn')})`));
ok('V3 two side chips are shown', chips.length === 2);
ok('V3 chips are 40px tap targets', chips.every(c => Math.abs(c.w - 40) <= 2 && Math.abs(c.h - 40) <= 2));
ok('V3 chips inside the viewport and not overlapping | chips ' + JSON.stringify(chips), chips.every(inView) && !overlaps(chips[0], chips[1]));
// V3b: the same selection with the stretch point pushed against the right edge - the
// independent per-chip clamp used to squeeze the pair together there (drive120's catch).
await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; map.jumpTo({ center: [mid[0], mid[1] - 0.0035], zoom: 16 }); selectStretch('Velmar', 0, mid); return true; })()`);
await sleep(700);
const chipsEdge = JSON.parse(await ev(`JSON.stringify(${RECTS('.sideChip .chipBtn')})`));
ok('V3b edge-anchored chips keep their separation | chips ' + JSON.stringify(chipsEdge), chipsEdge.length === 2 && chipsEdge.every(inView) && !overlaps(chipsEdge[0], chipsEdge[1]));

// V4: bottom tab bar (Beta 1.23) - six equal actions, in bounds, no overlaps
const tabs = JSON.parse(await ev(`JSON.stringify(${RECTS('#tabBar .tabItem')})`));
ok('V4 tab bar shows five items', tabs.length === 5);
ok('V4 tab items are equal width, inside the viewport, no overlaps | tabs ' + JSON.stringify(tabs),
  tabs.every(inView) && noOverlap(tabs) && Math.max(...tabs.map(t => t.w)) - Math.min(...tabs.map(t => t.w)) <= 3);

// V5: sheets - open sheet fits the viewport; closed sheet is truly invisible
await ev(`(() => { $('streetsBtn').click(); return true; })()`); // the List button toggles the sheet itself; there is no openList() function
await poll120(`$('sheet').classList.contains('open')`, 5000);
await sleep(600);
A = await J(`(() => { const r = $('sheet').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; })()`);
ok('V5 open list sheet fits the viewport | sheet ' + JSON.stringify(A), inView(A) && A.y >= 0);
await ev(`(() => { closeSheets(); return true; })()`);
await poll120(`(() => { const e = $('sheet'); return getComputedStyle(e).visibility === 'hidden' || e.getBoundingClientRect().top >= 899; })()`, 10000);
A = await J(`(() => { const e = $('sheet'); const r = e.getBoundingClientRect(); return { vis: getComputedStyle(e).visibility, top: r.top }; })()`);
ok('V5 closed sheet is invisible (hidden or fully below the viewport)', A.vis === 'hidden' || A.top >= 899);

// V6: night theme - header measurements hold there too
await ev(`(() => { $('nightBtn').click(); return true; })()`); // Night/Day lives in Settings now (Beta 1.76); a programmatic click still fires it
await sleep(900);
A = await J(`({ night: document.body.classList.contains('night') })`);
D = await dockGeom();
ok('V6 night: dock centred, inside the viewport, no overlaps | dock ' + JSON.stringify(D), A.night === true && [D.list, D.pace, D.start].every(inView) && noOverlap([D.list, D.pace, D.start]) && Math.abs(D.start.cx - D.vw / 2) <= 2);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

