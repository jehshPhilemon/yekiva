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

/** @param {{word: string, syllables: string[], language?: string}} spark */
export function buildLesson(spark, { id = `photo-${Date.now()}` } = {}) {
  const word = String(spark.word ?? "").trim().toLowerCase();
  const syllables = (spark.syllables ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  if (!word || syllables.length === 0) throw new Error("missing word or syllables");

  const visual = iconForWord(word);
  const steps = [];
  const pool = [...new Set(syllables)];
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
  return {
    id,
    language: spark.language ?? null,
    title: word,
    symbol: Array.from(word)[0]?.toLocaleUpperCase() ?? "",
    icon: visual,
    steps,
  };
}
