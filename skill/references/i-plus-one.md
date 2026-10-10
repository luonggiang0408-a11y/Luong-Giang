# Calibrating exercises to i+1 (comprehensible input)

Read this before writing any sentence. The learner asked for every example to follow Krashen's
comprehensible-input idea: the input sits just above what they can already do.

- **i** = the learner's present level (see `profile/learner.md` and `profile/known_words.txt`).
- **+1** = a small piece of new knowledge (a word, a collocation, a structure) one step beyond i.
- They should understand about **70-80%** of what they read or hear without help.
- The remaining **20-30%** is new and is worked out from the situation, the sentence around it,
  or knowledge they already have - without dictionary lookups.

## Why this matters for a drill

A drill sentence that is all known words teaches nothing; one with a third of the words unknown
turns into a dictionary exercise, and the learner guesses blindly. In the 70-80% band the new item
is *noticed* because everything around it is clear, and the learner builds the meaning from the
clues. Feedback then confirms or corrects the guess, which is when the new item sticks.

## How to build it into each question

1. **Choose one main +1 per sentence**: the target item (the blank, or the word the question is about).
2. **Keep the rest known.** Use words from `profile/known_words.txt` or ones the learner has
   already practised in earlier sets. A sentence may carry one or two *supporting* new words, no more,
   and each must be inferable. Declare them in `new` (word + Vietnamese gloss). The page shows the gloss
   only after answering.
3. **Add exactly one grammar +1 at most.** Examples at B1-B2: `so ... that`, `even when`, `so that`,
   passive, a relative clause. Do not combine a new structure with several new words in one item.
4. **Write the context line (`ctx`) as a clue**, not as decoration. It sets place, role and purpose
   ("Ticket office", "Job interview, 9 a.m."). The sentence then restates or contrasts the idea.
5. **Make the meaning guessable** with one of these clue types:
   - restatement: "The train was running late. Sorry for the **delay**."
   - contrast: "It tastes **bland**; it needs more salt."
   - example / list: "Cinnamon, cumin and cloves are all types of **spice**."
   - cause and effect: "The crisps were so **salty** that I needed a big glass of water."
   - collocate neighbours: "pay a small **fine**", "withdraw money **early**".
   - routine scripts: "Could you pass the salt and the black ___?"
6. **Do not leak the answer**: the target word itself must not appear elsewhere in the sentence or in `ctx`.
7. **Recycle.** In a set of 15+ targets, meet each target a second time later in the set in a new
   situation (a different clue type), ideally with a different item type (first `mc`, then `tx`).
   Hard or easily confused targets get a third look. Recycling is what moves a word from "seen"
   to "known".
8. **Order inside a section**: start with the most transparent contexts, finish with the most
   demanding. The early items quietly teach the vocabulary that the later items assume.

## Per-question checklist

- [ ] Can the learner understand ~70-80% of the English (ctx + sentence) on first read?
- [ ] Is the target the main new thing? Is any other unfamiliar word glossed in `new`?
- [ ] Does the situation give a real clue to the answer, short of giving it away?
- [ ] Is there at most one new structure?
- [ ] Is exactly one answer correct (or all acceptable answers listed in `acc`)?
- [ ] Is the sentence between 8 and 20 words, with no trick or idiom the set did not teach?

## Using the validator

`scripts/validate_content.py` counts, for each question, how many words are known, target, or
unglossed, and reports a comprehension percentage. The band is configurable
(`--low 0.70 --high 0.90`; the upper end is looser than 80% because function words are counted).
Treat it as a smoke detector: "unglossed" words are the ones most likely to hide difficulty.
It cannot judge whether a clue is good, so reread the flagged sentences yourself.

## Adjusting after feedback

| What happens | What to change next time |
|---|---|
| The learner misses most items of a section | Drop to ~85-90% comprehension: shorter sentences, stronger clues, fewer supporting new words, add hints |
| The learner gets nearly everything right, fast | Raise toward ~70-75%: a second new word, a less direct clue, a harder grammar +1 |
| The same confusion repeats (e.g. `in time` / `on time`) | Add a contrast pair of items and recycle it in a later set |
| The learner says a sentence felt unnatural | Rewrite it as a real situation; do not keep an unnatural sentence for the sake of the target |

Record these observations in `profile/learner.md` so the next set starts from where this one ended.
