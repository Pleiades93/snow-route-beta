#!/usr/bin/env python3
"""Proof runner (protocol fix round, 2026-11-17; generated roster,
testing-efficiency rollout, 2026-11-23).

Replaces the hand-kept per-proof steps in checks.yml. The gate runs
every proof file on disk in tests/proof/ EXCEPT the ones
tests/proof/manifest.json lists under "retired" (each with its
reason) - the run list is derived from the glob, so registering a
proof is dropping in the file and retiring one is a single manifest
entry; there is no hand-kept run list left to drift.
scripts/check-proof-coverage.py guards the retired list.

Each proof runs as `node tests/proof/<file>` from the repo root -
the same invocation the old named steps used. A proof fails the run
on a nonzero exit or a timeout. Run from the repo root; an optional
argv[1] names another root and PROOF_TIMEOUT_S overrides the
per-proof timeout (the verdict fixtures in scripts/gate-fixtures/
use both against synthetic trees).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
TIMEOUT_S = int(os.environ.get("PROOF_TIMEOUT_S", "180"))

manifest = json.loads((ROOT / "tests" / "proof" / "manifest.json").read_text(encoding="utf-8"))
retired = {e["file"] for e in manifest.get("retired", []) if isinstance(e, dict) and "file" in e}
names = sorted(p.name for p in (ROOT / "tests" / "proof").glob("*.mjs") if p.name not in retired)
if not names:
    print("FAIL: no proofs to run (the tests/proof glob is empty or everything is retired)")
    sys.exit(1)

failures = []
for name in names:
    path = ROOT / "tests" / "proof" / name
    if not path.exists():
        failures.append(name)
        print(f"FAIL: {name} - listed in the manifest but missing on disk")
        continue
    try:
        proc = subprocess.run(
            ["node", str(path)], cwd=ROOT, capture_output=True, text=True,
            timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        failures.append(name)
        print(f"FAIL: {name} - timed out after {TIMEOUT_S}s")
        continue
    if proc.returncode == 0:
        print(f"PASS: {name}")
    else:
        failures.append(name)
        tail = (proc.stdout + proc.stderr).strip().splitlines()
        print(f"FAIL: {name} - exit {proc.returncode}")
        for line in tail[-5:]:
            print(f"      {line}")

print(f"proofs: {len(names) - len(failures)}/{len(names)} passed")
if failures:
    print("failing proofs:", ", ".join(failures))
    sys.exit(1)
