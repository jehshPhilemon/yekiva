// "Word game": the interactive finale replacing the static repeat.
// The learner hears a NEW word (never the lesson's drill word), sees 3 picture
// cues (icons) + "?" masks, taps the right picture, then says the word.
// New words prove transfer: learned with "mama", tested with other words.
// params: { target: {word, icon}, choices: [{word, icon}], , say, context }
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";

function spokenButton(tileEl, speakIt) {
  tileEl.addEventListener("click", () => {
    tileEl.classList.add("blink");
    Promise.resolve()
      .then(speakIt)
      .catch(() => {})
      .finally(() => setTimeout(() => tileEl.classList.remove("blink"), 400));
  });
  return tileEl;
}

export function wordGame(ctx) {
  const params = ctx.step.params ?? {};
  const quiz = params.isQuiz === true;
  const { target, choices = [], say, context } = params;
  const labels = ctx.language.labels?.actions ?? {};
  const word = target?.word ?? "";
  const hearWord = () => ctx.speak({ text: word });
  const hearInstr = () => ctx.speak(say ?? { text: word });
  const encourage = () => (ctx.hint ? ctx.hint("say_hint") : hearWord());
  let wrongOnce = false;
  let found = false;
  const status = h("div", { class: "status" });

  // Round 1 — listen: hear the NEW word, tap its picture among 3.
  const buttons = choices.map((c) => {
    const b = h("button", { class: "choice", type: "button", "aria-label": c.word },
      icon(c.icon ?? "book", 64),
      h("span", { class: "choice-text" }, "?"));
    b.addEventListener("click", () => {
      if (found) return;
      if (c.word === word) {
        found = true;
        b.classList.add("blink");
        setTimeout(() => b.classList.remove("blink"), 900);
        // Round 2 — say: hear it once more, the "continuer" voice plays
        // AUTOMATICALLY, then the lesson moves on. No tap is required:
        // waiting for a click on a silent check button loses pre-readers.
        (async () => {
          await hearWord();
          if (!el.isConnected) return;
          status.replaceChildren(icon("check", 64));
          const cc = ctx.language.labels?.actions?.continue;
          if (cc) await ctx.speak({ text: cc });
          if (!el.isConnected) return;
          ctx.onDone(!wrongOnce);
        })();
      } else {
        wrongOnce = true;
        b.classList.remove("shake");
        void b.offsetWidth;
        b.classList.add("shake");
        encourage();
      }
    });
    return b;
  });

  const replayBtn = tile("volume", {
    onClick: hearInstr, size: 48,
    label: labels.replay ?? "replay", caption: labels.replay,
    className: "lesson-action",
  });
  const replay = spokenButton(replayBtn, hearInstr);
  const el = h("div", { class: `stack lesson-step${quiz ? " is-quiz" : ""}` },
    h("div", { class: "row small lesson-actions" }, replay),
    contextCue(context),
    h("div", { class: "choices" }, buttons),
    status);
  el.destroy = () => ctx.services?.speaker.stop();
  (async () => {
    await hearInstr();
    if (!el.isConnected) return;
    await hearWord();
    if (!el.isConnected) return;
    const r = labels.replay;
    if (r) await ctx.speak({ text: r });
  })();
  return el;
}
