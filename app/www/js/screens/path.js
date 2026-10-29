// Text-free progress path: one dot per lesson, a star once it is done.
// Narrated by the pack (prompts.path_hint): every screen speaks, not just setup.
// Corner: restart setup. Bottom row: photo lesson (read the world) + server status.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { profile, progress } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";

export function pathScreen({ services, state, go }) {
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

  const online = services.transcriber.available();
  const change = h("button", { class: "corner", type: "button", "aria-label": "changer" }, icon("swap", 28));
  change.addEventListener("click", () => {
    profile.clear();
    go("language");
  });

  const replay = tile("volume", { onClick: () => screenPrompt(services, lang, "path_hint"), size: 56, label: "reecouter" });
  const bar = h(
    "div",
    { class: "row small" },
    tile("camera", { onClick: () => go("photo"), size: 56, label: "photo" }),
    tile(online ? "check" : "cloudoff", { onClick: () => go("server"), size: 56, label: "serveur" }),
    replay,
  );

  const screen = h("div", { class: "screen" }, change, h("div", { class: "path" }, dots), bar);
  screen.destroy = () => services.speaker.stop();
  screen.prompt = () => screenPrompt(services, lang, "path_hint");
  queueMicrotask(() => screen.prompt());
  return screen;
}
