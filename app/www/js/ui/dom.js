// Tiny helper to build DOM without a framework: h("div", {class: "x", onclick: f}, child, ...)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
