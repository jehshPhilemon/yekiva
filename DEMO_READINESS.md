# Yekiva — contrôle de préparation démo

## Résultat automatisé

- Tests application : **28 réussis / 0 échec**.
- Tests serveur : **27 réussis / 0 échec**.
- Validation des packs : **OK**, 4 packs et 3 langues. Un avertissement non bloquant concerne une étape future inconnue dans `fr/syllables-li`; elle est ignorée volontairement par l’application.
- Syntaxe des modules modifiés : **OK**.
- Permissions Android micro/audio : présentes.
- Profil, langue, public et progression : sauvegardés localement.

## Fonctionnalités prêtes dans le code

- Parcours pédagogique hors ligne avec progression et déverrouillage séquentiel.
- Voix sur les écrans, leçons et exercices avec cache local et fallback synthèse vocale du téléphone.
- Microphone réservé à l’écran **Conversation**, pas aux tests pédagogiques.
- Transcription conversation via `POST /v1/transcribe`.
- Photo vers mini-leçon via `POST /v1/lesson-from-photo` ; le serveur délègue à Meta Spark Vision et reconstruit une leçon validée.
- Génération de leçons via `POST /v1/generate-lesson` ; le serveur délègue à Meta Spark et valide le format.
- Illustration via `POST /v1/illustrate` côté serveur/outillage.
- Compatibilité d’authentification avec `x-api-key` et `x-app-token`.
- Compatibilité voix avec l’API historique `/tts/v1/speak` et le serveur Yekiva `/v1/speak`.

## À faire avant l’installation de l’APK

L’APK fourni dans l’archive source doit être construit avec l’URL réelle du serveur et la clé d’application réelle. Les placeholders actuels sont intentionnels : ils empêchent de distribuer une APK silencieuse.

```bash
cd yekiva
node tools/build-config.mjs --api https://VOTRE_SERVEUR_YEKIVA --key VOTRE_CLE_YKV
node tools/build-config.mjs --check
cd app
npm install
npx cap sync android
cd ..
node tools/patch-android.mjs
cd app/android
./gradlew assembleDebug
```

Côté serveur, configurer au minimum :

```bash
META_API_KEY=LLM_...       # clé Meta, uniquement côté serveur
APP_TOKEN=YKV-...          # clé utilisée par l’APK pour les routes Yekiva
YEKIVA_MMS_KEY=YKV-...     # clé voix MMS côté serveur si la voix naturelle est activée
```

Vérifications rapides sur le serveur :

```bash
curl https://VOTRE_SERVEUR_YEKIVA/health
# doit répondre {"ok":true}
```

Puis, dans l’application :

1. Choisir la langue et Adulte/Enfant.
2. Fermer puis rouvrir l’application : le profil doit être conservé.
3. Ouvrir une première leçon et vérifier la voix.
4. Ouvrir **Parler**, enregistrer un court message et vérifier la transcription.
5. Ouvrir **Photo**, prendre un mot lisible et vérifier la mini-leçon Meta.
6. Revenir au parcours et vérifier que le niveau terminé reste enregistré.

## Blocages encore externes au code

Le contrôle local ne peut pas prouver un appel Meta réel sans `META_API_KEY`, ni une voix distante sans URL/clé serveur. Dans l’environnement de vérification, ces variables ne sont pas présentes et aucun Android SDK n’est installé ; la compilation Gradle doit donc être faite sur Termux ou GitHub Actions avec les secrets configurés.
