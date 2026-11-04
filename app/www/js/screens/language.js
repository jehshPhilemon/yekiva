// Language choice by sight and sound: every tile speaks in its own language.
// This remains the first choice so that the next screen can speak understandably.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { langIconName } from "../ui/icons.js";
import { startCycle } from "../ui/cycle.js";

export async function languageScreen({ services, state, go }) {
  const languages = await services.packs.loadLanguages();
  let stop = () => {};

  const items = languages.map((lang) => {
    const prompt = lang.prompts.language_pick;
    const el = tile(langIconName(lang.code), {
      color: lang.color,
      className: "language-tile",
      label: prompt?.text ?? lang.name,
      caption: lang.name,
      onClick: () => {
        stop();
        services.speaker.stop();
        state.language = lang;
        go("audience");
      },
    });
    return { el, say: () => services.speaker.say(prompt, lang.code, lang.basePackId) };
  });

  const screen = h("div", { class: "screen language-screen" }, h("div", { class: "language-cards" }, items.map((i) => i.el)));
  stop = startCycle(items);
  screen.destroy = stop;
  return screen;
}
