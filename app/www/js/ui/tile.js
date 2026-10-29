import { h } from "./dom.js";
import { icon } from "./icons.js";

/** Big tappable zone with an icon: the basic unit of an interface that does not require reading.
 *  `caption` (optional, e.g. language name) is a visual aid only — voice remains the guide.
 */
export function tile(name, { onClick, color, size = 96, label, caption } = {}) {
  const b = h("button", { class: "tile", type: "button", "aria-label": label ?? name });
  if (onClick) b.addEventListener("click", onClick);
  if (color) b.style.background = color;
  b.append(icon(name, size));
  if (caption) b.append(h("span", { class: "tile-caption" }, caption));
  return b;
}
