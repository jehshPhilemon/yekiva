// Profile: avatar, name (optional, typed once by a helper), level bar, shortcuts.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { navBar } from "../ui/nav.js";
import { progress, profile } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";
import { groupModules } from "../core/modules.js";

export function profileScreen({ services, state, go }) {
  const lang = state.language;
  const done = progress.load(lang.code, state.audience);
  const lessons = lang.tracks[state.audience] ?? [];
  const ratio = lessons.length ? lessons.filter((id) => done[id]).length / lessons.length : 0;
  const modules = groupModules(lessons, lang.modules?.[state.audience]);
  const level = modules.find((m) => m.lessons.some((id) => !done[id])) ?? modules[modules.length - 1];
  const levelText = [lang.prompts.profile_level?.text, level?.name].filter(Boolean).join(": ");

  const nameBox = h("div", { class: "profile-name" });
  const showName = () => {
    const name = profile.load()?.name;
    const edit = h("button", { class: "icon-btn", type: "button", "aria-label": "nom" }, icon("pencil", 22));
    edit.addEventListener("click", editName);
    nameBox.replaceChildren(h("span", {}, name ?? ""), edit);
  };
  function editName() {
    const input = h("input", { class: "name-input", type: "text", maxlength: "24", value: profile.load()?.name ?? "", "aria-label": "nom" });
    const ok = h("button", { class: "icon-btn ok", type: "button", "aria-label": "valider" }, icon("check", 24));
    ok.addEventListener("click", () => {
      const v = input.value.trim();
      profile.update({ name: v || undefined });
      showName();
    });
    nameBox.replaceChildren(input, ok);
    input.focus();
  }
  showName();

  const shortcut = (ic, key, onClick) => {
    const b = h("button", { class: "shortcut", type: "button" }, icon(ic, 28), h("span", {}, lang.prompts[key]?.text ?? ""));
    b.addEventListener("click", onClick);
    return b;
  };
  const screen = h(
    "div",
    { class: "screen" },
    h(
      "div",
      { class: "profile" },
      h("div", { class: "avatar" }, icon("user", 84)),
      nameBox,
      h("div", { class: "level" }, h("div", { class: "level-bar" }, h("i", { style: `width:${Math.round(ratio * 100)}%` })), icon("medal", 34)),
      h("div", { class: "level-text" }, levelText),
      h("div", { class: "shortcuts" }, shortcut("route", "home_progress", () => go("progress")), shortcut("swap", "settings_language", () => { profile.resetChoice(); go("language"); })),
    ),
    navBar({ active: "profile", go, lang }),
  );
  screen.destroy = () => services.speaker.stop();
  queueMicrotask(() => screenPrompt(services, lang, "profile_hint"));
  return screen;
}
