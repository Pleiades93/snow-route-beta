#!/usr/bin/env python3
"""Assemble the Snow Route page from its parts (Beta 1.94, audit F-02).

The canonical app source is parts/ - eight files, concatenated in a fixed
order into src/tracker-source.html, which scripts/build-pages.py then
stamps (CSP) and publishes as index.html. tracker-source.html is a
GENERATED file: never hand-edit it; edit the part and re-run this script.

    python3 scripts/assemble.py            # write src/tracker-source.html
    python3 scripts/assemble.py --check    # fail if src/ is not what parts/ builds

Recipe (byte-exact, the standing assembly since Beta 1.0's first build):
head.html, then '<script>', then data.js, app1.js, engine.js, pmstyles.js,
app2.js, app3.js, app4.js, then '</script></body></html>'.
"""
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARTS = ["head.html", "data.js", "app1.js", "engine.js", "pmstyles.js",
         "app2.js", "app3.js", "app4.js"]
OUT = ROOT / "src" / "tracker-source.html"


def build() -> bytes:
    chunks = []
    for name in PARTS:
        p = ROOT / "parts" / name
        if not p.is_file():
            raise SystemExit(f"assemble: missing part {p}")
        chunks.append(p.read_bytes())
        if name == "head.html":
            chunks.append(b"<script>\n")
    chunks.append(b"</script></body></html>\n")
    return b"".join(chunks)


def main() -> int:
    data = build()
    digest = hashlib.sha256(data).hexdigest()
    if "--check" in sys.argv:
        if not OUT.is_file() or OUT.read_bytes() != data:
            print("assemble --check: FAIL - src/tracker-source.html is not "
                  "what parts/ assembles to (edit parts/, not the output)")
            return 1
        print(f"assemble --check: OK ({len(data)} bytes, sha256 {digest[:12]}...)")
        return 0
    OUT.write_bytes(data)
    print(f"assemble: wrote {OUT.relative_to(ROOT)} "
          f"({len(data)} bytes, sha256 {digest[:12]}...)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
