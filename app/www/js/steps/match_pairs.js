// "Link them": a left column and a right column; tap one item, then the one it goes with (a line
// is drawn). Used for letter <-> picture (initial sound) and word <-> picture.
// Right: green line + the word is spoken. Wrong: orange shake + the pack's gentle prompt
// (prompts.match_hint), never a punishment. The step ends when every pair is linked.
// params: { say?, pairs: [{ id, say?, left: {text?, image?}, right: {text?, image?} }] }
// The right column is rotated so it never lines up with the left one.
import { h } from "../ui/dom.js";
import { tile } from "../ui/tile.js";

const SVGNS = "http://www.w3.org/2000/svg";
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function matchPairs(ctx) {
  const { pairs } = ctx.step.params;
  const n = pairs.length;
  const k = n > 1 ? 1 + (hash(pairs.map((p) => p.id).join()) % (n - 1)) : 0;
  const rightOrder = pairs.map((_, i) => pairs[(i + k) % n]);

  const content = (side) => {
    const parts = [];
    if (side.image) parts.push(h("img", { src: ctx.assetUrl(side.image), alt: "" }));
    if (side.text) parts.push(h("span", {}, side.text));
    return parts;
  };
  const itemEl = (pair, side) => {
    const b = h("button", { class: `match-item ${side === "left" ? "left" : "right"}`, type: "button", "data-id": pair.id }, content(pair[side]));
    b.dataset.side = side;
    return b;
  };
  const left = pairs.map((p) => itemEl(p, "left"));
  const right = rightOrder.map((p) => itemEl(p, "right"));

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "match-lines");
  const box = h("div", { class: "match" }, svg, h("div", { class: "match-col" }, left), h("div", { class: "match-col" }, right));

  let selected = null;
  let wrong = 0;
  let linked = 0;

  function line(a, b, cls) {
    const c = box.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const [l, r] = a.dataset.side === "left" ? [ra, rb] : [rb, ra];
    const el = document.createElementNS(SVGNS, "path");
    const x1 = l.right - c.left;
    const y1 = l.top + l.height / 2 - c.top;
    const x2 = r.left - c.left;
    const y2 = r.top + r.height / 2 - c.top;
    const mid = (x1 + x2) / 2;
    el.setAttribute("d", `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`);
    el.setAttribute("class", cls);
    svg.append(el);
    return el;
  }

  function choose(el) {
    if (el.classList.contains("ok")) return;
    if (!selected || selected.dataset.side === el.dataset.side) {
      selected?.classList.remove("sel");
      selected = el;
      el.classList.add("sel");
      return;
    }
    const a = selected;
    selected = null;
    a.classList.remove("sel");
    if (a.dataset.id === el.dataset.id) {
      for (const x of [a, el]) {
        x.classList.add("ok");
        x.disabled = true;
      }
      line(a, el, "line ok");
      const pair = pairs.find((p) => p.id === el.dataset.id);
      ctx.speak(pair.say ?? { text: pair.left.text ?? pair.right.text ?? pair.id });
      if (++linked === n) setTimeout(() => ctx.onDone(wrong === 0), 1100);
    } else {
      wrong++;
      const temp = line(a, el, "line bad");
      for (const x of [a, el]) x.classList.add("bad", "shake");
      setTimeout(() => {
        temp.remove();
        for (const x of [a, el]) x.classList.remove("bad", "shake");
      }, 650);
      ctx.hint("match_hint");
    }
  }
  for (const el of [...left, ...right]) el.addEventListener("click", () => choose(el));

  const replay = () => ctx.hint("match_intro");
  const el = h("div", { class: "stack" }, box, h("div", { class: "row small" }, tile("volume", { onClick: replay, size: 56, label: "reecouter" })));
  el.destroy = () => ctx.services?.speaker.stop();
  replay();
  return el;
}
