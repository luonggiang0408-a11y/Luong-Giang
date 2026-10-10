# content.json schema

One file describes the whole set. `scripts/validate_content.py` checks it; `build_page.py` and
`gen_audio.py` consume it. A complete small example is `assets/examples/mini-i-plus-1.json`;
a 118-question one is `assets/examples/prepositions-vocab-b1b2.json`.

```jsonc
{
  "meta": {
    "title": "Giới Từ & Từ Vựng",          // <title> and browser tab; a short name, not a sentence
    "eyebrow": "Trình độ B1 – B2 · ...",     // small label above the heading
    "h1": "Giới từ & Từ vựng",               // page heading
    "lead": "One or two sentences telling the learner how the set works.",
    "storageKey": "gioi-tu-tu-vung-v1",      // unique per set; progress is saved under this key
    "voice": "en-US-EmmaMultilingualNeural",  // optional; edge-tts voice for gen_audio.py (learner's chosen voice)
    "audioVersion": "emma1"                   // optional; bump when audio is regenerated so browsers drop cached mp3s
  },
  "sections": [
    {
      "id": "s1",                             // s1, s2, ... must be unique; also used in audio file names
      "title": "Thời gian & nơi chốn",        // tab label
      "note": "<b>at</b> = giờ · <b>on</b> = ngày ...",   // recap shown above the questions (HTML: b, i)
      "targets": ["commuter", "platform"],    // optional: words that are new on purpose in this section (validator only)
      "qs": [ /* questions, see below */ ]
    }
  ]
}
```

## Question: multiple choice (`mc`)

```json
{
  "type": "mc",
  "ctx": "Ticket office",
  "s": "The bus ___ went up by ten percent, so Tom now pays more every month.",
  "o": ["fare", "delay", "platform"],
  "a": "fare",
  "vi": "Giá vé xe buýt tăng mười phần trăm nên mỗi tháng Tom trả nhiều hơn.",
  "why": "fare = tiền vé đi xe, tàu, máy bay.",
  "new": [{"w": "percent", "vi": "phần trăm"}],
  "hint": "Tom trả nhiều hơn mỗi tháng. Điều gì của xe buýt đã tăng?"
}
```

## Question: type-in (`tx`)

```json
{
  "type": "tx",
  "ctx": "Planning a holiday",
  "s": "We're thinking ___ renting a car in Italy.",
  "acc": ["of", "about"],
  "vi": "Chúng tôi đang nghĩ đến chuyện thuê xe ở Ý.",
  "why": "think of / about + V-ing = dự định, cân nhắc."
}
```

## Fields

| Field | Required | Meaning |
|---|---|---|
| `type` | yes | `mc` or `tx` |
| `ctx` | yes | Scene label in English (2-4 words). Part of the English input, so keep it in the learner's i+1 band |
| `s` | yes | The sentence with exactly one `___` for the blank. A sentence with no blank is allowed only with `"noblank": true` (e.g. "Which sentence is correct?" with sentence options) |
| `o` | `mc` | 2-4 distinct options; must contain `a` |
| `a` | `mc` | The correct option (exact text) |
| `acc` | `tx` | Accepted answers; the first is displayed as the key. Case, spaces, a final full stop and hyphen/space are ignored when matching |
| `vi` | yes | Vietnamese translation of the whole sentence |
| `why` | yes | One-line Vietnamese reason / rule |
| `new` | no | `[{"w": word, "vi": gloss}]` for supporting new words; shown only after answering |
| `hint` | no | Vietnamese nudge, shown on request before answering |
| `say` | no | Text for the voice to read instead of `s` (use `___` for the blank). For awkward numbers, abbreviations, names |
| `noblank` | no | `true` if the question has no `___` |

## Audio naming (generated, do not write by hand)

`audio/<sectionId>q<index>_<variant>.mp3` with index starting at 1 within the section and
variant `b` (blank, normal), `f` (full, normal), `sb` (blank, slow), `s` (full, slow). Reordering or
inserting questions changes the index, so regenerate (delete the section's old mp3 first) after
structural edits.

## Rules the validator enforces

- every section has `id`, `title`, `note`; section ids unique;
- every question has `type`, `ctx`, `s`, `vi`, `why`; `mc` has `o` (distinct) and `a` in `o`;
  `tx` has at least one accepted answer; no more than one blank;
- each `new` item has `w` and `vi`;
- warnings for long sentences, duplicates, words that are neither known nor glossed, and
  comprehension outside the target band.
