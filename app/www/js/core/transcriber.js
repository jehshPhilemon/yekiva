// Client of the YEKIVA server (never Meta directly).
// The server URL is baked in at build time (tools/build-config.mjs): the learner never types it.
// Placeholders ("__YEKIVA_SERVER_URL__") or empty = offline mode.
// Yekiva routes:
//   POST {server}/v1/speak              { text, lang? } -> audio/wav (natural voice, runtime)
//   POST {server}/v1/transcribe         audio/wav -> { text } (Meta transcription)
//   POST {server}/v1/lesson-from-photo  image/* -> lesson JSON (Meta vision)
// Meta routes (server-side only): POST https://api.meta.ai/v1/asr/transcribe, /chat/completions.
// Transcription returns null on any problem (offline, error): the caller falls back
// to plan B "listen and tap". The server never keeps the audio.
import { checkServerUrl, normalizeServerUrl } from "./server-url.js";

function resolveBase(raw) {
  let base = normalizeServerUrl(raw ?? "");
  if (!base || base.includes("__YEKIVA_")) {
    // Same-origin fallback: only usable when the host actually serves /health.
    try {
      base = location.origin;
    } catch {
      base = "";
    }
  }
  return base;
}

export function createTranscriber({ serverUrl, appToken }) {
  const token = String(appToken ?? "").includes("__YEKIVA_") ? "" : (appToken ?? "");
  const base = () => resolveBase(serverUrl);
  const usable = () => {
    const b = base();
    return Boolean(b) && checkServerUrl(b).ok;
  };
  const jsonHeaders = () => ({ "content-type": "application/json", ...(token ? { "x-app-token": token } : {}) });
  const headers = (ct) => ({ "content-type": ct, ...(token ? { "x-app-token": token } : {}) });
  const endpoint = () => `${base()}/v1/speak`;
  return {
    available: () => usable() && (typeof navigator === "undefined" || navigator.onLine !== false),
    serverUrl: base(),
    serverError() {
      // Human-readable reason shown by the server screen (and the debug banner).
      return checkServerUrl(base()).reason;
    },
    /**
     * Natural voice at runtime: the server synthesizes `text` in `lang` on demand.
     * Resolves to an audio Blob, or null (offline / not installed / error).
     * The SPEAKER caches the Blob (session + IndexedDB) — generation happens once per phrase.
     */
    async speak(text, lang) {
      if (!usable() || !String(text ?? "").trim()) return null;
      try {
        const res = await fetch(endpoint(), {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ text: String(text).slice(0, 300), lang }),
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return blob?.size ? blob : null;
      } catch {
        return null;
      }
    },
    async transcribe(wavBlob, lang) {
      if (!usable()) return null;
      try {
        const res = await fetch(`${base()}/v1/transcribe${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`, {
          method: "POST",
          headers: headers("audio/wav"),
          body: wavBlob,
        });
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.text === "string" ? data.text : null;
      } catch {
        return null;
      }
    },
    /** Photo -> generated lesson (YEKIVA server calls Muse Spark). Returns the lesson JSON or null. */
    async lessonFromPhoto(imageBlob, lang) {
      if (!usable()) return null;
      try {
        const ct = imageBlob.type || "image/jpeg";
        const res = await fetch(`${base()}/v1/lesson-from-photo${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`, {
          method: "POST",
          headers: headers(ct),
          body: imageBlob,
        });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
  };
}
