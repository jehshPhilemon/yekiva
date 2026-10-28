// Draws a letter (strokes normalized to 0..1) on a square <canvas>.
//  progress : fraction of the path revealed (0..1)  -> "watch writing" animation
//  dashed   : dotted guide                          -> "follow the model"
//  user     : finger strokes, in CSS pixels         -> [[ [x,y], ... ], ...]
export function drawGlyph(canvas, strokes, { progress = 1, dashed = false, user = [] } = {}) {
  const size = canvas.clientWidth;
  if (!size) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = canvas.height = Math.round(size * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const lw = size * 0.06;
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
  ctx.strokeStyle = "#9e9e9e";
  ctx.lineCap = dashed ? "butt" : "round";
  ctx.setLineDash(dashed ? [lw * 0.9, lw * 1.1] : []);

  const pts = strokes.map((s) => s.map(([x, y]) => [x * size, y * size]));
  let total = 0;
  for (const s of pts) for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  let remaining = Math.max(0, Math.min(1, progress)) * total;

  for (const s of pts) {
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    let cut = false;
    for (let i = 1; i < s.length; i++) {
      const seg = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
      if (remaining >= seg) {
        ctx.lineTo(s[i][0], s[i][1]);
        remaining -= seg;
      } else {
        const t = seg === 0 ? 0 : remaining / seg;
        ctx.lineTo(s[i - 1][0] + (s[i][0] - s[i - 1][0]) * t, s[i - 1][1] + (s[i][1] - s[i - 1][1]) * t);
        remaining = 0;
        cut = true;
        break;
      }
    }
    ctx.stroke();
    if (cut) break;
  }

  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = "#3949ab";
  for (const s of user) {
    if (s.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(s[0][0], s[0][1]);
    for (const [x, y] of s.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
}
