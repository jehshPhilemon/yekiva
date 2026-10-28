// Makes elements speak in turn, blinking the one that speaks, until stopped.
// items: [{ el, say: () => Promise }]. Returns the stop function.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function startCycle(items, { gapMs = 800, pauseMs = 3000 } = {}) {
  let stopped = false;
  (async () => {
    while (!stopped) {
      for (const it of items) {
        if (stopped) return;
        it.el.classList.add("blink");
        await it.say();
        it.el.classList.remove("blink");
        await sleep(gapMs);
      }
      await sleep(pauseMs);
    }
  })();
  return () => {
    stopped = true;
    items.forEach((i) => i.el.classList.remove("blink"));
  };
}
