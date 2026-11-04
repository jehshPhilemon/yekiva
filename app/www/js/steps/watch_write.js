// "Watch writing": a familiar word introduces the sound, then the letter is animated stroke by stroke.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";
import { drawGlyph } from "../ui/glyph.js";

export function watchWrite(ctx) {
  const { glyph, say, durationMs = 2500, context } = ctx.step.params;
  const strokes = ctx.language.glyphs[glyph];
  if (!strokes) return h("div", { class: "center" }, icon("alert", 96));

  const labels = ctx.language.labels?.actions ?? {};
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

  const replay = tile("replay", {
    onClick: play,
    size: 48,
    label: labels.replay ?? "replay",
    caption: labels.replay,
    className: "lesson-action",
  });
  const next = tile("check", {
    onClick: () => ctx.onDone(true),
    size: 48,
    label: labels.continue ?? "continue",
    caption: labels.continue,
    className: "lesson-action",
  });
  const el = h(
    "div",
    { class: "stack lesson-step" },
    contextCue(context),
    h("div", { class: "canvas-box" }, canvas),
    h("div", { class: "row small lesson-actions" }, replay, next),
  );
  el.destroy = () => cancelAnimationFrame(raf);
  play();
  return el;
}
