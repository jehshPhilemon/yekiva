// "Meet a sound" (guided lesson): speech bubble with the prompt, the letter (or syllable) in big,
// a keyword with its picture, and one big speaker. Tap the letter = hear it, tap the picture =
// hear the word. Previous / next at the sides of the speaker: the only navigation on the screen.
// Nothing is scored (onDone(null)): this step introduces; the exercises that follow measure.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

export function meetSound(ctx) {
  const { item, word, image, say, itemSay, wordSay } = ctx.step.params;
  const hearAll = () => ctx.speak(say);
  const hearItem = () => ctx.speak(itemSay ?? { text: item });
  const hearWord = () => ctx.speak(wordSay ?? { text: word });
  const round = (name, onClick, cls = "") => {
    const b = h("button", { class: `round ${cls}`.trim(), type: "button", "aria-label": name }, icon(name, cls.includes("big") ? 44 : 26));
    b.addEventListener("click", onClick);
    return b;
  };

  const bubble = h("div", { class: "bubble" }, say.text);
  const letter = h("button", { class: "meet-item", type: "button", "aria-label": item }, item);
  letter.addEventListener("click", hearItem);
  const picture = h("button", { class: "meet-picture", type: "button", "aria-label": word }, h("img", { src: ctx.assetUrl(image), alt: "" }), h("span", { class: "meet-word" }, word));
  picture.addEventListener("click", hearWord);

  const prev = round("back", () => ctx.onPrev?.());
  if (!ctx.onPrev) prev.classList.add("ghost");
  const el = h(
    "div",
    { class: "stack meet-screen" },
    bubble,
    h("div", { class: "meet" }, letter, picture),
    h("div", { class: "meet-controls" }, prev, round("volume", hearAll, "big glow"), round("next", () => ctx.onDone(null))),
  );
  el.destroy = () => ctx.services?.speaker.stop();
  hearAll();
  return el;
}
