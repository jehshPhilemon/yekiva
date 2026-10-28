// Plays a lesson: one step at a time, never any punishment.
// A step of unknown type is skipped: an older app can read a newer pack.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { registry } from "../core/registry.js";
import { progress } from "../core/storage.js";

export async function lessonScreen({ services, state, go, lessonId }) {
  const { language: lang, audience } = state;
  const lesson = await services.packs.loadLesson(lang, lessonId);
  const learner = services.learnerFor(lang.code);
  const steps = lesson.steps.filter((s) => registry[s.type]);

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
    setTimeout(() => go("path"), 1500);
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
  queueMicrotask(render);
  return screen;
}
