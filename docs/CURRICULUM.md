# Yekiva Curriculum — from the alphabet to reading

The full learning path now runs from the first letter to independent reading,
in every language (French, Swahili, Lingala). Every lesson teaches like a
class: each step carries a spoken explanation in `say.text`, generated at
runtime by Meta MMS-TTS. Packs stay text-only; no audio is pre-generated.

## Level 1 — The full alphabet A–Z (watch, trace, recognize, say)

Every one of the 26 letters has its own lesson with the same 4-step ritual:
hear its sound inside a familiar word, watch it being written, trace it with
a finger, recognize it among close neighbors, then say the word aloud.
Special cases are taught explicitly: H is silent (hibou / hewa / hoteli),
C says "ch" in Swahili (chai), Q and X appear in loanwords (Qurani, teksi,
taxi). Lessons: `letter-a`, `i-l`, `voyelle-e/o/u`, `consonne-m/n/t/s`,
`lettre-b` through `lettre-z`.

## Level 2 — Vowels (e, o, u)

One lesson per vowel, same four-step ritual: the teacher's voice presents
the sound inside a familiar word ("E comme école"), the learner traces the
glyph, taps the right letter, and repeats the word. Lessons: `voyelle-e`,
`voyelle-o`, `voyelle-u`.

## Level 3 — Consonants (m, n, t, s)

Same ritual for the most frequent consonants, always anchored in a word the
learner already knows (maman, tasse, soleil). A short `alphabet-1` game then
checks that letter *names* are recognized, not only sounds. Lessons:
`consonne-m`, `consonne-n`, `consonne-t`, `consonne-s`, `alphabet-1`.

## Level 4 — Syllables (ba, ma…)

## Level 4b — Digraphs and trigraphs (two/three letters, one sound)

The class explains the key idea first: several letters can sing a single
sound. French: ch, ou, on, an, oi, gn. Swahili: ch, dh, gh, ng, ny, sh, th
plus prenasalized mb, nd, nj, nt, nz (mba, nda… as in ndizi, mboga).
Lingala: mb, nd, ng, nj, nz, mp, nt plus ch, sh, ph (mboka, nzete, photo).
Each lesson: hear the combined sound in its word, tap it among close
neighbors, say the word. Lessons: `digraphe-*` (6 fr, 12 sw, 10 ln).

The class explains blending: two sounds join into one syllable. The learner
hears the syllable inside its word, taps it among close neighbors, then says
the full word. Lessons: `syllabes-ba`, plus existing `syllables-li` (fr) /
`syllables-ma` (sw, ln).

## Level 5 — Words, sentences, reading

Short words built only from known syllables (`mots-simples`), then a first
sentence to listen to and repeat (`phrase-1`), then a two-sentence story with
a comprehension question (`lecture-1`) — the Citizen Literacy pattern of
reading from the very start, scaled to a full path.

## Tracks

- **Adult**: letters → vowels → consonants → alphabet names → syllables →
  words → sentence → story.
- **Child**: shorter path (A, I-L, vowels, M, syllables, first words).

## For reviewers

Swahili and especially Lingala word choices and phrasing should be checked by
native speakers before release (Lingala prompts were machine-translated with
Meta NLLB-200). The validator (`node tools/validate-packs.mjs`) guarantees
every lesson file is well-formed; pedagogy review guarantees it teaches well.
