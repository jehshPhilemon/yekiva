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
  assert.deepEqual(sw.tracks.adult, ["i-l", "syllables-ma", "mama-baba"]);
  const lesson = await packs.loadLesson(sw, "mama-baba");
  assert.equal(lesson.owner, "sw-famille");
  assert.ok(sw.glyphs["i:lower_script"]);
  assert.ok(sw.prompts.language_pick.text);
});

test("all screen and step modules import (correct paths and exports)", async () => {
  for (const f of ["core/registry.js", "screens/start.js", "screens/language.js", "screens/audience.js", "screens/path.js", "screens/lesson.js"]) {
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
