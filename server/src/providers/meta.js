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
// Muse Image (docs https://dev.meta.ai/docs/image-generation, read 2026-10-30):
//   - POST /images/generations { model: "muse-image-1.0", prompt, n: 1,
//     response_format: "b64_json", output_format: "png" } -> data[0].b64_json
//   - flat $0.01/image; UNVERIFIED live (no key in this sandbox): probe first.
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
  "You help illiterate learners read the world. Look at this photo. " +
  "FIRST: is the content appropriate for children (no violence, nudity, gore, hate)? " +
  "If NOT appropriate, answer ONLY {}. " +
  "If appropriate, you MUST ALWAYS produce a lesson, even with NO text in the photo. " +
  "Case 1 — a written word is visible: use that word (translated into the expected language if needed). " +
  "Case 2 — NO text visible: name the single most important visible thing " +
  "(e.g. a red ball -> word 'ballon'/'ball'/'mpira' in the expected language). " +
  "NEVER answer {} for an appropriate photo: there is always something to name. " +
  "Answer ONLY with JSON: " +
  '{"word": "...", "syllables": ["..."], "language": "ISO 639-1 code", "description": "short simple sentence"}. ' +
  "Split the word into syllables as they are pronounced. " +
  "The description explains in very simple words what is visible (object, color, action), for an illiterate learner, " +
  "in the expected language when given. " +
  "For Lingala (ln), use ONLY unaccented ASCII Latin letters a-z: never use ɛ, ɔ, accents, apostrophes, hyphens, or other special characters.";

/** @param {Buffer} image  @returns {Promise<object>} a lesson in the docs/LESSON_FORMAT.md format
 * The lesson ALWAYS uses the requested language (the app's current language):
 * the model is told the target language by NAME, must answer in it, and the
 * server overrides any language the model returns. No more "journal" in Swahili. */
export async function lessonFromPhoto(image, { contentType, lang } = {}) {
  const want = String(lang ?? "").toLowerCase();
  const languageName = { fr: "French", sw: "Swahili", ln: "Lingala", en: "English" }[want] ?? "French";
  const langRule = want === "ln"
    ? `STRICT Lingala rule: word, syllables AND description use ONLY plain ASCII Latin letters a-z (no accents, no special characters). `
    : ``;
  const langDirective =
    `The learner studies in ${languageName} (code "${want || "fr"}"). ` +
    `CRITICAL: think DIRECTLY in ${languageName}. Your very first thought must be in ${languageName}, never in French. ` +
    `The word, the syllables AND the description MUST ALL be in ${languageName} — every single word. ` +
    `A learner who cannot read French must understand everything: any French word is a WRONG answer. ` +
    `Translate the visible thing: a stool in Swahili is "kiti", never "tabouret"; ` +
    `a newspaper in Swahili is "gazeti", never "journal"; a stool in Lingala is "kiti", never "tabouret". ` +
    `Answer "language" with "${want || "fr"}". ` + langRule;
  const apiKey = key();
  const dataUrl = `data:${contentType};base64,${image.toString("base64")}`;
  const firstMessage = {
    role: "user",
    content: [
      { type: "text", text: VISION_PROMPT + " " + langDirective },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
  };
  async function callVision(messages) {
    let res;
    try {
      res = await metaFetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.META_SPARK_MODEL ?? "muse-spark-1.1",
          messages,
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
    return data?.choices?.[0]?.message?.content ?? data?.output_text ?? "";
  }
  function parseVision(raw) {
    let spark;
    try {
      spark = parseModelJson(raw);
    } catch {
      throw Object.assign(new Error("vision model returned no usable JSON"), { status: 502 });
    }
    return spark;
  }
  let raw = await callVision([firstMessage]);
  let spark = parseVision(raw);
  // Wrong-language guard: the model sometimes names the object in French even
  // when asked in Swahili/Lingala ("tabouret" instead of "kiti"). If it admits
  // another language, ask ONCE to translate the same lesson before serving it.
  const got = String(spark.language ?? "").toLowerCase();
  if (want && got && got !== want) {
    const retryMessages = [
      firstMessage,
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          `WRONG LANGUAGE: you answered in "${got}" but the learner studies in ${languageName} (code "${want}"). ` +
          `Translate the SAME object now: word, syllables AND description ALL in ${languageName}, ` +
          `answer "language" with "${want}". Answer ONLY with the JSON, no French word anywhere. ` + langRule,
      },
    ];
    try {
      const raw2 = await callVision(retryMessages);
      const spark2 = parseVision(raw2);
      if (spark2.word) spark = spark2;
    } catch {
      // keep the first answer rather than failing the lesson
    }
  }
  if (!spark.word) throw Object.assign(new Error("nothing usable in this photo (inappropriate or empty)"), { status: 422 });
  // The requested language wins over whatever the model returns: the photo lesson
  // always matches the language the learner is currently using.
  return buildLesson({ ...spark, language: want || spark.language || lang || "fr" });
}

// Lesson generation: Spark proposes CONTENT (word + syllables), OUR code builds the
// lesson (buildLesson) and OUR validator checks it. The model never invents structure.
const LESSON_PROMPT =
  "You help illiterate adults and children learn to read. Given a word, split it into " +
  "syllables as pronounced. Answer ONLY with JSON: " +
  '{"word": "...", "syllables": ["..."]}. ' +
  "Rules: lowercase, no punctuation, 1-4 syllables, each syllable 1-3 letters. " +
  "STRICT Lingala rule: when language is ln, output ONLY plain ASCII Latin letters a-z, with no accents, ɛ, ɔ, apostrophes, hyphens, or special characters.";

export async function generateLesson(word, { lang } = {}) {
  const apiKey = key();
  const w = String(word ?? "").trim().toLowerCase().slice(0, 30);
  if (!w) throw Object.assign(new Error("missing word"), { status: 400 });
  let res;
  try {
    res = await metaFetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.META_SPARK_MODEL ?? "muse-spark-1.1",
        messages: [
          { role: "user", content: `${LESSON_PROMPT} Word: "${w}"${lang ? ` (language: ${lang})` : ""}` },
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
    throw Object.assign(new Error("lesson model returned no usable JSON"), { status: 502 });
  }
  if (!spark.word || !Array.isArray(spark.syllables) || spark.syllables.length === 0) {
    throw Object.assign(new Error("lesson model returned no word/syllables"), { status: 502 });
  }
  return buildLesson({ ...spark, language: lang ?? null });
}

// Voice chat: the learner speaks, the app transcribes, Spark answers simply.
// Plain-text answer (never JSON): the app reads it aloud with TTS in the
// user's language. Short sentences for illiterate learners; same language as input.
export async function chat(text, { lang } = {}) {
  const apiKey = key();
  const t = String(text ?? "").trim().slice(0, 500);
  if (!t) throw Object.assign(new Error("missing text"), { status: 400 });
  const languageName = { fr: "French", sw: "Swahili", ln: "Lingala", en: "English" }[String(lang ?? "").toLowerCase()] ?? "French";
  const prompt =
    `You are Yekiva, a kind tutor for illiterate adults and children learning to read. ` +
    `Answer in ${languageName}, in very simple short sentences (at most 2 sentences, at most 40 words). ` +
    `Encourage learning to read. ` +
    (String(lang ?? "").toLowerCase() === "ln"
      ? `STRICT Lingala rule: use ONLY plain ASCII Latin letters a-z (no accents, no special characters). `
      : ``) +
    `The learner said: "${t}"`;
  let res;
  try {
    res = await metaFetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.META_SPARK_MODEL ?? "muse-spark-1.1",
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    throw Object.assign(new Error(`Meta unreachable: ${e?.message ?? e}`), { status: 502 });
  }
  if (!res.ok) {
    const body = await res.text().then((t2) => t2.slice(0, 300)).catch(() => "");
    throw Object.assign(new Error(`Meta answered ${res.status}${body ? `: ${body}` : ""}`), { status: 502 });
  }
  const data = await res.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content ?? data?.output_text ?? "";
  const answer = String(raw ?? "").trim().slice(0, 600);
  if (!answer) throw Object.assign(new Error("chat model returned no answer"), { status: 502 });
  return { text: answer };
}

// One fixed cartoon style for ALL lesson illustrations: simple drawings are recognized
// faster than photos by pre-readers, and a single style keeps every lesson coherent.
const IMAGE_STYLE =
  "flat cartoon illustration for children learning to read, single centered object, " +
  "bold outlines, warm colors, plain white background, no text, no letters, no watermark";

export function buildImagePrompt(word, { hint } = {}) {
  const w = String(word ?? "").trim();
  if (!w) throw new Error("missing word");
  return `${IMAGE_STYLE}: ${w}${hint ? ` (${hint})` : ""}`;
}

/**
 * Illustrates one lesson word with Muse Image. UNVERIFIED live: probe with
 * `node tools/probe-meta.mjs image <word>` (needs META_API_KEY) before relying on it.
 * @returns {Promise<{bytes: Buffer, mime: "image/png"}>}
 */
export async function illustrate(word, { hint } = {}) {
  const apiKey = key();
  const prompt = buildImagePrompt(word, { hint });
  let res;
  try {
    res = await metaFetch(`${BASE}/images/generations`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.META_IMAGE_MODEL ?? "muse-image-1.0",
        prompt,
        n: 1,
        response_format: "b64_json",
        output_format: "png",
        reasoning_strength: "low",
        tool_enablement: { enable_web_search: false, enable_shell: false },
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
  const b64 = data?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || b64.length < 100) {
    throw Object.assign(new Error("image model returned no usable image"), { status: 502 });
  }
  return { bytes: Buffer.from(b64, "base64"), mime: "image/png" };
}
