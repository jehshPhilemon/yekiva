import { createPacks } from "./core/packs.js";
import { createSpeaker } from "./core/speaker.js";
import { createRecorder } from "./core/recorder.js";
import { createTranscriber } from "./core/transcriber.js";
import { LearnerModel } from "./core/learner.js";
import { learnerData, profile } from "./core/storage.js";
import { config } from "./config.js";
import { h } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { startScreen } from "./screens/start.js";
import { languageScreen } from "./screens/language.js";
import { audienceScreen } from "./screens/audience.js";
import { pathScreen } from "./screens/path.js";
import { lessonScreen } from "./screens/lesson.js";

const packs = createPacks();
const learners = new Map();
const services = {
  packs,
  speaker: createSpeaker({ assetUrl: packs.assetUrl }),
  recorder: createRecorder(),
  transcriber: createTranscriber(config),
  learnerFor(code) {
    if (!learners.has(code)) learners.set(code, new LearnerModel({ data: learnerData.load(code) }));
    return learners.get(code);
  },
  saveLearner: (code) => learnerData.save(code, learners.get(code)?.toJSON() ?? {}),
};

const state = { language: null, audience: null };
const screens = { start: startScreen, language: languageScreen, audience: audienceScreen, path: pathScreen, lesson: lessonScreen };
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
    }
    profile.clear();
  }
  go("start");
}
boot();
