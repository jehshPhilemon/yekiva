// Settings: language, photo lesson, server. Big rows, icon first.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { navBar } from "../ui/nav.js";
import { profile } from "../core/storage.js";
import { screenPrompt } from "../core/narrate.js";

export function settingsScreen({ services, state, go }) {
  const lang = state.language;
  const row = (ic, key, onClick) => {
    const b = h("button", { class: "settings-row", type: "button" }, icon(ic, 40), h("span", {}, lang.prompts[key]?.text ?? ""), icon("next", 22));
    b.addEventListener("click", onClick);
    return b;
  };
  const screen = h(
    "div",
    { class: "screen" },
    h("div", { class: "page-title" }, lang.prompts.nav_settings?.text ?? ""),
    h(
      "div",
      { class: "settings-list" },
      row("swap", "settings_language", () => { profile.resetChoice(); go("language"); }),
      row("camera", "settings_photo", () => go("photo")),
      row(services.transcriber.available() ? "cloudok" : "cloudoff", "settings_server", () => go("server")),
    ),
    navBar({ active: "settings", go, lang }),
  );
  screen.destroy = () => services.speaker.stop();
  queueMicrotask(() => screenPrompt(services, lang, "settings_hint"));
  return screen;
}
