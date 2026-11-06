// Beta 1.119 test-change gate (the CSP seam): the create-a-route flow makes
// the app's ONLY two calls to third-party web services - Nominatim (street
// search) and the Overpass API (street geometry) - and BOTH origins must be
// named in the stamped page's connect-src, or the app's own
// Content-Security-Policy refuses the calls before they leave the phone
// (Beta 1.118 shipped exactly that defect: search and tap-to-add both died
// behind a "needs internet" toast while the phone was online; drive150's
// in-page fetch stub meant no real request ever met the policy in tests).
// This selftest reads the BUILT page (repo-root index.html - the stamped
// artifact that ships), parses its CSP meta directive by directive, and
// asserts both hosts are connect-src tokens. It FAILS on the 1.118 build
// and PASSES on 1.119. scripts/build-pages.py --check asserts the same
// hosts on the stamped policy at build time; this gate re-proves it
// against the committed artifact in build-and-test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);

let fails = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; };

ok('the built page carries a CSP meta', !!m);
const directives = (m ? m[1] : '').split(';').map(s => s.trim()).filter(Boolean);
const cs = directives.find(d => d === 'connect-src' || d.startsWith('connect-src '));
ok('the policy carries a connect-src directive', !!cs);
const tokens = cs ? cs.split(/\s+/) : [];
ok("connect-src names https://nominatim.openstreetmap.org (create-flow street search)", tokens.includes('https://nominatim.openstreetmap.org'));
ok("connect-src names https://overpass-api.de (create-flow street geometry)", tokens.includes('https://overpass-api.de'));

if (fails) { console.error('selftest-csp-connect-src: ' + fails + ' FAIL'); process.exit(1); }
console.log('selftest-csp-connect-src: all PASS');
