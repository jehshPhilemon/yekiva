// "Listen and tap": hear a sound in a familiar word, then choose the matching sign.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";

export function listenTap(ctx) {
  const { say, choices, answer, image, context } = ctx.step.params;
  const labels = ctx.language.labels?.actions ?? {};
  let wrongOnce = false;
  const prompt = () => ctx.speak(say);
  const encourage = () => (ctx.hint ? ctx.hint("listen_hint") : prompt());
  const buttons = choices.map((c) => {
    const b = h("button", { class: "choice", type: "button", "aria-label": c.text ?? c.id },
      c.image ? h("img", { class: "choice-img", src: ctx.assetUrl(c.image), alt: "" }) : "",
      h("span", { class: "choice-text" }, c.text));
    b.addEventListener("click", () => {
      if (c.id === answer) return ctx.onDone(!wrongOnce);
      wrongOnce = true;
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      encourage();
    });
    return b;
  });

  const replay = tile("volume", {
    onClick: prompt,
    size: 48,
    label: labels.replay ?? "replay",
    caption: labels.replay,
    className: "lesson-action",
  });
  const el = h(
    "div",
    { class: "stack lesson-step" },
    h("div", { class: "row small lesson-actions" }, replay),
    contextCue(context),
    image ? h("img", { class: "prompt-img", src: ctx.assetUrl(image), alt: "" }) : "",
    h("div", { class: "choices" }, buttons),
  );
  el.destroy = () => ctx.services?.speaker.stop();
  prompt();
  return el;
}
