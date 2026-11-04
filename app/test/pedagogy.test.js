import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packs = new URL("../www/packs/", import.meta.url);

const readJson = (path) => JSON.parse(readFileSync(new URL(path, packs), "utf8"));

test("each language begins with the same traceable letter A lesson and a localized example", () => {
  const examples = { fr: "avion", sw: "mama", ln: "mama" };
  for (const code of Object.keys(examples)) {
    const manifest = readJson(`${code}/manifest.json`);
    const glyphs = readJson(`${code}/glyphs.json`);
    const lesson = readJson(`${code}/lessons/letter-a.json`);
    assert.equal(manifest.tracks.adult[0], "letter-a", `${code} adult path should start with A`);
    assert.equal(manifest.tracks.child[0], "letter-a", `${code} child path should start with A`);
    assert.ok(glyphs["a:lower_script"], `${code} needs an offline A tracing model`);
    const types = lesson.steps.map((s) => s.type);
    assert.ok(types.includes("watch_write"));
    assert.ok(types.includes("trace_letter"));
    for (const step of lesson.steps) {
      if (step.params.glyph) assert.equal(step.params.glyph, "a:lower_script");
      assert.equal(step.params.context.word, examples[code]);
      assert.ok(step.params.context.icon);
      assert.ok(step.params.say.text);
    }
  }
});

test("existing letter lessons connect sound, familiar word, and picture cue", () => {
  for (const code of ["fr", "sw", "ln"]) {
    const lesson = readJson(`${code}/lessons/i-l.json`);
    for (const step of lesson.steps) {
      if (step.type !== "watch_write" && step.type !== "trace_letter") continue;
      assert.ok(step.params.context?.word, `${code} ${step.items[0]} needs a familiar word`);
      assert.ok(step.params.context?.icon, `${code} ${step.items[0]} needs a visual cue`);
      assert.ok(step.params.say?.text, `${code} ${step.items[0]} needs runtime voice text`);
    }
  }
});

test("every letter of the alphabet has a traceable 4-step lesson in each language", () => {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  for (const code of ["fr", "sw", "ln"]) {
    const manifest = readJson(`${code}/manifest.json`);
    const glyphs = readJson(`${code}/glyphs.json`);
    for (const L of letters) {
      const lid = L === "a" ? "letter-a" : L === "i" || L === "l" ? "i-l"
        : L === "e" ? "voyelle-e" : L === "o" ? "voyelle-o" : L === "u" ? "voyelle-u"
        : L === "m" ? "consonne-m" : L === "n" ? "consonne-n" : L === "t" ? "consonne-t"
        : L === "s" ? "consonne-s" : `lettre-${L}`;
      assert.ok(manifest.tracks.adult.includes(lid), `${code} adult track missing ${lid}`);
      assert.ok(glyphs[`${L}:lower_script`], `${code} missing glyph ${L}:lower_script`);
      const lesson = readJson(`${code}/lessons/${lid}.json`);
      const types = lesson.steps.map((s) => s.type);
      assert.ok(types.includes("watch_write"), `${code}/${lid} needs watch_write`);
      assert.ok(types.includes("trace_letter"), `${code}/${lid} needs trace_letter`);
      assert.ok(types.includes("listen_tap"), `${code}/${lid} needs listen_tap`);
      assert.ok(types.includes("say_word"), `${code}/${lid} needs say_word`);
      for (const step of lesson.steps) {
        assert.ok(step.params.say?.text, `${code}/${lid}/${step.type} needs spoken explanation`);
        assert.ok(step.params.context?.word, `${code}/${lid}/${step.type} needs familiar word`);
      }
    }
  }
});

test("digraph and trigraph lessons teach combined sounds with a familiar word", () => {
  const expected = {
    fr: ["digraphe-ch", "digraphe-ou", "digraphe-on", "digraphe-an", "digraphe-oi", "digraphe-gn"],
    sw: ["digraphe-ch", "digraphe-dh", "digraphe-gh", "digraphe-ng", "digraphe-ny", "digraphe-sh",
         "digraphe-th", "digraphe-mb", "digraphe-nd", "digraphe-nj", "digraphe-nt", "digraphe-nz"],
    ln: ["digraphe-mb", "digraphe-nd", "digraphe-ng", "digraphe-nj", "digraphe-nz", "digraphe-mp",
         "digraphe-nt", "digraphe-ch", "digraphe-sh", "digraphe-ph"],
  };
  for (const code of Object.keys(expected)) {
    const manifest = readJson(`${code}/manifest.json`);
    for (const lid of expected[code]) {
      assert.ok(manifest.tracks.adult.includes(lid), `${code} adult track missing ${lid}`);
      const lesson = readJson(`${code}/lessons/${lid}.json`);
      const types = lesson.steps.map((s) => s.type);
      assert.ok(types.includes("listen_tap"), `${code}/${lid} needs listen_tap`);
      assert.ok(types.includes("say_word"), `${code}/${lid} needs say_word`);
      for (const step of lesson.steps) {
        assert.ok(step.params.say?.text, `${code}/${lid}/${step.type} needs spoken explanation`);
        assert.ok(step.params.context?.word, `${code}/${lid}/${step.type} needs familiar word`);
      }
    }
  }
});
