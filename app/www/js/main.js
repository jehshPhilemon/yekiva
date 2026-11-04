import { createPacks } from "./core/packs.js";
import { createSpeaker } from "./core/speaker.js";
import { createRecorder } from "./core/recorder.js";
import { createVoiceApi } from "./core/voice-api.js";
import { LearnerModel } from "./core/learner.js";
import { learnerData, profile } from "./core/storage.js";
import { config } from "./config.js";
import { h } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { createDebug, debugEnabled, setDebug } from "./core/debug.js";
import { startScreen } from "./screens/start.js";
import { languageScreen } from "./screens/language.js";
import { audienceScreen } from "./screens/audience.js";
import { pathScreen } from "./screens/path.js";
import { lessonScreen } from "./screens/lesson.js";
import { photoScreen } from "./screens/photo.js";
import { serverScreen } from "./screens/server.js";
import { diagScreen } from "./screens/diag.js";

const debug = createDebug();
debug.install();
// Navigateur (Termux/dev) : ?debug=1 (ou #debug) affiche le bandeau.
// APK installée : pas d'URL modifiable — 5 tapes sur le logo "Yekiva"
// (écran d'accueil) ou bouton "erreurs" de l'écran "Son et voix".
try {
  const q = new URLSearchParams(location.search);
  if (q.get("debug") === "1" || location.hash.includes("debug")) setDebug(true);
} catch { /* ignore */ }
debug.mount();

const packs = createPacks();
const learners = new Map();
// L'app appelle l'API Yekiva TTS DIRECTEMENT (aucun serveur intermédiaire) :
// même code dans Termux et dans l'APK. Hors-ligne : speak() -> null ->
// cache IndexedDB puis voix téléphone. Transcription/photo : pas de routes
// API pour l'instant -> plan B offline (écoute+tap, photo expliquée).
const voiceApi = createVoiceApi({ apiUrl: config.apiUrl, apiKey: config.apiKey });
const speakFn = (text, lang) => voiceApi.speak(text, lang);
speakFn.endpoint = () => `${voiceApi.baseUrl}/tts/v1/speak`;
// Transmet le diagnostic honnête (sinon le test 3 retombe sur un message vague).
speakFn.diagnoseSpeak = (text, lang) => voiceApi.diagnoseSpeak(text, lang);
const services = {
  packs,
  // Voix naturelle : API directe, cachée sur l'appareil ; voix téléphone en secours offline.
  speaker: createSpeaker({ speakFn }),
  recorder: createRecorder(),
  transcriber: voiceApi,
  voiceApi,
  learnerFor(code) {
    if (!learners.has(code)) learners.set(code, new LearnerModel({ data: learnerData.load(code) }));
    return learners.get(code);
  },
  saveLearner: (code) => learnerData.save(code, learners.get(code)?.toJSON() ?? {}),
};

const state = { language: null, audience: null };
const screens = {
  start: startScreen,
  language: languageScreen,
  audience: audienceScreen,
  path: pathScreen,
  lesson: lessonScreen,
  photo: photoScreen,
  server: serverScreen,
  diag: diagScreen,
};
const app = document.getElementById("app");
let current = null;

async function go(name, props = {}) {
  try {
    current?.destroy?.();
    services.speaker.stop();
    current = await screens[name]({ services, state, go, ...props });
    app.replaceChildren(current);
  } catch (e) {
    console.error(e);
    debug.push(`écran ${name}: ${e?.message ?? e}`);
    app.replaceChildren(h("div", { class: "screen" }, h("div", { class: "center" }, icon("alert", 120))));
  }
}

// Already set up (language + audience chosen at first launch): go straight to the path.
async function boot() {
  const saved = profile.load();
  if (saved) {
    try {
      const lang = (await packs.loadLanguages()).find((l) => l.code === saved.language);
      if (lang && (lang.tracks[saved.audience] ?? []).length) {
        state.language = lang;
        state.audience = saved.audience;
        return go("path");
      }
    } catch (e) {
      console.error(e);
      debug.push(`démarrage: ${e?.message ?? e}`);
    }
    profile.clear();
  }
  go("start");
}
boot();

// Diagnostics tactiles (écran "Son et voix") + console navigateur (Termux/dev).
window.YEKIVA = {
  async voice() {
    const d = await services.speaker.diagnose();
    console.table(d.langs);
    console.log("picked:", d.picked);
    return d;
  },
  server() {
    console.log("apiUrl:", services.voiceApi.apiUrl || "(offline)");
    return services.voiceApi.apiUrl;
  },
  /** Test mode: YEKIVA.debugOn() shows the error banner; YEKIVA.debugOff() removes it. */
  debugOn() {
    setDebug(true);
    debug.mount();
    console.log("debug: ON (bandeau d'erreurs visible)");
  },
  debugOff() {
    setDebug(false);
    debug.clear();
    debug.unmount();
    console.log("debug: OFF (bandeau retiré)");
  },
  debug(msg) {
    debug.push(msg);
  },
  /** Bascule tactile du bandeau d'erreurs (5 tapes sur le logo, ou écran diag). */
  debugToggle() {
    const on = debug.toggle();
    return on;
  },
};
