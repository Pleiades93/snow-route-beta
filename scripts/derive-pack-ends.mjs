// derive-pack-ends.mjs - Beta 1.259: (re)derive a shipped pack's boundary-end
// records (the pack field `ends`) with the app's OWN computation -
// computeBoundaryEnds (parts/create-packs.js) - run in the assembled page
// against the city pack's street library, the same extract shape the create
// save computes from. The shipped Route 5W pack predates the create flow, so
// its field is derived here rather than at a save; the function is the single
// source either way, and this script is how the stored field is refreshed if
// the pack geometry or the city library ever changes.
//
//   node scripts/derive-pack-ends.mjs [--pack 5w] [--city vaughan] [--write]
//
// Without --write it prints the records JSON. With --write it also replaces
// the pack's `ends` field in parts/data.js (inserted after the pack's box
// line, or replaced in place when one is already there).
// The extract handed to the function is the city library subset touching the
// pack's box grown by 0.01 degrees: a street can only affect a run end by
// crossing within 32 m of it, and every run end sits inside the box, so the
// subset is equivalent to the whole library for this computation.
import { launchDrive, bootThrough } from '../tests/browser/harness.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const packId = opt('--pack', '5w'), cityId = opt('--city', 'vaughan'), write = args.includes('--write');
const city = JSON.parse(fs.readFileSync(new URL('../packs/' + cityId + '.json', import.meta.url), 'utf8'));

const { proc, ev, poll } = await launchDrive({ page: 'tracker-source.html' }); // the page is named explicitly: the harness otherwise takes process.argv[2] as the page name, and this script's own flags (--write etc.) would be navigated to as a page
let out;
try {
  await bootThrough(ev, poll);
  out = JSON.parse(await ev(`(() => {
  const pack = ROUTE_PACKS.find(p => p.id === ${JSON.stringify(packId)});
  if (!pack) return JSON.stringify({ __err: 'no pack ' + ${JSON.stringify(packId)} });
  const g = 0.01, box = pack.box;
  const all = {};
  const CITY = ${JSON.stringify(city.streets)};
  for (const [nm, ways] of Object.entries(CITY)) {
    if (ways.some(w => w.some(p => p[0] >= box.s - g && p[0] <= box.n + g && p[1] >= box.w - g && p[1] <= box.e + g))) all[nm] = ways;
  }
  return JSON.stringify({ ends: computeBoundaryEnds(pack.roads, all) });
})()`));
} finally { try { proc.kill('SIGKILL'); } catch (_) {} } // the browser dies with the script either way - a failed run must not leave it holding the harness's debug port for the next launch
if (out.__err) { console.error(out.__err); process.exit(1); }
const endsJson = JSON.stringify(out.ends);
console.log(endsJson);
if (write) {
  const path = new URL('../parts/data.js', import.meta.url);
  let src = fs.readFileSync(path, 'utf8');
  const boxLine = /^(  box: \{[^}]*\}, \/\/ the pack's offline area.*)$/m;
  if (!boxLine.test(src)) { console.error('data.js: the 5W box line anchor was not found - no write'); process.exit(1); }
  if (/^  ends: \{.*\},\n  roads:/m.test(src)) src = src.replace(/^  ends: \{.*\},\n  roads:/m, '  ends: ' + endsJson + ',\n  roads:');
  else src = src.replace(boxLine, '$1\n  ends: ' + endsJson + ',');
  fs.writeFileSync(path, src);
  console.log('data.js: ends field written for pack ' + packId);
}
