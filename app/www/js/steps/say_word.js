// "Say the word": see/hear a contextual word, then repeat it while holding the microphone.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";
import { isAccepted } from "../core/match.js";

const MAX_TRIES = 3;

export function sayWord(ctx) {
  const { word, say, image, context } = ctx.step.params;
  const { recorder, transcriber } = ctx.services;
  const labels = ctx.language.labels?.actions ?? {};
  const hear = () => ctx.speak(say ?? { text: word });
  const encourage = () => (ctx.hint ? ctx.hint("say_hint") : hear());

  const status = h("div", { class: "status" });
  const show = (name) => status.replaceChildren(name ? icon(name, 64) : "");

  const wordBox = h("div", { class: "word" }, image ? h("img", { src: ctx.assetUrl(image), alt: "" }) : "", word);
  const replay = tile("volume", {
    onClick: hear, size: 48,
    label: labels.replay ?? "replay", caption: labels.replay,
    className: "lesson-action",
  });
  const el = h("div", { class: "stack lesson-step" }, h("div", { class: "row small lesson-actions" }, replay), contextCue(context), wordBox, status);

  if (!transcriber.available()) {
    show("cloudoff");
    el.append(h("div", { class: "row small lesson-actions" }, tile("check", {
      onClick: () => ctx.onDone(null), size: 48,
      label: labels.continue ?? "continue", caption: labels.continue,
      className: "lesson-action",
    })));
    hear();
    return el;
  }

  const mic = tile("mic", { size: 96, label: ctx.language.prompts?.say_hint?.text ?? "repeat" });
  el.append(h("div", { class: "row" }, mic));

  let holding = false;
  let recording = false;
  let busy = false;
  let tries = 0;

  async function finish() {
    recording = false;
    mic.classList.remove("blink");
    busy = true;
    const wav = await recorder.stop();
    if (!wav) { busy = false; return; }
    const heard = await transcriber.transcribe(wav, ctx.language.code);
    if (heard === null) {
      show("cloudoff");
      setTimeout(() => ctx.onDone(null), 1200);
      return;
    }
    if (isAccepted(word, heard, ctx.language.matching).ok) {
      show("star");
      setTimeout(() => ctx.onDone(tries === 0), 900);
      return;
    }
    tries++;
    if (tries >= MAX_TRIES) return ctx.onDone(false);
    mic.classList.add("shake");
    setTimeout(() => mic.classList.remove("shake"), 400);
    busy = false;
    encourage();
  }

  mic.addEventListener("pointerdown", async (e) => {
    e.preventDefault();
    if (busy || holding) return;
    holding = true;
    ctx.services.speaker.stop();
    try {
      await recorder.start();
      recording = true;
      mic.classList.add("blink");
    } catch {
      holding = false;
      show("alert");
      return;
    }
    if (!holding) await finish();
  });
  const release = async () => {
    if (!holding) return;
    holding = false;
    if (recording) await finish();
  };
  mic.addEventListener("pointerup", release);
  mic.addEventListener("pointercancel", release);
  mic.addEventListener("pointerleave", release);

  hear();
  return el;
}
