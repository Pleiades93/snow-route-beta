#!/usr/bin/env python3
"""Sibling-path census for rounds that change app surfaces
(/correct Phase 3, round (c) - class N2: sibling-path completeness
arrives via the gate, not the author).

The cadence pass named the shape across four rounds and 20+ fix
commits: a round's first submission covers the path it was named
for, and the review seat then enumerates the same surface's other
doors, exits and edge cases. Beta 1.255's confirmation took four
heads - the question was first built unbound to its route+run, the
dock's #cancelStartBtn was a second one-tap door the first build
missed, and the sheet click-away exit was found last. Arch-5's
census re-key needed seven edge-case fixes, push.py five
guard-bypass fixes, 1.259's bearing law three successive P2s. In
every case the gate COULD enumerate the siblings after the fact;
the class is that the enumeration was not attempted before the
first push.

This script is the mechanical form: a pre-push census of the
surfaces a round touches. The author declares the round's ANCHORS
(the functions and elements the round is about, and - for a guarded
action - the guard, the action it guards, the surface element, and
the state the question binds). The census DERIVES the sibling rows
from the tree by scanning parts/: every caller of an anchor
function, every entry door to a guarded action (and whether it
routes through the guard or bypasses it), every exit from the
surface (its own controls, dismissal handlers, state-changing
paths that must clear it), every guard call site's state binding,
every function that mutates the bound state, both theme faces of
the surface's elements, and the gesture/map paths that touch the
anchors. Rows the author adds beyond the derivation must be
labelled "declared:" - a hand-typed census that omits a derived
row is exactly the failure this gate exists to catch, so the gate
RE-DERIVES the rows from the prospective tree and requires the
record's derived set to match, row for row.

A census lives in tests/sibling-census.json as an append-only list
of round records, mirroring tests/mutation-receipts.json: an app
record pins the sha256 of every file the derivation read (all of
parts/ plus this script), so the record goes stale the moment the
evidence base moves, and scripts/push.py refuses a parts-changing
push that no CURRENT, fully-marked record names. A round that
changes no parts/ surface records a machinery-exempt entry
instead, so the absence of an app census is a stated fact, never
a silent skip.

The honest limit, stated as plainly as round (b) stated it for
receipts: the gate verifies the census EXISTS, was DERIVED from
the tree being pushed, and is FULLY MARKED. It cannot verify the
marks are true - that a row marked "covered" is really covered by
a check, or that an "na" reason is honest. The review seat remains
the spot-check, now reading the author's own enumeration instead
of producing it.

Usage:
  python3 scripts/check-census.py derive <root> --anchors A.json
      Print the derived rows for an anchor set against a tree
      (the authoring and demonstration surface).
  python3 scripts/check-census.py issue <root> --id ID
      --anchors A.json --changed parts/x.js [--changed ...]
      --marks M.json [--carry RECORD_ID] --issued TEXT
      Derive the rows, apply carried marks (same row ids from a
      prior record) then the marks file, and append the record.
      Rows left unmarked are written as such and printed loudly -
      the gate refuses them; issue does not invent marks.
  python3 scripts/check-census.py issue-exempt <root> --id ID
      --reason TEXT --issued TEXT
      Append a machinery-exempt record (no parts/ surface).
  python3 scripts/check-census.py verify <root>
      Print each record's state (CURRENT / STALE / BROKEN /
      INVALID) and its unmarked-row count. Exit 1 on a malformed
      census file, a broken record, or an invalid one.
  python3 scripts/check-census.py gate <root> --changed <path>...
      The push gate: every changed parts/ path must be named by a
      CURRENT app record whose derived rows all carry marks.
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

CENSUS_REL = "tests/sibling-census.json"
TOOL_REL = "scripts/check-census.py"
SCAN_GLOBS = ("parts/*.js", "parts/head.html")

# ------------------------------------------------------------------
# Scanning. The parts are real JavaScript with template literals and
# long comments; the scanners below are string/comment aware so a
# brace inside a literal never opens a phantom span. They are
# deliberately simple - the census needs call sites, handler spans
# and definition spans, not an AST - and their limits are the
# derivation limits stated in the module docstring's spirit: a call
# spelled through a computed name is not a call site this scan can
# see, and such a row is the author's to declare.
# ------------------------------------------------------------------


def _skip_string(text, i):
    """Index just past the string starting at i (text[i] is a quote)."""
    q = text[i]
    i += 1
    n = len(text)
    if q == "`":
        depth = 0
        while i < n:
            c = text[i]
            if c == "\\":
                i += 2
                continue
            if c == "$" and i + 1 < n and text[i + 1] == "{":
                depth += 1
                i += 2
                continue
            if c == "}" and depth:
                depth -= 1
                i += 1
                continue
            if c == "`" and depth == 0:
                return i + 1
            i += 1
        return n
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c == q:
            return i + 1
        if c == "\n":
            return i
        i += 1
    return n


def _skip_comment(text, i):
    """Index just past the comment starting at i, or i itself."""
    if text.startswith("//", i):
        j = text.find("\n", i)
        return len(text) if j < 0 else j
    if text.startswith("/*", i):
        j = text.find("*/", i + 2)
        return len(text) if j < 0 else j + 2
    return i


def match_span(text, i, open_c, close_c):
    """Index just past the bracket matching the one at i."""
    depth = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c in "'\"`":
            i = _skip_string(text, i)
            continue
        j = _skip_comment(text, i)
        if j != i:
            i = j
            continue
        if c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


def mask_code(text):
    """The text with comments blanked and string CONTENTS blanked
    (quotes kept), so identifier scans never match inside a literal
    while offsets stay aligned with the original."""
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        j = _skip_comment(text, i)
        if j != i:
            for k in range(i, j):
                if out[k] != "\n":
                    out[k] = " "
            i = j
            continue
        if text[i] in "'\"`":
            j = _skip_string(text, i)
            for k in range(i + 1, max(i + 1, j - 1)):
                if out[k] != "\n":
                    out[k] = " "
            i = j
            continue
        i += 1
    return "".join(out)


class Scan:
    """One tree's parts, scanned once: definitions, handlers, calls."""

    def __init__(self, root):
        self.root = Path(root)
        self.files = {}          # rel -> original text
        self.masked = {}         # rel -> masked text
        for pat in SCAN_GLOBS:
            for p in sorted(self.root.glob(pat)):
                rel = p.relative_to(self.root).as_posix()
                self.files[rel] = p.read_text(errors="ignore")
                self.masked[rel] = mask_code(self.files[rel])
        self.defs = {}           # name -> [(rel, start, end)]
        self.def_sites = set()   # (rel, index) of definition name tokens
        self.handlers = []       # dicts: rel, receiver, event, start, end
        self._scan_defs()
        self._scan_handlers()

    def _scan_defs(self):
        pats = [
            re.compile(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\("),
            re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()"),
            re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>"),
        ]
        for rel, text in self.masked.items():
            if not rel.endswith(".js"):
                continue
            for pat in pats:
                for m in pat.finditer(text):
                    name = m.group(1)
                    self.def_sites.add((rel, m.start(1)))
                    # The body opens at the first { after the def start
                    # that is not inside the parameter parens.
                    i = m.end()
                    if text[i - 1] == "(":
                        i = match_span(text, i - 1, "(", ")")
                    brace = text.find("{", i)
                    if brace < 0:
                        continue
                    # An arrow with an expression body has no brace
                    # that opens a block before the next ; or , at
                    # depth 0 - treat the nearest { as the body only
                    # when it precedes any ; on the same statement.
                    semi = text.find(";", i)
                    if 0 <= semi < brace and pat is pats[2]:
                        continue
                    end = match_span(text, brace, "{", "}")
                    self.defs.setdefault(name, []).append((rel, brace, end))

    def _scan_handlers(self):
        recv_patterns = [
            (re.compile(r"\$\(\s*'([^']+)'\s*\)\s*\.\s*addEventListener\(\s*'([^']+)'\s*,"), 1),
            (re.compile(r"\b(document|window)\s*\.\s*addEventListener\(\s*'([^']+)'\s*,"), 1),
            (re.compile(r"\bmap\s*\.\s*on\(\s*'([^']+)'\s*,"), 0),
            (re.compile(r"\b([A-Za-z_$][\w$]*)\s*\.\s*addEventListener\(\s*'([^']+)'\s*,"), 1),
        ]
        for rel, text in self.masked.items():
            if not rel.endswith(".js"):
                continue
            # Variables bound to an element: const c = $('paceCancel')
            var_el = {}
            for m in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\$\(\s*'([^']+)'\s*\)", text):
                var_el[m.group(1)] = self.files[rel][m.start(2):m.end(2)]
            orig = self.files[rel]
            for pat, gidx in recv_patterns:
                for m in pat.finditer(text):
                    # Group text comes from the ORIGINAL file: the
                    # masked text blanks the string contents (the
                    # element id, the event name) at these very
                    # offsets, and masking preserves offsets.
                    if gidx == 1:
                        receiver = orig[m.start(1):m.end(1)]
                        event = orig[m.start(2):m.end(2)]
                    else:
                        receiver, event = "map", orig[m.start(1):m.end(1)]
                    if receiver in var_el:
                        receiver = var_el[receiver]
                    start = m.end()
                    end = self._callback_end(text, start)
                    self.handlers.append({
                        "rel": rel, "receiver": receiver, "event": event,
                        "start": m.start(), "cb_start": start, "end": end,
                        "body": text[start:end],
                    })

    @staticmethod
    def _callback_end(text, i):
        """End index of the call expression whose argument list the
        handler callback opens: find the callback's body brace (or
        the closing paren for an expression-bodied arrow)."""
        # Skip to the callback: 'function' or '(' params or a bare id.
        brace = text.find("{", i)
        paren = text.find("(", i)
        if 0 <= paren and (brace < 0 or paren < brace):
            close = match_span(text, paren, "(", ")")
            # After params comes => then { or an expression.
            nxt = text.find("{", close)
            arrow = text.find("=>", close)
            if 0 <= arrow and (nxt < 0 or arrow < nxt):
                if nxt >= 0 and text[arrow + 2:nxt].strip() == "":
                    return match_span(text, nxt, "{", "}")
                # Expression body: ends at the addEventListener close.
                return close
            if nxt >= 0:
                return match_span(text, nxt, "{", "}")
            return close
        if brace >= 0:
            return match_span(text, brace, "{", "}")
        return i

    def call_sites(self, name):
        """All `name(` occurrences outside the name's own definition
        spans, as (rel, index) pairs."""
        out = []
        pat = re.compile(r"(?<![\w$.])" + re.escape(name) + r"\s*\(")
        own = {(rel, s, e) for (rel, s, e) in self.defs.get(name, [])}
        for rel, text in self.masked.items():
            if not rel.endswith(".js"):
                continue
            for m in pat.finditer(text):
                if (rel, m.start()) in self.def_sites:
                    continue  # the definition's own name token
                if any(rel == r and s <= m.start() < e for (r, s, e) in own):
                    # A recursive call inside its own body is still a
                    # call site of interest only for guards/actions;
                    # the caller family skips self-calls.
                    continue
                out.append((rel, m.start()))
        return out

    def arg_span(self, rel, call_index):
        """(start, end) of the argument list of the call whose name
        ends just before call_index's '('."""
        text = self.masked[rel]
        paren = text.find("(", call_index)
        if paren < 0:
            return (call_index, call_index)
        return (paren, match_span(text, paren, "(", ")"))

    def context_of(self, rel, index):
        """The enclosing context for a position: a handler receiver,
        a function name, or 'top-level'."""
        for h in self.handlers:
            if h["rel"] == rel and h["cb_start"] <= index < h["end"]:
                return f"{h['receiver']}:{h['event']}"
        best = None
        for name, spans in self.defs.items():
            for (r, s, e) in spans:
                if r == rel and s <= index < e and (best is None or e - s < best[1]):
                    best = (name, e - s)
        return best[0] if best else "top-level"

    def body_of(self, name):
        """All definition bodies of a function name."""
        out = []
        for (rel, s, e) in self.defs.get(name, []):
            out.append((rel, self.masked[rel][s:e]))
        return out


# ------------------------------------------------------------------
# Derivation. Every row carries a deterministic id and a source
# string naming the scan that produced it. Families: caller, door,
# exit, state, theme, gesture.
# ------------------------------------------------------------------


def _calls(body, name):
    return re.search(r"(?<![\w$.])" + re.escape(name) + r"\s*\(", body) is not None


def _one_hop_to(scan, body, target):
    """A function the body calls whose own body calls target."""
    for name in re.findall(r"(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(", body):
        if name == target:
            continue
        for (_rel, b) in scan.body_of(name):
            if _calls(b, target):
                return name
    return None


def derive_rows(scan, anchors):
    rows = {}

    def add(rid, kind, source):
        if rid not in rows:
            rows[rid] = {"id": rid, "kind": kind, "source": source}

    functions = list(anchors.get("functions") or [])
    elements = list(anchors.get("elements") or [])
    guards = list(anchors.get("guards") or [])
    for g in guards:
        for f in (g.get("guard"), g.get("action")):
            if f and f not in functions:
                functions.append(f)
        if g.get("surface") and g["surface"] not in elements:
            elements.append(g["surface"])

    # ---- callers of every anchor function
    for fn in functions:
        for (rel, idx) in scan.call_sites(fn):
            ctx = scan.context_of(rel, idx)
            add(f"caller:{fn}:{rel}:{ctx}", "caller",
                f"derived: call-site scan of parts/ - {fn}() is called from {ctx} in {rel}")

    # ---- doors and exits and state, per guard
    for g in guards:
        guard, action, surface = g.get("guard"), g.get("action"), g.get("surface")
        state_ids = list(g.get("state") or [])
        if guard and action:
            # Sanctioned spans: argument lists of guard calls (the
            # action may appear inside the callback handed to the
            # guard - that IS the guarded path).
            sanctioned = []
            for (rel, idx) in scan.call_sites(guard):
                sanctioned.append((rel,) + scan.arg_span(rel, idx))
            for h in scan.handlers:
                body = h["body"]
                # An action call inside a guard call's argument span
                # is the sanctioned callback, not a door.
                calls_action = False
                for m in re.finditer(r"(?<![\w$.])" + re.escape(action) + r"\s*\(", body):
                    pos = h["cb_start"] + m.start()
                    if not any(r == h["rel"] and s <= pos < e for (r, s, e) in sanctioned):
                        calls_action = True
                calls_guard = _calls(body, guard)
                hop = None if calls_guard else _one_hop_to(scan, body, guard)
                rid = f"door:{h['rel']}:{h['receiver']}:{h['event']}"
                if calls_action and not calls_guard and not hop:
                    add(rid, "door",
                        f"derived: handler scan of parts/ - the {h['receiver']} {h['event']} handler "
                        f"in {h['rel']} calls {action}() directly, BYPASSING {guard}()")
                elif calls_guard or hop:
                    via = guard if calls_guard else f"{hop}() -> {guard}"
                    add(rid, "door",
                        f"derived: handler scan of parts/ - the {h['receiver']} {h['event']} handler "
                        f"in {h['rel']} reaches {action}() through {via}()")
                elif calls_action:
                    add(rid, "door",
                        f"derived: handler scan of parts/ - the {h['receiver']} {h['event']} handler "
                        f"in {h['rel']} calls {action}() and also routes via {guard}() - "
                        "the direct call's reachability is the author's to answer")
            # State binding at each guard call site.
            for (rel, idx) in scan.call_sites(guard):
                s, e = scan.arg_span(rel, idx)
                span = scan.masked[rel][s:e]
                bound = [v for v in state_ids if re.search(r"\b" + re.escape(v) + r"\b", span)]
                ctx = scan.context_of(rel, idx)
                add(f"state:{rel}:{ctx}", "state",
                    f"derived: guard-call scan - the {guard}() call from {ctx} in {rel} "
                    + (f"binds {', '.join(bound)}" if bound else
                       f"binds NONE of the declared state ({', '.join(state_ids) or 'none declared'})"))
            # State mutations: functions assigning a bound identifier.
            for var in state_ids:
                pat = re.compile(r"(?<![\w$.])" + re.escape(var) + r"\s*=[^=<>]")
                for rel, text in scan.masked.items():
                    if not rel.endswith(".js"):
                        continue
                    for m in pat.finditer(text):
                        ctx = scan.context_of(rel, m.start())
                        if ctx == "top-level":
                            continue
                        add(f"state-mutation:{rel}:{ctx}:{var}", "state",
                            f"derived: assignment scan - {ctx} in {rel} assigns {var}; a pending "
                            f"{guard}() question over the old {var} must be cleared or re-validated here")
        if surface:
            # The surface's hide functions: bodies that hide it.
            hide_fns = set()
            for name, spans in scan.defs.items():
                for (rel, s, e) in spans:
                    # The original text: the masked text blanks the
                    # very literals ('hidden', the surface id) this
                    # scan looks for.
                    body = scan.files[rel][s:e]
                    if (f"$('{surface}')" in body or f"$(\"{surface}\")" in body) and \
                            ("classList.add('hidden')" in body or 'classList.add("hidden")' in body):
                        hide_fns.add(name)
            for h in scan.handlers:
                if h["receiver"] in ("document", "window"):
                    body = h["body"]
                    obody = scan.files[h["rel"]][h["cb_start"]:h["end"]]
                    dismisses = _calls(body, "closeSheets") or "classList.add('hidden')" in obody \
                        or 'classList.add("hidden")' in obody or any(_calls(body, f) for f in hide_fns)
                    if dismisses:
                        orig_body = scan.files[h["rel"]][h["cb_start"]:h["end"]]
                        exempt = (f"closest('#{surface}')" in orig_body or
                                  f'closest("#{surface}")' in orig_body)
                        add(f"exit:{h['rel']}:document:{h['event']}", "exit",
                            f"derived: dismissal scan - the document {h['event']} handler in {h['rel']} "
                            "dismisses surfaces and "
                            + (f"exempts #{surface}" if exempt else
                               f"does NOT exempt #{surface} - a press on the surface bubbles through it"))
                        continue
                hit = [f for f in hide_fns if _calls(h["body"], f)]
                if hit:
                    add(f"exit:{h['rel']}:{h['receiver']}:{h['event']}", "exit",
                        f"derived: handler scan - the {h['receiver']} {h['event']} handler in "
                        f"{h['rel']} calls {hit[0]}(), an exit from #{surface}")
            for name in sorted(hide_fns):
                for (rel, idx) in scan.call_sites(name):
                    ctx = scan.context_of(rel, idx)
                    if ":" in ctx or ctx == name:
                        continue  # handlers already rowed; self is not an exit path
                    add(f"exit:{rel}:{ctx}", "exit",
                        f"derived: call-site scan - {ctx} in {rel} calls {name}(), clearing "
                        f"#{surface} outside its own controls")

    # ---- themes: both faces of every anchor element
    head = scan.files.get("parts/head.html", "")
    for el in elements:
        day = night = False
        for m in re.finditer(r"#" + re.escape(el) + r"\b", head):
            # The rule's selector is the text since the previous
            # rule's closing brace; body.night in it makes the rule
            # the night face.
            sel_start = head.rfind("}", 0, m.start()) + 1
            if "body.night" in head[sel_start:m.start()]:
                night = True
            else:
                day = True
        add(f"theme:{el}", "theme",
            f"derived: stylesheet scan of parts/head.html - #{el} has "
            f"{'a day rule' if day else 'NO day rule'} and "
            f"{'a body.night rule' if night else 'NO body.night rule'}")

    # ---- gestures: map/document handlers touching the anchors that
    # no earlier family claimed
    for h in scan.handlers:
        if h["receiver"] not in ("document", "window", "map"):
            continue
        rid_exit = f"exit:{h['rel']}:document:{h['event']}"
        if rid_exit in rows:
            continue
        orig_body = scan.files[h["rel"]][h["cb_start"]:h["end"]]
        touched = [f for f in functions if _calls(h["body"], f)] + \
                  [e for e in elements if f"$('{e}')" in orig_body or f"$(\"{e}\")" in orig_body]
        if touched:
            add(f"gesture:{h['rel']}:{h['receiver']}:{h['event']}", "gesture",
                f"derived: handler scan - the {h['receiver']} {h['event']} handler in {h['rel']} "
                f"touches {', '.join(sorted(set(touched)))} without dismissing it")

    return [rows[k] for k in sorted(rows)]


# ------------------------------------------------------------------
# Records. Append-only, mirroring the receipts ledger: an app record
# pins the sha256 of every scanned file plus this script, so the
# record goes stale when the evidence base moves; its derived rows
# are re-derived at verification, so a record whose rows were
# hand-typed (a derived row missing) reads STALE, never CURRENT.
# ------------------------------------------------------------------


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_census(root):
    """(data, error) - a missing file is an empty ledger; a
    malformed one is an error: a gate that cannot read its own
    records refuses rather than waves through."""
    f = Path(root) / CENSUS_REL
    if not f.is_file():
        return {"about": "", "rounds": []}, None
    try:
        data = json.loads(f.read_text())
    except (OSError, ValueError) as e:
        return None, f"{CENSUS_REL} is unreadable: {e}"
    if not isinstance(data, dict) or not isinstance(data.get("rounds"), list):
        return None, f"{CENSUS_REL} does not carry a rounds list"
    return data, None


def pin_map(root):
    root = Path(root)
    pins = {}
    for pat in SCAN_GLOBS:
        for p in sorted(root.glob(pat)):
            pins[p.relative_to(root).as_posix()] = sha256_file(p)
    tool = root / TOOL_REL
    if tool.is_file():
        pins[TOOL_REL] = sha256_file(tool)
    return pins


def record_problems(rec):
    if not isinstance(rec, dict):
        return ["the record is not an object"]
    problems = []
    for field in ("id", "kind", "issued"):
        value = rec.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"'{field}' is missing or empty")
    if rec.get("kind") not in ("app", "machinery-exempt"):
        return problems + ["'kind' must be 'app' or 'machinery-exempt'"]
    if rec["kind"] == "machinery-exempt":
        if not str(rec.get("reason") or "").strip():
            problems.append("a machinery-exempt record must state its reason")
        return problems
    anchors = rec.get("anchors")
    if not isinstance(anchors, dict):
        problems.append("'anchors' must be an object")
    changed = rec.get("changed")
    if not isinstance(changed, list) or not changed or \
            any(not isinstance(p, str) or not p.startswith("parts/") for p in changed):
        problems.append("'changed' must be a non-empty list of parts/ paths")
    rows = rec.get("rows")
    if not isinstance(rows, list):
        problems.append("'rows' must be a list")
    else:
        for row in rows:
            if not isinstance(row, dict) or not row.get("id") or not row.get("source"):
                problems.append("every row needs an id and a source")
                break
            status = row.get("status")
            if status not in ("covered", "na", "unmarked"):
                problems.append(f"row {row.get('id')}: status must be covered, na or unmarked")
                break
            if status == "na" and not str(row.get("note") or "").strip():
                problems.append(f"row {row.get('id')}: an 'na' mark needs its reason in 'note'")
                break
    files = rec.get("files")
    if not isinstance(files, dict) or not files:
        problems.append("'files' must be a non-empty map of path -> sha256")
    return problems


def record_state(root, rec):
    """CURRENT / STALE / BROKEN / INVALID, as for receipts, with one
    addition: an app record whose derived row set no longer matches
    a fresh derivation from the tree (a row appeared or vanished
    with code motion) is STALE even if its pins were refreshed -
    the census must be re-derived, not just re-pinned."""
    if record_problems(rec):
        return "INVALID"
    if rec["kind"] == "machinery-exempt":
        return "CURRENT"
    root = Path(root)
    for rel, want in rec["files"].items():
        p = root / rel
        if not p.is_file():
            return "BROKEN"
        if sha256_file(p) != want:
            return "STALE"
    derived = {r["id"] for r in derive_rows(Scan(root), rec["anchors"])}
    recorded = {r["id"] for r in rec["rows"] if not r["source"].startswith("declared:")}
    if derived != recorded:
        return "STALE"
    return "CURRENT"


def unmarked(rec):
    return [r["id"] for r in rec.get("rows", []) if r.get("status") == "unmarked"]


def gate(root, changed):
    """The push gate's verdict. Returns an error string or None.
    Only parts/ paths trigger the requirement; a machinery push is
    exempt by the rule itself (its round states the exemption as a
    record in the ledger, verified by `verify`, not by this gate)."""
    parts_changed = sorted({p for p in changed if p.startswith("parts/")})
    if not parts_changed:
        return None
    data, err = load_census(root)
    if err:
        return "the sibling-census gate cannot run: " + err
    best = None
    for rec in data["rounds"]:
        if rec.get("kind") != "app":
            continue
        if not set(parts_changed) <= set(rec.get("changed") or []):
            continue
        if record_state(root, rec) != "CURRENT":
            continue
        missing_marks = unmarked(rec)
        if not missing_marks:
            print(f"CENSUS GATE: census '{rec['id']}' covers {len(parts_changed)} changed "
                  f"parts path(s); {len(rec['rows'])} sibling rows, all marked")
            return None
        best = (rec["id"], missing_marks)
    if best:
        return (f"census '{best[0]}' names the changed parts paths but leaves "
                f"{len(best[1])} derived sibling row(s) unmarked: "
                + ", ".join(best[1][:6])
                + " - mark each covered or na-with-reason before pushing (class N2)")
    return ("changed parts path(s) with no CURRENT sibling census naming them: "
            + ", ".join(parts_changed)
            + " - derive the census before the first push (scripts/check-census.py "
            "issue), not at the review seat (class N2)")


def refusal_text(error):
    return error


# ------------------------------------------------------------------
# Commands
# ------------------------------------------------------------------


def cmd_derive(root, anchors_path):
    anchors = json.loads(Path(anchors_path).read_text())
    rows = derive_rows(Scan(root), anchors)
    fams = {}
    for r in rows:
        fams[r["kind"]] = fams.get(r["kind"], 0) + 1
    print(json.dumps({"families": fams, "rows": rows}, indent=1))
    return 0


def cmd_issue(root, args):
    data, err = load_census(root)
    if err:
        print("ISSUE REFUSED: " + err)
        return 1
    if any(r.get("id") == args.id for r in data["rounds"]):
        print(f"ISSUE REFUSED: census id '{args.id}' already exists - the ledger is "
              "append-only; a re-derivation gets a new id")
        return 1
    anchors = json.loads(Path(args.anchors).read_text())
    marks = {}
    if args.marks:
        marks = json.loads(Path(args.marks).read_text())
    carried = {}
    if args.carry:
        prior = next((r for r in data["rounds"] if r.get("id") == args.carry), None)
        if prior is None:
            print(f"ISSUE REFUSED: --carry names no record '{args.carry}'")
            return 1
        for row in prior.get("rows", []):
            if row.get("status") in ("covered", "na"):
                carried[row["id"]] = {"status": row["status"], "note": row.get("note", "")}
    derived = derive_rows(Scan(root), anchors)
    known = {r["id"] for r in derived}
    for rid in marks:
        if rid not in known:
            print(f"ISSUE REFUSED: the marks file names a row the derivation does not "
                  f"produce: {rid}")
            return 1
    rows = []
    for r in derived:
        mark = marks.get(r["id"], carried.get(r["id"]))
        if mark is None:
            rows.append({**r, "status": "unmarked", "note": ""})
        else:
            status = mark.get("status")
            note = mark.get("note", "")
            if status not in ("covered", "na"):
                print(f"ISSUE REFUSED: row {r['id']} has a mark that is neither "
                      "covered nor na")
                return 1
            if status == "na" and not str(note).strip():
                print(f"ISSUE REFUSED: row {r['id']} is marked na with no reason - "
                      "an na without a reason is a skip, not a judgement")
                return 1
            rows.append({**r, "status": status, "note": note})
    rec = {
        "id": args.id, "kind": "app", "anchors": anchors,
        "changed": sorted(set(args.changed)), "rows": rows,
        "files": pin_map(root), "issued": args.issued,
    }
    problems = record_problems(rec)
    if problems:
        print("ISSUE REFUSED: " + "; ".join(problems))
        return 1
    data.setdefault("about", "")
    data["rounds"].append(rec)
    f = Path(root) / CENSUS_REL
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=1) + "\n")
    left = [r["id"] for r in rows if r["status"] == "unmarked"]
    print(f"CENSUS ISSUED: {args.id} - {len(rows)} derived row(s), "
          f"{len(rows) - len(left)} marked, {len(left)} unmarked")
    for rid in left:
        print(f"  UNMARKED: {rid}")
    return 0


def cmd_issue_exempt(root, args):
    data, err = load_census(root)
    if err:
        print("ISSUE REFUSED: " + err)
        return 1
    if any(r.get("id") == args.id for r in data["rounds"]):
        print(f"ISSUE REFUSED: census id '{args.id}' already exists")
        return 1
    rec = {"id": args.id, "kind": "machinery-exempt", "reason": args.reason,
           "issued": args.issued}
    problems = record_problems(rec)
    if problems:
        print("ISSUE REFUSED: " + "; ".join(problems))
        return 1
    data.setdefault("about", "")
    data["rounds"].append(rec)
    f = Path(root) / CENSUS_REL
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=1) + "\n")
    print(f"CENSUS EXEMPTION RECORDED: {args.id}")
    return 0


def cmd_verify(root):
    data, err = load_census(root)
    if err:
        print("CENSUS ERROR: " + err)
        return 1
    if not data["rounds"]:
        print("CENSUS: no rounds recorded")
        return 0
    bad = 0
    for rec in data["rounds"]:
        state = record_state(root, rec)
        if state in ("BROKEN", "INVALID"):
            bad += 1
        extra = ""
        if rec.get("kind") == "app":
            left = unmarked(rec)
            extra = f", {len(rec.get('rows', []))} row(s), {len(left)} unmarked"
        print(f"{state}: {rec.get('id', '?')} (kind {rec.get('kind', '?')}{extra})")
        if state == "INVALID":
            for problem in record_problems(rec):
                print(f"    invalid: {problem}")
    if bad:
        print(f"CENSUS: {bad} broken or invalid record(s)")
        return 1
    return 0


def cmd_gate(root, changed):
    err = gate(root, changed)
    if err:
        print("CENSUS GATE REFUSED: " + err)
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser(description="Sibling-path census for app rounds (class N2)")
    sub = ap.add_subparsers(dest="mode", required=True)
    pd = sub.add_parser("derive")
    pd.add_argument("root", type=Path)
    pd.add_argument("--anchors", required=True)
    pi = sub.add_parser("issue")
    pi.add_argument("root", type=Path)
    pi.add_argument("--id", required=True)
    pi.add_argument("--anchors", required=True)
    pi.add_argument("--changed", action="append", required=True)
    pi.add_argument("--marks")
    pi.add_argument("--carry")
    pi.add_argument("--issued", required=True)
    pe = sub.add_parser("issue-exempt")
    pe.add_argument("root", type=Path)
    pe.add_argument("--id", required=True)
    pe.add_argument("--reason", required=True)
    pe.add_argument("--issued", required=True)
    pv = sub.add_parser("verify")
    pv.add_argument("root", type=Path)
    pg = sub.add_parser("gate")
    pg.add_argument("root", type=Path)
    pg.add_argument("--changed", nargs="+", required=True)
    args = ap.parse_args()
    root = args.root.resolve()
    if args.mode == "derive":
        return cmd_derive(root, args.anchors)
    if args.mode == "issue":
        return cmd_issue(root, args)
    if args.mode == "issue-exempt":
        return cmd_issue_exempt(root, args)
    if args.mode == "verify":
        return cmd_verify(root)
    return cmd_gate(root, args.changed)


if __name__ == "__main__":
    sys.exit(main())
