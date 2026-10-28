// Text-free progress path: one dot per lesson, a star once it is done.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { profile, progress } from "../core/storage.js";

export function pathScreen({ state, go }) {
  const { language: lang, audience } = state;
  const done = progress.load(lang.code, audience);
  const lessons = lang.tracks[audience] ?? [];

  const dots = lessons.map((id) => {
    const b = h("button", { class: `dot${done[id] ? " done" : ""}`, type: "button", "aria-label": id });
    b.style.background = lang.color;
    b.append(icon(done[id] ? "star" : "play", 56));
    b.addEventListener("click", () => go("lesson", { lessonId: id }));
    return b;
  });

  const change = h("button", { class: "corner", type: "button", "aria-label": "changer" }, icon("swap", 28));
  change.addEventListener("click", () => {
    profile.clear();
    go("language");
  });

  return h("div", { class: "screen" }, change, h("div", { class: "path" }, dots));
}
