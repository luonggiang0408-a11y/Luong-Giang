#!/usr/bin/env python3
"""Build the interactive drill page (single HTML file) from a content.json.

Usage:
    python build_page.py content.json [--out index.html] [--template path/to/template.html]

The page expects its audio files in an `audio/` folder next to the HTML
(see gen_audio.py). If a file is missing the page falls back to the browser voice.
"""
import argparse, html, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_TEMPLATE = os.path.join(HERE, "..", "assets", "template.html")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("content")
    ap.add_argument("--out", default=None, help="output html (default: <content-dir>/index.html)")
    ap.add_argument("--template", default=DEFAULT_TEMPLATE)
    a = ap.parse_args()

    with open(a.content, encoding="utf-8") as f:
        data = json.load(f)
    meta = data.get("meta", {})
    for k in ("title", "eyebrow", "h1", "lead"):
        if not meta.get(k):
            sys.exit(f"meta.{k} is missing in {a.content}")

    with open(a.template, encoding="utf-8") as f:
        page = f.read()

    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    page = page.replace("/*__CONTENT_JSON__*/null", payload)
    page = page.replace("__TITLE__", html.escape(meta["title"]))
    page = page.replace("__EYEBROW__", html.escape(meta["eyebrow"]))
    page = page.replace("__H1__", html.escape(meta["h1"]))
    page = page.replace("__LEAD__", html.escape(meta["lead"]))

    out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.content)), "index.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    n = sum(len(s["qs"]) for s in data["sections"])
    print(f"wrote {out}  ({len(data['sections'])} sections, {n} questions, {len(page)//1024} KB)")


if __name__ == "__main__":
    main()
