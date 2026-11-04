// Build-time settings: l'adresse de l'API Yekiva TTS + sa clé, bakées au build.
// L'app appelle l'API DIRECTEMENT (aucun serveur intermédiaire) :
//   POST {apiUrl}/tts/v1/speak { language, text, format } + header x-api-key
//   GET  {apiUrl}/health (diagnostic)
// La clé TTS n'est PAS un secret (lisible dans l'app) : elle limite l'abus.
//   - Prod (APK + Termux) : node tools/build-config.mjs --api https://... --key YKV-....
//   - Offline volontaire : placeholders / vide = cache + voix téléphone uniquement.
export const config = {
  apiUrl: "__TTS_API_URL__",
  apiKey: "__TTS_API_KEY__",
};
