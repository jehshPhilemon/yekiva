import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp } from "../src/app.js";
import { checkWav, makeWav } from "../src/wav.js";
import { buildLesson, parseModelJson } from "../src/lesson.js";
import { buildAsrRequest } from "../src/providers/meta.js";

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
  for (const s of l.steps) {
    assert.equal(s.type, "listen_tap");
    assert.ok(s.params.choices.length >= 2);
    assert.ok(s.params.choices.some((c) => c.id === s.params.answer));
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
