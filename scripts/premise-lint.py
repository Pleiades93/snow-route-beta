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
    python3 scripts/premise-lint.py --base <tree-before> --head <tree-after> --keys

Key mode (--keys, Improvement Tranche 4 / T2, 2026-11-08): the base
mode above is blind to the DA-04 shape - a storage/draft KEY renamed
in parts/ whose short literal survives elsewhere in the same file as
display text (the surviving() check drops it, and the drives that read
the key expire silently). Key mode additionally collects the literals
removed from KEY-BEARING lines in the base version - a line that
constructs or addresses a key: a localStorage/sessionStorage call, a
'snowroute.' key template, a routeKeys/ROUTE_FIELDS/slotKeys/LS_GLOBAL
construction, a bracket member access (obj['lit']), or an object-key
position ('lit':) - and flags drives containing such a literal EVEN
WHEN it survives as display text, unless the literal still appears in
a key-bearing line in the head version of a file it was removed from
(it genuinely survives in key position). Base-mode output is unchanged
when --keys is absent. --drives-dir overrides the drive directory
(the lint fixtures use it); the default is this repo's tests/browser.
Fix cycle 1 (2026-11-08): key position is judged per literal, not per
line - only a storage call's first (key) argument counts, never its
value argument; a bracket counts only for a genuine member access,
never a standalone array literal; comment text is stripped before
classification and never makes a literal a key.

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


def diff_removed_lines(diff_text):
    """{literal: [(source file, removed line text)]} - the key mode's raw material."""
    removed = {}
    cur = None
    for ln in diff_text.splitlines():
        if ln.startswith("diff --git"):
            m = re.search(r"b/(parts/\S+)", ln)
            cur = m.group(1) if m else None
            continue
        if cur and ln.startswith("-") and not ln.startswith("---"):
            for lit in literals_of([ln[1:]]):
                removed.setdefault(lit, []).append((cur, ln[1:]))
    return removed


def trees_removed_lines(base: Path, head: Path):
    """{literal: [(source file, removed line text)]} over two trees' parts/."""
    removed = {}
    parts_b, parts_h = base / "parts", head / "parts"
    files = sorted({p.name for p in parts_b.glob("*")} | {p.name for p in parts_h.glob("*")})
    for name in files:
        b = (parts_b / name).read_text(encoding="utf-8").splitlines() if (parts_b / name).exists() else []
        h = (parts_h / name).read_text(encoding="utf-8").splitlines() if (parts_h / name).exists() else []
        for ln in difflib.unified_diff(b, h, lineterm=""):
            if ln.startswith("-") and not ln.startswith("---"):
                for lit in literals_of([ln[1:]]):
                    removed.setdefault(lit, []).append(("parts/" + name, ln[1:]))
    return removed


def _strip_comments(line):
    """The line with // and /* */ comment text removed (Tranche 4 fix
    cycle 1). String and template literals are tracked while scanning,
    so a // inside a literal (a URL) is not a comment opener and a quote
    inside a comment cannot open a string. Comment text never makes a
    literal a key: classification below runs on the stripped line only."""
    out = []
    i, q = 0, None
    while i < len(line):
        c = line[i]
        if q is not None:
            out.append(c)
            if c == "\\" and i + 1 < len(line):
                out.append(line[i + 1])
                i += 2
                continue
            if c == q:
                q = None
            i += 1
            continue
        if c in "'\"`":
            q = c
            out.append(c)
            i += 1
            continue
        if c == "/" and i + 1 < len(line) and line[i + 1] == "/":
            break
        if c == "/" and i + 1 < len(line) and line[i + 1] == "*":
            e = line.find("*/", i + 2)
            if e < 0:
                break
            i = e + 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


# Key position is POSITIONAL, never line-wide (Tranche 4 fix cycle 1:
# the first key mode classified every literal on a storage-matching
# line as a key - a setItem VALUE and comment text included - and its
# bracket pattern also matched standalone array literals).
_STORAGE_CALL = re.compile(
    r"(?:(?:localStorage|sessionStorage)\s*\.\s*)?(?:getItem|setItem|removeItem)\s*\(\s*$"
)
_KEY_CALL = re.compile(
    r"(?:lsGet|lsSet|lsDel|rawRead|routeKeys|slotKeys|draftKey|storageKey)\s*\(\s*$"
)
_BRACKET_ACCESS = re.compile(
    r"(?:[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*|\]|\))\s*\[\s*$"
)
_KEY_CONTAINER_DEF = re.compile(
    r"^\s*(?:const|let|var)\s+(?:ROUTE_FIELDS|LS_GLOBAL|LEGACY_KEYS)\b"
)


def _span_is_key(stripped, start, end, lit):
    prefix, suffix = stripped[:start], stripped[end:]
    # A storage call's KEY argument only (its first argument); a VALUE
    # argument on the same line is display data, not a key. The same
    # first-argument rule covers the key-taking helpers/constructors.
    if _STORAGE_CALL.search(prefix) or _KEY_CALL.search(prefix):
        return True
    # A genuine bracket member access: an identifier/member expression
    # (or a closing bracket/paren of one) directly before the bracket.
    # A standalone array literal has '=' / '(' / ',' / '[' there instead.
    if _BRACKET_ACCESS.search(prefix):
        return True
    # An object-key position: 'lit': as an entry of an object literal.
    if re.match(r"\s*:", suffix) and prefix.rstrip()[-1:] in ("", "{", ","):
        return True
    # The literal IS a storage key (or a segment of a 'snowroute.'
    # template, whose raw text carries the prefix before any ${...}).
    if "snowroute." in lit:
        return True
    # A literal inside a key-map DEFINITION: an element/value of the
    # ROUTE_FIELDS / LS_GLOBAL / LEGACY_KEYS const, or a key segment in
    # the routeKeys() definition (its p + 'v2.times' style suffixes).
    if _KEY_CONTAINER_DEF.search(stripped) and "=" in prefix:
        return True
    if "function routeKeys" in stripped and (
        prefix.rstrip().endswith("+") or suffix.lstrip().startswith(("+", ":"))
    ):
        return True
    return False


def is_key_line(line, lit):
    """True when `line` uses `lit` in a key-bearing POSITION (fix cycle
    1 narrowing): the first argument of a getItem/setItem/removeItem-
    style storage call or a key-taking helper, a genuine bracket member
    access (obj['lit'] - never a standalone array literal), an object-
    key position ('lit':), a 'snowroute.' key literal/template, or a
    literal in a routeKeys/ROUTE_FIELDS/slotKeys/LS_GLOBAL-style key
    construction. Comment text is stripped before classification."""
    stripped = _strip_comments(line)
    spans = []
    for m in LITERAL.finditer(stripped):
        v = next(g for g in m.groups() if g is not None).strip()
        if v == lit:
            spans.append((m.start(), m.end()))
    if not spans:
        # The shared LITERAL pattern needs 4+ characters, so a short
        # literal elsewhere on the line (the '.' in routeKeys' prefix
        # construction) can mis-segment a longer one out of the match
        # set; locate this literal's quoted occurrences directly.
        for m in re.finditer(r"['\"`]" + re.escape(lit) + r"['\"`]", stripped):
            spans.append((m.start(), m.end()))
    return any(_span_is_key(stripped, s, e, lit) for s, e in spans)


def key_survives(lit, files, head_root: Path):
    """True when the literal still appears in a KEY-BEARING line in the head
    version of any file it was removed from (it survives in key position,
    not merely as display text)."""
    for f in files:
        p = head_root / f
        if p.exists():
            for ln in p.read_text(encoding="utf-8").splitlines():
                if lit in ln and is_key_line(ln, lit):
                    return True
    return False


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
    keys_mode = "--keys" in args
    removed_lines = None
    if "--diff" in args:
        diff_text = Path(args[args.index("--diff") + 1]).read_text(encoding="utf-8")
        removed = diff_removed(diff_text)
        if keys_mode:
            removed_lines = diff_removed_lines(diff_text)
        head_root = ROOT  # a diff is judged against the checked-out (head) tree
    elif "--base" in args and "--head" in args:
        base, head = Path(args[args.index("--base") + 1]), Path(args[args.index("--head") + 1])
        removed = trees_removed(base, head)
        if keys_mode:
            removed_lines = trees_removed_lines(base, head)
        head_root = head
    else:
        print(__doc__)
        return 2
    lits = {lit for lit, files in removed.items() if not surviving(lit, files, head_root)}
    if "--drives-dir" in args:
        drives_root = Path(args[args.index("--drives-dir") + 1])
    else:
        drives_root = ROOT / "tests" / "browser"
    drives = sorted(drives_root.glob("drive*.mjs"))
    e2e = drives_root / "e2e-offline.mjs"
    if e2e.exists():
        drives = drives + [e2e]
    flags = []
    for lit in sorted(lits):
        hits = [d.name for d in drives if lit in d.read_text(encoding="utf-8")]
        if hits:
            flags.append((lit, hits))
    if not flags:
        print("premise-lint: no drive premise touched by this diff")
    else:
        print(f"premise-lint: {len(flags)} premise flag(s) - drive text this diff removed:")
        for lit, hits in flags:
            print(f"  {lit!r}  asserted by: {', '.join(hits)}")
        print("premise-lint: update those drives in the same change, or record the expiry in the flake log.")
    key_flags = []
    if keys_mode:
        base_flagged = {lit for lit, _ in flags}
        key_lits = set()
        for lit, sites in (removed_lines or {}).items():
            if lit in base_flagged:
                continue
            if not any(is_key_line(line, lit) for _, line in sites):
                continue
            files = {f for f, _ in sites}
            if key_survives(lit, files, head_root):
                continue
            key_lits.add(lit)
        for lit in sorted(key_lits):
            hits = [d.name for d in drives if lit in d.read_text(encoding="utf-8")]
            if hits:
                key_flags.append((lit, hits))
        if not key_flags:
            print("premise-lint --keys: no key premise touched by this diff")
        else:
            print(f"premise-lint --keys: {len(key_flags)} key premise flag(s) - drive key text this diff renamed (literal survives as display text):")
            for lit, hits in key_flags:
                print(f"  {lit!r}  asserted by: {', '.join(hits)}")
            print("premise-lint --keys: update those drives in the same change, or record the expiry in the flake log.")
    return 1 if strict and (flags or key_flags) else 0


if __name__ == "__main__":
    sys.exit(main())
