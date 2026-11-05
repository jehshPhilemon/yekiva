// Plays a lesson: one step at a time, never any punishment.
// Narrated by the pack: intro prompt on arrival (prompts.lesson_intro or lesson_<id>_intro),
// outro prompt on finish (prompts.lesson_done), plus each step's own voice.
// The learner model reorders steps: missed items come back first (adaptive path).
// A step of unknown type is skipped: an older app can read a newer pack.
// Gating: the lesson counts as "learned" only if enough scored steps succeed
// (PASS_RATE). Otherwise the path stays locked on this lesson — retry, never punish.
// Quiz finale: steps with items "quiz:*" count double — a lesson is unlocked by
// proving on NEW questions, not by repeating the exercises.
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { registry } from "../core/registry.js";
import { progress } from "../core/storage.js";
import { lessonIntro, lessonDone } from "../core/narrate.js";

/** Minimum success rate on scored steps to unlock the next lesson. */
export const PASS_RATE = 0.7;
/** Quiz steps weigh double: proving on new questions unlocks the lesson. */
export const QUIZ_WEIGHT = 2;

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

  // Voice pre-generation: while the intro plays, fetch the upcoming audios
  // (if not cached) so each step plays instantly. Fire-and-forget, best-effort.
  try {
    const upcoming = [];
    const push = (t) => { if (typeof t === "string" && t.trim()) upcoming.push(t); };
    push(lang?.prompts?.lesson_done?.text);
    push(lang?.prompts?.quiz_pass?.text);
    push(lang?.prompts?.quiz_retry?.text);
    for (const st of steps) {
      const prm = st.params ?? {};
      push(prm.say?.text);
      push(prm.word);
      push(prm.target?.word);
      for (const c of prm.choices ?? []) push(c.text ?? c.id);
      for (const c of prm.answers ?? []) push(c);
      if (typeof prm.answer === "string") push(prm.answer);
    }
    push(lang?.labels?.actions?.replay);
    push(lang?.labels?.actions?.continue);
    push(lang?.labels?.actions?.validate);
    services.speaker.prefetch?.(upcoming, lang.code);
  } catch { /* prefetch is best-effort */ }

  const bar = h("i");
  const body = h("div", { class: "stack" });
  const screen = h("div", { class: "screen" }, h("div", { class: "progress" }, bar), body);
  let index = 0;
  let current = null;
  let cancelled = false;
  let finishTimer = null;
  // Score for gating: only counted steps (success === true/false), never skips (null).
  // Quiz steps (items "quiz:*") weigh QUIZ_WEIGHT: unlocking requires proving on new questions.
  let scored = 0;
  let good = 0;
  const weightOf = (step) => ((step.items ?? []).some((i) => String(i).startsWith("quiz:")) ? QUIZ_WEIGHT : 1);

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
      if (success !== null) {
        for (const item of step.items ?? []) learner.record(item, success);
        const w = weightOf(step);
        scored += w;
        if (success) good += w;
      }
      services.saveLearner(lang.code);
      index++;
      render();
    },
  });

  function finish() {
    if (cancelled) return;
    const done = progress.load(lang.code, audience);
    // Gating: unlock only on success rate. A lesson with no scored steps
    // (all offline-skipped) never unlocks — the learner simply retries later.
    const passed = scored > 0 && good / scored >= PASS_RATE;
    if (passed) {
      done[lessonId] = true;
      progress.save(lang.code, audience, done);
    }
    body.replaceChildren(h("div", { class: "center", style: `color:${passed ? "#ffc107" : "#90a4ae"}` }, icon(passed ? "star" : "replay", 160)));
    bar.style.width = "100%";
    // Spoken verdict: quiz_pass ("la prochaine leçon est ouverte") or quiz_retry ("rejoue la leçon").
    (async () => {
      const key = passed ? "quiz_pass" : "quiz_retry";
      const say = lang?.prompts?.[key];
      if (say?.text) await services.speaker.say(say, lang.code, lesson.owner);
      else await lessonDone(services, lang, lesson, lesson.owner);
    })();
    // After a miss: stay a bit longer so the "try again" voice finishes, then back to path (still locked here).
    finishTimer = setTimeout(() => { if (!cancelled) go("path"); }, passed ? 2200 : 3200);
  }

  function render() {
    if (cancelled) return;
    current?.destroy?.();
    services.speaker.stop();
    if (index >= steps.length) return finish();
    bar.style.width = `${(index / steps.length) * 100}%`;
    current = registry[steps[index].type](ctxFor(steps[index]));
    body.replaceChildren(current);
  }

  screen.destroy = () => {
    cancelled = true;
    if (finishTimer) clearTimeout(finishTimer);
    current?.destroy?.();
    services.speaker.stop();
  };
  // Explained intro: the lesson presents itself (title + what to do) BEFORE the
  // first exercise, so a lesson lasts minutes and teaches — not 15 seconds.
  // lesson_<id>_intro (pack) > generated intro (title + first context) > first step audio.
  (async () => {
    const specific = lang?.prompts?.[`lesson_${lesson.id}_intro`];
    if (specific?.text) {
      await services.speaker.say(specific, lang.code, lesson.owner);
      if (!cancelled) render();
      return;
    }
    // Pack-voiced intro: the generic lesson_intro prompt (localized) + the lesson
    // title. NEVER a hardcoded French sentence (a hardcoded sentence read by the
    // Swahili TTS is the "incomprehensible min" heard before the lesson).
    const first = steps[0];
    const ctx0 = first?.params?.context;
    const title = lesson.title ?? lesson.id;
    const base = lang?.prompts?.lesson_intro;
    const intro = ctx0?.word && ctx0?.letter
      ? { text: `${title}. ${ctx0.letter}, ${ctx0.word}. ${base?.text ?? ""}`.trim() }
      : { text: `${title}. ${base?.text ?? ""}`.trim() };
    if (intro.text) await services.speaker.say(intro, lang.code, lesson.owner);
    if (!cancelled) render();
  })();
  return screen;
}
