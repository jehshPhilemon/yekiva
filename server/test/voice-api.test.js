import { test } from "node:test";
import assert from "node:assert/strict";
import { speak } from "../src/voice.js";

const keyNames = ["YEKIVA_MMS_KEY", "MMS_API_KEY", "TTS_API_KEY", "API_KEY", "X_API_KEY", "YEKIVA_MMS_KEY_FILE", "YEKIVA_MMS_URL"];

async function withNoMmsKey(fn) {
  const saved = new Map(keyNames.map((k) => [k, process.env[k]]));
  const oldFetch = globalThis.fetch;
  for (const k of keyNames) delete process.env[k];
  process.env.YEKIVA_MMS_KEY_FILE = "/definitely-not-a-real-yekiva-secret-file";
  try { return await fn(); }
  finally {
    globalThis.fetch = oldFetch;
    for (const [k, value] of saved) {
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
  }
}

test("without MMS key, Yekiva calls api.jehshphilemon.com and omits X-API-Key", () =>
  withNoMmsKey(async () => {
    let seen;
    const audio = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(700)]);
    globalThis.fetch = async (url, options) => {
      seen = { url: String(url), headers: options.headers, body: JSON.parse(options.body) };
      return new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } });
    };
    const result = await speak("Bonjour", { lang: "fr" });
    assert.equal(seen.url, "https://api.jehshphilemon.com/tts/v1/speak");
    assert.equal("x-api-key" in seen.headers, false);
    assert.deepEqual(seen.body, { language: "fra", text: "Bonjour", format: "opus" });
    assert.equal(result.mime, "audio/mpeg");
    assert.equal(result.bytes.length, audio.length);
  }));

test("if hosted API denies keyless access, report 401 instead of silently changing voice engine", () =>
  withNoMmsKey(async () => {
    globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
    await assert.rejects(() => speak("Bonjour", { lang: "fr" }), /api\.jehshphilemon\.com returned 401: no API key was sent/);
  }));
