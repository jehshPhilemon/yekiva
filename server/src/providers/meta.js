// The only file that talks to Meta. The rest of the server only knows these two functions.
//
// Documented (Meta Model API documentation relayed by third parties, read 2026-10-27):
//   - base https://api.meta.ai/v1, authentication "Authorization: Bearer <key>"
//   - file transcription: POST /asr/transcribe, multipart, mono 16-bit WAV at 16/24 kHz, <= 10 min / 32 MB
//   - audio model: muse-voice-transcribe-1.0; text+image model: muse-spark-1.x
//   - OpenAI / Anthropic compatible API for Muse Spark (/chat/completions, /responses, /messages)
// Confirmed by the live API (probe, 2026-10-28):
//   - the multipart body needs TWO parts: "request" (JSON) and "audio" (the WAV file)
// NOT verified (check with tools/probe-meta.mjs before relying on it):
//   - the keys accepted inside the "request" JSON (in particular how to hint the language)
//   - the exact shape of the transcription response
//   - whether "sw" (Swahili) is accepted: it is NOT among the 25 evaluated languages
//   - the exact Spark model name to use (env META_SPARK_MODEL)
import { buildLesson, parseModelJson } from "../lesson.js";

export class NotImplementedYet extends Error {}

const BASE = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";

function key() {
  const k = process.env.META_API_KEY;
  if (!k) throw new NotImplementedYet("META_API_KEY is missing: Meta provider not configured");
  return k;
}

/**
 * Builds the JSON of the "request" part.
 * Optional env knobs, until the real schema is confirmed:
 *   META_ASR_REQUEST     extra JSON merged into the request, e.g. '{"vocabulary_bias":["mama"]}'
 *   META_ASR_LANG_FIELD  name of the field that receives the language code, e.g. "language"
 */
export function buildAsrRequest(lang, env = process.env) {
  const request = { model: "muse-voice-transcribe-1.0" };
  if (env.META_ASR_REQUEST) Object.assign(request, JSON.parse(env.META_ASR_REQUEST));
  if (lang && env.META_ASR_LANG_FIELD) request[env.META_ASR_LANG_FIELD] = lang;
  return request;
}

/** @param {Buffer} audio already-validated WAV  @returns {Promise<{text: string}>} */
export async function transcribe(audio, { lang } = {}) {
  const apiKey = key();
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(buildAsrRequest(lang))], { type: "application/json" }));
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  const res = await fetch(`${BASE}/asr/transcribe`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form });
  if (!res.ok) throw Object.assign(new Error(`Meta answered ${res.status}`), { status: 502 });
  const data = await res.json();
  // Response shape not verified: try the plausible shapes.
  const text = data.text ?? data.transcript ?? data.turns?.map((t) => t.text).join(" ");
  if (typeof text !== "string") throw Object.assign(new Error("unexpected transcription response"), { status: 502 });
  return { text };
}

const VISION_PROMPT =
  "In this photo, find the most legible written word. Answer ONLY with JSON: " +
  '{"word": "...", "syllables": ["..."], "language": "ISO 639-1 code"}. ' +
  "Split the word into syllables as they are pronounced. If no word is legible, answer {}.";

/** @param {Buffer} image  @returns {Promise<object>} a lesson in the docs/LESSON_FORMAT.md format */
export async function lessonFromPhoto(image, { contentType, lang } = {}) {
  const apiKey = key();
  const dataUrl = `data:${contentType};base64,${image.toString("base64")}`;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.META_SPARK_MODEL ?? "muse-spark-1.1",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT + (lang ? ` The expected language is "${lang}".` : "") },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw Object.assign(new Error(`Meta answered ${res.status}`), { status: 502 });
  const data = await res.json();
  const spark = parseModelJson(data.choices?.[0]?.message?.content ?? "");
  if (!spark.word) throw Object.assign(new Error("no legible word in the photo"), { status: 422 });
  return buildLesson({ ...spark, language: spark.language ?? lang });
}
