#!/usr/bin/env python3
"""Manifest-driven proof runner (protocol fix round, 2026-11-17).

Replaces the hand-kept per-proof steps in checks.yml: the gate runs
every proof listed under "run" in tests/proof/manifest.json, so
registering a proof is adding ONE manifest line, never editing the
workflow (which is what used to force every round to Tier C).
scripts/check-proof-coverage.py proves the manifest accounts for
every file in tests/proof/.

Each proof runs as `node tests/proof/<file>` from the repo root -
the same invocation the old named steps used. A proof fails the run
on a nonzero exit or a timeout. Run from the repo root.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIMEOUT_S = 180

manifest = json.loads((ROOT / "tests" / "proof" / "manifest.json").read_text(encoding="utf-8"))
names = list(manifest.get("run", []))
if not names:
    print("FAIL: the proof manifest's run list is empty")
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
