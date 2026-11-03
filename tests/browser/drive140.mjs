import { launchDrive, finish, PATTERNS_GITHUB_IO } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120 } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });



// drive140: Beta 1.63 (audit F01) - a note draft belongs to its street.
// The Streets renderer carries an open editor's draft across re-renders
// so typing survives them; before 1.63 the draft was restored into
// WHATEVER street's editor rendered next, so one street's note could
// appear in - and be saved to - another street. Cases: same-street
// re-render keeps the draft (the original intent); switching streets
// finalizes the old editor against ITS street and shows the new street
// its OWN note; an unsaved draft never crosses.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
await sleep(3000);
ok('N0 app boots for the note-draft tests', await poll120(`typeof renderStreets === 'function' && typeof setNoteText === 'function'`, 30000));
await ev(`(() => { setNoteText('Velmar', 'velmar own note'); setNoteText('Mellings', 'mellings own note'); $('streetsBtn').click(); return true; })()`); await sleep(600);
// N4 first (fresh state): same-street re-render keeps an unsaved draft.
await ev(`(() => { noteOpenFor = 'Velmar'; renderStreets(); const ta = document.querySelector('.noteEd textarea'); ta.value = 'unsaved velmar typing'; return true; })()`); await sleep(150);
await ev(`renderStreets()`);
let v = await ev(`document.querySelector('.noteEd textarea') ? document.querySelector('.noteEd textarea').value : null`);
ok('N4 same-street re-render keeps the in-progress draft | ' + v, v === 'unsaved velmar typing');
// N1: switch streets with that draft still unsaved (no input event, so
// no autosave timer is pending - the draft exists only in the editor).
await ev(`(() => { noteOpenFor = 'Mellings'; renderStreets(); return true; })()`); await sleep(200);
v = await ev(`document.querySelector('.noteEd textarea') ? document.querySelector('.noteEd textarea').value : null`);
const velmarSaved = await ev(`noteTextOf('Velmar')`);
ok('N1 switching streets: the new editor shows its OWN note, not the draft | editor ' + JSON.stringify(v), v === 'mellings own note');
ok('N1b the old street draft was finalized against its own street | ' + JSON.stringify(velmarSaved), velmarSaved === 'unsaved velmar typing');
// N2: switch back - Velmar's editor shows Velmar's (now saved) text.
await ev(`(() => { noteOpenFor = 'Velmar'; renderStreets(); return true; })()`); await sleep(200);
v = await ev(`document.querySelector('.noteEd textarea') ? document.querySelector('.noteEd textarea').value : null`);
ok('N2 switching back: Velmar editor shows Velmar text | ' + JSON.stringify(v), v === 'unsaved velmar typing');
// N3: an emptied editor on one street must not blank another's note.
await ev(`(() => { noteOpenFor = 'Mellings'; renderStreets(); const ta = document.querySelector('.noteEd textarea'); ta.value = ''; noteOpenFor = 'Velmar'; renderStreets(); return true; })()`); await sleep(200);
v = await ev(`document.querySelector('.noteEd textarea') ? document.querySelector('.noteEd textarea').value : null`);
const mel = await ev(`noteTextOf('Mellings')`);
ok('N3 emptied Mellings editor: Velmar note untouched, Mellings note cleared by its own editor only | editor ' + JSON.stringify(v) + ' mellings ' + JSON.stringify(mel), v === 'unsaved velmar typing' && mel === '');
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);

