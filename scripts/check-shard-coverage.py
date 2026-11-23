#!/usr/bin/env python3
"""Shard coverage guard (Beta 1.83; runtime form since the
testing-efficiency rollout, 2026-11-23).

The browser drives run in parallel shards. Through Beta 1.281 the
shard lists were pasted into checks.yml and this guard proved they
partitioned the drive roster exactly once. Since the rollout the
runner computes its share at runtime (tests/browser/run.mjs --shard N)
from scripts/shard-durations.json, and this guard proves the runtime
form cannot silently lose or double-run a drive:

  * the durations file names EXACTLY the drive roster (the glob of
    tests/browser/drive*.mjs - run.mjs rosters itself from the same
    glob, and the runner-agreement check below proves they agree);
  * the partition (scripts/gen-shards.py's statement of the rule)
    covers the roster exactly once - no drive in two shards, none
    missing;
  * the runner's own runtime partition agrees with that statement
    shard for shard (run.mjs --shard N --list for every N);
  * the smoke list in checks.yml names only real drives.

Exits 0 on PASS, 1 on any mismatch. Run from the repo root.
"""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors = []

# The shared source-inspection layer (architecture #21), loaded by
# path from beside this guard (the gate fixtures copy both).
_sq = importlib.util.spec_from_file_location(
    "snow_source_query", Path(__file__).resolve().parent / "source_query.py")
source_query = importlib.util.module_from_spec(_sq)
_sq.loader.exec_module(source_query)

# The roster: source_query.drive_roster() (the one statement of the
# rule). run.mjs computes its roster from the same glob (the hand-kept
# ALL array is gone); the runner-agreement check below - its --list
# output against this partition - is what proves the two agree.
disk = source_query.drive_roster(ROOT / "tests" / "browser")

# The durations file must name exactly the roster.
durations = json.loads((ROOT / "scripts" / "shard-durations.json").read_text(encoding="utf-8"))["seconds"]
if sorted(durations) != disk:
    errors.append(f"shard-durations.json does not name exactly the roster (missing: {sorted(set(disk) - set(durations))}; extra: {sorted(set(durations) - set(disk))})")

# The partition statement (gen-shards.py) must cover the roster exactly once.
spec = importlib.util.spec_from_file_location("snow_gen_shards", ROOT / "scripts" / "gen-shards.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)
shards, totals, _ = gen.partition(disk, durations)
flat = [n for s in shards for n in s]
if sorted(flat) != disk or len(flat) != len(set(flat)):
    errors.append("the partition does not cover the roster exactly once")

# The runner's runtime partition must agree, shard for shard.
for i, want in enumerate(shards, 1):
    proc = subprocess.run(
        ["node", str(ROOT / "tests" / "browser" / "run.mjs"), "--shard", str(i), "--list"],
        capture_output=True, text=True)
    got = proc.stdout.split()
    if proc.returncode != 0 or got != want:
        errors.append(f"run.mjs --shard {i} disagrees with the partition statement (runner: {got}; statement: {want})")

# The smoke list must name only real drives.
wf = (ROOT / ".github" / "workflows" / "checks.yml").read_text(encoding="utf-8")
smoke_names = source_query.workflow_smoke_drives(wf)
for name in smoke_names:
    if name not in disk:
        errors.append(f"smoke drive {name} is not in the roster")

if errors:
    for e in errors:
        print("FAIL:", e)
    sys.exit(1)
print(f"shard coverage: PASS ({len(disk)} drives across {len(shards)} shards, disjoint and complete; "
      f"durations name exactly the roster; runner agrees shard for shard; smoke set {smoke_names})")
