// The welcome action is language-neutral; spoken guidance starts after the learner chooses a language.
// Testeurs : 5 tapes rapides sur le logo "Yekiva" affichent le bandeau d'erreurs
// (diagnostic tactile, sans URL ni console). 5 tapes à nouveau = on le retire.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";

export function startScreen({ services, go }) {
  const mark = h(
    "div",
    { class: "welcome-mark", "aria-hidden": "true" },
    h("img", { src: "icons/logo-yekiva.jpg", alt: "Yekiva", class: "welcome-logo" }),
  );
  const brand = h("div", { class: "welcome-brand" }, mark);

  // Activation tactile du bandeau debug : 5 tapes < 3 s sur la marque.
  let taps = [];
  brand.style.cursor = "pointer";
  brand.addEventListener("click", () => {
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < 3000), now];
    if (taps.length >= 5) {
      taps = [];
      try {
        const on = window.YEKIVA?.debugToggle?.() ?? false;
        void on;
      } catch { /* ignore */ }
    }
  });

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
