// Language choice "by eye AND by ear": each language has its own tile —
// its own colour, its own speech-bubble icon (A for French, M for Swahili...),
// and it speaks in ITS OWN language (prompts.language_pick) while blinking.
// A language that is added shows up by itself as soon as its pack exists.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { langIconName } from "../ui/icons.js";
import { startCycle } from "../ui/cycle.js";

export async function languageScreen({ services, state, go }) {
  const languages = await services.packs.loadLanguages();
  let stop = () => {};

  const items = languages.map((lang) => {
    const el = tile(langIconName(lang.code), {
      color: lang.color,
      label: lang.code,
      caption: lang.name ?? lang.code,
      onClick: () => {
        stop();
        services.speaker.stop();
        state.language = lang;
        go("audience");
      },
    });
    const pick = lang.prompts.language_pick;
    return { el, say: () => services.speaker.say(pick, lang.code, lang.basePackId) };
  });

  const screen = h("div", { class: "screen" }, h("div", { class: "stack" }, items.map((i) => i.el)));
  stop = startCycle(items);
  screen.destroy = stop;
  return screen;
}
