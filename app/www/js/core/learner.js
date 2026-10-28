// Learner model: which items (letters, syllables, words) must come back. Leitner boxes.
// Pure JS, no DOM: testable in Node. Starting values, not validated on real learners.
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY];

export class LearnerModel {
  constructor({ clock = Date.now, data = {} } = {}) {
    this.clock = clock;
    this.items = data; // { item: { box, seen, wrong, due } }
  }

  record(item, correct) {
    const s = (this.items[item] ??= { box: 0, seen: 0, wrong: 0, due: 0 });
    s.seen++;
    if (correct) {
      s.box = Math.min(s.box + 1, INTERVALS.length - 1);
    } else {
      s.box = 0;
      s.wrong++;
    }
    s.due = this.clock() + INTERVALS[s.box];
  }

  /** Items to work on now (never seen or past due), most-missed first. */
  prioritize(candidates) {
    const now = this.clock();
    return [...candidates]
      .filter((c) => !this.items[c] || this.items[c].due <= now)
      .sort((a, b) => (this.items[b]?.wrong ?? 0) - (this.items[a]?.wrong ?? 0));
  }

  toJSON() {
    return this.items;
  }
}
