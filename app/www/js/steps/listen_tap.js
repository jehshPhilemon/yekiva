// "Listen and tap": hear a sound in a familiar word, then choose the matching sign.
// The target syllable/letter is HIGHLIGHTED inside the example word (e.g. "bu" in "buku"),
// so a non-reader sees which part to listen for. Quiz steps (isQuiz) announce themselves.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";

/** Wraps the target part of the word in a highlight span (case-insensitive, first match). */
export function highlightTarget(word, target) {
  const w = String(word ?? "");
  const t = String(target ?? "").trim();
  if (!w || !t) return [w];
  const i = w.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return [w];
  return [w.slice(0, i), h("mark", { class: "hl" }, w.slice(i, i + t.length)), w.slice(i + t.length)];
}

export function listenTap(ctx, { isQuiz = false } = {}) {
  const params = ctx.step.params ?? {};
  const quiz = isQuiz || params.isQuiz === true;
  const { say, choices, answer, image, context } = params;
  const labels = ctx.language.labels?.actions ?? {};
  let wrongOnce = false;
  // Quiz: announce the test first ("Petit test..."), then the question itself.
  const prompt = async () => {
    if (quiz && !prompt._announced) {
      prompt._announced = true;
      const intro = ctx.language.prompts?.quiz_intro;
      if (intro?.text) await ctx.speak(intro);
    }
    return ctx.speak(say);
  };
  const encourage = () => (ctx.hint ? ctx.hint("listen_hint") : ctx.speak(say));
  const buttons = (choices ?? []).map((c) => {
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
    label: labels.replay ?? "replay", caption: labels.replay,
    className: "lesson-action",
  });
  // Highlight: the answer inside the example word (e.g. "bu" in "buku").
  const word = context?.word ?? "";
  const cue = context && word && answer
    ? { ...context, _highlight: answer }
    : context;
  const el = h(
    "div",
    { class: `stack lesson-step${quiz ? " is-quiz" : ""}` },
    h("div", { class: "row small lesson-actions" }, replay),
    contextCue(cue),
    image ? h("img", { class: "prompt-img", src: ctx.assetUrl(image), alt: "" }) : "",
    h("div", { class: "choices" }, buttons),
  );
  el.destroy = () => ctx.services?.speaker.stop();
  prompt();
  return el;
}
