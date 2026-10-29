// Guard: the app talks ONLY to the Yekiva server, NEVER to Meta directly.
// The Yekiva server (server/src/app.js) exposes its OWN routes:
//   GET  /health
//   GET  /v1/voice               (capability probe, no synthesis)
//   POST /v1/speak               ({ text, lang? } -> audio/wav, natural voice)
//   POST /v1/transcribe          (audio/wav -> { text })
//   POST /v1/lesson-from-photo   (image/* -> lesson JSON)
// The Yekiva server then calls the REAL Meta endpoints server-side:
//   POST https://api.meta.ai/v1/asr/transcribe
//   POST https://api.meta.ai/v1/chat/completions
// Typing the Meta URL into the app is the #1 setup mistake: it produces
// doubled paths like /v1/v1/lesson-from-photo and "Failed to fetch" (CORS/key).
const META_MARKERS = ["api.meta.ai", "api.mata.ai", "/asr/transcribe", "/chat/completions"];

/** True when the URL looks like a Meta endpoint (forbidden in the app). */
export function isMetaUrl(url) {
  const u = String(url ?? "").toLowerCase();
  return META_MARKERS.some((m) => u.includes(m));
}

/** Strips a pasted full route (…/v1/transcribe, …/health) back to the server base. */
export function normalizeServerUrl(url) {
  let u = String(url ?? "").trim().split("?")[0].split("#")[0].replace(/\/+$/, "");
  for (const suffix of ["/v1/transcribe", "/v1/lesson-from-photo", "/v1/speak", "/v1/voice", "/health", "/v1"]) {
    if (u.toLowerCase().endsWith(suffix)) u = u.slice(0, -suffix.length).replace(/\/+$/, "");
  }
  return u;
}

/** { ok, reason } — used by the server screen and the transcriber. */
export function checkServerUrl(url) {
  const u = normalizeServerUrl(url);
  if (!u) return { ok: false, value: "", reason: "vide" };
  if (!/^https?:\/\//i.test(u)) return { ok: false, value: u, reason: "doit commencer par http(s):// — ex. http://192.168.1.10:8787" };
  if (isMetaUrl(u)) {
    return {
      ok: false,
      value: u,
      reason: "URL Meta interdite ici : entrez l'URL du serveur Yekiva (ex. http://IP:8787), pas https://api.meta.ai/v1. Seul le serveur Yekiva appelle Meta.",
    };
  }
  return { ok: true, value: u, reason: "" };
}
