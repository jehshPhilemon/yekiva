// Turns a text-model answer (word + syllables) into a structured Yekiva lesson.
// The model supplies language content; our code owns steps, visual cues, and validation.

/** Extracts a JSON object from a model answer, even when wrapped in ```json ... ```. */
export function parseModelJson(text) {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON in the model's answer");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function iconForWord(word) {
  const key = String(word).trim().toLocaleLowerCase();
  if (["mama", "baba", "famille", "family"].includes(key)) return "family";
  if (["avion", "ndege", "airplane", "plane"].includes(key)) return "plane";
  if (["livre", "book", "kitabu", "libri"].includes(key)) return "book";
  if (["arbre", "tree", "trees", "mti", "miti", "plant", "plante"].includes(key)) return "plant";
  if (["lit", "bed", "lala"].includes(key)) return "bed";
  return "picture";
}

function contextFor(part, word, icon) {
  return { letter: Array.from(part)[0]?.toLocaleUpperCase() ?? "", word, icon };
}

// The "repeat after me" instruction must never leak the expected word
// (the quiz say_word hides it): generic per-language instructions.
const SAY_WORD_INSTRUCTION = {
  fr: "Ecoute le mot, puis dis-le a voix haute.",
  sw: "Sikiliza neno, kisha liseme kwa sauti.",
  ln: "Yoka liloba, mpe lobela yango.",
};
const SAY_WORD_QUIZ = {
  fr: "Derniere question : ecoute le mot, puis dis-le.",
  sw: "Swali la mwisho : sikiliza neno, kisha liseme.",
  ln: "Motuna ya suka : yoka liloba, mpe lobela yango.",
};
function instruction(lang, map) {
  return map[lang] ?? map.fr;
}

/** @param {{word: string, syllables: string[], language?: string, description?: string}} spark */
export function buildLesson(spark, { id = `photo-${Date.now()}` } = {}) {
  const lang = String(spark.language ?? "").toLowerCase() || null;
  const word = String(spark.word ?? "").trim().toLowerCase();
  const syllables = (spark.syllables ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  const description = typeof spark.description === "string" ? spark.description.trim().slice(0, 140) : "";
  if (lang === "ln") {
    const valid = (value) => /^[a-z]+$/.test(value);
    if (!valid(word) || syllables.some((value) => !valid(value))) {
      throw Object.assign(new Error("Lingala lesson must use plain ASCII Latin letters only"), { status: 422 });
    }
    if (description && !/^[a-zA-Z0-9 .,;:!?'-]*$/.test(description)) {
      throw Object.assign(new Error("Lingala lesson must use plain ASCII Latin letters only"), { status: 422 });
    }
  }
  if (!word || syllables.length === 0) throw new Error("missing word or syllables");

  const visual = iconForWord(word);
  const steps = [];
  const pool = [...new Set(syllables)];
  // 1. Hear each syllable, tap it.
  for (const s of pool) {
    const distractors = pool.filter((x) => x !== s);
    if (s.length > 1) distractors.push(s[0]);
    const choices = [s, ...distractors].slice(0, 3).map((t) => ({ id: t, text: t }));
    if (choices.length < 2) continue;
    steps.push({
      type: "listen_tap",
      items: [s],
      params: { say: { text: s }, choices, answer: s, context: contextFor(s, word, visual) },
    });
  }
  // 2. Hear the whole word, tap it.
  if (pool.length > 1 || word !== pool[0]) {
    steps.push({
      type: "listen_tap",
      items: [word],
      params: {
        say: { text: word },
        choices: [{ id: word, text: word }, ...pool.filter((s) => s !== word).slice(0, 2).map((s) => ({ id: s, text: s }))],
        answer: word,
        context: contextFor(word, word, visual),
      },
    });
  }
  if (steps.length === 0) throw new Error("cannot build a question from this word");
  // 3. Say the word aloud (microphone when available, graceful skip offline).
  steps.push({
    type: "say_word",
    items: [word],
    params: {
      word,
      say: { text: instruction(lang, SAY_WORD_INSTRUCTION) },
      context: contextFor(word, word, visual),
      hideWord: true,
    },
  });
  // 4. Quiz: prove it on new questions (the lesson player weighs them double).
  const candidates = [...pool, word].filter((v, i, a) => a.indexOf(v) === i);
  for (const q of candidates.slice(0, 3)) {
    const others = candidates.filter((v) => v !== q);
    const choices = [q, ...others].slice(0, 3).map((t) => ({ id: t, text: t }));
    if (choices.length < 2) continue;
    steps.push({
      type: "listen_tap",
      items: [`quiz:${q}`],
      params: {
        say: { text: q },
        choices,
        answer: q,
        context: contextFor(q, word, visual),
        isQuiz: true,
      },
    });
  }
  // 5. Final quiz: say the hidden word.
  steps.push({
    type: "say_word",
    items: [`quiz:${word}`],
    params: {
      word,
      say: { text: instruction(lang, SAY_WORD_QUIZ) },
      hideWord: true,
      context: contextFor(word, word, visual),
      isQuiz: true,
    },
  });
  return {
    id,
    language: lang,
    title: word,
    symbol: Array.from(word)[0]?.toLocaleUpperCase() ?? "",
    icon: visual,
    word,
    syllables: pool,
    description,
    steps,
  };
}
