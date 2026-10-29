#!/usr/bin/env node
// Probes the real Meta Model API with the project's key and prints raw responses. Zero dependencies.
// Use it to check what docs/API_META.md marks "unverified" BEFORE relying on it.
//
//   node tools/probe-meta.mjs make-wav silence.wav                 # write a valid 1 s silent WAV
//   node tools/probe-meta.mjs asr word.wav                         # transcribe (request part: model only)
//   node tools/probe-meta.mjs asr word.wav '{"model":"muse-voice-transcribe-1.0","language":"sw"}'
//                                                                  # 2nd argument = the JSON "request" part, verbatim
//   node tools/probe-meta.mjs spark photo.jpg                      # photo -> word + syllables
//   node tools/probe-meta.mjs speak "Kwa Kiswahili, gusa hapa" sw  # natural voice (Yekiva server, Piper)
//
// The key is read from server/.env (or ./.env) when not already in the environment.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeWav } from "../server/src/wav.js";

// Loads server/.env (or the root .env). Tolerates BOM, Windows line endings, "export", quoted values.
function loadEnv() {
  for (const rel of ["../server/.env", "../.env"]) {
    const file = fileURLToPath(new URL(rel, import.meta.url));
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || m[1] in process.env) continue;
      process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
    return file;
  }
  return null;
}
const envFile = loadEnv();

const [cmd, file, extra] = process.argv.slice(2);
const BASE = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
const YEKIVA = process.env.YEKIVA_SERVER_URL ?? "http://127.0.0.1:8787";
const key = process.env.META_API_KEY;

async function show(res) {
  console.log(`(key read from ${envFile ?? "the environment"}, ${key.length} characters)`);
  console.log("HTTP", res.status);
  console.log((await res.text()).slice(0, 2000));
}

async function main() {
  if (cmd === "make-wav") {
    writeFileSync(file ?? "silence.wav", makeWav({ seconds: 1 }));
    console.log("written", file ?? "silence.wav");
  } else if (!key) {
    console.error("META_API_KEY is missing.");
    console.error(
      envFile
        ? `File read: ${envFile}\nIt must contain a line like:  META_API_KEY=your_key  (no spaces around "=", no leading "#")`
        : "No server/.env found: create server/.env containing the line  META_API_KEY=your_key"
    );
    process.exit(1);
  } else if (cmd === "asr") {
    // The API requires two multipart parts: "request" (JSON) and "audio" (the WAV).
    const request = extra ?? JSON.stringify({ model: "muse-voice-transcribe-1.0" });
    JSON.parse(request); // fail early on malformed JSON
    const form = new FormData();
    form.append("request", new Blob([request], { type: "application/json" }));
    form.append("audio", new Blob([readFileSync(file)], { type: "audio/wav" }), "audio.wav");
    console.log("request part:", request);
    await show(await fetch(`${BASE}/asr/transcribe`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form }));
  } else if (cmd === "spark") {
    const b64 = readFileSync(file).toString("base64");
    const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
    await show(
      await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.META_SPARK_MODEL ?? "muse-spark-1.1",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: 'Which word is written here? JSON only: {"word":"","syllables":[]}' },
                { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
              ],
            },
          ],
        }),
      })
    );
  } else {
    if (cmd === "speak") {
      // Natural voice via the YEKIVA server (no key needed): speak <text> [lang] [out.wav]
      const text = file ?? "ma";
      const lang = extra ?? "sw";
      const out = process.argv[5] ?? `speak-${lang}.wav`;
      const res = await fetch(`${YEKIVA}/v1/speak`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      console.log("HTTP", res.status, res.headers.get("content-type"));
      if (!res.ok) {
        console.log((await res.text()).slice(0, 500));
        process.exit(1);
      }
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      console.log("written", out);
      return;
    }
    console.error("usage: asr <file.wav> [request-json] | spark <photo> | make-wav <out.wav> | speak <text> [lang] [out.wav]");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`Network failure: ${e?.cause?.code ?? e?.message ?? e}`);
  console.error("Check the connection and META_BASE_URL (default https://api.meta.ai/v1).");
  process.exit(1);
});
