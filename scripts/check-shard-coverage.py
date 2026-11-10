#!/usr/bin/env python3
"""Shard coverage guard (Beta 1.83, CI-speed round).

The browser drives run in parallel shards (see .github/workflows/checks.yml).
This guard proves the partition is complete and non-overlapping: the union of
the shard drive lists must equal the runner's ALL list exactly, with no drive
in two shards and none missing - a drive that falls out of every shard would
silently stop being tested, and this check is what makes that impossible.
The smoke list (main-push job) must also name only real drives.
Exits 0 on PASS, 1 on any mismatch. Run from the repo root.
"""
import re
import sys

run_src = open('tests/browser/run.mjs').read()
m = re.search(r"const ALL = \[([^\]]*)\]", run_src)
if not m:
    print('FAIL: could not find const ALL in tests/browser/run.mjs')
    sys.exit(1)
ALL = re.findall(r"'(drive\d+)'", m.group(1))

wf = open('.github/workflows/checks.yml').read()
shards = re.findall(r'drives:\s*"([^"]+)"', wf)
if len(shards) != 8:
    print(f'FAIL: expected 8 shard drive lists in checks.yml, found {len(shards)}')
    sys.exit(1)
shard_lists = [s.split() for s in shards]

smoke = re.findall(r'run:\s*node tests/browser/run\.mjs ((?:drive\d+ ?)+)\s*$', wf, re.M)
smoke_names = smoke[0].split() if smoke else []

errors = []
seen = {}
for i, lst in enumerate(shard_lists, 1):
    for name in lst:
        if name in seen:
            errors.append(f'{name} appears in shard {seen[name]} and shard {i}')
        seen[name] = i
missing = [n for n in ALL if n not in seen]
extra = [n for n in seen if n not in ALL]
if missing:
    errors.append(f'drives in ALL but in NO shard: {missing}')
if extra:
    errors.append(f'drives in shards but not in ALL: {extra}')
for name in smoke_names:
    if name not in ALL:
        errors.append(f'smoke drive {name} is not in ALL')

if errors:
    for e in errors:
        print('FAIL:', e)
    sys.exit(1)
print(f'shard coverage: PASS ({len(ALL)} drives across {len(shard_lists)} shards, disjoint and complete; smoke set {smoke_names})')
