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
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
TIMEOUT_S = int(os.environ.get("PROOF_TIMEOUT_S", "180"))

# The proof roster is source_query's (architecture #21 - the one
# statement of the rule): every proof file on disk except the
# manifest's retired entries.
_sq = importlib.util.spec_from_file_location(
    "snow_source_query", Path(__file__).resolve().parent / "source_query.py")
source_query = importlib.util.module_from_spec(_sq)
_sq.loader.exec_module(source_query)

PROOF_DIR = ROOT / "tests" / "proof"
retired = {e["file"] for e in source_query.retired_proofs(PROOF_DIR)
           if isinstance(e, dict) and "file" in e}
names = [n for n in source_query.proof_files(PROOF_DIR) if n not in retired]
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
