#!/usr/bin/env python3
"""VBFA frontend static regression checks (Python stdlib only)."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import subprocess, sys, re

ROOT = Path(__file__).resolve().parents[1]
pages = sorted(ROOT.rglob("*.html"))
errors = []
IGNORE = ("https:", "http:", "mailto:", "tel:", "data:", "javascript:", "//")

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.ids, self.headings, self.images, self.html_lang, self.description = [], set(), [], [], False, False
    def handle_starttag(self,tag,attrs):
        attrs = dict(attrs)
        if tag == "html": self.html_lang = attrs.get("lang")=="vi"
        if attrs.get("id"): self.ids.add(attrs["id"])
        if tag in ("h1","h2"): self.headings.append(tag)
        if tag == "img": self.images.append(attrs)
        if tag == "meta" and attrs.get("name")=="description" and attrs.get("content"):self.description=True
        for key in ("href","src"):
            if attrs.get(key):self.refs.append((tag,key,attrs[key]))
for html in pages:
    d = Page()
    source = html.read_text(encoding="utf-8")
    d.feed(source)
    rel = str(html.relative_to(ROOT))
    if not d.html_lang:errors.append(f"{rel}: lang vi missing")
    if d.headings.count("h1")!=1:errors.append(f"{rel}: expected one H1, got {d.headings.count('h1')}")
    if not d.description:errors.append(f"{rel}: missing page description")
    for img in d.images:
        if "alt" not in img:errors.append(f"{rel}: image missing alt ({img.get('src')})")
    for tag,key,value in d.refs:
        if value.startswith(IGNORE):continue
        parsed=urlsplit(value)
        fragment=unquote(parsed.fragment)
        path=unquote(parsed.path)
        if not path and fragment:
            if fragment not in d.ids: errors.append(f"{rel}: broken anchor #{fragment}")
            continue
        if not path:continue
        target=(ROOT/path.lstrip("/")) if path.startswith("/") else (html.parent/path)
        if target.is_dir():target=target/"index.html"
        if not target.exists():errors.append(f"{rel}: missing local {tag} {key}={value}")
        elif target.suffix==".html" and fragment:
            other=Page();other.feed(target.read_text(encoding="utf-8"))
            if fragment not in other.ids:errors.append(f"{rel}: link target missing #{fragment} in {target}")
if len(pages)!=12:errors.append(f"expected 12 HTML pages; found {len(pages)}")
css=(ROOT/"assets/css/tokens.css").read_text(encoding="utf-8")
if "--font-body:'Be Vietnam Pro'" not in css:errors.append("Digital typography must use Be Vietnam Pro")
if "Mona Sans SemiExp" in css or "cdn.jsdelivr.net/fontsource" in css:errors.append("Unverified design font dependency still in tokens")
if 'data-filter-mode="hide"' not in (ROOT/"index.html").read_text(encoding="utf-8"):errors.append("Homepage news filter must hide nonmatches")
if not (ROOT/"assets/img/vbfa-logo.png").exists():errors.append("Official logo asset missing")
for file in (ROOT/"assets/js/site.js",ROOT/"assets/js/articles-data.js"):
    p=subprocess.run(["node","--check",str(file)],capture_output=True,text=True)
    if p.returncode:errors.append(f"{file.relative_to(ROOT)}: JS syntax error: {p.stderr}")
print(f"Checked {len(pages)} routes; {len(errors)} issues")
for err in errors:print("ERROR:",err)
sys.exit(1 if errors else 0)
