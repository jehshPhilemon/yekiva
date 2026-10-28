// On-device data, no account. Everything is guarded: storage may be unavailable.
const get = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or forbidden: carry on without saving */
  }
};

export const profile = {
  load: () => get("yekiva.profile", null), // { language, audience }
  save: (p) => set("yekiva.profile", p),
  clear: () => {
    try {
      localStorage.removeItem("yekiva.profile");
    } catch {
      /* rien */
    }
  },
};
export const learnerData = {
  load: (lang) => get(`yekiva.learner.${lang}`, {}),
  save: (lang, data) => set(`yekiva.learner.${lang}`, data),
};
export const progress = {
  load: (lang, audience) => get(`yekiva.progress.${lang}.${audience}`, {}),
  save: (lang, audience, data) => set(`yekiva.progress.${lang}.${audience}`, data),
};
