#!/usr/bin/env python3
"""Verdict fixtures for the protocol fix round's gate scripts
(2026-11-17; added on the PR #107 Codex P1 - judging logic ships
with fixtures, docs/TESTING.md rule 1).

scripts/check-tier-map.py, scripts/check-proof-coverage.py,
scripts/run-proofs.py, scripts/push.py (plan mode),
scripts/sweep-check.py, scripts/check-receipts.py (the mutation-
receipt gate, /correct Phase 3 round (b)),
scripts/check-census.py (the sibling-census gate, round (c)) and
scripts/check-mirrors.py (the mirrors gate, round (d)) all
decide pass/fail for the gate. Running them
against the real repository proves only their happy path; these
fixtures run each script against synthetic trees in a temp directory
and assert BOTH verdicts: the valid tree passes, and every documented
failure class (dangling roster entry, JSON/MD roster drift, a roster
drive outside the runner's ALL list, an unlisted or duplicated proof,
a retirement without a reason, a manifest naming a missing file, a
proof exiting nonzero, a proof timing out, a basename-only push
entry, a parts push missing its derived artifacts, stale derived
artifacts, an omitted assembly input, an input-only push, a
transport landing a wrong blob, a changed check or judge file with
no current mutation receipt, a receipt carrying hashes but no
recorded observation, a receipt naming a check it does not pin, a
parts push with no sibling census, a hand-typed census omitting a
derived door row, a census leaving a derived row unmarked, a
declaration typedef drifted from its source list, a cross-part
global whose home part no longer declares it, an assembled part
outside the foreign-write census and its named exclusions, a
selftest on disk wired nowhere in CI, shard lists hand-edited away
from the generated partition, a judging script missing from the
receipts gate's judge list, a push carrying a drifted mirror) fails.

Run: python3 scripts/gate-fixtures/run-fixtures.py
Exit 0 = every case produced its expected verdict.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PY = sys.executable
failures = []


def run(script, root, env_extra=None):
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    proc = subprocess.run([PY, str(ROOT / "scripts" / script), str(root)],
                          capture_output=True, text=True, env=env, timeout=120)
    return proc.returncode


def check(label, got, want):
    if got == want:
        print(f"PASS: {label} -> exit {got}")
    else:
        failures.append(label)
        print(f"FAIL: {label} -> got exit {got}, want {want}")


def w(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------- tier-map
def tm_tree(base, *, json_family=("drive7",), md_family="7", md_core=None,
            all_drives=("drive1", "drive2", "drive3", "drive4", "drive5",
                        "drive6", "drive7", "drive8"),
            files=("drive1", "drive2", "drive3", "drive4", "drive5",
                   "drive6", "drive7", "drive8")):
    core = ["drive1", "drive2", "drive3", "drive4", "drive5", "drive6"]
    tmap = {"tier_a_core": core,
            "families": {"map": {"drives": list(json_family),
                                 "paths": ["parts/engine.js"]}}}
    w(base / "tests/tier-map.json", json.dumps(tmap))
    w(base / "tests/quarantine.json", json.dumps({"quarantined": []}))
    core_md = md_core if md_core is not None else " ".join(core)
    w(base / "tests/TIER-MAP.md",
      "# Tier map (fixture)\n\n"
      f"Gate: build-and-test + the core set: `{core_md}`.\n\n"
      "| Family | Paths | Drives |\n| --- | --- | --- |\n"
      f"| map | `parts/engine.js` | {md_family} |\n")
    all_src = "const ALL = [" + ",".join(f"'{d}'" for d in all_drives) + "]\n"
    w(base / "tests/browser/run.mjs", all_src)
    for d in files:
        w(base / f"tests/browser/{d}.mjs", "// fixture drive\n")
    return base


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    check("tier-map: a consistent tree passes",
          run("check-tier-map.py", tm_tree(t / "ok")), 0)
    check("tier-map: a roster entry with no drive file fails",
          run("check-tier-map.py", tm_tree(
              t / "dangling", json_family=("drive7", "drive99"),
              md_family="7 99")), 1)
    check("tier-map: JSON/MD family drift fails",
          run("check-tier-map.py", tm_tree(
              t / "famdrift", json_family=("drive7", "drive8"),
              md_family="7")), 1)
    check("tier-map: JSON/MD core drift fails",
          run("check-tier-map.py", tm_tree(
              t / "coredrift",
              md_core="drive1 drive2 drive3 drive4 drive5")), 1)
    check("tier-map: a roster drive outside run.mjs ALL fails",
          run("check-tier-map.py", tm_tree(
              t / "notinall", json_family=("drive7", "drive8"),
              md_family="7 8",
              all_drives=("drive1", "drive2", "drive3", "drive4",
                          "drive5", "drive6", "drive7"))), 1)
    check("tier-map: a drive file in no roster fails (completeness)",
          run("check-tier-map.py", tm_tree(
              t / "unregistered",
              files=("drive1", "drive2", "drive3", "drive4", "drive5",
                     "drive6", "drive7", "drive8", "drive9"))), 1)
    check("tier-map: an ALL entry with no drive file fails (completeness)",
          run("check-tier-map.py", tm_tree(
              t / "phantom",
              all_drives=("drive1", "drive2", "drive3", "drive4",
                          "drive5", "drive6", "drive7", "drive8",
                          "drive9"))), 1)

# ----------------------------------------------------------- proof coverage
def pc_tree(base, *, manifest, files):
    for f in files:
        w(base / f"tests/proof/{f}", "// fixture proof\n")
    w(base / "tests/proof/manifest.json", json.dumps(manifest))
    return base


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    good = {"run": ["a.mjs"],
            "retired": [{"file": "b.mjs", "reason": "subject left the app"}]}
    check("proof-coverage: a complete manifest passes",
          run("check-proof-coverage.py",
              pc_tree(t / "ok", manifest=good, files=("a.mjs", "b.mjs"))), 0)
    check("proof-coverage: an unlisted proof file fails",
          run("check-proof-coverage.py",
              pc_tree(t / "unlisted", manifest=good,
                      files=("a.mjs", "b.mjs", "c.mjs"))), 1)
    check("proof-coverage: a duplicated listing fails",
          run("check-proof-coverage.py",
              pc_tree(t / "dup",
                      manifest={"run": ["a.mjs", "a.mjs"], "retired": []},
                      files=("a.mjs",))), 1)
    check("proof-coverage: a retirement without a reason fails",
          run("check-proof-coverage.py",
              pc_tree(t / "noreason",
                      manifest={"run": ["a.mjs"],
                                "retired": [{"file": "b.mjs", "reason": " "}]},
                      files=("a.mjs", "b.mjs"))), 1)
    check("proof-coverage: a manifest naming a missing file fails",
          run("check-proof-coverage.py",
              pc_tree(t / "ghost",
                      manifest={"run": ["ghost.mjs"], "retired": []},
                      files=("a.mjs",))), 1)

# --------------------------------------------------------------- run-proofs
def rp_tree(base, *, manifest, proofs):
    for name, src in proofs.items():
        w(base / f"tests/proof/{name}", src)
    w(base / "tests/proof/manifest.json", json.dumps(manifest))
    return base


PASS_PROOF = "console.log('ok')\n"
FAIL_PROOF = "console.error('boom'); process.exit(3)\n"
SLOW_PROOF = "setTimeout(() => {}, 5000)\n"
with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    check("run-proofs: an all-pass manifest passes",
          run("run-proofs.py", rp_tree(
              t / "ok", manifest={"run": ["p.mjs"], "retired": []},
              proofs={"p.mjs": PASS_PROOF})), 0)
    check("run-proofs: a proof exiting nonzero fails the run",
          run("run-proofs.py", rp_tree(
              t / "badexit", manifest={"run": ["p.mjs"], "retired": []},
              proofs={"p.mjs": FAIL_PROOF})), 1)
    check("run-proofs: a manifest naming a missing proof fails the run",
          run("run-proofs.py", rp_tree(
              t / "ghost", manifest={"run": ["ghost.mjs"], "retired": []},
              proofs={})), 1)
    check("run-proofs: a proof past its timeout fails the run",
          run("run-proofs.py", rp_tree(
              t / "slow", manifest={"run": ["p.mjs"], "retired": []},
              proofs={"p.mjs": SLOW_PROOF}),
              env_extra={"PROOF_TIMEOUT_S": "1"}), 1)

# ---------------------------------------------------------------- push path
def run_push(root, files, mode="plan", env_extra=None):
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    proc = subprocess.run([PY, str(ROOT / "scripts" / "push.py"), mode, str(root),
                           "--branch", "fixture", "--message", "fixture"] + files,
                          capture_output=True, text=True, timeout=120, env=env)
    return proc.returncode


def push_tree(base, *, files):
    for rel in files:
        w(base / rel, "fixture\n")
    return base


def run_receipts(root, changed):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "check-receipts.py"), "gate",
                           str(root), "--changed"] + changed,
                          capture_output=True, text=True, timeout=120)
    return proc.returncode


def issue_receipt(root, rid, check_path, kind, files):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "check-receipts.py"), "issue",
                           str(root), "--id", rid, "--check", check_path,
                           "--kind", kind, "--mutation", "fixture mutation",
                           "--red", "fixture red", "--green", "fixture green",
                           "--issued", "gate-fixtures"] +
                          [a for f in files for a in ("--file", f)],
                          capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, proc.stdout + proc.stderr


def patch_branch(base, rel, text):
    """Set (or, with text=None, remove) the mock branch's blob for a
    path, so a fixture can pose as a branch that holds an older -
    or no - version of a file the local tree carries."""
    import base64
    import hashlib
    state_path = base / "mock-state.json"
    s = json.loads(state_path.read_text())
    if text is None:
        s["blobs"].pop(rel, None)
    else:
        data = text.encode()
        h = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        s["blobs"][rel] = h
        s["contents"][h] = base64.b64encode(data).decode()
    state_path.write_text(json.dumps(s))


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    check("push: a basename-only entry for a file that lives in a directory is refused",
          run_push(push_tree(t / "base", files=["parts/app3.js"]), ["app3.js"]), 1)
    check("push: a parts file without its derived artifacts is refused",
          run_push(push_tree(t / "nderiv", files=["parts/app3.js", "src/tracker-source.html",
                                                  "index.html"]),
                   ["parts/app3.js"]), 1)
    check("push: a non-parts set of repo-relative paths passes plan",
          run_push(push_tree(t / "ok", files=["docs/x.md", "scripts/y.py"]),
                   ["docs/x.md", "scripts/y.py"]), 0)
    check("push: a bare name that exists only at the root passes plan",
          run_push(push_tree(t / "root", files=["README.md"]), ["README.md"]), 0)
    check("push: a ./-spelled parts entry still meets the derived-artifact guard",
          run_push(push_tree(t / "dotderiv", files=["parts/app3.js", "src/tracker-source.html",
                                                    "index.html"]),
                   ["./parts/app3.js"]), 1)
    check("push: a ./-spelled basename is refused like the plain basename",
          run_push(push_tree(t / "dotbase", files=["parts/app3.js"]), ["./app3.js"]), 1)

# Push-mode judging (freshness, prospective tree, blob verification)
# runs against a MOCK helper: a module whose api() serves a canned
# branch tree from a state file, and whose CLI form 'pushes' by
# recording the blobs it read. The fixture trees carry a stub
# build-pages.py whose --check is a toy assembly: the tracker must
# equal the concatenated parts and index.html must carry the
# CHANGELOG's Beta version - enough shape for push.py's own judging
# to bite or pass on the tree it is handed. (Codex P1 on PR #146:
# before these, neutering derived_fresh / preflight_prospective /
# do_push left the whole fixture suite green.)
STUB_BUILD_PAGES = '''import re, sys
from pathlib import Path
root = Path.cwd()
parts = sorted(p for p in (root / "parts").glob("*") if p.is_file()) if (root / "parts").exists() else []
expect = "".join(p.read_text() for p in parts)
tracker = root / "src" / "tracker-source.html"
if not tracker.exists() or tracker.read_text() != expect:
    print("ASSEMBLY FAIL (fixture stub)"); sys.exit(1)
cl = (root / "CHANGELOG.md").read_text() if (root / "CHANGELOG.md").exists() else ""
m = re.search(r"## Beta (\\S+)", cl)
idx = (root / "index.html").read_text() if (root / "index.html").exists() else ""
if m and ("Beta " + m.group(1)) not in idx:
    print("VERSION FAIL (fixture stub)"); sys.exit(1)
sys.exit(0)
'''
MOCK_HELPER = '''import base64, hashlib, json, os, sys
STATE = os.environ["SNOW_MOCK_STATE"]
def _blob(data): return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\\0" + data).hexdigest()
def _load(): return json.load(open(STATE))
def _save(s): json.dump(s, open(STATE, "w"))
def api(method, path):
    s = _load()
    if "/git/ref/" in path: return {"object": {"sha": s["head"]}}
    if "/git/trees/" in path: return {"tree": [{"path": p, "sha": h, "type": "blob"} for p, h in s["blobs"].items()]}
    if "/git/blobs/" in path: return {"content": s["contents"][path.rsplit("/", 1)[1]]}
    raise Exception("mock: unhandled " + path)
if __name__ == "__main__":
    pairs = [a for a in sys.argv[1:] if "=" in a and not a.startswith("--")]
    s = _load()
    for pr in pairs:
        local, remote = pr.split("=", 1)
        data = open(local, "rb").read()
        if os.environ.get("SNOW_MOCK_CORRUPT") and remote.endswith("index.html"):
            data = b"corrupted-by-mock"
        h = _blob(data)
        s["blobs"][remote] = h
        s["contents"][h] = base64.b64encode(data).decode()
    s["head"] = "mockhead2"
    _save(s)
    print(json.dumps({"verified": True}))
'''


def push_tree2(base, *, parts, changelog, tracker, index, branch_parts=None):
    """A buildable fixture tree + the mock branch state for it.
    branch_parts overrides the parts the BRANCH holds (default: the
    same as the local tree). Returns the env for run_push."""
    import base64
    import hashlib
    for name, text in parts.items():
        w(base / "parts" / name, text)
    w(base / "src/tracker-source.html", tracker)
    w(base / "index.html", index)
    w(base / "CHANGELOG.md", changelog)
    w(base / "scripts/build-pages.py", STUB_BUILD_PAGES)
    mock = base / "mock_github.py"
    w(mock, MOCK_HELPER)
    bp = branch_parts if branch_parts is not None else parts
    blobs, contents = {}, {}
    branch_files = {**{f"parts/{k}": v for k, v in bp.items()},
                    "src/tracker-source.html": tracker, "index.html": index,
                    "CHANGELOG.md": changelog}
    for rel, text in branch_files.items():
        data = text.encode()
        h = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        blobs[rel] = h
        contents[h] = base64.b64encode(data).decode()
    state = base / "mock-state.json"
    w(state, json.dumps({"head": "mockhead1", "blobs": blobs, "contents": contents}))
    # A fixture registry whose one grep probe passes against this tree
    # (parts/a.js always carries an "A…"-led body): the registry gate
    # (/correct Phase 3 round (a)) runs on every push-mode fixture, so
    # the mock environment names its registry explicitly - the cases
    # below then break it on purpose.
    registry = base / "fixture-registry.json"
    w(registry, json.dumps({"checks": [
        {"id": "fixture-probe-a", "type": "grep_present",
         "file": str(base / "parts" / "a.js"), "pattern": "A"}]}))
    return {"SNOW_GITHUB_HELPER": str(mock), "SNOW_MOCK_STATE": str(state),
            "SNOW_FIX_CHECKS_REGISTRY": str(registry)}


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    stale = push_tree2(t / "stale", parts={"a.js": "A2", "b.js": "B"}, changelog="## Beta 1.0\n",
                       tracker="AB", index="shell Beta 1.0 AB")
    check("push plan: a parts push whose derived artifacts are stale is refused (freshness)",
          run_push(t / "stale", ["parts/a.js", "src/tracker-source.html", "index.html"]), 1)
    fresh = push_tree2(t / "fresh", parts={"a.js": "A2", "b.js": "B"}, changelog="## Beta 1.0\n",
                       tracker="A2B", index="shell Beta 1.0 A2B")
    check("push plan: a parts push with fresh derived artifacts passes",
          run_push(t / "fresh", ["parts/a.js", "src/tracker-source.html", "index.html"]), 0)
    omit = push_tree2(t / "omit", parts={"a.js": "A2", "b.js": "B2"}, changelog="## Beta 1.0\n",
                      tracker="A2B2", index="shell Beta 1.0 A2B2",
                      branch_parts={"a.js": "A", "b.js": "B"})
    check("push: omitting a differing assembly input is refused (prospective tree)",
          run_push(t / "omit", ["parts/a.js", "src/tracker-source.html", "index.html"],
                   mode="push", env_extra=omit), 1)
    check("push: the full differing set pushes and verifies against the mock branch",
          run_push(t / "omit", ["parts/a.js", "parts/b.js", "src/tracker-source.html", "index.html"],
                   mode="push", env_extra=omit), 0)
    bump = push_tree2(t / "bump", parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 2.0\n",
                      tracker="AB", index="shell Beta 1.0 AB")
    check("push: an input-only push (CHANGELOG version bump, stale derived left behind) is refused",
          run_push(t / "bump", ["CHANGELOG.md"], mode="push", env_extra=bump), 1)
    corrupt = push_tree2(t / "corrupt", parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                         tracker="AB", index="shell Beta 1.0 AB")
    check("push: a transport that lands a wrong blob fails verification",
          run_push(t / "corrupt", ["index.html"], mode="push",
                   env_extra={**corrupt, "SNOW_MOCK_CORRUPT": "1"}), 1)
    # Registry gate (/correct Phase 3 round (a)): the push tree must
    # pass the registry's grep probes - the C1 literal class.
    regfail = push_tree2(t / "regfail", parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                         tracker="AB", index="shell Beta 1.0 AB")
    w(t / "regfail" / "fixture-registry.json", json.dumps({"checks": [
        {"id": "fixture-probe-broken", "type": "grep_present",
         "file": str(t / "regfail" / "parts" / "a.js"), "pattern": "NOT-IN-THE-TREE"}]}))
    check("push: a registry grep probe failing against the push tree refuses the push",
          run_push(t / "regfail", ["index.html"], mode="push", env_extra=regfail), 1)
    regbase = push_tree2(t / "regbase", parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                         tracker="AB", index="shell Beta 1.0 AB")
    w(t / "regbase" / "fixture-registry.json", json.dumps({"checks": [
        {"id": "fixture-probe-broken", "type": "grep_present",
         "file": str(t / "regbase" / "parts" / "a.js"), "pattern": "NOT-IN-THE-TREE"}]}))
    w(t / "regbase" / "fix-checks-standing-failures.json",
      json.dumps({"standing_failures": ["fixture-probe-broken"]}))
    check("push: a failing probe on the standing-failures baseline is tolerated",
          run_push(t / "regbase", ["index.html"], mode="push", env_extra=regbase), 0)
    check("push: a named-but-missing registry refuses (a gate that cannot run is not a pass)",
          run_push(t / "regbase", ["index.html"], mode="push",
                   env_extra={**regbase, "SNOW_FIX_CHECKS_REGISTRY": str(t / "regbase" / "nope.json")}), 1)
    # The gate also runs against the PROSPECTIVE tree (Codex P2 on
    # PR #153): a probe whose fix exists locally but is NOT in the
    # push set must not certify the push - the branch-plus-set tree
    # is what lands, and it still lacks the literal.
    prosp = push_tree2(t / "prosp", parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                       tracker="AB", index="shell Beta 1.0 AB")
    w(t / "prosp" / "docs" / "guard.md", "the REQUIRED-LITERAL lives here\n")
    w(t / "prosp" / "README.md", "fixture\n")
    w(t / "prosp" / "fixture-registry.json", json.dumps({"checks": [
        {"id": "fixture-probe-prospective", "type": "grep_present",
         "file": "/home/hatch/workspace/snow-route-5w/beta1/repo/docs/guard.md",
         "pattern": "REQUIRED-LITERAL"}]}))
    check("push: an unpushed local fix cannot certify the push (prospective-tree registry gate)",
          run_push(t / "prosp", ["README.md"], mode="push", env_extra=prosp), 1)
    check("push: pushing the fixing file itself passes the prospective-tree registry gate",
          run_push(t / "prosp", ["README.md", "docs/guard.md"], mode="push", env_extra=prosp), 0)
    # Receipts gate (/correct Phase 3 round (b)): a changed check or
    # judge file must be named by a CURRENT mutation receipt - rule 6
    # as a precondition, not a hope (class N1). The fixture trees
    # carry a copy of the real scripts/check-receipts.py: push.py
    # loads its gate logic from the push tree, the measuring
    # instrument, exactly as in production.
    def receipts_tree(name, *, proof_text):
        env = push_tree2(t / name, parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                         tracker="AB", index="shell Beta 1.0 AB")
        w(t / name / "scripts" / "check-receipts.py",
          (ROOT / "scripts" / "check-receipts.py").read_text())
        w(t / name / "tests" / "proof" / "proof-9001.mjs", proof_text)
        return env
    rc_new = receipts_tree("rcnew", proof_text="proof v1\n")
    check("push: a new check with no mutation receipt is refused (receipts gate)",
          run_push(t / "rcnew", ["tests/proof/proof-9001.mjs"], mode="push", env_extra=rc_new), 1)
    rc_ok = receipts_tree("rcok", proof_text="proof v1\n")
    issue_receipt(t / "rcok", "fixture-rcok", "tests/proof/proof-9001.mjs", "mutation",
                  ["tests/proof/proof-9001.mjs"])
    check("push: a new check with a current mutation receipt pushes",
          run_push(t / "rcok", ["tests/proof/proof-9001.mjs", "tests/mutation-receipts.json"],
                   mode="push", env_extra=rc_ok), 0)
    rc_stale = receipts_tree("rcstale", proof_text="proof v0\n")
    patch_branch(t / "rcstale", "tests/proof/proof-9001.mjs", "proof v0\n")
    issue_receipt(t / "rcstale", "fixture-rcstale", "tests/proof/proof-9001.mjs", "mutation",
                  ["tests/proof/proof-9001.mjs"])
    w(t / "rcstale" / "tests" / "proof" / "proof-9001.mjs", "proof v1 edited after the receipt\n")
    check("push: a check edited after its receipt was issued is refused (stale receipt)",
          run_push(t / "rcstale", ["tests/proof/proof-9001.mjs", "tests/mutation-receipts.json"],
                   mode="push", env_extra=rc_stale), 1)
    def judge_tree(name, *, cover_judge):
        env = push_tree2(t / name, parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                         tracker="AB", index="shell Beta 1.0 AB")
        w(t / name / "scripts" / "check-receipts.py",
          (ROOT / "scripts" / "check-receipts.py").read_text())
        w(t / name / "scripts" / "push.py", "fixture judge v1\n")
        w(t / name / "scripts" / "gate-fixtures" / "run-fixtures.py", "fixture suite\n")
        patch_branch(t / name, "scripts/push.py", "fixture judge v0\n")
        # The branch already holds the suite and the receipts script,
        # unchanged - a real branch carries every existing file, and
        # the prospective tree must too, or the receipt that pins the
        # suite would read as naming a missing file.
        patch_branch(t / name, "scripts/gate-fixtures/run-fixtures.py", "fixture suite\n")
        patch_branch(t / name, "scripts/check-receipts.py",
                     (ROOT / "scripts" / "check-receipts.py").read_text())
        files = ["scripts/gate-fixtures/run-fixtures.py"]
        if cover_judge:
            files.append("scripts/push.py")
        issue_receipt(t / name, "fixture-" + name, "scripts/gate-fixtures/run-fixtures.py",
                      "mutation", files)
        return env
    rc_judge = judge_tree("rcjudge", cover_judge=False)
    check("push: a changed judge whose receipt names only the suite is refused (receipts gate)",
          run_push(t / "rcjudge", ["scripts/push.py", "tests/mutation-receipts.json"],
                   mode="push", env_extra=rc_judge), 1)
    rc_judge2 = judge_tree("rcjudge2", cover_judge=True)
    check("push: a changed judge named by a current receipt pushes",
          run_push(t / "rcjudge2", ["scripts/push.py", "tests/mutation-receipts.json"],
                   mode="push", env_extra=rc_judge2), 0)

# ------------------------------------------------- mutation receipts
with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    w(t / "tests" / "browser" / "drive9001.mjs", "drive v1\n")
    check("receipts: a changed drive with no receipt is refused by the gate",
          run_receipts(t, ["tests/browser/drive9001.mjs"]), 1)
    issue_receipt(t, "fixture-rendered", "tests/browser/drive9001.mjs", "rendered",
                  ["tests/browser/drive9001.mjs"])
    check("receipts: a rendered-evidence receipt covers its drive (honest kind, not a fake mutation)",
          run_receipts(t, ["tests/browser/drive9001.mjs"]), 0)
    # A receipt is the record of an observation, not a bag of hashes
    # (Codex P2 on PR #155): correct hashes with the evidence fields
    # absent, or a named check the receipt does not pin, cover
    # nothing - the gate must refuse both shapes.
    import hashlib
    drive_sha = hashlib.sha256(
        (t / "tests" / "browser" / "drive9001.mjs").read_bytes()).hexdigest()
    w(t / "tests" / "mutation-receipts.json", json.dumps({"receipts": [
        {"id": "fixture-hash-only",
         "files": {"tests/browser/drive9001.mjs": drive_sha}}]}))
    check("receipts: a hash-only receipt with no recorded observation covers nothing",
          run_receipts(t, ["tests/browser/drive9001.mjs"]), 1)
    w(t / "tests" / "mutation-receipts.json", json.dumps({"receipts": [
        {"id": "fixture-check-not-pinned", "check": "tests/browser/drive9999.mjs",
         "kind": "mutation", "mutation": "m", "red": "r", "green": "g",
         "issued": "gate-fixtures",
         "files": {"tests/browser/drive9001.mjs": drive_sha}}]}))
    check("receipts: a receipt whose named check is not among its pinned files covers nothing",
          run_receipts(t, ["tests/browser/drive9001.mjs"]), 1)
    w(t / "tests" / "mutation-receipts.json", "{not json\n")
    check("receipts: a malformed receipts file refuses the gate (a gate that cannot read its records)",
          run_receipts(t, ["tests/browser/drive9001.mjs"]), 1)

# ------------------------------------------------- sibling census
def run_census_cli(root, subcmd, extra):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "check-census.py"), subcmd,
                           str(root)] + extra,
                          capture_output=True, text=True, timeout=120)
    return proc.returncode


# A miniature confirmation surface shaped like Beta 1.255's first
# submission: the Pace door routes through the guard, the dock door
# (parts/b.js) calls the action directly. The census derivation
# must enumerate both; a census that names only the guarded door
# is the hand-typed shape this gate exists to refuse (class N2).
CENSUS_PART_A = """// A fixture confirmation surface.
let confirmDangerCb = null;
let runStart = null;
function showConfirm(o) { const p = $('confirmPill'); confirmDangerCb = o.onDanger || null; p.classList.remove('hidden'); }
function hideConfirm() { $('confirmPill').classList.add('hidden'); confirmDangerCb = null; }
function cancelStart() { runStart = null; }
function wirePace() {
  const c = $('paceCancel'); if (c) c.addEventListener('click', () => { showConfirm({ onDanger: () => { cancelStart(); } }); });
}
$('cfKeep').addEventListener('click', hideConfirm);
"""
CENSUS_PART_B = """// B fixture: the dock door.
$('cancelStartBtn').addEventListener('click', () => { cancelStart(); });
"""
CENSUS_ANCHORS = {
    "functions": ["showConfirm"],
    "elements": ["confirmPill"],
    "guards": [{"guard": "showConfirm", "action": "cancelStart",
                "surface": "confirmPill", "state": ["runStart"]}],
}


def census_tree(name, *, omit_door=False, leave_unmarked=False):
    """A buildable fixture tree carrying the mini surface, an older
    branch version of both parts, and a census issued through the
    real CLI with every derived row marked - unless the caller asks
    for the hand-typed omission or an unmarked row. Returns env."""
    base = t / name
    env = push_tree2(base, parts={"a.js": CENSUS_PART_A, "b.js": CENSUS_PART_B},
                     changelog="## Beta 1.0\n",
                     tracker=CENSUS_PART_A + CENSUS_PART_B,
                     index="shell Beta 1.0 " + CENSUS_PART_A + CENSUS_PART_B,
                     branch_parts={"a.js": "// A older a\n", "b.js": "// B older b\n"})
    w(base / "scripts" / "check-census.py",
      (ROOT / "scripts" / "check-census.py").read_text())
    w(base / "scripts" / "check-receipts.py",
      (ROOT / "scripts" / "check-receipts.py").read_text())
    # A real branch carries the gate scripts unchanged, so the
    # prospective tree keeps them (and the census pins on them).
    patch_branch(base, "scripts/check-census.py",
                 (ROOT / "scripts" / "check-census.py").read_text())
    patch_branch(base, "scripts/check-receipts.py",
                 (ROOT / "scripts" / "check-receipts.py").read_text())
    anchors = base / "census-anchors.json"
    w(anchors, json.dumps(CENSUS_ANCHORS))
    rows = json.loads(subprocess.run(
        [PY, str(ROOT / "scripts" / "check-census.py"), "derive", str(base),
         "--anchors", str(anchors)], capture_output=True, text=True,
        timeout=120).stdout)["rows"]
    marks = {}
    for r in rows:
        if omit_door and r["id"] == "door:parts/b.js:cancelStartBtn:click":
            continue  # not a mark - the row is deleted from the record below
        if leave_unmarked and r["id"] == "theme:confirmPill":
            continue
        marks[r["id"]] = {"status": "covered", "note": "fixture mark"}
    marks_path = base / "census-marks.json"
    w(marks_path, json.dumps(marks))
    proc = subprocess.run(
        [PY, str(ROOT / "scripts" / "check-census.py"), "issue", str(base),
         "--id", "fixture-census", "--anchors", str(anchors),
         "--changed", "parts/a.js", "--changed", "parts/b.js",
         "--marks", str(marks_path), "--issued", "gate-fixtures"],
        capture_output=True, text=True, timeout=120)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    if omit_door:
        ledger = json.loads((base / "tests" / "sibling-census.json").read_text())
        rec = ledger["rounds"][0]
        rec["rows"] = [r for r in rec["rows"]
                       if r["id"] != "door:parts/b.js:cancelStartBtn:click"]
        w(base / "tests" / "sibling-census.json", json.dumps(ledger, indent=1) + "\n")
    return env


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    no_census = push_tree2(t / "nocensus", parts={"a.js": CENSUS_PART_A, "b.js": CENSUS_PART_B},
                           changelog="## Beta 1.0\n",
                           tracker=CENSUS_PART_A + CENSUS_PART_B,
                           index="shell Beta 1.0 " + CENSUS_PART_A + CENSUS_PART_B,
                           branch_parts={"a.js": "// A older a\n", "b.js": "// B older b\n"})
    w(t / "nocensus" / "scripts" / "check-census.py",
      (ROOT / "scripts" / "check-census.py").read_text())
    w(t / "nocensus" / "scripts" / "check-receipts.py",
      (ROOT / "scripts" / "check-receipts.py").read_text())
    check("push: a parts change with no sibling census is refused (census gate)",
          run_push(t / "nocensus", ["parts/a.js", "parts/b.js", "src/tracker-source.html",
                                    "index.html"],
                   mode="push", env_extra=no_census), 1)
    full = census_tree("censusok")
    check("push: a parts change with a current, fully-marked census pushes",
          run_push(t / "censusok", ["parts/a.js", "parts/b.js", "src/tracker-source.html",
                                    "index.html", "tests/sibling-census.json"],
                   mode="push", env_extra=full), 0)
    omitted = census_tree("censusomit", omit_door=True)
    check("push: a hand-typed census omitting a derived door row is refused (re-derivation)",
          run_push(t / "censusomit", ["parts/a.js", "parts/b.js", "src/tracker-source.html",
                                      "index.html", "tests/sibling-census.json"],
                   mode="push", env_extra=omitted), 1)
    unmarked = census_tree("censusunmarked", leave_unmarked=True)
    check("push: a census leaving a derived row unmarked is refused",
          run_push(t / "censusunmarked", ["parts/a.js", "parts/b.js", "src/tracker-source.html",
                                          "index.html", "tests/sibling-census.json"],
                   mode="push", env_extra=unmarked), 1)
    # Machinery-only: local parts identical to the branch's (no
    # pending parts delta - a differing unpushed part would refuse
    # this push at the prospective build check, PR #146's rule, long
    # before the census gate is consulted).
    mach = push_tree2(t / "censusmach", parts={"a.js": CENSUS_PART_A, "b.js": CENSUS_PART_B},
                      changelog="## Beta 1.0\n",
                      tracker=CENSUS_PART_A + CENSUS_PART_B,
                      index="shell Beta 1.0 " + CENSUS_PART_A + CENSUS_PART_B)
    w(t / "censusmach" / "scripts" / "check-census.py",
      (ROOT / "scripts" / "check-census.py").read_text())
    w(t / "censusmach" / "README.md", "fixture v2\n")
    patch_branch(t / "censusmach", "README.md", "fixture v1\n")
    check("push: a machinery-only push needs no census (the exemption is the round's record, not the gate's)",
          run_push(t / "censusmach", ["README.md"], mode="push", env_extra=mach), 0)
    w(t / "badledger" / "tests" / "sibling-census.json", "{not json\n")
    check("census: a malformed census file refuses the gate (a gate that cannot read its records)",
          run_census_cli(t / "badledger", "gate", ["--changed", "parts/a.js"]), 1)
    check("census: a machinery-only change set passes the CLI gate with no census at all",
          run_census_cli(t / "badledger", "gate", ["--changed", "docs/x.md"]), 0)

    # The three derivation shapes Codex's P2s named on PR #156,
    # pinned at the derive level: a named callback's body is the
    # handler body (and a by-reference registration at end-of-file
    # still rows its exit); two same-event document listeners get
    # distinct row ids; a handler holding both a direct action call
    # and a guarded path is reported as a bypass, never as routed.
    def derive_rows_of(name, parts_map, anchors_obj):
        base = t / name
        for rel, content in parts_map.items():
            w(base / rel, content)
        w(base / "anchors.json", json.dumps(anchors_obj))
        proc = subprocess.run([PY, str(ROOT / "scripts" / "check-census.py"), "derive",
                               str(base), "--anchors", str(base / "anchors.json")],
                              capture_output=True, text=True, timeout=60)
        assert proc.returncode == 0, proc.stdout + proc.stderr
        return {r["id"]: r["source"] for r in json.loads(proc.stdout)["rows"]}

    census_anchors = {"functions": ["showConfirm", "hideConfirm"],
                      "elements": ["confirmPill"],
                      "guards": [{"guard": "showConfirm", "action": "cancelStart",
                                  "surface": "confirmPill", "state": []}]}
    named_rows = derive_rows_of("censusnamed", {"parts/a.js": (
        "function showConfirm(o) { $('confirmPill').classList.remove('hidden'); }\n"
        "function hideConfirm() { $('confirmPill').classList.add('hidden'); }\n"
        "function cancelStart() { }\n"
        "function onDock() { cancelStart(); }\n"
        "$('dockBtn').addEventListener('click', onDock);\n"
        "$('keepBtn').addEventListener('click', hideConfirm);\n")}, census_anchors)
    door = named_rows.get("door:parts/a.js:dockBtn:click", "")
    exit_ref = named_rows.get("exit:parts/a.js:keepBtn:click", "")
    check("census: a named callback's body is the handler body, and a by-reference registration at EOF rows its exit",
          0 if ("BYPASSING" in door and "by reference" in exit_ref) else 1, 0)

    dup_rows = derive_rows_of("censusdup", {"parts/a.js": (
        "function hideConfirm() { $('confirmPill').classList.add('hidden'); }\n"
        "document.addEventListener('pointerdown', e => { if (!e.target.closest('#confirmPill')) closeSheets(); });\n"
        "document.addEventListener('pointerdown', e => { hideConfirm(); });\n")}, census_anchors)
    dup_exits = {k: v for k, v in dup_rows.items() if k.startswith("exit:parts/a.js:document:pointerdown")}
    check("census: two same-event document listeners derive two distinct exit rows (no collapsed sibling)",
          0 if (set(dup_exits) == {"exit:parts/a.js:document:pointerdown",
                                   "exit:parts/a.js:document:pointerdown#2"}
                and any("exempts #confirmPill" in v for v in dup_exits.values())
                and any("does NOT exempt #confirmPill" in v for v in dup_exits.values())) else 1, 0)

    mixed_rows = derive_rows_of("censusmixed", {"parts/a.js": (
        "function showConfirm(o) { if (o && o.onDanger) o.onDanger(); }\n"
        "function cancelStart() { }\n"
        "$('mixBtn').addEventListener('click', () => { if (window.runStart) cancelStart(); "
        "else showConfirm({onDanger: () => cancelStart()}); });\n")}, census_anchors)
    mixed_door = mixed_rows.get("door:parts/a.js:mixBtn:click", "")
    check("census: a handler with both a direct action call and a guarded path is a bypass, never a routed door",
          0 if ("BYPASSING" in mixed_door and "unguarded" in mixed_door) else 1, 0)

    # The fourth shape, from the PR #156 fix round's own re-review:
    # an exit row suppresses the gesture row only for the SAME
    # registration - a second same-event handler that touches an
    # anchor without dismissing still derives its gesture row.
    gesture_anchors = {"functions": ["hideConfirm", "openerElOf"],
                       "elements": ["confirmPill"],
                       "guards": [{"guard": "showConfirm", "action": "cancelStart",
                                   "surface": "confirmPill", "state": []}]}
    gesture_rows = derive_rows_of("censusgesture", {"parts/a.js": (
        "function hideConfirm() { $('confirmPill').classList.add('hidden'); }\n"
        "function openerElOf(t) { return t; }\n"
        "document.addEventListener('pointerdown', e => { if (!e.target.closest('#confirmPill')) closeSheets(); });\n"
        "document.addEventListener('pointerdown', e => { openerElOf(e.target); });\n")}, gesture_anchors)
    check("census: one handler's exit row does not suppress a different same-event handler's gesture row",
          0 if ("exit:parts/a.js:document:pointerdown" in gesture_rows
                and "gesture:parts/a.js:document:pointerdown" in gesture_rows) else 1, 0)

# ------------------------------------------------------------- sweep check
def run_sweep(root, olds):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "sweep-check.py"), str(root),
                           "--no-registry"] + [a for s in olds for a in ("--old", s)],
                          capture_output=True, text=True, timeout=120)
    return proc.returncode


def sweep_tree(base, *, files):
    for rel, text in files.items():
        w(base / rel, text)
    return base


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    check("sweep: a surviving old string in the tests tree fails the sweep",
          run_sweep(sweep_tree(t / "stale", files={"tests/browser/drive1.mjs": "x.includes('finish stopped')\n"}),
                    ["finish stopped"]), 1)
    check("sweep: a tree without the old string passes",
          run_sweep(sweep_tree(t / "clean", files={"tests/browser/drive1.mjs": "x.includes('Finish stopped')\n"}),
                    ["finish stopped"]), 0)
    check("sweep: the backslash-escaped form of an old string is also caught",
          run_sweep(sweep_tree(t / "esc", files={"tests/browser/drive1.mjs": "x === 'it\\'s gone'\n"}),
                    ["it's gone"]), 1)
    check("sweep: the regex-escaped form of an old string is also caught",
          run_sweep(sweep_tree(t / "resc", files={"tests/browser/drive1.mjs": "/not saving \\(sides\\)/.test(t)\n"}),
                    ["not saving (sides)"]), 1)
    missing_reg = subprocess.run([PY, str(ROOT / "scripts" / "sweep-check.py"), str(t / "clean"),
                                  "--registry", "/definitely/missing/fix-checks.json",
                                  "--old", "anything"], capture_output=True, text=True, timeout=120)
    check("sweep: a missing registry is an error, never a silent clean sweep",
          missing_reg.returncode, 2)
    check("sweep: a root without a tests directory is an error, never a silent clean sweep",
          run_sweep(t / "no-such-root", ["anything"]), 2)
    check("sweep: a mixed-quote old string is caught in its single-quoted literal form",
          run_sweep(sweep_tree(t / "mixq", files={"tests/browser/drive1.mjs": "x.includes('couldn\\'t save \"Town\"')\n"}),
                    ["couldn't save \"Town\""]), 1)

# ------------------------------------------------------- mirror check
def run_mirrors(root):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "check-mirrors.py"), str(root)],
                          capture_output=True, text=True, timeout=120)
    return proc.returncode


def mirrors_tree(base, *, pack_typedef="name: string, ends: {}",
                 home_global="glThing", extra_parts=(), unwired=False,
                 swap_shards=False, extra_judge=False):
    """A miniature tree whose mirrors all agree, built consistent by
    construction (the shard lists are the real generator's partition
    of the fixture roster); each keyword breaks exactly one family."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "fixture_gen_shards", ROOT / "scripts" / "gen-shards.py")
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)
    drives = [f"drive{i}" for i in range(1, 9)]
    shards = gen.partition(drives, {})[0]
    if swap_shards:
        shards[0][0], shards[1][0] = shards[1][0], shards[0][0]
    parts_list = ", ".join(f'"{p}"' for p in
                           ("head.html", "app1.js", "brand-snow.js") + extra_parts)
    w(base / "parts" / "app1.js",
      "const PACK_FIELDS = ['name', 'ends'];\n"
      "function routeKeys(id) { return { done: 'x', sess: 'y' }; }\n")
    w(base / "parts" / "app2.js", f"let {home_global} = null;\n")
    w(base / "scripts" / "app1-types.d.ts",
      "// fixture declarations\n"
      f"type RoutePack = {{ {pack_typedef} }};\n"
      "type RouteKeys = { done: string, sess: string };\n"
      "// ---- 2. Cross-part globals ----\n"
      "/** app2.js: a fixture global. */\n"
      "declare var glThing: any;\n"
      "// ---- 3. Browser surface ----\n"
      "declare var window: any;\n")
    w(base / "scripts" / "assemble.py", f"PARTS = [{parts_list}]\n")
    w(base / "scripts" / "check-receipts.py",
      'JUDGE_PATHS = {\n    "scripts/check-receipts.py",\n}\n')
    if extra_judge:
        w(base / "scripts" / "check-widget.py", "# fixture judge\n")
    w(base / "tests" / "browser" / "selftest-foreign-writes.mjs",
      "// Universe: parts/app1.js (brand-snow.js excluded - fixture IIFE).\n"
      "const UNIVERSE = ['app1.js'];\n"
      "const RULE = 'Universe: parts/app1.js (brand-snow.js excluded - fixture).';\n")
    w(base / "tests" / "browser" / "selftest-fixture.mjs", "// fixture selftest\n")
    if unwired:
        w(base / "tests" / "browser" / "selftest-unwired.mjs", "// never wired\n")
    w(base / "tests" / "browser" / "run.mjs",
      "const ALL = [" + ",".join(f"'{d}'" for d in drives) + "]\n")
    w(base / "scripts" / "shard-durations.json", json.dumps({"seconds": {}}))
    # The shards family loads the generator from the tree under
    # check (PR #157 Codex P2), so the synthetic tree carries the
    # real one its shard lists were computed with.
    w(base / "scripts" / "gen-shards.py",
      (ROOT / "scripts" / "gen-shards.py").read_text())
    shard_steps = "".join(
        f'      - run: echo shard\n        drives: "{" ".join(s)}"\n' for s in shards)
    w(base / ".github" / "workflows" / "checks.yml",
      "jobs:\n  build:\n    steps:\n"
      "      - name: fixture selftest\n"
      "        run: node tests/browser/selftest-fixture.mjs\n"
      "      - name: census selftest\n"
      "        run: node tests/browser/selftest-foreign-writes.mjs\n" + shard_steps)
    return base


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    check("mirrors: a consistent tree passes",
          run_mirrors(mirrors_tree(t / "ok")), 0)
    check("mirrors: a RoutePack typedef missing a PACK_FIELDS field fails",
          run_mirrors(mirrors_tree(t / "typedef", pack_typedef="name: string")), 1)
    check("mirrors: a cross-part global its home part no longer declares fails",
          run_mirrors(mirrors_tree(t / "retired", home_global="glOther")), 1)
    check("mirrors: an assembled part outside the census and its exclusions fails",
          run_mirrors(mirrors_tree(t / "unaccounted", extra_parts=("app6.js",))), 1)
    check("mirrors: a selftest on disk wired nowhere fails",
          run_mirrors(mirrors_tree(t / "unwired", unwired=True)), 1)
    check("mirrors: shard lists hand-swapped away from the generated partition fail",
          run_mirrors(mirrors_tree(t / "swapped", swap_shards=True)), 1)
    check("mirrors: a judging script missing from JUDGE_PATHS fails",
          run_mirrors(mirrors_tree(t / "judge", extra_judge=True)), 1)
    # The prospective-source case (Codex P2 on PR #157): the tree
    # under check carries a gen-shards.py whose SHARDS disagrees
    # with its own workflow lists, while the checker's neighbouring
    # generator agrees with them. Loading the generator from beside
    # the checker certifies this tree; loading it from the tree
    # refuses it.
    gt = mirrors_tree(t / "gensrc")
    genp = gt / "scripts" / "gen-shards.py"
    genp.write_text(genp.read_text().replace("SHARDS = 8", "SHARDS = 4"))
    check("mirrors: the tree's own generator outranks the checker's (prospective source)",
          run_mirrors(gt), 1)

    # The push gate itself: a drifted mirror refuses the push, an
    # agreeing tree pushes. The fixture tree carries a copy of the
    # real scripts/check-mirrors.py - push.py loads its gate logic
    # from the push tree, the measuring instrument, exactly as in
    # production (the receipts fixtures' shape).
    def mirrors_push_tree(name, *, wired):
        env = push_tree2(t / name, parts={"a.js": "A", "b.js": "B"},
                         changelog="## Beta 1.0\n", tracker="AB",
                         index="shell Beta 1.0 AB")
        w(t / name / "scripts" / "check-mirrors.py",
          (ROOT / "scripts" / "check-mirrors.py").read_text())
        w(t / name / "tests" / "browser" / "selftest-fixture.mjs",
          "// fixture selftest\n")
        # The branch holds the selftest and the WIRED workflow, so
        # the prospective tree carries both: the drift case then
        # differs from the branch exactly in the workflow it pushes.
        patch_branch(t / name, "tests/browser/selftest-fixture.mjs",
                     "// fixture selftest\n")
        wired_yml = ("jobs:\n  build:\n    steps:\n"
                     "      - name: fixture selftest\n"
                     "        run: node tests/browser/selftest-fixture.mjs\n")
        patch_branch(t / name, ".github/workflows/checks.yml", wired_yml)
        w(t / name / ".github" / "workflows" / "checks.yml",
          wired_yml if wired else "jobs:\n  build:\n    steps:\n")
        return env
    mp_drift = mirrors_push_tree("mpdrift", wired=False)
    check("push: a tree whose selftest wiring has drifted is refused (mirrors gate)",
          run_push(t / "mpdrift", [".github/workflows/checks.yml"],
                   mode="push", env_extra=mp_drift), 1)
    mp_ok = mirrors_push_tree("mpok", wired=True)
    check("push: a tree whose mirrors agree pushes (mirrors gate)",
          run_push(t / "mpok", ["index.html"], mode="push", env_extra=mp_ok), 0)

total = 64
print(f"gate fixtures: {total - len(failures)} pass, {len(failures)} fail")
sys.exit(1 if failures else 0)
