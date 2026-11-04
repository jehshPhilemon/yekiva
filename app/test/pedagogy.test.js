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
    for (const g of ["A:upper_print", "a:lower_print", "a:lower_script", "A:upper_script"]) {
      assert.ok(glyphs[g], `${code} needs the A form '${g}' (print + script, upper + lower)`);
    }
    const types = lesson.steps.map((s) => s.type);
    assert.ok(types.includes("watch_write"));
    assert.ok(!types.includes("trace_letter"), `${code} must not validate hand drawing`);
    assert.ok(types.filter((x) => x === "listen_tap").length >= 2, `${code}/letter-a needs 2+ listen-then-choose steps`);
    const shown = lesson.steps.filter((s) => s.type === "watch_write").map((s) => s.params.glyph);
    for (const g of ["A:upper_print", "a:lower_print", "a:lower_script", "A:upper_script"]) {
      assert.ok(shown.includes(g), `${code}/letter-a must show the A form '${g}'`);
    }
    for (const step of lesson.steps) {
      if (step.params.glyph) assert.ok(glyphs[step.params.glyph], `${code} uses unknown glyph '${step.params.glyph}'`);
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

test("voice-first: every conversation status and every quiz prompt exists in all 3 languages", async () => {
  const { readFileSync } = await import("node:fs");
  for (const code of ["fr", "sw", "ln"]) {
    const m = JSON.parse(readFileSync(new URL(`../www/packs/${code}/manifest.json`, import.meta.url), "utf8"));
    for (const k of ["conversation_hint", "conversation_recording", "conversation_sending", "conversation_thinking", "conversation_received", "conversation_offline", "conversation_mic_error", "conversation_empty"]) {
      assert.ok(m[k]?.text, `${code} needs pack prompt '${k}' (every chat status is spoken)`);
    }
  }
  const conv = readFileSync(new URL("../www/js/screens/conversation.js", import.meta.url), "utf8");
  // No silent status: setStatus is always paired with say() (via sayStatus or direct await say).
  const statuses = (conv.match(/setStatus\(/g) ?? []).length;
  const speaks = (conv.match(/await say\(/g) ?? []).length;
  assert.ok(speaks >= statuses, `every shown status must be spoken (${speaks} say for ${statuses} setStatus)`);
  assert.ok(conv.includes("await say(sending)"), "the sending status must be spoken");
  assert.ok(conv.includes("await say(thinking)"), "the thinking status must be spoken");
  assert.ok(conv.includes("await say({ text: answer"), "the Spark reply must be read aloud (text alone is not enough)");
});

test("sw/ln lessons speak their own language (no French voice text)", () => {
  const fr = /[ÉÈ]coute|Touche|Question|Derni[eè]re|Bravo|Petit test|lettre du son|comme avion/i;
  for (const code of ["sw", "ln"]) {
    const manifest = readJson(`${code}/manifest.json`);
    for (const track of Object.values(manifest.tracks ?? {})) {
      for (const lid of track) {
        let lesson;
        try { lesson = readJson(`${code}/lessons/${lid}.json`); } catch { continue; }
        for (const step of lesson.steps ?? []) {
          const say = step.params?.say?.text ?? "";
          assert.ok(!fr.test(say), `${code}/${lid}: French voice text leaked: "${say.slice(0, 60)}"`);
        }
      }
    }
  }
});

test("quizzes only use taught letters (never an untaught letter as answer or distractor)", () => {
  for (const code of ["fr", "sw", "ln"]) {
    const manifest = readJson(`${code}/manifest.json`);
    const known = new Set();
    for (const lid of manifest.tracks.adult) {
      let lesson;
      try { lesson = readJson(`${code}/lessons/${lid}.json`); } catch { continue; }
      const taught = new Set();
      for (const st of lesson.steps ?? []) {
        for (const it of st.items ?? []) {
          if (!String(it).startsWith("quiz:") && String(it).length === 1 && /[a-z]/i.test(it)) taught.add(String(it).toLowerCase());
        }
      }
      const avail = new Set([...known, ...taught]);
      for (const st of lesson.steps ?? []) {
        if (st.type !== "listen_tap") continue;
        const ans = String(st.params?.answer ?? "").toLowerCase();
        assert.ok(!/^[a-z]$/.test(ans) || avail.has(ans), `${code}/${lid}: quiz answer '${ans}' was never taught`);
        for (const c of st.params?.choices ?? []) {
          const base = String(c.id ?? "").toLowerCase().replace("-script", "");
          assert.ok(!/^[a-z]$/.test(base) || avail.has(base), `${code}/${lid}: choice '${c.id}' was never taught (confusing distractor)`);
        }
      }
      for (const t of taught) known.add(t);
    }
  }
});

test("every letter shows its 4 versions (print upper/lower in system fonts, script upper/lower in Parisienne)", async () => {
  // Print = real system fonts (serif caps / sans lowercase), script = Parisienne.
  // No hand-made stroke bricolage anywhere: watch_write renders all 4 via fonts.
  const { readFileSync } = await import("node:fs");
  const ww = readFileSync(new URL("../www/js/steps/watch_write.js", import.meta.url), "utf8");
  assert.ok(ww.includes("upper_print") && ww.includes("lower_print"), "watch_write renders print via fonts");
  assert.ok(ww.includes("upper_script") && ww.includes("lower_script"), "watch_write renders script via fonts");
  assert.ok(ww.includes("print-letter"), "print uses the print-letter card (system fonts)");
  assert.ok(ww.includes("script-letter"), "script uses the Parisienne card");
  const css = readFileSync(new URL("../www/css/app.css", import.meta.url), "utf8");
  assert.ok(css.includes("print-upper") || css.includes("print-letter"), "CSS styles print versions (system serif/sans)");
  assert.ok(css.includes("Parisienne"), "CSS loads Parisienne for handwriting");
  const lt = readFileSync(new URL("../www/js/steps/listen_tap.js", import.meta.url), "utf8");
  assert.ok(lt.includes("print-upper") && lt.includes("print-lower") && lt.includes("script"), "choices use the 4 font versions (never bricolage)");
  // letter-a demonstrates all 4 versions of A in the lesson itself.
  for (const code of ["fr", "sw", "ln"]) {
    const lesson = readJson(`${code}/lessons/letter-a.json`);
    const glyphs = readJson(`${code}/glyphs.json`);
    const shown = lesson.steps.filter((s) => s.type === "watch_write").map((s) => s.params.glyph);
    for (const g of ["A:upper_print", "a:lower_print", "a:lower_script", "A:upper_script"]) {
      assert.ok(shown.includes(g), `${code}/letter-a must show the A form '${g}'`);
      assert.ok(glyphs[g], `${code} needs the A form '${g}'`);
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
