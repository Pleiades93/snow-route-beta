#!/usr/bin/env python3
"""Hand-maintained mirror guard (/correct Phase 3, round (d) -
class C4 generalized: a hand-maintained mirror of state the change
just moved, updated late or never, caught at the gate).

Phase 2 closed C4's roster instance (scripts/check-tier-map.py
section 4, disk completeness) and the shape kept firing on every
surface that guard does not cover: round112's extraction-selftest
sandbox state (Beta 1.254), scripts/app1-types.d.ts (Beta 1.258 AND
1.259 round 6), the packfields selftest's expectations (1.259
round 1), a new drive's registration surfaces (1.259 rounds 2/3/5).
The cadence proposal was: derive or check EVERY mirror from its
source in the local fast loop. The mirrors that can be derived are
derived (round (a) derived the fixture rosters; this round derives
the packfields cap list at its source). The rest are checked here,
in the push-path family beside the registry, receipts and census
gates: scripts/push.py runs this module's gate() against the push
tree and the prospective tree on every push, so a drifted mirror
refuses the push that would carry it, instead of surfacing at the
CI gate or whenever someone next runs the right selftest by hand.

The families (each names its mirror, its source, and the failure
it exists to catch):

  types        scripts/app1-types.d.ts - the RoutePack typedef's
               fields must equal PACK_FIELDS (parts/app1.js) in
               order, the RouteKeys typedef's fields must equal the
               keys routeKeys() returns, and every section-2
               cross-part global must still be declared in the
               home part its comment names. The 1.259 round-6
               failure was this file ('ends' undeclared); the
               retired direction - a declaration whose home-part
               binding is gone - is invisible to CI's tsc, which
               only fails on names the checked parts still use.
  census       tests/browser/selftest-foreign-writes.mjs - the
               foreign-write census's UNIVERSE plus its named
               exclusions must account for every JS part
               scripts/assemble.py assembles. brand-snow.js sat in
               neither for two months: an assembled logic part
               outside the census with no recorded reason (its
               exclusion is correct - a pure IIFE with no
               top-level bindings - and is now recorded; the next
               part added to PARTS cannot slip in silently).
  wiring       .github/workflows/checks.yml - every
               tests/browser/selftest-*.mjs on disk must be wired
               as a step, and every wired step must name a real
               file: the 2026-11 shape that left 18 of 38 proofs
               unwired (proofs got check-proof-coverage.py;
               selftests never got the twin).
  shards       .github/workflows/checks.yml - the eight shard
               lists must equal the partition scripts/gen-shards.py
               generates from run.mjs ALL + the measured durations.
               check-shard-coverage.py proves the lists partition
               ALL; nothing ran the generation-equality check, so a
               hand edit preserving the partition would silently
               fork the generator.
  judges       scripts/check-receipts.py - every scripts/check-*.py
               on disk must be named in JUDGE_PATHS, the hand-kept
               list of judging scripts the receipts gate watches.
               A judge omitted from it escapes the receipt
               requirement silently (check-census.py joined by hand
               in round (c); this file joins the same way, and the
               convention is now the source: the naming is the list).

A family whose mirror file is absent from the tree is skipped
(the tree predates the family); a mirror whose SOURCE is absent
or disagrees fails, naming both sides. The guard is lexical, like
the census derivation: it reads the shapes this codebase actually
writes, and a shape it cannot parse is a failure, not a pass.

Usage:
  python3 scripts/check-mirrors.py [root]
      Print each family's verdict against a tree (default: the
      repo root). Exit 1 on any drift.
"""
import importlib.util
import json
import re
import sys
from pathlib import Path


# ------------------------------------------------------------ helpers

def read(root, rel):
    p = root / rel
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8", errors="ignore")


def quoted_list(src, marker):
    """The string items of the first `[...]` literal after marker."""
    i = src.index(marker)
    j = src.index("[", i)
    depth = 0
    for k in range(j, len(src)):
        if src[k] == "[":
            depth += 1
        elif src[k] == "]":
            depth -= 1
            if not depth:
                pairs = re.findall(r"'([^']+)'|\"([^\"]+)\"", src[j:k + 1])
                return [a or b for a, b in pairs]
    raise ValueError(f"unterminated list after {marker!r}")


def balanced_span(src, start):
    """src[start:start_of_matching_close] for the bracket at start."""
    pairs = {"{": "}", "[": "]", "(": ")"}
    open_c = src[start]
    close_c = pairs[open_c]
    depth = 0
    for k in range(start, len(src)):
        if src[k] == open_c:
            depth += 1
        elif src[k] == close_c:
            depth -= 1
            if not depth:
                return src[start:k + 1]
    raise ValueError("unbalanced span")


def top_level_keys(obj_literal):
    """The keys of a flat-ish object literal, in order: split the
    outer braces' contents on top-level commas and take each
    segment's leading identifier (nested values are skipped by
    depth, so index signatures and nested shapes never leak keys)."""
    inner = obj_literal[obj_literal.index("{") + 1:obj_literal.rindex("}")]
    keys, depth, seg = [], 0, ""
    segs = []
    for ch in inner:
        if ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        if ch == "," and depth == 0:
            segs.append(seg)
            seg = ""
        else:
            seg += ch
    if seg.strip():
        segs.append(seg)
    for s in segs:
        m = re.match(r"\s*(?:'([^']+)'|\"([^\"]+)\"|([A-Za-z_$][\w$]*))\s*:", s)
        if m:
            keys.append(next(g for g in m.groups() if g is not None))
    return keys


def top_level_names(src):
    """Top-level declared names in a part: line-start declarations,
    with multi-declarator statements split on top-level commas."""
    names = set()
    for m in re.finditer(r"(?m)^(let|const|var)\s+([^;]+);", src):
        body = m.group(2)
        depth, seg, segs = 0, "", []
        for ch in body:
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            if ch == "," and depth == 0:
                segs.append(seg)
                seg = ""
            else:
                seg += ch
        segs.append(seg)
        for s in segs:
            mm = re.match(r"\s*([A-Za-z_$][\w$]*)", s)
            if mm:
                names.add(mm.group(1))
    # Function declarations at line start, including the JSDoc-led
    # form this codebase writes (`/** @returns {X} */ function f() {`)
    # - a declaration the line-start rule alone would miss.
    for m in re.finditer(
            r"(?m)^(?:\s*/\*[^*\n]*(?:\*(?!/)[^*\n]*)*\*/\s*)?"
            r"(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", src):
        names.add(m.group(1))
    return names


# ------------------------------------------------------------- family: types

def family_types(root):
    mirror = read(root, "scripts/app1-types.d.ts")
    if mirror is None:
        return None  # no mirror in this tree
    problems = []
    app1 = read(root, "parts/app1.js")
    if app1 is None:
        return ["types: scripts/app1-types.d.ts exists but parts/app1.js "
                "(its source) is missing"]
    # RoutePack typedef == PACK_FIELDS, in order.
    try:
        pack_fields = quoted_list(app1, "const PACK_FIELDS =")
    except (ValueError, IndexError):
        return ["types: could not parse PACK_FIELDS in parts/app1.js"]
    m = re.search(r"type RoutePack = \{", mirror)
    if not m:
        problems.append("types: app1-types.d.ts carries no RoutePack typedef")
    else:
        span = balanced_span(mirror, mirror.index("{", m.start()))
        typedef_fields = top_level_keys(span)
        if typedef_fields != pack_fields:
            problems.append(
                "types: RoutePack typedef fields "
                f"{typedef_fields} != PACK_FIELDS {pack_fields} "
                "(parts/app1.js) - the pack format moved; the typedef "
                "mirror must move in the same change")
    # RouteKeys typedef == routeKeys()'s returned keys, in order.
    rk = app1.index("function routeKeys(")
    ret = app1.index("return {", rk)
    span = balanced_span(app1, app1.index("{", ret))
    code_keys = top_level_keys(span)
    m = re.search(r"type RouteKeys = \{", mirror)
    if not m:
        problems.append("types: app1-types.d.ts carries no RouteKeys typedef")
    else:
        span = balanced_span(mirror, mirror.index("{", m.start()))
        typedef_keys = top_level_keys(span)
        if typedef_keys != code_keys:
            problems.append(
                "types: RouteKeys typedef fields "
                f"{typedef_keys} != routeKeys() keys {code_keys} "
                "(parts/app1.js) - the storage layout moved; the "
                "typedef mirror must move in the same change")
    # Section-2 cross-part globals: each declaration's named home
    # part must still declare the name at top level (the direction
    # tsc cannot see - it never fails on an extra declaration).
    sec2 = mirror.index("// ---- 2.")
    sec3 = mirror.index("// ---- 3.")
    home = None
    part_names = {}
    for line in mirror[sec2:sec3].splitlines():
        hm = re.search(r"\b(app\d\.js|engine\.js|create-[a-z]+\.js)\b", line)
        if hm and ("declare" not in line):
            home = hm.group(1)
        dm = re.match(r"\s*declare (?:var|function) ([A-Za-z_$][\w$]*)", line)
        if dm:
            name = dm.group(1)
            if home is None:
                problems.append(
                    f"types: section-2 declaration {name} names no home "
                    "part in its comment - the mirror's provenance is "
                    "part of the record")
                continue
            if home not in part_names:
                src = read(root, f"parts/{home}")
                part_names[home] = top_level_names(src) if src is not None else None
            if part_names[home] is None:
                problems.append(
                    f"types: section-2 declaration {name} names home part "
                    f"parts/{home}, which does not exist")
            elif name not in part_names[home]:
                problems.append(
                    f"types: section-2 declaration {name} names home part "
                    f"parts/{home}, but {home} declares no top-level "
                    f"{name} - the binding was retired or moved; the "
                    "declaration mirror must follow in the same change")
    return problems


# ------------------------------------------------------------ family: census

def family_census(root):
    mirror = read(root, "tests/browser/selftest-foreign-writes.mjs")
    if mirror is None:
        return None
    assemble = read(root, "scripts/assemble.py")
    if assemble is None:
        return ["census: selftest-foreign-writes.mjs exists but "
                "scripts/assemble.py (its universe's source) is missing"]
    problems = []
    universe = quoted_list(mirror, "const UNIVERSE =")
    parts = [p for p in quoted_list(assemble, "PARTS =") if p.endswith(".js")]
    # The census's stated scope outside the UNIVERSE literal: its
    # comment prose and the RULE text it stamps into the record.
    scope_text = "\n".join(
        line for line in mirror.splitlines() if line.lstrip().startswith("//"))
    rm = re.search(r"const RULE = '(.*?)';", mirror, re.S)
    if rm:
        scope_text += "\n" + rm.group(1)
    for part in parts:
        if part in universe:
            continue
        if part not in scope_text:
            problems.append(
                f"census: parts/{part} is assembled (scripts/assemble.py "
                "PARTS) but is in neither the foreign-writes census "
                "UNIVERSE nor its named exclusions - an assembled part "
                "outside the census with no recorded reason (the "
                "brand-snow.js shape); add it to the universe or name "
                "the exclusion and its reason in the census")
    for name in universe:
        if name not in parts:
            problems.append(
                f"census: the foreign-writes UNIVERSE names {name}, "
                "which scripts/assemble.py does not assemble - the "
                "census is scanning a part the app does not ship")
    return problems


# ------------------------------------------------------------ family: wiring

def family_wiring(root):
    wf = read(root, ".github/workflows/checks.yml")
    if wf is None:
        return None
    problems = []
    disk = sorted(p.name for p in (root / "tests" / "browser").glob("selftest-*.mjs"))
    wired = sorted(set(re.findall(r"node tests/browser/(selftest-[\w.-]+\.mjs)", wf)))
    for name in disk:
        if name not in wired:
            problems.append(
                f"wiring: tests/browser/{name} exists on disk but no "
                "step in .github/workflows/checks.yml runs it - a "
                "selftest wired nowhere runs nowhere (the 2026-11 "
                "unwired-proofs shape)")
    for name in wired:
        if name not in disk:
            problems.append(
                f"wiring: .github/workflows/checks.yml runs "
                f"tests/browser/{name}, which does not exist on disk")
    return problems


# ------------------------------------------------------------ family: shards

def family_shards(root):
    wf = read(root, ".github/workflows/checks.yml")
    if wf is None:
        return None
    actual_raw = re.findall(r'drives:\s*"([^"]+)"', wf)
    if not actual_raw:
        return None
    problems = []
    run_src = read(root, "tests/browser/run.mjs")
    dur_src = read(root, "scripts/shard-durations.json")
    if run_src is None or dur_src is None:
        return ["shards: checks.yml carries shard lists but "
                "tests/browser/run.mjs or scripts/shard-durations.json "
                "(their generation sources) is missing"]
    spec = importlib.util.spec_from_file_location(
        "snow_gen_shards", Path(__file__).resolve().parent / "gen-shards.py")
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)
    names = gen.all_drives(root)
    durations = json.loads(dur_src)["seconds"]
    expected = gen.partition(names, durations)[0]
    actual = gen.current_lists(wf)
    if actual != expected:
        for i, (got, want) in enumerate(zip(actual, expected), 1):
            if got != want:
                problems.append(
                    f"shards: checks.yml shard {i} differs from the "
                    f"generated partition (only in checks.yml: "
                    f"{sorted(set(got) - set(want))}; only in the "
                    f"partition: {sorted(set(want) - set(got))}; "
                    f"order differs: "
                    f"{[g for g in got if g in want] != [x for x in want if x in got]}) "
                    "- the lists are GENERATED by scripts/gen-shards.py "
                    "from run.mjs ALL + shard-durations.json; "
                    "regenerate, do not hand-edit "
                    "(check-shard-coverage.py proves only that the "
                    "lists partition ALL)")
        if len(actual) != len(expected):
            problems.append(
                f"shards: checks.yml carries {len(actual)} shard lists, "
                f"the generator produces {len(expected)}")
    return problems


# ------------------------------------------------------------ family: judges

def family_judges(root):
    receipts = read(root, "scripts/check-receipts.py")
    if receipts is None:
        return None
    problems = []
    m = re.search(r"JUDGE_PATHS = \{([^}]*)\}", receipts)
    if not m:
        return ["judges: could not parse JUDGE_PATHS in "
                "scripts/check-receipts.py"]
    judges = set(re.findall(r'"([^"]+)"', m.group(1)))
    for p in sorted((root / "scripts").glob("check-*.py")):
        rel = f"scripts/{p.name}"
        if rel not in judges:
            problems.append(
                f"judges: {rel} is a judging script (scripts/check-*.py) "
                "but is not named in check-receipts.py's JUDGE_PATHS - "
                "a change to it would escape the mutation-receipt "
                "requirement silently; name it in JUDGE_PATHS in the "
                "same change that adds it")
    return problems


FAMILIES = [
    ("types", family_types),
    ("census", family_census),
    ("wiring", family_wiring),
    ("shards", family_shards),
    ("judges", family_judges),
]


def problems(root):
    """Every family's drift against a tree, as (family, problem)
    pairs. A family whose mirror file is absent contributes
    nothing (skipped, reported by verify())."""
    out = []
    for name, fn in FAMILIES:
        probs = fn(root)
        if probs:
            out.extend((name, p) for p in probs)
    return out


def gate(root):
    """The push gate (scripts/push.py): returns an error string or
    None. Mirrors are tree-wide facts, so the whole set is verified
    against the tree the push would create, on every push."""
    probs = problems(root)
    if probs:
        return ("the push tree's hand-maintained mirrors have drifted: "
                + "; ".join(p for _, p in probs)
                + " - a mirror is derived from its source or updated "
                "in the same change that moves the source (class C4 "
                "generalized; /correct Phase 3 round (d))")
    ran = [name for name, fn in FAMILIES if fn(root) is not None]
    print(f"MIRRORS GATE: {len(ran)} mirror families verified against "
          f"the push tree ({', '.join(ran)}), no drift")
    return None


def main():
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else \
        Path(__file__).resolve().parent.parent
    bad = 0
    for name, fn in FAMILIES:
        probs = fn(root)
        if probs is None:
            print(f"mirrors/{name}: SKIP (mirror absent from this tree)")
        elif probs:
            bad += len(probs)
            for p in probs:
                print(f"FAIL: {p}")
        else:
            print(f"mirrors/{name}: PASS")
    if bad:
        print(f"mirror check: FAIL ({bad} drift(s))")
        return 1
    print("mirror check: PASS (every hand-maintained mirror agrees "
          "with its source)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
