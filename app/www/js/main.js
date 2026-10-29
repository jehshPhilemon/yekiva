import { createPacks } from "./core/packs.js";
import { createSpeaker } from "./core/speaker.js";
import { createRecorder } from "./core/recorder.js";
import { createTranscriber } from "./core/transcriber.js";
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

const debug = createDebug();
debug.install();
// No console on Termux/phones: ?debug=1 (or #debug) in the URL enables the banner.
try {
  const q = new URLSearchParams(location.search);
  if (q.get("debug") === "1" || location.hash.includes("debug")) setDebug(true);
} catch { /* ignore */ }
debug.mount();

const packs = createPacks();
const learners = new Map();
const transcriber = createTranscriber(config);
const speakFn = (text, lang) => transcriber.speak(text, lang);
speakFn.endpoint = () => `${transcriber.serverUrl}/v1/speak`;
const services = {
  packs,
  // Natural voice: generated at runtime by the server (Meta has no TTS endpoint),
  // cached on-device; the robotic phone voice is only the offline fallback.
  speaker: createSpeaker({ speakFn }),
  recorder: createRecorder(),
  transcriber,
  refreshTranscriber() {
    const fresh = createTranscriber(config);
    this.transcriber = fresh;
    const fn = (text, lang) => fresh.speak(text, lang);
    fn.endpoint = () => `${fresh.serverUrl}/v1/speak`;
    this.speaker = createSpeaker({ speakFn: fn });
    return this.transcriber;
  },
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

// Read-only diagnostics (?debug=1 shows the on-screen banner; no console needed).
window.YEKIVA = {
  async voice() {
    const d = await services.speaker.diagnose();
    console.table(d.langs);
    console.log("picked:", d.picked);
    return d;
  },
  server() {
    console.log("serverUrl:", services.transcriber.serverUrl || "(offline)");
    return services.transcriber.serverUrl;
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
};
