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

// Beta 1.183 (storage audit §3 items 2 & 4): the storage row carries the platform's MEASURED state -
// the recorded persist() answer plus a live estimate() - and the maps sub-line carries the pack's
// measured bytes. The rig's own persist() answer is a real refusal (headless, uninstalled origin),
// so the natural row is the warn form; the ok and idle forms are driven through storagePersist, the
// recorded answer the feature itself keeps - the feature's state, not a test seam.
// (T2a's usage pattern doubles its regex backslashes for the ev template literal - single, the
// literal would eat them and the pattern would match nothing. That was the first 1.183 run's T2a
// failure: TEST class - the app row read exactly '— not protected · 1 KB used' with the warn icon.)
await poll(`document.getElementById('stValStorage').textContent.includes('not protected')`, 20000);
ok('T2a the storage row reports the measured state: the rig\'s real persist refusal paints warn, with a measured usage figure', await ev(`(function(){ const t = document.getElementById('stValStorage').textContent; return t.includes('not protected') && /\\d+(\\.\\d+)? (B|KB|MB|GB) used/.test(t) && document.getElementById('stIcoStorage').className.includes('warn'); })()`));
ok('T2b the maps sub-line carries the pack\'s measured size beside the file count', await ev(`(async () => { const ps = await packState(); const sub = document.getElementById('stMapsSub').textContent; return ps.bytes >= 0 && sub.includes(ps.total + ' files · ' + fmtStoreSize(ps.bytes) + ' ·'); })()`));
await ev(`storagePersist = true; renderStatus(false); true`);
ok('T2c a recorded persist grant paints the row ok: protected, with the measured usage and quota', await poll(`document.getElementById('stValStorage').textContent.includes('protected') && !document.getElementById('stValStorage').textContent.includes('not protected')`, 15000) && await ev(`document.getElementById('stIcoStorage').className === 'm-chk'`));
await ev(`storagePersist = null; renderStatus(false); true`);
ok('T2d an unreported persist answer paints the row idle - never green', await poll(`document.getElementById('stValStorage').textContent.includes('not reported by this browser')`, 15000) && await ev(`document.getElementById('stIcoStorage').className.includes('idle')`));
await ev(`window.__estOrig161 = navigator.storage.estimate; navigator.storage.estimate = () => Promise.reject(new Error('rig')); storagePersist = true; renderStatus(false); true`);
ok('T2e a rejecting estimate() degrades the row to its unmeasured form - protected, no figure, no throw', await poll(`document.getElementById('stValStorage').textContent.trim() === '— protected'`, 15000));
await ev(`navigator.storage.estimate = window.__estOrig161; storagePersist = false; renderStatus(false); true`); await sleep(300);
await ev(`document.getElementById('statusBack').click(); true`); await sleep(400);
ok('T3 Back returns to the main pane', await ev(`document.getElementById('setMainPane').classList.contains('on')`));

await ev(`document.getElementById('exportBtn').click(); true`); await sleep(400);
ok('T4 Backup opens with its two actions (Backup + Restore)', await ev(`document.getElementById('setBackupPane').classList.contains('on') && !!document.getElementById('xBak') && !!document.getElementById('xRes')`));

await ev(`document.getElementById('setClose').click(); true`); await sleep(400);
ok('T5 the menu X closes the takeover', await ev(`!document.getElementById('setMenu').classList.contains('open')`));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
