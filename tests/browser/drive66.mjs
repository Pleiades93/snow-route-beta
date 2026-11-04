import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive66 tail: v5.39 restore suite only (drive65 Phase B fix: recapture backup after reload)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const toast = async () => await ev(`(() => $('toast').textContent)()`);
await sleep(3200);

await ev(`(() => { markDone('Columbus', 'tap'); saveAll(); saveHistory(); window.__good = buildBackup(); return true; })()`);
await sleep(300);
await ev(`(() => { markDone('Galloway', 'tap'); return true; })()`);
await sleep(300);
await ev(`(() => { $('xText').value = window.__good; doRestore(); return true; })()`);
await sleep(2200);
await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76: the restore reload lands on the route menu
const B1 = JSON.parse(await ev(`(() => JSON.stringify([...doneSet]))()`));
ok('B1 valid backup restores exactly', JSON.stringify(B1) === '["Columbus"]');

// recapture AFTER the reload wiped window.__good (the drive65 bug)
await ev(`(() => { saveAll(); saveHistory(); window.__good = buildBackup(); markDone('Galloway', 'tap'); return true; })()`);
await sleep(300);

await ev(`(() => { const p = JSON.parse(window.__good); p.v = 99; $('xText').value = JSON.stringify(p); doRestore(); return true; })()`);
await sleep(400);
ok('B2 unsupported version rejected', (await toast()).includes('Unsupported backup version'));
const B2s = JSON.parse(await ev(`(() => JSON.stringify([...doneSet].sort()))()`));
ok('B2 state untouched', JSON.stringify(B2s) === '["Columbus","Galloway"]');

await ev(`(() => { const p = JSON.parse(window.__good); p.routes['5w'].times = 'not json'; $('xText').value = JSON.stringify(p); doRestore(); return true; })()`);
await sleep(400);
ok('B3 corrupt value rejected', (await toast()).includes('not valid JSON'));
const B3s = JSON.parse(await ev(`(() => JSON.stringify([...doneSet].sort()))()`));
ok('B3 state untouched', JSON.stringify(B3s) === '["Columbus","Galloway"]');

await ev(`(() => { window.__origSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === 'snowroute.5w.v2.history') throw new Error('quota'); return window.__origSet.call(this, k, v); }; $('xText').value = window.__good; doRestore(); return true; })()`);
await sleep(400);
ok('B5 mid-write failure reported', (await toast()).includes('Restore failed'));
const B5s = JSON.parse(await ev(`(() => JSON.stringify([...doneSet].sort()))()`));
ok('B5 rollback keeps pre-restore state', JSON.stringify(B5s) === '["Columbus","Galloway"]');
await ev(`(() => { Storage.prototype.setItem = window.__origSet; return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
ok('no page exceptions', R.exceptions.length === 0);
finish(R, proc);

