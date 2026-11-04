// Course map: modules on a vertical rail. Done = green check, current = highlighted,
// the rest are locked until the module before is finished.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { navBar } from "../ui/nav.js";
import { progress } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";
import { groupModules } from "../core/modules.js";

export function coursesScreen({ services, state, go }) {
  const lang = state.language;
  const done = progress.load(lang.code, state.audience);
  const lessons = lang.tracks[state.audience] ?? [];
  const modules = groupModules(lessons, lang.modules?.[state.audience]);
  const finished = modules.map((m) => m.lessons.every((id) => done[id]));
  const current = finished.findIndex((f) => !f);

  const rows = modules.map((m, i) => {
    const status = finished[i] ? "done" : i === current ? "current" : "locked";
    const title = `M${i + 1}${m.name ? `: ${m.name}` : ""}`;
    const badge = status === "done" ? h("span", { class: "badge ok" }, icon("check", 18)) : status === "locked" ? h("span", { class: "badge lock" }, icon("lock", 18)) : "";
    const card = h("button", { class: `course-card ${status}`, type: "button" }, h("span", { class: "course-title" }, title), badge);
    card.addEventListener("click", () => {
      if (status === "locked") {
        card.classList.add("shake");
        setTimeout(() => card.classList.remove("shake"), 400);
        return screenPrompt(services, lang, "module_locked");
      }
      const target = m.lessons.find((id) => !done[id]) ?? m.lessons[0];
      go("lesson", { lessonId: target });
    });
    return h("div", { class: "course-row" }, h("span", { class: `rail-dot ${status}` }), card);
  });

  const title = h("div", { class: "page-title" }, lang.prompts.nav_courses?.text ?? "");
  const screen = h("div", { class: "screen" }, title, h("div", { class: "course-list" }, rows), navBar({ active: "courses", go, lang }));
  screen.destroy = () => services.speaker.stop();
  queueMicrotask(() => screenPrompt(services, lang, "courses_hint"));
  return screen;
}
