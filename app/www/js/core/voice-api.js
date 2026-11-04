// Client DIRECT de l'API Yekiva TTS — aucun serveur intermédiaire.
//
// Contrat (api.jehshphilemon.com, OpenAPI 3.1 "Yekiva TTS API 2.0.0") :
//   GET  {base}/health          -> { status, languages, formats, default_format, ... }
//   POST {base}/tts/v1/speak    { language, text, format? } -> audio binaire (opus/mp3/wav)
//   Header : x-api-key: <TTS_API_KEY> (clé publique lisible dans l'app, comme avant).
//
// Codes langue API : fra / eng / swh / ln. Codes app : fr / sw / ln / en.
// L'app appelle l'API directement, pareil dans Termux (navigateur) et dans l'APK
// (Capacitor https://localhost) : même code, même comportement, en ligne comme hors-ligne.
// Hors-ligne : speak() renvoie null -> le speaker rejoue le cache puis la voix téléphone.
export const API_LANG = { fr: "fra", sw: "swh", ln: "ln", en: "eng" };
export const APP_LANG = { fra: "fr", swh: "sw", ln: "ln", eng: "en" };

export function toApiLang(code) {
  if (!code) return "fra";
  if (API_LANG[code]) return API_LANG[code];
  const c = String(code).toLowerCase();
  if (["fra", "eng", "swh", "ln"].includes(c)) return c;
  if (c.startsWith("fr")) return "fra";
  if (c.startsWith("sw")) return "swh";
  if (c.startsWith("li")) return "ln";
  if (c.startsWith("en")) return "eng";
  return "fra";
}

function cleanBase(raw) {
  let b = String(raw ?? "").trim();
  if (!b || b.includes("__TTS_") || b.includes("__YEKIVA_")) return "";
  b = b.split("?")[0].split("#")[0].replace(/\/+$/, "");
  for (const suffix of ["/tts/v1/speak", "/tts/v1", "/tts", "/v1/speak", "/v1"]) {
    if (b.toLowerCase().endsWith(suffix)) b = b.slice(0, -suffix.length).replace(/\/+$/, "");
  }
  return b;
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
  return { signal: ctrl.signal, done() { clearTimeout(t); } };
}

export function createVoiceApi({ apiUrl, apiKey }) {
  const base = () => cleanBase(apiUrl);
  const key = () => String(apiKey ?? "").trim();
  const configured = () => {
    const b = base();
    return Boolean(b) && /^https?:\/\//i.test(b) && !b.includes("__YEKIVA_") && !b.includes("__TTS_");
  };
  const speakEndpoint = () => `${base()}/tts/v1/speak`;
  const healthEndpoint = () => `${base()}/health`;

  return {
    baseUrl: base(),
    apiUrl: base(),
    serverUrl: base(), // alias : l'ancien code lisait transcriber.serverUrl
    configured: () => configured(),
    available: () => configured() && (typeof navigator === "undefined" || navigator.onLine !== false),
    /** La clé est-elle bakée ? (booléen seulement, jamais la clé elle-même). */
    hasKey: () => Boolean(key()),
    serverError() {
      const b = base();
      if (!b || b.includes("__YEKIVA_") || b.includes("__TTS_")) return "API non configurée (clé/URL manquante au build)";
      return "";
    },
    /** GET /health : l'API répond-elle ? (affiche aussi langues + formats). */
    async health() {
      if (!configured()) return null;
      const t = withTimeout(10000);
      try {
        const res = await fetch(healthEndpoint(), { signal: t.signal });
        if (!res.ok) return null;
        return await res.json().catch(() => null);
      } catch {
        return null;
      } finally {
        t.done();
      }
    },
    /**
     * Diagnostic honnête : pourquoi la voix API ne marche pas ?
     * Renvoie { ok, cause } où cause vaut :
     *   "no-config" (pas d'URL bakée), "no-key" (pas de clé bakée),
     *   "offline" (navigateur hors-ligne), "http-XXX" (l'API a refusé),
     *   "network" (injoignable), "empty" (réponse vide), "ok".
     */
    async diagnoseSpeak(text = "Bonjour", lang = "fr", { format = "mp3" } = {}) {
      if (!base()) return { ok: false, cause: "no-config" };
      if (!key()) return { ok: false, cause: "no-key" };
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return { ok: false, cause: "offline" };
      }
      if (!String(text ?? "").trim()) return { ok: false, cause: "empty-text" };
      const t = withTimeout(20000);
      try {
        const res = await fetch(speakEndpoint(), {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key() },
          body: JSON.stringify({
            language: toApiLang(lang),
            text: String(text).slice(0, 300),
            format,
          }),
          signal: t.signal,
        });
        if (!res.ok) return { ok: false, cause: `http-${res.status}` };
        const blob = await res.blob();
        if (!blob?.size) return { ok: false, cause: "empty" };
        return { ok: true, cause: "ok", blob };
      } catch {
        return { ok: false, cause: "network" };
      } finally {
        t.done();
      }
    },
    /**
     * Voix naturelle : POST /tts/v1/speak { language, text, format } -> Blob audio.
     * Renvoie null si offline / non configuré / erreur (le speaker bascule sur
     * cache puis voix téléphone). `format` demandé : mp3 (léger, lu partout).
     */
    async speak(text, lang, { format = "mp3" } = {}) {
      const d = await this.diagnoseSpeak(text, lang, { format });
      return d.ok ? d.blob : null;
    },
    /**
     * Transcription micro (FUTUR) : pas de route API pour l'instant.
     * Renvoie toujours null -> l'exercice "répéter" bascule sur le plan B
     * "écouter et taper" (offline-friendly), sans jamais bloquer.
     */
    async transcribe() {
      return null;
    },
    /**
     * Photo -> leçon (FUTUR) : pas de route API pour l'instant.
     * Renvoie toujours null -> l'écran photo l'explique et repart au parcours.
     */
    async lessonFromPhoto() {
      return null;
    },
  };
}
