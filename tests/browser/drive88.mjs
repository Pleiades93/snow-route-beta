import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive88: v5.53 notes + clean detail battery
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;
const rowOf = (n) => `(() => { return [...document.querySelectorAll('.srow')].find(r => r.querySelector('.nm').textContent === '${n}'); })()`; // Beta 1.91: rows are picked BY NAME - the list is colour-sorted now, so a route-order index picks the wrong street
await sleep(3000);
await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76: a reload lands on the route menu
// Phase 1: list buttons + auto-saving notes
await ev(`(() => { $('streetsBtn').click(); return true; })()`); await sleep(400);
let A = JSON.parse(await ev(`(() => JSON.stringify({ rows: document.querySelectorAll('.srow').length, smap: !!document.querySelector('.srow .smap'), snote: !!document.querySelector('.srow .snote') }))()`));
ok('P1 rows carry the pin button and NO note button (v5.55)', A.rows === 34 && A.smap && !A.snote);
await ev(`(() => { ${'PLACEHOLDER'} return true; })()`.replace('PLACEHOLDER', ''));
await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); r.querySelector('.nwrap').click(); return true; })()`); await sleep(400);
A = JSON.parse(await ev(`(() => JSON.stringify({ ed: !!document.querySelector('.noteEd textarea') }))()`));
ok('P1 name tap opens the note editor', A.ed);
// Beta 1.31: while the editor has focus (the phone keyboard is up) the sheet must hold still.
await sleep(200);
const KB = JSON.parse(await ev(`(() => { const cs = getComputedStyle($('sheet')); return JSON.stringify({ kb: document.body.classList.contains('kb'), dur: cs.transitionDuration, maxH: parseFloat(cs.maxHeight) }); })()`));
ok('K1 keyboard up: sheet stops animating and KEEPS its pre-keyboard size (the 1.31 grow-to-visible-height rule is gone; the keyboard overlays) | ' + JSON.stringify(KB), KB.kb === true && KB.dur === '0s' && KB.maxH === 450); // Beta 1.61: the sheet's ordinary max-height in this rig - unchanged by the keyboard (before 1.61 this asserted the old 1.31 contract, maxH > 800). Beta 1.79: .50 x 900 = 450 (sheets open at half height; .74 x 900 = 666 through 1.78) - unchanged by the keyboard (before 1.61 this asserted the old 1.31 contract, maxH > 800)
await ev(`(() => { document.querySelector('.noteEd textarea').blur(); return true; })()`); await sleep(200);
ok('K2 keyboard down: the sheet returns to normal motion', await ev(`document.body.classList.contains('kb')`) === false);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); ta.value = 'Driveway at #12 blocked by car'; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await sleep(800);
A = JSON.parse(await ev(`(() => JSON.stringify({ ls: localStorage.getItem('snowroute.5w.v4.notes') || '', hint: document.querySelector('.noteEd .nhint').textContent, nt: noteTextOf('Velmar') }))()`));
ok('P1 note auto-saves to storage (no Save button)', A.ls.includes('blocked by car') && A.nt.includes('blocked by car'));
ok('P1 editor confirms the save', /Saved/.test(A.hint));
await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Angie'); r.querySelector('.nwrap').click(); return true; })()`); await sleep(400);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); ta.value = 'Could not clean - gate locked'; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await sleep(800);
A = JSON.parse(await ev(`(() => JSON.stringify({ nt: noteTextOf('Angie') }))()`));
ok('P1 note works on a street that is not cleaned', A.nt.includes('gate locked'));
await ev(`(() => { location.reload(); return true; })()`); await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600);
await ev(`(() => { $('streetsBtn').click(); return true; })()`); await sleep(400);
A = JSON.parse(await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); return JSON.stringify({ preview: r.querySelector('.nt').textContent }); })()`));
ok('P1 note survives reload and previews in the row', A.preview.includes('blocked by car'));
// Phase 2: Reset (finish & save) files the notes with the clean
await ev(`(() => { const base = Date.now() - 3600000;
  runStart = base - 300000; saveStart();
  [['Velmar', 0], ['Mellings', 720000], ['Astona', 1500000]].forEach(([n, off]) => { doneSet.add(n); doneTimes[n] = new Date(base + off).toISOString(); doneVia[n] = 'tap'; });
  refreshAll(); performReset(); return true; })()`); await sleep(400);
A = JSON.parse(await ev(`(() => JSON.stringify({ h: history.length, hn: history[0] ? Object.keys(history[0].notes || {}) : [], live: Object.keys(notes).length, done: doneSet.size }))()`));
ok('P2 clean archived with its notes (cleaned + not-cleaned streets)', A.h === 1 && A.hn.includes('Velmar') && A.hn.includes('Angie'));
ok('P2 live notes cleared for the next clean', A.live === 0 && A.done === 0);
// Phase 3: clean detail screen
await ev(`(() => { openClean(0); return true; })()`); await sleep(400);
A = JSON.parse(await ev(`(() => { const cv = $('cleanView'); const rows = [...cv.querySelectorAll('.cvRow')]; return JSON.stringify({ open: !cv.classList.contains('hidden'), ttl: cv.querySelector('.cvTtl').textContent, meta: cv.querySelector('.cvMeta').textContent, rowNames: rows.map(r => r.querySelector('.cvNm').textContent), firstTm: rows[0] ? rows[0].querySelector('.cvTm').textContent : '', sec: (cv.querySelector('.cvSec') || {}).textContent || '' }); })()`));
ok('P3 detail opens with the clean totals', A.open && /Clean/.test(A.ttl) && /Total time/.test(A.meta));
ok('P3 streets in mark order with per-street times', JSON.stringify(A.rowNames.slice(0, 3)) === JSON.stringify(['Velmar', 'Mellings', 'Astona']) && /took/.test(A.firstTm));
ok('P3 noted-but-not-cleaned group present', /not cleaned/.test(A.sec));
await ev(`(() => { [...$('cleanView').querySelectorAll('.cvRow')][0].click(); return true; })()`); await sleep(300);
A = JSON.parse(await ev(`(() => { const det = $('cleanView').querySelector('.cvDet'); return JSON.stringify({ vis: det.style.display !== 'none', txt: det.textContent }); })()`));
ok('P3 tapping a street expands its details incl. the note', A.vis && /Time taken/.test(A.txt) && /blocked by car/.test(A.txt));
// Phase 4: delete the clean (two-tap)
await ev(`(() => { $('cleanView').querySelector('.cvDel').click(); return true; })()`); await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ armed: $('cleanView').querySelector('.cvDel').textContent, h: history.length }))()`));
ok('P4 first tap arms the delete', /confirm/.test(A.armed) && A.h === 1);
await ev(`(() => { $('cleanView').querySelector('.cvDel').click(); return true; })()`); await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ h: history.length, ls: localStorage.getItem('snowroute.5w.v2.history'), cvHidden: $('cleanView').classList.contains('hidden') }))()`));
ok('P4 second tap deletes the clean and persists', A.h === 0 && A.ls === '[]' && A.cvHidden);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);

