// End of a lesson: star burst; when the lesson closes a module, the certificate with a
// "next module" button. The pack speaks (prompts.lesson_done / module_done).
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { progress, profile } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";
import { groupModules } from "../core/modules.js";

export function successScreen({ services, state, go, lessonId }) {
  const lang = state.language;
  const done = progress.load(lang.code, state.audience);
  const track = lang.tracks[state.audience] ?? [];
  const modules = groupModules(track, lang.modules?.[state.audience]);
  const mod = modules.find((m) => m.lessons.includes(lessonId));
  const moduleDone = modules.length > 1 && !!mod && mod.lessons.every((id) => done[id]);
  const next = track.slice(track.indexOf(lessonId) + 1).find((id) => !done[id]);
  const text = (key) => lang.prompts[key]?.text ?? "";
  const name = profile.load()?.name;

  const burst = h("div", { class: "burst" }, icon("star", 120));
  for (let i = 0; i < 12; i++) {
    const dot = h("i", { class: "confetti" });
    dot.style.setProperty("--a", `${i * 30}deg`);
    dot.style.setProperty("--c", ["#ffc107", "#43a047", "#1b4b8f", "#ef6c00"][i % 4]);
    burst.append(dot);
  }

  const certificate = h(
    "div",
    { class: "certificate" },
    h("div", { class: "cert-brand" }, icon("bird", 28), "Yekiva"),
    h("div", { class: "cert-title" }, text("certificate_title")),
    h("div", { class: "cert-name" }, name ?? ""),
    h("div", { class: "cert-medal" }, icon("medal", 36)),
  );

  const goNext = h("button", { class: "cta", type: "button" }, icon("next", 26), h("span", {}, text(moduleDone ? "next_module" : "next")));
  goNext.addEventListener("click", () => (next ? go("lesson", { lessonId: next }) : go("home")));

  const screen = h(
    "div",
    { class: "screen success" },
    burst,
    h("div", { class: "success-title" }, text("success_title")),
    name ? h("div", { class: "success-name" }, name) : "",
    moduleDone ? h("div", { class: "success-sub" }, text("module_done")) : "",
    moduleDone ? certificate : "",
    goNext,
  );
  screen.destroy = () => services.speaker.stop();
  queueMicrotask(() => screenPrompt(services, lang, moduleDone ? "module_done" : "lesson_done"));
  return screen;
}
