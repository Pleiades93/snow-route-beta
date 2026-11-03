import fs from 'node:fs';
import { launchDrive, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive({ logDomain: true });
// (the Beta 1.76 route pick happens after the stamped-page reload below - this drive navigates away from the harness page first)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;

// drive116: CSP proof for the stamped build (src/csp-test.html). Asserts the
// policy is present, the app fully works under it (boot, tiles, marking,
// backup), NO CSP violations fire for the app's own resources, and the
// policy BITES: an injected inline script and a foreign external script
// are both refused.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const waitBoot = async () => { for (let i = 0; i < 25; i++) { try { if (await ev(`!!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 12000)) { if (await fn()) return true; await sleep(300); } return false; };
const cspLog = () => consoleLog.filter(c => /Refused to|Content Security Policy|violates the following/i.test(c.text || ''));


// Repo-suite adaptation: the suite boots the unstamped source by default,
// but this drive's subject is the STAMPED page. Stamp a throwaway copy of
// the current source with the repo's own tool (scripts/csp_stamp.py - the
// single source of the policy) and navigate to it; the checks below then
// run against exactly what the Pages build ships. Copy removed at the end.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP_PAGE = path.join(REPO_ROOT, 'src', '.csp-drive116.html');
fs.copyFileSync(path.join(REPO_ROOT, 'src', 'tracker-source.html'), TMP_PAGE);
execFileSync('python3', [path.join(REPO_ROOT, 'scripts', 'csp_stamp.py'), 'apply', TMP_PAGE], { stdio: 'pipe' });
await send('Page.navigate', { url: 'file://' + TMP_PAGE }, S);
await sleep(800);

try {
  await ev(`localStorage.clear(); location.reload(); true`);
  await sleep(500); await waitBoot(); await sleep(2500);
  await bootThrough(ev, poll); // Beta 1.76: the stamped page also boots to the route menu - pick 5W before the GL checks
  ok('P1 app boots under its own CSP (version label live)', await ev(`/^Beta \\d+\\.\\d+$/.test(document.getElementById('ver').textContent)`));
  ok('P2 MapLibre GL loaded from the allowlisted CDN', await ev(`typeof window.maplibregl === 'object'`));
  const pol = await ev(`(function(){ const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); return m ? m.getAttribute('content') : ''; })()`);
  ok('P3 CSP meta present, default-src none + script hash', /^default-src 'none'/.test(pol) && pol.includes("script-src 'sha384-"));
  ok('P4 GL actually ACTIVE under CSP (canvas + glOk + route source)', await until(async () => await ev(`glOk === true && !!document.querySelector('canvas.maplibregl-canvas') && !!map.getSource('centres')`), 25000));
  ok('P5 zero CSP violations from the app itself', cspLog().length === 0);
  await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(500);
  ok('P6 marking works under CSP', await ev(`pieces.Velmar[0] === 1`));
  ok('P7 backup builds under CSP', await ev(`buildBackup().includes('snowroute-backup')`));
  const before = cspLog().length;
  await ev(`(function(){ const s = document.createElement('script'); s.textContent = 'window.__cspPwn = 1;'; document.head.appendChild(s); return true; })()`);
  await sleep(700);
  ok('P8 injected inline script is REFUSED (never ran)', await ev(`typeof window.__cspPwn === 'undefined'`));
  ok('P9 the refusal was logged as a CSP violation', cspLog().length > before);
  const before2 = cspLog().length;
  await ev(`(function(){ const s = document.createElement('script'); s.src = 'https://example.com/evil.js'; document.head.appendChild(s); return true; })()`);
  await sleep(900);
  ok('P10 foreign external script is REFUSED (violation logged)', cspLog().slice(before2).some(c => /example\.com/.test(c.text)));
  ok('P11 CSP allows every host the Protomaps styles actually use, and the retired hosts are gone (2026-10-29 dark-mode regression)', pol.includes('tiles.basemaps.cartocdn.com') && pol.includes('protomaps.github.io') && !pol.includes('versatiles.org') && !pol.includes('https://basemaps.cartocdn.com'));
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
console.log(JSON.stringify(R, null, 1));
// Explicit exit: open CDP/Chrome handles otherwise keep the process alive.
try { fs.rmSync(TMP_PAGE, { force: true }); } catch (e) {}
process.exit(0);
