# Architecture directe : l'app appelle l'API, rien entre les deux

## Le principe (simple)

```
AVANT (compliqué) : app → serveur Yekiva (à héberger) → API TTS
APRÈS (direct)    : app → API Yekiva TTS (https://api.jehshphilemon.com)
```

- **Termux et APK = même code.** `tools/serve.mjs` ne fait que servir les
  fichiers statiques (+ injecter l'URL/clé pour la session) : plus de proxy
  `/v1/*`, plus de `server/` à lancer. Ce que tu entends dans Termux, tu
  l'entends dans l'APK.
- **La clé TTS vit dans l'app** (`x-api-key`, bakée au build) : c'est une clé
  publique anti-abus (comme l'ancien APP_TOKEN), pas un secret.
- **CORS : déjà OK.** L'API répond `POST /tts/v1/speak` en HTTPS avec le bon
  content-type : la WebView Capacitor (`https://localhost`) et les navigateurs
  appellent directement, sans pré-vol compliqué.

## Contrat API utilisé

- `GET {api}/health` → `{ status, languages: ["fra","eng","swh","ln"], formats, ... }`
- `POST {api}/tts/v1/speak` + header `x-api-key`
  body `{ "language": "fra"|"eng"|"swh"|"ln", "text": "…", "format": "mp3" }`
  → audio binaire (mp3 demandé : léger, lu partout).
- Codes : app `fr/sw/ln/en` → API `fra/swh/ln/eng` (`core/voice-api.js:toApiLang`).
- Pas de routes transcription/photo pour l'instant : `transcribe()` et
  `lessonFromPhoto()` renvoient `null` → plan B offline automatique.

## Hors-ligne (point 4) : ce qui marche sans réseau

| Fonction | Sans réseau | Comment |
|---|---|---|
| Rejouer les voix déjà entendues | ✅ | cache IndexedDB (session + persistant) |
| Voix téléphone de secours | ✅ | synthèse vocale de l'appareil (robotique) |
| Exercices écoute/taper/tracer | ✅ | 100 % locaux (packs embarqués) |
| Exercice « répéter » au micro | ⚠️ écoute seule | pas de notation sans route transcription ; bouton continuer |
| Photo → leçon | ❌ expliquée | écran photo : message + retour parcours |
| Voix jamais entendues | ❌ | bip + voix téléphone ; la naturelle revient avec le réseau |

Règle d'or du code : **`speak()` ne rend jamais le silence** —
API → cache → voix téléphone, dans cet ordre.

## Construire (Termux = APK)

```sh
# Dev (Termux/navigateur) : même appel direct que l'APK
node tools/serve.mjs 8080 --api https://api.jehshphilemon.com --key YKV-....

# Prod (APK via GitHub Actions) : secrets TTS_API_URL + TTS_API_KEY
# .github/workflows/apk.yml les bake via tools/build-config.mjs, puis --check.
```

## Quand tu ajoutes les routes transcription/photo (dans l'heure)

1. Donne-moi : méthode + chemin + format d'envoi + format de réponse + auth.
2. J'implémente dans `core/voice-api.js` (`transcribe`, `lessonFromPhoto`) :
   l'écran photo et l'exercice micro sont déjà câblés dessus (ils basculent
   automatiquement du plan B vers la notation/jeu dès que ça renvoie non-null).
3. Ajoute les langues/formats acceptés ici + un test dans `app/test/core.test.js`.
