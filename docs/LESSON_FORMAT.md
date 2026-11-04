# Lesson pack format (schema 1)

```
app/www/packs/
  index.json                 { "packs": ["fr", "sw", "sw-famille", "ln"] }
  <id>/
    manifest.json
    glyphs.json              (optional)
    lessons/<lesson-id>.json
    audio/...                (optional)
    images/...               (optional)
```

## Several packs for one language (base + addons)

A **language** = 1 `base` pack + any number of `addon` packs, all sharing the same `language`. The app **merges** them: the learner sees one language and one path.

- **base** (`"role": "base"`, or no role): carries what belongs to the language: `prompts`, `matching`, `ui`, and the starting glyphs.
- **addon** (`"role": "addon"`): adds lessons (and optionally glyphs). It **cannot** define `prompts`, `matching` or `ui`.
- Lesson ids are **unique across the whole language**; each lesson is read from the folder of its own pack.
- Where an addon's lessons go: at the end of the path, or right after the lesson named in `after.<adult|child>`. With several addons: sorted by `order` (default 100), then by id.
- Glyphs are added together; the same key defined twice differently is an error.
- `items` (letters, syllables) are per language: what the learner practised in one pack also counts in the other packs of that language.
- A lesson made by the AI from a photo becomes a local addon, merged the same way.

Example: `sw-famille` (addon) adds `mama-baba` right after `syllables-ma` of the `sw` pack.
`node tools/validate-packs.mjs --show` prints the merged path of each language.

## manifest.json

| field | role |
|---|---|
| `schema` | format version (1) |
| `id` | = folder name |
| `language` | language code (`fr`, `sw`, `ln`, `en`...) |
| `role` | `base` (default) or `addon` |
| `version` | content version, to bump on each change |
| `name` | short language name shown on the language tile |
| `ui.color` | colour of the language tile (the learner does not read) |
| `prompts` | spoken prompts **in the pack's own language** (see below) |
| `glyphs` | file holding the letter strokes |
| `matching` | transcription matching rules: `stripAccents`, `ignoreCase`, `maxEdits` |
| `tracks.adult` / `tracks.child` | lesson ids in path order (a lesson can be in both) |
| `order`, `after` | addons only: sorting and insertion point |

### prompts (required in a base pack: `language_pick`)

```json
"prompts": {
  "language_pick":  { "text": "Pour le français, appuie ici" },
  "audience_adult": { "text": "Je suis un adulte" },
  "audience_child": { "text": "Je suis un enfant" },
  "lesson_intro":   { "text": "Écoute bien, puis fais comme moi" },
  "lesson_done":    { "text": "Bravo, tu as fini" },
  "path_hint":      { "text": "Choisis une leçon" },
  "photo_hint":     { "text": "Photographie un mot" },
  "server_hint":    { "text": "La voix arrive quand le serveur répond" },
  "trace_hint":     { "text": "Encore une fois, suis les pointillés" },
  "listen_hint":    { "text": "Écoute encore, puis touche" },
  "say_hint":       { "text": "Répète encore une fois" }
}
```

- `language_pick`: what **this language says about itself** on the choice screen. The app makes every installed language speak in turn (its tile blinks); the learner taps when they recognise their own. Each pack therefore carries its own prompt: adding a language needs no change in the app.
- Each prompt is TEXT ONLY. The natural voice is generated at RUNTIME inside the app:
  the app sends the text to the Yekiva server (`POST /v1/speak`), the server synthesizes
  it with self-hosted Meta MMS-TTS and returns audio; the app caches it on-device (IndexedDB)
  for offline replay. Meta's hosted Model API has no TTS endpoint; the voice model itself
  remains Meta and runs on the Yekiva server.
- `audience_*` and other prompts (congratulations, "once more"...) follow the same model and can be added without changing the format.
- Narration rule: EVERY screen and step speaks through these prompts (`core/narrate.js`).
  `lesson_done` frames completion; `lesson_intro` is used only when the first step has no spoken instruction, so a lesson with its own prompt renders immediately. `path_hint`/`photo_hint`/`server_hint`
  announce the screens, `trace_hint`/`listen_hint`/`say_hint` encourage after a miss
  (fallback: the step's own `say`). Missing key = silence, never hardcoded text.
- The Swahili sample texts are provisional: have a native speaker review them.

## lessons/<id>.json

```json
{
  "id": "syllables-li",
  "steps": [
    { "type": "listen_tap", "items": ["li"], "params": { "...": "..." } }
  ]
}
```

- `type`: selects the widget. Unknown to the app -> the step is skipped.
- `items`: what the step practises; feeds the learner model.
- `params`: free-form depending on the type.
- Optional lesson metadata: `title`, `symbol`, and `icon` label the lesson on the visual path.
- Optional `params.context`: `{ "letter": "A", "word": "avion", "icon": "plane" }` connects the sound/letter to a familiar word with an offline vector symbol; it does not require a raster image.

## Current step types

**`watch_write`**: the letter animates stroke by stroke.
`params`: `glyph` (key in glyphs.json), `say` (`{text, audio?}`), `durationMs` (speed), optional `context`.

**`trace_letter`**: dotted letter to trace with the finger.
`params`: `glyph`, `say`, optional `context`. Validation checks at least 55% path coverage per stroke, expected stroke order, and drawing direction.

**`say_word`**: say the word while holding the microphone; transcribed by the server, then compared with tolerance.
`params`: `word` (required), `say` (`{text, audio?}`), optional `context`, and `image` (path inside the pack, optional).
Without network or server: the step shows an icon and moves on without counting.

**`listen_tap`**: the app speaks, the learner taps.
`params`: `say`, `choices` (`[{id, text, image?}]`, at least 2), `answer` (id of a choice),
`image` (optional): a picture shown above the choices (what to recognize); `context` (optional) provides an offline word/letter association cue.
Each choice may carry its own `image` (picture + word shown together).

## Planned types (not implemented yet)

`read_world` (lesson built from a photo) · `write_dictation` · `match_forms` (find the letter among its forms).

## Images

Lesson words get ONE cartoon illustration each, generated with Meta Muse Image
(`POST /v1/images/generations`, flat $0.01/image) and stored in the pack:
`images/<word>.png`. Style is FIXED for all words (flat cartoon, single object,
white background, no text) so every lesson looks coherent — simple drawings are
recognized faster than photos by pre-readers.
- Generate: `node tools/illustrate-pack.mjs <pack> [--dry] [--word w] [--hint w=hint]`
  (needs the Yekiva server running with META_API_KEY, or --direct). Only `say_word`
  steps with 3+ letters are illustrated: syllables ("ma", "li") have nothing to draw.
- Wire: the tool saves the PNG and writes the `image` field into the steps.
- Validate: the validator rejects any `image` path missing from the pack folder.
- Offline: images ship inside the pack — no network needed to display them.

## glyphs.json

```json
{ "i:lower_script": [ [[0.5,0.38],[0.5,0.85]], [[0.5,0.18],[0.5,0.19]] ] }
```

Key = `letter:form` (planned forms: `lower_script`, `upper_script`, `lower_cursive`, `upper_cursive`). Value = list of strokes; each stroke = list of `[x, y]` points between 0 and 1, in writing order. **The provided glyphs are examples.**

## Audio

Voice is generated at runtime, never shipped in packs. `say` = `{ text }`; any legacy
`audio` path in old packs is ignored by the app and rejected by the validator.
Flow: `say.text` -> `POST {yekiva}/v1/speak` -> neural voice per language ->
played + cached on-device (IndexedDB) -> replayed offline. Phone speech synthesis
is the last resort only (offline, robotic).

## Adding a new step type

1. Write `app/www/js/steps/xxx.js`: a function `(ctx) => DOM element` (`ctx.step`, `ctx.language`, `ctx.services`, `ctx.speak(say)`, `ctx.assetUrl(path)`, `ctx.onDone(success)`).
2. Register it in `app/www/js/core/registry.js`.
3. Add `xxx` to `KNOWN_STEPS` in `tools/validate-packs.mjs` (and its checks).
4. Document its `params` here.
 The Swahili sample texts are provisional: have a native speaker review them.
 The Lingala pack (`ln`) was machine-translated from French with Meta NLLB-200
 (nllb-200-distilled-600M, self-hosted): prompts + lessons mirror the Swahili pack.
 MUST be reviewed by a Lingala speaker before release. Voice: no Meta TTS model
 exists for Lingala yet — the server falls back to the French MMS voice.
 Offline: images ship inside the pack — no network needed to display them.

## Generating lessons with Muse Spark

New lessons are generated from ONE word, but the model only proposes CONTENT
(word + syllables): OUR `buildLesson` builds the steps and OUR validator checks
the result. Command: `node tools/generate-lesson.mjs <pack> <word> [--dry]`
(needs the Yekiva server with META_API_KEY, or --direct). The lesson is saved,
wired into the pack track, then validated — refused and removed if invalid.
Server route: `POST /v1/generate-lesson { word, lang? }` (offline tooling only,
never called by the app). After generating, illustrate: `node tools/illustrate-pack.mjs <pack> --word <word>`.
