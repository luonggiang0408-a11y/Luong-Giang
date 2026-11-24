"""Tạo âm thanh giọng Emma (Microsoft neural) cho web VocabIELTS: từ vựng, câu ví dụ và từng câu trong bài đọc.

    pip install edge-tts
    python tools/gen_vocab_audio.py            # chỉ tạo file còn thiếu

Tên file = cyrb53(văn bản đã chuẩn hoá) ở dạng hex, khớp với TTS.fileFor() trong docs/vocab/ui.js.
Mọi thiết bị dùng chung các file mp3 này nên giọng đọc giống hệt nhau trên máy tính, iPad và điện thoại.
"""
import asyncio, glob, json, os, re, sys

VOICE = os.environ.get("VOCAB_VOICE", "en-US-EmmaMultilingualNeural")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "vocab")
OUT = os.path.join(ROOT, "audio")
M32 = 0xFFFFFFFF


def cyrb53(s):
    h1, h2 = 0xDEADBEEF, 0x41C6CE57
    b = s.encode("utf-16-le")
    for i in range(0, len(b), 2):
        ch = b[i] | (b[i + 1] << 8)
        h1 = ((h1 ^ ch) * 2654435761) & M32
        h2 = ((h2 ^ ch) * 1597334677) & M32
    h1 = ((h1 ^ (h1 >> 16)) * 2246822507) & M32
    h1 ^= (((h2 ^ (h2 >> 13)) * 3266489909) & M32)
    h2 = ((h2 ^ (h2 >> 16)) * 2246822507) & M32
    h2 ^= (((h1 ^ (h1 >> 13)) * 3266489909) & M32)
    return format(4294967296 * (2097151 & h2) + (h1 & M32), "x")


def ws(s):
    return re.sub(r"\s+", " ", s).strip()


def word_text(w):
    s = re.sub(r"\(([^)]*)\)", r" \1 ", w)
    s = re.sub(r"\bsb\b", "somebody", s, flags=re.I)
    s = re.sub(r"\bsth\b", "something", s, flags=re.I)
    s = re.sub(r"\s*[=/]\s*", ", ", s)
    return ws(s)


def example_text(e):
    return ws(e.split("→")[0])


def sentences(para):
    return re.findall(r"[^.!?]+[.!?]+[\"')\]]*\s*|[^.!?]+$", para) or [para]


def collect():
    texts = set()
    wj = json.load(open(os.path.join(ROOT, "data", "words.json"), encoding="utf-8"))
    for w in wj["words"]:
        if w.get("word"):
            texts.add(word_text(w["word"]))
        if w.get("example"):
            texts.add(example_text(w["example"]))
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "reading", "*.json")))[-3:]:   # chỉ 3 ngày gần nhất
        for p in json.load(open(f, encoding="utf-8")).get("passages", []):
            for para in re.split(r"\n\s*\n", p["text"]):
                para = para.strip()
                if not para:
                    continue
                for s in sentences(para):
                    t = ws(s.replace("**", ""))
                    if t:
                        texts.add(t)
    texts.discard("")
    return texts


async def main():
    import edge_tts
    os.makedirs(OUT, exist_ok=True)
    texts = collect()
    jobs = [(t, os.path.join(OUT, cyrb53(t) + ".mp3")) for t in sorted(texts)]
    todo = [(t, p) for t, p in jobs if not os.path.exists(p) or os.path.getsize(p) < 1024]
    keep = {p for _, p in jobs}
    if "--reverse" in sys.argv:
        todo.reverse()
    print(f"voice={VOICE} texts={len(jobs)} missing={len(todo)}")
    sem = asyncio.Semaphore(8)
    fails = []

    async def one(t, p):
        async with sem:
            for k in range(3):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(t, VOICE, rate="-4%").save(p), timeout=60)
                    if os.path.getsize(p) >= 1024:
                        return
                except Exception:
                    await asyncio.sleep(1 + k)
            fails.append(t)
            if os.path.exists(p):
                os.remove(p)

    await asyncio.gather(*(one(t, p) for t, p in todo))
    # dọn file không còn dùng (từ đã xoá, bài đọc cũ bị xoá)
    for f in glob.glob(os.path.join(OUT, "*.mp3")):
        if f not in keep and os.path.abspath(f) not in {os.path.abspath(k) for k in keep}:
            os.remove(f)
    mb = sum(os.path.getsize(f) for f in glob.glob(os.path.join(OUT, "*.mp3"))) / 1e6
    print(f"done: {len(glob.glob(os.path.join(OUT, '*.mp3')))} files, {mb:.1f} MB, failed={len(fails)}")
    if fails and len(fails) > len(todo) * 0.5:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
