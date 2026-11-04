import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packs = new URL("../www/packs/", import.meta.url);

const readJson = (path) => JSON.parse(readFileSync(new URL(path, packs), "utf8"));

test("each language begins with the same letter A lesson and a localized example (listen-then-choose, no drawing)", () => {
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
    assert.ok(!types.includes("trace_letter"), `${code} must not validate hand drawing`);
    assert.ok(types.filter((x) => x === "listen_tap").length >= 2, `${code}/letter-a needs 2+ listen-then-choose steps`);
    for (const step of lesson.steps) {
      if (step.params.glyph) assert.equal(step.params.glyph, "a:lower_script");
      if (step.type === "listen_tap") {
        assert.ok(Array.isArray(step.params.choices) && step.params.choices.length >= 3, `${code} listen_tap needs 3+ choices`);
        assert.ok(step.params.answer, `${code} listen_tap needs an answer`);
      }
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
      if (step.type !== "watch_write" && step.type !== "listen_tap") continue;
      assert.ok(step.params.context?.word, `${code} ${step.items[0]} needs a familiar word`);
      assert.ok(step.params.context?.icon, `${code} ${step.items[0]} needs a visual cue`);
      assert.ok(step.params.say?.text, `${code} ${step.items[0]} needs runtime voice text`);
    }
  }
});

test("every letter of the alphabet has a listen-first 4-step lesson in each language (no drawing)", () => {
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
      assert.ok(types.includes("watch_write"), `${code}/${lid} needs watch_write (animated demo)`);
      assert.ok(!types.includes("trace_letter"), `${code}/${lid} must not validate hand drawing`);
      assert.ok(types.filter((x) => x === "listen_tap").length >= 2, `${code}/${lid} needs 2+ listen-then-choose steps`);
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

test("lessons end with a real quiz on new questions (weight x2), words never leaked", () => {
  for (const code of ["fr", "sw", "ln"]) {
    for (const lid of ["letter-a", "lettre-b", "syllabes-ba"]) {
      let lesson;
      try { lesson = readJson(`${code}/lessons/${lid}.json`); } catch { continue; }
      const quiz = lesson.steps.filter((s) => (s.items ?? []).some((i) => String(i).startsWith("quiz:")));
      assert.ok(quiz.length >= 3, `${code}/${lid} needs 3+ quiz steps, got ${quiz.length}`);
      // Quiz questions must be listen_tap with 3 choices, or masked say_word.
      for (const q of quiz) {
        if (q.type === "listen_tap") {
          assert.ok(q.params.choices.length >= 3, `${code}/${lid} quiz needs 3 choices`);
        } else {
          assert.equal(q.type, "say_word", `${code}/${lid} quiz must be tap or say, got ${q.type}`);
          assert.equal(q.params.hideWord, true, `${code}/${lid} quiz say must hide the word`);
        }
      }
      // Anti-cheat: no say_word leaks the expected word in its instruction.
      for (const s of lesson.steps) {
        if (s.type !== "say_word") continue;
        const w = String(s.params.word ?? "");
        const say = String(s.params.say?.text ?? "");
        assert.ok(!say.toLowerCase().includes(w.toLowerCase()) || !w, `${code}/${lid} say_word leaks "${w}"`);
      }
    }
  }
});
test("quiz weight doubles proving questions in the gating score", async () => {
  const { PASS_RATE, QUIZ_WEIGHT } = await import("../www/js/screens/lesson.js");
  assert.equal(PASS_RATE, 0.7);
  assert.equal(QUIZ_WEIGHT, 2);
});
