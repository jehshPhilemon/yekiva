import { h } from "./dom.js";
import { icon } from "./icons.js";

/** Big tappable zone with an icon: the basic unit of an interface that does not require reading. */
export function tile(name, { onClick, color, size = 96, label } = {}) {
  const b = h("button", { class: "tile", type: "button", "aria-label": label ?? name });
  if (onClick) b.addEventListener("click", onClick);
  if (color) b.style.background = color;
  b.append(icon(name, size));
  return b;
}
