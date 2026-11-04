// The app's voice: natural API TTS generated at RUNTIME inside the app, cached on-device.
// Priority per utterance:
//   1. memory cache (this session)
//   2. IndexedDB cache (previous sessions, offline reuse) — key: lang + text + voice
//   3. API Yekiva directe POST /tts/v1/speak {language, text} -> audio
//   4. no phone fallback: a broken phone voice must never mask an API failure
// Packs carry TEXT ONLY (no pre-generated audio): packs/*.json never reference audio files.
// The voice is chosen per language (env META_TTS_VOICE / META_TTS_VOICES='{"sw":"..."}').
//
// APK note: the API audio element must be unlocked by a user gesture.
// Phone speech synthesis is intentionally not used.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FOCUS_PAUSE_MS = 450;
// Natural speech rhythm: split a long prompt into spoken phrases so the TTS
// breathes after strong punctuation (., !, ?, :, ;) and lightly after commas.
const PHRASE_PAUSE_MS = { ".": 700, "!": 700, "?": 700, ":": 550, ";": 550, ",": 350 };
function splitPhrases(text) {
  const parts = String(text ?? "").split(/([.,!?:;]+)/).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const phrase = parts[i] ?? "";
    const punct = parts[i + 1] ?? "";
    if (!phrase) continue;
    const last = punct.slice(-1);
    out.push({ text: punct ? `${phrase}${punct}` : phrase, pause: PHRASE_PAUSE_MS[last] ?? FOCUS_PAUSE_MS });
  }
  if (!out.length && String(text ?? "").trim()) out.push({ text: String(text).trim(), pause: FOCUS_PAUSE_MS });
  return out;
}

const BCP47 = { fr: "fr-FR", sw: "sw-KE", ln: "ln-CD", en: "en-US" };
export function bcp47(code) {
  if (!code) return undefined;
  if (code.includes("-")) return code;
  return BCP47[code] ?? code;
}

// ---- on-device audio cache (IndexedDB): generated once, replayed offline ----
const CACHE_DB = "yekiva-voice";
const CACHE_STORE = "tts";
let dbPromise = null;
function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(CACHE_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}
function cacheKey(lang, text) {
  return `${lang ?? "?"}::${text}`;
}
async function cacheGet(lang, text) {
  try {
    const d = await db();
    if (!d) return null;
    return await new Promise((resolve) => {
      try {
        const tx = d.transaction(CACHE_STORE, "readonly");
        const q = tx.objectStore(CACHE_STORE).get(cacheKey(lang, text));
        q.onsuccess = () => resolve(q.result ?? null);
        q.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}
async function cachePut(lang, text, blob) {
  try {
    const d = await db();
    if (!d) return;
    await new Promise((resolve) => {
      try {
        const tx = d.transaction(CACHE_STORE, "readwrite");
        tx.objectStore(CACHE_STORE).put(blob, cacheKey(lang, text));
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      } catch {
        resolve();
      }
    });
  } catch { /* cache is best-effort */ }
}

export function createSpeaker({ speakFn } = {}) {
  let current = null;
  let warmed = false;
  let generation = 0;
  const mem = new Map(); // session cache: key -> Blob

  // Traduction des causes techniques en phrases pour un testeur sans clavier.
  function explainCause(cause) {
    switch (String(cause ?? "")) {
      case "no-config":
        return "cet APK a été construit sans --api (adresse API manquante) : API vocale uniquement";
      case "no-key":
        return "clé API manquante dans cet APK (build sans --key) : l'API répond 401, API vocale uniquement";
      case "offline":
        return "téléphone hors-ligne (Wi-Fi/4G coupé) : API vocale uniquement";
      case "http-401":
        return "l'API refuse la clé (401) : clé absente ou fausse dans le build, API vocale uniquement";
      case "http-422":
        return "l'API refuse le texte ou la langue (422) : aucun fallback téléphone, prévenez le développeur";
      case "http-500":
      case "http-502":
      case "http-503":
        return `l'API est en panne (${cause}) : réessayez, aucun fallback téléphone`;
      case "empty":
        return "l'API répond vide : réessayez, aucun fallback téléphone";
      case "empty-text":
        return "rien à dire (texte vide) : erreur interne, prévenez le développeur";
      case "network":
        return "API injoignable (réseau ? adresse fausse ?) : API vocale uniquement";
      default:
        return /^http-\d+$/.test(String(cause))
          ? `l'API répond ${String(cause).slice(5)} : aucun fallback téléphone, voir « erreurs »`
          : "l'API ne renvoie aucun audio (voir « erreurs »)";
    }
  }

  function stop() {
    if (current) {
      try {
        current.pause();
        const url = current.dataset?.objectUrl;
        if (url) URL.revokeObjectURL(url);
      } catch { /* ignore */ }
      current = null;
    }
    generation += 1;
  }

  /** Call on first user gesture: unlocks audio + preloads voices. */
  async function ready() {
    if (warmed) return;
    warmed = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        if (ctx.state === "suspended") await ctx.resume().catch(() => {});
        await ctx.close().catch(() => {});
      }
    } catch { /* ignore */ }
  }

  function playBlob(blob, token = generation) {
    if (token !== generation) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        try {
          URL.revokeObjectURL(url);
        } catch { /* ignore */ }
        if (current === a) current = null;
        resolve(true);
      };
      let url = "";
      try {
        url = URL.createObjectURL(blob);
      } catch {
        return done();
      }
      const a = new Audio(url);
      try {
        a.dataset.objectUrl = url;
      } catch { /* ignore */ }
      if (token !== generation) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
        return resolve(false);
      }
      current = a;
      a.onended = done;
      a.onerror = done;
      try {
        const p = a.play();
        if (p?.catch) p.catch(done);
      } catch {
        done();
      }
      setTimeout(done, 15000); // safety net
    });
  }

  async function speakOnce(text, lang, token) {
    const key = cacheKey(lang, text);
    if (mem.has(key)) return playBlob(mem.get(key), token);
    const cached = await cacheGet(lang, text);
    if (cached) {
      mem.set(key, cached);
      return playBlob(cached, token);
    }
    let blob = null;
    try {
      blob = await speakFn(text, lang);
    } catch {
      return null;
    }
    if (!blob || token !== generation) return null;
    mem.set(key, blob);
    cachePut(lang, text, blob);
    return playBlob(blob, token);
  }

  /** Natural voice: server TTS (Meta) with session + IndexedDB cache. Null when unavailable. */
  async function speakRemote(text, lang, token = generation) {
    if (!speakFn || !text || token !== generation) return null;
    const phrases = splitPhrases(text);
    let played = false;
    for (const phrase of phrases) {
      if (token !== generation) return played ? true : null;
      const ok = await speakOnce(phrase.text, lang, token);
      if (!ok) return played ? true : null;
      played = true;
      if (token === generation) await sleep(phrase.pause);
    }
    return played;
  }

  return {
    stop,
    ready,
    cache: {
      async clear() {
        mem.clear();
        try {
          const d = await db();
          if (d) await new Promise((resolve) => {
            try {
              const tx = d.transaction(CACHE_STORE, "readwrite");
              tx.objectStore(CACHE_STORE).clear();
              tx.oncomplete = resolve;
              tx.onerror = resolve;
            } catch {
              resolve();
            }
          });
        } catch { /* ignore */ }
      },
    },
    /**
     * @param {{text?: string}} say  (packs are text-only; any legacy `audio` is ignored)
     * @param {string} lang  @param {string} [packId] (unused, kept for call compatibility)
     */
    async say(say, lang) {
      if (!say?.text) return;
      stop();
      const token = generation;
      // API-only mode: never use the unreliable phone fallback.
      try { return Boolean(await speakRemote(say.text, lang, token)); } catch { return false; }
    },
    /** Diagnostics: server voice reachable? how many utterances cached? */
    async diagnose() {
      let serverVoice = null;
      let serverDetail = "";
      if (speakFn) {
        try {
          const ep = typeof speakFn.endpoint === "function" ? speakFn.endpoint() : speakFn.endpoint;
          const base = String(ep).replace(/\/tts\/v1\/speak.*$/, "");
          if (!base || base.includes("__TTS_") || base.includes("__YEKIVA_")) {
            serverDetail = "API non configurée (build sans --api/--key)";
            serverVoice = false;
          } else {
            const r = await fetch(`${base}/health`);
            serverVoice = r.ok;
            if (!r.ok) serverDetail = `l'API répond HTTP ${r.status}`;
          }
        } catch (e) {
          serverVoice = false;
          serverDetail = `API injoignable (${e?.message ?? "réseau"})`;
        }
      } else {
        serverDetail = "API non configurée (build sans --api/--key)";
      }
      let cached = 0;
      try {
        const d = await db();
        if (d) cached = await new Promise((resolve) => {
          try {
            const q = d.transaction(CACHE_STORE, "readonly").objectStore(CACHE_STORE).count();
            q.onsuccess = () => resolve(q.result ?? 0);
            q.onerror = () => resolve(0);
          } catch {
            resolve(0);
          }
        });
      } catch { /* ignore */ }
      return {
        natural: serverVoice, // true = API voice reachable; false = unavailable (no phone fallback)
        serverDetail,
        cached, // utterances stored on-device (offline replay)
        hasSynthesis: false,
        count: 0,
        langs: [],
        picked: {},
      };
    },
    /**
     * Tests son 100 % tactiles (appelables par des boutons, sans console) :
     * testBeep = le haut-parleur sort-il un son ? testServerVoice = l'API vocale répond-elle ?
     * Chacun renvoie { ok, detail } pour affichage à l'écran.
     */
    async testBeep() {
      await ready().catch(() => {});
      const ok = await this.beep(660, 400);
      return ok
        ? { ok: true, detail: "bip entendu = le haut-parleur fonctionne" }
        : { ok: false, detail: "aucun son produit (vérifiez le volume / le mode silencieux)" };
    },
    async testServerVoice(text = "Bonjour", lang = "fr") {
      await ready().catch(() => {});
      const token = generation;
      if (!speakFn) {
        return { ok: false, detail: "voix API absente de cet APK (prévenez le développeur)" };
      }
      // Diagnostic honnête : l'API dit POURQUOI (pas de "clé ? réseau ?" vague).
      if (typeof speakFn.diagnoseSpeak === "function") {
        try {
          const d = await speakFn.diagnoseSpeak(text, lang);
          if (d.ok && d.blob?.size) {
            await playBlob(d.blob, token);
            return { ok: true, detail: "voix de l'API entendue (voix naturelle)" };
          }
          return { ok: false, detail: explainCause(d.cause) };
        } catch (e) {
          return { ok: false, detail: `API injoignable (${e?.message ?? "réseau"})` };
        }
      }
      try {
        const blob = await speakFn(text, lang);
        if (!blob?.size) return { ok: false, detail: "l'API ne renvoie aucun audio (voir « erreurs »)" };
        await playBlob(blob, token);
        return { ok: true, detail: "voix de l'API entendue (voix naturelle)" };
      } catch (e) {
        return { ok: false, detail: `API injoignable (${e?.message ?? "réseau"})` };
      }
    },
    /** Short beep: proves audio output works. Only runs in a browser/WebView (no audio under Node.js). */
    async beep(freq = 660, ms = 300) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        if (ctx.state === "suspended") await ctx.resume().catch(() => {});
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        await sleep(ms);
        o.stop();
        await ctx.close().catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
  };
}
