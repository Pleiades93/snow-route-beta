#!/usr/bin/env python3
"""Weekly repo metrics (machinery gate round, queue 7b).

COUNTING METHOD - fixed here before any number is computed; the
baseline and every weekly run use exactly this method:
  * Commit: a non-merge commit reachable from HEAD.
  * Line: one line of the commit's diff against its first parent.
  * Comment line: an added line the shared classifier in
    scripts/check-pr-limits.py calls a comment (imported by path -
    one classifier, two consumers).
  * Fix-up commit: the subject is a fixup!/squash! marker, or the
    commit's changed-file set is a subset of the previous commit's
    and it adds no new file (the limit judge's heuristic).
  * Churn: lines changed (added + deleted) in the window, divided
    by the total lines of tracked text files at HEAD.
  * Median commit: the median of added + deleted lines per commit.

Targets (Andrew, 2026-11-23): fix-ups under 10%, comment share
under 10%, 7-day churn under 15%, median commit under 60 lines.

Usage:
  python3 scripts/weekly-metrics.py <root> [--days 7] [--baseline]
--baseline reports the full-history figures and never fails; the
weekly form judges the trailing window against the targets and
exits 1 when any target is missed.
"""
import argparse
import importlib.util
import statistics
import subprocess
import sys
from pathlib import Path

TARGETS = {"fixup_pct": 10.0, "comment_pct": 10.0,
           "churn_pct": 15.0, "median_commit": 60}


def load_limits(root):
    spec = importlib.util.spec_from_file_location(
        "snow_pr_limits", root / "scripts" / "check-pr-limits.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def git(root, *args):
    proc = subprocess.run(["git", "-C", str(root)] + list(args),
                          capture_output=True, text=True, timeout=900)
    if proc.returncode != 0:
        raise SystemExit(f"weekly-metrics: git {' '.join(args)} "
                         f"failed: {proc.stderr.strip()}")
    return proc.stdout


def commit_stats(root, limits, sha, prev_files):
    """One commit's numbers under the counting method."""
    num = git(root, "diff-tree", "--no-commit-id", "--numstat",
              "-r", sha)
    added = deleted = 0
    for ln in num.splitlines():
        parts = ln.split("\t")
        if len(parts) < 3:
            continue
        if parts[0].isdigit():
            added += int(parts[0])
        if parts[1].isdigit():
            deleted += int(parts[1])
    diff = git(root, "diff-tree", "--no-commit-id", "-p", "-r", sha)
    comments = 0
    path = None
    for ln in diff.splitlines():
        if ln.startswith("+++ b/"):
            path = ln[6:]
        elif ln.startswith("+") and not ln.startswith("+++"):
            if path and limits.comment_words(path, ln[1:]) is not None:
                comments += 1
    changed, new_files, _ = limits.commit_files(root, sha)
    subject = git(root, "log", "-1", "--format=%s", sha).strip()
    import re
    fixup = bool(re.match(r"^(fixup|squash)!", subject)) or (
        prev_files is not None and bool(changed) and not new_files
        and changed <= prev_files)
    return {"added": added, "deleted": deleted, "comments": comments,
            "fixup": fixup}, changed


def tracked_text_lines(root):
    total = 0
    out = git(root, "ls-files")
    for rel in out.splitlines():
        p = root / rel
        try:
            data = p.read_bytes()
        except OSError:
            continue
        if b"\0" in data[:4096]:
            continue
        total += data.count(b"\n")
    return total


def summarize(rows, total_lines):
    n = len(rows)
    if not n:
        return {"commits": 0}
    changed = sum(r["added"] + r["deleted"] for r in rows)
    return {
        "commits": n,
        "fixup_pct": 100.0 * sum(r["fixup"] for r in rows) / n,
        "comment_pct": (100.0 * sum(r["comments"] for r in rows)
                        / max(1, sum(r["added"] for r in rows))),
        "churn_pct": 100.0 * changed / max(1, total_lines),
        "median_commit": statistics.median(
            [r["added"] + r["deleted"] for r in rows]),
    }


def report(label, m):
    if not m.get("commits"):
        print(f"{label}: no commits in scope")
        return
    print(f"{label}: {m['commits']} commits | fix-ups "
          f"{m['fixup_pct']:.1f}% (target <{TARGETS['fixup_pct']:.0f}%) "
          f"| comment share {m['comment_pct']:.1f}% "
          f"(target <{TARGETS['comment_pct']:.0f}%) | churn "
          f"{m['churn_pct']:.1f}% (target <{TARGETS['churn_pct']:.0f}%) "
          f"| median commit {m['median_commit']:.0f} lines "
          f"(target <{TARGETS['median_commit']})")


def main():
    ap = argparse.ArgumentParser(description="Weekly repo metrics")
    ap.add_argument("root", type=Path)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--baseline", action="store_true")
    args = ap.parse_args()
    root = args.root.resolve()
    limits = load_limits(root)
    rev_args = ["rev-list", "--no-merges", "--reverse"]
    if not args.baseline:
        rev_args.append(f"--since={args.days + 1} days ago")
    out = git(root, *(rev_args + ["HEAD"]))
    shas = [ln.strip() for ln in out.splitlines() if ln.strip()]
    rows, prev = [], None
    dates = {}
    raw = git(root, "log", "--format=%H %ct", "--no-merges")
    for ln in raw.splitlines():
        h, _, ts = ln.partition(" ")
        dates[h] = int(ts)
    for sha in shas:
        row, prev = commit_stats(root, limits, sha, prev)
        row["ts"] = dates.get(sha, 0)
        rows.append(row)
    total_lines = tracked_text_lines(root)
    print(f"tracked text lines at HEAD: {total_lines}")
    if args.baseline:
        report("BASELINE (full history, counting method v1)",
               summarize(rows, total_lines))
        return 0
    import time
    cutoff = int(time.time()) - args.days * 86400
    window = [r for r in rows if r["ts"] >= cutoff]
    m = summarize(window, total_lines)
    report(f"WEEKLY (trailing {args.days} days)", m)
    if not m.get("commits"):
        return 0
    missed = [k for k, t in TARGETS.items() if m[k] >= t]
    if missed:
        print("weekly-metrics: TARGETS MISSED: " + ", ".join(missed))
        return 1
    print("weekly-metrics: all targets met")
    return 0


if __name__ == "__main__":
    sys.exit(main())
