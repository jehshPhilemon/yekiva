// "Listen and tap": the app says a syllable, the learner taps the right one.
// Works without network or microphone: it is also the plan B for voice exercises.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";

export function listenTap(ctx) {
  const { say, choices, answer } = ctx.step.params;
  let wrongOnce = false;
  const prompt = () => ctx.speak(say);

  const buttons = choices.map((c) => {
    const b = h("button", { class: "choice", type: "button" }, c.text);
    b.addEventListener("click", () => {
      if (c.id === answer) return ctx.onDone(!wrongOnce);
      // No punishment: a gentle shake, replay the prompt, let the learner retry.
      wrongOnce = true;
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      prompt();
    });
    return b;
  });

  const el = h(
    "div",
    { class: "stack" },
    h("div", { class: "row small" }, tile("volume", { onClick: prompt })),
    h("div", { class: "choices" }, buttons)
  );
  prompt();
  return el;
}
