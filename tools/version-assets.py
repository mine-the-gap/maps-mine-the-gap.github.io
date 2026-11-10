#!/usr/bin/env python3
"""Adds a content version (?v=<hash>) to every local stylesheet and script an HTML page loads.

The site is served with a long browser cache (Cloudflare: 4 hours), so without it visitors keep old copies of a
changed file — and mix them with new ones — for hours after a deploy. Run it after changing any CSS or JS, before
committing:  python3 tools/version-assets.py
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = re.compile(r'((?:href|src)=")(/?assets/[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")')

for page in sorted(ROOT.glob("*.html")):
    html = page.read_text()

    def versioned(match):
        path = ROOT / match.group(2).lstrip("/")
        if not path.is_file():
            return match.group(0)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
        return f"{match.group(1)}{match.group(2)}?v={digest}{match.group(3)}"

    new = REF.sub(versioned, html)
    if new != html:
        page.write_text(new)
        print("versioned", page.name)
