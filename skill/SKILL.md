---
name: english-drill-builder
description: >-
  Build an interactive, audio-enabled English practice set (quiz page with contextual fill-in and multiple-choice questions, instant feedback, Vietnamese explanations and translations, and a natural US-accent "listen" button) from whatever the learner is studying now - a vocabulary list, a textbook unit, a grammar point such as prepositions, pasted notes, or an uploaded PDF/Word/Excel list. Every sentence is calibrated with Krashen's comprehensible input (i+1): about 70-80% of the words are already known and the rest is inferred from context. Use this skill whenever the user says things like "tạo bài tập", "làm bài tập ôn từ vựng/giới từ/ngữ pháp", "ôn tập list từ này", "bộ bài tập tương tác", "quiz cho bài này", "tạo bài tập tương tự bài giới từ & từ vựng", gives a word list or unit and wants to practise it, or wants listening practice attached to exercises - even if they never say "skill" or "i+1".
---

# English drill builder

> **DAILY SET FORMAT (latest learner request, overrides any other number of questions per section, including in a scheduled prompt):**
> s1 "Viết từ" = 1 `tx` per word, s2 "Chọn từ" = 1 `mc` per word, s3 "Chọn nghĩa" = 1 `mc` (`noblank`) per word, then s4 "Nói vận dụng" = exactly 10 `sp` speaking prompts
> (see `references/content-schema.md`, "Speaking section"). Total = 3N + 10. Use `storageKey` `vocab-<date>-v6`, delete `lessons/<date>/audio` and `docs/<date>/audio` before pushing so the workflow regenerates audio, level B1+-B2.

Turns "here is what I am learning" into a finished, shareable practice page. It exists because
the learner (Vietnamese speaker, around B1-B2, IELTS 5.0-5.5 target) learns best from short
questions placed in concrete situations, with the new material just above their level, so that
they can guess meaning from context, check themselves immediately, and hear the sentence read
naturally.

What a finished set contains:
- 6-8 sections of 8-25 questions each (multiple choice and type-in), every question in a specific
  situation (who / where / when / why), never a bare sentence.
- Instant feedback: correct/incorrect, the answer, a one-line reason in Vietnamese, a Vietnamese
  translation, and (after answering) the meaning of the few new words in the sentence.
- Optional hint button, a "wrong answers" tab, saved progress, light/dark theme.
- Under each question: Listen / Listen slowly / Pause buttons with a neural US voice
  (blank is read as "blank" before answering, the full sentence after).

## Workflow

Follow these steps in order. Steps 1-2 take a minute but decide whether the set is useful, so
do not skip them.

1. **Load the learner profile.** Read `profile/learner.md` (level, preferences, history) and skim
   `profile/known_words.txt` (the words assumed to be understood). This is "i". If the user
   states a different level or goal in this conversation, that wins; note the change for step 8.

2. **Collect the material.** Sources: text in the message, a file the user points to
   (PDF -> `pdftotext -layout`; docx/xlsx -> python-docx / openpyxl), or a book unit in
   `D:\Hoc hanh\Ielts` (for instance the Vocabulary in Use PDF). List every target item and its
   meaning. If an item is unclear or looks like a typo (for example `have got st on st`), do not
   invent a meaning: leave it out and say so in the final message, or ask. Group the items into
   sections by theme or by skill (grammar point, word family, topic), 6-24 targets per section.

3. **Design the set.** Read `references/question-design.md` and `references/i-plus-one.md`.
   Decide per section: item type (preposition / vocabulary / collocation / structure), the mix of
   `mc` and `tx`, and the situations to use. Plan at least two exposures of each target in
   different contexts (spiral recycling) when the set is large enough.

4. **Write `content.json`.** Schema and a fully worked example are in
   `references/content-schema.md` and `assets/examples/`. Create a working folder, for example
   `D:\Hoc hanh\Ielts\<topic>\`, and write the file there. All English must stay inside the i+1 band:
   - known words carry the sentence; the target item is the +1;
   - at most one or two further unfamiliar words per sentence, each inferable from the situation
     line and the rest of the sentence, and each listed in `new` with a Vietnamese gloss that is
     shown only after the learner answers;
   - never gloss before answering (it removes the inference that makes the method work).

5. **Validate and calibrate.**
   `python scripts/validate_content.py content.json -v`
   Fix every ERROR. Read each WARN as a question to answer: an "unglossed new word" means a hidden
   difficulty (gloss it in `new`, replace it, or add it to the known list if the learner does know
   it); "too hard" means simplify; "little new to learn" means add the +1. The average should land
   in the 70-90% comprehension band. The word list is a heuristic, so judge the sentences yourself too.

6. **Build the page and the audio.**
   ```
   python scripts/build_page.py content.json            # writes index.html next to content.json
   python scripts/gen_audio.py content.json             # writes audio/*.mp3 (needs: pip install edge-tts)
   ```
   Open `index.html` once (browser pane) and answer two or three questions to confirm that
   feedback, new-word glosses and buttons work. Audio files only load over http(s) or from disk
   next to the page; in the preview pane the page falls back to the browser voice, which is expected.

7. **Deliver.** Follow `references/delivery.md`: publish as a private Artifact (page + audio in
   batches of at most 240 files) and also leave the folder on disk. In the reply give the link, the
   section list with question counts, anything that was skipped or guessed, and how to ask for
   changes (voice, difficulty, more questions).

8. **Close the loop.** After the learner has worked with the set (same or next session), update
   `profile/known_words.txt` with the target words they handled correctly and add a short dated
   line to `profile/learner.md` (topic done, weak spots such as "confuses in time / on time",
   preferences voiced). That is what makes the next set's "+1" a real step up instead of a repeat.
   If the skill folder is read-only, say so and give the lines to the user instead.

## Conventions that matter

- **Language split.** Exercise sentences and options in English; section notes, reasons, hints,
  translations and glosses in Vietnamese; page title and labels in Vietnamese. IPA is given when you
  list words in chat or in a spreadsheet, not inside the quiz.
- **Level.** Default B1-B2 (IELTS 5.0-5.5): sentences 8-20 words, everyday and work/study
  situations, no idioms beyond what the target teaches. Say in the reply if you chose a different level.
- **Accent.** Default voice `en-US-EmmaMultilingualNeural` (US). Change with `--voice` or
  `meta.voice` if the learner asks (e.g. `en-US-AndrewNeural` for a male voice).
- **Privacy.** Sentences are sent to Microsoft's speech service by edge-tts. Keep personal data
  (real names, addresses, account numbers) out of exercise sentences.
- **Accuracy over volume.** Every answer must be unambiguous. If two options could be correct,
  change the sentence or accept both in `acc`. A wrong key teaches the wrong thing, and the
  learner will trust the explanation.
- **Do not over-explain.** One short reason line per question; save longer teaching for the
  section `note`.

## Files in this skill

| Path | Use |
|---|---|
| `references/i-plus-one.md` | How to calibrate to i+1: ratios, context-clue techniques, recycling, adjusting after feedback |
| `references/question-design.md` | Item types, distractors, situation writing, explanation style, section sizes |
| `references/content-schema.md` | Exact `content.json` fields with an annotated example |
| `references/delivery.md` | Publishing steps, file limits, local use, changing the voice, troubleshooting |
| `scripts/validate_content.py` | Structure checks and the i+1 comprehension report |
| `scripts/build_page.py` | `content.json` -> single-file interactive page |
| `scripts/gen_audio.py` | `content.json` -> mp3 files (4 variants per question) |
| `scripts/publish_batches.py` | Splits the audio file list into Artifact-sized batches |
| `assets/template.html` | The page template (do not hand-edit generated pages; edit the content or the template) |
| `assets/examples/mini-i-plus-1.json` | Small set that shows every field, including `new` and `hint` |
| `assets/examples/prepositions-vocab-b1b2.json` | The original 118-question set (prepositions, savings, cooking, spices, compliance). Its words are already in `known_words.txt`, so the validator reports it as "little new to learn"; use it as a style reference, not as a calibration test |
| `profile/learner.md`, `profile/known_words.txt` | The learner's level, preferences and known-word list |

When the user asks for a change to an existing set, edit its `content.json` and rebuild; the audio
generator only creates files that are missing, so only changed questions are re-voiced
(delete the old mp3 of a question whose sentence changed).
