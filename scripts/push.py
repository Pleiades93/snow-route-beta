#!/usr/bin/env python3
"""The repo's one supported push path (/correct Phase 2, round C2+C8).

Why this exists: the connector helper's push takes local=remote pairs
and defaults a bare filename's remote path to the repo ROOT. Five
times (d5547ed at 1.218, f9bad37 at 1.221, 88ba195 at 1.223, 7d6818d
at 1.230, d5258ef at 1.232) a push written with basenames scattered
files to the root instead of their directories, each needing a
repair commit - and twice in PR #98 (8f50661, b648e77) the push
carried parts/ but not the re-assembled derived files, because the
builders verified the LOCAL tree while the PUSHED tree was
incomplete. The standing rule in TOOLS.md governed repo/branch, not
per-file paths, so the scatter kept happening after it.

This wrapper makes both shapes impossible rather than discouraged:

  plan  - validates a proposed push set against the working tree:
          (1) entries are repo-relative paths; a basename-only entry
              is REFUSED, naming the repo-relative path it presumably
              meant (a bare name that exists ONLY at the root, like
              README.md, is unambiguous and accepted);
          (2) every entry exists in the working tree;
          (3) a set carrying anything under parts/ must also carry
              the derived artifacts (src/tracker-source.html and
              index.html) - the C8 completeness rule;
          (4) when parts or derived files are in the set, the derived
              artifacts must be FRESH: scripts/build-pages.py --check
              must pass, so what is pushed is what the parts build.
  push  - runs plan, then a PREFLIGHT against the target branch:
          the PROSPECTIVE remote tree (the branch's tree overlaid
          with this push set) must pass scripts/build-pages.py
          --check. It runs for every push, whatever the set names:
          the derived artifacts were built from every local
          assembly input - parts/, the splash artwork, CHANGELOG.md,
          and whatever else the assembler reads - so any input that
          differs from the branch but is not pushed would strand
          them over inputs that do not build them, and an input-only
          push (a version bump in CHANGELOG.md alone) would strand
          the branch's stale derived files under the new input
          (Codex P2s on PR #146; the check is over the whole tree,
          not an input list, so a future input is covered the day
          it exists).
          Then it delegates the transport to the connector helper
          (explicit --repo snow-route-beta and --branch, every pair
          local=remote identical), and VERIFIES THE PUSHED TREE:
          the new head's blob for every pushed path must equal the
          local file's blob. The verification anchor is the remote
          tree, never the local one.

Usage:
  python3 scripts/push.py plan <root> --branch B --message M <path>...
  python3 scripts/push.py push <root> --branch B --message M <path>...

The helper's location defaults to the workspace connector install and
can be overridden with SNOW_GITHUB_HELPER. plan never touches the
network and is what the gate fixtures exercise.
"""
import argparse
import hashlib
import importlib.util
import os
import posixpath
import subprocess
import sys
from pathlib import Path

REPO_SLUG = "snow-route-beta"
DERIVED_FOR_PARTS = ["src/tracker-source.html", "index.html"]
SKIP_DIRS = {".git", "node_modules", "__pycache__"}


def fail(msg):
    print("PUSH REFUSED: " + msg)
    return 1


def tree_basenames(root):
    """basename -> sorted repo-relative paths, for the whole tree."""
    found = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            rel = os.path.relpath(os.path.join(dirpath, name), root)
            found.setdefault(name, []).append(rel.replace(os.sep, "/"))
    for v in found.values():
        v.sort()
    return found


def validate(root, entries):
    """Returns (resolved_paths, error). Pure local; no network."""
    if not entries:
        return None, "no files named - a push set is never empty"
    if len(set(entries)) != len(entries):
        return None, "the set names the same file twice"
    by_base = tree_basenames(root)
    resolved = []
    for entry in entries:
        # Canonicalize BEFORE any classification: a spelling like
        # ./parts/app3.js must meet the same guards as parts/app3.js
        # (Codex P2 on PR #146 - the un-normalized spelling walked
        # around both derived-artifact guards).
        entry = posixpath.normpath(entry.replace(os.sep, "/"))
        if entry.startswith("/") or entry == ".." or entry.startswith("../"):
            return None, f"'{entry}' is not a repo-relative path inside the tree"
        if "/" not in entry:
            matches = by_base.get(entry, [])
            if matches == [entry]:
                resolved.append(entry)  # exists only at the root: unambiguous
                continue
            if matches:
                return None, (f"basename-only entry '{entry}' - this path takes repo-relative "
                              f"paths; the file lives at {', '.join(matches)} (the basename "
                              "default is what scattered five pushes to the repo root)")
            return None, f"'{entry}' matches no file in the tree"
        if not (root / entry).is_file():
            return None, f"'{entry}' is not a file in the working tree"
        resolved.append(entry)
    if any(p.startswith("parts/") for p in resolved):
        missing = [d for d in DERIVED_FOR_PARTS if d not in resolved]
        if missing:
            return None, ("the set carries parts/ but not the derived artifact(s): "
                          + ", ".join(missing)
                          + " - assemble and include them (a parts-only push is the "
                          "PR #98 omission, twice)")
    return resolved, None


def derived_fresh(root, resolved):
    """build-pages.py --check must pass when parts/derived are pushed."""
    if not any(p.startswith("parts/") or p in DERIVED_FOR_PARTS for p in resolved):
        return None
    proc = subprocess.run([sys.executable, str(root / "scripts" / "build-pages.py"), "--check"],
                          cwd=root, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        tail = (proc.stdout + proc.stderr).strip().splitlines()
        return ("derived artifacts are stale or inconsistent - run scripts/assemble.py "
                "and scripts/build-pages.py, then push the results. build-pages --check said: "
                + (tail[-1] if tail else "(no output)"))
    return None


def blob_sha(path):
    data = Path(path).read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def helper_module():
    helper = os.environ.get("SNOW_GITHUB_HELPER",
                            "/home/hatch/workspace/custom-connectors/custom.github/bin/github.py")
    spec = importlib.util.spec_from_file_location("snow_github_helper", helper)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod, helper


def remote_blobs(gh, branch):
    base = f"/repos/Pleiades93/{REPO_SLUG}"
    head = gh.api("GET", f"{base}/git/ref/heads/{branch}")["object"]["sha"]
    tree = gh.api("GET", f"{base}/git/trees/{head}?recursive=1")
    return head, {e["path"]: e["sha"] for e in tree.get("tree", []) if e.get("type") == "blob"}


def local_blob_map(root):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            p = Path(dirpath) / name
            out[p.relative_to(root).as_posix()] = blob_sha(p)
    return out


def preflight_prospective(root, gh, branch, resolved):
    """The tree this push would CREATE must itself build. Returns an
    error string or None. Runs for EVERY push (Codex P2 on PR #146:
    an input-only push - CHANGELOG.md alone, artwork alone - named
    neither parts/ nor a derived artifact and skipped every check,
    stranding stale derived files on the branch). Only inputs that
    differ from the branch and are NOT in the set can make the
    prospective tree differ from the local one; those are overlaid
    with their branch blobs in a temp copy and build-pages --check
    is run there. When nothing differs outside the set, the
    prospective tree IS the local tree and the check runs on it."""
    _, remote = remote_blobs(gh, branch)
    local = local_blob_map(root)
    # The prospective tree is the branch's tree plus this set. Three
    # kinds of local content do not reach it unchanged: files whose
    # branch blob differs (overlay the branch version), files the
    # branch has that the local tree lacks (restore the branch
    # version), and local-only files outside the set (drop them).
    overlay = sorted(p for p in remote
                     if p not in resolved and remote[p] != local.get(p))
    drop = sorted(p for p in local if p not in resolved and p not in remote)
    if not overlay and not drop:
        proc = subprocess.run([sys.executable, str(root / "scripts" / "build-pages.py"), "--check"],
                              cwd=root, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            tail = (proc.stdout + proc.stderr).strip().splitlines()
            return ("the tree this push would create is the local tree, and it does not "
                    "build - build-pages --check said: " + (tail[-1] if tail else "(no output)"))
        return None
    import base64
    import shutil
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="push-prospective-"))
    try:
        shutil.copytree(root, tmp, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns(".git", "node_modules", "__pycache__"))
        base = f"/repos/Pleiades93/{REPO_SLUG}"
        for rel in overlay:
            blob = gh.api("GET", f"{base}/git/blobs/{remote[rel]}")
            data = base64.b64decode(blob["content"])
            dest = tmp / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        for rel in drop:
            (tmp / rel).unlink(missing_ok=True)
        proc = subprocess.run([sys.executable, str(tmp / "scripts" / "build-pages.py"), "--check"],
                              cwd=tmp, capture_output=True, text=True, timeout=300)
        if proc.returncode != 0:
            tail = (proc.stdout + proc.stderr).strip().splitlines()
            named = ", ".join(overlay + drop)
            return ("the prospective remote tree does not build: file(s) that would not "
                    "reach " + branch + " in their local form: " + named
                    + " - the derived artifacts were built from the local tree. "
                    "Push them too, or revert them locally. build-pages --check said: "
                    + (tail[-1] if tail else "(no output)"))
        return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def do_push(root, branch, message, resolved):
    gh, helper = helper_module()
    err = preflight_prospective(root, gh, branch, resolved)
    if err:
        return fail(err)
    pairs = [f"{p}={p}" for p in resolved]
    cmd = [sys.executable, helper, "--repo", REPO_SLUG, "--branch", branch,
           "push", "--message", message] + pairs
    # cwd=root (Codex P2 on PR #146): the pairs are repo-relative, so
    # the transport must read them from the VALIDATED tree, not from
    # whatever directory the caller happened to invoke this from.
    proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=600)
    sys.stdout.write(proc.stdout)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr)
        return fail("the transport push failed (see above) - nothing was verified")
    # Verify the PUSHED tree: every pushed path's remote blob must
    # equal the local file's blob at the branch's new head.
    head, remote = remote_blobs(gh, branch)
    bad = [p for p in resolved if remote.get(p) != blob_sha(root / p)]
    if bad:
        return fail("pushed-tree verification failed - the remote blob differs from the "
                    "local file for: " + ", ".join(bad))
    print(f"PUSH VERIFIED: {len(resolved)} file(s) on {branch} @ {head[:8]} - "
          "every remote blob equals its local file")
    return 0


def main():
    ap = argparse.ArgumentParser(description="The repo's one supported push path")
    ap.add_argument("mode", choices=["plan", "push"])
    ap.add_argument("root", type=Path)
    ap.add_argument("--branch", required=True)
    ap.add_argument("--message", required=True)
    ap.add_argument("files", nargs="+")
    args = ap.parse_args()
    root = args.root.resolve()
    resolved, err = validate(root, args.files)
    if err:
        return fail(err)
    err = derived_fresh(root, resolved)
    if err:
        return fail(err)
    print("PUSH PLAN OK: " + ", ".join(resolved))
    if args.mode == "plan":
        return 0
    return do_push(root, args.branch, args.message, resolved)


if __name__ == "__main__":
    sys.exit(main())
