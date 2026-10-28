// Reads the packs (static files under packs/), merges them per language, loads lessons on demand.
import { groupByLanguage, mergeLanguage } from "./merge.js";

export function createPacks({ root = "packs", fetchFn = (...a) => fetch(...a) } = {}) {
  const json = async (path) => {
    const res = await fetchFn(`${root}/${path}`);
    if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
    return res.json();
  };
  let cache = null;

  async function loadLanguages() {
    if (cache) return cache;
    const index = await json("index.json");
    const packs = [];
    for (const id of index.packs) {
      const manifest = await json(`${id}/manifest.json`);
      const glyphs = manifest.glyphs ? await json(`${id}/${manifest.glyphs}`) : {};
      packs.push({ manifest, glyphs });
    }
    const languages = [];
    for (const [code, group] of groupByLanguage(packs)) {
      const merged = mergeLanguage(group);
      if (merged.errors.length) console.warn("packs:", merged.errors);
      const m = merged.base.manifest;
      languages.push({
        code,
        basePackId: m.id,
        color: m.ui?.color ?? "#EF6C00",
        prompts: m.prompts ?? {},
        matching: m.matching ?? {},
        tracks: merged.tracks,
        glyphs: merged.glyphs,
        lessonOwner: merged.lessonOwner,
      });
    }
    cache = languages;
    return languages;
  }

  return {
    loadLanguages,
    /** A lesson is read from the folder of the pack that provides it (base or addon). */
    async loadLesson(language, lessonId) {
      const owner = language.lessonOwner.get(lessonId);
      const lesson = await json(`${owner}/lessons/${lessonId}.json`);
      return { ...lesson, owner };
    },
    assetUrl: (packId, path) => `${root}/${packId}/${path}`,
  };
}
