// Merges the packs of one language. No dependency: runs in the browser AND in Node
// (the validator in tools/ imports this file: one logic, never two diverging versions).
//
// A language = 1 "base" pack + N "addon" packs (see docs/LESSON_FORMAT.md).
// packs : [{ manifest, glyphs }]  ->  { base, tracks, lessonOwner, glyphs, errors }

export function groupByLanguage(packs) {
  const groups = new Map();
  for (const p of packs) {
    const lang = p.manifest.language;
    if (!lang) continue;
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push(p);
  }
  return groups;
}

export function mergeLanguage(packs) {
  const errors = [];
  const bases = packs.filter((p) => (p.manifest.role ?? "base") === "base");
  const addons = packs
    .filter((p) => p.manifest.role === "addon")
    .sort((a, b) => (a.manifest.order ?? 100) - (b.manifest.order ?? 100) || a.manifest.id.localeCompare(b.manifest.id));
  const lang = packs[0].manifest.language;

  if (bases.length !== 1) errors.push(`[${lang}] exactly 1 'base' pack is required (found ${bases.length})`);
  const base = bases[0] ?? packs[0];

  const tracks = { adult: [], child: [] };
  const lessonOwner = new Map(); // lessonId -> packId
  const glyphs = {};

  for (const pack of [base, ...addons]) {
    const m = pack.manifest;
    if (pack !== base) {
      for (const forbidden of ["prompts", "matching", "ui"]) {
        if (m[forbidden] !== undefined) errors.push(`[${m.id}] an addon cannot define '${forbidden}' (the language's base pack carries it)`);
      }
    }
    for (const [key, strokes] of Object.entries(pack.glyphs ?? {})) {
      if (key in glyphs && JSON.stringify(glyphs[key]) !== JSON.stringify(strokes)) {
        errors.push(`[${m.id}] glyph '${key}' already defined differently in language '${lang}'`);
      }
      glyphs[key] = strokes;
    }
    for (const audience of ["adult", "child"]) {
      const ids = m.tracks?.[audience] ?? [];
      const after = m.after?.[audience];
      for (const id of ids) {
        if (lessonOwner.has(id) && lessonOwner.get(id) !== m.id) {
          errors.push(`[${m.id}] lesson '${id}' already provided by '${lessonOwner.get(id)}' (ids are unique per language)`);
        }
        lessonOwner.set(id, m.id);
      }
      if (pack === base || !after) {
        tracks[audience].push(...ids);
      } else {
        const at = tracks[audience].indexOf(after);
        if (at === -1) {
          errors.push(`[${m.id}] after.${audience}='${after}' not found in the path of language '${lang}'`);
          tracks[audience].push(...ids);
        } else {
          tracks[audience].splice(at + 1, 0, ...ids);
        }
      }
    }
  }
  return { base, tracks, lessonOwner, glyphs, errors };
}
