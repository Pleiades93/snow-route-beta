#!/usr/bin/env python3
"""Proof coverage guard (protocol fix round, 2026-11-17).

The 2026-11-17 protocol audit found 18 of 38 files in tests/proof/
never ran in CI: each proof was wired by hand as a named step in
checks.yml, and nothing checked the wiring. Proofs now run from
tests/proof/manifest.json (scripts/run-proofs.py), and this guard
proves the manifest is complete on every build-and-test:

  * every tests/proof/*.mjs file is listed exactly once - either in
    "run" (the gate executes it) or in "retired" (with a reason);
  * every name the manifest lists exists on disk;
  * every retired entry carries a non-empty reason.

Exits 0 on PASS, 1 on any violation. Run from the repo root.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROOF_DIR = ROOT / "tests" / "proof"
errors = []

try:
    manifest = json.loads((PROOF_DIR / "manifest.json").read_text(encoding="utf-8"))
except FileNotFoundError:
    print("FAIL: tests/proof/manifest.json is missing")
    sys.exit(1)

on_disk = sorted(p.name for p in PROOF_DIR.glob("*.mjs"))
run = list(manifest.get("run", []))
retired = list(manifest.get("retired", []))
retired_names = []
for entry in retired:
    if not isinstance(entry, dict) or "file" not in entry:
        errors.append(f"retired entry is not an object with a file: {entry!r}")
        continue
    retired_names.append(entry["file"])
    if not str(entry.get("reason", "")).strip():
        errors.append(f"retired proof {entry['file']} carries no reason")

listed = run + retired_names
for name in listed:
    if listed.count(name) > 1:
        errors.append(f"{name} is listed more than once in the manifest")
    if name not in on_disk:
        errors.append(f"manifest lists {name} but tests/proof/{name} does not exist")
for name in on_disk:
    if name not in listed:
        errors.append(f"tests/proof/{name} is neither gate-run nor retired in the manifest")

if errors:
    for e in sorted(set(errors)):
        print("FAIL:", e)
    sys.exit(1)
print(f"proof coverage: PASS ({len(run)} gate-run, {len(retired_names)} retired, "
      f"{len(on_disk)} files on disk - every proof accounted for)")
