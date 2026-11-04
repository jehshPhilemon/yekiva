// Modules = a DISPLAY grouping of the merged path (the track stays the source of truth).
// Pure JS, no DOM: runs in the browser and in Node (the validator imports this file).
//
// Manifest (base pack only):
//   "modules": { "adult": [ { "id": "m1", "start": "i-l", "name": "Letters", "say": { "text": "..." } }, ... ], "child": [...] }
// A module spans from its `start` lesson up to the next module's `start`. Lessons that an addon
// inserts in the middle of the path therefore fall into the right module without any change.

/** Groups a merged track into [{ id, say, lessons }]. No definitions = a single module. */
export function groupModules(track, defs = []) {
  const valid = [];
  let last = -1;
  for (const d of defs ?? []) {
    const at = track.indexOf(d?.start);
    if (at === -1 || at <= last) continue; // unknown or out-of-order start: ignored (the validator reports it)
    valid.push({ def: d, at });
    last = at;
  }
  if (!valid.length) return [{ id: "all", name: null, say: null, lessons: [...track] }];
  const out = [];
  if (valid[0].at > 0) out.push({ id: "start", name: null, say: null, lessons: track.slice(0, valid[0].at) });
  valid.forEach((v, i) => {
    const end = i + 1 < valid.length ? valid[i + 1].at : track.length;
    out.push({ id: v.def.id, name: v.def.name ?? null, say: v.def.say ?? null, lessons: track.slice(v.at, end) });
  });
  return out;
}

/** Returns a list of error strings (empty = valid). `tracks` is the MERGED path per audience. */
export function validateModules(tracks, modules) {
  const errors = [];
  if (modules === undefined) return errors;
  if (modules === null || typeof modules !== "object" || Array.isArray(modules)) return [`modules: must be an object { adult, child }`];
  for (const key of Object.keys(modules)) {
    if (key !== "adult" && key !== "child") errors.push(`modules.${key}: unknown audience (adult | child)`);
  }
  for (const audience of ["adult", "child"]) {
    const defs = modules[audience];
    if (defs === undefined) continue;
    const track = tracks?.[audience] ?? [];
    if (!Array.isArray(defs)) {
      errors.push(`modules.${audience}: must be a list`);
      continue;
    }
    const ids = new Set();
    let last = -1;
    defs.forEach((d, i) => {
      const at = `modules.${audience}[${i}]`;
      if (typeof d?.id !== "string" || !d.id) errors.push(`${at}: 'id' is required`);
      else if (ids.has(d.id)) errors.push(`${at}: duplicate module id '${d.id}'`);
      else ids.add(d.id);
      if (d?.name !== undefined && (typeof d.name !== "string" || !d.name)) errors.push(`${at}: 'name' must be a non-empty text`);
      if (d?.say !== undefined && !d.say?.text) errors.push(`${at}: 'say' needs a 'text'`);
      if (d?.say?.audio) errors.push(`${at}: 'audio' is forbidden (voice is generated at runtime)`);
      const idx = track.indexOf(d?.start);
      if (idx === -1) errors.push(`${at}: start='${d?.start}' is not in the ${audience} path`);
      else if (idx <= last) errors.push(`${at}: start='${d.start}' must come after the previous module's start`);
      else last = idx;
    });
    if (defs.length && track.length && defs[0]?.start !== track[0]) {
      errors.push(`modules.${audience}[0]: the first module must start at the first lesson ('${track[0]}')`);
    }
  }
  return errors;
}
