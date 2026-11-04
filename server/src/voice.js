// Natural voice, generated AT REQUEST TIME (never pre-generated,
// never robotic phone TTS as the primary voice). 100% Meta MMS models.
//
// Priority per utterance (first success wins):
//   1. Hosted Yekiva MMS API (models pre-loaded, ~2.4 s/phrase).
//      The API converts natively (opus|mp3|wav): we request MP3 directly,
//      NO ffmpeg on the Yekiva side (thin client: phone or Termux).
//      Configure: YEKIVA_MMS_URL + YEKIVA_MMS_KEY (server-side only, never in the app).
//   2. Persistent local micro-service (mms_server.py on the VPS): YEKIVA_VOICE_URL
//      (VPS-side conversion only).
//   3. Local synthesis (transformers + CPU torch, VPS with ffmpeg only).
// Without any engine: speak() throws { status: 501 } -> the server answers 501 ->
// the app falls back to the phone voice (offline) instead of breaking.
//
// Language codes sent to the hosted API: fra / eng / swh / ln (Lingala text,
// Swahili voice model — per the API spec). Local codes stay fr / sw / ln.
//
// The app always calls OUR /v1/speak (same JSON, same MP3 answer): the API key
// never leaves the server. Response stays audio/mpeg for low-bandwidth phones;
// the APP caches it in IndexedDB (session + offline replay).
//
// Env:
//   YEKIVA_MMS_URL    e.g. https://api.jehshphilemon.com (no trailing /tts path needed)
//   YEKIVA_MMS_KEY    X-API-Key value (server-side only)
//   YEKIVA_MMS_FORMAT opus|mp3|wav requested upstream (default mp3: native API
//                     output, no conversion on the Yekiva side)
//   YEKIVA_VOICE_URL  legacy local micro-service base (VPS fallback)
//   YEKIVA_MP3_QUALITY lame -q:a value, default 6 (VPS local synthesis only)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveMmsApiKey } from "./mms-config.js";

const MMS_MODELS = { fr: "facebook/mms-tts-fra", sw: "facebook/mms-tts-swh" };
// Hosted API codes per app language (spec: Lingala text, Swahili voice).
const HOSTED_LANG = { fr: "fra", sw: "swh", ln: "ln", en: "eng" };
const FALLBACK_LANG = "fr";
const MP3_MIME = "audio/mpeg";
const DEFAULT_MMS_URL = "https://api.jehshphilemon.com";

function modelFor(lang) {
  return MMS_MODELS[lang] ?? MMS_MODELS[FALLBACK_LANG];
}

function hostedLang(lang) {
  return HOSTED_LANG[lang] ?? HOSTED_LANG[FALLBACK_LANG];
}

function sanitize(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!t) throw Object.assign(new Error("empty text"), { status: 400 });
  return t;
}

function tmpFile(ext) {
  return join(tmpdir(), `yekiva-voice-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
}

function cleanup(...files) {
  for (const f of files) {
    try {
      if (f && existsSync(f)) unlinkSync(f);
    } catch { /* ignore */ }
  }
}

/**
 * Primary path: hosted Yekiva MMS API (POST /tts/v1/speak, X-API-Key).
 * Requests MP3 NATIVELY (the API converts itself): the Yekiva side NEVER
 * needs ffmpeg — thin client (phone, Termux). Returns { bytes, mime } MP3,
 * or null when unconfigured/unreachable so the VPS fallbacks can take over.
 * Throws only on auth/config errors (401/422) — real problems, not fallbacks.
 */
async function tryHostedMms(text, lang) {
  // Empty string disables the hosted API (local fallback only).
  // Unset -> default hosted URL. Use ?? (not ||) so "" really disables.
  const base = (process.env.YEKIVA_MMS_URL ?? DEFAULT_MMS_URL).trim().replace(/\/+$/, "");
  const key = resolveMmsApiKey();
  if (!base) return null;
  // Default mp3: native API output, zero conversion on the Yekiva side.
  const upstreamFormat = process.env.YEKIVA_MMS_FORMAT ?? "mp3";
  let res;
  try {
    res = await fetch(`${base}/tts/v1/speak`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "x-api-key": key } : {}),
      },
      body: JSON.stringify({ language: hostedLang(lang), text, format: upstreamFormat }),
    });
  } catch {
    return null; // network down -> local fallback
  }
  if (res.status === 401) {
    const detail = await res.text().then((t) => t.slice(0, 200)).catch(() => "");
    const reason = key
      ? "the configured server-side API key was rejected"
      : "no API key was sent (set YEKIVA_MMS_URL=\"\" to use the local voice only, or inject the key into the Yekiva server environment)";
    throw Object.assign(new Error(`${base} returned 401: ${reason}${detail ? `: ${detail}` : ""}. The app does not contain the key.`), { status: 502 });
  }
  if (res.status === 422) {
    const detail = await res.text().then((t) => t.slice(0, 200)).catch(() => "");
    throw Object.assign(new Error(`MMS API refused the request (422): text or language invalid${detail ? `: ${detail}` : ""}`), { status: 502 });
  }
  if (!res.ok) return null; // 500 / gateway -> local fallback
  const ctype = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) return null;
  // MP3 requested natively: relay as-is, no ffmpeg on the Yekiva side.
  if (ctype.includes("audio/mpeg") || buf.slice(0, 3).toString() === "ID3") {
    return { bytes: buf, mime: MP3_MIME };
  }
  // Non-MP3 upstream (only when YEKIVA_MMS_FORMAT is overridden to opus/wav):
  // convert on VPS-class hosts only. Thin clients keep the default mp3.
  if (!process.env.YEKIVA_MMS_FORMAT || process.env.YEKIVA_MMS_FORMAT === "mp3") {
    throw Object.assign(new Error("MMS API did not return MP3 despite format=mp3"), { status: 502 });
  }
  const ext = ctype.includes("audio/wav") || upstreamFormat === "wav" ? "wav" : "ogg";
  const inFile = tmpFile(ext);
  writeFileSync(inFile, buf);
  return toMp3FromFile(inFile);
}

/** Calls the optional persistent micro-service (mms_server.py on the VPS). Returns WAV bytes or null. */
async function tryMicroService(text, lang) {
  const base = (process.env.YEKIVA_VOICE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/synthesize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1000 && buf.slice(0, 4).toString() === "RIFF" ? buf : null;
  } catch {
    return null;
  }
}

const SYNTH_PY = `
import sys, wave, io
import torch
from transformers import VitsModel, AutoTokenizer
model_id, text = sys.argv[1], sys.argv[2]
torch.manual_seed(0)
model = VitsModel.from_pretrained(model_id).eval()
tok = AutoTokenizer.from_pretrained(model_id)
with torch.no_grad():
    wav = model(**tok(text, return_tensors="pt")).waveform.squeeze().numpy()
import numpy as np
pcm = (np.clip(wav, -1, 1) * 32767).astype(np.int16)
buf = io.BytesIO()
with wave.open(buf, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2)
    w.setframerate(model.config.sampling_rate)
    w.writeframes(pcm.tobytes())
sys.stdout.buffer.write(buf.getvalue())
`;

/** Local synthesis with Meta MMS-TTS (transformers + CPU torch). Returns PCM16 WAV bytes. */
function synthesizeLocal(text, lang) {
  const probe = spawnSync("python3", ["-c", "import torch, transformers"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw Object.assign(
      new Error("voice engine not installed (optional): set YEKIVA_MMS_URL + YEKIVA_MMS_KEY in server/.env, or install the local fallback (`pip install torch transformers` + `apt install ffmpeg`). The app keeps working with the phone voice meanwhile."),
      { status: 501 },
    );
  }
  const wavFile = tmpFile("wav");
  const r = spawnSync("python3", ["-c", SYNTH_PY, modelFor(lang), text], {
    encoding: "buffer",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0 || !r.stdout || r.stdout.length < 1000) {
    const err = r.stderr ? String(r.stderr).slice(0, 200) : "";
    throw Object.assign(new Error(`Meta MMS-TTS synthesis failed${err ? `: ${err}` : ""}`), { status: 502 });
  }
  return { bytes: r.stdout, wavFile };
}

/** Any input audio file -> MP3 mono 16 kHz via ffmpeg. Returns { bytes, mime }. */
function toMp3FromFile(inFile) {
  const mp3File = tmpFile("mp3");
  const q = process.env.YEKIVA_MP3_QUALITY ?? "6";
  const r = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inFile, "-codec:a", "libmp3lame", "-q:a", String(q),
    "-ar", "16000", "-ac", "1", mp3File,
  ], { encoding: "utf8", timeout: 30000 });
  if (r.status !== 0 || !existsSync(mp3File)) {
    cleanup(inFile, mp3File);
    throw Object.assign(new Error("audio conversion failed: install ffmpeg with libmp3lame (`apt install ffmpeg`)"), { status: 502 });
  }
  try {
    return { bytes: readFileSync(mp3File), mime: MP3_MIME };
  } finally {
    cleanup(inFile, mp3File);
  }
}

/** WAV (PCM16) -> MP3 mono 16 kHz via ffmpeg. Returns { bytes, mime }. */
function toMp3(wavBytes, wavFile) {
  writeFileSync(wavFile, wavBytes);
  return toMp3FromFile(wavFile);
}

/**
 * Synthesizes `text` in `lang` at request time with Meta MMS-TTS.
 * Returns { bytes: MP3 Buffer, mime: "audio/mpeg" } — light for low-bandwidth phones.
 * Not cached server-side (each request is one short prompt); the APP caches in IndexedDB.
 */
export async function speak(text, { lang } = {}) {
  const clean = sanitize(text);
  const l = HOSTED_LANG[lang] ? lang : FALLBACK_LANG;
  // Fast path: hosted Yekiva MMS API (models pre-loaded in RAM, ~2.4 s/phrase).
  const hosted = await tryHostedMms(clean, l);
  if (hosted) return hosted;
  // Fallback: persistent micro-service on the VPS (WAV -> MP3).
  const served = await tryMicroService(clean, l);
  if (served) {
    const wavFile = tmpFile("wav");
    return toMp3(served, wavFile);
  }
  // Last local path: load Meta model on demand (slower first call, fine for dev/small VPS).
  const { bytes, wavFile } = synthesizeLocal(clean, l);
  return toMp3(bytes, wavFile);
}

/** Engine descriptor for GET /v1/voice (no synthesis). */
export function engine() {
  const hosted = Boolean((process.env.YEKIVA_MMS_URL ?? DEFAULT_MMS_URL).trim());
  return {
    ok: true,
    engine: hosted ? "mms-api" : "mms-tts",
    format: "mp3",
    voices: Object.keys(MMS_MODELS),
    hosted,
    apiKeyAvailable: Boolean(resolveMmsApiKey()),
  };
}
