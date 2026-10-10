# Delivering the set

## Folder layout

```
<working folder>/              e.g. D:\Hoc hanh\Ielts\Giao-trinh-Unit-26\
├── content.json               the source of truth
├── index.html                 built page (or a more descriptive name, e.g. Bai_tap_<topic>.html)
├── audio/                     mp3 files from gen_audio.py (keep the folder name `audio`)
└── batch_1.json, batch_2.json (file lists for publishing; can be deleted afterwards)
```

The page loads `audio/<id>_<variant>.mp3` by relative path, so the HTML and the `audio` folder
must stay side by side - when published and when opened from disk.

## Publish as an Artifact (private link)

1. Build: `build_page.py`, `gen_audio.py` (see SKILL.md). Check `index.html` once.
2. `python scripts/publish_batches.py content.json` writes `batch_N.json` (<= 240 files each).
   The Artifact tool takes at most 255 files per publish and 511 per version.
3. First call the Artifact tool's `quickstart` once for this conversation (intent `other`,
   `design_systems: false`); the page is already designed, so there is nothing to redesign.
4. Publish from the folder that contains `audio/` (the working directory must be that folder or a
   parent of it, because `files` paths are relative to the working directory):
   - `file_path`: the HTML, `icon`: `quiz`, `description`: one sentence, `files`: the contents of `batch_1.json`
   - then publish the same `file_path` again with `files` = `batch_2.json`, and so on. Each later publish
     adds to what is already there.
5. Verify with `Artifact action: list, scope: files` that the file count matches
   (audio files + `index.html`).
6. Tell the user the link is private (only they can open it; sharing is done from the page's Share menu).

To update an existing set later, publish the same `file_path` (same URL) - or pass the artifact
`url` when it was created in another conversation. Files that are not re-sent are kept.

If the set is larger than ~125 questions (4 variants each), generate fewer variants:
`gen_audio.py --variants b,f` and `publish_batches.py --variants b,f`. The page falls back to the
browser voice for the slow buttons when those files are missing.

## Use offline / from disk

Open `index.html` directly in a browser with `audio/` next to it. Progress is stored in the
browser (`localStorage`), per browser and per page address.

## Voice

- Default `en-US-EmmaMultilingualNeural` (US, female, natural). Alternatives in the US:
  `en-US-AndrewMultilingualNeural`, `en-US-BrianMultilingualNeural` (male), `en-US-EmmaMultilingualNeural`, `en-US-JennyNeural`.
  List all: `python -c "import asyncio,edge_tts;print([v['ShortName'] for v in asyncio.run(edge_tts.list_voices()) if v['Locale']=='en-US'])"`.
- To change: delete `audio/` (or the mp3s) and re-run `gen_audio.py --voice <name>`; existing files are
  never overwritten.
- If a word is read badly, set `say` on that question and regenerate its files.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `edge-tts is not installed` | `python -m pip install edge-tts` |
| `gen_audio.py` reports FAILED files | Network blocked or rate-limited: re-run, it only retries the missing files |
| No sound on the published page | Check the audio files are in the artifact (`list files`); the page then falls back to the browser voice, and if neither plays, check the browser's autoplay/volume settings |
| Slow buttons silent | Slow variants not generated or not published |
| A `tx` answer marked wrong although it is fine | Add the variant to `acc` |
| Progress from an older version of the set shows odd results | Change `meta.storageKey` when questions are reordered |
| Console error `Unexpected token` after editing the template | A stray `</script>` or backslash in the content; rebuild with `build_page.py`, which escapes `</` |

## What to say in the reply

Keep it short: the link; the sections with question counts; what was left out or guessed;
one line on how the audio works (Listen / slow / Pause; blank read as "blank" before answering);
a note that the sentences were sent to Microsoft's speech service to make the audio. Offer one
concrete next step (a harder second pass, another voice, a spreadsheet of the vocabulary).
