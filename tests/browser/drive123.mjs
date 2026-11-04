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

ok('A0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// Menu animation baseline (Andrew, 2026-10-30): ONE duration for every menu;
// opening plays the open curve, closing plays its exact time-flip; staggers
// mirror. These checks pin the contract in computed styles, not appearances.
const TOK = JSON.parse(await ev(`(() => { const cs = getComputedStyle(document.documentElement); return JSON.stringify({
  dur: cs.getPropertyValue('--anim-dur').trim(), open: cs.getPropertyValue('--ease-open').trim(), close: cs.getPropertyValue('--ease-close').trim() }); })()`));
const ANCHOR = JSON.parse(await ev(`(() => { const g = $('tabBar').getBoundingClientRect(); const cs = getComputedStyle($('tabBar')); return JSON.stringify({
  pos: cs.position, gx: Math.round(g.x), gw: Math.round(g.width), gb: Math.round(g.bottom), vw: window.innerWidth, vh: window.innerHeight }); })()`));
ok('A0 chrome anchored as designed (tab bar fixed across the bottom, Beta 1.23) | ' + JSON.stringify(ANCHOR),
  ANCHOR.pos === 'fixed' && ANCHOR.gx === 0 && ANCHOR.gw === ANCHOR.vw && ANCHOR.gb === ANCHOR.vh);

ok('A1 shared tokens exist (420ms - Andrew slowed the pace in 1.29, smooth over snappy; mirrored curve pair) | ' + JSON.stringify(TOK),
  TOK.dur === '420ms' && TOK.open === 'cubic-bezier(.22,.9,.28,1)' && TOK.close === 'cubic-bezier(.72,0,.1,.78)');

const sheetT = async () => JSON.parse(await ev(`(() => { const cs = getComputedStyle($('sheet')); return JSON.stringify({
  dur: cs.transitionDuration.split(',')[0].trim(), raw: cs.transitionTimingFunction, props: cs.transitionProperty }); })()`));
const firstFn = (raw) => { const seg = String(raw).split('),')[0]; return (seg.endsWith(')') ? seg : seg + ')').replace(/\s+/g, ''); };
const closed = await sheetT(); closed.fn = firstFn(closed.raw);
ok('A2 closed sheet animates on the close curve at the shared duration, height included | ' + JSON.stringify(closed),
  closed.dur === '0.42s' && closed.fn === 'cubic-bezier(0.72,0,0.1,0.78)' && closed.props.includes('transform') && closed.props.includes('height') && closed.props.includes('max-height'));
await ev(`(() => { $('streetsBtn').click(); return true; })()`);
await poll120(`$('sheet').classList.contains('open')`, 5000);
const opened = await sheetT(); opened.fn = firstFn(opened.raw);
ok('A2 open sheet animates on the open curve at the same duration | ' + JSON.stringify(opened),
  opened.dur === '0.42s' && opened.fn === 'cubic-bezier(0.22,0.9,0.28,1)');

// A3/A4 (re-aimed Beta 1.23): the fan is gone; its stagger contract retired with it.
// The tab bar is static chrome - always fully visible, no animation delays - while
// the menu animation baseline lives on in the sheets (A1/A2 above).
const tabState = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#tabBar .tabItem')].map(el => { const cs = getComputedStyle(el); return {
  op: parseFloat(cs.opacity), delay: cs.transitionDelay.split(',')[0].trim() }; }))`));
ok('A3 tab bar is static chrome: five actions, fully visible, no stagger | ' + JSON.stringify(tabState),
  tabState.length === 5 && tabState.every(t => t.op === 1 && t.delay === '0s'));

// A5 (Beta 1.30): a close must ANIMATE - the sheet's current height is frozen for the
// slide-down and cleared only after the motion ends; clearing it instantly was the snap.
await ev(`(() => { const sh = $('sheet'); sh.style.height = '500px'; sh.style.maxHeight = 'none'; sh.classList.add('open'); return true; })()`); // Beta 1.79: the default cap is half height now - a 500px sheet exists only with the cap lifted, as during a drag or at the full stop, so the setup lifts it the same way
await sleep(100);
await ev(`closeSheets()`);
const frozenH = await ev(`$('sheet').style.height`);
ok('A5 closing freezes the current height for the slide (no instant snap) | height right after close: ' + JSON.stringify(frozenH), frozenH === '500px');
await sleep(700);
const clearedH = await ev(`$('sheet').style.height`);
ok('A5 the frozen height clears once the close motion has ended | ' + JSON.stringify(clearedH), clearedH === '');

// A6 (Beta 1.31): the close X belongs in the sheet's very corner - top-right, above the title line.
await ev(`(() => { $('sheet').classList.add('open'); return true; })()`); await sleep(500);
const A6 = JSON.parse(await ev(`(() => { const sh = $('sheet').getBoundingClientRect(), cl = $('sheetClose').getBoundingClientRect(), ti = document.querySelector('#sheet .sheetTitle').getBoundingClientRect(); return JSON.stringify({ topGap: Math.round(cl.top - sh.top), rightGap: Math.round(sh.right - cl.right), closeTop: Math.round(cl.top), titleMid: Math.round(ti.top + ti.height / 2), pacePos: getComputedStyle($('paceClose')).position }); })()`));
ok('A6 close X pinned to the top-right corner, above the title (both sheets) | ' + JSON.stringify(A6),
  A6.topGap >= 0 && A6.topGap <= 8 && A6.rightGap >= 0 && A6.rightGap <= 10 && A6.closeTop < A6.titleMid && A6.pacePos === 'absolute');
await ev(`closeSheets()`); await sleep(300);

// A7 (Beta 1.34, Andrew): EVERY menu's close is the same plain red corner X. The Backup
// menu's X used to render as a red BOX - the button-grid styles overrode the plain-X rule -
// and the same collision hit Finish and Note. Beta 1.88: the Backup surface moved into the
// blue settings takeover, whose close is the blue menus' bare white X (one shared rule with
// the Routes menu) - so this now asserts BOTH families: the red corner X computed on the
// Finish and Note dialogs, and the IDENTICAL bare white X computed on Settings and Routes.
await ev(`(() => { $('exportBtn').click(); return true; })()`); await sleep(400);
await ev(`(() => { $('finModal').classList.remove('hidden'); $('noteModal').classList.remove('hidden'); return true; })()`); await sleep(200);
const A7 = JSON.parse(await ev(`(() => { const one = id => { const e = $(id), cs = getComputedStyle(e), card = e.closest('.card').getBoundingClientRect(), r = e.getBoundingClientRect(); return { bg: cs.backgroundColor, col: cs.color, fs: cs.fontSize, pos: cs.position, topGap: Math.round(r.top - card.top), rightGap: Math.round(card.right - r.right), inGrid: !!e.closest('.grid') }; }; const bx = id => { const cs = getComputedStyle($(id)); return { bg: cs.backgroundColor, col: cs.color, fs: cs.fontSize, fw: cs.fontWeight }; }; return JSON.stringify({ fin: one('finNo'), note: one('noteNo'), set: bx('setClose'), rm: bx('rmClose') }); })()`));
const xOk = o => o.bg === 'rgba(0, 0, 0, 0)' && o.col === 'rgb(230, 58, 46)' && o.fs === '21px' && o.pos === 'absolute' && o.topGap >= 0 && o.topGap <= 8 && o.rightGap >= 0 && o.rightGap <= 10 && o.inGrid === false;
ok('A7 dialog closes keep the plain red corner X (Finish, Note) and the settings X computes IDENTICAL to the routes X - one bare-white-X rule for the blue menus (Beta 1.88) | ' + JSON.stringify(A7), xOk(A7.fin) && xOk(A7.note) && JSON.stringify(A7.set) === JSON.stringify(A7.rm) && A7.set.col === 'rgb(255, 255, 255)' && A7.set.fs === '30px');
await ev(`(() => { $('setClose').click(); $('finModal').classList.add('hidden'); $('noteModal').classList.add('hidden'); return true; })()`); await sleep(200);

// A8 (Beta 1.34, z15 core added Beta 1.41): Download offline maps must actually fetch the VAUGHAN + NEARBY tile set
// for both modes. The pre-1.34 loop ran the tile y-range backwards (north y is smaller),
// so it silently fetched ZERO tiles and reported only glyphs+sprites - this check stubs
// fetch, records every URL the handler asks for, and counts them exactly.
// Beta 1.92: the stub answers after 5 ms, not instantly - the small delay keeps the job in
// flight long enough for A8b's second tap below to land mid-download. (The note lives HERE,
// in the source: a // comment inside the ev() string once commented out the IIFE's own
// closing and silently uninstalled the stub - A8 read an empty recording and failed.)
await ev(`(() => { window.__preSeen = []; window.__realFetch = window.fetch; window.fetch = (u) => { window.__preSeen.push(String(u)); return new Promise(res => setTimeout(() => res(new Response('{}', { status: 200 })), 5)); }; $('exportBtn').click(); return true; })()`); await sleep(300);
await ev(`(() => { $('xPre').click(); return true; })()`);
await sleep(600);
await ev(`(() => { $('xPre').click(); return true; })()`); // Beta 1.92 (audit F07): a second tap mid-download must start NO second job
await sleep(250);
const A8toast = await ev(`$('toast').textContent`);
let preStat = '';
for (let i = 0; i < 90; i++) { preStat = await ev(`$('xPreStat').textContent`); if (/Offline maps: saved/.test(preStat)) break; await sleep(250); }
const A8 = JSON.parse(await ev(`(() => { const seen = window.__preSeen || []; window.fetch = window.__realFetch; const tiles = seen.filter(u => u.endsWith('.mvt')); const inBox = tiles.every(u => { const m = u.match(/\\/(\\d+)\\/(\\d+)\\/(\\d+)\\.mvt$/); if (!m) return false; const z = +m[1], x = +m[2], y = +m[3], n = 2 ** z; const xw = Math.floor((-79.75 + 180) / 360 * n), xe = Math.floor((-79.35 + 180) / 360 * n); const yOf = lat => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n); return x >= xw && x <= xe && y >= yOf(44.05) && y <= yOf(43.70); }); return JSON.stringify({ total: seen.length, tiles: tiles.length, inBox, glyphs: seen.filter(u => u.endsWith('.pbf')).length, sprites: seen.filter(u => u.includes('/sprites/')).length, stat: $('xPreStat').textContent }); })()`));
ok('A8 offline download fetches the full Vaughan tile set + the z15 route core (633 tiles incl. the z8/9 wide zooms since 1.72, every one inside the area) + glyphs + both sprite flavours | ' + JSON.stringify(A8),
  A8.tiles === 633 && A8.inBox === true && A8.glyphs === 256 && A8.sprites === 8 && A8.total === 897);
ok('A8b the second tap was refused while the download ran (single-flight, Beta 1.92) | toast: ' + A8toast, A8toast === 'Offline download already running');

// A8c (Beta 1.93, follow-up audit V02): a genuinely STALLED file (a fetch that
// never answers but honours the abort signal, as a real fetch does) is
// abandoned by the 30 s timeout and the job still completes honestly.
await ev(`(() => { window.__preSeen = []; window.__hangCalls = 0; window.fetch = (u, opts) => { window.__preSeen.push(String(u)); window.__hangCalls++; if (window.__hangCalls === 1) return new Promise((_, rej) => { if (opts && opts.signal) opts.signal.addEventListener('abort', () => rej(new Error('aborted'))); }); return Promise.resolve(new Response('{}', { status: 200 })); }; $('xPre').click(); return true; })()`);
const t8c = Date.now();
let stat8c = '';
for (let i = 0; i < 100; i++) { stat8c = await ev(`$('xPreStat').textContent`); if (/Offline maps: saved/.test(stat8c)) break; await sleep(500); }
const el8c = Date.now() - t8c;
const seen8c = await ev(`(window.__preSeen || []).length`);
await ev(`(() => { window.fetch = window.__realFetch; return true; })()`);
ok('A8c one stalled file is aborted (~30 s) and the download still completes | ' + stat8c + ' | seen ' + seen8c + ' | elapsed ' + Math.round(el8c / 1000) + 's', /Offline maps: saved/.test(stat8c) && seen8c === 897 && el8c >= 20000 && el8c < 90000);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

