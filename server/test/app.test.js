import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp } from "../src/app.js";
import { checkWav, makeWav } from "../src/wav.js";
import { buildLesson, parseModelJson } from "../src/lesson.js";
import { buildAsrRequest } from "../src/providers/meta.js";
import { isYkvKey, mintAppKey } from "../src/apptoken.js";

async function withServer(opts, fn) {
  const server = makeApp(opts);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

const fakeProvider = {
  NotImplementedYet: Error,
  transcribe: async (audio, o) => ({ text: `ok:${audio.length > 44}:${o.lang}` }),
  lessonFromPhoto: async () => ({ id: "x", steps: [] }),
};
const wav = (o) => ({ method: "POST", headers: { "content-type": "audio/wav" }, body: makeWav(o) });

test("health", () =>
  withServer({}, async (base) => assert.equal((await fetch(`${base}/health`)).status, 200)));

test("transcribe: rejects a non-audio body", () =>
  withServer({ provider: fakeProvider }, async (base) => {
    const r = await fetch(`${base}/v1/transcribe`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
    assert.equal(r.status, 415);
  }));

test("transcribe: rejects a malformed WAV with the reason", () =>
  withServer({ provider: fakeProvider }, async (base) => {
    const r = await fetch(`${base}/v1/transcribe`, { method: "POST", headers: { "content-type": "audio/wav" }, body: Buffer.alloc(100) });
    assert.equal(r.status, 422);
    assert.match((await r.json()).error, /WAV/);
  }));

test("transcribe: rejects 44.1 kHz", () =>
  withServer({ provider: fakeProvider }, async (base) => {
    const r = await fetch(`${base}/v1/transcribe`, wav({ rate: 44100 }));
    assert.equal(r.status, 422);
  }));

test("transcribe: relays audio and language to the provider", () =>
  withServer({ provider: fakeProvider }, async (base) => {
    const r = await fetch(`${base}/v1/transcribe?lang=sw`, wav());
    assert.deepEqual(await r.json(), { text: "ok:true:sw" });
  }));

test("provider not configured: clear 501", () =>
  withServer({}, async (base) => {
    delete process.env.META_API_KEY;
    const r = await fetch(`${base}/v1/transcribe`, wav());
    assert.equal(r.status, 501);
  }));

test("token required when configured", () =>
  withServer({ appToken: "secret" }, async (base) => {
    assert.equal((await fetch(`${base}/v1/transcribe`, { method: "POST" })).status, 401);
  }));

test("YKV keys: minted keys validate, tampered keys fail", () => {
  const k = mintAppKey();
  assert.equal(isYkvKey(k), true);
  assert.equal(isYkvKey(k.slice(0, -1) + (k.endsWith("0") ? "1" : "0")), false);
  assert.equal(isYkvKey("YKV-AAAA-BBBB-CCCC-00"), false);
  assert.equal(isYkvKey("YKV-DPRG-VPGP-PAXS-M1"), true); // checksum from the supplied 32-char alphabet
  assert.equal(isYkvKey("YKV-DPRG-VPGP-PAXS-MH"), false); // old mismatched checksum
  assert.equal(isYkvKey("YKV-DPRU-VPGP-PAXS-M1"), false); // U is outside the issuer alphabet
});
test("token gate: exact APP_TOKEN or any valid YKV key passes, garbage fails", () =>
  withServer({ appToken: "secret" }, async (base) => {
    const call = (token) =>
      fetch(`${base}/v1/transcribe`, { method: "POST", headers: { "x-app-token": token } });
    assert.equal((await call("nope")).status, 401);
    assert.equal((await call("secret")).status, 415); // token OK -> reaches content-type check
    assert.equal((await call(mintAppKey())).status, 415); // valid YKV key -> same
    assert.equal((await call("YKV-DPRG-VPGP-PAXS-M1")).status, 415); // supplied formula -> same
  }));

test("CORS: the app's preflight is accepted", () =>
  withServer({}, async (base) => {
    const r = await fetch(`${base}/v1/transcribe`, { method: "OPTIONS" });
    assert.equal(r.status, 204);
    assert.match(r.headers.get("access-control-allow-headers"), /x-app-token/);
  }));

test("rate limit", () =>
  withServer({ ratePerMinute: 2 }, async (base) => {
    const call = () => fetch(`${base}/v1/nope`);
    await call();
    await call();
    assert.equal((await call()).status, 429);
  }));

test("checkWav accepts 16 and 24 kHz", () => {
  assert.equal(checkWav(makeWav({ rate: 16000 })), null);
  assert.equal(checkWav(makeWav({ rate: 24000 })), null);
});

test("buildLesson: word in syllables -> valid steps", () => {
  const l = buildLesson({ word: "Mama", syllables: ["ma", "ma"], language: "sw" }, { id: "t" });
  assert.equal(l.id, "t");
  assert.equal(l.title, "mama");
  assert.equal(l.symbol, "M");
  assert.equal(l.icon, "family");
  const types = l.steps.map((s) => s.type);
  assert.ok(types.includes("listen_tap"));
  assert.ok(types.includes("say_word"), "photo lesson explains then asks to repeat");
  assert.ok(l.steps.some((s) => (s.items ?? []).some((i) => String(i).startsWith("quiz:"))), "photo lesson ends with a quiz");
  for (const s of l.steps) {
    if (s.type === "listen_tap") {
      assert.ok(s.params.choices.length >= 2);
      assert.ok(s.params.choices.some((c) => c.id === s.params.answer));
    }
    assert.deepEqual(s.params.context, { letter: "M", word: "mama", icon: "family" });
    assert.ok(s.params.say?.text);
  }
});

test("photo lesson always uses the requested language (no French word in Swahili)", async () => {
  // The model is told the target language BY NAME and must answer in it;
  // even if it returns French, the server forces the requested language.
  const { lessonFromPhoto } = await import("../src/providers/meta.js");
  const fakeImage = Buffer.from("fake");
  // Mock fetch: model returns a FRENCH word while the learner studies Swahili.
  process.env.META_API_KEY = process.env.META_API_KEY ?? "test-key";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"word": "journal", "syllables": ["jour", "nal"], "language": "fr", "description": "un journal"}' } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const l = await lessonFromPhoto(fakeImage, { contentType: "image/jpeg", lang: "sw" });
    assert.equal(l.language, "sw", "photo lesson in Swahili must be tagged sw, never fr");
    for (const step of l.steps) {
      if (step.type === "say_word") assert.match(step.params.say.text, /sikiliza/i, "swahili instruction, not French");
    }
  } finally {
    globalThis.fetch = origFetch;
  }
});
test("photo without text still produces a lesson in the requested language", async () => {
  // Object with NO writing (red circle): the model MUST name the object,
  // never answer {}. Regression: the old prompt let the model refuse.
  const { lessonFromPhoto } = await import("../src/providers/meta.js");
  process.env.META_API_KEY = process.env.META_API_KEY ?? "test-key";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"word": "duara", "syllables": ["du", "a", "ra"], "language": "sw", "description": "duara jekundu"}' } }],
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const l = await lessonFromPhoto(Buffer.from("fake"), { contentType: "image/jpeg", lang: "sw" });
    assert.equal(l.language, "sw");
    assert.equal(l.title, "duara");
    assert.ok(l.steps.length >= 3, "object photo gives a full lesson, not an error");
  } finally {
    globalThis.fetch = origFetch;
  }
});
test("photo in wrong language is translated on retry, never served in French", async () => {
  // Regression: stool photo in sw returned "tabouret". First answer admits
  // French, the server asks once for a translation and serves that instead.
  const { lessonFromPhoto } = await import("../src/providers/meta.js");
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (_u, opts) => {
    const msgs = JSON.parse(opts.body).messages;
    calls.push(msgs);
    const wrong = msgs.length === 1; // first call names it in French, retry translates
    const body = wrong
      ? { choices: [{ message: { content: '{"word": "tabouret", "syllables": ["ta", "bou", "ret"], "language": "fr", "description": "un tabouret"}' } }] }
      : { choices: [{ message: { content: '{"word": "kiti", "syllables": ["ki", "ti"], "language": "sw", "description": "kiti kidogo"}' } }] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const l = await lessonFromPhoto(Buffer.from("fake"), { contentType: "image/jpeg", lang: "sw" });
    assert.equal(calls.length, 2, "one retry to fix the language");
    assert.equal(l.language, "sw");
    assert.equal(l.title, "kiti");
  } finally {
    globalThis.fetch = origFetch;
  }
});
test("buildLesson: Lingala rejects accents and special letters", () => {
  assert.throws(() => buildLesson({ word: "lingála", syllables: ["lin", "gá", "la"], language: "ln" }), /plain ASCII Latin/);
  const lesson = buildLesson({ word: "lingala", syllables: ["lin", "ga", "la"], language: "ln" });
  assert.match(lesson.title, /^[a-z]+$/);
});

test("parseModelJson tolerates ```json fences", () => {
  assert.deepEqual(parseModelJson('```json\n{"word":"a"}\n```'), { word: "a" });
});

test("buildAsrRequest: model by default, language only when the field name is configured", () => {
  assert.deepEqual(buildAsrRequest("sw", {}), { model: "muse-voice-transcribe-1.0" });
  assert.deepEqual(buildAsrRequest("sw", { META_ASR_LANG_FIELD: "language" }), { model: "muse-voice-transcribe-1.0", language: "sw" });
  assert.equal(buildAsrRequest(undefined, { META_ASR_REQUEST: '{"x":1}' }).x, 1);
});

test("speak: missing text -> 400", () =>
  withServer({}, async (base) => {
    const r = await fetch(`${base}/v1/speak`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(r.status, 400);
  }));

test("speak: wrong content-type -> 415", () =>
  withServer({}, async (base) => {
    const r = await fetch(`${base}/v1/speak`, { method: "POST", headers: { "content-type": "text/plain" }, body: "ma" });
    assert.equal(r.status, 415);
  }));

test("voice probe: advertises the engine without synthesizing", () =>
  withServer({}, async (base) => {
    const r = await fetch(`${base}/v1/voice`);
    assert.equal(r.status, 200);
    const engine = await r.json();
    assert.equal(engine.ok, true);
    assert.equal(engine.engine, "mms-api");
    assert.equal(engine.format, "mp3");
    assert.equal(engine.hosted, true);
    assert.equal(typeof engine.apiKeyAvailable, "boolean");
  }));

test("illustrate: missing word -> 400", () =>
  withServer({}, async (base) => {
    const r = await fetch(`${base}/v1/illustrate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(r.status, 400);
  }));

test("illustrate: relays word to provider and returns the image bytes", () =>
  withServer({ provider: { ...fakeProvider, illustrate: async (w) => ({ bytes: Buffer.from(`PNG:${w}`), mime: "image/png" }) } }, async (base) => {
    const r = await fetch(`${base}/v1/illustrate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ word: "mama" }) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(await r.text(), "PNG:mama");
  }));

test("generate-lesson: missing word -> 400", () =>
  withServer({}, async (base) => {
    const r = await fetch(`${base}/v1/generate-lesson`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(r.status, 400);
  }));

test("generate-lesson: relays word+lang to provider and returns the lesson", () =>
  withServer({ provider: { ...fakeProvider, generateLesson: async (w, o) => ({ id: "t", word: "mangue", lang: "sw", steps: [] }) } }, async (base) => {
    const r = await fetch(`${base}/v1/generate-lesson?lang=sw`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ word: "mangue" }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { id: "t", word: "mangue", lang: "sw", steps: [] });
  }));

test("chat: missing text -> 400", () =>
  withServer({}, async (base) => {
    const r = await fetch(`${base}/v1/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(r.status, 400);
  }));

test("chat: relays transcription+lang to provider and returns the reply", () =>
  withServer({ provider: { ...fakeProvider, chat: async (t, o) => ({ text: `echo:${t}:${o.lang}` }) } }, async (base) => {
    const r = await fetch(`${base}/v1/chat?lang=ln`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "mbote" }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { text: "echo:mbote:ln" });
  }));
