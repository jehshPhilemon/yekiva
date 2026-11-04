# Yekiva

An offline Android literacy app: learn to read and write through voice, images and gestures, without needing to read. Lessons are **data packs**; AI (Meta models, through a small server) is used to build lessons and to check spoken answers.

**Tech: Capacitor + plain JavaScript, no build step.** The `app/www/` folder *is* the app: the code you edit is the code that runs.
Android package id: `com.jehshphilemon.yekiva`.

> Status: **v1 — version initiale (premier commit)**. Screens, pack merging, tracing, "listen and tap" and "say the word" are written. The UI has not been tried on a real device yet (see `docs/OPEN_QUESTIONS.md`).

## Layout

```
app/www/          The app (HTML/CSS/JS): index.html, js/ (core, screens, steps, ui), packs/ (lessons)
app/test/         Logic tests (Node, no browser)
app/capacitor.config.json, app/package.json   Android shell (Capacitor)
server/           Zero-dependency Node server: holds the Meta API key
tools/            serve.mjs, validate-packs.mjs, probe-meta.mjs, patch-android.mjs
docs/             WHY.md, LESSON_FORMAT.md, API_META.md, OPEN_QUESTIONS.md
.github/          CI: validate, test, build the APK
```

## Development

Requirements: Node 20+ and git. No Android SDK is needed to develop.

```sh
node tools/serve.mjs            # serves app/www at http://localhost:8080
node tools/validate-packs.mjs   # validates (and merges) the lesson packs
npm test --prefix app           # app logic tests
npm test --prefix server        # server tests
```

`localhost` is a secure context, so the microphone (`getUserMedia`) works there without HTTPS.
The browser preview uses a same-origin development proxy (`tools/serve.mjs`); there is no server-URL field or learner-editable URL. For an Android build, bake the server address in with `node tools/build-config.mjs --api https://YOUR-SERVER`.

## APK

The APK is built by GitHub Actions, not locally. After a push: **Actions** tab -> latest `ci` run -> **yekiva-apk** artifact (installable once "unknown sources" is allowed). On the first build the CI generates `app/android/`; once the build is green, commit that folder.

## Add a language

1. Copy `app/www/packs/fr/` to `app/www/packs/<code>/`; adapt `manifest.json` (including `prompts.language_pick`), `glyphs.json`, `lessons/`.
2. Add the id to `app/www/packs/index.json`.
3. Run `node tools/validate-packs.mjs`.

No code to change.

## Add content to an existing language

Create an `addon` pack (see `app/www/packs/sw-famille/`) with the same `language`: it is merged into the language's path. See `docs/LESSON_FORMAT.md`. `node tools/validate-packs.mjs --show` prints the merged path of each language.

## Server

```sh
cp .env.example server/.env   # fill in; never commit
cd server && node --env-file=.env src/index.js
```

Meta MMS-TTS runs locally on the server at request time. On a CPU VPS, install the runtime once and start the server with its virtual environment first in `PATH`:

```sh
python3 -m venv "$HOME/yekiva-mms-tts"
"$HOME/yekiva-mms-tts/bin/python" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
"$HOME/yekiva-mms-tts/bin/python" -m pip install transformers
sudo apt install ffmpeg
cd server && PATH="$HOME/yekiva-mms-tts/bin:$PATH" node --env-file=.env src/index.js
```

The French and Swahili Meta MMS-TTS weights download on first synthesis and each MP3 is generated on demand. `META_API_KEY` is needed for Muse transcription, photo interpretation and Spark lesson generation—not for MMS-TTS. Read `docs/API_META.md` before wiring the key; `node tools/probe-meta.mjs` checks the hosted Meta API.
