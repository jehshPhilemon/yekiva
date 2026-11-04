// Adaptive order of the steps of one lesson (pure JS, testable in Node).
// - Steps whose items are due/missed come first, most-missed first; mastered items go last.
// - A `meet_sound` step is an anchor: it always stays before the exercises that follow it,
//   so a learner never practises a sound before being introduced to it. Each lesson is cut
//   into segments at its `meet_sound` steps and only the exercises inside a segment are reordered.
export function orderSteps(steps, learner) {
  const rankOf = (step) => {
    const items = step.items ?? [];
    if (!items.length) return 0;
    const due = learner.prioritize(items);
    if (!due.length) return 2; // everything mastered: push to the end
    const worst = Math.max(...due.map((i) => learner.items[i]?.wrong ?? 0));
    return worst > 0 ? -10 - worst : -1;
  };

  const segments = [];
  for (const step of steps) {
    if (step.type === "meet_sound") segments.push({ head: step, rest: [] });
    else {
      if (!segments.length) segments.push({ head: null, rest: [] });
      segments[segments.length - 1].rest.push(step);
    }
  }
  return segments.flatMap((seg) => {
    const sorted = seg.rest
      .map((s, i) => ({ s, i, rank: rankOf(s) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.s);
    return seg.head ? [seg.head, ...sorted] : sorted;
  });
}
