// Plays a lesson: one step at a time, never any punishment.
// Narrated by the pack: intro prompt on arrival (prompts.lesson_intro or lesson_<id>_intro),
// outro prompt on finish (prompts.lesson_done), plus each step's own voice.
// The learner model reorders steps: missed items come back first (adaptive path).
// A step of unknown type is skipped: an older app can read a newer pack.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { registry } from "../core/registry.js";
import { progress } from "../core/storage.js";
import { lessonIntro, lessonDone } from "../core/narrate.js";

export async function lessonScreen({ services, state, go, lessonId }) {
  const { language: lang, audience } = state;
  const lesson = await services.packs.loadLesson(lang, lessonId);
  const learner = services.learnerFor(lang.code);
  const known = lesson.steps.filter((s) => registry[s.type]);

  // Adaptive order: steps whose items are due/missed first; keep stable order otherwise.
  const rankOf = (step) => {
    const items = step.items ?? [];
    if (!items.length) return 0;
    const due = learner.prioritize(items);
    if (!due.length) return 2; // everything mastered: push to the end
    const worst = Math.max(...due.map((i) => learner.items[i]?.wrong ?? 0));
    return worst > 0 ? -10 - worst : -1;
  };
  const steps = known
    .map((s, i) => ({ s, i, rank: rankOf(s) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.s);

  const bar = h("i");
  const body = h("div", { class: "stack" });
  const screen = h("div", { class: "screen" }, h("div", { class: "progress" }, bar), body);
  let index = 0;
  let current = null;

  const ctxFor = (step) => ({
    step,
    language: lang,
    services,
    speak: (say) => services.speaker.say(say, lang.code, lesson.owner),
    assetUrl: (path) => services.packs.assetUrl(lesson.owner, path),
    hint: (key) => {
      // Pack-level encouragement ("try again"...) with fallback to the step's own voice.
      const say = lang?.prompts?.[key] ?? step.params?.say;
      if (say?.text) return services.speaker.say(say, lang.code, lesson.owner);
      return Promise.resolve();
    },
    onDone: (success) => {
      // null = step skipped without being counted (offline): the learner model ignores it.
      if (success !== null) for (const item of step.items ?? []) learner.record(item, success);
      services.saveLearner(lang.code);
      index++;
      render();
    },
  });

  function finish() {
    const done = progress.load(lang.code, audience);
    done[lessonId] = true;
    progress.save(lang.code, audience, done);
    body.replaceChildren(h("div", { class: "center", style: "color:#ffc107" }, icon("star", 160)));
    bar.style.width = "100%";
    lessonDone(services, lang, lesson, lesson.owner);
    setTimeout(() => go("path"), 2200);
  }

  function render() {
    current?.destroy?.();
    services.speaker.stop();
    if (index >= steps.length) return finish();
    bar.style.width = `${(index / steps.length) * 100}%`;
    current = registry[steps[index].type](ctxFor(steps[index]));
    body.replaceChildren(current);
  }

  screen.destroy = () => current?.destroy?.();
  // Pack intro first, then the first step (which speaks its own prompt).
  lessonIntro(services, lang, lesson, lesson.owner).then(render);
  return screen;
}
