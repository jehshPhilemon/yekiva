// "Follow the model": trace the dotted letter after hearing its sound and a familiar example word.
// Direction, order and coverage are checked gently; no punitive feedback is used.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";
import { contextCue } from "../ui/context-cue.js";
import { drawGlyph } from "../ui/glyph.js";

/** Normalized model strokes -> pixel strokes for the current canvas size. */
function modelPixels(strokes, size) {
  return strokes.map((s) => s.map(([x, y]) => [x * size, y * size]));
}

function samplePolyline(path, count = 24) {
  const total = polyLength(path);
  if (!total) return Array.from({ length: count }, () => path[0]);
  return Array.from({ length: count }, (_, i) => pointAt(path, (total * i) / (count - 1)));
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Coverage plus direction for one expected stroke and its assigned user strokes. */
function strokeScore(model, userStrokes, tol) {
  const expected = samplePolyline(model, 24);
  const flat = userStrokes.flat();
  if (!flat.length) return { coverage: 0, reversed: false };
  const hit = expected.filter((p) => flat.some((q) => distance(q, p) <= tol)).length;
  const first = flat[0];
  const last = flat[flat.length - 1];
  const forward = distance(first, model[0]) + distance(last, model[model.length - 1]);
  const backward = distance(first, model[model.length - 1]) + distance(last, model[0]);
  return { coverage: hit / expected.length, reversed: backward + tol * 0.25 < forward };
}

function pathDistance(userStroke, modelSamples) {
  const count = Math.min(12, userStroke.length);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const point = userStroke[Math.round((i * (userStroke.length - 1)) / Math.max(1, count - 1))];
    total += Math.min(...modelSamples.map((candidate) => distance(point, candidate)));
  }
  return total / count;
}

/** Match strokes to the model in writing order; reject missing, reversed, or out-of-order strokes. */
export function validateTrace(modelStrokes, userStrokes, tol) {
  if (!modelStrokes.length) return { ok: false, ordered: false, details: [] };
  const samples = modelStrokes.map((stroke) => samplePolyline(stroke, 32));
  const assigned = modelStrokes.map(() => []);
  let previous = -1;
  let ordered = true;
  for (const stroke of userStrokes) {
    if (!stroke.length) { ordered = false; continue; }
    const scores = samples.map((model) => pathDistance(stroke, model));
    const index = scores.indexOf(Math.min(...scores));
    if (index < previous) ordered = false;
    previous = index;
    assigned[index].push(stroke);
  }
  const details = modelStrokes.map((model, i) => strokeScore(model, assigned[i], tol));
  const ok = ordered && details.every((d) => d.coverage >= 0.55 && !d.reversed);
  return { ok, ordered, details };
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
  const { glyph, say, context } = ctx.step.params;
  // Script forms are shown with the Parisienne font: finger tracing stays on
  // print strokes only (a dotted font-style guide would mislead the hand).
  if (/:upper_script|:lower_script/.test(glyph ?? "")) {
    return h("div", { class: "center" }, icon("alert", 96));
  }
  const strokes = ctx.language.glyphs[glyph];
  if (!strokes) return h("div", { class: "center" }, icon("alert", 96));

  const labels = ctx.language.labels?.actions ?? {};
  const canvas = h("canvas", { class: "glyph" });
  const status = h("div", { class: "status" });
  const user = [];
  const redraw = () => drawGlyph(canvas, strokes, { dashed: true, user });
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
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
    const result = validateTrace(models, user, tol);
    if (result.ok) {
      status.replaceChildren(icon("star", 64));
      setTimeout(() => ctx.onDone(true), 700);
      return;
    }
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    if (ctx.hint) ctx.hint("trace_hint");
    else ctx.speak(say);
  }

  const replay = tile("volume", {
    onClick: () => ctx.speak(say),
    size: 44,
    label: labels.replay ?? "replay",
    caption: labels.replay,
    className: "lesson-action",
  });
  const clear = tile("trash", {
    onClick: () => { user.length = 0; status.replaceChildren(""); redraw(); },
    size: 44,
    label: labels.clear ?? "clear",
    caption: labels.clear,
    className: "lesson-action",
  });
  const validate = tile("check", {
    onClick: check,
    size: 44,
    label: labels.validate ?? "validate",
    caption: labels.validate,
    className: "lesson-action lesson-action-primary",
  });

  const el = h(
    "div",
    { class: "stack lesson-step" },
    contextCue(context),
    box,
    status,
    h("div", { class: "row small lesson-actions" }, replay, clear, validate),
  );
  (async () => {
    await ctx.speak(say);
    if (!el.isConnected) return;
    // Name every button so the pre-reader knows where to tap.
    for (const key of ["replay", "clear", "validate"]) {
      const t = labels[key];
      if (!t) continue;
      await ctx.speak({ text: t });
      if (!el.isConnected) return;
    }
  })();
  requestAnimationFrame(redraw);
  return el;
}
