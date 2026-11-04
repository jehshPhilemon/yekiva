# Yekiva

Apprendre aujourd'hui, construire demain. Application Android d'alphabétisation :
apprendre à lire et à écrire par la voix, l'image et le geste, sans savoir lire.
Les leçons sont des **packs de données** (français, swahili, lingala) ; un petit
serveur utilise les modèles Meta pour construire des leçons et comprendre les
réponses parlées.

**Technique : Capacitor + JavaScript simple, sans étape de build.** Le dossier
`app/www/` *est* l'application : le code modifié est le code exécuté.
Identifiant du paquet Android : `com.jehshphilemon.yekiva`.

```
app/www/          L'application (HTML/CSS/JS) : index.html, js/ (core, screens, steps, ui), packs/ (leçons)
app/test/         Tests de logique (Node, sans navigateur)
app/capacitor.config.json, app/package.json   Coquille Android (Capacitor)
server/           Petit serveur Node sans dépendances : détient la clé Meta
tools/            serve.mjs, validate-packs.mjs, build-config.mjs, probe-meta.mjs, patch-android.mjs
docs/             WHY.md, LESSON_FORMAT.md, API_META.md, OPEN_QUESTIONS.md
.github/          CI : validation, tests, construction de l'APK
```

## Utilisation

```sh
node tools/serve.mjs 8080 --api https://api.jehshphilemon.com --key YKV-VOTRE-CLE
# ouvrir http://localhost:8080 (contexte sécurisé : le microphone y fonctionne)
```

Parcours : logo → langue → adulte/enfant → parcours → leçon (la lettre A montre
ses 4 versions : imprimé majuscule/minuscule, manuscrit majuscule/minuscule) →
bouton micro (conversation vocale) → bouton photo (leçon depuis une image).

| Bouton (parcours) | Rôle |
|---|---|
| Photo | Photographier un mot → une leçon est générée et expliquée à voix haute |
| Voix/Sauti/Mongongo | État de l'API voix (en ligne / hors-ligne) |
| Réécouter | Rejoue la consigne vocale |
| parler/ongea/loba | Conversation vocale : parler → transcription relue → réponse lue en TTS |

Le microphone exige un contexte sécurisé (`localhost` ou HTTPS).

## Développement

Prérequis : Node 20+ et git. Le SDK Android n'est pas nécessaire pour développer.

```sh
node tools/serve.mjs            # sert app/www sur http://localhost:8080
node tools/validate-packs.mjs   # valide (et fusionne) les packs de leçons
npm test --prefix app           # tests de logique de l'app
npm test --prefix server        # tests du serveur
```

L'aperçu navigateur utilise un proxy de développement même origine
(`tools/serve.mjs`) ; il n'y a ni champ d'URL serveur ni URL modifiable par
l'apprenant. Pour une compilation Android, l'adresse du serveur est intégrée
avec `node tools/build-config.mjs --api https://…`.

## APK

L'APK est construite par GitHub Actions, pas en local. Après un push : onglet
**Actions** → dernier run `ci` → artefact **yekiva-apk** (installable une fois
les « sources inconnues » autorisées). Au premier build, la CI génère
`app/android/` ; une fois le build vert, commiter ce dossier.

```sh
# Intégrer l'URL et la clé dans l'app (obligatoire : sans elles l'APK est muette)
node tools/build-config.mjs --api https://api.jehshphilemon.com --key YKV-VOTRE-CLE
node tools/build-config.mjs --check   # refuse un build silencieux

cd app && npm install
npx cap add android    # premier build seulement
npx cap sync android
cd android && ./gradlew assembleDebug
# APK : app/android/app/build/outputs/apk/debug/app-debug.apk
```

Secrets CI équivalents : `TTS_API_URL` + `TTS_API_KEY`
(Settings → Secrets → Actions). Voir `.github/workflows/ci.yml`.

## Ajouter une langue

1. Copier `app/www/packs/fr/` vers `app/www/packs/<code>/` ; adapter
   `manifest.json` (`prompts.language_pick` inclus), `glyphs.json`, `lessons/`.
2. Ajouter l'identifiant à `app/www/packs/index.json`.
3. Lancer `node tools/validate-packs.mjs`.

Aucun code à changer.

## Ajouter du contenu à une langue existante

Créer un pack `addon` (voir `app/www/packs/sw-famille/`) avec le même
`language` : il est fusionné dans le parcours de la langue.
Voir `docs/LESSON_FORMAT.md`. `node tools/validate-packs.mjs --show` affiche le
parcours fusionné de chaque langue.

Règles d'écriture des voix : toute consigne finissant par une lettre isolée
prend un **` :`** devant (`touche la lettre : b`, `gusa herufi : b`,
`simba letre : b`) pour que la synthèse marque la pause — vérifié par les
tests. Lingala : **latin strict, sans accents**.

## Serveur Yekiva (`server/`)

Le serveur détient la clé Meta : **l'APK ne la contient jamais**.
Routes : `GET /health`, `GET /v1/voice`,
`POST /v1/speak` `{text, lang?}` → MP3,
`POST /v1/transcribe` (wav) → `{text}`,
`POST /v1/lesson-from-photo` (image) → leçon JSON,
`POST /v1/chat` `{text, lang?}` → `{text}`,
`POST /v1/illustrate`, `POST /v1/generate-lesson` (outils hors-ligne).

```sh
cp server/.env.example server/.env   # renseigner, jamais commité
cd server && npm start               # écoute sur :8787
```

| Variable `server/.env` | Rôle | Exemple |
|---|---|---|
| `APP_TOKEN` | Clé `YKV-…` acceptée par le serveur | `YKV-9X3A-5T3X-YTM8-BM` |
| `META_API_KEY` | Clé Meta (leçons, transcription, photo). Serveur uniquement | `LLM_…` |
| `META_ASR_REQUEST` | Variante de requête ASR acceptée par le compte Meta | `{"audioEncoding":"wav"}` |
| `YEKIVA_MMS_URL` | Base de l'API voix | `https://api.jehshphilemon.com` |
| `YEKIVA_MMS_KEY` | `X-API-Key` de l'API voix (serveur uniquement) | `…` |
| `PORT` | Port d'écoute | `8787` |

Santé : `curl http://VOTRE-SERVEUR:8787/health` → `{"ok":true}`.
Puis pointer l'app vers ce serveur :

```sh
node tools/serve.mjs 8080 --api http://VOTRE-SERVEUR:8787 --key YKV-VOTRE-CLE
# ou APK : node tools/build-config.mjs --api http://VOTRE-SERVEUR:8787 --key YKV-VOTRE-CLE
```

### Authentification

La clé `YKV-…` (en-têtes `x-app-token`/`x-api-key`) est une clé anti-abus :
format `YKV-PPPP-PPPP-PPPP-CC`, validée **côté serveur uniquement**
(`server/src/apptoken.js`). Lisible dans l'app, elle **limite l'abus** sans
chiffrer ni remplacer une authentification complète. Sans `APP_TOKEN` : mode
ouvert (développement local). Avec `APP_TOKEN` : le serveur accepte ce token
ou toute clé `YKV` bien formée (`node tools/yekiva-key.mjs`). Les vrais secrets
(`META_API_KEY`, `YEKIVA_MMS_KEY`) ne quittent jamais le serveur.

## Backend voix (`api.jehshphilemon.com`)

Synthèse vocale Meta MMS-TTS (FastAPI + PyTorch CPU, fairseq/VITS, ffmpeg),
sur petit VPS mutualisé : chaque MP3 est **généré à la demande**, sans cache
serveur — compter quelques secondes par phrase, c'est normal. L'app compense :
toute voix déjà entendue est **cachée dans IndexedDB** et rejouée
instantanément hors-ligne ; seule la première écoute attend le VPS.

Contrat (tout ce que l'app utilise) :

```
GET  /health            → { status, languages: ["fra","eng","swh","ln"], formats, default_format, … }
POST /tts/v1/speak      en-tête x-api-key: <clé YKV-…>
     corps { "language": "fra"|"eng"|"swh"|"ln", "text": "…" (1–1500 car.), "format": "opus"|"mp3"|"wav" }
     → audio binaire (défaut opus ; l'app demande mp3, léger, lu partout)
     → 401 clé invalide, 400 langue/texte invalide, 503 modèles non prêts
```

Codes : app `fr/sw/ln/en` → API `fra/swh/ln/eng` (`toApiLang` dans
`app/www/js/core/voice-api.js`) ; le lingala (`ln`) utilise la voix swahilie
(`swh`). L'app envoie `x-api-key` **et** `x-app-token` (même valeur).

Relance du service :

```sh
python3 -m venv "$HOME/yekiva-mms-tts"
"$HOME/yekiva-mms-tts/bin/python" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
"$HOME/yekiva-mms-tts/bin/python" -m pip install transformers fastapi uvicorn pydantic scipy
sudo apt install ffmpeg
# modèles MMS (fra/eng/swh : config.json, vocab.txt, G_100000.pth) sous /srv/tts/mms/<code>/
# + fairseq/examples/mms/tts, vits/ (infer, utils, models) sous /srv/tts/
uvicorn app:app --host 0.0.0.0 --port 8000   # 3 modèles préchargés (~2 threads), verrou d'inférence unique
```

## Vérifications

```sh
node tools/validate-packs.mjs   # packs FR/SW/LN
npm test --prefix app           # 35 tests (voix, 4 versions, pause TTS ':')
npm test --prefix server        # 30 tests (routes, règle Lingala ASCII, chat)
curl -X POST http://VOTRE-SERVEUR:8787/v1/speak \
  -H 'content-type: application/json' -H 'x-app-token: YKV-VOTRE-CLE' \
  -d '{"text":"Question 1, touche la lettre : b","lang":"fr"}' -o t.mp3
# → HTTP 200, MP3 de quelques Ko
```
