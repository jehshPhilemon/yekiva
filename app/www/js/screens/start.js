// The welcome action is language-neutral; spoken guidance starts after the learner chooses a language.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";

export function startScreen({ services, go }) {
  const mark = h(
    "div",
    { class: "welcome-mark", "aria-hidden": "true" },
    icon("book", 82),
    h("span", { class: "welcome-sound" }, icon("volume", 34)),
  );
  const brand = h("div", { class: "welcome-brand" }, mark, h("h1", {}, "Yekiva"));

  const btn = tile("play", {
    size: 108,
    label: "Yekiva, commencer",
    className: "welcome-start",
    onClick: async () => {
      try {
        const warmup = services.speaker.ready();
        warmup?.catch?.(() => {});
      } catch { /* voice warmup must never block */ }
      go("language");
    },
  });

  return h("div", { class: "screen welcome-screen" }, brand, btn);
}
