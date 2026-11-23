import { readFileSync } from 'node:fs';

// Beta 1.269 (CREATE SHEET FIXES round, Andrew's calls of 2026-11-21, both
// from his live use of Beta 1.267):
//
// (1) THE DONE FLIGHT GOES FLAT AND FITS THE FREE SCREEN. 1.267's flight
// flew the draft's flat fit tilted to pitch 45 over the full screen; the
// Review sheet covers the screen's bottom half, so the tilted draft slid
// under it. fitDraft now fits into the visible area ABOVE the sheet: the
// bottom padding is the preview sheet's measured offsetHeight plus a
// 24 px comfort margin, and the flight lands at pitch 0. The rendered
// behaviour (landing pitch, the fit's own zoom/centre, every draft point
// above the sheet's top edge) is graded by drive220's C section; this
// proof pins the source shape:
//   1: fitDraft measures the preview sheet (offsetHeight) - no literal
//      sheet height is hard-coded anywhere in the function.
//   2: the fit's padding carries the measured height + 24 at the bottom
//      and the standing 56 at top and sides, through cameraForBounds.
//   3: the flight is flat: flyTo pitch 0 (and no pitch: 45 remains in
//      fitDraft), the fallback fitBounds carries pitch 0 too.
//   4: the empty-draft guard stands (no box, no flight).
//
// (2) THE TRIM PILL: CANCEL BECOMES DESELECT (Andrew's pick, sample C of
// the trim-sheet sample). The bar's slot now removes the road entirely:
//   5: the markup carries #crSbDeselect labelled "Deselect", and no
//      crSbCancel survives anywhere in the parts.
//   6: the button's rule is the renamed #crSbDeselect rule, still red.
//   7: the handler lands on crDeselectSectors, whose removal is
//      crRemoveStreet - the ONE removal path - with the close path's
//      own landing (crMorphTo(crWantedFace()) / syncCrPanel).
//   8: the cancel itself is untouched and lives on the tap-away:
//      crCancelSectors still restores the snapshot, and crMapTap still
//      routes a no-sector tap to it.
//
// (3) THE EDITORIAL: What's New carries BOTH bullets, em-dash free, and
// the CHANGELOG top entry is Beta 1.269 above 1.268.
//
// Run from the repo root:  node tests/proof/proof-1269.mjs

const pick = readFileSync('parts/create-pick.js', 'utf8');
const head = readFileSync('parts/head.html', 'utf8');
const whatsnew = readFileSync('parts/whatsnew.js', 'utf8');
const changelog = readFileSync('CHANGELOG.md', 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name);
  if (cond) pass++; else fail++;
}

const fit = pick.slice(pick.indexOf('function fitDraft()'), pick.indexOf("$('crExit')"));
const desel = pick.slice(pick.indexOf('function crDeselectSectors()'), pick.indexOf('function renderSectorBar()'));

check('1: fitDraft measures the preview sheet (offsetHeight) and hard-codes no sheet height',
  fit.includes("const sheet = $('previewSheet');") && fit.includes('sheet.offsetHeight'));

check('2: the fit padding is the measured sheet height + 24 at the bottom, 56 at top and sides, through cameraForBounds',
  fit.includes('bottom: (sheet ? sheet.offsetHeight : 0) + 24') && fit.includes('top: 56, left: 56, right: 56') && fit.includes('map.cameraForBounds(b, { padding: pad })'));

check('3: the flight is flat - flyTo pitch 0, the fitBounds fallback pitch 0, and no pitch: 45 remains in fitDraft',
  fit.includes('pitch: 0, bearing: 0, duration: 2000') && fit.includes('map.fitBounds(b, { padding: pad, pitch: 0, duration: 800 })') && !fit.includes('pitch: 45'));

check('4: the empty-draft guard stands (computeRouteBox over the filtered roads; no box, no flight)',
  fit.includes('const bb = computeRouteBox(crFilteredRoads()); if (!bb) return;'));

check('5: the bar markup carries #crSbDeselect labelled Deselect, and no crSbCancel survives in head.html or create-pick.js',
  head.includes('<button id="crSbDeselect" type="button">Deselect</button>') && !head.includes('crSbCancel') && !pick.includes('crSbCancel'));

check('6: the deselect rule is the renamed rule, still wearing the app red',
  head.includes('#crSbDeselect { background: transparent; color: #e63a2e;'));

check('7: crDeselectSectors removes through crRemoveStreet (the one removal path) and lands the surface like the close path',
  desel.includes('crRemoveStreet(s);') && desel.includes('crMorphTo(crWantedFace())') && desel.includes('syncCrPanel()') &&
  pick.includes("$('crSbDeselect').addEventListener('click', () => crDeselectSectors());"));

check('8: the cancel is untouched and lives on the tap-away - crCancelSectors restores the snapshot and crMapTap routes no-sector taps to it',
  pick.includes('draft.sectors[s] = crSectorSession.snapshot.slice();') &&
  pick.includes('if (crSectorSession.street) { if (!crSectorTap(e.lngLat)) crCancelSectors(); return; }'));

check('9: What\'s New carries both 1.269 bullets, em-dash free, and the CHANGELOG top entry is Beta 1.269 above 1.268',
  whatsnew.includes('Under the hood: backup and restore now each run through one owner, so exports and restores stay in step.') &&
  whatsnew.includes("Under the hood: backup and restore now each run through one owner, so exports and restores stay in step.") &&
  !whatsnew.includes('—') &&
  changelog.indexOf('## Beta 1.269') > -1 && changelog.indexOf('## Beta 1.269') < changelog.indexOf('## Beta 1.268'));

console.log(`proof-1269: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
