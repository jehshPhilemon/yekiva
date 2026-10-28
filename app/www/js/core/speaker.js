// The app's voice: the pack's audio file if it exists, otherwise the phone's speech synthesis.
// say() resolves when the voice has finished, so prompts can be chained.
// WARNING: an offline Swahili voice is not guaranteed on the phone: to be tested (hypothesis #1).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createSpeaker({ assetUrl }) {
  let current = null;

  function stop() {
    if (current) {
      current.pause();
      current = null;
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  function playFile(url) {
    return new Promise((resolve) => {
      const a = new Audio(url);
      current = a;
      a.onended = a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }

  function speak(text, lang) {
    if (!("speechSynthesis" in window)) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (lang) u.lang = lang;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(resolve, 8000); // safety net: with no installed voice, the events may never fire
    });
  }

  return {
    stop,
    /** @param {{audio?: string, text?: string}} say  @param {string} lang  @param {string} [packId] used to resolve say.audio */
    async say(say, lang, packId) {
      if (!say) return;
      stop();
      if (say.audio && packId) return playFile(assetUrl(packId, say.audio));
      if (say.text) return speak(say.text, lang);
      await sleep(0);
    },
  };
}
