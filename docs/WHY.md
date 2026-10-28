# Why this structure and these choices

For each choice: what was decided, why, and what remains uncertain.

## 1. A single repository (app / server / tools / docs)

One `git clone`, one CI. The lesson format is shared by the app, the validator and the server: it changes in a single commit.

## 2. Capacitor + plain JavaScript, no build step

- **Decision**: the app is web (HTML/CSS/JS) inside an Android shell (Capacitor). `app/www/` *is* the app: no bundler, no framework, ES modules loaded directly.
- **Why**: (1) standard web technologies, minimal learning curve; (2) iteration in seconds in a browser (`node tools/serve.mjs`), with no Android SDK and no CI wait; (3) hybrid approach: web for the screen, native only where needed (Capacitor plugins, Kotlin if required); (4) the logic (pack merging, learner, matching, WAV) is plain JS tested in Node, and **the same `merge.js` file serves the app and the validator**.
- **Rejected**: Flutter (Dart plus a full SDK for every iteration, no lightweight local preview); native Kotlin (heavy for a small team).
- **Uncertain**: (a) canvas smoothness in the WebView of an entry-level phone; (b) `getUserMedia` inside the Android WebView (the microphone permission goes through Capacitor); (c) the Java version Capacitor needs: Capacitor 6 + Java 17 are used, adjust in `ci.yml` if the CI asks.
- If the app grows, a bundler (Vite) can be added without touching the packs or the server.

## 3. Lessons are data, not code (the core of the structure)

- **One pack per language** (`app/www/packs/<id>/`): manifest, glyphs, lessons, audio, images. Adding a language means adding a folder; the app is not modified.
- **A lesson is a list of typed steps** (`watch_write`, `trace_letter`, `listen_tap`, `say_word`). `core/registry.js` maps `type -> function`. A new lesson format is one file in `steps/` plus one registry line. The AI builds lessons by producing this same JSON.
- **Unknown type = skipped**, no crash: an older app version can read a newer pack. The manifest carries a `schema` number for breaking changes.
- **Each step declares what it practises** (`items`): this lets the learner model bring back what was missed.
- **Each language carries its own spoken prompts** (`prompts`), including `language_pick` ("for French, tap here"). The language screen makes them speak in turn; the active tile blinks; tapping chooses.
- **Several packs per language**: 1 base + merged addons (see `LESSON_FORMAT.md`). Adding content to an existing language touches neither the base nor the app; the same merge will serve AI-made lessons.
- **Transcription matching rules live in the pack** (`matching`): they depend on the language, not on the app.
- **Letter strokes are separate** (`glyphs.json`), per form (`i:lower_script`): cursive, script, upper and lower case without changing the format.
- **Rejected**: lessons written as code (each lesson would need a new app version); a database (too heavy for files meant to be read, shared phone to phone and versioned in git).

## 4. Order of the first screens: start -> language -> adult/child -> path

Language comes first because the prompts of the adult/child screen are spoken in the chosen language (they come from the pack). This sequence only happens at first launch; afterwards the app goes straight to the path (an icon at the top right restarts the setup). The "start" screen (one big button) also unlocks sound, which browsers refuse before a first gesture.

## 5. The learner model: separate, plain JS (`core/learner.js`)

Leitner boxes: miss -> comes back right away; success -> spaced out. No account, on the device (localStorage), one model **per language**, shared by all the packs of that language. **Uncertain**: the intervals (10 min, 1 day, 3 days, 7 days) are starting values; with 2-3 minute sessions a "per session" approach will probably be needed. The model already records results but does **not yet drive** the order of steps.

## 6. Boundaries with the outside world

`speaker`, `recorder` and `transcriber` (in `core/`) are the only files that touch voice, microphone and network. Transcription returns `null` when unavailable: the `say_word` step shows an icon and moves on without counting; `listen_tap` remains plan B. The microphone records WebM, then converts to mono 16-bit 16 kHz WAV, the format Meta accepts for files (`API_META.md`).

## 7. The server: tiny, dependency-free, watertight

- Single role: hold the Meta key and expose `/v1/transcribe` and `/v1/lesson-from-photo`. The app never talks to Meta.
- **Zero dependencies (plain Node)**: lightweight environments (mobile terminals for example) often fail to build native-code packages; with no dependency, `node` alone is enough.
- **Privacy**: audio stays in memory for the duration of the request, never on disk; logs never contain request contents.
- **Guardrails**: 5 MB maximum, token, rate limit, WAV format check. The token is readable inside the app: fine for a demo, not for wide distribution.
- **CORS** is enabled because the app does not share the server's origin. The server must use **HTTPS**: the Android WebView runs at `https://localhost` and refuses to call `http://`.
- One file talks to Meta (`src/providers/meta.js`), with flagged assumptions (`API_META.md`).

## 8. Pack distribution is separate from the AI server

Packs are static files: publishable (GitHub Pages/Releases) or copyable from phone to phone, with no server to maintain. The server only serves what needs AI. Today packs are bundled in the APK; download and sharing are the logical next step.

## 9. The pack validator

A learner who cannot read cannot report a broken lesson, so errors are caught upstream: missing glyph, correct answer absent from the choices, audio not found, lesson listed but missing, merge conflicts. Zero dependencies; tested on valid and broken packs.

## 10. APK built by GitHub Actions

The CI: validate packs -> test server and app -> generate the Android project (`cap add android`) -> declare the microphone -> build a debug APK (installable, signed with the debug key). **Uncertain**: the first build may fail (Java/Gradle versions); the log will show why.

## 11. Text-free interface

Everything goes through big tiles with an icon (built-in SVG: nothing to load offline), one action per screen, voice as the guide. The words displayed in `listen_tap` and `say_word` are learning content, not interface.

## 12. What is deliberately empty

Audio files, tracing validation (the check mark always validates), offline Swahili voice (to be tested), learner-driven lesson order, pack download/sharing, multiple profiles, Android back button. The glyphs `i` and `l` are **examples**.
