// Natural voice, generated AT REQUEST TIME inside the Yekiva server (never pre-generated,
// never robotic phone TTS as the primary voice).
//
// Honesty note (verified 2026-10-28 against https://dev.meta.ai/docs/models):
// Meta's Model API has NO text-to-speech endpoint — only transcription (Muse Voice
// Transcribe), text/vision (Muse Spark/Wonder), image (Muse Image) and segmentation.
// So the natural voice is a neural TTS engine (Piper, open-source, on-device) running here
// on the server, per request, per language. Meta keeps doing what it really does:
// transcription (repeat exercises) + vision (photo lessons).
//
// Voices (Piper, rhasspy/piper-voices on HuggingFace, downloaded once, cached on disk):
//   fr -> fr_FR-upmc-medium (French, natural female voice)
//   sw -> sw_CD-lanfrica-medium (Swahili, natural voice)
//   default (ln, en, ...): fr voice with espeak fallback phonemes (replace with a native
//   voice by setting YEKIVA_VOICES='{"ln":"...onnx path or URL..."}').
// Requires: python3 + `pip install piper-tts` on the server machine (once).
// Without it: speak() throws NotImplementedYet -> the server answers 501 ->
// the app falls back to the phone voice (offline) instead of breaking.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_VOICES = {
  fr: "fr_FR-upmc-medium",
  sw: "sw_CD-lanfrica-medium",
};
const HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const HF_PATH = {
  "fr_FR-upmc-medium": "fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx",
  "sw_CD-lanfrica-medium": "sw/sw_CD/lanfrica/medium/sw_CD-lanfrica-medium.onnx",
};

function voiceDir() {
  const dir = process.env.YEKIVA_VOICES_DIR ?? join(tmpdir(), "yekiva-voices");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function voiceFor(lang) {
  try {
    const custom = JSON.parse(process.env.YEKIVA_VOICES ?? "{}");
    if (custom[lang]) return custom[lang];
  } catch { /* ignore bad JSON */ }
  if (process.env[`YEKIVA_VOICE_${String(lang ?? "").toUpperCase()}`]) {
    return process.env[`YEKIVA_VOICE_${String(lang ?? "").toUpperCase()}`];
  }
  return DEFAULT_VOICES[lang] ?? DEFAULT_VOICES.fr;
}

/** Ensures the .onnx (+ .json) voice model is on disk; downloads it once from HuggingFace. */
export function ensureVoice(name) {
  if (name.endsWith(".onnx") && existsSync(name)) return name;
  const dir = voiceDir();
  const base = `${name}.onnx`;
  const model = join(dir, base);
  if (existsSync(model)) return model;
  const remote = HF_PATH[name];
  if (!remote) throw new Error(`unknown voice '${name}' (set YEKIVA_VOICES to map it)`);
  for (const suffix of ["", ".json"]) {
    const dest = join(dir, `${name}.onnx${suffix}`);
    if (existsSync(dest)) continue;
    const url = `${HF}/${remote}${suffix}`;
    const dl = spawnSync("curl", ["-sSL", "--fail", "-o", dest, url], { encoding: "utf8" });
    if (dl.status !== 0 || !existsSync(dest)) {
      throw new Error(`voice download failed: ${url}`);
    }
  }
  return model;
}

function checkPython() {
  const probe = spawnSync("python3", ["-c", "import piper"], { encoding: "utf8" });
  if (probe.status !== 0) {
    throw Object.assign(
      new Error("natural voice not installed on the server: run `pip install piper-tts` once (https://github.com/rhasspy/piper)"),
      { status: 501 },
    );
  }
}

function sanitize(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!t) throw Object.assign(new Error("empty text"), { status: 400 });
  return t;
}

/**
 * Synthesizes `text` in `lang` at request time. Returns a WAV Buffer (16-bit mono).
 * Not cached server-side (each request is one short prompt); the APP caches in IndexedDB.
 */
export function speak(text, { lang } = {}) {
  checkPython();
  const clean = sanitize(text);
  const model = ensureVoice(voiceFor(lang));
  const out = join(tmpdir(), `yekiva-tts-${process.pid}-${Date.now()}.wav`);
  const r = spawnSync(
    "python3",
    ["-m", "piper", "--model", model, "--output_file", out],
    { input: clean, encoding: "utf8", timeout: 30000 },
  );
  if (r.status !== 0 || !existsSync(out)) {
    throw Object.assign(new Error(`voice synthesis failed${r.stderr ? `: ${String(r.stderr).slice(0, 200)}` : ""}`), { status: 502 });
  }
  // Piper writes 22050 Hz mono 16-bit WAV: valid for <audio> playback as-is.
  try {
    return readFileSync(out);
  } finally {
    try {
      unlinkSync(out);
    } catch { /* ignore */ }
  }
}
