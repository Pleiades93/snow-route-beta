import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Pulsar icons proof (fix_id: pulsar-icons-1217, Beta 1.217, 2026-11-16).
// Andrew's approved Icons8 Pulsar Color set replaces the ten main-screen
// ICONS entries (gps, routes, home, clear, gear, streets, pace, moon, sun,
// centre): recoloured artwork (black lines on the #ACBBF5 backdrop by day,
// white lines at night), picked icon by icon and confirmed as a final set
// (A/current everywhere except Moon = the plain crescent, Pace = the
// checkered finish flag; Sun = the A sun). The PNGs ride as base64 data
// URIs - the ICONS entries carry the day URI, PULSAR_ICONS carries both -
// and refreshPulsarIcons() re-points every rendered img at the current
// theme's artwork (called after the boot assignments and inside
// applyNight). The hard rule of the release: NO button, bar or layout box
// changes size - the wrappers keep the vectors' exact boxes (24px tabs,
// 27px dock) and the img runs larger inside the box (30px / 34px) only
// because the PNG artwork carries its own padding.
//
// On unmodified main (Beta 1.216) every A/B/D/E/F check fails: the ten
// entries are Pack D svg strings, there is no PULSAR_ICONS, no pico CSS,
// no refresh wiring and no Icons8 line.
//
// Run from the repo root:  node tests/proof/proof-pulsar-icons-1217.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
const sha256buf = b => createHash('sha256').update(b).digest('hex');
const app4 = readFileSync('parts/app4.js', 'utf8');
const app3 = readFileSync('parts/app3.js', 'utf8');
const head = readFileSync('parts/head.html', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');

// key -> [wrapper, day sha256, night sha256] of Andrew's approved artwork
const ART = {
  gps:     ['T', 'c9fac0015fcbfb0571fcc7f66ffce9c49497a27e09aff7e2aaf7f95305dc2339', '8d3109c443b7ca77d9502f7cf14672a3b03ee7963c8abbda669414cfbbe3c383'],
  routes:  ['T', '59f381c07f950b465dd38e48b95faab5455f240d541e0091489da76fd0c068a1', 'c079ac590a182a3d5345511f4a8886e7e9b1d37c7d49385d3d16e529761507ae'],
  home:    ['T', 'a3ed1023c521b9ad4fe99e6e7a42fe616123e9dd46051ce384e20d89a72d9398', '4d1426b6fd02eec789876f194cae599d1e8521ff510d049f23e24312501239ed'],
  clear:   ['T', '3b06224a6622b3e928a8058f34dbc8b89c88ad2dddcf664f20a90d3fbf5e89ee', '45a5cc5dadde6fb56c4306af0a9f49632d572dc6e7e9a9bd518ae2d804340eb5'],
  gear:    ['T', 'ef2df0082b705ab8ecf0ade6e6986eb46f07a326b73daf3ae6e96be3ae2ee1c1', 'e7092f72a49b60e8b0322dd9b79d23cc2cd23682bfd412a2c2b1b4f9d08d3a3b'],
  streets: ['D', 'be1ca4dcbc2fc41dbd67066975098b51c5a6b7d2850a0fed3838616828895210', 'de217684c9b93095890bac26d9ab47fea53e667550e15658cc78aaa7705f48df'],
  pace:    ['D', 'dbf72de171cb63bdabaa1b82415c29e82ba11c91f9d531d183718dd8c51d760e', 'aadf65c87417715718eca432696be4ae2ef85883fed88237cfbf7d5584384d48'],
  moon:    ['D', '05947b37956f6a94aaf5e25d0eed387b223bfb1fc42b3a1dade0d795d99a83f9', '65187bb193b01070f21706650990e2d5db1e0f32d446e40326681e06d87a289f'],
  sun:     ['D', 'c5ff38d7adbc145c8a484c48d0c8de8b24425060d4ae1f55e28b43b99c82ee83', '026f1cb0659f916cb34cce31289560bcdd762c5ca0cd1598d9d785d7528531bc'],
  centre:  ['D', 'f9410d166de364e392760e4ef72f1b34e84d28fb5c732e39d0e0b1ae9851275d', '27654aa185f769fd9855adfbaf3d34dafd4344debc182a2ef566b6e88561660b'],
};
const entryOf = key => { const m = app4.match(new RegExp('^  ' + key + ": '([^']*)'", 'm')); return m ? m[1] : ''; };
const uriHash = str => { const m = str.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/); return m ? sha256buf(Buffer.from(m[1], 'base64')) : ''; };

// ================= A - the ten entries =================
console.log('A - the ten ICONS entries are Pulsar img spans carrying the approved day artwork');
for (const [key, [wrap, dayHash]] of Object.entries(ART)) {
  const e = entryOf(key);
  check(`A: ${key} entry is a pwrap${wrap} pico span with data-k=${key}`,
    e.startsWith(`<span class="pwrap${wrap}"><img class="pico" data-k="${key}" src="data:image/png;base64,`));
  check(`A: ${key} entry artwork is the approved day PNG (sha256)`, uriHash(e) === dayHash, uriHash(e));
}

// ================= B - PULSAR_ICONS =================
console.log('B - PULSAR_ICONS carries exactly the ten keys, day + night artwork byte-identical to the picks');
const mapBlock = (app4.match(/const PULSAR_ICONS = \{([\s\S]*?)\n\};/) || [])[1] || '';
check('B: the map exists', mapBlock.length > 0);
for (const [key, [, dayHash, nightHash]] of Object.entries(ART)) {
  const line = (mapBlock.match(new RegExp('^  ' + key + ": \\{ d: '([^']+)', n: '([^']+)' \\},", 'm')) || []);
  check(`B: ${key} day URI is the approved day PNG`, line[1] ? uriHash(line[1]) === dayHash : false, line[1] ? uriHash(line[1]) : 'missing');
  check(`B: ${key} night URI is the approved night PNG`, line[2] ? uriHash(line[2]) === nightHash : false, line[2] ? uriHash(line[2]) : 'missing');
}
check('B: no eleventh key in the map', (mapBlock.match(/^  \w+: \{ d:/gm) || []).length === 10);

// ================= C - the untouched six =================
console.log('C - the six off-main-screen entries stay Pack D vectors, byte-identical (sha256 of the entry string)');
const UNTOUCHED = {
  menu: 'c69106c899bb32ed4ba44a9334de562565bf70d67e916e3504a312127c4321c8',
  upd: '57f4b1d923052991165cc0b4cedfeccb3a0409d147204d620a00a769f6a587f5',
  flip: 'e245f2505f6e7770d466c397a9b6b4fe498bbd971f6d71b49db49821a8554b45',
  pin: 'f9f7bb5b0cd49d0dfd432351502e3df1d34df8121a1bb09e1104f65f06d5246e',
  note: 'b437fe706803eef6c36010b8122bde4efba46d11c9d7f6208cd639d302545cd6',
  exp: '828844aa29398cd75862a2404d38a55394a9eaac56a156da8847d4ed7da242db',
};
for (const [key, h] of Object.entries(UNTOUCHED)) {
  const e = entryOf(key);
  check(`C: ${key} entry unchanged`, e.startsWith('<svg') && sha256buf(Buffer.from(e)) === h, sha256buf(Buffer.from(e)));
}
check('C: PACE_ICONS (app3) untouched - still vector entries, no pico', app3.includes('const PACE_ICONS = {') && !app3.includes('pico'));

// ================= D - the size invariant in CSS =================
console.log('D - no layout box changes size: svg rules stand, wrappers keep the boxes, imgs run 30/34 inside');
check('D: the tab svg rule stands at 24px', head.includes('.tabItem svg { width: 24px; height: 24px; }'));
check('D: the dock svg rule stands at 27px', head.includes('.dockBtn svg { width: 27px; height: 27px; }'));
check('D: tab wrapper keeps the 24px box', head.includes('.tabItem .pwrapT { display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center; }'));
check('D: tab img is 30px inside the box', head.includes('.tabItem .pwrapT .pico { width: 30px; height: 30px; flex: none; display: block; }'));
check('D: dock wrapper keeps the 27px box', head.includes('.dockBtn .pwrapD { display: inline-flex; width: 27px; height: 27px; align-items: center; justify-content: center; }'));
check('D: dock img is 34px inside the box', head.includes('.dockBtn .pwrapD .pico { width: 34px; height: 34px; flex: none; display: block; }'));
check('D: the tab icon slot keeps its shipped rendered height (27px - the svg line box always carried it; measured by drive196)',
  head.includes('.tabIco { display: flex; height: 27px; align-items: center; justify-content: center; }'));

// ================= E - the theme-swap wiring =================
console.log('E - refreshPulsarIcons: defined once, called after the boot assignments and inside applyNight');
check('E: the function is defined and reads the night class + the map',
  app4.includes("function refreshPulsarIcons() { const night = document.body.classList.contains('night'); document.querySelectorAll('img.pico').forEach(im => { const u = PULSAR_ICONS[im.dataset.k]; if (u) im.src = night ? u.n : u.d; }); }"));
const noteIdx = app4.indexOf("$('selNote').innerHTML = ICONS.note;");
const bootIdx = app4.indexOf('refreshPulsarIcons(); // Beta 1.217');
check('E: the boot call stands right after the icon assignments', noteIdx > 0 && bootIdx > noteIdx && bootIdx - noteIdx < 220, String(bootIdx - noteIdx));
check('E: applyNight refreshes after re-setting the toggle button',
  app4.includes("$('nightBtn').innerHTML = isNight() ? ICONS.sun : ICONS.moon; refreshPulsarIcons(); }"));
check('E: no MutationObserver anywhere in app4 (deterministic calls only)', !app4.includes('MutationObserver'));

// ================= F - licence =================
console.log('F - the About pane credits Icons8');
check('F: the Icons8 line stands in the About pane', head.includes('<div class="m-credits">Icons by <a href="https://icons8.com">Icons8</a></div>'));

// ================= V - version agreement =================
console.log('V - Beta 1.217 agrees everywhere');
check('V: the #ver label reads Beta 1.217', head.includes('<div class="ver" id="ver">Beta 1.217</div>'));
check('V: WHATSNEW is the Beta 1.217 entry', app4.includes("v: 'Beta 1.217', items:"));
check('V: the CHANGELOG top entry is Beta 1.217', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.217 — 2026-11-16');

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
