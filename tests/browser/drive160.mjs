import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();

// drive160: Beta 1.136 (programme E) - the create-flow OPEN smoke. The full
// create battery (drives 150-159) proves the flow end to end on branch runs;
// this drive is the main-push smoke for the gate itself: from a cold boot,
// Create opens the doors pane with its three doors and exact sub-lines, the
// manual door opens the city pane with its search input, Back walks back to
// the doors, the list door opens the city-list pane and renders its first
// row (the loading row - the catalogue itself is drive159's subject, not
// this one's), and Back walks home to the main pane. Pane state is read
// from the app's own 'on' classes (the terminal signal), never from
// animation proxies.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

await ev(`localStorage.clear(); true`);
await ev(`location.reload(); true`);
ok('C1 cold boot hands over to the route menu with Create offered', await poll(`(function(){ var sp = document.getElementById('splash'); return !!sp && sp.classList.contains('menu') && document.getElementById('routeMenu').classList.contains('show') && document.getElementById('rmMain').classList.contains('on') && !!document.getElementById('rmCreate'); })()`, 25000));

await ev(`document.getElementById('rmCreate').click(); true`); await sleep(400);
ok('C2 Create opens the doors pane: three doors with their exact sub-lines, the photo door quiet', await ev(`(function(){ var L = document.getElementById('crDoorList'), M = document.getElementById('crDoorManual'), P = document.getElementById('crDoorPhoto'); return document.getElementById('rmCreatePane').classList.contains('on') && !!L && !!M && !!P && L.textContent.indexOf('ready to load instantly') >= 0 && M.textContent.indexOf('loaded from the map service') >= 0 && P.classList.contains('quiet'); })()`));

await ev(`document.getElementById('crDoorManual').click(); true`); await sleep(400);
ok('C3 Search manually opens the city pane with a visible search input', await ev(`(function(){ var i = document.getElementById('crCityInput'); return document.getElementById('rmCityPane').classList.contains('on') && !!i && getComputedStyle(i).display !== 'none'; })()`));

await ev(`document.getElementById('crCityBack').click(); true`); await sleep(400);
ok('C4 Back from the city pane returns to the doors', await ev(`document.getElementById('rmCreatePane').classList.contains('on') && !document.getElementById('rmCityPane').classList.contains('on')`));

await ev(`document.getElementById('crDoorList').click(); true`);
ok('C5 Select from list opens the city-list pane and renders its first row', await poll(`document.getElementById('rmCityListPane').classList.contains('on') && document.getElementById('crCityList').childElementCount >= 1`, 10000));

await ev(`document.getElementById('rmCityListBack').click(); true`); await sleep(400);
await ev(`document.getElementById('rmBack2').click(); true`); await sleep(400);
ok('C6 Back walks home: doors, then the main pane', await ev(`document.getElementById('rmMain').classList.contains('on') && !document.getElementById('rmCreatePane').classList.contains('on')`));

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
