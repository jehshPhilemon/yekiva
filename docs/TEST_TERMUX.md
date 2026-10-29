# Tester Yekiva dans Termux (voix naturelle + serveur + Meta)

## 0. Le principe (voix naturelle, génération dans l'app)

- Les packs sont **texte seul** : aucune voix pré-générée, rien de robotique au build.
- La voix naturelle est générée **au moment de l'écoute, dans l'application** :
  texte du pack → `POST {serveur-Yekiva}/v1/speak` → voix neurale (français, swahili)
  → jouée + mise en cache sur le téléphone (rejouée hors-ligne ensuite).
- Meta fait transcription + vision (pas de TTS chez Meta — vérifié sur dev.meta.ai).
- Sans serveur : la voix du téléphone dépanne (robotique), les tuiles clignotent quand même.

## 1. Installer la voix naturelle (une fois, sur la machine serveur)

```sh
pip install piper-tts
# les voix fr + sw se téléchargent seules à la première écoute
```

## 2. Lancer le serveur + l'app

```sh
cp .env.example server/.env
# éditer server/.env : META_API_KEY=votre_clé  (transcription + photo ; pas besoin pour la voix)
cd server && node --env-file=.env src/index.js   # :8787
```

```sh
node tools/serve.mjs 8080   # dans un 2e terminal
```

Ouvrir dans Chrome Android : `http://localhost:8080/?debug=1`.
Autoriser le son (bouton play au démarrage = premier geste obligatoire).

## 3. Vérifier la voix naturelle

```sh
node tools/probe-meta.mjs speak "ma" sw
node tools/probe-meta.mjs speak "Pour le français, appuie ici" fr
# -> written speak-sw.wav : écoutez le fichier, voix neurale (pas robotique)
```

Dans l'app : chaque écran parle dès l'arrivée. Diagnostic :

```js
await YEKIVA.voice()
```

- `natural: true` → voix neurale du serveur (bon cas).
- `natural: false` → serveur injoignable : voix téléphone (dépannage).
- `cached: N` → phrases déjà en cache sur le téléphone (hors-ligne OK).

## 4. Si aucune voix / aucun clignotement

- Même sans voix, les tuiles clignotent ≥ 1,6 s chacune : si rien ne clignote, c'est le CSS/JS, pas la voix.
- `count: 0` → le téléphone n'a aucune voix TTS de secours : installez la synthèse vocale Google (secours hors-ligne uniquement).

## 5. Vérifier la clé Meta (transcription + photo uniquement)

```sh
node tools/probe-meta.mjs make-wav silence.wav
node tools/probe-meta.mjs asr silence.wav
```

- `HTTP 400` avec message de validation → clé acceptée, schéma à ajuster.
- `HTTP 401/403` → clé invalide.

## 6. Package Android

`app/capacitor.config.json` : `appId = com.jehshphilemon.yekiva`.
Le CI (`cap add android`) reprendra cet ID ; aucune action locale requise.
Avant le build APK : `node tools/build-config.mjs --api https://VOTRE-SERVEUR`
(URL du serveur Yekiva baked dans l'app ; l'apprenant ne tape jamais d'URL).
