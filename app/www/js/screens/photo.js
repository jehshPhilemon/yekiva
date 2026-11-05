// "Read the world": photographie un mot, Meta l'explique (description simple)
// puis génère une vraie leçon (répétition + quiz) jouée inline.
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
    let cancelled = false;
    const cancel = () => { cancelled = true; };
    screen.destroy = cancel;
    // Processing feedback: the analysis takes a few seconds (photo -> Spark -> lesson).
    status.replaceChildren(icon("volume", 64));
    const waitMsg = state.language?.photo_analyzing?.text ?? "";
    status.append(waitMsg);
    status.classList.add("is-working");
    await services.speaker.say({ text: waitMsg }, state.language?.code, state.language?.basePackId);
    if (cancelled) return;
    let lesson = null;
    try {
      lesson = await services.transcriber.lessonFromPhoto(blob, state.language?.code);
    } catch {
      lesson = null;
    }
    status.classList.remove("is-working");
    if (cancelled) return;
    if (!lesson?.steps?.length) {
      // API indisponible ou photo illisible : l'expliquer en voix, puis parcours.
      const sorry = state.language?.photo_failed?.text ?? "";
      status.replaceChildren(icon("cloudoff", 64));
      status.append(sorry);
      await services.speaker.say({ text: sorry }, state.language?.code, state.language?.basePackId);
      if (!cancelled) setTimeout(() => go("path"), 2600);
      return;
    }
    // 1. L'app explique l'image : le mot lu + ce qui est visible.
    // Tout est localise dans le pack (photo_seen_yes/photo_seen_no): aucun
    // mot francais en dur, meme quand la description manque.
    const word = lesson.word ?? lesson.title ?? "";
    const desc = typeof lesson.description === "string" ? lesson.description.trim() : "";
    const seenYes = state.language?.photo_seen_yes?.text ?? null;
    const seenNo = state.language?.photo_seen_no?.text ?? null;
    const intro = desc
      ? (seenYes ? seenYes.replace("{word}", word).replace("{desc}", desc) : `${desc}`)
      : (seenNo ? seenNo.replace("{word}", word) : word);
    await services.speaker.say({ text: intro }, state.language?.code, state.language?.basePackId);
    if (cancelled) return;
    // 2. Joue la leçon générée inline (répétition + quiz).
    const learner = services.learnerFor(state.language.code);
    const steps = lesson.steps.filter((s) => registry[s.type]);
    let i = 0;
    const render = () => {
      if (cancelled) return;
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
