// Pack-driven narration: EVERY screen and step speaks through the language pack.
// Rule: no hardcoded French/English text in screens or steps. Each screen asks the pack:
//   prompts.<key> { text }  ->  speaker.say(prompt, lang.code)
// Packs are text-only: the natural voice is generated at runtime (POST /v1/speak)
// and cached on-device; the phone voice is the offline fallback.
// Fallbacks (when the pack omits a key): replay the most relevant step audio, else silence.
// This keeps animations + voice consistent from language choice down to every lesson step.
import { startCycle } from "../ui/cycle.js";

/** Say one pack prompt; resolves when done (or after the guaranteed minimum). */
export function sayPrompt(services, lang, key, packId) {
  const say = lang?.prompts?.[key];
  if (!say || !say.text) return Promise.resolve(false);
  return services.speaker.say(say, lang.code, packId ?? lang.basePackId).then(() => true);
}

/** Cycle several pack prompts (choice screens): highlights each tile while its prompt speaks. */
export function cyclePrompts(items) {
  return startCycle(items);
}

/** Lesson intro/outro prompts with graceful fallback to the step's own audio. */
export async function lessonIntro(services, lang, lesson, owner) {
  const keys = [`lesson_${lesson.id}_intro`, "lesson_intro"];
  for (const k of keys) {
    const say = lang?.prompts?.[k];
    if (say?.text) {
      await services.speaker.say(say, lang.code, owner);
      return k;
    }
  }
  const first = lesson.steps?.[0]?.params?.say;
  if (first?.text) await services.speaker.say(first, lang.code, owner);
  return null;
}

export async function lessonDone(services, lang, lesson, owner) {
  const keys = [`lesson_${lesson.id}_done`, "lesson_done"];
  for (const k of keys) {
    const say = lang?.prompts?.[k];
    if (say?.text) {
      await services.speaker.say(say, lang.code, owner);
      return k;
    }
  }
  return null;
}

/** Screen-level prompts (path, photo, server, audience...) with silent fallback. */
export function screenPrompt(services, lang, key, packId) {
  return sayPrompt(services, lang, key, packId);
}
