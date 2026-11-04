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
});
test("token gate: exact APP_TOKEN or any valid YKV key passes, garbage fails", () =>
  withServer({ appToken: "secret" }, async (base) => {
    const call = (token) =>
      fetch(`${base}/v1/transcribe`, { method: "POST", headers: { "x-app-token": token } });
    assert.equal((await call("nope")).status, 401);
    assert.equal((await call("secret")).status, 415); // token OK -> reaches content-type check
    assert.equal((await call(mintAppKey())).status, 415); // valid YKV key -> same
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
  for (const s of l.steps) {
    assert.equal(s.type, "listen_tap");
    assert.ok(s.params.choices.length >= 2);
    assert.ok(s.params.choices.some((c) => c.id === s.params.answer));
    assert.deepEqual(s.params.context, { letter: "M", word: "mama", icon: "family" });
  }
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
  withServer({ provider: { ...fakeProvider, generateLesson: async (w, o) => ({ id: "t", word: w, lang: o.lang, steps: [] }) } }, async (base) => {
    const r = await fetch(`${base}/v1/generate-lesson?lang=sw`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ word: "mangue" }) });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { id: "t", word: "mangue", lang: "sw", steps: [] });
  }));
