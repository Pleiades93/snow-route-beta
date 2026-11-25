#!/usr/bin/env python3
"""Pull-request limit judge (machinery gate round, queue 7b).

Judges a PR diff (base..HEAD) under the coding-discipline limits
Andrew set on 2026-11-23. Only ADDED lines are ever judged.

FAIL rules:
  * A single commit adding more than SIZE_LIMIT product lines,
    unless the PR carries the large-change label. The label is
    applied by Andrew or the lead only; this judge never applies
    it. Product lines are added lines under parts/, plus src/sw.js
    and flags.js - the shipped app's own code.
  * An added comment line of more than COMMENT_WORD_LIMIT words.
  * An added line longer than LINE_CHAR_LIMIT characters.
  * A NEW file at the repo root outside ROOT_ALLOWLIST.

WARN rules (printed, never failing - promotion is Andrew's call):
  * A mixed-scope PR (paths spanning more than one concern area).
  * A fix-up-only commit: its changed-file set is a subset of the
    previous commit's and it adds no new file, or its subject is a
    fixup!/squash! marker.

Comment lines, by file type: '#' for .py/.yml/.yaml/.sh, '//',
'/*' or '*' continuation lines for .js/.mjs/.css, '<!--' for
.html/.md. A comment's words are its whitespace-separated tokens
after the marker.

GENERATED_EXEMPT files (the vendored registry, the two ledgers,
the built page) are skipped by the line-length and comment rules:
their lines are machine-written, and the limits govern
hand-written lines. They are named here, not inferred.

Usage:
  python3 scripts/check-pr-limits.py <root> --base <sha> [--labels a,b]
"""
import argparse
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

SIZE_LIMIT = 300
COMMENT_WORD_LIMIT = 20
LINE_CHAR_LIMIT = 240
LARGE_LABEL = "large-change"

# Root files that exist today. A new root file means a deliberate
# edit of this list in the same change, or the judge refuses it.
ROOT_ALLOWLIST = {
    ".gitignore", "AGENTS.md", "CHANGELOG.md", "DEVELOPMENT_RULES.md",
    "README.md", "apple-touch-icon.png", "favicon.svg", "flags.js",
    "icon-1024.png", "icon-16.png", "icon-192.png", "icon-32.png",
    "icon-512.png", "icon-maskable-512.png", "index.html",
    "manifest.json", "splash-artwork-512.png", "sw.js",
}

PRODUCT_PATTERNS = ["parts/*", "src/sw.js", "flags.js"]

GENERATED_EXEMPT = {
    "hidden_files/fix-checks.json", "tests/mutation-receipts.json",
    "tests/sibling-census.json", "index.html", "sw.js",
}


def is_product_path(path):
    return any(fnmatch.fnmatch(path, p) for p in PRODUCT_PATTERNS)


def comment_words(path, line):
    """Word count if the line is a comment line, else None."""
    s = line.strip()
    ext = Path(path).suffix.lower()
    marker = None
    if ext in (".py", ".yml", ".yaml", ".sh"):
        marker = "#" if s.startswith("#") else None
    elif ext in (".js", ".mjs", ".css"):
        for m in ("//", "/*", "*"):
            if s.startswith(m):
                marker = m
                break
    elif ext in (".html", ".md"):
        marker = "<!--" if s.startswith("<!--") else None
    if marker is None:
        return None
    return len(s[len(marker):].split())


def git(root, *args):
    proc = subprocess.run(["git", "-C", str(root)] + list(args),
                          capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise SystemExit(f"pr-limits: git {' '.join(args)} failed: "
                         f"{proc.stderr.strip()}")
    return proc.stdout


def ensure_base(root, base):
    proc = subprocess.run(["git", "-C", str(root), "cat-file", "-e",
                           f"{base}^{{commit}}"],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        git(root, "fetch", "--no-tags", "--depth=1000", "origin", base)


def commit_list(root, base):
    out = git(root, "rev-list", "--reverse", f"{base}..HEAD")
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def commit_files(root, sha):
    """(changed paths, added paths, added product lines) for a commit."""
    out = git(root, "diff-tree", "--no-commit-id", "--name-status",
              "-r", sha)
    changed, added, product = set(), set(), 0
    for ln in out.splitlines():
        parts = ln.split("\t")
        if len(parts) < 2:
            continue
        status, path = parts[0], parts[-1]
        changed.add(path)
        if status.startswith("A"):
            added.add(path)
    num = git(root, "diff-tree", "--no-commit-id", "--numstat", "-r", sha)
    for ln in num.splitlines():
        parts = ln.split("\t")
        if len(parts) < 3:
            continue
        adds, path = parts[0], parts[-1]
        if adds.isdigit() and is_product_path(path):
            product += int(adds)
    return changed, added, product


def added_lines(root, base):
    """(path, text) for every added line in the base..HEAD diff."""
    out = git(root, "diff", "--unified=0", "--no-renames",
              f"{base}..HEAD")
    path = None
    for ln in out.splitlines():
        if ln.startswith("+++ b/"):
            path = ln[6:]
        elif ln.startswith("+") and not ln.startswith("+++"):
            yield path, ln[1:]


def scope_areas(root, base):
    out = git(root, "diff", "--name-only", f"{base}..HEAD")
    areas = set()
    for path in out.splitlines():
        if not path:
            continue
        if path.startswith(("parts/", "src/")) or path in (
                "flags.js", "index.html", "sw.js"):
            areas.add("app")
        elif path.startswith(("scripts/", ".github/")) or path.startswith(
                "hidden_files/"):
            areas.add("machinery")
        elif path.startswith("tests/"):
            areas.add("tests")
        else:
            areas.add("docs")
    return areas


def main():
    ap = argparse.ArgumentParser(description="PR limit judge")
    ap.add_argument("root", type=Path)
    ap.add_argument("--base", required=True)
    ap.add_argument("--labels", default="")
    args = ap.parse_args()
    root = args.root.resolve()
    labels = {s.strip() for s in args.labels.split(",") if s.strip()}
    ensure_base(root, args.base)
    errors, warnings = [], []

    commits = commit_list(root, args.base)
    prev_files = None
    for sha in commits:
        subject = git(root, "log", "-1", "--format=%s", sha).strip()
        parents = git(root, "log", "-1", "--format=%P", sha).split()
        changed, added, product = commit_files(root, sha)
        if len(parents) < 2 and product > SIZE_LIMIT:
            if LARGE_LABEL in labels:
                print(f"pr-limits: {sha[:8]} adds {product} product "
                      f"lines; {LARGE_LABEL} label present - allowed")
            else:
                errors.append(
                    f"commit {sha[:8]} adds {product} product lines "
                    f"(limit {SIZE_LIMIT}) without the {LARGE_LABEL} "
                    "label - the label is applied by Andrew or the "
                    "lead, never by the change's author")
        if re.match(r"^(fixup|squash)!", subject):
            warnings.append(f"commit {sha[:8]} is a fixup!/squash! "
                            "marker commit")
        elif (prev_files is not None and changed and not added
              and changed <= prev_files):
            warnings.append(f"commit {sha[:8]} looks fix-up-only "
                            "(its files are a subset of the previous "
                            "commit's, and it adds no new file)")
        prev_files = changed

    for path, text in added_lines(root, args.base):
        if path is None or path in GENERATED_EXEMPT:
            continue
        if len(text) > LINE_CHAR_LIMIT:
            errors.append(f"{path}: added line of {len(text)} chars "
                          f"(limit {LINE_CHAR_LIMIT})")
        words = comment_words(path, text)
        if words is not None and words > COMMENT_WORD_LIMIT:
            errors.append(f"{path}: added comment line of {words} "
                          f"words (limit {COMMENT_WORD_LIMIT})")

    out = git(root, "diff", "--name-status", "--no-renames",
              f"{args.base}..HEAD")
    for ln in out.splitlines():
        parts = ln.split("\t")
        if len(parts) < 2:
            continue
        status, path = parts[0], parts[-1]
        if status.startswith("A") and "/" not in path \
                and path not in ROOT_ALLOWLIST:
            errors.append(f"new root file {path} is not in the "
                          "allowlist - root files are deliberate")

    areas = scope_areas(root, args.base)
    if len(areas) > 1:
        warnings.append("mixed-scope PR: paths span "
                        + ", ".join(sorted(areas))
                        + " (warn only - promotion is Andrew's call)")

    for w in warnings:
        print(f"::warning::pr-limits: {w}")
    for e in errors:
        print(f"::error::pr-limits: {e}")
    if errors:
        print(f"pr-limits: FAIL ({len(errors)} error(s), "
              f"{len(warnings)} warning(s))")
        return 1
    print(f"pr-limits: PASS ({len(commits)} commit(s) judged, "
          f"{len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
