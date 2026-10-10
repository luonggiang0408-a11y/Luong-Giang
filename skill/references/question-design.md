# Designing the questions

## Pick the item type to fit what is being learned

| Learning goal | Best item | Notes |
|---|---|---|
| Prepositions (at/on/in, for/since, by/until, verb + preposition) | `tx` (type the preposition) for production; `mc` when two prepositions are a classic confusion | Typing makes the learner retrieve the preposition instead of recognising it. Use `mc` with 2-3 options for contrasts such as `for / since / during`, `shout to / at`, `in time / on time` |
| New vocabulary (nouns, verbs, adjectives) | `mc` with 3 options of the same word class | Distractors from the same topic, not absurd. Include one that is a real near-confusable (assurance / insurance) |
| Collocations (pay interest **on**, make a dish) | `tx` for the small word, `mc` for the content word | Test the part the learner usually gets wrong |
| Word form (cook / cooker / cooking) | `mc` | The three options should all be real words |
| Grammar structure (so ... that, even when, so that) | `tx` for the link word, `mc` for choosing between structures | Keep the vocabulary known so the structure is the only +1 |
| Meaning in context ("Here, run out means ...") | `mc` with 3 paraphrases | Quote the sentence in the question; use when a word has several meanings |
| Spelling that matters (chilli / chili, non-profit) | `tx` with every accepted spelling in `acc` | |

Mix: for a set of 100+, roughly 55-65% `tx` for grammar/prepositions-heavy sets and 70% `mc` for
vocabulary-heavy sets. A section should contain both when the topic allows it.

## Write each item as a situation

A bare sentence ("I'm interested ___ art.") is easy to forget. A situation gives the learner
somewhere to hang it. Fill in as many of these as fits in one short line:

- **who**: Linh, my manager, the waiter, a bank clerk
- **where**: at a sushi bar, in the ticket office, on a hiking trip
- **when/why**: before an exam, after a delay, because the card expires

`ctx` is the short scene label (2-4 words, shown above the sentence in small capitals). The sentence
itself carries the rest. Prefer realistic scenes from the learner's world (study, work, travel, food,
shopping, health, banking) over invented textbook situations. Vary the speakers and the places
so that sentences do not blur together.

Good: `ctx: "Customer service"` / `s: "The manager gave us her ___ that the problem would be fixed by Monday."`
Weak: `ctx: "Grammar"` / `s: "The manager gave us her ___."`

## Distractors for `mc`

- 2-3 options. Always include the right answer exactly once; the page shuffles the order, so do not
  rely on position.
- Same word class and register as the answer.
- At least one distractor should be a plausible error (a common mistake of Vietnamese speakers,
  a false friend, or a word from the same family), because that is where the learning is.
- Never make a distractor correct "in some other reading". Read the sentence with each option.

## Type-in (`tx`) answers

- `acc` lists every accepted answer; the first is shown as the correct answer. Matching ignores case,
  extra spaces, a final full stop and hyphens versus spaces.
- Accept legitimate variants (`from` / `to` after `different`; `of` / `about` after `think`;
  `flavour` / `flavor`) and say so in `why`.
- Avoid answers longer than three words; the learner will fail on typing, not on knowledge.

## Reasons and translations

- `why` (Vietnamese, one line): the rule or meaning that decides the answer, with the
  English target in plain text. Compare the confusable pair in the same line:
  "by = chậm nhất vào lúc đó; until = kéo dài đến lúc đó."
- `vi` (Vietnamese): a natural translation of the whole sentence, not word by word.
- `new`: only words other than the target that the learner may not know. Gloss in a few words.
- `hint` (optional, Vietnamese): a nudge that points at the clue in the sentence without giving the
  answer, for the harder items. Do not add one to every question.

## Section notes

The `note` at the top of each section is a 1-3 line recap in Vietnamese with `<b>` around the
forms to remember. It should be what the learner would write on a flash card. HTML allowed: `<b>`, `<i>`.

## Sizes and order

- Section: 7-24 questions. Longer than that, split by sub-topic.
- Total: about 60-120 questions for a unit-sized request; shorter if the learner has a small list.
- Put grammar/preposition sections first when the set mixes both, then topic vocabulary, then a
  short mixed or structure section at the end for recycling.
- Group target words that go together so that one situation can reuse several of them
  (a bank scene can carry `interest`, `withdraw`, `fine`).

## Pitfalls seen in practice

- Items copied from the learner's own list in the same order feel like a quiz of the list. Rephrase
  and reorder into situations.
- Putting an answer in `ctx` ("Quiz: the word is ...").
- Mixing British and American spelling without saying so; this learner prefers American
  pronunciation, and spelling should follow the voice unless the lesson is about UK/US differences.
- Idioms that were not taught (the exception is when the idiom is the target, like `a piece of cake`).
- Long names or numbers that the text-to-speech voice reads badly. Use `say` to give the voice a
  better reading (for example write out a figure).
