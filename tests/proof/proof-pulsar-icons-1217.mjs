import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Pulsar icons proof (fix_id: pulsar-icons-1217, Beta 1.217, 2026-11-16).
// Beta 1.218 re-derivation (TEST/design class, Andrew's scope update of
// 2026-11-16): the artwork pins below are the GRADIENT set - white lines in
// both themes over the START-button gradient backdrop (#3D65EF -> #1B2FB6,
// diagonal), day and night the same URI - which superseded the flat
// #ACBBF5 set this proof originally pinned, before 1.218 shipped. The
// wrapper/size/licence/wiring sections are unchanged from the 1.217 gate.
// Andrew's approved Icons8 Pulsar Color set replaces the ten main-screen
// ICONS entries (gps, routes, home, clear, gear, streets, pace, moon, sun,
// centre): recoloured artwork (black lines on the #ACBBF5 backdrop by day,
// white lines at night), picked icon by icon and confirmed as a final set
// (A/current everywhere except Moon = the plain crescent, Pace = the
// checkered finish flag; Sun = the A sun). The PNGs ride as base64 data
// URIs - the ICONS entries carry the day URI, PULSAR_ICONS carries both -
// and the render layer re-points every rendered img at the current
// theme's artwork (called after the boot assignments and inside
// applyNight; Beta 1.218: that layer is renderIcons(), the pack registry's
// renderer - with the default pack active its behaviour is this release's). The hard rule of the release: NO button, bar or layout box
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
  gps:     ['T', 'f53511cd4a0d01e09a337310a930c33cd14f3b2db97165a553378662940727d5', 'f53511cd4a0d01e09a337310a930c33cd14f3b2db97165a553378662940727d5'],
  routes:  ['T', '18aed867eb2c8e67170920424cc1f8b6b4d91dd446549ac5129940d9f6480a3d', '18aed867eb2c8e67170920424cc1f8b6b4d91dd446549ac5129940d9f6480a3d'],
  home:    ['T', '5dbc633403087af7aaaef1bcd428070569042033bd3d074fac0d8d271f81b38f', '5dbc633403087af7aaaef1bcd428070569042033bd3d074fac0d8d271f81b38f'],
  clear:   ['T', '9750cf0af897b9d0d45d18536847230125e6a49cc686199ec38533a6ec5e9b9e', '9750cf0af897b9d0d45d18536847230125e6a49cc686199ec38533a6ec5e9b9e'],
  gear:    ['T', '1a2b541bfd1bd1600af0f93fdd4dc25b7ef3106aeb7851f83ddc8150e72576e3', '1a2b541bfd1bd1600af0f93fdd4dc25b7ef3106aeb7851f83ddc8150e72576e3'],
  streets: ['D', '2d9d8e22ee3b3414eeb3b30e8eb539bb2f5766010611d7a79a50588910bfabe6', '2d9d8e22ee3b3414eeb3b30e8eb539bb2f5766010611d7a79a50588910bfabe6'],
  pace:    ['D', '57b0a8b5a6dadc0b97e830841268f4aba86ee8cadff2dfb0106a82b16dbb23b8', '57b0a8b5a6dadc0b97e830841268f4aba86ee8cadff2dfb0106a82b16dbb23b8'],
  moon:    ['D', 'a368922747aa99c65cbcbe52a913473f2ee249c012bf8006dde582e4cf78e74b', 'a368922747aa99c65cbcbe52a913473f2ee249c012bf8006dde582e4cf78e74b'],
  sun:     ['D', 'ba1d748297a5a7ec4c03a8b695bbbecd39c54a3d0028ac3a86b16d79357348dd', 'ba1d748297a5a7ec4c03a8b695bbbecd39c54a3d0028ac3a86b16d79357348dd'],
  centre:  ['D', '84d666ba994e668b65f1898a90edc3940e85940a38bc88f9bdf82ab552ec4cbc', '84d666ba994e668b65f1898a90edc3940e85940a38bc88f9bdf82ab552ec4cbc'],
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
// Beta 1.218 re-derivation (TEST class): the 1.217 refreshPulsarIcons generalized
// into renderIcons(), the pack render layer - it re-mints the ten entries from the
// ACTIVE pack (Pulsar by default, so this proof's subject is unchanged) for the
// current theme + Locate state and stamps every host. The wiring points pinned
// here are the same two (boot, applyNight); the GPS-transition and pack-switch
// calls are pinned by proof-icon-pack-picker-1218.
console.log('E - renderIcons: defined once, called after the boot assignments and inside applyNight');
check('E: renderIcons is defined and re-mints the entries from the map by theme',
  app4.includes('function renderIcons() {') && app4.includes('else u = night ? MAP[k].n : MAP[k].d;')); // Beta 1.218: the branch generalizes over the two image packs (MAP is PULSAR_ICONS unless the glyph pack is active)
const bootAssignIdx = app4.indexOf("$('streetsBtn').innerHTML = ICONS.streets; $('paceBtn').innerHTML = ICONS.pace; $('centreBtn').innerHTML = ICONS.centre; // Beta 1.116");
const bootIdx = app4.indexOf('renderIcons(); // Beta 1.218');
check('E: the boot call stands right after the icon assignments', bootAssignIdx > 0 && bootIdx > bootAssignIdx && bootIdx - bootAssignIdx < 900, String(bootIdx - bootAssignIdx));
check('E: applyNight re-renders after re-setting the toggle button',
  app4.includes("$('nightBtn').innerHTML = isNight() ? ICONS.sun : ICONS.moon; renderIcons(); }"));
check('E: no MutationObserver anywhere in app4 (deterministic calls only)', !app4.includes('MutationObserver'));
check('E: the retired refresh function is gone (one render layer, no second copy)', !app4.includes('refreshPulsarIcons'));

// ================= F - licence =================
console.log('F - the About pane credits Icons8');
check('F: the Icons8 line stands in the About pane', head.includes('<div class="m-credits">Icons by <a href="https://icons8.com">Icons8</a></div>'));

// ================= V - version agreement =================
console.log('V - Beta 1.218 agrees everywhere');
check('V: the #ver label reads Beta 1.218', head.includes('<div class="ver" id="ver">Beta 1.218</div>'));
check('V: WHATSNEW is the Beta 1.218 entry', app4.includes("v: 'Beta 1.218', items:"));
check('V: the CHANGELOG top entry is Beta 1.218', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.218 — 2026-11-16');

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
