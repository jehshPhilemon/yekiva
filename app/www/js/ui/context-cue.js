import { h } from "./dom.js";
import { icon } from "./icons.js";

/**
 * A no-raster, offline association cue: written form -> a familiar word -> a vector icon.
 * Voice remains the instruction; the cue is there for learners who benefit from seeing it.
 */
export function contextCue(context) {
  if (!context) return null;
  const letter = context.letter ?? "";
  const word = context.word ?? "";
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
      h("span", { class: "context-word" }, word),
    ),
  );
}
