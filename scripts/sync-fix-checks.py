#!/usr/bin/env python3
"""Generate and verify the repo-vendored fix-checks registry
(issue #178, registry half - Andrew's ruling, 2026-11-23: "Copy the
registry into the repo so CI can run it as a merge gate").

The canonical registry stays where it has always lived - the snow
goal's hidden_files/fix-checks.json - and the canonical runner stays
~/workspace/tools/fix-checks/run_fix_checks.py. The weekly runner,
push.py's registry gate and the fix/ops reconciler keep reading the
canonical registry exactly as before. What this script maintains is
the repo's GENERATED copy of the subset CI can judge:

  hidden_files/fix-checks.json   the repo-pinned subset (below)
  scripts/run_fix_checks.py      a byte copy of the canonical runner

Neither vendored file is hand-edited. This script regenerates both
from the canonical sources; `scripts/push.py` runs its check on
every push (a stale vendored copy refuses the push, with the remedy
named), and CI runs `--check-internal` plus the vendored runner as
the registry merge gate. Registering a probe in the canonical
registry therefore ends with re-running this script and pushing the
regenerated files in the same round - the same discipline as the
derived page artifacts.

THE SUBSET RULE (mechanical; no hand-picked list). A canonical
probe joins the repo subset iff every target it names lives inside
the repo tree:

  - cron_job probes are excluded by type: CI has no scheduler to
    verify them against (the shared runner reports them MANUAL for
    the same reason).
  - grep_present / grep_absent: the probe's file (or file_glob)
    decides. An absolute path under the repo prefix is IN, and the
    vendored entry rewrites it repo-relative. A relative path
    resolves against the registry's goal directory (the canonical
    runner's semantics), never the repo - OUT. Any other absolute
    path - OUT. A pattern that itself names the local absolute
    repo path cannot hold in a CI checkout - OUT.
  - command_exit0: every absolute path literal in the command must
    be the repo prefix or under it (/dev/null excepted). The
    vendored entry rewrites the prefix to "." so the command runs
    from the checkout root. A command naming any other absolute
    path (a local Chrome binary, a goal-side script, a work
    directory) is OUT; a command naming no absolute path has no
    in-repo target to pin - OUT.
  - ci_only probes are classified by the same rules as every other
    probe (both current ones fall out on the command rule; their
    CI enforcement remains the browser shards, as their own text
    states).

The vendored registry carries a provenance block: the canonical
registry's sha256, the canonical runner's sha256, and the counts
(canonical / included / excluded, by reason), so the CI step can
print exactly what ran and what the rule skipped, and
`--check-internal` can verify the vendored pair agrees with itself
in a checkout that has no access to the canonical sources.

Canonical coordinates default to the live ones and can be
overridden by environment (the gate fixtures name fixture
coordinates): SNOW_FIX_CHECKS_REGISTRY, SNOW_FIX_CHECKS_RUNNER,
SNOW_FIX_CHECKS_REPO_ROOT.

Usage:
  sync-fix-checks.py [ROOT]                regenerate into ROOT
  sync-fix-checks.py --check [ROOT]        exit 1 if ROOT's vendored
                                           files diverge from the
                                           canonical sources
  sync-fix-checks.py --check-internal [ROOT]
                                           exit 1 if ROOT's vendored
                                           pair is internally
                                           inconsistent (CI mode)
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

REGISTRY_DEFAULT = ("/home/hatch/workspace/goals/snow-route-5w-tracker-rebuild"
                    "/hidden_files/fix-checks.json")
RUNNER_DEFAULT = "/home/hatch/workspace/tools/fix-checks/run_fix_checks.py"
REPO_DEFAULT = "/home/hatch/workspace/snow-route-5w/beta1/repo"

VENDORED_REGISTRY = "hidden_files/fix-checks.json"
VENDORED_RUNNER = "scripts/run_fix_checks.py"

# An absolute path literal: a "/" that does not continue a word, a
# relative path or another slash (so the "/proof/x" inside the
# relative "tests/proof/x" and the "//host" of a URL never match),
# with at least one directory level (so a bare "/57.0" - a division
# by a float literal in one probe's colour math - is not a path).
ABS_PATH_RE = re.compile(r"(?<![A-Za-z0-9_.\-/])/(?:[A-Za-z0-9_.\-]+/)+[A-Za-z0-9_.\-]+")
BENIGN_PATHS = {"/dev/null"}

R_CRON = "cron_job: no scheduler in CI"
R_TARGET_OUT = "target outside the repo tree"
R_PATTERN_ABS = "pattern names the local absolute repo path"
R_CMD_OUT = "command references paths outside the repo tree"
R_CMD_NONE = "command has no in-repo target"
R_NO_TARGET = "no target field"
R_UNKNOWN = "unknown probe type"


def canonical_paths():
    registry = os.environ.get("SNOW_FIX_CHECKS_REGISTRY", REGISTRY_DEFAULT)
    runner = os.environ.get("SNOW_FIX_CHECKS_RUNNER", RUNNER_DEFAULT)
    repo = os.environ.get("SNOW_FIX_CHECKS_REPO_ROOT", REPO_DEFAULT)
    return Path(registry), Path(runner), repo.rstrip("/")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def abs_paths(text):
    return ABS_PATH_RE.findall(text)


def select_subset(checks, repo_prefix):
    """Returns (included_entries, excluded_by_reason, excluded_ids).
    Included entries are rewritten for the repo checkout."""
    included, by_reason, excluded_ids = [], {}, []

    def exclude(probe, reason):
        by_reason[reason] = by_reason.get(reason, 0) + 1
        excluded_ids.append((probe.get("id"), reason))

    for probe in checks:
        t = probe.get("type")
        if t == "cron_job":
            exclude(probe, R_CRON)
            continue
        if t in ("grep_present", "grep_absent"):
            raw = probe.get("file") or probe.get("file_glob")
            if not raw:
                exclude(probe, R_NO_TARGET)
                continue
            if repo_prefix in (probe.get("pattern") or ""):
                exclude(probe, R_PATTERN_ABS)
                continue
            if os.path.isabs(raw):
                if raw == repo_prefix or raw.startswith(repo_prefix + "/"):
                    entry = dict(probe)
                    key = "file" if probe.get("file") else "file_glob"
                    entry[key] = raw[len(repo_prefix) + 1:] if raw != repo_prefix else ""
                    included.append(entry)
                else:
                    exclude(probe, R_TARGET_OUT)
            else:
                exclude(probe, R_TARGET_OUT)
            continue
        if t == "command_exit0":
            cmd = probe.get("command") or ""
            paths = abs_paths(cmd)
            if not paths:
                exclude(probe, R_CMD_NONE)
                continue
            if all(p == repo_prefix or p.startswith(repo_prefix + "/")
                   or p in BENIGN_PATHS for p in paths):
                entry = dict(probe)
                entry["command"] = cmd.replace(repo_prefix, ".")
                included.append(entry)
            else:
                exclude(probe, R_CMD_OUT)
            continue
        exclude(probe, R_UNKNOWN)
    return included, by_reason, excluded_ids


def expected_files():
    """{repo-relative path: bytes} the vendored pair must equal.
    Raises OSError/JSON errors on unreadable canonical sources."""
    registry_path, runner_path, repo_prefix = canonical_paths()
    registry_bytes = registry_path.read_bytes()
    runner_bytes = runner_path.read_bytes()
    canonical = json.loads(registry_bytes)
    included, by_reason, _ = select_subset(canonical["checks"], repo_prefix)
    provenance = {
        "generated_by": "scripts/sync-fix-checks.py - do not hand-edit",
        "canonical_registry": str(registry_path),
        "canonical_registry_sha256": sha256(registry_bytes),
        "canonical_runner": str(runner_path),
        "canonical_runner_sha256": sha256(runner_bytes),
        "subset_rule": "v1: every target the probe names lives inside "
                       "the repo tree (see sync-fix-checks.py)",
        "counts": {
            "canonical": len(canonical["checks"]),
            "included": len(included),
            "excluded_total": len(canonical["checks"]) - len(included),
            "excluded_by_reason": by_reason,
        },
    }
    vendored = {
        "about": ("GENERATED by scripts/sync-fix-checks.py from the canonical "
                  "fix-checks registry (the snow goal's hidden_files/"
                  "fix-checks.json) - the repo-pinned subset CI runs as the "
                  "registry merge gate (issue #178). Do not hand-edit: "
                  "register probes in the canonical registry, re-run the "
                  "sync, and push the regenerated files in the same round."),
        "version": canonical.get("version"),
        "provenance": provenance,
        "checks": included,
    }
    registry_out = json.dumps(vendored, indent=1).encode()
    return {VENDORED_REGISTRY: registry_out, VENDORED_RUNNER: runner_bytes}


def check_gate(root):
    """push.py's entry point: the vendored pair in `root` must equal
    what the canonical sources generate. Returns an error string or
    None. A tree carrying neither vendored file predates the
    vendoring and skips with a printed line, like the other gates."""
    root = Path(root)
    reg = root / VENDORED_REGISTRY
    run = root / VENDORED_RUNNER
    if not reg.is_file() and not run.is_file():
        print("REGISTRY SYNC GATE SKIPPED: no vendored registry in "
              "this tree (it predates the #178 vendoring)")
        return None
    registry_path, _, _ = canonical_paths()
    if not registry_path.is_file():
        if "SNOW_FIX_CHECKS_REGISTRY" in os.environ:
            return ("SNOW_FIX_CHECKS_REGISTRY names a registry that does "
                    f"not exist: {registry_path} - a named gate that "
                    "cannot run refuses")
        print(f"REGISTRY SYNC GATE SKIPPED: no canonical registry at "
              f"{registry_path} (this environment carries none)")
        return None
    try:
        expected = expected_files()
    except (OSError, ValueError) as e:
        return f"the registry sync gate cannot run: {e}"
    for rel, want in expected.items():
        have = root / rel
        if not have.is_file():
            return (f"the vendored registry is incomplete: {rel} is "
                    "missing - run python3 scripts/sync-fix-checks.py "
                    "and push the regenerated files")
        if have.read_bytes() != want:
            return (f"the vendored registry has diverged from the "
                    f"canonical registry: {rel} differs - the vendored "
                    "copy is generated, never hand-kept. Run python3 "
                    "scripts/sync-fix-checks.py and push the "
                    "regenerated files in this round")
    counts = json.loads(expected[VENDORED_REGISTRY])["provenance"]["counts"]
    print(f"REGISTRY SYNC GATE: vendored subset in sync with the "
          f"canonical registry ({counts['included']} of "
          f"{counts['canonical']} probes vendored)")
    return None


def check_internal(root):
    """CI mode: the vendored pair must agree with ITSELF (the
    canonical sources are unreachable from a checkout)."""
    root = Path(root)
    try:
        vendored = json.loads((root / VENDORED_REGISTRY).read_text())
        prov = vendored["provenance"]
        counts = prov["counts"]
    except (OSError, ValueError, KeyError) as e:
        print(f"REGISTRY INTERNAL CHECK FAILED: cannot read provenance: {e}")
        return 1
    problems = []
    if counts["included"] != len(vendored["checks"]):
        problems.append("included count != number of vendored checks")
    if counts["included"] + counts["excluded_total"] != counts["canonical"]:
        problems.append("included + excluded != canonical count")
    if sum(counts["excluded_by_reason"].values()) != counts["excluded_total"]:
        problems.append("excluded-by-reason counts do not add up")
    runner = root / VENDORED_RUNNER
    if not runner.is_file():
        problems.append(f"{VENDORED_RUNNER} is missing")
    elif sha256(runner.read_bytes()) != prov["canonical_runner_sha256"]:
        problems.append("vendored runner differs from the runner the "
                        "registry was generated against")
    if problems:
        print("REGISTRY INTERNAL CHECK FAILED: " + "; ".join(problems))
        return 1
    print(f"Registry subset: {counts['included']} of {counts['canonical']} "
          f"canonical probes run in CI; {counts['excluded_total']} excluded "
          f"by rule: {counts['excluded_by_reason']}")
    return 0


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    root = Path(args[0]).resolve() if args else Path(__file__).resolve().parent.parent
    if "--check-internal" in argv:
        return check_internal(root)
    if "--check" in argv:
        err = check_gate(root)
        if err:
            print("REGISTRY SYNC CHECK FAILED: " + err)
            return 1
        return 0
    expected = expected_files()
    for rel, data in expected.items():
        dest = root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    counts = json.loads(expected[VENDORED_REGISTRY])["provenance"]["counts"]
    print(f"SYNCED: {VENDORED_REGISTRY} ({counts['included']} of "
          f"{counts['canonical']} canonical probes; "
          f"{counts['excluded_total']} excluded by rule) + "
          f"{VENDORED_RUNNER} (byte copy of the canonical runner)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
