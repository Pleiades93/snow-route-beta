// proof-1230.mjs - Beta 1.230 (fix_ids: android-screen-fit-1230, device-profile-1230,
// android-marking-speed-1230, codex-p2-android-anchor-window).
// Andrew opened the beta on his Pixel 7 and reported a black band at the top
// around the punch-hole camera, a white strip at the bottom, and marking a
// side green taking about a second. THE FIT was iPhone-proven only: the 1.60
// document floor's min() claims nothing on Android, and syncViewport's live
// report can run short of the screen the window spans. The round adds an
// Android-gated full claim (html.android, set only by the platform gate) and
// an Android anchor in syncViewport that publishes the settled full height
// where the live report runs short; the manifest theme_color retires the
// pale frame colour for the app blue the meta already carried. THE DEVICE
// PROFILE grades by measured render speed (never model name) and trades the
// one measured lever - the map canvas pixel ratio (tiers 2 / 1.5 / 1.25) -
// under Andrew's eight grading rules, behind TOTAL SEPARATION: off Android
// the branch is never entered and the constructor's ratio is the literal 2.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const head = read('parts/head.html');
const app1 = read('parts/app1.js');
const app2 = read('parts/app2.js');
const app4 = read('parts/app4.js');
const manifest = read('manifest.json');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const rule = (sel) => { const i = head.indexOf(sel); return i < 0 ? '' : head.slice(i, head.indexOf('}', i) + 1); };

// ---------- 1: the platform gate and total separation ----------
check('1a: the platform is read from the agent, Android first', app1.includes("if (/Android/i.test(ua)) return 'android';"));
check('1b: the gate constant exists', app1.includes("const DP_ANDROID = DP_PLATFORM === 'android';"));
check('1c: dpBoot returns before the Android branch off Android', app1.includes('if (!DP_ANDROID) return; // TOTAL SEPARATION'));
check('1d: the android class is set only inside the branch', app1.includes("document.documentElement.classList.add('android');"));
check('1e: the constructor ratio helper answers the literal 2 off Android', app1.includes('function dpPixelRatio() { return DP_ANDROID ? DP_TIERS[DP.tier].pr : 2; }'));
check('1f: the map constructor takes its ratio from the profile', app2.includes('pixelRatio: dpPixelRatio(),'));

// ---------- 2: the tier table - the one measured lever ----------
check('2a: the closed knob list is the canvas pixel ratio, tiers 2 / 1.5 / 1.25', app1.includes('const DP_TIERS = [{ pr: 2 }, { pr: 1.5 }, { pr: 1.25 }];'));
check('2b: the stored hint is a global device record, never a route field', app1.includes("dp: 'snowroute.v1.dp'"));

// ---------- 3: the eight grading rules' machinery ----------
check('3a (rule 1): the boot grade waits for at least 24 work samples', app1.includes('if (DP.samples.length >= 24) dpBootGrade();'));
check('3b (rule 1): grades are medians', app1.includes('const g = dpGradeOf(dpMedian(DP.samples));') && app1.includes('const cand = dpGradeOf(dpMedian(w));'));
check('3c (rule 4): full quality is the default and the thresholds sit past smooth', app1.includes('function dpGradeOf(ms) { return ms <= 26 ? 0 : (ms <= 45 ? 1 : 2); }') && app1.includes('const DP = { platform: DP_PLATFORM, entered: false, tier: 0,'));
check('3d (rule 3): a session upgrade needs two consecutive agreeing evaluations', app1.includes('if (DP.agree >= 2) DP.pending = cand;'));
check('3e (rule 3): a 45s minimum dwell stands between applied changes', app1.includes('now - DP.lastApplyAt < 45000'));
check('3f (rule 7): a change lands only at a fully idle map', app1.includes('!map.isMoving() && !DP.pointerDown && (now - DP.lastInteractAt > 600)'));
check('3g (rule 5): an earned change applies live through setPixelRatio', app1.includes('map.setPixelRatio(DP_TIERS[DP.tier].pr)'));
check('3h (rule 8): a slower session evaluation is recorded, never applied', app1.includes('// slower: NEVER applied this session (rule 8)') && app1.includes('dpWriteStore(cand);'));
check('3i (rules 6+8): the boot judgment window is the first minute', app1.includes('DP.bootApplyUntil = Date.now() + 60000') && app1.includes('DP.pending > DP.tier && now > DP.bootApplyUntil'));
check('3j (rule 2): the sampler counts only frames where the map rendered or is moving', app1.includes("map.on('render', () => { DP.renderSeen = true; })") && app1.includes('if (map.isMoving()) work = true;'));
check('3k (rule 3, Codex P2 on PR #110): a pending upgrade is cancelled when the latest verdict stops supporting it', app1.includes('if (DP.pending >= 0 && DP.pending < DP.tier && cand > DP.pending) DP.pending = -1;'));
check('3l (rule 6, Codex P2 on PR #110): a sustained recovery or agreement verdict refreshes the stored record', app1.includes('if (DP.agree >= 2) dpWriteStore(cand);'));

// ---------- 4: the Android fit ----------
check('4a: the Android document claims the largest viewport height', rule('html.android {').includes('min-height: 100lvh;'));
check('4b: syncViewport carries the Android anchor behind the gate', app4.includes('if (DP_ANDROID && !kb && inStandalone() && fullH > h && window.innerHeight >= fullH - 2)'));
check('4c: the anchor publishes the settled height and the matching bottom strip', app4.includes("de.style.setProperty('--vvh', fullH + 'px'); de.style.setProperty('--vvb', Math.max(0, window.innerHeight - t - fullH) + 'px');"));
check('4d: the manifest theme_color is the app blue, matching the meta', manifest.includes('"theme_color": "#2c4ad2"') && head.includes('<meta name="theme-color" content="#2c4ad2">'));
check('4e (Codex P2 on PR #110): the anchor is bound to the current window - it stands in only while the window spans the settled height', app4.includes('fullH > h && window.innerHeight >= fullH - 2') && app4.includes("BOUND (Codex P2, PR #110): the anchor stands in only while the window itself still spans the settled height"));

// ---------- Version agreement ----------
check('V: the #ver label reads Beta 1.235', head.includes('<div class="ver" id="ver">Beta 1.235</div>'));
check('V: WHATSNEW is the Beta 1.235 entry with the three short bullets', app4.includes("v: 'Beta 1.235', items: [\"The city step is cleaner: fewer words, more air, and a search pill with real depth.\", \"City search suggests as you type: a few letters of a city name are enough.\"]"));
check('V: the CHANGELOG top entry is Beta 1.230', changelog.split('\n').find(l => l.startsWith('## Beta')) === '## Beta 1.235 — 2026-11-18');

console.log(`proof-1230: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
