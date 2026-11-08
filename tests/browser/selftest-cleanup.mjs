// Cleanup-ownership fixtures (Improvement Tranche 1, 2026-11-07).
// Codex's verify of the improvement scan found that a drive which threw
// mid-run, or was killed at the runner timeout, left its Chrome running:
// run.mjs killed only the drive's Node process, and the bespoke rigs
// clean their browsers up only on their success tails. Orphans then
// compounded the local rig's contention across a battery (flake log,
// 2026-11-07 night: killed drive150 attempts left browsers behind).
//
// Ownership now sits in two places: run.mjs spawns each drive detached
// and terminates the drive's whole process GROUP on every exit path,
// and harness.mjs registers every launched browser for an exit hook.
// These fixtures prove the system property end to end through the real
// runner: a drive rigged to THROW after launching, and a drive rigged
// to HANG past the runner timeout, each leave ZERO browsers behind -
// the fixture's own Chrome pid must be dead, and the machine's Chrome
// process count must return to its pre-run baseline.
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME_BIN || (fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : 'google-chrome');
const BASE = path.basename(CHROME);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failures++; };

function chromeCount() {
  // pgrep -c prints ONE line holding the bare count ("3"), not one line per
  // process: PARSE the integer. (Verify cycle 1, 2026-11-07: this helper
  // originally counted output lines, so every positive population read as 1
  // and the return-to-baseline check below could pass despite leaks.)
  try { return parseInt(execFileSync('pgrep', ['-fc', BASE], { encoding: 'utf8' }).trim(), 10) || 0; }
  catch { return 0; } // pgrep exits 1 when nothing matches (it still prints "0")
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitDead(pid, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (!alive(pid)) return true; await sleep(200); } return !alive(pid); }
async function waitBaseline(base, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (chromeCount() <= base) return true; await sleep(250); } return chromeCount() <= base; }

const FIXTURES = {
  'fixture-orphan-throw': [
    "import fs from 'node:fs';",
    "import { launchDrive } from './harness.mjs';",
    'const { proc } = await launchDrive({});',
    'fs.writeFileSync(process.env.ORPHAN_PIDFILE, String(proc.pid));',
    "throw new Error('fixture: deliberate mid-run throw');",
  ].join('\n'),
  'fixture-orphan-hang': [
    "import fs from 'node:fs';",
    "import { launchDrive } from './harness.mjs';",
    'const { proc } = await launchDrive({});',
    'fs.writeFileSync(process.env.ORPHAN_PIDFILE, String(proc.pid));',
    'setInterval(() => {}, 1000);',
  ].join('\n'),
};

try {
  for (const [name, src] of Object.entries(FIXTURES)) fs.writeFileSync(path.join(HERE, name + '.mjs'), src + '\n');
  const baseline = chromeCount();
  console.log(`baseline: ${baseline} ${BASE} process(es) before the fixtures`);

  for (const [name, timeout] of [['fixture-orphan-throw', '60000'], ['fixture-orphan-hang', '4000']]) {
    const pidfile = path.join(os.tmpdir(), name + '-' + Date.now() + '.pid');
    const r = spawnSync(process.execPath, [path.join(HERE, 'run.mjs'), name], {
      cwd: HERE, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, CHROME_BIN: CHROME, RUNNER_TIMEOUT_MS: timeout, ORPHAN_PIDFILE: pidfile },
    });
    check(`${name}: runner FAILs the drive (no pass on a dead drive)`, r.status === 1 && new RegExp(name + ':.*FAIL').test(r.stdout || ''));
    if (name === 'fixture-orphan-hang') check('fixture-orphan-hang: the runner names the timeout', /timed out/.test(r.stdout || ''));
    const pid = Number(fs.existsSync(pidfile) ? fs.readFileSync(pidfile, 'utf8') : 0);
    check(`${name}: the fixture really launched a browser (pid recorded)`, pid > 0);
    if (pid > 0) check(`${name}: its browser is DEAD after the run`, await waitDead(pid, 8000));
    check(`${name}: chrome count returns to baseline (no orphans left)`, await waitBaseline(baseline, 8000));
    try { fs.unlinkSync(pidfile); } catch {}
  }
} finally {
  for (const name of Object.keys(FIXTURES)) { try { fs.unlinkSync(path.join(HERE, name + '.mjs')); } catch {} }
}
console.log(failures === 0 ? 'CLEANUP SELF-TEST: PASS' : `CLEANUP SELF-TEST: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
