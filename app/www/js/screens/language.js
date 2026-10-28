// Language choice "by ear": each installed language speaks in turn, in ITS OWN language
// (prompts.language_pick from its pack), and its tile blinks while it speaks. Tapping chooses.
// A language that is added shows up by itself as soon as its pack exists.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { startCycle } from "../ui/cycle.js";

export async function languageScreen({ services, state, go }) {
  const languages = await services.packs.loadLanguages();
  let stop = () => {};

  const items = languages.map((lang) => {
    const el = tile("tap", {
      color: `${lang.color}66`,
      label: lang.code,
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
