// Tolerant comparison between the expected word and what the transcription heard.
// The rules come from the language pack (manifest.matching), not from code.

export function normalize(text, { stripAccents = true, ignoreCase = true } = {}) {
  let s = String(text ?? "").normalize("NFD");
  if (stripAccents) s = s.replace(/\p{M}/gu, "");
  s = s.replace(/[’‘`]/g, "'");
  if (ignoreCase) s = s.toLowerCase();
  return s.replace(/[^\p{L}\p{N}\s']/gu, "").replace(/\s+/g, " ").trim();
}

export function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Accepts if the whole phrase OR one of its words is within maxEdits of the expected word. */
export function isAccepted(expected, heard, rules = {}) {
  const maxEdits = rules.maxEdits ?? 1;
  const want = normalize(expected, rules);
  const got = normalize(heard, rules);
  if (!want || !got) return { ok: false, distance: Infinity };
  const candidates = [got, ...got.split(" ")];
  const distance = Math.min(...candidates.map((c) => levenshtein(want, c)));
  return { ok: distance <= maxEdits, distance };
}
