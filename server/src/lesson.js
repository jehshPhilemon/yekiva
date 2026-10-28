// Turns the vision model's answer (word + syllables) into a lesson in the docs/LESSON_FORMAT.md format.
// The model only decides the content; the lesson's shape stays ours (hence validatable).

/** Extracts a JSON object from a model answer, even when wrapped in ```json ... ```. */
export function parseModelJson(text) {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON in the model's answer");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** @param {{word: string, syllables: string[], language?: string}} spark */
export function buildLesson(spark, { id = `photo-${Date.now()}` } = {}) {
  const word = String(spark.word ?? "").trim().toLowerCase();
  const syllables = (spark.syllables ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (!word || syllables.length === 0) throw new Error("missing word or syllables");

  const steps = [];
  const pool = [...new Set(syllables)];
  for (const s of pool) {
    const distractors = pool.filter((x) => x !== s);
    if (s.length > 1) distractors.push(s[0]);
    const choices = [s, ...distractors].slice(0, 3).map((t) => ({ id: t, text: t }));
    if (choices.length < 2) continue; // no question possible: skip
    steps.push({ type: "listen_tap", items: [s], params: { say: { text: s }, choices, answer: s } });
  }
  if (pool.length > 1 || word !== pool[0]) {
    steps.push({
      type: "listen_tap",
      items: [word],
      params: {
        say: { text: word },
        choices: [{ id: word, text: word }, ...pool.filter((s) => s !== word).slice(0, 2).map((s) => ({ id: s, text: s }))],
        answer: word,
      },
    });
  }
  if (steps.length === 0) throw new Error("cannot build a question from this word");
  return { id, language: spark.language ?? null, steps };
}
