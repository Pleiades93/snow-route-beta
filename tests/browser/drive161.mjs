import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // a loaded route - Settings is a bottom-bar tab over the app

// drive161: Beta 1.136 (programme E) - the Settings OPEN smoke. drive125
// and drive145 prove the Settings content deeply on branch runs; this
// drive is the main-push smoke for the takeover itself: the gear opens
// the menu on its main pane with the four section rows and the version
// synced from the app's own label, Status opens and backs out, Backup
// opens with its two actions, and the menu's X closes the takeover.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

await ev(`document.getElementById('setBtn').click(); true`); await sleep(500);
ok('T1 the gear opens Settings on its main pane: four section rows, version synced from the app label', await ev(`(function(){ return document.getElementById('setMenu').classList.contains('open') && document.getElementById('setMainPane').classList.contains('on') && !!document.getElementById('stBtn') && !!document.getElementById('jobBtn') && !!document.getElementById('exportBtn') && !!document.getElementById('aboutBtn') && document.getElementById('setVer').textContent === document.getElementById('ver').textContent; })()`));

await ev(`document.getElementById('stBtn').click(); true`); await sleep(400);
ok('T2 Status opens its pane', await ev(`document.getElementById('setStatusPane').classList.contains('on') && !document.getElementById('setMainPane').classList.contains('on')`));
await ev(`document.getElementById('statusBack').click(); true`); await sleep(400);
ok('T3 Back returns to the main pane', await ev(`document.getElementById('setMainPane').classList.contains('on')`));

await ev(`document.getElementById('exportBtn').click(); true`); await sleep(400);
ok('T4 Backup opens with its two actions (Backup + Restore)', await ev(`document.getElementById('setBackupPane').classList.contains('on') && !!document.getElementById('xBak') && !!document.getElementById('xRes')`));

await ev(`document.getElementById('setClose').click(); true`); await sleep(400);
ok('T5 the menu X closes the takeover', await ev(`!document.getElementById('setMenu').classList.contains('open')`));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
