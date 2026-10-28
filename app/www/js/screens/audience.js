// Adult or child: two icons, each spoken in the language that was just chosen.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { startCycle } from "../ui/cycle.js";
import { profile } from "../core/storage.js";

export function audienceScreen({ services, state, go }) {
  const lang = state.language;
  const available = ["adult", "child"].filter((a) => (lang.tracks[a] ?? []).length > 0);

  const choose = (audience) => {
    services.speaker.stop();
    state.audience = audience;
    profile.save({ language: lang.code, audience });
    go("path");
  };
  // Un seul public disponible : inutile de demander.
  if (available.length === 1) {
    queueMicrotask(() => choose(available[0]));
    return h("div", { class: "screen" });
  }

  const items = available.map((a) => ({
    el: tile(a, { label: a, onClick: () => { stop(); choose(a); } }),
    say: () => services.speaker.say(lang.prompts[`audience_${a}`], lang.code, lang.basePackId),
  }));
  const screen = h("div", { class: "screen" }, h("div", { class: "stack" }, items.map((i) => i.el)));
  const stop = startCycle(items, { pauseMs: 2500 });
  screen.destroy = stop;
  return screen;
}
