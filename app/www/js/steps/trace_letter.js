// "Follow the model": dotted letter, traced with the finger.
// TODO (next step): check stroke direction and order, hint gently, then validate.
// For now the check mark always validates: this is a skeleton, not an assessment.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { drawGlyph } from "../ui/glyph.js";

export function traceLetter(ctx) {
  const { glyph, say } = ctx.step.params;
  const strokes = ctx.language.glyphs[glyph];
  if (!strokes) return h("div", { class: "center" }, icon("alert", 96));

  const canvas = h("canvas", { class: "glyph" });
  const user = [];
  const redraw = () => drawGlyph(canvas, strokes, { dashed: true, user });
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    user.push([point(e)]);
    redraw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!canvas.hasPointerCapture(e.pointerId)) return;
    user[user.length - 1].push(point(e));
    redraw();
  });

  const el = h(
    "div",
    { class: "stack" },
    h("div", { class: "canvas-box" }, canvas),
    h(
      "div",
      { class: "row small" },
      tile("trash", { onClick: () => { user.length = 0; redraw(); }, size: 56 }),
      tile("check", { onClick: () => ctx.onDone(true), size: 56 })
    )
  );
  ctx.speak(say);
  requestAnimationFrame(redraw);
  return el;
}
