#!/usr/bin/env python3
"""Verdict fixtures for the protocol fix round's gate scripts
(2026-11-17; added on the PR #107 Codex P1 - judging logic ships
with fixtures, docs/TESTING.md rule 1).

scripts/check-tier-map.py, scripts/check-proof-coverage.py,
scripts/run-proofs.py and scripts/push.py (plan mode) all decide
pass/fail for the gate. Running them
against the real repository proves only their happy path; these
fixtures run each script against synthetic trees in a temp directory
and assert BOTH verdicts: the valid tree passes, and every documented
failure class (dangling roster entry, JSON/MD roster drift, a roster
drive outside the runner's ALL list, an unlisted or duplicated proof,
a retirement without a reason, a manifest naming a missing file, a
proof exiting nonzero, a proof timing out, a basename-only push
entry, a parts push missing its derived artifacts) fails.

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
def run_push(root, files):
    proc = subprocess.run([PY, str(ROOT / "scripts" / "push.py"), "plan", str(root),
                           "--branch", "fixture", "--message", "fixture"] + files,
                          capture_output=True, text=True, timeout=120)
    return proc.returncode


def push_tree(base, *, files):
    for rel in files:
        w(base / rel, "fixture\n")
    return base


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

total = 20
print(f"gate fixtures: {total - len(failures)} pass, {len(failures)} fail")
sys.exit(1 if failures else 0)
