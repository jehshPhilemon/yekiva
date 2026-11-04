// "Watch writing": 4 versions per letter (upper+lower x print+script).
// Print (upper_print/lower_print) = real system fonts (serif/sans, NEVER hand-made
// strokes): shown as a big letter card. Script (upper_script/lower_script) = the
// real Parisienne handwriting font (offline woff2 + Google Fonts fallback),
// animated with a reveal. Any other glyph key falls back to canvas strokes.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";
import { drawGlyph } from "../ui/glyph.js";

// "B:upper_print" -> { char: "B", style: "print" }; "b:lower_script" -> { char: "b", style: "script" }
function fontForm(glyph) {
  const m = /^(.):(upper|lower)_(print|script)$/.exec(String(glyph ?? ""));
  if (!m) return null;
  const [, letter, casing, style] = m;
  const char = casing === "upper" ? letter.toUpperCase() : letter.toLowerCase();
  return { char, style, casing };
}

export function watchWrite(ctx) {
  const { glyph, say, durationMs = 2500, context } = ctx.step.params;
  const form = fontForm(glyph);
  // Print AND script: real fonts (system serif/sans vs Parisienne), never bricolage.
  if (form) {
    const labels = ctx.language.labels?.actions ?? {};
    const clip = h("span", { class: "clip" }, form.char);
    const model = h("div", { class: (form.style === "script" ? "script-letter" : `print-letter ${form.casing}`), role: "img", "aria-label": form.char }, clip);
    let timer = 0;
    function play() {
      ctx.speak(say);
      model.classList.remove("is-done");
      model.classList.remove("is-playing");
      void model.offsetWidth;
      model.classList.add("is-playing");
      clearTimeout(timer);
      // The letter stays fully visible after the animation (remove = invisible clip).
      timer = setTimeout(() => { model.classList.remove("is-playing"); model.classList.add("is-done"); }, durationMs + 400);
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
      h("div", { class: "canvas-box" }, model),
      h("div", { class: "row small lesson-actions" }, replay, next),
    );
    el.destroy = () => clearTimeout(timer);
    // The handwriting font must be ready before the reveal animation starts.
    (async () => {
      try { await document.fonts?.load?.('120px "Parisienne"'); } catch { /* fallback font */ }
      play();
    })();
    return el;
  }
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
