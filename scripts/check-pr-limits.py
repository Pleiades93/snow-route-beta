#!/usr/bin/env python3
"""Pull-request limit judge (machinery gate round, queue 7b).

Judges a PR diff (base..HEAD) under the coding-discipline limits
Andrew set on 2026-11-23. Added lines and the full text of touched comments are judged.

FAIL rules:
  * A single commit adding more than SIZE_LIMIT product lines,
    unless the PR carries the large-change label. The label is
    applied by Andrew or the lead only; this judge never applies
    it. Product lines are added lines under parts/, plus src/sw.js
    and flags.js - the shipped app's own code.
  * A touched comment of more than COMMENT_WORD_LIMIT words.
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
import difflib
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

SIZE_LIMIT = 300
COMMENT_WORD_LIMIT = 20
LINE_CHAR_LIMIT = 240
LARGE_LABEL = "large-change"

# Root files that exist today; a new one edits this list in the same change.
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


def line_errors(path, text):
    """The line-length and comment rules for one added line -
    shared by the CLI below and push.py's local limits gate."""
    if path is None or path in GENERATED_EXEMPT:
        return []
    errs = []
    if len(text) > LINE_CHAR_LIMIT:
        errs.append(f"{path}: added line of {len(text)} chars "
                    f"(limit {LINE_CHAR_LIMIT})")
    words = comment_words(path, text)
    if words is not None and words > COMMENT_WORD_LIMIT:
        errs.append(f"{path}: added comment line of {words} "
                    f"words (limit {COMMENT_WORD_LIMIT})")
    return errs


_REGEX_PREV_OK = set("(,=:[!&|?{};+-*%~^<>")
_REGEX_WORDS = {"return", "typeof", "case", "delete", "void", "in", "of",
                "instanceof", "new", "yield", "await", "else", "do", "throw"}


def _js_comment_matches(text):
    """(start, raw) for each // and /* */ comment in JS source.

    One pass: quoted strings, template literals and regex literals
    are skipped whole, so a /* inside any of them opens nothing.
    A / opens a regex when the previous significant token cannot
    end an expression (the standard lexer heuristic)."""
    out = []
    i, n = 0, len(text)
    prev = ""       # last significant char, or "word" / "str" / "end"
    word = ""       # last identifier when prev == "word"
    stack = []      # "tpl" or ("expr", brace depth) inside a template
    while i < n:
        c = text[i]
        if stack and stack[-1] == "tpl":
            if c == "\\":
                i += 2
                continue
            if c == "`":
                stack.pop()
                prev, word = "str", ""
                i += 1
                continue
            if c == "$" and text[i + 1:i + 2] == "{":
                stack.append(("expr", 1))
                i += 2
                continue
            i += 1
            continue
        if c in " \t\r\n":
            i += 1
            continue
        if c == "/" and text[i + 1:i + 2] == "/":
            j = text.find("\n", i)
            if j < 0:
                j = n
            raw = text[i:j]
            out.append((i, raw[:-1] if raw.endswith("\r") else raw))
            i = j
            continue
        if c == "/" and text[i + 1:i + 2] == "*":
            j = text.find("*/", i + 2)
            if j < 0:
                i += 2
                continue
            out.append((i, text[i:j + 2]))
            i = j + 2
            continue
        if c in "'\"":
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == c or text[j] == "\n":
                    break
                j += 1
            i = min(j + 1, n)
            prev, word = "str", ""
            continue
        if c == "`":
            stack.append("tpl")
            i += 1
            continue
        if c == "/":
            if prev == "word":
                regex = word in _REGEX_WORDS
            elif prev in ("str", "end"):
                regex = False
            else:
                regex = prev == "" or prev in _REGEX_PREV_OK
            if not regex:
                prev, word = "/", ""
                i += 1
                continue
            j = i + 1
            in_class = False
            while j < n:
                d = text[j]
                if d == "\\":
                    j += 2
                    continue
                if d == "[":
                    in_class = True
                elif d == "]":
                    in_class = False
                elif d == "/" and not in_class:
                    break
                elif d == "\n":
                    break
                j += 1
            j = min(j + 1, n)
            while j < n and text[j].isalpha():
                j += 1
            i = j
            prev, word = "str", ""
            continue
        if c == "{" and stack and isinstance(stack[-1], tuple):
            stack[-1] = ("expr", stack[-1][1] + 1)
            prev, word = "{", ""
            i += 1
            continue
        if c == "}" and stack and isinstance(stack[-1], tuple):
            depth = stack[-1][1] - 1
            if depth:
                stack[-1] = ("expr", depth)
            else:
                stack.pop()
            prev, word = "}", ""
            i += 1
            continue
        if c.isalnum() or c in "_$":
            j = i
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            word = text[i:j]
            prev = "word"
            i = j
            continue
        if c in "+-" and prev == c:
            prev, word = "end", ""
            i += 1
            continue
        prev, word = c, ""
        i += 1
    return out


def comment_spans(path, text):
    """Yield zero-based first line, last line and full comment text."""
    ext = Path(path).suffix.lower()
    quoted = r"""(["'])(?:\\[\s\S]|(?!\1|\\)[\s\S])*\1"""
    if ext in (".js", ".mjs"):
        yield from _merge_spans(text, _js_comment_matches(text))
        return
    if ext == ".css":
        pattern = quoted + r"|\x60(?:\\[\s\S]|[^\x60\\])*\x60|" + r"/\*[\s\S]*?\*/"
    elif ext in (".html", ".md"):
        pattern = r"<!--[\s\S]*?-->"
        if ext == ".html":
            style = re.search(r"(?<=<style>)[\s\S]*?(?=</style>)", text)
            if style:
                offset = text.count("\n", 0, style.start())
                for first, last, body in comment_spans("style.css", style[0]):
                    yield first + offset, last + offset, body
    elif ext in (".py", ".yml", ".yaml", ".sh"):
        pattern = quoted + r"|\#[^\r\n]*"
        if ext == ".py":
            pattern = r"""(?:'''[\s\S]*?'''|""" + r'"""[\s\S]*?"""' + ")|" + pattern
    else:
        return

    found = [(m.start(), m.group(0)) for m in re.finditer(pattern, text)
             if not m.group(0).startswith(("'", '"', "\x60"))]
    yield from _merge_spans(text, found)


def _merge_spans(text, found):
    """Merge consecutive same-indent // or # lines into one span."""
    block = None
    for start, raw in found:
        first = text.count("\n", 0, start)
        last = first + raw.count("\n")
        indent = text[text.rfind("\n", 0, start) + 1:start]
        marker = "//" if raw.startswith("//") else "#" if raw.startswith("#") else None
        if marker:
            body = raw[len(marker):]
            if (block and block[1] + 1 == first and block[3:] == (indent, marker)
                    and not indent.strip()):
                block = block[0], last, block[2] + "\n" + body, indent, marker
                continue
        else:
            body = raw[4:-3] if raw.startswith("<!--") else raw[2:-2]
            body = re.sub(r"^[ \t]*\* ?", "", body, flags=re.M)
        if block:
            yield block[:3]
        block = first, last, body, indent, marker
    if block:
        yield block[:3]


def changed_line_errors(path, old_text, new_text, added, deletions):
    """Judge added lines and full comments intersecting the diff."""
    lines = new_text.splitlines()
    errors = [err for i in sorted(added) for err in line_errors(path, lines[i])]
    if path in GENERATED_EXEMPT:
        return errors
    touched = set(added)
    if deletions:
        for first, last, _ in comment_spans(path, old_text):
            for boundary, start, end in deletions:
                if first < start <= last:
                    touched.add(boundary - 1)
                if first < end <= last:
                    touched.add(boundary)
    if old_text:
        # A comment losing lines to a replace/delete is judged
        # whole in its surviving form (Codex P2, PR #225).
        sm = difflib.SequenceMatcher(None, old_text.split("\n"),
                                     new_text.split("\n"), autojunk=False)
        opcodes = sm.get_opcodes()
        home = {}
        for tag, i1, i2, j1, j2 in opcodes:
            if tag == "equal":
                for k in range(i2 - i1):
                    home[i1 + k] = j1 + k
        span_of = {}
        for f0, l0, _b in comment_spans(path, old_text):
            for i in range(f0, l0 + 1):
                span_of[i] = f0
        lost_at = {}
        for tag, i1, i2, j1, j2 in opcodes:
            if tag in ("replace", "delete"):
                for i in range(i1, i2):
                    if i in span_of:
                        lost_at.setdefault(span_of[i], []).append(j1)
        if lost_at:
            new_spans = list(comment_spans(path, new_text))
            for f0, l0, _b in comment_spans(path, old_text):
                if f0 not in lost_at:
                    continue
                survivors = {home[i] for i in range(f0, l0 + 1)
                             if i in home}
                for nf, nl, _nb in new_spans:
                    inside = any(nf <= s <= nl for s in survivors)
                    near = any(nf - 1 <= p <= nl + 1
                               for p in lost_at[f0])
                    if inside and near:
                        touched.update(range(nf, nl + 1))
    for first, last, body in comment_spans(path, new_text):
        if not any(i in touched for i in range(first, last + 1)):
            continue
        words = len(body.split())
        if words <= COMMENT_WORD_LIMIT:
            continue
        if (first == last and first in added
                and (comment_words(path, lines[first]) or 0) > COMMENT_WORD_LIMIT):
            continue
        errors.append(f"{path}:{first + 1}: touched comment of {words} "
                      f"words (limit {COMMENT_WORD_LIMIT})")
    return errors


def root_file_error(path):
    """The new-root-file rule, shared with push.py's gate."""
    if "/" not in path and path not in ROOT_ALLOWLIST:
        return (f"new root file {path} is not in the "
                "allowlist - root files are deliberate")
    return None


def size_error(desc, product, labels):
    """The product-size rule, shared with push.py's gate."""
    if product > SIZE_LIMIT and LARGE_LABEL not in labels:
        return (f"{desc} adds {product} product lines "
                f"(limit {SIZE_LIMIT}) without the {LARGE_LABEL} "
                "label - the label is applied by Andrew or the "
                "lead, never by the change's author")
    return None


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


def real_parents(root, sha):
    """The commit's recorded parents (cat-file ignores shallow
    grafts, which make a merged head look like a root commit)."""
    out = git(root, "cat-file", "-p", sha)
    return [ln.split()[1] for ln in out.splitlines()
            if ln.startswith("parent ")]


def is_shallow(root):
    out = git(root, "rev-parse", "--is-shallow-repository")
    return out.strip() == "true"


def ensure_ancestry(root, base):
    """The commits to judge, fetched when the checkout is shallow.

    A shallow PR checkout holds only the merge commit, grafted to
    look parentless: enumerating it would pass the size rule
    blind. Deepen the head's ancestry first; afterwards, a range
    that still holds no non-merge commit while the diff is
    non-empty is refused, never judged blind.
    """
    if is_shallow(root):
        head = git(root, "rev-parse", "HEAD").strip()
        for fetch_args in (["fetch", "--no-tags", "--depth=1000",
                            "origin", head],
                           ["fetch", "--no-tags", "--depth=1000",
                            "origin"]):
            subprocess.run(["git", "-C", str(root)] + fetch_args,
                           capture_output=True, text=True, timeout=600)
            if not is_shallow(root):
                break
    commits = commit_list(root, base)
    diff = git(root, "diff", "--name-only", f"{base}..HEAD").strip()
    if diff and all(len(real_parents(root, sha)) >= 2
                    for sha in commits):
        raise SystemExit("pr-limits: PR ancestry unavailable - "
                         "refusing to judge blind")
    return commits


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


def changed_line_ranges(root, base):
    """Path, added line indices and deletion boundaries from Git's diff."""
    out = git(root, "diff", "--unified=0", "--no-renames", f"{base}..HEAD")
    ranges = {}
    path = None
    for line in out.splitlines():
        if line.startswith("diff --git "):
            path = None
        elif path is None and line.startswith("+++ b/"):
            path = line[6:]
        elif path and line.startswith("@@ "):
            hunk = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", line)
            old_start, removed, start, length = (int(value) if value is not None else 1 for value in hunk.groups())
            added, deletions = ranges.setdefault(path, (set(), set()))
            if length:
                added.update(range(start - 1, start - 1 + length))
            elif removed:
                deletions.add((start, old_start - 1, old_start - 1 + removed))
    return ranges


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

    commits = ensure_ancestry(root, args.base)
    prev_files = None
    for sha in commits:
        subject = git(root, "log", "-1", "--format=%s", sha).strip()
        parents = real_parents(root, sha)
        changed, added, product = commit_files(root, sha)
        if len(parents) < 2 and product > SIZE_LIMIT:
            if LARGE_LABEL in labels:
                print(f"pr-limits: {sha[:8]} adds {product} product "
                      f"lines; {LARGE_LABEL} label present - allowed")
            else:
                errors.append(size_error(f"commit {sha[:8]}",
                                         product, labels))
        if re.match(r"^(fixup|squash)!", subject):
            warnings.append(f"commit {sha[:8]} is a fixup!/squash! "
                            "marker commit")
        elif (prev_files is not None and changed and not added
              and changed <= prev_files):
            warnings.append(f"commit {sha[:8]} looks fix-up-only "
                            "(its files are a subset of the previous "
                            "commit's, and it adds no new file)")
        prev_files = changed

    for path, (added, deletions) in changed_line_ranges(root, args.base).items():
        exists = subprocess.run(["git", "-C", str(root), "cat-file", "-e",
                                 f"{args.base}:{path}"],
                                capture_output=True).returncode == 0
        old_text = git(root, "show", f"{args.base}:{path}") if exists else ""
        new_text = git(root, "show", f"HEAD:{path}")
        errors.extend(changed_line_errors(path, old_text, new_text, added, deletions))

    out = git(root, "diff", "--name-status", "--no-renames",
              f"{args.base}..HEAD")
    for ln in out.splitlines():
        parts = ln.split("\t")
        if len(parts) < 2:
            continue
        status, path = parts[0], parts[-1]
        if status.startswith("A"):
            err = root_file_error(path)
            if err:
                errors.append(err)

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
