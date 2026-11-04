// Bottom navigation: 4 tabs with icons (the label is the pack's text, shown as an aid only).
import { h } from "./dom.js";
import { icon } from "./icons.js";

const TABS = [
  ["home", "home"],
  ["courses", "book"],
  ["profile", "user"],
  ["settings", "gear"],
];

export function navBar({ active, go, lang }) {
  const nav = h("nav", { class: "nav" });
  for (const [name, ic] of TABS) {
    const label = lang?.prompts?.[`nav_${name}`]?.text ?? "";
    const b = h("button", { class: `nav-tab${name === active ? " active" : ""}`, type: "button", "aria-label": name }, icon(ic, 26), h("span", {}, label));
    b.addEventListener("click", () => name !== active && go(name));
    nav.append(b);
  }
  return nav;
}
