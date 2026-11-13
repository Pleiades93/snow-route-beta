import { launchDrive, finish, bootThrough } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs'; // premise derivation (Tranche 4 / T2, 2026-11-08): expectations about the shipped world derive from source - see pack-expect.mjs
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive88: v5.53 notes + clean detail battery
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;
const rowOf = (n) => `(() => { return [...document.querySelectorAll('.srow')].find(r => r.querySelector('.nm').textContent === '${n}'); })()`; // Beta 1.91: rows are picked BY NAME - the list is colour-sorted now, so a route-order index picks the wrong street
await sleep(3000);
await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76: a reload lands on the route menu
// Phase 1: list buttons + auto-saving notes
await ev(`(() => { $('streetsBtn').click(); return true; })()`); await poll(`document.querySelectorAll('.srow').length > 0`, 10000); // T4: poll the terminal state P1 asserts (the rendered street rows)
let A = JSON.parse(await ev(`(() => { listFilter = 'mains'; renderStreets(); const m = document.querySelectorAll('.srow').length; listFilter = 'secondaries'; renderStreets(); const s = document.querySelectorAll('.srow').length; listFilter = 'mains'; renderStreets(); return JSON.stringify({ rows: m + s, smap: !!document.querySelector('.srow .smap'), snote: !!document.querySelector('.srow .snote') }); })()`)); // Beta 1.109: the list shows one group at a time (6 mains / 28 secondaries) - the row census spans both views
ok('P1 rows carry the pin button and NO note button (v5.55)', A.rows === PACK5W.names && A.smap && !A.snote);
await ev(`(() => { ${'PLACEHOLDER'} return true; })()`.replace('PLACEHOLDER', ''));
await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); r.querySelector('.nwrap').click(); return true; })()`); await poll(`typeof noteOpenFor !== 'undefined' && noteOpenFor === 'Velmar'`, 10000); // T4: poll the terminal state (the editor's open-for flag) P1 asserts
A = JSON.parse(await ev(`(() => JSON.stringify({ ed: !!document.querySelector('.noteEd textarea') }))()`));
ok('P1 name tap opens the note editor', A.ed);
// Beta 1.31: while the editor has focus (the phone keyboard is up) the sheet must hold still.
await poll(`document.body.classList.contains('kb')`, 10000); // T4: poll the terminal state K1 asserts (the keyboard-up body class)
const KB = JSON.parse(await ev(`(() => { const cs = getComputedStyle($('sheet')); return JSON.stringify({ kb: document.body.classList.contains('kb'), dur: cs.transitionDuration, maxH: parseFloat(cs.maxHeight) }); })()`));
ok('K1 keyboard up: sheet stops animating and KEEPS its pre-keyboard size (the 1.31 grow-to-visible-height rule is gone; the keyboard overlays) | ' + JSON.stringify(KB), KB.kb === true && KB.dur === '0s' && KB.maxH === 450); // Beta 1.61: the sheet's ordinary max-height in this rig - unchanged by the keyboard (before 1.61 this asserted the old 1.31 contract, maxH > 800). Beta 1.79: .50 x 900 = 450 (sheets open at half height; .74 x 900 = 666 through 1.78) - unchanged by the keyboard (before 1.61 this asserted the old 1.31 contract, maxH > 800)
await ev(`(() => { document.querySelector('.noteEd textarea').blur(); return true; })()`); await poll(`!document.body.classList.contains('kb')`, 10000); // T4: poll the terminal state K2 asserts (the keyboard-up class gone)
ok('K2 keyboard down: the sheet returns to normal motion', await ev(`document.body.classList.contains('kb')`) === false);
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); ta.value = 'Driveway at #12 blocked by car'; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await poll(`noteTextOf('Velmar').includes('blocked by car') && (localStorage.getItem('snowroute.5w.v4.notes') || '').includes('blocked by car')`, 10000); // Beta 1.184 gate round: poll the terminal state (the debounced save landed in memory AND storage) instead of the old fixed 800ms sleep - on a throttled CI runner the 600ms debounce outlasted the fixed wait and this drive flaked once in PR #22's shard 5 (attempt 1 fail, attempt 2 pass on identical code, plus a local 16/16); the assertions below are unchanged
A = JSON.parse(await ev(`(() => JSON.stringify({ ls: localStorage.getItem('snowroute.5w.v4.notes') || '', hint: document.querySelector('.noteEd .nhint').textContent, nt: noteTextOf('Velmar') }))()`));
ok('P1 note auto-saves to storage (autosave fires on its own - no Save tap needed; Beta 1.184 adds an explicit Save action over the same mechanism)', A.ls.includes('blocked by car') && A.nt.includes('blocked by car'));
ok('P1 editor confirms the save', /Saved/.test(A.hint));
await ev(`(() => { document.querySelector('#filters button[data-f="secondaries"]').click(); return true; })()`); await poll(`!![...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Angie')`, 10000); // T4: poll the terminal state the next step needs (Angie's rendered row). Beta 1.109: Angie lives in the Secondaries group now - select it through the real chip before picking her row
await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Angie'); r.querySelector('.nwrap').click(); return true; })()`); await poll(`typeof noteOpenFor !== 'undefined' && noteOpenFor === 'Angie'`, 10000); // T4: poll the terminal state (the editor's open-for flag) the next steps assert
await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); ta.value = 'Could not clean - gate locked'; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await poll(`noteTextOf('Angie').includes('gate locked')`, 10000); // Beta 1.184 gate round: same terminal-signal wait as the Velmar note above (this is the exact read that flaked in CI)
A = JSON.parse(await ev(`(() => JSON.stringify({ nt: noteTextOf('Angie') }))()`));
ok('P1 note works on a street that is not cleaned', A.nt.includes('gate locked'));
await ev(`(() => { location.reload(); return true; })()`); await sleep(3000);
await ev(`loadRoute('5w'); true`); await sleep(600);
await ev(`(() => { $('streetsBtn').click(); return true; })()`); await poll(`!![...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar')`, 10000); // T4: poll the terminal state the next read needs (Velmar's rendered row)
A = JSON.parse(await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); return JSON.stringify({ preview: r.querySelector('.nt').textContent }); })()`));
ok('P1 note survives reload and previews in the row', A.preview.includes('blocked by car'));
// Phase 2: Reset (finish & save) files the notes with the clean
await ev(`(() => { const base = Date.now() - 3600000;
  runStart = base - 300000; saveStart();
  [['Velmar', 0], ['Mellings', 720000], ['Astona', 1500000]].forEach(([n, off]) => { doneSet.add(n); doneTimes[n] = new Date(base + off).toISOString(); doneVia[n] = 'tap'; });
  refreshAll(); performReset(); return true; })()`); await poll(`history.length === 1 && doneSet.size === 0 && Object.keys(notes).length === 0`, 10000); // T4: poll the terminal state P2 asserts (archived + live state cleared)
A = JSON.parse(await ev(`(() => JSON.stringify({ h: history.length, hn: history[0] ? Object.keys(history[0].notes || {}) : [], live: Object.keys(notes).length, done: doneSet.size }))()`));
ok('P2 clean archived with its notes (cleaned + not-cleaned streets)', A.h === 1 && A.hn.includes('Velmar') && A.hn.includes('Angie'));
ok('P2 live notes cleared for the next clean', A.live === 0 && A.done === 0);
// Phase 3: clean detail screen
await ev(`(() => { openClean(0); return true; })()`); await poll(`!$('cleanView').classList.contains('hidden')`, 10000); // T4: poll the terminal state P3 asserts (the clean view open)
A = JSON.parse(await ev(`(() => { const cv = $('cleanView'); const rows = [...cv.querySelectorAll('.cvRow')]; return JSON.stringify({ open: !cv.classList.contains('hidden'), ttl: cv.querySelector('.cvTtl').textContent, wantTtl: fmtDate3(history[0].at), sub: cv.querySelector('.cvSub').textContent, meta: cv.querySelector('.cvMeta').textContent, rowNames: rows.map(r => r.querySelector('.cvNm').textContent), firstTm: rows[0] ? rows[0].querySelector('.cvTm').textContent : '', sec: (cv.querySelector('.cvSec') || {}).textContent || '' }); })()`));
ok('P3 detail opens with the clean totals', A.open && A.ttl === A.wantTtl && /3 streets · finished/.test(A.sub) && /Streets done in/.test(A.meta) && /Total elapsed/.test(A.meta)); // Beta 1.167 (B3): the single 'Total time' label was retired by the honest-durations change - the detail now shows both intervals under their own labels. Beta 1.184: the header is the redesign's - the date alone (the app's own fmtDate3 of the clean) plus a sub-line of street count and finish clock - where the old header read 'Clean — <date>'
ok('P3 streets in mark order with per-street times', JSON.stringify(A.rowNames.slice(0, 3)) === JSON.stringify(['Velmar', 'Mellings', 'Astona']) && /gap/.test(A.firstTm)); // Beta 1.167 (B3): this seed marks via doneSet/doneTimes with no side stamps, so the first street's per-street time is the stamp-less GAP figure - through 1.166 the same figure was labelled 'took'
ok('P3 noted-but-not-cleaned group present', /not cleaned/.test(A.sec));
await ev(`(() => { [...$('cleanView').querySelectorAll('.cvRow')][0].click(); return true; })()`); await poll(`$('cleanView').querySelector('.cvDet').style.display !== 'none'`, 10000); // T4: poll the terminal state P3 asserts (the detail block shown)
A = JSON.parse(await ev(`(() => { const det = $('cleanView').querySelector('.cvDet'); return JSON.stringify({ vis: det.style.display !== 'none', txt: det.textContent }); })()`));
ok('P3 tapping a street expands its details incl. the note', A.vis && /Gap since previous street/.test(A.txt) && /blocked by car/.test(A.txt)); // Beta 1.167 (B3): the detail's duration line is the relabelled gap (was 'Time taken')
// Phase 4: delete the clean (two-tap)
await ev(`(() => { $('cleanView').querySelector('.cvDel').click(); return true; })()`); await poll(`$('cleanView').querySelector('.cvDel').textContent.includes('confirm')`, 10000); // T4: poll the terminal state P4 asserts (the delete armed)
A = JSON.parse(await ev(`(() => JSON.stringify({ armed: $('cleanView').querySelector('.cvDel').textContent, h: history.length }))()`));
ok('P4 first tap arms the delete', /confirm/.test(A.armed) && A.h === 1);
await ev(`(() => { $('cleanView').querySelector('.cvDel').click(); return true; })()`); await poll(`history.length === 0 && $('cleanView').classList.contains('hidden')`, 10000); // T4: poll the terminal state P4 asserts (clean deleted, view closed)
A = JSON.parse(await ev(`(() => JSON.stringify({ h: history.length, ls: localStorage.getItem('snowroute.5w.v2.history'), cvHidden: $('cleanView').classList.contains('hidden') }))()`));
ok('P4 second tap deletes the clean and persists', A.h === 0 && A.ls === '[]' && A.cvHidden);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);

