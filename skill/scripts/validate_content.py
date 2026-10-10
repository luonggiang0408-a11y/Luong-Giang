#!/usr/bin/env python3
"""Check a content.json for structural errors and for i+1 calibration.

Usage:
    python validate_content.py content.json [--known extra_known_words.txt] [--low 0.70] [--high 0.90] [-v]

Structure checks (errors, exit code 1): missing fields, no single blank, answer not in options...
Calibration (warnings, advisory only): for every question the script reads the English
context line + sentence (blank filled with the answer) and sorts the words into
  - known     : in profile/known_words.txt (+ --known file), after simple suffix stripping
  - target    : the answer, the section's target words and the words listed in "new"
  - unglossed : not known, not a target -> hidden difficulty. Either gloss it in "new",
                simplify the sentence, or add the word to known_words.txt if the learner does know it.
"new ratio" = (target + unglossed words) / all words. Band for the "i+1" idea: the learner should
understand roughly 70-90 % of the running words and infer the rest from context.
The known-word list is only a heuristic. Treat the report as a prompt to re-read the sentences, not as a verdict.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
KNOWN_DEFAULT = os.path.join(HERE, "..", "profile", "known_words.txt")


def load_words(path):
    if not path or not os.path.exists(path):
        return set()
    out = set()
    for line in open(path, encoding="utf-8"):
        line = line.split("#")[0].strip().lower()
        out.update(re.findall(r"[a-z']+", line))
    return out


def forms(w):
    w = w.lower().strip("'")
    c = {w}
    for suf in ("'s", "s", "es", "ed", "d", "ing", "ly", "er", "est", "r", "n't"):
        if w.endswith(suf) and len(w) - len(suf) >= 2:
            stem = w[: -len(suf)]
            c.add(stem)
            c.add(stem + "e")
            if len(stem) > 2 and stem[-1] == stem[-2]:
                c.add(stem[:-1])
    if w.endswith("ies"):
        c.add(w[:-3] + "y")
    if w.endswith("ied"):
        c.add(w[:-3] + "y")
    if w.endswith("ing") and len(w) > 5:
        c.add(w[:-3] + "e")
    return c


def tokens(text):
    text = re.sub(r"\b([ap])\.m\.|\b(e\.g\.|i\.e\.)", " ", text, flags=re.I)  # abbreviations are not words
    return re.findall(r"[A-Za-z]+(?:'[a-z]+)?", text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("content")
    ap.add_argument("--known", default=None)
    ap.add_argument("--low", type=float, default=0.70, help="minimum comprehension ratio")
    ap.add_argument("--high", type=float, default=0.90, help="maximum comprehension ratio")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    data = json.load(open(a.content, encoding="utf-8"))
    known = load_words(KNOWN_DEFAULT) | load_words(a.known)
    errors, warns = [], []
    ratios, seen = [], set()
    secs = data.get("sections", [])
    if not secs:
        errors.append("no sections")
    for k in ("title", "eyebrow", "h1", "lead", "storageKey"):
        if not data.get("meta", {}).get(k):
            errors.append(f"meta.{k} missing")

    sec_ids = set()
    for sec in secs:
        sid = sec.get("id", "?")
        if sid in sec_ids:
            errors.append(f"duplicate section id {sid}")
        sec_ids.add(sid)
        for k in ("title", "note"):
            if not sec.get(k):
                errors.append(f"{sid}: {k} missing")
        targets_sec = set()
        for w in sec.get("targets", []):
            targets_sec |= {x.lower() for x in tokens(w)}
        for i, q in enumerate(sec.get("qs", []), 1):
            qid = f"{sid}q{i}"
            t = q.get("type")
            if t not in ("mc", "tx"):
                errors.append(f"{qid}: type must be mc or tx"); continue
            for k in ("ctx", "s", "vi", "why"):
                if not q.get(k):
                    errors.append(f"{qid}: {k} missing")
            s = q.get("s", "")
            blanks = s.count("___")
            if blanks > 1:
                errors.append(f"{qid}: more than one blank")
            if blanks == 0 and not q.get("noblank"):
                warns.append(f"{qid}: no blank in sentence (set \"noblank\": true if intended)")
            if t == "mc":
                o = q.get("o", [])
                if len(o) < 2 or len(set(o)) != len(o):
                    errors.append(f"{qid}: need >=2 distinct options")
                if q.get("a") not in o:
                    errors.append(f"{qid}: answer not in options")
                ans = q.get("a", "")
            else:
                acc = q.get("acc") or ([q["a"]] if q.get("a") else [])
                if not acc:
                    errors.append(f"{qid}: acc (accepted answers) missing")
                ans = acc[0] if acc else ""
            for n in q.get("new", []):
                if not n.get("w") or not n.get("vi"):
                    errors.append(f"{qid}: each 'new' item needs w and vi")
            if len(tokens(s)) > 30:
                warns.append(f"{qid}: sentence has {len(tokens(s))} words - long for a drill item")
            key = (s, ans)
            if key in seen:
                warns.append(f"{qid}: duplicate of an earlier item")
            seen.add(key)

            # --- calibration
            full = q.get("ctx", "") + " " + (s.replace("___", ans) if blanks else s)
            words = tokens(full)
            tgt = set(targets_sec)
            if len(tokens(ans)) <= 3:  # a whole-sentence answer (choose the correct sentence) is not a "target word"
                for w in tokens(ans):
                    tgt.add(w.lower())
            for n in q.get("new", []):
                for w in tokens(n.get("w", "")):
                    tgt.add(w.lower())
            n_target = n_unknown = 0
            unglossed = []
            for w in words:
                lw = w.lower()
                if lw in tgt:
                    n_target += 1
                elif forms(lw) & known:
                    pass
                elif w[0].isupper() and words.index(w) != 0:
                    pass  # proper name
                else:
                    n_unknown += 1
                    unglossed.append(lw)
            total = max(len(words), 1)
            new_ratio = (n_target + n_unknown) / total
            comp = 1 - new_ratio
            ratios.append(comp)
            if unglossed:
                warns.append(f"{qid}: unglossed new words {sorted(set(unglossed))} - gloss in 'new', simplify, or add to known_words.txt")
            if comp < a.low:
                warns.append(f"{qid}: comprehension {comp:.0%} < {a.low:.0%} (too hard)")
            elif comp > a.high:
                warns.append(f"{qid}: comprehension {comp:.0%} > {a.high:.0%} (little new to learn; add a +1 element)")
            if a.verbose:
                print(f"{qid}: comprehension {comp:.0%}  target={n_target} unglossed={n_unknown}")

    n_q = sum(len(s.get("qs", [])) for s in secs)
    print(f"{len(secs)} sections, {n_q} questions")
    if ratios:
        print(f"average comprehension {sum(ratios)/len(ratios):.0%} (band {a.low:.0%}-{a.high:.0%})")
    for w in warns:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} errors, {len(warns)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
