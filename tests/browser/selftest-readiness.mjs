// Asserted-readiness fixtures for harness.mjs's bootThrough (Improvement
// Tranche 1, 2026-11-07). Codex's verify of the improvement scan found
// that bootThrough awaited its boot-readiness polls and IGNORED their
// booleans: an expired window let the drive proceed into scenario
// checks, which then failed under misleading names (or read unsettled
// state and passed on nothing). bootThrough now throws a named
// diagnostic at the expired readiness itself.
//
// These fixtures drive the real bootThrough with fake ev/poll seams -
// no browser needed: a poll that never satisfies one readiness must
// reject the boot with that readiness named, and a fully satisfied
// boot must resolve. A readiness assertion that cannot fail is not an
// assertion (the test-change rule).
import { bootThrough } from './harness.mjs';

let failures = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failures++; };

const evOk = async () => true;
const pollAll = async () => true;
const pollExcept = marker => async expr => !String(expr).includes(marker);

check('a fully satisfied boot resolves', await bootThrough(evOk, pollAll).then(() => true, () => false));

for (const [marker, namePart] of [
  ['loadRoute', 'loadRoute defined'],
  ['__bootAt', 'app booted (__bootAt)'],
  ['routeLoaded', 'route loaded (routeLoaded)'],
  ['splash', 'splash removed'],
  ['isMoving', 'map settled'],
]) {
  const err = await bootThrough(evOk, pollExcept(marker)).then(() => null, e => e);
  check(`an expired "${namePart}" readiness fails the boot, named, with its wait`,
    !!err && /readiness/.test(err.message) && err.message.includes(namePart) && /within \d+ms/.test(err.message));
}

console.log(failures === 0 ? 'READINESS SELF-TEST: PASS' : `READINESS SELF-TEST: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
