// "Follow the model": dotted letter, traced with the finger.
// Validates stroke count, direction and order gently: the check mark validates
// only when the tracing covers each model stroke; otherwise a soft shake + replay.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { drawGlyph } from "../ui/glyph.js";

/** Normalized model strokes -> pixel strokes for the current canvas size. */
function modelPixels(strokes, size) {
  return strokes.map((s) => s.map(([x, y]) => [x * size, y * size]));
}

/**
 * Coverage of one model stroke by the user's strokes.
 * Samples N points along the model stroke; a sample counts when a user point
 * passes within `tol` px. Returns { coverage (0..1), reversed } where reversed
 * is true when the user drew it mostly end -> start.
 */
function strokeScore(model, userStrokes, tol) {
  const N = 24;
  const pts = [];
  const total = polyLength(model);
  for (let i = 0; i < N; i++) pts.push(pointAt(model, (total * i) / (N - 1)));
  let hit = 0;
  let firstAt = -1;
  let lastAt = -1;
  const flat = userStrokes.flat();
  pts.forEach((p, i) => {
    const near = flat.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) <= tol);
    if (near) {
      hit++;
      if (firstAt === -1) firstAt = i;
      lastAt = i;
    }
  });
  // Direction: compare where the user's first/last near-points fall on the model.
  let reversed = false;
  if (flat.length >= 2 && firstAt !== -1 && lastAt !== -1) {
    const dStart = Math.min(...flat.slice(0, 5).map(([x, y]) => Math.hypot(x - model[0][0], y - model[0][1])));
    const dEnd = Math.min(...flat.slice(0, 5).map(([x, y]) => Math.hypot(x - model[model.length - 1][0], y - model[model.length - 1][1])));
    reversed = dEnd < dStart && lastAt <= firstAt + 2;
  }
  return { coverage: hit / N, reversed };
}

function polyLength(p) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return L;
}

function pointAt(p, d) {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (acc + seg >= d) {
      const t = seg === 0 ? 0 : (d - acc) / seg;
      return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t];
    }
    acc += seg;
  }
  return p[p.length - 1];
}

export function traceLetter(ctx) {
  const { glyph, say } = ctx.step.params;
  const strokes = ctx.language.glyphs[glyph];
  if (!strokes) return h("div", { class: "center" }, icon("alert", 96));

  const canvas = h("canvas", { class: "glyph" });
  const status = h("div", { class: "status" });
  const user = [];
  const redraw = () => drawGlyph(canvas, strokes, { dashed: true, user });
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener("pointerdown", (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
    user.push([point(e)]);
    redraw();
  });
  canvas.addEventListener("pointermove", (e) => {
    try {
      if (!canvas.hasPointerCapture(e.pointerId)) return;
    } catch {
      return;
    }
    user[user.length - 1].push(point(e));
    redraw();
  });

  const box = h("div", { class: "canvas-box" }, canvas);

  function check() {
    const size = canvas.clientWidth || canvas.getBoundingClientRect().width || 200;
    const tol = Math.max(14, size * 0.09);
    const models = modelPixels(strokes, size);
    const details = models.map((m) => strokeScore(m, user, tol));
    const ok = details.every((d) => d.coverage >= 0.55 && !d.reversed);
    if (ok) {
      status.replaceChildren(icon("star", 64));
      setTimeout(() => ctx.onDone(true), 700);
      return;
    }
    // Gentle hint, no punishment: shake + pack encouragement (fallback: step voice).
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    if (ctx.hint) ctx.hint("trace_hint");
    else ctx.speak(say);
  }

  const el = h(
    "div",
    { class: "stack" },
    box,
    status,
    h(
      "div",
      { class: "row small" },
      tile("trash", { onClick: () => { user.length = 0; status.replaceChildren(""); redraw(); }, size: 56, label: "effacer" }),
      tile("check", { onClick: check, size: 56, label: "valider" }),
    ),
  );
  ctx.speak(say);
  requestAnimationFrame(redraw);
  return el;
}
