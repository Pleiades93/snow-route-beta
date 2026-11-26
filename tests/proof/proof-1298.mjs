// proof-1298.mjs - Beta 1.298 (transitions round, FIX 12).
// The reduced-motion block covered the menu system but not the surfaces
// (the audit's coverage FIX): sheets, modals, the confirm pair, the
// selection pop and map note, the banner, press feedback, the count
// fill, the switch, the scroll arrow and the splash dissolve all ran at
// full strength for a reduced-motion user. The block now flattens each
// at matching specificity - a media query adds none, so the state
// selectors ride along (the block's own E-02 lesson). This round's new
// motions (the sliding filter pill, the glyph crossfade, the speed
// digit swap) are covered from birth. The banner also gains a JS leg:
// its exit is animation-driven, so under reduced motion a timer in
// showBanner keeps the 3s stay instead.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app1 = read('parts/app1.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const rmStart = head.indexOf('@media (prefers-reduced-motion: reduce)');
const rm = rmStart >= 0 ? head.slice(rmStart) : '';
check('0: the reduced-motion block stands in the page', rmStart >= 0);

// ---------- the surfaces, flattened at matching specificity ----------
check('1: the sheets rest (base and open states)', rm.includes('.sheet, .sheet.open { transition: none; }'));
check('2: the modals rest, entrances and exits, cards riding along', rm.includes('.modal:not(.hidden), .modal.leaving { animation: none; }') && rm.includes('.modal:not(.hidden) .card, .modal.leaving .card { animation: none; }'));
check('3: the confirmation backdrop rests in both states', rm.includes('#confirmBackdrop, #confirmBackdrop.on { transition: none; }'));
check('4: the confirmation pill rests, entrance and exit', rm.includes('#confirmPill:not(.hidden), #confirmPill.leaving { animation: none; }'));
check('5: the selection pop and map note rest, entrances and exits', rm.includes('#selPop:not(.hidden), #selPop.leaving, #mapNote:not(.hidden), #mapNote.leaving { animation: none; }'));
check('6: the banner rests in its end state (visible, at rest)', rm.includes('#banner.show { animation: none; visibility: visible; opacity: 1; transform: none; }'));
check('7: the count fill and the switch rest', rm.includes('#countFill { transition: none; }') && rm.includes('.m-switch, .m-switch::after { transition: none; }'));
check('8: the scroll arrow rests in both states', rm.includes('#rmCityListPane #crCityArrow, #rmCityListPane #crCityArrow.hide { transition: none; }'));
check('9: the splash dissolve rests at its end state', rm.includes('#splash.go #splashBg { animation: none; opacity: 0; }'));
check('10: press feedback rests (the shared group at its own selectors)', rm.includes('#crHintBtn { transition: none; }') && rm.includes('.tabItem, .dockBtn, .runBtn,'));

// ---------- this round's own motions, covered from birth ----------
check('11: the sliding filter pill rests', rm.includes('#filtersPill { transition: none; }'));
check('12: the glyph crossfade rests', rm.includes('.nbIco { transition: none !important; }'));
check('13: the speed digit swap rests (recipe guard form)', rm.includes('#spdNum .subtleNew, #spdNum .subtleOld { animation: none !important; }') && rm.includes('#spdNum .subtleOld { display: none; }'));

// ---------- the banner's JS leg ----------
check('14: showBanner keeps the stay by timer under reduced motion', app1.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches) b._rmT = setTimeout(") && app1.includes('}, 3000);'));

console.log(`proof-1298: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
