// The only file that talks to Meta. The rest of the server only knows these two functions.
//
// Documented (Meta Model API documentation relayed by third parties, read 2026-10-27):
//   - base https://api.meta.ai/v1, authentication "Authorization: Bearer <key>"
//   - file transcription: POST /asr/transcribe, multipart, mono 16-bit WAV at 16/24 kHz, <= 10 min / 32 MB
//   - audio model: muse-voice-transcribe-1.0; text+image model: muse-spark-1.x
//   - OpenAI / Anthropic compatible API for Muse Spark (/chat/completions, /responses, /messages)
// Confirmed by the live API (probe, 2026-10-28):
//   - the multipart body needs TWO parts: "request" (JSON) and "audio" (the WAV file)
// Check with tools/probe-meta.mjs before relying on unverified parts:
//   - the keys accepted inside the "request" JSON (language hint via META_ASR_LANG_FIELD)
//   - the exact shape of the transcription response (several shapes tried below)
//   - whether "sw" (Swahili) is accepted: NOT among the 25 evaluated languages
//   - the exact Spark model name (env META_SPARK_MODEL)
import { buildLesson, parseModelJson } from "../lesson.js";

export class NotImplementedYet extends Error {}

const BASE = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
const TIMEOUT_MS = Number(process.env.META_TIMEOUT_MS ?? 60000);

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
 *   META_ASR_MODEL       override the model name (default muse-voice-transcribe-1.0)
 */
export function buildAsrRequest(lang, env = process.env) {
  const request = { model: env.META_ASR_MODEL ?? "muse-voice-transcribe-1.0" };
  if (env.META_ASR_REQUEST) Object.assign(request, JSON.parse(env.META_ASR_REQUEST));
  if (lang && env.META_ASR_LANG_FIELD) request[env.META_ASR_LANG_FIELD] = lang;
  return request;
}

async function metaFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("Meta timeout")), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Extracts text from the plausible transcription response shapes. */
export function extractTranscript(data) {
  if (typeof data?.text === "string") return data.text;
  if (typeof data?.transcript === "string") return data.transcript;
  if (typeof data?.transcription === "string") return data.transcription;
  const turns = data?.turns ?? data?.segments;
  if (Array.isArray(turns)) {
    const joined = turns.map((x) => (typeof x === "string" ? x : x?.text)).filter((x) => typeof x === "string").join(" ").trim();
    if (joined) return joined;
  }
  const choices = data?.choices;
  if (Array.isArray(choices)) {
    const c = choices[0]?.message?.content ?? choices[0]?.text;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/** @param {Buffer} audio already-validated WAV  @returns {Promise<{text: string}>} */
export async function transcribe(audio, { lang } = {}) {
  const apiKey = key();
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(buildAsrRequest(lang))], { type: "application/json" }));
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  let res;
  try {
    res = await metaFetch(`${BASE}/asr/transcribe`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form });
  } catch (e) {
    throw Object.assign(new Error(`Meta unreachable: ${e?.message ?? e}`), { status: 502 });
  }
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 300)).catch(() => "");
    throw Object.assign(new Error(`Meta answered ${res.status}${body ? `: ${body}` : ""}`), { status: 502 });
  }
  const data = await res.json().catch(() => null);
  const text = extractTranscript(data);
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
  let res;
  try {
    res = await metaFetch(`${BASE}/chat/completions`, {
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
  } catch (e) {
    throw Object.assign(new Error(`Meta unreachable: ${e?.message ?? e}`), { status: 502 });
  }
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 300)).catch(() => "");
    throw Object.assign(new Error(`Meta answered ${res.status}${body ? `: ${body}` : ""}`), { status: 502 });
  }
  const data = await res.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content ?? data?.output_text ?? "";
  let spark;
  try {
    spark = parseModelJson(raw);
  } catch {
    throw Object.assign(new Error("vision model returned no usable JSON"), { status: 502 });
  }
  if (!spark.word) throw Object.assign(new Error("no legible word in the photo"), { status: 422 });
  return buildLesson({ ...spark, language: spark.language ?? lang });
}
