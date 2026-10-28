// A single big "play" button. It also unlocks sound (browsers require a first gesture).
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";

export function startScreen({ go }) {
  return h("div", { class: "screen" }, tile("play", { size: 140, onClick: () => go("language") }));
}
