// "Say the word": see/hear a contextual word, then repeat it while holding the microphone.
// OFFLINE-FIRST : sans route de transcription dans l'API, le micro ne peut pas
// être noté. L'étape reste utile : écoute (voix API/cachée/téléphone) + bouton
// "continuuer" (plan B "écouter et taper" géré par le validateur de packs).
// Quand la route de transcription existera, brancher transcriber.transcribe()
// ici (elle renverra le texte au lieu de null) — aucun autre changement.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";

export function sayWord(ctx) {
  const { word, say, image, context } = ctx.step.params;
  const { transcriber } = ctx.services;
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

  // Pas de transcription dans l'API pour l'instant : exercice d'écoute.
  // Le bouton "continuer" valide sans noter (onDone(null) = ignoré par le modèle).
  if (typeof transcriber.transcribe !== "function") {
    show("volume");
    el.append(h("div", { class: "row small lesson-actions" }, tile("check", {
      onClick: () => ctx.onDone(null), size: 48,
      label: labels.continue ?? "continue", caption: labels.continue,
      className: "lesson-action",
    })));
    hear();
    return el;
  }

  // Route transcription disponible un jour : micro noté (3 essais, jamais puni).
  // En attendant elle renvoie null -> on bascule sur l'écoute (ci-dessus).
  const micLabel = ctx.language.prompts?.say_hint?.text ?? "repeat";
  const mic = tile("mic", { size: 96, label: micLabel });
  el.append(h("div", { class: "row" }, mic));
  let busy = false;
  let live = false;
  (async () => {
    try {
      const probe = await transcriber.transcribe(new Blob([], { type: "audio/wav" }), ctx.language.code);
      live = probe !== null || transcriber.available();
    } catch {
      live = false;
    }
    if (!live) {
      show("cloudoff");
      el.append(h("div", { class: "row small lesson-actions" }, tile("check", {
        onClick: () => ctx.onDone(null), size: 48,
        label: labels.continue ?? "continue", caption: labels.continue,
        className: "lesson-action",
      })));
    }
  })();
  mic.addEventListener("click", () => {
    if (busy) return;
    busy = true;
    encourage();
    setTimeout(() => { busy = false; }, 800);
  });
  hear();
  return el;
}
