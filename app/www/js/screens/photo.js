// "Read the world": photograph a word -> the server (Muse Spark) builds a lesson -> play it.
// Narrated by the pack (prompts.photo_hint): the screen speaks on arrival, like every screen.
// Text-free: camera tile, preview, replay tile. Without the YEKIVA server: cloudoff icon, back to path.
// The app NEVER calls Meta here: it POSTs the photo to {yekiva}/v1/lesson-from-photo,
// and the Yekiva server calls Meta (https://api.meta.ai/v1/chat/completions) server-side.
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
    if (!services.transcriber.available()) {
      show("cloudoff");
      setTimeout(() => go("path"), 1400);
      return;
    }
    show("");
    status.append(document.createTextNode("…"));
    const lesson = await services.transcriber.lessonFromPhoto(blob, state.language?.code);
    if (!lesson?.steps?.length) {
      show("alert");
      return;
    }
    // Play the generated lesson inline (same widgets as normal lessons).
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
