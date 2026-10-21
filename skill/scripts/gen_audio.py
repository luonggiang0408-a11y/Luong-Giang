#!/usr/bin/env python3
"""Generate neural-voice mp3 files for every question in a content.json.

Usage:
    python gen_audio.py content.json [--out-dir audio] [--voice en-US-EmmaMultilingualNeural]
                        [--variants b,f,sb,s] [--slow -30%]

File names: <questionId>_<variant>.mp3, where questionId = <sectionId>q<number>
    b  = sentence with the blank read as the word "blank" (normal speed)   -> before answering
    f  = full sentence with the answer filled in (normal speed)            -> after answering
    sb = like b, slow
    s  = like f, slow

Needs:  pip install edge-tts   (uses Microsoft's online neural voices; the sentences are
sent to that service, so do not put private data in exercise sentences).
Existing files are kept, so re-running only fills in what is missing.

Word pronunciation files: w_<slug>.mp3 for each question's "tw" (target word) and for the English
options of mc questions without "noblank" (the page plays them when an option is clicked).

Per-question override: add "say": "text to read" to a question to control pronunciation
(e.g. spell out an abbreviation). Use ___ for the blank in "say" too.
"""
import argparse, asyncio, json, os, re, sys

try:
    import edge_tts
except ImportError:
    sys.exit("edge-tts is not installed. Run:  python -m pip install edge-tts")

VARIANTS = {"b": ("blank", False), "f": ("full", False), "sb": ("blank", True), "s": ("full", True)}


def clean(t):
    t = re.sub(r"\b(\d{1,2})\.(\d{2})\b", r"\1:\2", t)  # 8.45 -> 8:45 so it is read as a time
    return re.sub(r"\s+", " ", t.replace("_____", "blank")).strip()


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def word_texts(data):
    """Single words/phrases whose pronunciation the page can play on its own:
    the target word (q.tw) of every question and the English options of 'choose the word' questions."""
    found = {}
    for sec in data["sections"]:
        for q in sec["qs"]:
            items = []
            if q.get("tw"):
                items.append(q["tw"])
            if q.get("type") == "sp":
                items += q.get("words", [])
            if q.get("type") == "mc" and not q.get("noblank"):
                items += q.get("o", [])
            for t in items:
                k = slug(t)
                if k and k not in found:
                    found[k] = re.sub(r"\s+", " ", t.replace("...", " ")).strip()
    return found


def texts(q):
    if q.get("type") == "sp":  # speaking prompt: read the question only
        return q["s"], q["s"]
    s = q.get("say") or q["s"]
    a = q.get("a") or (q.get("acc") or [""])[0]
    if q.get("listen") and "___" in s:  # dictation: the word is spoken before answering
        full = s.replace("___", a)
        return full, full
    if q.get("noblank") and q.get("say"):
        return s, s
    if "___" in s:
        return s.replace("___", "blank"), s.replace("___", a)
    return s, s + " " + a  # no blank: read the prompt, then the answer


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("content")
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--voice", default=None)
    ap.add_argument("--variants", default="b,f,sb,s")
    ap.add_argument("--slow", default="-30%")
    ap.add_argument("--concurrency", type=int, default=6)
    a = ap.parse_args()

    data = json.load(open(a.content, encoding="utf-8"))
    voice = a.voice or data.get("meta", {}).get("voice") or "en-US-EmmaMultilingualNeural"
    out_dir = a.out_dir or os.path.join(os.path.dirname(os.path.abspath(a.content)), "audio")
    os.makedirs(out_dir, exist_ok=True)
    wanted = [v for v in a.variants.split(",") if v in VARIANTS]

    jobs = []
    for sec in data["sections"]:
        for i, q in enumerate(sec["qs"], 1):
            blank, full = texts(q)
            for v in wanted:
                kind, slow = VARIANTS[v]
                jobs.append((os.path.join(out_dir, f"{sec['id']}q{i}_{v}.mp3"),
                             clean(blank if kind == "blank" else full), a.slow if slow else "+0%"))

    for k, t in word_texts(data).items():
        jobs.append((os.path.join(out_dir, f"w_{k}.mp3"), t, "+0%"))

    sem = asyncio.Semaphore(a.concurrency)
    failed = []

    async def one(path, text, rate):
        if os.path.exists(path) and os.path.getsize(path) > 2000:
            return
        async with sem:
            for k in range(4):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(text, voice, rate=rate).save(path), timeout=60)
                    return
                except Exception:
                    await asyncio.sleep(1.5 * (k + 1))
            failed.append(path)

    await asyncio.gather(*(one(*j) for j in jobs))
    files = [f for f in os.listdir(out_dir) if f.endswith(".mp3")]
    kb = sum(os.path.getsize(os.path.join(out_dir, f)) for f in files) // 1024
    print(f"voice={voice}  jobs={len(jobs)}  files in {out_dir}: {len(files)} ({kb} KB)")
    if failed:
        print("FAILED:", *failed, sep="\n  ")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
