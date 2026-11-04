// Lesson templates: the AI (or a human) fills a few FIELDS, our code builds the STEPS.
// Pure JS, no DOM: usable by the app, the server and the tools. The model never writes
// the step structure itself, so what it produces always passes tools/validate-packs.mjs.

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * "Sound lesson": meet a sound with a keyword picture, find the picture by ear, link words to pictures, say the word.
 * @param {object} o
 * @param {string} o.id        lesson id (unique per language)
 * @param {string} o.item      letter or syllable introduced, e.g. "m"
 * @param {string} o.word      keyword that starts with it, e.g. "mti"
 * @param {string} o.image     picture of the keyword, path inside the pack, e.g. "images/tree.svg"
 * @param {string} o.say       spoken introduction, in the pack's language (text only)
 * @param {{word:string,image:string}[]} o.distractors  other pictures (at least 1)
 */
export function soundLesson({ id, item, word, image, say, distractors }) {
  if (!id || !item || !word || !image || !say) throw new Error("soundLesson: id, item, word, image and say are required");
  if (!Array.isArray(distractors) || distractors.length < 1) throw new Error("soundLesson: at least 1 distractor is required");
  const others = distractors.map((d) => ({ id: d.word, image: d.image }));
  // The right answer must not always be in the same place: its slot depends on the lesson id.
  const at = hash(id) % (others.length + 1);
  const choices = [...others.slice(0, at), { id: word, image }, ...others.slice(at)];
  return {
    id,
    steps: [
      { type: "meet_sound", items: [item], params: { item, word, image, say: { text: say } } },
      { type: "listen_tap", items: [word], params: { say: { text: word }, choices, answer: word } },
      {
        type: "match_pairs",
        items: [word, ...distractors.map((d) => d.word)],
        params: { pairs: [{ id: word, left: { text: word }, right: { image } }, ...distractors.map((d) => ({ id: d.word, left: { text: d.word }, right: { image: d.image } }))] },
      },
      { type: "say_word", items: [word], params: { word, say: { text: word }, image } },
    ],
  };
}
