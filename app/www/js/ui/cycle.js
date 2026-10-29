// Makes elements speak in turn, highlighting the one that speaks, until stopped.
// items: [{ el, say: () => Promise }]. Returns the stop function.
// Guarantees each tile stays highlighted at least minMs, so the blink is always
// visible even when the voice resolves instantly (no voice installed / Termux).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function startCycle(items, { gapMs = 800, pauseMs = 3000, minMs = 1600 } = {}) {
  let stopped = false;
  (async () => {
    // Small initial delay: lets the screen paint before the first prompt speaks.
    await sleep(400);
    while (!stopped) {
      for (const it of items) {
        if (stopped) return;
        it.el.classList.add("blink");
        const t0 = Date.now();
        try {
          await it.say();
        } catch { /* one failing prompt must not stop the cycle */ }
        const rest = minMs - (Date.now() - t0);
        if (rest > 0 && !stopped) await sleep(rest);
        it.el.classList.remove("blink");
        if (stopped) return;
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
