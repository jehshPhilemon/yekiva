// Server status icon (cloud with a check = connected, crossed cloud = offline). Tap = server screen.
import { h } from "./dom.js";
import { icon } from "./icons.js";

export function statusCloud({ services, go }) {
  const online = services.transcriber.available();
  const b = h("button", { class: `status-cloud${online ? "" : " off"}`, type: "button", "aria-label": "serveur" }, icon(online ? "cloudok" : "cloudoff", 30));
  b.addEventListener("click", () => go("server"));
  return b;
}

/** Small round icon button (back, close, replay...). */
export function iconButton(name, { onClick, label, size = 28, cls = "" } = {}) {
  const b = h("button", { class: `icon-btn ${cls}`.trim(), type: "button", "aria-label": label ?? name }, icon(name, size));
  if (onClick) b.addEventListener("click", onClick);
  return b;
}
