#!/usr/bin/env python3
"""Shared source-inspection layer (architecture #21, 2026-11-23).

Every machinery query that reads the suite's or the workflow's shape
as DATA — the drive roster, the proof roster, the assertion-site
counts, the shard lists a workflow carries — lives here exactly once,
and every consumer imports it from here. Before this module existed
the same extractions were implemented independently in each consumer:
the drive-roster rule alone had four Python copies (gen-shards.py,
release.py, check-shard-coverage.py, premise-lint.py — the last with a
subtly different grammar, a glob with no numeric filter), the proof
roster two (run-proofs.py, check-proof-coverage.py), and the workflow
shard-list regex two (gen-shards.py, check-mirrors.py). A rule that
lives in N places drifts in N-1 of them; the rollout had just killed
the hand-kept `const ALL` array by replacing it with the drive glob in
every consumer at once, which moved the duplication one level down
instead of ending it. This module is the level it ends at.

Consumers load this module by path from beside their own file (the
pattern check-shard-coverage.py established for gen-shards.py), so a
copied or prospective tree carries its own layer with its own
consumers — the gate fixtures copy it alongside them.

What is deliberately NOT here: the JS-side inspection
(tests/browser/run.mjs's roster, selftest-foreign-writes.mjs's write
census) cannot import a Python module; where it duplicates a fact this
layer owns, an agreement guard proves the two agree (check-shard-
coverage.py for the roster; check-mirrors.py's census family for the
write census's universe). And the two mask_code dialects
(check-census.py, check-mirrors.py) are not copies of anything here or
of each other: they are different grammars answering different
questions (offset-aligned identifier masking vs brace-depth counting
with interpolation kept), so they stay with their owners.

Standard library only; no dependencies.
"""
import json
import re
from pathlib import Path

DRIVE_STEM = re.compile(r"drive\d+")
DEF_LINE = re.compile(r"\s*const\s+(ok|okS|check)\s*=")


# ------------------------------------------------------------- drives

def drive_files(browser_dir: Path) -> list:
    """Every drive file in tests/browser/, sorted by name: the files
    whose stem is exactly drive<digits> — the suite's roster rule."""
    return sorted(
        p for p in Path(browser_dir).glob("drive*.mjs")
        if DRIVE_STEM.fullmatch(p.stem)
    )


def drive_roster(browser_dir: Path) -> list:
    """The drive roster: the stems of drive_files(), in name order."""
    return [p.stem for p in drive_files(browser_dir)]


# ------------------------------------------------------------- proofs

def proof_manifest(proof_dir: Path) -> dict:
    """tests/proof/manifest.json, parsed. Raises FileNotFoundError
    when the manifest is missing — each caller reports that in its
    own voice."""
    return json.loads(
        (Path(proof_dir) / "manifest.json").read_text(encoding="utf-8"))


def proof_files(proof_dir: Path) -> list:
    """Every proof file on disk in tests/proof/, sorted by name."""
    return sorted(p.name for p in Path(proof_dir).glob("*.mjs"))


def retired_proofs(proof_dir: Path) -> list:
    """The manifest's "retired" entries, as written (each an object
    with a file and a reason — check-proof-coverage.py guards their
    honesty; run-proofs.py excludes their files from the run set)."""
    return list(proof_manifest(proof_dir).get("retired", []))


# ---------------------------------------------------- assertion sites

def count_sites(path: Path, helpers: tuple) -> int:
    """The assertion call sites in one file: the lines' calls to any
    of the named helpers (ok(, okS(, check(), excluding the lines that
    DEFINE those helpers. The counting rule release.py's README counts
    are derived by — see its docstring for what a count means."""
    pats = [re.compile(r"(?<![\w.])" + h + r"\(") for h in helpers]
    total = 0
    for line in Path(path).read_text(encoding="utf-8").split("\n"):
        if DEF_LINE.match(line):
            continue
        total += sum(len(p.findall(line)) for p in pats)
    return total


# ---------------------------------------------------- workflow shapes

def workflow_shard_lists(wf_text: str) -> list:
    """The shard lists a workflow text carries: every drives: "..."
    entry, split into drive names, in file order. Since the
    testing-efficiency rollout checks.yml carries none (the runner
    partitions at runtime); a tree that still carries lists — the
    gate fixtures' synthetic trees — is read by this same rule."""
    return [s.split() for s in re.findall(r'drives:\s*"([^"]+)"', wf_text)]


def workflow_smoke_drives(wf_text: str) -> list:
    """The drive names in the workflow's browser-smoke run line
    (run: node tests/browser/run.mjs driveNNN ...), or [] when the
    workflow carries no such line."""
    m = re.findall(
        r"run:\s*node tests/browser/run\.mjs ((?:drive\d+ ?)+)\s*$",
        wf_text, re.M)
    return m[0].split() if m else []
