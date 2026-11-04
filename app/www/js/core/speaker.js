// The app's voice: natural Meta TTS generated at RUNTIME inside the app, cached on-device.
// Priority per utterance:
//   1. memory cache (this session)
//   2. IndexedDB cache (previous sessions, offline reuse) — key: lang + text + voice
//   3. API Yekiva directe POST /tts/v1/speak {language, text} -> audio
//   4. last-resort fallback: the phone's speech synthesis (robotic, offline only)
// Packs carry TEXT ONLY (no pre-generated audio): packs/*.json never reference audio files.
// The voice is chosen per language (env META_TTS_VOICE / META_TTS_VOICES='{"sw":"..."}').
//
// APK note: inside a Capacitor WebView the Audio element + speechSynthesis both
// work, BUT (a) audio must be unlocked by a user gesture, (b) speechSynthesis
// voices may arrive late/empty, (c) fetch failures must NEVER leave the app
// silent — the phone voice fallback must always run.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BCP47 = { fr: "fr-FR", sw: "sw-KE", ln: "ln-CD", en: "en-US" };
export function bcp47(code) {
  if (!code) return undefined;
  if (code.includes("-")) return code;
  return BCP47[code] ?? code;
}

function synth() {
  try {
    return "speechSynthesis" in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

let cachedVoices = null;
function loadVoices() {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const read = () => { try { return s.getVoices() ?? []; } catch { return []; } };
  const first = read();
  if (first.length) {
    cachedVoices = first;
    return Promise.resolve(first);
  }
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(read()), 1500);
    const on = () => {
      clearTimeout(t);
      cachedVoices = read();
      resolve(cachedVoices);
    };
    try {
      s.onvoiceschanged = on;
    } catch {
      clearTimeout(t);
      resolve(read());
    }
  });
}

function pickVoice(voices, code) {
  if (!voices?.length) return null;
  const target = (bcp47(code) ?? code ?? "").toLowerCase();
  const prefix = (code ?? "").toLowerCase();
  const score = (v) => {
    const l = String(v.lang ?? "").toLowerCase();
    if (l === target) return 3;
    if (target && l.startsWith(target.split("-")[0])) return 2;
    if (prefix && l.startsWith(prefix)) return 2;
    return 0;
  };
  let best = null;
  let bestScore = 0;
  for (const v of voices) {
    const sc = score(v);
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }
  // No exact/prefix match: use the device default voice rather than silence.
  if (!best && voices.length) return voices[0];
  return bestScore > 0 ? best : (voices[0] ?? null);
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
  const mem = new Map(); // session cache: key -> Blob

  // Traduction des causes techniques en phrases pour un testeur sans clavier.
  function explainCause(cause) {
    switch (String(cause ?? "")) {
      case "no-config":
        return "cet APK a été construit sans --api (adresse API manquante) : voix téléphone uniquement";
      case "no-key":
        return "clé API manquante dans cet APK (build sans --key) : l'API répond 401, voix téléphone uniquement";
      case "offline":
        return "téléphone hors-ligne (Wi-Fi/4G coupé) : voix téléphone uniquement";
      case "http-401":
        return "l'API refuse la clé (401) : clé absente ou fausse dans le build, voix téléphone uniquement";
      case "http-422":
        return "l'API refuse le texte ou la langue (422) : voix téléphone, prévenez le développeur";
      case "http-500":
      case "http-502":
      case "http-503":
        return `l'API est en panne (${cause}) : réessayez, voix téléphone en attendant`;
      case "empty":
        return "l'API répond vide : réessayez, voix téléphone en attendant";
      case "empty-text":
        return "rien à dire (texte vide) : erreur interne, prévenez le développeur";
      case "network":
        return "API injoignable (réseau ? adresse fausse ?) : voix téléphone uniquement";
      default:
        return /^http-\d+$/.test(String(cause))
          ? `l'API répond ${String(cause).slice(5)} : voix téléphone, voir « erreurs »`
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
    try {
      synth()?.cancel();
    } catch { /* ignore */ }
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
    await loadVoices();
  }

  function playBlob(blob) {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        try {
          URL.revokeObjectURL(url);
        } catch { /* ignore */ }
        if (current === a) current = null;
        resolve();
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

  /** Last-resort fallback: phone speech synthesis (offline only, robotic). */
  function speakLocal(text, lang, { minMs = 1400 } = {}) {
    const t0 = Date.now();
    const s = synth();
    const finish = async () => {
      const wait = minMs - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
    };
    if (!s || !text) return finish();
    return new Promise((resolve) => {
      let done = false;
      const end = async () => {
        if (done) return;
        done = true;
        await finish();
        resolve();
      };
      try {
        const u = new SpeechSynthesisUtterance(text);
        const tag = bcp47(lang);
        if (tag) u.lang = tag;
        u.rate = 0.9;
        u.pitch = 1;
        const voice = pickVoice(cachedVoices ?? loadVoicesSync(), lang);
        if (voice) {
          try {
            u.voice = voice;
          } catch { /* ignore */ }
          // Keep the requested language tag when the voice is a generic default.
          if (!u.lang || !String(voice.lang ?? "").toLowerCase().startsWith(String(lang ?? "").toLowerCase())) {
            if (tag) u.lang = tag;
            else u.lang = voice.lang;
          } else {
            u.lang = voice.lang;
          }
        }
        u.onend = end;
        u.onerror = end;
        try {
          s.cancel();
        } catch { /* ignore */ }
        // Android WebView quirk: speak() right after cancel() can be swallowed.
        // A tiny delay makes the fallback audible on real devices.
        setTimeout(() => {
          try {
            s.speak(u);
          } catch {
            end();
          }
        }, 60);
        setTimeout(end, Math.max(4000, minMs + 2000));
      } catch {
        end();
      }
    });
  }

  function loadVoicesSync() {
    try {
      return cachedVoices ?? synth()?.getVoices() ?? [];
    } catch {
      return [];
    }
  }

  /** Natural voice: server TTS (Meta) with session + IndexedDB cache. Null when unavailable. */
  async function speakRemote(text, lang) {
    if (!speakFn || !text) return null;
    const key = cacheKey(lang, text);
    if (mem.has(key)) {
      await playBlob(mem.get(key));
      return true;
    }
    const cached = await cacheGet(lang, text);
    if (cached) {
      mem.set(key, cached);
      await playBlob(cached);
      return true;
    }
    let blob = null;
    try {
      blob = await speakFn(text, lang);
    } catch {
      return null;
    }
    if (!blob) return null;
    mem.set(key, blob);
    cachePut(lang, text, blob);
    await playBlob(blob);
    return true;
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
      if (!cachedVoices) await loadVoices().then((v) => { cachedVoices = v; });
      // Natural Meta voice first (runtime, in-app generation); robotic phone voice only as fallback.
      // NEVER stay silent: any remote failure falls through to the phone voice.
      try {
        const ok = await speakRemote(say.text, lang);
        if (ok) return;
      } catch { /* fall through to phone voice */ }
      return speakLocal(say.text, lang);
    },
    /** Diagnostics: server voice reachable? how many utterances cached? phone voices? */
    async diagnose() {
      const voices = await loadVoices();
      cachedVoices = voices;
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
        natural: serverVoice, // true = Meta voice reachable; false/null = robotic fallback or offline
        serverDetail,
        cached, // utterances stored on-device (offline replay)
        hasSynthesis: Boolean(synth()),
        count: voices.length,
        langs: [...new Set(voices.map((v) => v.lang))].sort(),
        picked: { fr: pickVoice(voices, "fr")?.lang ?? null, sw: pickVoice(voices, "sw")?.lang ?? null, ln: pickVoice(voices, "ln")?.lang ?? null },
      };
    },
    /**
     * Tests son 100 % tactiles (appelables par des boutons, sans console) :
     * testBeep = le haut-parleur sort-il un son ? testPhoneVoice = la voix
     * téléphone parle-t-elle ? testServerVoice = l'API vocale répond-elle ?
     * Chacun renvoie { ok, detail } pour affichage à l'écran.
     */
    async testBeep() {
      await ready().catch(() => {});
      const ok = await this.beep(660, 400);
      return ok
        ? { ok: true, detail: "bip entendu = le haut-parleur fonctionne" }
        : { ok: false, detail: "aucun son produit (vérifiez le volume / le mode silencieux)" };
    },
    async testPhoneVoice(lang = "fr") {
      await ready().catch(() => {});
      const voices = await loadVoices().catch(() => []);
      cachedVoices = voices;
      if (!synth()) return { ok: false, detail: "synthèse vocale absente de cet appareil" };
      if (!voices.length) {
        return { ok: false, detail: "aucune voix installée : installez « synthèse vocale Google »" };
      }
      try {
        await speakLocal("Bonjour, vous m'entendez ?", lang, { minMs: 800 });
        return { ok: true, detail: `voix téléphone OK (${voices.length} voix, ex. ${voices[0]?.lang ?? "?"})` };
      } catch (e) {
        return { ok: false, detail: `voix téléphone en échec (${e?.message ?? "?"})` };
      }
    },
    async testServerVoice(text = "Bonjour", lang = "fr") {
      await ready().catch(() => {});
      if (!speakFn) {
        return { ok: false, detail: "voix API absente de cet APK (prévenez le développeur)" };
      }
      // Diagnostic honnête : l'API dit POURQUOI (pas de "clé ? réseau ?" vague).
      if (typeof speakFn.diagnoseSpeak === "function") {
        try {
          const d = await speakFn.diagnoseSpeak(text, lang);
          if (d.ok && d.blob?.size) {
            await playBlob(d.blob);
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
        await playBlob(blob);
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
