import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive172: Beta 1.150 (security-audit fix round, finding
// legacy-migration-fallback-boot-stale-fill) - migrateLegacyRoute copied
// each field only into an ABSENT slot key and judged completion by presence
// parity. If a fill failed partway (quota), the boot fell back to the
// legacy keys for the whole session; any save in that session wrote NEWER
// values to the legacy keys, and the next boot's retry skipped the fields
// that had already landed - the stale partial copy became permanent and the
// marker committed over it. The fix records, per field, the exact value a
// landed migration fill wrote (rk.migfill): on retry a slot value still
// equal to its recorded fill is migration-owned and is re-copied when the
// legacy value has moved on; a slot value that differs from its recorded
// fill was written by someone else (a restore) and wins - which is what
// keeps the 1.94 repair (SR-193-03: never recopy legacy over a newer
// restored slot) intact. The record is deleted once the marker commits.
const R = { checks: [] };
const ok = (name, f) => R.checks.push([name, typeof f === 'function' ? !!f() : f === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const freshBoot = async () => { await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200); };
const seedLegacy = async (done, notes) => { await ev(`(() => { localStorage.setItem(LEGACY_KEYS.done, ${JSON.stringify(done)}); localStorage.setItem(LEGACY_KEYS.notes, ${JSON.stringify(notes)}); localStorage.setItem(LEGACY_KEYS.sides, '{"p":{},"t":{}}'); return true; })()`); };
const slot = async () => J(`({ done: localStorage.getItem(routeKeys('5w').done), notes: localStorage.getItem(routeKeys('5w').notes), sides: localStorage.getItem(routeKeys('5w').sides), marker: localStorage.getItem(routeKeys('5w').mig), fill: localStorage.getItem(routeKeys('5w').migfill) })`);

try {
  // ---- Phase A: the interleaving itself ----
  await freshBoot();
  await seedLegacy('["Velmar"]', '{"Velmar":[]}');
  // one slot key refuses writes (a full disk / quota mid-migration)
  await ev(`(() => { window.__origSetItem = Storage.prototype.setItem; const bad = routeKeys('5w').notes;
    Storage.prototype.setItem = function (k, v) { if (k === bad) throw new Error('QuotaExceededError'); return window.__origSetItem.call(this, k, v); }; return true; })()`);
  await ev(`loadRoute('5w'); true`); await sleep(800); // the migration aborts on the notes fill; the boot falls back to the legacy keys
  await ev(`(() => { Storage.prototype.setItem = window.__origSetItem;
    localStorage.setItem(LEGACY_KEYS.done, '["Mellings"]'); return true; })()`); // a save inside the fallback boot writes the NEWER legacy value
  const retry = await J(`migrateLegacyRoute('5w')`);
  const a = await slot();
  ok('A retry after the storage fault completes (returns ' + JSON.stringify(retry) + ')', retry === true);
  ok('A the newer fallback-boot value wins: slot done is the post-fault legacy value, not the stale partial fill | ' + JSON.stringify(a), a.done === '["Mellings"]');
  ok('A the interrupted field still lands on the retry', a.notes === '{"Velmar":[]}' && a.sides === '{"p":{},"t":{}}');
  ok('A the marker committed and the fill record is retired', a.marker !== null && a.fill === null);

  // ---- Phase B: a slot value someone else rewrote is never stomped ----
  await freshBoot();
  await seedLegacy('["Mellings"]', '{"Mellings":[]}');
  await ev(`(() => { localStorage.setItem(routeKeys('5w').done, '["Astona"]');
    localStorage.setItem(routeKeys('5w').migfill, JSON.stringify({ done: '["Velmar"]' })); return true; })()`); // a recorded fill, then a RESTORE overwrote the slot
  const bMig = await J(`migrateLegacyRoute('5w')`);
  const b = await slot();
  ok('B migration completes beside a restored slot', bMig === true && b.marker !== null);
  ok('B the restored slot value wins over both the recorded fill and the legacy copy | ' + JSON.stringify(b), b.done === '["Astona"]');

  // ---- Phase C: a clean first migration, then the marker governs ----
  await freshBoot();
  await seedLegacy('["Velmar"]', '{"Velmar":[]}');
  await ev(`loadRoute('5w'); true`); await sleep(800);
  const c1 = await slot();
  ok('C a clean migration copies every seeded field verbatim and commits the marker', c1.done === '["Velmar"]' && c1.notes === '{"Velmar":[]}' && c1.sides === '{"p":{},"t":{}}' && c1.marker !== null && c1.fill === null);
  await ev(`localStorage.setItem(LEGACY_KEYS.done, '["Greenpark"]'); true`);
  const c2mig = await J(`migrateLegacyRoute('5w')`);
  const c2 = await slot();
  ok('C once the marker is committed, later legacy edits are ignored', c2mig === true && c2.done === '["Velmar"]');
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
