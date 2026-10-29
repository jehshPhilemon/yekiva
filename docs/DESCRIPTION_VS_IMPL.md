# Yekiva — Descriptions vs implantation (v1)

Date : 28 oct. 2026. Base : commit `7eb334a` (v1, premier commit).
Objectif : vérifier que chaque phrase de votre description est couverte par du code, et nommer les écarts.

## 1. Public : adultes non-scolarisés + enfants

**Description** : « récupérer les personnes n'ayant pas eu la possibilité d'apprendre et/ou accélérer l'apprentissage pour des enfants ».

**Implanté** : oui.
- `app/www/js/screens/audience.js` : deux tuiles `adult` / `child`, une seule action par écran.
- `app/www/packs/*/manifest.json` : `tracks.adult` et `tracks.child` séparés (ex. sw adulte : `i-l → syllables-ma → mama-baba`, enfant : `i-l` seul).
- `app/www/js/core/storage.js` (`profile`, `progress`, `learnerData`) : profil `{ language, audience }` + progression par langue et par public, sans compte, sur l'appareil.

**Écart** : contenu enfant très pauvre (1 seule leçon `i-l`). Normal pour une v1, à enrichir par packs.

## 2. Ordre au premier lancement : adulte/enfant PUIS langues

**Description** : « deux options au début pour choisir si on est adulte ou enfant (première ouverture), puis les options des langues après cette étape. Tout pensé pour les personnes qui ne savent pas lire. »

**Implanté** : partiellement, **ordre inversé**.
- Réel : `main.js` → `start` (gros bouton play, débloque le son) → `language` → `audience` → `path`.
- `language.js` : choix « à l'oreille » — chaque langue parle dans SA propre langue (`prompts.language_pick`), tuile qui clignote (`ui/cycle.js`), tap = choix. Une nouvelle langue apparaît seule dès que son dossier existe dans `packs/index.json`.
- `audience.js` : les deux icônes parlent dans la langue déjà choisie (`prompts.audience_adult/child`), en boucle jusqu'au tap.

**Pourquoi l'inversion** : l'écran adulte/enfant a besoin d'une langue pour parler. Si on met adulte/enfant en premier, on ne sait pas dans quelle langue dire « je suis un adulte ». C'est documenté dans `docs/WHY.md §4`.

**Décision à prendre** :
- Option A (recommandée, garder l'actuel) : langue d'abord, public ensuite. C'est le seul ordre 100 % vocal sans lire.
- Option B (suivre votre phrase à la lettre) : public d'abord avec icônes seules + démonstration gestuelle, langue ensuite. Faisable mais l'écran public serait muet ou multilingue.
- Mon avis : garder A pour la démo hackathon, reformuler la description en « langue à l'oreille, puis adulte/enfant ».

## 3. Exercice « répéter » : voix → micro → serveur → Muse Transcribe

**Description** : « utiliser la voix de l'utilisateur pour "répéter" ; bouton enregistrer ; son envoyé au serveur pour transcription par Muse de Meta ».

**Implanté** : oui, chaîne complète.
- `steps/say_word.js` : l'app montre/dit le mot (`say` + `image` optionnelle), l'apprenant **maintient le micro** (geste WhatsApp), 3 essais max, étoile si OK, rejeu doux sinon, jamais de punition.
- `core/recorder.js` + `core/wav.js` : micro → WebM → WAV mono 16-bit 16 kHz (format exigé par Meta), testé.
- `core/transcriber.js` : `POST {serverUrl}/v1/transcribe?lang=xx`, retourne texte ou `null`.
- `server/src/app.js` : garde la clé, vérifie WAV (`422`), 5 Mo max, rate-limit, CORS, audio jamais sur disque.
- `server/src/providers/meta.js` : `POST https://api.meta.ai/v1/asr/transcribe` (multipart `request` + `audio`), modèle `muse-voice-transcribe-1.0`. Hypothèse langue via `META_ASR_LANG_FIELD` (sw/lingala hors des 25 langues vérifiées — à mesurer).
- `core/match.js` : comparaison tolérante pilotée par le pack (`stripAccents`, `ignoreCase`, `maxEdits`) — ex. « bie » accepté pour « bien ».
- Sans réseau/serveur : icône `cloudoff`, étape sautée **sans compter**, `listen_tap` prend le relais (plan B). `core/learner.js` ignore les `null`.

**Écart** : aucun bloquant. Reste à mesurer (20 mots isolés par langue, 2 voix, lieu bruyant) — voir `docs/API_META.md`.

## 4. Leçons = structure de données extensible, adaptable, boostée par l'IA

**Description** : « établir la structure des leçons, améliorée par l'IA ; ajouter d'autres formats ; ne pas rester statique ; s'adapter au rythme de l'utilisateur ».

**Implanté** : structure oui, adaptation pas encore.
- `core/registry.js` : `type → fonction`. Nouveau format = 1 fichier dans `steps/` + 1 ligne + 1 entrée dans `KNOWN_STEPS` du validateur. Type inconnu = sauté, pas de crash (vieux app lit nouveaux packs).
- `docs/LESSON_FORMAT.md` (schéma 1) : `watch_write`, `trace_letter`, `listen_tap`, `say_word`, chacun avec `items` (ce qu'on travaille) + `params`.
- `core/merge.js` (même fichier côté app et validateur) : 1 langue = 1 pack `base` + N `addon` fusionnés (`after`, `order`). Une leçon-IA devient un addon local, fusionné pareil. `tools/validate-packs.mjs --show` affiche le parcours fusionné.
- `server/src/lesson.js` : la réponse Spark (`{word, syllables}`) devient une leçon valide (étapes `listen_tap` construites par nous, pas par le modèle).
- `core/learner.js` : modèle Leitner (raté → revient aussitôt, réussi → espacé). **Il enregistre déjà chaque résultat** (`lesson.js` : `learner.record`), **mais ne pilote pas encore l'ordre des étapes** — le parcours suit `tracks` dans l'ordre.

**Écart** : l'adaptativité est câblée en collecte, pas en pilotage. Prochaine étape logique : trier les steps par `learner.prioritize()`.

## 5. Écriture main + photo d'ardoise corrigée par Meta

**Description** : « espace écriture à la main / ardoise photographiée → image vers Meta pour corriger ; lettre en pointillés à redessiner au doigt pour mémoriser les manuscrits, pas seulement le texte machine ».

**Implanté** : moitié.
- `steps/watch_write.js` : lettre animée trait par trait (`ui/glyph.js`, `progress`), voix guide, rejeu.
- `steps/trace_letter.js` : lettre en pointillés (`dashed`), tracé au doigt (canvas + capture pointer), poubelle pour effacer, coche pour valider. **Mais la coche valide toujours** (`ctx.onDone(true)`) — contrôle sens/ordre des traits marqué `TODO`, non fait.
- `glyphs.json` : traits en coordonnées 0..1 par forme (`i:lower_script`…), exemples seuls, vrai contenu pédagogique à créer (outil d'édition prévu dans `OPEN_QUESTIONS.md`).
- Photo : serveur `POST /v1/lesson-from-photo` → Spark → leçon (mot + syllabes) prêt. **Mais aucun écran « photographier » dans l'app** : pas de capture, pas d'envoi d'image, pas de correction d'écriture manuscrite (SAM 3.1 optionnel, risqué).

**Écart** : c'est le plus gros. Pour coller à votre description il manque (a) validation du tracé et (b) écran photo + correction d'écriture.

## Synthèse

| Exigence | État v1 | Fichiers clés |
|---|---|---|
| Public adulte + enfant, parcours séparés | ✅ fait | `audience.js`, `manifest.json`, `storage.js` |
| Choix non-lecteurs (voix + tuiles) | ✅ fait | `language.js`, `audience.js`, `cycle.js`, `speaker.js`, `icons.js` |
| Ordre public→langue | ⚠️ inversé (langue→public, justifié) | `main.js`, `WHY.md §4` |
| Répéter → micro → serveur → Muse | ✅ fait (+ plan B offline) | `say_word.js`, `recorder.js`, `wav.js`, `transcriber.js`, `server/src/app.js`, `providers/meta.js`, `match.js` |
| Leçons extensibles + IA | ✅ structure faite | `registry.js`, `LESSON_FORMAT.md`, `merge.js`, `validate-packs.mjs`, `server/src/lesson.js` |
| Adaptation au rythme | ⚠️ collecte seule, pas de pilotage | `learner.js`, `screens/lesson.js` |
| Lettre pointillés à retracer | ✅ squelette, ❌ sans validation | `trace_letter.js`, `glyph.js`, `glyphs.json` |
| Photo ardoise corrigée | ❌ serveur seul, pas d'écran | `lessonFromPhoto` (serveur), rien côté app |

## Prochaines étapes proposées (sans toucher au build)

1. Trancher l'ordre (A langue→public ou B public→langue) et figer la phrase dans la description.
2. Validation du tracé (sens + ordre), douce, avec coche + voix — le morceau qui rend la section 5 crédible en démo.
3. Faire piloter l'ordre des steps par `learner.prioritize()` — le morceau qui rend la section 4 crédible (« s'adapte au rythme »).
4. Écran photo minimal (capturer → `/v1/lesson-from-photo` → jouer la leçon générée) — seulement si clé Meta dispo pendant le hackathon, sinon garder le serveur mocké.
5. Contenu : enrichir `tracks.child` + vrais glyphes (au moins 3-4 lettres pleines par langue).

Dites-moi quels numéros on attaque, je code.
