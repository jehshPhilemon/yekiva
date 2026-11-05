// "Listen and tap": hear a sound in a familiar word, then choose the matching sign.
// The target syllable/letter is HIGHLIGHTED inside the example word (e.g. "bu" in "buku"),
// so a non-reader sees which part to listen for. Quiz steps (isQuiz) announce themselves.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";

// Spoken button: blink the tile while its voice plays (illiterate-first: every
// button is heard AND seen). speakIt resolves when the TTS finishes.
function spokenButton(tileEl, speakIt) {
  const orig = tileEl;
  orig.addEventListener("click", () => {
    orig.classList.add("blink");
    Promise.resolve()
      .then(speakIt)
      .catch(() => {})
      .finally(() => setTimeout(() => orig.classList.remove("blink"), 400));
  });
  return orig;
}


/** Wraps the target part of the word in a highlight span (case-insensitive, first match). */
export function highlightTarget(word, target) {
  const w = String(word ?? "");
  const t = String(target ?? "").trim();
  if (!w || !t) return [w];
  const i = w.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return [w];
  return [w.slice(0, i), h("mark", { class: "hl" }, w.slice(i, i + t.length)), w.slice(i + t.length)];
}

/** 4 versions: script (Parisienne) vs print (system serif/sans); upper (serif caps) vs lower (sans). */
function choiceFontClass(c) {
  const font = String(c.font ?? "");
  if (/:upper_script|:lower_script/.test(font) || font === "script") return "script";
  const text = String(c.text ?? c.id ?? "");
  const isUpper = text === text.toUpperCase() && /[A-Z]/.test(text);
  if (/print/.test(font) || !font) return isUpper ? "print-upper" : "print-lower";
  return "";
}

export function listenTap(ctx, { isQuiz = false } = {}) {
  const params = ctx.step.params ?? {};
  const quiz = isQuiz || params.isQuiz === true;
  const { say, choices, answer, answers, image, context } = params;
  // A letter can have several accepted forms (print A + Parisienne A):
  // tapping any of them is correct, never a trick with an untaught letter.
  const good = new Set([answer, ...(answers ?? [])].filter(Boolean));
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
      h("span", { class: "choice-text " + choiceFontClass(c) }, c.text));
    b.addEventListener("click", () => {
      if (good.has(c.id)) return ctx.onDone(!wrongOnce);
      wrongOnce = true;
      b.classList.remove("shake");
      void b.offsetWidth;
      b.classList.add("shake");
      encourage();
    });
    return b;
  });

  const replayBtn = tile("volume", {
    onClick: prompt,
    size: 48,
    label: labels.replay ?? "replay", caption: labels.replay,
    className: "lesson-action",
  });
  const replay = spokenButton(replayBtn, prompt);
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
  (async () => {
    await prompt();
    if (!el.isConnected) return;
    // The pre-reader cannot find a silent replay button: name it right away.
    const r = labels.replay;
    if (r) await ctx.speak({ text: r });
  })();
  return el;
}
