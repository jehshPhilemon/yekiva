# Meta API: what is known, what is not

Sources: Meta Model API documentation **relayed by third parties** (LiteLLM, OrcaRouter article of 2026-09-29), read 2026-10-27, plus a **live probe** on 2026-10-28. The official documentation (dev.meta.ai) could not be consulted directly; anything not marked "confirmed" is to be checked with `tools/probe-meta.mjs` and a key.

## Confirmed by a live probe (2026-10-28)

- `POST https://api.meta.ai/v1/asr/transcribe` exists and the key is accepted (the call reached request validation, HTTP 400).
- The multipart body needs **two parts**: `request` (JSON) and `audio` (the WAV file). A `file` part is not accepted.
  Error returned: `Both a 'request' and an 'audio' part are required`.
- Still unknown: which keys the `request` JSON accepts (model? language hint? vocabulary bias?). Error messages from the API are informative (`param`, `message`), so probing with different `request` JSON reveals the schema step by step.

## Documented (second-hand)

- Base: `https://api.meta.ai/v1`, authentication `Authorization: Bearer <key>`.
- **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`):
  - file: `POST /asr/transcribe`, multipart, **mono 16-bit WAV at 16 or 24 kHz only**, <= 10 min and 32 MB;
  - real time: WebSocket `wss://api.meta.ai/v1/asr/realtime` (authentication in the first frame, not in a header);
  - announced price: $0.18 per hour of audio (about $0.00005 for a 1 s word);
  - **25 "evaluated" languages** with code-switching: Arabic, Bengali, Dutch, English, French, German, Hebrew, Hindi, Indonesian, Italian, Japanese, Kannada, Korean, Malay, Mandarin, Marathi, Polish, Portuguese, Spanish, Tagalog, Tamil, Telugu, Thai, Turkish, Vietnamese. Trained on "70+ languages" but only these 25 are verified by Meta;
  - no confidence score; timestamps per turn, not per word;
  - the "language bias" is a list of languages, it forces nothing.
- **Muse Spark** (`muse-spark-1.x`): text, image, video, PDF in; text out; OpenAI-compatible (`/chat/completions`, `/responses`) and Anthropic-compatible (`/messages`) API.
- A tutorial shows a different path (`/muse-voice/transcribe` with a `file` part); the live probe showed `/asr/transcribe` is the real one.

## What this changes for Yekiva

1. **Swahili and Lingala are not among the 25 verified languages.** A first project test (a long sentence mixing Swahili, Lingala, French and English) was encouraging, but a single word said by a beginner is a different test: this is hypothesis #1 to measure (20 words per language). Whether the language hint accepts `sw` is unknown.
2. **The WAV must be mono 16-bit at 16 or 24 kHz.** The app builds it itself (`core/recorder.js` + `core/wav.js`, tested); the server checks the header and answers `422` with the reason. No `ffmpeg` needed.
3. **No confidence score**: the "well done / once more" decision relies only on text comparison (the pack's `matching`).
4. **Privacy**: the documentation mentions "zero retention" processing at the same price as standard. How to enable it for the project's key remains to be confirmed.
5. **Muse Spark for the photo**: the model only produces "word + syllables"; the project code (`server/src/lesson.js`) builds the lesson so that it stays valid. Syllable splitting in Swahili/Lingala must still be checked by hand.

## Not verified (assumptions in `server/src/providers/meta.js`)

- keys accepted inside the `request` JSON, notably the language hint (the server reads env `META_ASR_LANG_FIELD` and `META_ASR_REQUEST` until it is known);
- the shape of the transcription response;
- the exact Spark model name (env `META_SPARK_MODEL`, default `muse-spark-1.1`);
- rate limits (Meta's pricing and limits page was unreachable for the third party).

## Probing (10 minutes, with a key in `server/.env`)

```sh
node tools/probe-meta.mjs make-wav silence.wav
node tools/probe-meta.mjs asr silence.wav
node tools/probe-meta.mjs asr silence.wav '{"model":"muse-voice-transcribe-1.0","language":"sw"}'
node tools/probe-meta.mjs spark photo.jpg
```

The raw answers make it possible to adjust `meta.js` accordingly.

## The two APIs of Yekiva (do not mix them up)

| API | Called by | Role |
|---|---|---|
| **Yekiva API** (`server/`): `POST /v1/speak`, `POST /v1/transcribe`, `POST /v1/lesson-from-photo` | the app | voice + the only door to Meta; holds the key |
| **Meta Model API** | the server only | transcription, vision (NO text-to-speech endpoint exists) |

## Natural voice (runtime, in-app generation)

- Meta's Model API has **no TTS endpoint** (verified 2026-10-28 on dev.meta.ai/docs/models:
  Muse Voice Transcribe = speech-to-text only, "does not synthesize speech").
- So `POST /v1/speak { text, lang? } -> audio/wav` is served by a neural TTS engine
  (Piper, open-source) running ON the Yekiva server, per request, per language
  (`fr_FR-upmc-medium`, `sw_CD-lanfrica-medium`; override with `YEKIVA_VOICES`).
- Nothing is pre-generated at build time: packs carry text only. The app caches each
  utterance on-device (IndexedDB) after the first play, for offline replay.
- Server setup: `pip install piper-tts` once; voices download automatically on first use.
- Without the engine: the server answers `501` and the app falls back to the phone voice.

Later, to distribute packs: a plain `index.json` file published (GitHub Pages / Releases) listing packs, versions and hashes; the app downloads what changed when there is a connection. No application server needed for that.
