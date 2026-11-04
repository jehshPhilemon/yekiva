// "Say the word": hear a word (played twice, word HIDDEN), then say it.
// Anti-cheat: the expected word is NEVER shown as text nor spoken in the
// instruction. The learner hears the word itself (speaker plays it), sees only
// a "?" + the picture cue, then the microphone (or the "I said it" button when
// no transcription route exists). Items "quiz:*" count double in the gating.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";

export function sayWord(ctx) {
  const params = ctx.step.params ?? {};
  const { word, say, image, context } = params;
  const quiz = params.isQuiz === true;
  const labels = ctx.language.labels?.actions ?? {};
  // The word itself, played as audio (never displayed, never inside the instruction).
  const hearWord = () => ctx.speak({ text: word });
  const hearInstr = () => ctx.speak(say ?? { text: word });
  const encourage = () => (ctx.hint ? ctx.hint("say_hint") : hearWord());
  const status = h("div", { class: "status" });
  const show = (name) => status.replaceChildren(name ? icon(name, 64) : "");

  // Masked word box: "?" + picture, the word text is NEVER rendered.
  const wordBox = h("div", { class: "word word-masked" },
    image ? h("img", { src: ctx.assetUrl(image), alt: "" }) : "",
    h("span", { class: "word-mask", "aria-label": "mot caché" }, "?"));
  const replay = tile("volume", {
    onClick: hearWord, size: 48,
    label: labels.replay ?? "replay", caption: labels.replay,
    className: "lesson-action",
  });
  const el = h("div", { class: `stack lesson-step${quiz ? " is-quiz" : ""}` },
    h("div", { class: "row small lesson-actions" }, replay),
    contextCue(context), wordBox, status);

  // No transcription route in the API yet: self-check ("I said it") — counts as
  // unskipped but only half weight? No: it counts as success ONLY if the learner
  // first listened (hearWord played). Honest self-assessment for pre-readers.
  let listened = false;
  const origHear = hearWord;
  void origHear;
  const markListened = () => { listened = true; };

  // L’évaluation ne demande jamais l’accès au microphone.
  // L’apprenant écoute puis confirme avec le bouton : le micro est réservé
  // à l’écran Conversation, accessible depuis le parcours.
  show("check");
  const btn = tile("check", {
    onClick: () => {
      if (!listened) {
        hearWord();
        markListened();
        return;
      }
      ctx.onDone(true);
    },
    size: 48,
    label: labels.validate ?? "validate", caption: labels.continue,
    className: "lesson-action",
  });
  el.append(h("div", { class: "row small lesson-actions" }, btn));
  // Keep the pedagogical order: instruction first, then the target word.
  // Never launch two Audio elements concurrently.
  (async () => {
    await hearInstr();
    if (!el.isConnected) return;
    await hearWord();
    markListened();
  })();
  return el;
}
