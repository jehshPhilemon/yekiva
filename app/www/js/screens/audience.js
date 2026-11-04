// Adult or child: the selected language is already known, so each choice is spoken in that language.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";
import { startCycle } from "../ui/cycle.js";
import { profile } from "../core/storage.js";

export function audienceScreen({ services, state, go }) {
  const lang = state.language;
  const available = ["adult", "child"].filter((a) => (lang.tracks[a] ?? []).length > 0);
  const labels = lang.labels?.audience ?? {};

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

  let stop = () => {};
  const items = available.map((audience) => {
    const prompt = lang.prompts[`audience_${audience}`];
    const el = tile(audience, {
      label: prompt?.text ?? labels[audience] ?? audience,
      caption: labels[audience] ?? prompt?.text ?? audience,
      color: audience === "adult" ? "#17324D" : "#E3AD45",
      className: `audience-tile audience-${audience}`,
      onClick: () => { stop(); choose(audience); },
    });
    return { el, say: () => services.speaker.say(prompt, lang.code, lang.basePackId) };
  });

  const screen = h("div", { class: "screen audience-screen" }, h("div", { class: "audience-cards" }, items.map((i) => i.el)));
  stop = startCycle(items, { pauseMs: 2500 });
  screen.destroy = stop;
  return screen;
}
