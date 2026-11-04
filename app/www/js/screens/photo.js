// "Read the world": photographie un mot, puis Meta génère une mini-leçon.
// AUJOURD'HUI : pas de route photo dans l'API -> l'écran l'explique en voix
// (prompts.photo_hint) et repart au parcours. Aucun appel Meta, aucun serveur
// intermédiaire. Quand la route existera, brancher voiceApi.lessonFromPhoto()
// (elle renverra une leçon au lieu de null) — le jeu inline ci-dessous est prêt.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { registry } from "../core/registry.js";
import { screenPrompt } from "../core/narrate.js";

export function photoScreen({ services, state, go }) {
  const status = h("div", { class: "status" });
  const preview = h("div", { class: "photo-preview" });
  const show = (name) => status.replaceChildren(name ? icon(name, 64) : "");
  let blob = null;

  const pick = h("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none" });
  pick.addEventListener("change", () => {
    const f = pick.files?.[0];
    if (!f) return;
    blob = f;
    preview.replaceChildren("");
    const img = h("img", { alt: "" });
    img.src = URL.createObjectURL(f);
    preview.replaceChildren(img);
    show("");
    play();
  });

  async function play() {
    if (!blob) return;
    const lesson = await services.transcriber.lessonFromPhoto(blob, state.language?.code);
    if (!lesson?.steps?.length) {
      // API indisponible ou photo illisible : retour gracieux au parcours.
      show("cloudoff");
      setTimeout(() => go("path"), 1600);
      return;
    }
    // Route photo disponible un jour : joue la leçon générée inline.
    const learner = services.learnerFor(state.language.code);
    const steps = lesson.steps.filter((s) => registry[s.type]);
    let i = 0;
    const render = () => {
      if (i >= steps.length) {
        services.saveLearner(state.language.code);
        return go("path");
      }
      const step = steps[i];
      const el = registry[step.type]({
        step,
        language: state.language,
        services,
        speak: (say) => services.speaker.say(say, state.language.code, state.language.basePackId),
        assetUrl: (p) => services.packs.assetUrl(state.language.basePackId, p),
        onDone: (ok) => {
          if (ok !== null) for (const item of step.items ?? []) learner.record(item, ok);
          i++;
          render();
        },
      });
      body.replaceChildren(el);
    };
    const body = h("div", { class: "stack" });
    screen.replaceChildren(body);
    render();
  }

  const screen = h(
    "div",
    { class: "screen" },
    preview,
    status,
    h("div", { class: "row" }, tile("camera", { onClick: () => pick.click(), size: 96, label: "photo" })),
    h("div", { class: "row small" }, tile("volume", {
      onClick: () => screenPrompt(services, state.language, "photo_hint"),
      size: 56,
      label: "reecouter",
    })),
    pick,
  );
  screen.destroy = () => services.speaker.stop();
  queueMicrotask(() => screenPrompt(services, state.language, "photo_hint"));
  return screen;
}
