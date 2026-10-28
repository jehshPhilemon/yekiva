// "Say the word": the app shows/says a word, the learner repeats it while HOLDING the microphone.
// The recording goes to the server, is transcribed, then compared with tolerance (rules from the pack).
// Without network or server: show an icon and skip the step without counting it (plan B: "listen and tap").
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { isAccepted } from "../core/match.js";

const MAX_TRIES = 3;

export function sayWord(ctx) {
  const { word, say, image } = ctx.step.params;
  const { recorder, transcriber } = ctx.services;
  const hear = () => ctx.speak(say ?? { text: word });

  const status = h("div", { class: "status" });
  const show = (name) => status.replaceChildren(name ? icon(name, 64) : "");

  const wordBox = h("div", { class: "word" }, image ? h("img", { src: ctx.assetUrl(image), alt: "" }) : "", word);
  const el = h("div", { class: "stack" }, h("div", { class: "row small" }, tile("volume", { onClick: hear, size: 64 })), wordBox, status);

  if (!transcriber.available()) {
    // Offline: signalled once, without text.
    show("cloudoff");
    el.append(h("div", { class: "row small" }, tile("check", { onClick: () => ctx.onDone(null), size: 56 })));
    hear();
    return el;
  }

  const mic = tile("mic", { size: 96 });
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
      show("cloudoff"); // network lost on the way: skip without counting
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
    hear(); // "once more": replay the prompt, no punishment
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
      show("alert"); // microphone denied or missing
      return;
    }
    if (!holding) await finish(); // finger already lifted while the permission prompt was showing
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
