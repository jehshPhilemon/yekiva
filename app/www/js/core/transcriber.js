// Client of the YEKIVA server (never Meta directly).
// The server URL is baked in at build time (tools/build-config.mjs): the learner never types it.
// Placeholders ("__YEKIVA_SERVER_URL__") or empty = offline mode.
// Yekiva routes:
//   POST {server}/v1/speak              { text, lang? } -> audio/mpeg (Meta MMS-TTS voice, runtime)
//   POST {server}/v1/transcribe         audio/wav -> { text } (Meta transcription)
//   POST {server}/v1/lesson-from-photo  image/* -> lesson JSON (Meta vision)
// Meta routes (server-side only): POST https://api.meta.ai/v1/asr/transcribe, /chat/completions.
// Transcription returns null on any problem (offline, error): the caller falls back
// to plan B "listen and tap". The server never keeps the audio.
//
// APK note (Capacitor): the app runs on https://localhost. A same-origin fallback
// is WRONG inside the APK (the WebView does not serve /health or /v1/*): it makes
// every request fail and the app goes fully silent (no natural voice, no phone
// voice fallback since speak() returns null... then speakLocal IS called — but
// the real bug reported is "no sound at all" because the APK build kept the
// placeholders AND the WebView blocked the silent fetch). Rule: placeholders or
// empty = offline mode, NEVER location.origin inside Capacitor.
import { checkServerUrl, normalizeServerUrl } from "./server-url.js";

function isCapacitorOrigin(origin) {
  const o = String(origin ?? "").toLowerCase();
  return (
    o.startsWith("capacitor://") ||
    o.startsWith("ionic://") ||
    o === "https://localhost" ||
    o === "http://localhost"
  );
}

function resolveBase(raw) {
  const base = normalizeServerUrl(raw ?? "");
  if (!base || base.includes("__YEKIVA_")) return "";
  return base;
}

function withTimeout(ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
  return {
    signal: ctrl.signal,
    done() {
      clearTimeout(t);
    },
  };
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
    configured: () => usable(),
    serverError() {
      // Human-readable reason shown by the server screen (and the debug banner).
      const b = base();
      if (!b) return "serveur non configuré (build sans --api)";
      return checkServerUrl(b).reason;
    },
    /**
     * Natural voice at runtime: the server synthesizes `text` in `lang` on demand.
     * Resolves to an audio Blob, or null (offline / not installed / error).
     * The SPEAKER caches the Blob (session + IndexedDB) — generation happens once per phrase.
     */
    async speak(text, lang) {
      if (!usable() || !String(text ?? "").trim()) return null;
      const t = withTimeout(15000);
      try {
        const res = await fetch(endpoint(), {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ text: String(text).slice(0, 300), lang }),
          signal: t.signal,
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        return blob?.size ? blob : null;
      } catch {
        return null;
      } finally {
        t.done();
      }
    },
    async transcribe(wavBlob, lang) {
      if (!usable()) return null;
      const t = withTimeout(30000);
      try {
        const res = await fetch(`${base()}/v1/transcribe${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`, {
          method: "POST",
          headers: headers("audio/wav"),
          body: wavBlob,
          signal: t.signal,
        });
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.text === "string" ? data.text : null;
      } catch {
        return null;
      } finally {
        t.done();
      }
    },
    /** Photo -> generated lesson (YEKIVA server calls Muse Spark). Returns the lesson JSON or null. */
    async lessonFromPhoto(imageBlob, lang) {
      if (!usable()) return null;
      const t = withTimeout(60000);
      try {
        const ct = imageBlob.type || "image/jpeg";
        const res = await fetch(`${base()}/v1/lesson-from-photo${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`, {
          method: "POST",
          headers: headers(ct),
          body: imageBlob,
          signal: t.signal,
        });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      } finally {
        t.done();
      }
    },
  };
}

export { isCapacitorOrigin };
