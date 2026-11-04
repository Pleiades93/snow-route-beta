// Self-test for tests/browser/run.mjs (audit finding T-01, 2026-10-28).
// Writes throwaway fixture drives, runs the real runner against each one,
// and asserts the runner's verdict (its process exit code) is correct for:
//   fixture-ok       passing result block, exit 0          -> runner PASS
//   fixture-lie      passing result block, exit 3          -> runner FAIL
//   fixture-fail     one failed check in the block, exit 0 -> runner FAIL
//   fixture-exc      exceptions in the block, exit 0       -> runner FAIL
//   fixture-noblock  no result block at all, exit 0        -> runner FAIL
//   fixture-empty    result block with ZERO checks, exit 0 -> runner FAIL
//                    (Beta 1.94, deep audit SR-193-06: an empty checks array
//                    used to pass - a drive that ran nothing proved nothing)
//   fixture-hang     never prints, never exits             -> runner FAIL
//                    (killed via RUNNER_TIMEOUT_MS, set short for this test)
//   fixture-truthy   a check recorded as 1 (truthy, not    -> runner FAIL
//                    true) in the block, exit 0               (Beta 1.95,
//                    SR-194-07: only literal true passes)
//   fixture-throw    a REAL drive whose page evaluation    -> runner FAIL
//                    throws - with the strict harness the     (Beta 1.95,
//                    drive crashes and prints no block;       SR-194-07)
//                    with the old {error} return it printed
//                    a passing block. Needs a browser
//                    (CHROME_BIN), unlike the print-only
//                    fixtures above.
// Fixtures are deleted afterwards, pass or fail. No browser is needed:
// the fixtures only print the JSON block the runner parses.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOCK = (checks, exceptions) => `console.log(JSON.stringify({ checks: ${JSON.stringify(checks)}, exceptions: ${exceptions} }));`;
const FIXTURES = {
  'fixture-ok': BLOCK([['a', true], ['b', true]], 0),
  'fixture-lie': BLOCK([['a', true]], 0) + '\nprocess.exit(3);',
  'fixture-fail': BLOCK([['a', true], ['b', false]], 0),
  'fixture-exc': BLOCK([['a', true]], 2),
  'fixture-noblock': `console.log('just noise, no result block');`,
  'fixture-empty': BLOCK([], 0),
  'fixture-hang': `setInterval(() => {}, 1000);`,
  'fixture-truthy': BLOCK([['a', 1], ['b', true]], 0),
  'fixture-throw': [
    "import { launchDrive, finish, PATTERNS_GITHUB_IO } from './harness.mjs';",
    'const { proc, ev } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });',
    'const R = { checks: [], exceptions: [] };',
    'const ok = (name, cond) => R.checks.push([name, cond === true]);',
    "ok('a throwing page evaluation must fail the drive, not pass it', await ev(`(() => { throw new Error('fixture boom') })()`));",
    'finish(R, proc);',
  ].join('\n'),
};
const EXPECT_PASS = { 'fixture-ok': true };

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failures++; };

try {
  for (const [name, src] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(HERE, name + '.mjs'), src + '\n');
  }
  for (const name of Object.keys(FIXTURES)) {
    const env = { ...process.env, RUNNER_TIMEOUT_MS: '2500' };
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(HERE, 'run.mjs'), name], { cwd: HERE, env, encoding: 'utf8', timeout: 60000 });
    const elapsed = Date.now() - t0;
    const wantPass = !!EXPECT_PASS[name];
    check(`${name}: runner exit ${wantPass ? 0 : 1}`, (r.status === 0) === wantPass);
    check(`${name}: runner printed a verdict`, new RegExp(name + ':.*(PASS|FAIL)').test(r.stdout || ''));
    if (name === 'fixture-hang') check('fixture-hang: killed promptly by the runner timeout', elapsed < 30000);
  }
  // One combined run: a single bad drive must fail the whole suite.
  const all = spawnSync(process.execPath, [path.join(HERE, 'run.mjs'), ...Object.keys(FIXTURES)], { cwd: HERE, env: { ...process.env, RUNNER_TIMEOUT_MS: '2500' }, encoding: 'utf8', timeout: 120000 });
  check('combined run: exit 1 when any drive fails', all.status === 1);
  check('combined run: summary line reports FAIL', /BROWSER TESTS: FAIL/.test(all.stdout || ''));
} finally {
  for (const name of Object.keys(FIXTURES)) {
    try { fs.unlinkSync(path.join(HERE, name + '.mjs')); } catch {}
  }
}
console.log(failures === 0 ? 'RUNNER SELF-TEST: PASS' : `RUNNER SELF-TEST: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
