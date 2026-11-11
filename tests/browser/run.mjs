// Runs the deterministic browser drives in tests/browser/ and aggregates
// their results. Each drive boots the app in headless Chromium (via the
// Chrome DevTools Protocol, Node built-ins only), prints a JSON block
//   { checks: [[name, passed], ...], exceptions: <count> }
// as its final output. The verdict is computed here and requires ALL of:
// a parseable result block, every check passed, zero page exceptions, NO
// recorded fatal, and the child exiting with code 0. (Test-suite
// restructure, 2026-11-09: drives record a mid-scenario crash as R.fatal
// in their catch and still print their surviving checks - before this fix
// the runner never read R.fatal, so a drive that died halfway could PASS
// on the checks it happened to complete. A recorded fatal now FAILS the
// drive and is printed in its summary line. Proven by the fixture-fatal
// case in tests/browser/selftest-runner.mjs.) A drive that prints a passing block and
// then terminates abnormally FAILS (audit finding T-01, 2026-10-28), and a
// drive that never finishes is killed at the timeout and FAILS.
// tests/browser/selftest-runner.mjs proves each of these verdicts.
//
// Usage:
//   node tests/browser/run.mjs              # all drives
//   node tests/browser/run.mjs drive83      # one drive
// Browser binary: CHROME_BIN env var, else /opt/meta-chromium/chrome when
// present, else google-chrome from PATH (the drives apply the same rule).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Test-suite restructure (2026-11-09): 73 -> 62 drives. Absorbed and
// deleted: 65/66 (->118), 144 (->86), 122/134/139 (->135), 157/158 (->156),
// 167 (->147), 179 (->178), 119 (->e2e-offline E24). Duplicate checks cut
// only where a line-level proof showed an equal-or-stronger assertion in
// the host; see the restructure record for the per-merge proofs.
const ALL = ['drive83', 'drive86', 'drive88', 'drive89', 'drive114', 'drive115', 'drive116', 'drive117', 'drive118', 'drive120', 'drive121', 'drive123', 'drive124', 'drive125', 'drive126', 'drive127', 'drive128', 'drive129', 'drive130', 'drive131', 'drive132', 'drive133', 'drive135', 'drive136', 'drive140', 'drive141', 'drive142', 'drive143', 'drive145', 'drive146', 'drive147', 'drive148', 'drive149', 'drive150', 'drive151', 'drive152', 'drive153', 'drive154', 'drive155', 'drive156', 'drive159', 'drive160', 'drive161', 'drive162', 'drive163', 'drive164', 'drive165', 'drive166', 'drive168', 'drive169', 'drive170', 'drive171', 'drive172', 'drive173', 'drive174', 'drive175', 'drive176', 'drive177', 'drive178', 'drive180', 'drive181', 'drive182', 'drive183', 'drive184', 'drive185', 'drive186', 'drive187', 'drive188', 'drive189', 'drive190', 'drive191'];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const TIMEOUT_MS = Number(process.env.RUNNER_TIMEOUT_MS) || 300000;

// Tranche 1 (2026-11-07) cleanup ownership: each drive spawns DETACHED,
// so it leads its own process group, and the runner terminates the WHOLE
// group - drive process plus every browser it launched - on every exit
// path (pass, fail, exception, timeout). Before this, the timeout path
// killed only the drive's Node process and an exception exit killed
// nothing at all: the drive's Chrome survived as an orphan, and orphans
// compounded the local rig's contention across a battery (flake log,
// 2026-11-07 night). The harness carries the same ownership inside the
// drive (an exit hook in harness.mjs); this is the runner-side net that
// also covers the bespoke rigs, which spawn their browsers directly.
// Proven by tests/browser/selftest-cleanup.mjs. Verdict logic below is
// untouched - selftest-runner.mjs still proves every verdict.
const liveGroups = new Set();
function killGroup(p) { try { process.kill(-p.pid, 'SIGKILL'); } catch (e) {} try { p.kill('SIGKILL'); } catch (e) {} }
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { for (const p of liveGroups) killGroup(p); process.exit(sig === 'SIGINT' ? 130 : 143); });
}

function runOne(name) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [path.join(HERE, name + '.mjs')], { cwd: HERE, env: process.env, detached: true });
    liveGroups.add(p);
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killGroup(p); }, TIMEOUT_MS);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => { clearTimeout(timer); killGroup(p); liveGroups.delete(p); resolve({ name, code, out, err, timedOut }); });
  });
}

function parseResults(out) {
  const t = out.trim();
  const i = t.lastIndexOf('\n{');
  const start = i >= 0 ? i + 1 : (t.startsWith('{') ? 0 : -1);
  if (start < 0) return null;
  try { return JSON.parse(t.slice(start)); } catch { return null; }
}

let allPass = true;
for (const name of names) {
  const r = await runOne(name);
  if (r.timedOut) {
    console.log(`${name}: FAIL - timed out after ${TIMEOUT_MS}ms and was killed`);
    allPass = false;
    continue;
  }
  const R = parseResults(r.out);
  if (!R || !Array.isArray(R.checks)) {
    console.log(`${name}: FAIL - no result block (exit ${r.code})` + (r.err ? `\n  stderr: ${r.err.slice(0, 300)}` : ''));
    allPass = false;
    continue;
  }
  const failed = R.checks.filter(c => c[1] !== true); // Beta 1.95 (deep audit SR-194-07): a check passes only on literal true - a truthy non-boolean (1, a string, an object) is a FAIL, so a drive cannot pass on a value it never actually verified
  const exc = Array.isArray(R.exceptions) ? R.exceptions.length : (R.exceptions ?? 0);
  const empty = R.checks.length === 0; // Beta 1.94 (deep audit SR-193-06): an empty checks array used to PASS - a drive that ran nothing proved nothing, and a harness break that swallowed a drive's checks would have shipped as green. Zero checks is a failure, named as such.
  const pass = r.code === 0 && !empty && failed.length === 0 && exc === 0 && !R.fatal;
  if (!pass) allPass = false;
  console.log(`${name}: ${R.checks.length - failed.length}/${R.checks.length} checks, ${exc} exceptions - ${pass ? 'PASS' : 'FAIL'}` + (r.code !== 0 ? ` (child exit ${r.code})` : '') + (empty ? ' (no checks ran)' : '') + (R.fatal ? ` FATAL: ${String(R.fatal).slice(0, 300)}` : ''));
  for (const [n] of failed) console.log(`  FAILED: ${n}`);
  if (Array.isArray(R.exceptions)) for (const x of R.exceptions) console.log(`  EXC: ${x}`);
}
console.log(allPass ? 'BROWSER TESTS: PASS' : 'BROWSER TESTS: FAIL');
process.exit(allPass ? 0 : 1);
