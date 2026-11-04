# Pourquoi l'APK était muet (et Termux parlait) — correctif

## Cause racine

Dans Termux, `node tools/serve.mjs` **réécrit** `js/config.js` à la volée
(same-origin) et **proxie** `/v1/*` vers le serveur Yekiva. L'app trouve donc
toujours une voix, même avec les placeholders.

Dans l'APK Capacitor, ce proxy **n'existe pas** :
- `app/www/js/config.js` gardait `serverUrl: "__YEKIVA_SERVER_URL__"` si le
  build GitHub Actions ne lançait pas `node tools/build-config.mjs --api …` ;
- l'ancien `resolveBase()` retombait alors sur `location.origin`
  (= `https://localhost` dans la WebView), qui ne sert ni `/health` ni
  `/v1/speak` → chaque `fetch` échouait ;
- Android 9+ **bloque le HTTP en clair** par défaut : même avec une vraie URL
  `http://`, la WebView refusait la connexion sans `usesCleartextTraffic` ;
- `speechSynthesis` dans la WebView peut arriver vide/en retard, et l'ancien
  `pickVoice()` rendait `null` → silence total au lieu de la voix téléphone.

Résultat : Termux parlait, l'APK restait muet.

## Correctif (ce patch)

1. **`app/www/js/core/transcriber.js`** — les placeholders/URL vide donnent
   `serverUrl: ""` (mode offline explicite), **jamais** `location.origin`.
   Ajout de timeouts (`speak` 15 s, `transcribe` 30 s, photo 60 s) et d'un
   `serverError()` qui dit « serveur non configuré (build sans --api) ».
2. **`app/www/js/core/speaker.js`** — le fallback voix téléphone ne rend plus
   jamais le silence : voix par défaut si aucun match, petit délai après
   `cancel()` (quirk WebView Android), `playBlob()` blindé, `say()` en
   try/catch (tout échec serveur → voix téléphone).
3. **`tools/build-config.mjs`** — *fail-closed* : sans `--api`/`YEKIVA_SERVER_URL`,
   le script **refuse** de générer un build (au lieu de laisser un APK muet).
   `--check` vérifie l'URL bakée (pour la CI), `--allow-offline` documente un
   build volontairement hors-ligne, `--reset` restaure les placeholders.
4. **`tools/patch-android.mjs`** — ajoute `INTERNET`, `RECORD_AUDIO`,
   `MODIFY_AUDIO_SETTINGS` + `usesCleartextTraffic="true"` et un
   `network_security_config.xml` (`cleartextTrafficPermitted="true"`) pour les
   serveurs vocaux en `http://` (LAN/VPS).
5. **`app/capacitor.config.json`** — `server.cleartext: true` +
   `android.allowMixedContent: true` (la page `https://localhost` peut appeler
   un serveur vocal `http://`).
6. **`.github/workflows/apk.yml`** (nouveau) — pipeline complet : validate →
   bake URL (échoue si le secret `YEKIVA_SERVER_URL` manque) → `cap add/sync`
   → patch manifest → `assembleDebug` → artefact `yekiva-apk`.
7. **Tests** — 2 tests de non-régression dans `app/test/core.test.js`.

## Refaire un APK qui parle (3 étapes)

1. GitHub → **Settings → Secrets → Actions** : ajouter
   `YEKIVA_SERVER_URL=https://votre-serveur` (+ `APP_TOKEN` si configuré
   côté serveur, même valeur que `server/.env`).
   Le serveur doit être **HTTPS public** (requis Android) et exposer
   `GET /health` + `POST /v1/speak`.
2. `git push` → onglet **Actions** → job `apk` vert → artefact **yekiva-apk**.
3. Sur le téléphone : installer, ouvrir avec `?debug=1` une fois pour voir le
   bandeau d'erreurs, lancer `await YEKIVA.voice()` dans la console :
   `natural: true` = voix Meta, `false` = voix téléphone (serveur injoignable),
   `cached: N` = phrases déjà en cache.

## Vérifier avant d'installer

```sh
node tools/build-config.mjs --api https://votre-serveur [--token YKV-....]
node tools/build-config.mjs --check   # doit afficher "config OK"
```
