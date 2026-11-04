// Home: three big cards (Learn, Practice, My progress). The pack speaks the hint on arrival.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { navBar } from "../ui/nav.js";
import { statusCloud, iconButton } from "../ui/status.js";
import { progress } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";

export function homeScreen({ services, state, go }) {
  const lang = state.language;
  const done = progress.load(lang.code, state.audience);
  const lessons = lang.tracks[state.audience] ?? [];
  const next = lessons.find((id) => !done[id]) ?? lessons[0];
  const label = (key) => lang.prompts[key]?.text ?? "";

  const card = (ic, key, onClick) => {
    const b = h("button", { class: "home-card", type: "button" }, h("span", { class: "home-card-icon" }, icon(ic, 72)), h("span", { class: "home-card-label" }, label(key)));
    b.addEventListener("click", onClick);
    return b;
  };

  const hint = () => screenPrompt(services, lang, "home_hint");
  const top = h("div", { class: "topbar" }, h("span", { class: "brand" }, icon("bird", 34), "Yekiva"), h("span", { class: "grow" }), iconButton("volume", { onClick: hint, label: "reecouter" }), statusCloud({ services, go }));
  const cards = h(
    "div",
    { class: "home-cards" },
    card("learn", "home_learn", () => next && go("lesson", { lessonId: next })),
    card("practice", "home_practice", () => go("lesson", { practice: true })),
    card("route", "home_progress", () => go("progress")),
  );
  const screen = h("div", { class: "screen" }, top, cards, navBar({ active: "home", go, lang }));
  screen.destroy = () => services.speaker.stop();
  queueMicrotask(hint);
  return screen;
}
