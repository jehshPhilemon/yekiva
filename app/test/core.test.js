import { test } from "node:test";
import assert from "node:assert/strict";
import { LearnerModel } from "../www/js/core/learner.js";
import { isAccepted, normalize, levenshtein } from "../www/js/core/match.js";
import { encodeWav } from "../www/js/core/wav.js";
import { mergeLanguage } from "../www/js/core/merge.js";
import { createPacks } from "../www/js/core/packs.js";
import { checkWav } from "../../server/src/wav.js";
import { readFileSync } from "node:fs";

test("learner: a miss comes back immediately, a success waits", () => {
  let now = 1_000_000;
  const m = new LearnerModel({ clock: () => now });
  m.record("ma", false);
  m.record("ba", true);
  m.record("ba", true); // box 2 -> due in 1 day
  assert.deepEqual(m.prioritize(["ma", "ba"]), ["ma"]);
  now += 2 * 24 * 3600_000;
  assert.deepEqual(m.prioritize(["ma", "ba"]), ["ma", "ba"]);
  assert.deepEqual(m.prioritize(["ji"]), ["ji"]); // jamais vu
});

test("matching: accents, case, 1 typo tolerated", () => {
  assert.equal(isAccepted("été", "ETE").ok, true);
  assert.equal(isAccepted("bien", "bie").ok, true); // the "bie" case from the first test
  assert.equal(isAccepted("mama", "baba").ok, false);
  assert.equal(isAccepted("mama", "oui mama merci").ok, true); // one word of the phrase is enough
  assert.equal(isAccepted("mama", "").ok, false);
  assert.equal(normalize("Ng’ombe!"), "ng'ombe");
  assert.equal(levenshtein("kitten", "sitting"), 3);
});

test("matching: Lingala ɛ and ɔ are letters, not accents", () => {
  assert.equal(isAccepted("mɔtɔ", "moto", { maxEdits: 0 }).ok, false);
  assert.equal(isAccepted("mɔtɔ", "mɔtɔ", { maxEdits: 0 }).ok, true);
});

test("encoded WAV: accepted by the server check (mono, 16-bit, 16 kHz)", () => {
  const wav = Buffer.from(encodeWav(new Float32Array(1600), 16000));
  assert.equal(checkWav(wav), null);
});

test("merge: an addon is inserted after the requested lesson", () => {
  const base = { manifest: { id: "sw", language: "sw", tracks: { adult: ["a", "b"], child: [] } }, glyphs: {} };
  const add = { manifest: { id: "sw-x", language: "sw", role: "addon", tracks: { adult: ["x"], child: [] }, after: { adult: "a" } }, glyphs: {} };
  const r = mergeLanguage([base, add]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.tracks.adult, ["a", "x", "b"]);
  assert.equal(r.lessonOwner.get("x"), "sw-x");
});

test("packs: the loader reads the real files and merges Swahili", async () => {
  const fetchFn = async (url) => ({
    ok: true,
    json: async () => JSON.parse(readFileSync(new URL(`../www/${url}`, import.meta.url), "utf8")),
  });
  const packs = createPacks({ fetchFn });
  const langs = await packs.loadLanguages();
  const sw = langs.find((l) => l.code === "sw");
  assert.equal(sw.name, "Kiswahili");
  assert.equal(sw.labels.audience.adult, "Mtu mzima");
  assert.deepEqual(sw.tracks.adult.slice(0, 4), ["letter-a", "i-l", "syllables-ma", "mama-baba"]);
  assert.ok(sw.tracks.adult.includes("voyelle-e"), "track includes vowels level");
  assert.ok(sw.tracks.adult.includes("syllabes-ba"), "track includes syllables level");
  assert.ok(sw.tracks.adult.includes("lecture-1"), "track ends with reading level");
  const lesson = await packs.loadLesson(sw, "mama-baba");
  assert.equal(lesson.owner, "sw-famille");
  assert.ok(sw.glyphs["i:lower_script"]);
  assert.ok(sw.prompts.language_pick.text);
});

test("all screen and step modules import (correct paths and exports)", async () => {
  for (const f of ["core/registry.js", "core/debug.js", "core/server-url.js", "core/voice-api.js", "screens/start.js", "screens/language.js", "screens/audience.js", "screens/path.js", "screens/lesson.js", "screens/photo.js", "screens/server.js", "screens/diag.js", "ui/context-cue.js", "steps/listen_tap.js", "steps/watch_write.js", "steps/trace_letter.js"]) {
    await import(`../www/js/${f}`);
  }
  const { registry } = await import("../www/js/core/registry.js");
  assert.deepEqual(Object.keys(registry).sort(), ["listen_tap", "say_word", "trace_letter", "watch_write"]);
});

test("drawGlyph: at 50% progress, only half of the path is drawn", async () => {
  globalThis.window = { devicePixelRatio: 1 };
  const { drawGlyph } = await import("../www/js/ui/glyph.js");
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]), set: () => true });
  const canvas = { clientWidth: 100, width: 0, height: 0, getContext: () => ctx };
  // one vertical stroke from 0.1 to 0.9: 80 px on a 100 px canvas
  drawGlyph(canvas, [[[0.5, 0.1], [0.5, 0.9]]], { progress: 0.5 });
  const lineTo = calls.find((c) => c[0] === "lineTo");
  assert.ok(Math.abs(lineTo[2] - 50) < 0.001, `expected y ≈ 50, got ${lineTo[2]}`); // 10 + 40
});

test("every relative import in app/www/js points to an existing file (main.js included)", async () => {
  const { readdirSync, readFileSync, existsSync, statSync } = await import("node:fs");
  const { join, dirname, resolve } = await import("node:path");
  const root = new URL("../www/js", import.meta.url).pathname;
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const missing = [];
  for (const file of walk(root).filter((f) => f.endsWith(".js"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+"(\.[^"]+)"/g)) {
      if (!existsSync(resolve(dirname(file), m[1]))) missing.push(`${file.replace(root, "")} -> ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("server-url: Meta URLs are refused, Yekiva URLs accepted and normalized", async () => {
  const { checkServerUrl, normalizeServerUrl, isMetaUrl } = await import("../www/js/core/server-url.js");
  assert.equal(isMetaUrl("https://api.meta.ai/v1"), true);
  assert.equal(isMetaUrl("https://api.mata.ai/v1/v1/lesson-from-photo?lang=fr"), true);
  assert.equal(isMetaUrl("http://192.168.1.10:8787"), false);
  assert.equal(normalizeServerUrl("http://192.168.1.10:8787/v1/transcribe?lang=fr"), "http://192.168.1.10:8787");
  assert.equal(checkServerUrl("https://api.meta.ai/v1").ok, false);
  assert.equal(checkServerUrl("https://api.mata.ai/v1/v1/lesson-from-photo?lang=fr").ok, false);
  assert.equal(checkServerUrl("http://192.168.1.10:8787").ok, true);
});

test("direct API: placeholders = offline, never location.origin", async () => {
  const { createVoiceApi } = await import("../www/js/core/voice-api.js");
  // Simule la WebView Capacitor : même si location.origin vaut https://localhost,
  // un build sans --api/--key doit rester offline (pas de fetch vers le vide).
  globalThis.location = { origin: "https://localhost" };
  const t = createVoiceApi({ apiUrl: "__TTS_API_URL__", apiKey: "__TTS_API_KEY__" });
  assert.equal(t.apiUrl, "");
  assert.equal(t.configured(), false);
  assert.equal(t.available(), false);
  assert.equal(await t.speak("bonjour", "fr"), null);
  assert.match(t.serverError(), /non configurée/);
  delete globalThis.location;
});

test("direct API: baked URL + key are used verbatim", async () => {
  const { createVoiceApi, toApiLang } = await import("../www/js/core/voice-api.js");
  assert.equal(toApiLang("fr"), "fra");
  assert.equal(toApiLang("sw"), "swh");
  assert.equal(toApiLang("ln"), "ln");
  assert.equal(toApiLang("en"), "eng");
  const seen = {};
  globalThis.fetch = async (url, opts) => {
    seen.url = String(url);
    seen.headers = opts.headers;
    seen.body = JSON.parse(opts.body);
    return new Response(new Blob(["x".repeat(1000)], { type: "audio/mpeg" }), { status: 200 });
  };
  try {
    const t = createVoiceApi({ apiUrl: "https://api.jehshphilemon.com", apiKey: "YKV-TEST" });
    assert.equal(t.apiUrl, "https://api.jehshphilemon.com");
    assert.equal(t.configured(), true);
    const blob = await t.speak("Bonjour", "fr");
    assert.ok(blob?.size > 0);
    assert.equal(seen.url, "https://api.jehshphilemon.com/tts/v1/speak");
    assert.equal(seen.headers["x-api-key"], "YKV-TEST");
    assert.deepEqual(seen.body, { language: "fra", text: "Bonjour", format: "mp3" });
  } finally {
    delete globalThis.fetch;
  }
});

test("direct API: trailing route suffixes are stripped", async () => {
  const { createVoiceApi } = await import("../www/js/core/voice-api.js");
  const t = createVoiceApi({ apiUrl: "https://api.jehshphilemon.com/tts/v1/speak", apiKey: "x" });
  assert.equal(t.apiUrl, "https://api.jehshphilemon.com");
});

test("direct API: no transcription/photo routes yet -> null (offline plan B)", async () => {
  const { createVoiceApi } = await import("../www/js/core/voice-api.js");
  const t = createVoiceApi({ apiUrl: "https://api.jehshphilemon.com", apiKey: "x" });
  assert.equal(await t.transcribe(new Blob([])), null);
  assert.equal(await t.lessonFromPhoto(new Blob([])), null);
});

test("direct API: diagnoseSpeak names the cause (no-config / no-key / http)", async () => {
  const { createVoiceApi } = await import("../www/js/core/voice-api.js");
  const a = createVoiceApi({ apiUrl: "", apiKey: "" });
  assert.deepEqual(await a.diagnoseSpeak("Bonjour", "fr"), { ok: false, cause: "no-config" });
  const b = createVoiceApi({ apiUrl: "https://api.jehshphilemon.com", apiKey: "" });
  assert.deepEqual(await b.diagnoseSpeak("Bonjour", "fr"), { ok: false, cause: "no-key" });
  // 401 simulé : la cause doit être http-401 (plus jamais un message vague).
  globalThis.fetch = async () => new Response('{"detail":"Invalid API key"}', { status: 401 });
  try {
    const c = createVoiceApi({ apiUrl: "https://api.jehshphilemon.com", apiKey: "FAUSSE" });
    const d = await c.diagnoseSpeak("Bonjour", "fr");
    assert.equal(d.ok, false);
    assert.equal(d.cause, "http-401");
    assert.equal(await c.speak("Bonjour", "fr"), null);
  } finally {
    delete globalThis.fetch;
  }
});

test("gating: lesson unlocks only at 70% success", async () => {
  const { PASS_RATE } = await import("../www/js/screens/lesson.js");
  assert.equal(PASS_RATE, 0.7);
  const pass = (good, scored) => scored > 0 && good / scored >= PASS_RATE;
  assert.equal(pass(7, 10), true);
  assert.equal(pass(6, 10), false);
  assert.equal(pass(0, 0), false); // all skipped (offline) -> stays locked
  assert.equal(pass(2, 2), true);
});

test("gating: sequential unlock rule (first open, next needs previous done)", async () => {
  const isOpen = (index, done, ids) => index === 0 || Boolean(done[ids[index - 1]]);
  const ids = ["a", "b", "c"];
  assert.equal(isOpen(0, {}, ids), true);
  assert.equal(isOpen(1, {}, ids), false);
  assert.equal(isOpen(1, { a: true }, ids), true);
  assert.equal(isOpen(2, { a: true }, ids), false);
  assert.equal(isOpen(2, { a: true, b: true }, ids), true);
});
