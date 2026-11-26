#!/usr/bin/env python3
"""Verdict fixtures for the protocol fix round's gate scripts
(2026-11-17; added on the PR #107 Codex P1 - judging logic ships
with fixtures, docs/TESTING.md rule 1).

scripts/check-proof-coverage.py,
scripts/run-proofs.py, scripts/push.py (plan mode),
scripts/sweep-check.py, scripts/check-receipts.py (the mutation-
receipt gate, /correct Phase 3 round (b)),
scripts/check-census.py (the sibling-census gate, round (c)) and
scripts/check-mirrors.py (the mirrors gate, round (d)) all
decide pass/fail for the gate. Running them
against the real repository proves only their happy path; these
fixtures run each script against synthetic trees in a temp directory
and assert BOTH verdicts: the valid tree passes, and every documented
failure class (a leftover hand-kept proof run list, a duplicated
retirement, a retirement without a reason, a retirement naming a
missing file, a
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
from the generated partition, a shard durations file missing a drive
or naming a non-drive, a shard partition covering a drive twice, a
runner partition disagreeing with the partition statement, a smoke
list naming a non-roster drive, a judging script missing from the
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


# ----------------------------------------------------------- proof coverage
def pc_tree(base, *, manifest, files):
    for f in files:
        w(base / f"tests/proof/{f}", "// fixture proof\n")
    w(base / "tests/proof/manifest.json", json.dumps(manifest))
    return base


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    good = {"retired": [{"file": "b.mjs", "reason": "subject left the app"}]}
    check("proof-coverage: an honest retired list passes",
          run("check-proof-coverage.py",
              pc_tree(t / "ok", manifest=good, files=("a.mjs", "b.mjs"))), 0)
    check("proof-coverage: a leftover run list fails",
          run("check-proof-coverage.py",
              pc_tree(t / "runlist", manifest={"run": ["a.mjs"], "retired": []},
                      files=("a.mjs",))), 1)
    check("proof-coverage: a duplicated retirement fails",
          run("check-proof-coverage.py",
              pc_tree(t / "dup",
                      manifest={"retired": [{"file": "b.mjs", "reason": "x"},
                                            {"file": "b.mjs", "reason": "y"}]},
                      files=("a.mjs", "b.mjs"))), 1)
    check("proof-coverage: a retirement without a reason fails",
          run("check-proof-coverage.py",
              pc_tree(t / "noreason",
                      manifest={"retired": [{"file": "b.mjs", "reason": " "}]},
                      files=("a.mjs", "b.mjs"))), 1)
    check("proof-coverage: a retirement naming a missing file fails",
          run("check-proof-coverage.py",
              pc_tree(t / "ghost",
                      manifest={"retired": [{"file": "ghost.mjs", "reason": "gone"}]},
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
    check("run-proofs: an all-pass tree passes",
          run("run-proofs.py", rp_tree(
              t / "ok", manifest={"retired": []},
              proofs={"p.mjs": PASS_PROOF})), 0)
    check("run-proofs: a proof exiting nonzero fails the run",
          run("run-proofs.py", rp_tree(
              t / "badexit", manifest={"retired": []},
              proofs={"p.mjs": FAIL_PROOF})), 1)
    check("run-proofs: a retired proof does not run",
          run("run-proofs.py", rp_tree(
              t / "retired", manifest={"retired": [{"file": "p.mjs", "reason": "subject left the app"}]},
              proofs={"p.mjs": FAIL_PROOF, "q.mjs": PASS_PROOF})), 0)
    check("run-proofs: a proof past its timeout fails the run",
          run("run-proofs.py", rp_tree(
              t / "slow", manifest={"retired": []},
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


def issue_receipt_span(root, rid, check_path, span_path, start, end):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "check-receipts.py"), "issue",
                           str(root), "--id", rid, "--check", check_path,
                           "--kind", "mutation", "--mutation", "fixture mutation",
                           "--red", "fixture red", "--green", "fixture green",
                           "--issued", "gate-fixtures",
                           "--span", span_path, start, end],
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
    gensrc = push_tree(t / "gensrc", files=["src/tracker-source.html",
                                            "index.html",
                                            "scripts/build-pages.py"])
    w(gensrc / "scripts/build-pages.py", "import sys; sys.exit(0)\n")
    check("push: the generated assembled source is refused as an entry",
          run_push(gensrc, ["src/tracker-source.html", "index.html"]), 1)
    check("push: the same tree without the generated source passes plan",
          run_push(gensrc, ["index.html"]), 0)

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
cl = (root / "CHANGELOG.md").read_text() if (root / "CHANGELOG.md").exists() else ""
m = re.search(r"## Beta (\\S+)", cl)
idx = (root / "index.html").read_text() if (root / "index.html").exists() else ""
if m is None or idx != "shell Beta " + m.group(1) + " " + expect:
    print("CHECK FAIL (fixture stub)"); sys.exit(1)
sys.exit(0)
'''
STUB_BUILD_PAGES_IMPORTING = """import csp_stamp
csp_stamp.verify()
""" + STUB_BUILD_PAGES
BENIGN_HELPER = "def verify():\n    return True\n"
POISON_HELPER = ("import os\n"
                 "def verify():\n"
                 "    p = os.environ.get('SNOW_FIXTURE_MARKER')\n"
                 "    if p: open(p, 'w').write('executed')\n"
                 "    return True\n")

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


def push_tree2(base, *, parts, changelog, tracker, index, branch_parts=None,
               build_pages=None, local_extra=None, branch_extra=None):
    """A buildable fixture tree + the mock branch state for it.
    branch_parts overrides the parts the BRANCH holds (default: the
    same as the local tree). build_pages replaces the stub checker;
    local_extra / branch_extra add files to the local tree / the
    branch state under arbitrary paths. Returns the env for run_push."""
    import base64
    import hashlib
    for name, text in parts.items():
        w(base / "parts" / name, text)
    w(base / "src/tracker-source.html", tracker)
    w(base / "index.html", index)
    w(base / "CHANGELOG.md", changelog)
    w(base / "scripts/build-pages.py", build_pages or STUB_BUILD_PAGES)
    for rel, text in (local_extra or {}).items():
        w(base / rel, text)
    mock = base / "mock_github.py"
    w(mock, MOCK_HELPER)
    bp = branch_parts if branch_parts is not None else parts
    blobs, contents = {}, {}
    branch_files = {**{f"parts/{k}": v for k, v in bp.items()},
                    "src/tracker-source.html": tracker, "index.html": index,
                    "CHANGELOG.md": changelog}
    branch_files.update(branch_extra or {})
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
          run_push(t / "stale", ["parts/a.js", "index.html"]), 1)
    fresh = push_tree2(t / "fresh", parts={"a.js": "A2", "b.js": "B"}, changelog="## Beta 1.0\n",
                       tracker="A2B", index="shell Beta 1.0 A2B")
    check("push plan: a parts push with fresh derived artifacts passes",
          run_push(t / "fresh", ["parts/a.js", "index.html"]), 0)
    # Plan mode compares working files against local HEAD, so
    # these trees are real git repos with the base committed.
    def limits_tree(name, rel, base_text, new_text):
        base = t / name
        (base / Path(rel)).parent.mkdir(parents=True, exist_ok=True)
        w(base / "scripts" / "check-pr-limits.py",
          (ROOT / "scripts" / "check-pr-limits.py").read_text())
        w(base / rel, base_text)
        subprocess.run(["git", "init", "-q"], cwd=base)
        subprocess.run(["git", "add", "-A"], cwd=base)
        subprocess.run(["git", "-c", "user.email=f@f", "-c",
                        "user.name=f", "commit", "-qm", "base"],
                       cwd=base)
        w(base / rel, new_text)
        return base
    check("push plan: a planted line over 240 chars is refused (limits gate)",
          run_push(limits_tree("limline", "docs/x.md", "ok\n",
                               "ok\n" + "x" * 250 + "\n"),
                   ["docs/x.md"]), 1)
    check("push plan: the same tree without the plant passes (limits gate)",
          run_push(limits_tree("limok", "docs/x.md", "ok\n",
                               "ok\nshort\n"),
                   ["docs/x.md"]), 0)
    check("push plan: a planted comment over 20 words is refused (limits gate)",
          run_push(limits_tree("limcomment", "scripts/y.py", "ok\n",
                               "# " + " ".join(["word"] * 25) + "\n"),
                   ["scripts/y.py"]), 1)
    limroot = limits_tree("limroot", "docs/x.md", "ok\n", "ok\n")
    w(limroot / "plant.txt", "hello\n")
    check("push plan: a new file at the repo root is refused (limits gate)",
          run_push(limroot, ["docs/x.md", "plant.txt"]), 1)
    rep_base = "head();\n" + "route();\n" * 400
    rep_one = "head2();\n" + "route();\n" * 400
    check("push plan: one changed line in a 400-line repetitive file counts as one (limits gate)",
          run_push(limits_tree("limrep", "flags.js", rep_base, rep_one),
                   ["flags.js"]), 0)
    rep_many = "head();\n" + "".join(f"route{i}();\n" for i in range(400))
    check("push plan: 400 genuinely changed product lines are refused (limits gate)",
          run_push(limits_tree("limrep2", "flags.js", rep_base, rep_many),
                   ["flags.js"]), 1)
    omit = push_tree2(t / "omit", parts={"a.js": "A2", "b.js": "B2"}, changelog="## Beta 1.0\n",
                      tracker="A2B2", index="shell Beta 1.0 A2B2",
                      branch_parts={"a.js": "A", "b.js": "B"})
    check("push: omitting a differing assembly input is refused (prospective tree)",
          run_push(t / "omit", ["parts/a.js", "index.html"],
                   mode="push", env_extra=omit), 1)
    check("push: the full differing set pushes and verifies against the mock branch",
          run_push(t / "omit", ["parts/a.js", "parts/b.js", "index.html"],
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
    # Instrument closure (issue #180): the prospective preflight runs
    # the temp tree's build-pages.py, which imports its sibling
    # helpers (here csp_stamp, as the real checker does). A helper
    # that differs on the branch and is NOT in the push set must
    # never be the copy that executes locally: the whole import
    # closure is exempt from the overlay, like the checker itself.
    # The branch helper below is poisoned (it leaves a marker when
    # imported); the push must succeed AND the marker must not exist.
    marker = t / "instrument-marker.txt"
    instr = push_tree2(t / "instr", parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                       tracker="AB", index="shell Beta 1.0 AB",
                       build_pages=STUB_BUILD_PAGES_IMPORTING,
                       local_extra={"scripts/csp_stamp.py": BENIGN_HELPER},
                       branch_extra={"scripts/csp_stamp.py": POISON_HELPER})
    rc = run_push(t / "instr", ["index.html"], mode="push",
                  env_extra={**instr, "SNOW_FIXTURE_MARKER": str(marker)})
    check("push: a branch-differing checker helper never executes locally (instrument closure)",
          (rc, marker.exists()), (0, False))
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
    # Claim-span pins (7c): outside edits push, inside edits and duplicated markers refuse.
    SPAN_PROOF = "header v1\n// CLAIM-BEGIN\nclaim body v1\n// CLAIM-END\nfooter v1\n"
    rc_span = receipts_tree("rcspan", proof_text=SPAN_PROOF)
    issue_receipt_span(t / "rcspan", "fixture-rcspan", "tests/proof/proof-9001.mjs",
                       "tests/proof/proof-9001.mjs", "// CLAIM-BEGIN", "// CLAIM-END")
    w(t / "rcspan" / "tests" / "proof" / "proof-9001.mjs",
      "header v1\n// CLAIM-BEGIN\nclaim body v1\n// CLAIM-END\nfooter v2 edited outside the claim\n")
    check("push: an edit outside a receipt's claim span still pushes (span stays current)",
          run_push(t / "rcspan", ["tests/proof/proof-9001.mjs", "tests/mutation-receipts.json"],
                   mode="push", env_extra=rc_span), 0)
    rc_spanin = receipts_tree("rcspanin", proof_text=SPAN_PROOF)
    issue_receipt_span(t / "rcspanin", "fixture-rcspanin", "tests/proof/proof-9001.mjs",
                       "tests/proof/proof-9001.mjs", "// CLAIM-BEGIN", "// CLAIM-END")
    w(t / "rcspanin" / "tests" / "proof" / "proof-9001.mjs",
      "header v1\n// CLAIM-BEGIN\nclaim body v2 edited inside the claim\n// CLAIM-END\nfooter v1\n")
    check("push: an edit inside a receipt's claim span is refused (span went stale)",
          run_push(t / "rcspanin", ["tests/proof/proof-9001.mjs", "tests/mutation-receipts.json"],
                   mode="push", env_extra=rc_spanin), 1)
    rc_spanbrk = receipts_tree("rcspanbrk", proof_text=SPAN_PROOF)
    issue_receipt_span(t / "rcspanbrk", "fixture-rcspanbrk", "tests/proof/proof-9001.mjs",
                       "tests/proof/proof-9001.mjs", "// CLAIM-BEGIN", "// CLAIM-END")
    w(t / "rcspanbrk" / "tests" / "proof" / "proof-9001.mjs",
      "header v1\n// CLAIM-BEGIN\n// CLAIM-BEGIN\nclaim body v1\n// CLAIM-END\nfooter v1\n")
    check("push: a duplicated claim-span marker is refused (span broken)",
          run_push(t / "rcspanbrk", ["tests/proof/proof-9001.mjs", "tests/mutation-receipts.json"],
                   mode="push", env_extra=rc_spanbrk), 1)
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
    # Registry sync gate (issue #178's registry half): the vendored
    # pair in the push tree must equal what the canonical registry
    # generates - a stale or hand-edited vendored copy refuses the
    # push. The fixture tree carries a copy of the real
    # scripts/sync-fix-checks.py (push.py loads its gate logic from
    # the push tree, the measuring instrument), and the fixture
    # environment names the fixture registry plus this tree as the
    # canonical coordinates, so the vendored pair is generated from
    # the fixture registry itself.
    def sync_tree(name):
        env = push_tree2(t / name, parts={"a.js": "A", "b.js": "B"}, changelog="## Beta 1.0\n",
                         tracker="AB", index="shell Beta 1.0 AB")
        w(t / name / "scripts" / "sync-fix-checks.py",
          (ROOT / "scripts" / "sync-fix-checks.py").read_text())
        # The canonical coordinates are fixture-local: the runner is
        # a stub file here (the real one's path exists only on the
        # maintainer machine - naming it broke this case in CI,
        # PR #197's first vendored head).
        w(t / name / "fixture-runner.py", "fixture runner\n")
        env = {**env, "SNOW_FIX_CHECKS_REPO_ROOT": str(t / name),
               "SNOW_FIX_CHECKS_RUNNER": str(t / name / "fixture-runner.py")}
        proc = subprocess.run([PY, str(t / name / "scripts" / "sync-fix-checks.py"),
                               str(t / name)], capture_output=True, text=True,
                              timeout=120, env={**os.environ, **env})
        assert proc.returncode == 0, proc.stdout + proc.stderr
        return env
    sync_ok = sync_tree("syncok")
    check("push: a vendored registry in sync with the canonical registry pushes (registry sync gate)",
          run_push(t / "syncok", ["index.html"], mode="push", env_extra=sync_ok), 0)
    sync_stale = sync_tree("syncstale")
    w(t / "syncstale" / "hidden_files" / "fix-checks.json",
      (t / "syncstale" / "hidden_files" / "fix-checks.json").read_text() + "\n")
    check("push: a vendored registry diverging from the canonical registry refuses the push (registry sync gate)",
          run_push(t / "syncstale", ["index.html"], mode="push", env_extra=sync_stale), 1)

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
          run_push(t / "nocensus", ["parts/a.js", "parts/b.js", "index.html"],
                   mode="push", env_extra=no_census), 1)
    full = census_tree("censusok")
    check("push: a parts change with a current, fully-marked census pushes",
          run_push(t / "censusok", ["parts/a.js", "parts/b.js",
                                    "index.html", "tests/sibling-census.json"],
                   mode="push", env_extra=full), 0)
    omitted = census_tree("censusomit", omit_door=True)
    check("push: a hand-typed census omitting a derived door row is refused (re-derivation)",
          run_push(t / "censusomit", ["parts/a.js", "parts/b.js",
                                      "index.html", "tests/sibling-census.json"],
                   mode="push", env_extra=omitted), 1)
    unmarked = census_tree("censusunmarked", leave_unmarked=True)
    check("push: a census leaving a derived row unmarked is refused",
          run_push(t / "censusunmarked", ["parts/a.js", "parts/b.js",
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
                 swap_shards=False, extra_judge=False, nested_global=False,
                 comment_step=False):
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
    if nested_global:
        # The declared global exists only nested inside a function
        # (flush-left, the shape this codebase writes) - a line-start
        # scan counts it, a scope-aware scan must not.
        w(base / "parts" / "app2.js",
          "function wrapper() {\n"
          f"let {home_global} = null;\n"
          "}\n")
    else:
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
    # The roster is the disk glob since the 2026-11-23 rollout: the
    # fixture writes the drive files themselves, and run.mjs carries
    # no list for the generator to read.
    for d in drives:
        w(base / "tests" / "browser" / f"{d}.mjs", "// fixture drive\n")
    w(base / "tests" / "browser" / "run.mjs",
      "// fixture runner: the roster is the drive*.mjs glob\n")
    w(base / "scripts" / "shard-durations.json", json.dumps({"seconds": {}}))
    # The shards family loads the generator from the tree under
    # check (PR #157 Codex P2), so the synthetic tree carries the
    # real one its shard lists were computed with.
    w(base / "scripts" / "gen-shards.py",
      (ROOT / "scripts" / "gen-shards.py").read_text())
    # The generator loads the shared source-inspection layer from
    # beside its own file (architecture #21), so the tree carries it.
    w(base / "scripts" / "source_query.py",
      (ROOT / "scripts" / "source_query.py").read_text())
    shard_steps = "".join(
        f'      - run: echo shard\n        drives: "{" ".join(s)}"\n' for s in shards)
    fixture_step = ("      - name: fixture selftest\n"
                    "        run: node tests/browser/selftest-fixture.mjs\n")
    if comment_step:
        # The step is present as text but commented out - it does
        # not run, so the selftest is unwired (PR #157 Codex P2).
        fixture_step = "".join("# " + ln + "\n"
                               for ln in fixture_step.splitlines())
    w(base / ".github" / "workflows" / "checks.yml",
      "jobs:\n  build:\n    steps:\n"
      + fixture_step +
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
    check("mirrors: a global declared only nested in its home part fails (scope-aware scan)",
          run_mirrors(mirrors_tree(t / "nested", nested_global=True)), 1)
    check("mirrors: a selftest whose step is commented out is unwired",
          run_mirrors(mirrors_tree(t / "commented", comment_step=True)), 1)

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
        # The checker loads the shared source-inspection layer from
        # beside its own file (architecture #21), so the tree carries it.
        w(t / name / "scripts" / "source_query.py",
          (ROOT / "scripts" / "source_query.py").read_text())
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

# ------------------------------------------------------- shard coverage
def run_shard_coverage(root):
    proc = subprocess.run([PY, str(root / "scripts" / "check-shard-coverage.py")],
                          capture_output=True, text=True, timeout=120)
    return proc.returncode


def shard_tree(base, *, drop_duration=None, extra_duration=None,
               duplicate_in_partition=False, runner_shifts=False,
               bogus_smoke=False):
    """A miniature tree the REAL shard-coverage guard passes: eight
    fixture drives, a durations file naming exactly them, and verbatim
    copies of the guard, the partition statement (gen-shards.py), the
    shared source-inspection layer both load (source_query.py) and
    the runner (run.mjs, Node built-ins only, so its --list mode runs
    in the bare tree). Each keyword breaks exactly one of the guard's
    arms. Added on the PR #190 Codex P1 (testing-efficiency rollout):
    the rewritten guard's failure paths were proven only by mutation
    receipts; docs/TESTING.md rule 1 wants them as committed fixtures."""
    drives = [f"drive{i}" for i in range(101, 109)]
    for d in drives:
        w(base / f"tests/browser/{d}.mjs", "// fixture drive\n")
    seconds = {d: 10 + (i % 3) * 5 for i, d in enumerate(drives)}
    if drop_duration:
        seconds.pop(drop_duration)
    if extra_duration:
        seconds[extra_duration] = 5
    w(base / "scripts/shard-durations.json", json.dumps({"seconds": seconds}))
    gen = (ROOT / "scripts" / "gen-shards.py").read_text()
    if duplicate_in_partition:
        old = "return [sorted(s) for s in shards], totals, weight"
        assert gen.count(old) == 1
        gen = gen.replace(old, "shards[0] = shards[0] + shards[1][:1]\n    " + old)
    w(base / "scripts" / "gen-shards.py", gen)
    w(base / "scripts" / "check-shard-coverage.py",
      (ROOT / "scripts" / "check-shard-coverage.py").read_text())
    # Both load the shared source-inspection layer from beside their
    # own files (architecture #21), so the tree carries it.
    w(base / "scripts" / "source_query.py",
      (ROOT / "scripts" / "source_query.py").read_text())
    runner = (ROOT / "tests" / "browser" / "run.mjs").read_text()
    if runner_shifts:
        old = "shards[best].push(n); totals[best] += weight(n);"
        assert runner.count(old) == 1
        runner = runner.replace(
            old, "shards[(best + 1) % SHARD_COUNT].push(n); totals[best] += weight(n);")
    w(base / "tests" / "browser" / "run.mjs", runner)
    smoke = "drive101 drive102" if not bogus_smoke else "drive101 drive999"
    w(base / ".github" / "workflows" / "checks.yml",
      "jobs:\n  smoke:\n    steps:\n"
      f"      - run: node tests/browser/run.mjs {smoke}\n")
    return base


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    check("shard coverage: a faithful miniature tree passes",
          run_shard_coverage(shard_tree(t / "sc-ok")), 0)
    check("shard coverage: a drive with no duration entry fails",
          run_shard_coverage(shard_tree(t / "sc-missing", drop_duration="drive108")), 1)
    check("shard coverage: a duration entry naming no drive fails",
          run_shard_coverage(shard_tree(t / "sc-extra", extra_duration="drive999")), 1)
    check("shard coverage: a partition covering a drive twice fails",
          run_shard_coverage(shard_tree(t / "sc-dupe", duplicate_in_partition=True)), 1)
    check("shard coverage: a runner partition disagreeing with the statement fails",
          run_shard_coverage(shard_tree(t / "sc-runner", runner_shifts=True)), 1)
    check("shard coverage: a smoke list naming a non-roster drive fails",
          run_shard_coverage(shard_tree(t / "sc-smoke", bogus_smoke=True)), 1)

# ------------------------------------------------------- CI gate wiring
# (issue #178, Codex P1 on PR #197): DEVELOPMENT_RULES §3 names the
# checks workflow itself as test machinery - changed only with
# verdict fixtures and mutation receipts. These cases extract the
# Collect / Receipts / Census step bodies from the REAL checks.yml
# and execute them in synthetic git repositories, proving the
# workflow supplies the triggering paths and propagates refusals.
# (A tiny indentation parser extracts the bodies: PyYAML is not
# available in the CI Python, and a moved step fails these cases
# loudly rather than silently passing.)
def workflow_step_body(step_name):
    lines = (ROOT / ".github" / "workflows" / "checks.yml").read_text().splitlines()
    for i, line in enumerate(lines):
        if line.strip() == f"- name: {step_name}":
            j = i + 1
            while not lines[j].strip().startswith("run:"):
                j += 1
            indent = len(lines[j]) - len(lines[j].lstrip())
            body = []
            for k in range(j + 1, len(lines)):
                ln = lines[k]
                if ln.strip() and (len(ln) - len(ln.lstrip())) <= indent:
                    break
                body.append(ln[indent + 2:] if ln.strip() else "")
            return "\n".join(body) + "\n"
    raise AssertionError(f"step not found in checks.yml: {step_name}")


def run_body(body, cwd, env_extra):
    env = dict(os.environ)
    env.update(env_extra)
    proc = subprocess.run(["bash", "-c", body], cwd=cwd, env=env,
                          capture_output=True, text=True, timeout=120)
    return proc.returncode, proc.stdout + proc.stderr


def ci_wiring_tree(base):
    """A git repo whose head commit changes a proof (a receipts
    trigger), renames a doc and touches a plain file."""
    def git(*args):
        env = dict(os.environ, GIT_AUTHOR_NAME="fixture",
                   GIT_AUTHOR_EMAIL="fixture@example.com",
                   GIT_COMMITTER_NAME="fixture",
                   GIT_COMMITTER_EMAIL="fixture@example.com")
        subprocess.run(["git", *args], cwd=base, env=env, check=True,
                       capture_output=True, text=True)
    base.mkdir(parents=True)
    git("init", "-q")
    w(base / "README.md", "base\n")
    w(base / "docs" / "old.md", "doc\n")
    w(base / "tests" / "proof" / "proof-9001.mjs", "proof v1\n")
    w(base / "scripts" / "check-receipts.py",
      (ROOT / "scripts" / "check-receipts.py").read_text())
    w(base / "scripts" / "check-census.py",
      (ROOT / "scripts" / "check-census.py").read_text())
    w(base / "tests" / "mutation-receipts.json", json.dumps({"receipts": []}))
    w(base / "tests" / "sibling-census.json",
      (ROOT / "tests" / "sibling-census.json").read_text())
    git("add", "-A")
    git("commit", "-q", "-m", "base")
    base_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=base,
                              capture_output=True, text=True).stdout.strip()
    w(base / "tests" / "proof" / "proof-9001.mjs", "proof v2\n")
    w(base / "README.md", "head\n")
    git("mv", "docs/old.md", "docs/new.md")
    git("add", "-A")
    git("commit", "-q", "-m", "head")
    return base_sha


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    tree = t / "ciw"
    base_sha = ci_wiring_tree(tree)
    collect = workflow_step_body(
        "Collect changed paths (event base tree against head tree)")
    receipts_step = workflow_step_body(
        "Receipts gate (refuse changed checks without current mutation receipts, class N1)")
    census_step = workflow_step_body(
        "Census gate (refuse parts changes without a current sibling census, class N2)")
    rc, out = run_body(collect, tree, {
        "EVENT": "pull_request", "BASE_SHA": base_sha,
        "GITHUB_WORKSPACE": str(tree), "GITHUB_ENV": str(tree / ".gh-env")})
    changed = set()
    if rc == 0 and (tree / ".gh-env").is_file():
        for line in (tree / ".gh-env").read_text().splitlines():
            if line.startswith("CHANGED_FILES="):
                raw = Path(line.split("=", 1)[1]).read_bytes()
                changed = {p for p in raw.decode().split("\0") if p}
    check("ci wiring: the Collect step supplies the exact changed set (both sides of a rename)",
          0 if changed == {"README.md", "docs/new.md", "docs/old.md",
                           "tests/proof/proof-9001.mjs"} else 1, 0)
    changed_file = [l.split("=", 1)[1] for l in
                    (tree / ".gh-env").read_text().splitlines()
                    if l.startswith("CHANGED_FILES=")][0]
    check("ci wiring: the Receipts step refuses a changed check with no mutation receipt (refusal propagates)",
          run_body(receipts_step, tree, {"EVENT": "pull_request",
                                         "CHANGED_FILES": changed_file})[0], 1)
    issue_receipt(tree, "fixture-ci-wiring", "tests/proof/proof-9001.mjs",
                  "mutation", ["tests/proof/proof-9001.mjs"])
    check("ci wiring: the Receipts step passes once a current receipt covers the changed check",
          run_body(receipts_step, tree, {"EVENT": "pull_request",
                                         "CHANGED_FILES": changed_file})[0], 0)
    benign = tree / ".changed-benign"
    benign.write_bytes(b"README.md\0")
    check("ci wiring: the Census step runs on the collected set (a benign change passes)",
          run_body(census_step, tree, {"EVENT": "pull_request",
                                       "CHANGED_FILES": str(benign)})[0], 0)
    rc1, _ = run_body(collect, tree, {
        "EVENT": "workflow_dispatch", "BASE_SHA": base_sha,
        "GITHUB_WORKSPACE": str(tree), "GITHUB_ENV": str(tree / ".gh-env2")})
    rc2, _ = run_body(receipts_step, tree, {"EVENT": "workflow_dispatch"})
    check("ci wiring: workflow_dispatch skips the diff-scoped gates cleanly (Collect + Receipts)",
          0 if (rc1 == 0 and rc2 == 0) else 1, 0)
    # The workflow is itself a receipts trigger (§3's machinery list,
    # made mechanical in check-receipts.py's CHECK_PATTERNS).
    wf = t / "wftree"
    w(wf / ".github" / "workflows" / "checks.yml", "fixture workflow\n")
    w(wf / "tests" / "mutation-receipts.json", json.dumps({"receipts": []}))
    check("receipts: a changed checks workflow with no receipt is refused by the gate",
          run_receipts(wf, [".github/workflows/checks.yml"]), 1)
    issue_receipt(wf, "fixture-wf", ".github/workflows/checks.yml",
                  "mutation", [".github/workflows/checks.yml"])
    check("receipts: a changed checks workflow named by a current receipt passes the gate",
          run_receipts(wf, [".github/workflows/checks.yml"]), 0)

# ------------------------------------------------------- PR limit judge
def run_limits(root, base, labels=""):
    return run_limits_out(root, base, labels)[0]


def run_limits_out(root, base, labels=""):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "check-pr-limits.py"),
                           str(root), "--base", base, "--labels", labels],
                          capture_output=True, text=True, timeout=120)
    return proc.returncode, proc.stdout + proc.stderr


def git_repo(base, commits):
    """A real git repo: an initial commit, then one commit per
    (message, {path: text}) entry. Returns (repo, base_sha)."""
    base.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, GIT_CONFIG_NOSYSTEM="1")

    def g(*args):
        proc = subprocess.run(["git", "-C", str(base)] + list(args),
                              capture_output=True, text=True, env=env,
                              timeout=60)
        assert proc.returncode == 0, proc.stderr

    g("init", "-q")
    g("config", "user.email", "fixture@example.invalid")
    g("config", "user.name", "gate fixture")
    w(base / "seed.txt", "seed\n")
    g("add", "-A")
    g("commit", "-q", "-m", "seed")
    base_sha = subprocess.run(["git", "-C", str(base), "rev-parse", "HEAD"],
                              capture_output=True, text=True,
                              env=env).stdout.strip()
    for message, files in commits:
        for rel, text in files.items():
            w(base / rel, text)
        g("add", "-A")
        g("commit", "-q", "-m", message)
    return base, base_sha


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    big = "\n".join(f"line {i}" for i in range(301)) + "\n"
    repo, b = git_repo(t / "oversize", [("big", {"parts/big.js": big})])
    check("pr-limits: a commit over the product-line limit is refused",
          run_limits(repo, b), 1)
    check("pr-limits: the large-change label allows the same commit",
          run_limits(repo, b, labels="large-change"), 0)
    repo, b = git_repo(t / "clean", [("small", {"parts/a.js": "one\n"})])
    check("pr-limits: a small clean commit passes",
          run_limits(repo, b), 0)
    long_comment = "# " + " ".join(["word"] * 21) + "\n"
    repo, b = git_repo(t / "comment", [("c", {"scripts/x.py": long_comment})])
    check("pr-limits: an added comment over the word limit is refused",
          run_limits(repo, b), 1)
    repo, b = git_repo(t / "longline", [("c", {"scripts/x.py": "x" * 241 + "\n"})])
    check("pr-limits: an added line over the char limit is refused",
          run_limits(repo, b), 1)
    repo, b = git_repo(t / "rootfile", [("c", {"stray.txt": "hi\n"})])
    check("pr-limits: a new root file outside the allowlist is refused",
          run_limits(repo, b), 1)
    repo, b = git_repo(t / "exempt", [("c", {"index.html": "x" * 300 + "\n"})])
    check("pr-limits: a generated file's long line is exempt",
          run_limits(repo, b), 0)
    # Touched comments (Phase 1, Class 1a): the judge reads a
    # touched comment's full text, not only its added lines.
    long_block = ("/*\n"
                  " * alpha bravo charlie delta echo foxtrot golf hotel\n"
                  " * india juliet kilo lima mike november oscar papa\n"
                  " * quebec romeo sierra tango uniform victor whiskey xray\n"
                  " * yankee zulu apple banana cherry dragon eagle falcon\n"
                  " */\n")
    def head1(repo):
        return subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD~1"],
                              capture_output=True, text=True).stdout.strip()
    repo, _ = git_repo(t / "rewritten", [("c1", {"parts/a.js": long_block + "const a = 1;\n"}),
                                         ("c2", {"parts/a.js": long_block.replace("whiskey", "whisky") + "const a = 1;\n"})])
    check("pr-limits: a rewritten long comment fails on its full text",
          run_limits(repo, head1(repo)), 1)
    shorter = long_block.replace(" * yankee zulu apple banana cherry dragon eagle falcon\n", "")
    repo, _ = git_repo(t / "delpartial", [("c1", {"parts/a.js": long_block + "const a = 1;\n"}),
                                          ("c2", {"parts/a.js": shorter + "const a = 1;\n"})])
    check("pr-limits: a deletion leaving a long partial comment fails",
          run_limits(repo, head1(repo)), 1)
    repo, _ = git_repo(t / "untouched", [("c1", {"parts/a.js": long_block + "const a = 1;\n"}),
                                         ("c2", {"parts/a.js": long_block + "const a = 2;\n"})])
    check("pr-limits: an untouched long comment passes",
          run_limits(repo, head1(repo)), 0)
    short_block = "/* one two three four five six\n seven eight nine ten eleven twelve */\n"
    repo, _ = git_repo(t / "shorttouch", [("c1", {"parts/a.js": short_block + "const a = 1;\n"}),
                                          ("c2", {"parts/a.js": short_block.replace("seven", "SEVEN") + "const a = 1;\n"})])
    check("pr-limits: a rewritten short comment passes",
          run_limits(repo, head1(repo)), 0)
    # Regex literals: a /* inside one opens no comment; a real
    # long comment beside one still fails.
    regex_src = ("const re = /[/*]/;\n"
                 "const s = \"alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee\";\n"
                 "/* short */\n")
    repo, _ = git_repo(t / "regexphantom", [("c1", {"parts/a.js": "const a = 1;\n"}),
                                            ("c2", {"parts/a.js": regex_src})])
    check("pr-limits: a regex literal's /* opens no comment",
          run_limits(repo, head1(repo)), 0)
    repo, _ = git_repo(t / "regexlong", [("c1", {"parts/a.js": "const re = /[/*]/;\n" + long_block + "const a = 1;\n"}),
                                         ("c2", {"parts/a.js": "const re = /[/*]/;\n" + long_block.replace("whiskey", "whisky") + "const a = 1;\n"})])
    check("pr-limits: a long comment beside a regex literal still fails",
          run_limits(repo, head1(repo)), 1)
    # Fetch shallow ancestry so the size rule sees the product commit.
    src, b = git_repo(t / "mergesrc", [])
    genv = dict(os.environ, GIT_CONFIG_NOSYSTEM="1")

    def sgit(*a):
        proc = subprocess.run(["git", "-C", str(src)] + list(a),
                              capture_output=True, text=True, env=genv,
                              timeout=60)
        assert proc.returncode == 0, proc.stderr

    default_branch = subprocess.run(
        ["git", "-C", str(src), "branch", "--show-current"],
        capture_output=True, text=True, env=genv).stdout.strip()
    sgit("checkout", "-q", "-b", "feat")
    w(src / "parts/big.js", big)
    sgit("add", "-A")
    sgit("commit", "-q", "-m", "big")
    sgit("checkout", "-q", default_branch)
    sgit("merge", "-q", "--no-ff", "feat", "-m", "merge feat")
    clone = t / "shallowclone"
    proc = subprocess.run(["git", "clone", "--depth=1",
                           f"file://{src}", str(clone)],
                          capture_output=True, text=True, env=genv,
                          timeout=60)
    assert proc.returncode == 0, proc.stderr
    # Assert the size diagnostic and labelled control because ancestry refusal also exits 1.
    rc, out = run_limits_out(clone, b)
    check("pr-limits: a shallow (CI-shaped) checkout still judges "
          "the size rule",
          1 if (rc == 1 and "adds 301 product lines" in out) else 0, 1)
    check("pr-limits: the labelled control passes in the same "
          "shallow checkout", run_limits(clone, b, "large-change"), 0)

# ------------------------------------------------------------ parts scan
def run_scan(root, *extra):
    proc = subprocess.run(["node", str(ROOT / "scripts" / "scan-parts.cjs"),
                           str(root)] + list(extra),
                          capture_output=True, text=True, timeout=120)
    return proc.returncode


SCAN_JS = (
    "function fixtureTestedWrite() { return lsSet('k', 'v'); }\n"
    "function fixtureExemptWrite() { lsSet('hint', 'x') /* write-safe: a stale hint costs nothing */; }\n"
    "function fixtureAlpha(n) { let s = 0; for (let i = 0; i < n; i++) s += i * 2; return s; }\n"
    "function fixtureBeta(n) { let p = 1; while (n > 1) { p *= n; n--; } return p; }\n"
)
SCAN_HTML = ("<html><head><style>\n"
             ".fixA { color: red; margin: 0; }\n"
             ".fixB { color: blue; padding: 1px; }\n"
             "</style></head><body></body></html>\n")
SCAN_CLONE = (
    "function fixtureCloneA() { const a = alphaOne(1); const b = betaTwo(2); const c = gammaThree(3); "
    "if (a && b) return a + b + c; if (c > 9) return c * 3; "
    "return deltaFour(a, b) + epsilonFive(b, c) + zetaSix(c, a); }\n"
    "function fixtureCloneB() { const a = alphaOne(1); const b = betaTwo(2); const c = gammaThree(3); "
    "if (a && b) return a + b + c; if (c > 9) return c * 3; "
    "return deltaFour(a, b) + epsilonFive(b, c) + zetaSix(c, a); }\n"
)


def scan_tree(base, *, js=SCAN_JS, html=SCAN_HTML):
    w(base / "parts" / "a.js", js)
    w(base / "parts" / "head.html", html)
    w(base / "scripts" / "parts-clone-baseline.json",
      '{\n  "exemptions": [],\n  "pairs": []\n}\n')
    return base


with tempfile.TemporaryDirectory() as td:
    t = Path(td)
    check("scan: a clean tree passes (tested write, exempt write, distinct bodies)",
          run_scan(scan_tree(t / "clean")), 0)
    check("scan: a planted ignored write fails",
          run_scan(scan_tree(t / "ignored",
                             js=SCAN_JS + "function fixtureIgnored() { lsSet('k2', 'v2'); }\n")), 1)
    check("scan: an ignored write carrying a write-safe exemption passes",
          run_scan(scan_tree(t / "exempt",
                             js="function fixtureOnly() { lsSet('hint', 'x') /* write-safe: a stale hint costs nothing */; }\n")), 0)
    check("scan: a planted JS clone pair fails",
          run_scan(scan_tree(t / "jsclone", js=SCAN_JS + SCAN_CLONE)), 1)
    check("scan: a planted CSS clone block fails",
          run_scan(scan_tree(t / "cssclone",
                             html=SCAN_HTML.replace("</style>",
                                                    ".fixC { color: red; margin: 0; }\n</style>"))), 1)
    clone_tree = scan_tree(t / "baselined", js=SCAN_JS + SCAN_CLONE)
    check("scan: --write-baseline records the standing clone pair",
          run_scan(clone_tree, "--write-baseline"), 0)
    check("scan: a baselined clone pair passes",
          run_scan(clone_tree), 0)

total = 115
print(f"gate fixtures: {total - len(failures)} pass, {len(failures)} fail")
sys.exit(1 if failures else 0)
