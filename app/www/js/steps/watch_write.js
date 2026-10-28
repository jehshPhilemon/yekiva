// "Watch writing": the letter is drawn stroke by stroke, with a voice. Replayable.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { drawGlyph } from "../ui/glyph.js";

export function watchWrite(ctx) {
  const { glyph, say, durationMs = 2500 } = ctx.step.params;
  const strokes = ctx.language.glyphs[glyph];
  if (!strokes) return h("div", { class: "center" }, icon("alert", 96));

  const canvas = h("canvas", { class: "glyph" });
  let raf = 0;
  function play() {
    cancelAnimationFrame(raf);
    ctx.speak(say);
    const t0 = performance.now();
    const frame = (t) => {
      const p = Math.min(1, (t - t0) / durationMs);
      drawGlyph(canvas, strokes, { progress: p });
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  const el = h(
    "div",
    { class: "stack" },
    h("div", { class: "canvas-box" }, canvas),
    h("div", { class: "row small" }, tile("replay", { onClick: play, size: 56 }), tile("check", { onClick: () => ctx.onDone(true), size: 56 }))
  );
  el.destroy = () => cancelAnimationFrame(raf);
  play();
  return el;
}
