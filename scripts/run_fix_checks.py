#!/usr/bin/env python3
"""Shared fix-checks runner — one implementation for every goal's registry.

Created 2026-10-29 (Engineering Intelligence Toolkit Phase 1, workstream 2) by
generalizing the KOTN goal's hidden_files/run-fix-checks.py. The ONLY change
from the KOTN original is where the goal directory comes from (a CLI argument
or the FIX_CHECKS_GOAL_DIR environment variable instead of the script's own
location). Probe semantics, output lines, the summary line and the exit code
are identical to the KOTN original; parity was proven probe-by-probe against
the KOTN registry before any goal's invocation path was pointed here (see
~/workspace/engineering-toolkit/plan.md §1.2). The KOTN original is preserved
at ~/workspace/engineering-toolkit/backups/run-fix-checks.py.kotn-original-2026-10-29.

This runner executes grep_present / grep_absent / command_exit0 probes
exactly as registered. cron_job probes need the scheduler's live state and
are reported as MANUAL (verify via cron.list / cron.status) rather than
guessed from files.
Usage: run_fix_checks.py [GOAL_DIR] [--json] [--exclude <probe-id> ...]
(exit 1 if any probe fails). GOAL_DIR may also be given as --goal DIR; if
no goal is named, the current working directory is used when it contains
hidden_files/fix-checks.json. --exclude exists for probes whose runtime
cannot fit the caller's window — e.g. KOTN's capture-fault-battery, a
real-time simulation with minutes of real sleeps; it runs standalone on its
own Sunday slot. An excluded probe prints a SKIP line and is counted
separately: a SKIP is never a PASS.
"""
import glob as globmod
import json
import os
import subprocess
import sys


def resolve_goal(argv):
    """Goal dir from the first bare positional arg, --goal, or the env var;
    falls back to the CWD when it holds a registry."""
    args = list(argv)
    goal = None
    if '--goal' in args:
        i = args.index('--goal')
        if i + 1 < len(args):
            goal = args[i + 1]
            del args[i:i + 2]
    i = 0
    while goal is None and i < len(args):
        a = args[i]
        if a == '--exclude':
            i += 2
            continue
        if not a.startswith('-'):
            goal = a
        i += 1
    if goal is None:
        goal = os.environ.get('FIX_CHECKS_GOAL_DIR')
    if goal is None and os.path.isfile(
            os.path.join(os.getcwd(), 'hidden_files', 'fix-checks.json')):
        goal = os.getcwd()
    if goal is None:
        sys.exit('no goal directory given and none could be inferred')
    return os.path.abspath(goal)


GOAL = resolve_goal(sys.argv[1:])
HF = os.path.join(GOAL, 'hidden_files')


def run_probe(p):
    t = p.get('type')
    if t in ('grep_present', 'grep_absent'):
        files = []
        if p.get('file'):
            files = [os.path.join(GOAL, p['file'])]
        elif p.get('file_glob'):
            files = sorted(globmod.glob(os.path.join(GOAL, p['file_glob'])))
        if not files:
            # No target at all (missing explicit file is caught below; an
            # empty glob lands here): "target unavailable" is a FAIL for
            # both grep types, never a pass. (Fix 2026-11-16, retro-fund
            # Finding 3: the old code swallowed OSError and let a missing
            # or unreadable target pass grep_absent.)
            return False, (f"target unavailable: no file matched "
                           f"{p.get('file') or p.get('file_glob')!r}")
        found_in = []
        for f in files:
            try:
                with open(f, errors='ignore') as fh:
                    content = fh.read()
            except OSError:
                return False, f"target unavailable: {f}"
            if p['pattern'] in content:
                found_in.append(os.path.basename(f))
        found = bool(found_in)
        ok = found if t == 'grep_present' else not found
        return ok, (f"found in {found_in}" if found else
                    f"not found in {len(files)} file(s)")
    if t == 'command_exit0':
        r = subprocess.run(p['command'], shell=True, cwd=GOAL,
                           capture_output=True, text=True, timeout=900)
        return r.returncode == 0, f"exit {r.returncode}"
    if t == 'cron_job':
        return None, 'MANUAL — verify via cron.list / cron.status'
    return False, f'unknown probe type {t!r}'


def main():
    fc = json.load(open(os.path.join(HF, 'fix-checks.json')))
    checks = fc['checks']
    excluded = set()
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a == '--exclude' and i + 1 < len(argv):
            excluded.add(argv[i + 1])
    fails, manuals, skips, cionly = [], [], [], []
    for p in checks:
        if p['id'] in excluded:
            skips.append(p['id'])
            print(f"SKIP    {p['id']}: excluded by this invocation — NOT a pass; "
                  f"verified by its own scheduled run")
            continue
        if p.get('ci_only'):
            # Venue-bound probe (added 2026-11-19, snow pruning round): the
            # probe's check is enforced in CI and this shell provably cannot
            # run it to green. Reported as its own class — never a PASS,
            # never a FAIL. Probes without the field are unaffected.
            cionly.append(p['id'])
            print(f"CI-ONLY {p['id']}: not run in this shell — {p['ci_only']}")
            continue
        ok, detail = run_probe(p)
        if ok is None:
            manuals.append(p['id'])
            print(f"MANUAL  {p['id']}: {detail}")
        elif ok:
            print(f"PASS    {p['id']}")
        else:
            fails.append(p['id'])
            print(f"FAIL    {p['id']}: {detail} — fix: {p.get('fix', '')[:90]}")
    summary = (f"\n{len(checks) - len(fails) - len(manuals) - len(skips) - len(cionly)}/{len(checks)} probes pass; "
               f"{len(manuals)} manual (cron_job); {len(skips)} skipped: {skips}; "
               f"{len(fails)} FAILED: {fails}")
    if cionly:
        summary += f"; {len(cionly)} ci-only: {cionly}"
    print(summary)
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
