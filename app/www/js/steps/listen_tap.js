// "Listen and tap": the app says a syllable, the learner taps the right one.
// Voice comes from the PACK (step params.say, audio or TTS); on a wrong tap the pack-level
// encouragement (prompts.listen_hint) plays, falling back to the step's own voice.
// Works without network or microphone: it is also the plan B for voice exercises.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";

export function listenTap(ctx) {
  const { say, choices, answer } = ctx.step.params;
  let wrongOnce = false;
  const prompt = () => ctx.speak(say);
  const encourage = () => (ctx.hint ? ctx.hint("listen_hint") : prompt());
  const buttons = choices.map((c) => {
    const b = h("button", { class: "choice", type: "button" }, c.text);
    // Tap a choice to HEAR it first? No: tap = answer (one action per screen).
    // Long-press replays the prompt without answering.
    b.addEventListener("click", () => {
      if (c.id === answer) return ctx.onDone(!wrongOnce);
      // No punishment: a gentle shake, pack encouragement, let the learner retry.
      wrongOnce = true;
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      encourage();
    });
    return b;
  });

  // The choices themselves are speakable: tapping the volume tile replays the prompt.
  const el = h(
    "div",
    { class: "stack" },
    h("div", { class: "row small" }, tile("volume", { onClick: prompt })),
    h("div", { class: "choices" }, buttons),
  );
  el.destroy = () => ctx.services?.speaker.stop();
  prompt();
  return el;
}
