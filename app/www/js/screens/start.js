// A single big "play" button. It also unlocks sound (browsers require a first gesture).
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";

export function startScreen({ services, go }) {
  const btn = tile("play", {
    size: 140,
    label: "commencer",
    onClick: async () => {
      try {
        await services.speaker.ready();
      } catch { /* voice warmup must never block */ }
      go("language");
    },
  });
  return h("div", { class: "screen" }, btn);
}
