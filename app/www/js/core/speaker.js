// The app's voice: natural Meta TTS generated at RUNTIME inside the app, cached on-device.
// Priority per utterance:
//   1. memory cache (this session)
//   2. IndexedDB cache (previous sessions, offline reuse) — key: lang + text + voice
//   3. Yekiva server POST /v1/speak {text, lang} -> audio (server calls Meta TTS)
//   4. last-resort fallback: the phone's speech synthesis (robotic, offline only)
// Packs carry TEXT ONLY (no pre-generated audio): packs/*.json never reference audio files.
// The voice is chosen per language (env META_TTS_VOICE / META_TTS_VOICES='{"sw":"..."}').
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
  return bestScore > 0 ? best : null;
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
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.dataset.objectUrl = url;
      current = a;
      const done = () => {
        try {
          URL.revokeObjectURL(url);
        } catch { /* ignore */ }
        if (current === a) current = null;
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
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
          u.voice = voice;
          u.lang = voice.lang;
        }
        u.onend = end;
        u.onerror = end;
        s.cancel();
        s.speak(u);
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
      const ok = await speakRemote(say.text, lang);
      if (ok) return;
      return speakLocal(say.text, lang);
    },
    /** Diagnostics: server voice reachable? how many utterances cached? phone voices? */
    async diagnose() {
      const voices = await loadVoices();
      cachedVoices = voices;
      let serverVoice = null;
      if (speakFn) {
        try {
          const ep = typeof speakFn.endpoint === "function" ? speakFn.endpoint() : speakFn.endpoint;
          const r = await fetch(String(ep).replace(/\/v1\/speak.*$/, "/health"));
          serverVoice = r.ok;
        } catch {
          serverVoice = false;
        }
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
        cached, // utterances stored on-device (offline replay)
        hasSynthesis: Boolean(synth()),
        count: voices.length,
        langs: [...new Set(voices.map((v) => v.lang))].sort(),
        picked: { fr: pickVoice(voices, "fr")?.lang ?? null, sw: pickVoice(voices, "sw")?.lang ?? null, ln: pickVoice(voices, "ln")?.lang ?? null },
      };
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
