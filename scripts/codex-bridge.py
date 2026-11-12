#!/usr/bin/env python3
"""Codex review bridge - audit gate (2026-11-11, Andrew approved).

Codex's automatic PR review posts NO check run and NO commit status -
only a summary comment (edited in place) from chatgpt-codex-connector[bot]
carrying a hidden machine-readable state blob:

    <!-- codex-review-state:v1 {"code_review":{"commit_sha":...,
         "has_any_findings":bool, "has_unresolved_findings":bool,
         "status":"completed"|...}, ...} -->

This script is the gate job's verdict: it polls the PR's comments until
Codex's blob FOR THE PR'S CURRENT HEAD SHA reports the review completed,
then passes only when there are no unresolved findings. It FAILS CLOSED:
unresolved findings, a timeout, or an unreadable state all exit 1; a
blob for an older commit never satisfies a newer head.

Verdict logic (decide):
  pass - blob for head SHA, status completed, has_unresolved_findings
         is exactly false.
  fail - blob for head SHA, status completed, unresolved findings true
         (or the field is not a clean boolean false); or timeout.
  wait - no blob yet, blob is for an older SHA, or review not completed.

Modes:
  live (default): poll the GitHub API (GH_TOKEN env) until pass/fail or
                  --timeout-seconds elapse (then fail, exit 1).
  --once --comments-file F: decide once from a saved comments JSON
                  (a list of issue-comment objects); exit 0 pass,
                  1 fail, 2 wait. Used by the script-level tests.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request

BOT_LOGIN = "chatgpt-codex-connector[bot]"
MARKER = "codex-review-state:v1"


def extract_state(body):
    """Pull the codex-review-state:v1 JSON blob out of a comment body."""
    m = re.search(re.escape(MARKER) + r"\s*", body or "")
    if not m:
        return None
    try:
        state, _ = json.JSONDecoder().raw_decode(body[m.end():])
    except Exception:
        return None
    return state if isinstance(state, dict) else None


def decide(comments, head_sha):
    """Return (verdict, reason) with verdict in {pass, fail, wait}."""
    best = None
    for c in comments:
        if (c.get("user") or {}).get("login") != BOT_LOGIN:
            continue
        state = extract_state(c.get("body"))
        if state is None:
            continue
        # Comments arrive chronologically; the bot edits its one summary
        # comment in place, so the last state seen is the current one.
        best = state.get("code_review") or {}
    if best is None:
        return ("wait", "no Codex review-state comment found yet")
    sha = best.get("commit_sha")
    if sha != head_sha:
        return ("wait", "Codex state is for commit %s, waiting for %s"
                % (str(sha)[:8], head_sha[:8]))
    status = best.get("status")
    if status != "completed":
        return ("wait", "Codex review not completed yet (status=%s)" % status)
    unresolved = best.get("has_unresolved_findings")
    if unresolved is True:
        return ("fail", "Codex review completed WITH unresolved findings "
                        "- merge blocked")
    if unresolved is not False:
        return ("fail", "Codex state unreadable: has_unresolved_findings "
                        "is %r, not false - failing closed" % (unresolved,))
    return ("pass", "Codex review completed for %s, no unresolved findings"
            % head_sha[:8])


def fetch_comments(repo, pr, token):
    comments = []
    page = 1
    while True:
        url = ("https://api.github.com/repos/%s/issues/%d/comments"
               "?per_page=100&page=%d" % (repo, pr, page))
        req = urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json",
            "Authorization": "Bearer " + token,
            "X-GitHub-Api-Version": "2022-11-28"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            batch = json.loads(resp.read().decode("utf-8"))
        comments.extend(batch)
        if len(batch) < 100:
            return comments
        page += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", help="owner/name (live mode)")
    ap.add_argument("--pr", type=int, help="PR number (live mode)")
    ap.add_argument("--head-sha", required=True)
    ap.add_argument("--timeout-seconds", type=int, default=900)
    ap.add_argument("--interval-seconds", type=int, default=45)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--comments-file", help="saved comments JSON (--once)")
    args = ap.parse_args()

    if args.once:
        with open(args.comments_file) as f:
            comments = json.load(f)
        verdict, reason = decide(comments, args.head_sha)
        print("verdict=%s reason=%s" % (verdict, reason))
        return {"pass": 0, "fail": 1, "wait": 2}[verdict]

    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        print("FAIL-CLOSED: no GH_TOKEN/GITHUB_TOKEN in env")
        return 1
    deadline = time.time() + args.timeout_seconds
    while True:
        try:
            comments = fetch_comments(args.repo, args.pr, token)
            verdict, reason = decide(comments, args.head_sha)
        except Exception as exc:  # transient API trouble -> keep waiting
            verdict, reason = "wait", "comment fetch failed: %s" % exc
        print("[codex-bridge] %s (%s)" % (verdict, reason), flush=True)
        if verdict == "pass":
            return 0
        if verdict == "fail":
            return 1
        if time.time() >= deadline:
            print("[codex-bridge] FAIL-CLOSED: timeout after %ds - %s"
                  % (args.timeout_seconds, reason))
            return 1
        time.sleep(args.interval_seconds)


if __name__ == "__main__":
    sys.exit(main())
