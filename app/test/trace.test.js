import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTrace } from "../www/js/steps/trace_letter.js";

const vertical = [[20, 20], [20, 120]];
const dot = [[80, 140], [100, 140]];
const line = (from, to, count = 30) => Array.from({ length: count }, (_, i) => {
  const t = i / (count - 1);
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
});

function tracePolyline(stroke, pointsPerSegment = 20) {
  const points = [];
  for (let i = 1; i < stroke.length; i++) {
    const [x0, y0] = stroke[i - 1];
    const [x1, y1] = stroke[i];
    if (i === 1) points.push([x0, y0]);
    for (let j = 1; j <= pointsPerSegment; j++) {
      const t = j / pointsPerSegment;
      points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return points;
}

test("trace validation accepts complete strokes in the taught order", () => {
  const result = validateTrace([vertical, dot], [line(vertical[0], vertical[1]), line(dot[0], dot[1])], 10);
  assert.equal(result.ok, true);
  assert.equal(result.ordered, true);
  assert.ok(result.details.every((detail) => detail.coverage >= 0.55));
});

test("trace validation rejects a reversed stroke", () => {
  const result = validateTrace([vertical], [line(vertical[1], vertical[0])], 10);
  assert.equal(result.ok, false);
  assert.equal(result.details[0].reversed, true);
});

test("trace validation rejects strokes drawn out of order", () => {
  const result = validateTrace([vertical, dot], [line(dot[0], dot[1]), line(vertical[0], vertical[1])], 10);
  assert.equal(result.ok, false);
  assert.equal(result.ordered, false);
});

test("trace validation rejects insufficient path coverage", () => {
  const result = validateTrace([vertical], [line(vertical[0], [20, 40])], 10);
  assert.equal(result.ok, false);
  assert.ok(result.details[0].coverage < 0.55);
});

test("the actual A glyphs in French, Swahili, and Lingala pass in their stroke order", () => {
  for (const code of ["fr", "sw", "ln"]) {
    const glyphs = JSON.parse(readFileSync(new URL(`../www/packs/${code}/glyphs.json`, import.meta.url), "utf8"));
    const models = glyphs["a:lower_script"].map((stroke) => stroke.map(([x, y]) => [x * 200, y * 200]));
    const user = models.map((stroke) => tracePolyline(stroke));
    const result = validateTrace(models, user, 18);
    assert.equal(result.ok, true, `${code} A glyph should accept its model path`);
  }
});
