#!/usr/bin/env python3
"""Premise lint (Beta 1.136, maintainability programme E).

A drive's PREMISE is the app text it trusts: a button label, a pane
title, a selector's class, a contract string. When an app change edits
one of those strings, every drive asserting the old string expires -
silently, until it fails in CI as a mystery (the Beta 1.132 cosmetic
ship renamed two sector-bar labels and expired three drives' text
checks; they were noticed only because a human remembered). This lint
makes the expiry mechanical: given a diff of parts/, it extracts the
string literals the diff REMOVES, drops any that still exist in the
head version of their own file (a literal on a merely-touched line is
not an expired premise), and reports every drive file that still
contains one of the truly-removed literals.

Usage:
    python3 scripts/premise-lint.py --diff pr.diff
    python3 scripts/premise-lint.py --base <tree-before> --head <tree-after>
    python3 scripts/premise-lint.py --diff pr.diff --strict

Advisory by default (flags printed, exit 0): a flag means "a drive
trusts text this change removed - update the drive in the same change,
or record the expiry in the flake log" (DEVELOPMENT_RULES), never "the
change is wrong". --strict exits 1 when flags exist, for callers that
want a gate. Only literals of 4+ characters are considered, and only
from parts/ files; hits inside tests/browser/fixtures are ignored
(fixtures are frozen data by design).
"""
import difflib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LITERAL = re.compile(r"""'([^'\n]{4,})'|"([^"\n]{4,})"|`([^`\n]{4,})`""")


def literals_of(lines):
    out = set()
    for ln in lines:
        for m in LITERAL.finditer(ln):
            v = next(g for g in m.groups() if g is not None)
            v = v.strip()
            if len(v) >= 4 and not re.fullmatch(r"[\d\s.,:;+\-*/%()]+", v):
                out.add(v)
    return out


def diff_removed(diff_text):
    """{literal: {source files}} for literals on removed parts/ lines."""
    removed = {}
    cur = None
    for ln in diff_text.splitlines():
        if ln.startswith("diff --git"):
            m = re.search(r"b/(parts/\S+)", ln)
            cur = m.group(1) if m else None
            continue
        if cur and ln.startswith("-") and not ln.startswith("---"):
            for lit in literals_of([ln[1:]]):
                removed.setdefault(lit, set()).add(cur)
    return removed


def trees_removed(base: Path, head: Path):
    removed = {}
    parts_b, parts_h = base / "parts", head / "parts"
    files = sorted({p.name for p in parts_b.glob("*")} | {p.name for p in parts_h.glob("*")})
    for name in files:
        b = (parts_b / name).read_text(encoding="utf-8").splitlines() if (parts_b / name).exists() else []
        h = (parts_h / name).read_text(encoding="utf-8").splitlines() if (parts_h / name).exists() else []
        for ln in difflib.unified_diff(b, h, lineterm=""):
            if ln.startswith("-") and not ln.startswith("---"):
                for lit in literals_of([ln[1:]]):
                    removed.setdefault(lit, set()).add("parts/" + name)
    return removed


def surviving(lit, files, head_root: Path):
    """True when the literal still exists in the head of any file it was removed from."""
    for f in files:
        p = head_root / f
        if p.exists() and lit in p.read_text(encoding="utf-8"):
            return True
    return False


def main() -> int:
    args = sys.argv[1:]
    strict = "--strict" in args
    if "--diff" in args:
        removed = diff_removed(Path(args[args.index("--diff") + 1]).read_text(encoding="utf-8"))
        head_root = ROOT  # a diff is judged against the checked-out (head) tree
    elif "--base" in args and "--head" in args:
        base, head = Path(args[args.index("--base") + 1]), Path(args[args.index("--head") + 1])
        removed = trees_removed(base, head)
        head_root = head
    else:
        print(__doc__)
        return 2
    lits = {lit for lit, files in removed.items() if not surviving(lit, files, head_root)}
    drives = sorted((ROOT / "tests" / "browser").glob("drive*.mjs")) + [ROOT / "tests" / "browser" / "e2e-offline.mjs"]
    flags = []
    for lit in sorted(lits):
        hits = [d.name for d in drives if lit in d.read_text(encoding="utf-8")]
        if hits:
            flags.append((lit, hits))
    if not flags:
        print("premise-lint: no drive premise touched by this diff")
        return 0
    print(f"premise-lint: {len(flags)} premise flag(s) - drive text this diff removed:")
    for lit, hits in flags:
        print(f"  {lit!r}  asserted by: {', '.join(hits)}")
    print("premise-lint: update those drives in the same change, or record the expiry in the flake log.")
    return 1 if strict else 0


if __name__ == "__main__":
    sys.exit(main())
