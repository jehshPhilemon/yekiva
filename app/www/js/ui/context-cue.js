import { h } from "./dom.js";
import { icon } from "./icons.js";

/**
 * A no-raster, offline association cue: written form -> a familiar word -> a vector icon.
 * Voice remains the instruction; the cue is there for learners who benefit from seeing it.
 * When context._highlight is set (e.g. "bu"), that part is wrapped in <mark>
 * inside the example word (e.g. "buku") so a non-reader sees what to listen for.
 */
export function contextCue(context) {
  if (!context) return null;
  const letter = context.letter ?? "";
  const word = String(context.word ?? "");
  const hl = String(context._highlight ?? "").trim();
  let wordNode = word;
  if (word && hl) {
    const i = word.toLowerCase().indexOf(hl.toLowerCase());
    if (i >= 0) {
      wordNode = h("span", { class: "context-word" },
        word.slice(0, i),
        h("mark", { class: "hl" }, word.slice(i, i + hl.length)),
        word.slice(i + hl.length));
    }
  }
  if (typeof wordNode === "string") wordNode = h("span", { class: "context-word" }, wordNode);
  const visual = icon(context.icon ?? "book", 64);
  visual.setAttribute("aria-hidden", "true");

  return h(
    "div",
    {
      class: "lesson-context",
      role: "group",
      "aria-label": [letter, word].filter(Boolean).join(" — "),
    },
    h("div", { class: "context-picture" }, visual),
    h(
      "div",
      { class: "context-copy" },
      h("span", { class: "context-letter" }, letter),
      h("span", { class: "context-arrow", "aria-hidden": "true" }, "→"),
      wordNode,
    ),
  );
}
