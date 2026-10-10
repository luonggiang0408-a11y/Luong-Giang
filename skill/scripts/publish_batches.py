#!/usr/bin/env python3
"""List the audio files of a content.json in batches for the Artifact tool's `files` parameter.

The Artifact tool accepts at most 255 files per publish and 511 per version, so audio is
published in batches of 240 (the page itself is sent with the first batch; every later
publish adds to the files already there).

Usage:
    python publish_batches.py content.json [--audio-dir audio] [--batch 240] [--variants b,f,sb,s]

Writes batch_1.json, batch_2.json ... next to content.json. Each file is a JSON array like
[{"path":"audio/s1q1_b.mp3"}, ...] that you pass as `files` (paths are relative to the
working directory, so run the publish from the folder that contains `audio/`).
"""
import argparse, json, os, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("content")
    ap.add_argument("--audio-dir", default="audio")
    ap.add_argument("--batch", type=int, default=240)
    ap.add_argument("--variants", default="b,f,sb,s")
    a = ap.parse_args()

    data = json.load(open(a.content, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(a.content))
    variants = a.variants.split(",")
    names = []
    for sec in data["sections"]:
        for i, _ in enumerate(sec["qs"], 1):
            for v in variants:
                rel = f"{a.audio_dir}/{sec['id']}q{i}_{v}.mp3"
                if os.path.exists(os.path.join(base, rel)):
                    names.append(rel)
                else:
                    print("missing:", rel, file=sys.stderr)
    if len(names) > 510:
        print(f"WARNING: {len(names)} files exceeds the 511-file limit per artifact version. "
              "Regenerate with --variants b,f (2 files per question) or split the set.", file=sys.stderr)
    for n, start in enumerate(range(0, len(names), a.batch), 1):
        part = names[start:start + a.batch]
        path = os.path.join(base, f"batch_{n}.json")
        with open(path, "w") as f:
            json.dump([{"path": p} for p in part], f, separators=(",", ":"))
        print(f"{path}: {len(part)} files")
    print(f"total {len(names)} audio files")


if __name__ == "__main__":
    main()
