# Tester Yekiva dans Termux (voix naturelle + serveur + Meta)

## 0. Le principe (voix naturelle, génération dans l'app)

- Les packs sont **texte seul** : aucune voix pré-générée, rien de robotique au build.
- La voix naturelle est générée **au moment de l'écoute, dans l'application** :
  texte du pack → `POST {serveur-Yekiva}/v1/speak` → voix neurale (français, swahili)
  → jouée + mise en cache sur le téléphone (rejouée hors-ligne ensuite).
- Muse sur l'API Meta sert à la transcription/vision/Spark. La voix reste un modèle Meta : MMS-TTS est auto-hébergé, car l'API hébergée Meta n'expose pas de route TTS.
- Sans serveur : la voix du téléphone dépanne (robotique), les tuiles clignotent quand même.

## 1. Voix naturelle MMS (aucune clé MMS à copier dans le projet)

Le serveur appelle d'abord l'API MMS Yekiva (`https://api.jehshphilemon.com`),
avec la clé déjà présente dans l'environnement serveur ou `/etc/tts-api.env`.
`YEKIVA_MMS_KEY` dans `server/.env` est facultative. Si ce fichier système
n'existe pas sur la machine qui héberge Yekiva, installer une fois le modèle Meta
local ci-dessous :

```sh
python3 -m venv "$HOME/yekiva-mms-tts"
"$HOME/yekiva-mms-tts/bin/python" -m pip install torch --index-url https://download.pytorch.org/whl/cpu
"$HOME/yekiva-mms-tts/bin/python" -m pip install transformers
sudo apt install ffmpeg          # conversion WAV -> MP3 (10x plus léger)
# les voix Meta (mms-tts-fra, mms-tts-swh) se téléchargent à la première écoute
```

## 2. Lancer le serveur + l'app

```sh
cp .env.example server/.env
# META_API_KEY sert à transcription/photo. La voix MMS n'exige pas YEKIVA_MMS_KEY ici.
cd server && PATH="$HOME/yekiva-mms-tts/bin:$PATH" node --env-file=.env src/index.js   # :8787
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
