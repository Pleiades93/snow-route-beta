#!/usr/bin/env python3
"""Proof coverage guard (protocol fix round, 2026-11-17; generated
roster, testing-efficiency rollout, 2026-11-23).

The 2026-11-17 protocol audit found 18 of 38 files in tests/proof/
never ran in CI: each proof was wired by hand as a named step in
checks.yml, and nothing checked the wiring. The manifest era fixed
the wiring but kept a hand-typed "run" list that could drift from
the disk. Since the rollout there is no run list: scripts/run-proofs.py
runs every proof file on disk except the ones tests/proof/manifest.json
lists under "retired". This guard proves the retired list is honest:

  * every retired entry names a file that exists on disk;
  * every retired entry carries a non-empty reason;
  * no file is retired twice;
  * the manifest carries no "run" list (a leftover hand list is the
    drift this design exists to kill - its presence fails the guard).

Exits 0 on PASS, 1 on any violation. Run from the repo root; an optional
argv[1] names another root (the verdict fixtures in
scripts/gate-fixtures/ run this guard against synthetic trees).
"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
PROOF_DIR = ROOT / "tests" / "proof"
errors = []

# The shared source-inspection layer (architecture #21), loaded by
# path from beside this guard: the proof roster and the retired list
# are its statements of the rule, shared with run-proofs.py.
_sq = importlib.util.spec_from_file_location(
    "snow_source_query", Path(__file__).resolve().parent / "source_query.py")
source_query = importlib.util.module_from_spec(_sq)
_sq.loader.exec_module(source_query)

try:
    manifest = source_query.proof_manifest(PROOF_DIR)
except FileNotFoundError:
    print("FAIL: tests/proof/manifest.json is missing")
    sys.exit(1)

if "run" in manifest:
    errors.append("the manifest carries a \"run\" list - the run roster is derived "
                  "from the disk glob since the 2026-11-23 rollout; delete the list")

on_disk = source_query.proof_files(PROOF_DIR)
retired = source_query.retired_proofs(PROOF_DIR)
retired_names = []
for entry in retired:
    if not isinstance(entry, dict) or "file" not in entry:
        errors.append(f"retired entry is not an object with a file: {entry!r}")
        continue
    retired_names.append(entry["file"])
    if not str(entry.get("reason", "")).strip():
        errors.append(f"retired proof {entry['file']} carries no reason")
for name in retired_names:
    if retired_names.count(name) > 1:
        errors.append(f"{name} is retired more than once in the manifest")
    if name not in on_disk:
        errors.append(f"manifest retires {name} but tests/proof/{name} does not exist")

if errors:
    for e in sorted(set(errors)):
        print("FAIL:", e)
    sys.exit(1)
print(f"proof coverage: PASS ({len(on_disk) - len(retired_names)} gate-run, {len(retired_names)} retired, "
      f"{len(on_disk)} files on disk - the roster is the disk glob, the retired list is honest)")
