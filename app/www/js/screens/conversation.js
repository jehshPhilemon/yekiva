import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";

export async function conversationScreen({ services, state, go }) {
  const lang = state.language;
  const labels = lang?.labels?.actions ?? {};
  const prompt = lang?.prompts?.conversation_hint?.text
    ?? "Appuie sur le microphone, parle, puis appuie encore pour envoyer ton message.";
  const status = h("div", { class: "conversation-status", role: "status" }, prompt);
  const transcript = h("div", { class: "conversation-transcript", role: "log" });
  const mic = tile("mic", {
    size: 92,
    label: labels.conversation ?? "parler à Yekiva",
    caption: labels.conversation ?? "parler",
    className: "conversation-mic",
  });
  const back = tile("check", {
    size: 38,
    label: labels.back ?? "retour",
    caption: labels.back ?? "retour",
    className: "path-action",
    onClick: () => go("path"),
  });
  const screen = h(
    "div",
    { class: "screen conversation-screen" },
    h("h1", { class: "conversation-title" }, labels.conversationTitle ?? "Parler avec Yekiva"),
    h("div", { class: "conversation-guide" }, icon("volume", 34), h("span", {}, prompt)),
    status,
    h("div", { class: "conversation-mic-wrap" }, mic),
    transcript,
    h("div", { class: "path-actions" }, back),
  );

  let recording = false;
  let busy = false;
  const setStatus = (text, active = false) => {
    status.textContent = text;
    status.classList.toggle("is-recording", active);
  };
  const say = (text) => services.speaker.say({ text }, lang.code, lang.basePackId);
  const language = lang.code;

  mic.addEventListener("click", async () => {
    if (busy) return;
    if (!recording) {
      try {
        await services.recorder.start();
        recording = true;
        mic.classList.add("is-recording");
        setStatus(lang?.prompts?.conversation_recording?.text ?? "Je t’écoute. Appuie encore pour envoyer.", true);
        await say(lang?.prompts?.conversation_recording ?? { text: "Je t’écoute." });
      } catch (e) {
        setStatus("Le microphone n’est pas disponible. Autorise le micro puis réessaie.");
        services.debug?.push?.(`microphone: ${e?.message ?? e}`);
      }
      return;
    }
    recording = false;
    busy = true;
    mic.classList.remove("is-recording");
    setStatus(lang?.prompts?.conversation_sending?.text ?? "J’envoie ton message…");
    try {
      const audio = await services.recorder.stop();
      if (!audio) throw new Error("aucun audio enregistré");
      const result = await services.transcriber.transcribe(audio, language);
      const text = result?.text?.trim();
      if (!text) throw new Error("transcription vide");
      transcript.replaceChildren(h("div", { class: "conversation-bubble" }, text));
      const received = lang?.prompts?.conversation_received?.text ?? "J’ai bien reçu ton message.";
      setStatus(received);
      await say({ text: `${received} ${text}`.slice(0, 300) });
    } catch (e) {
      const offline = lang?.prompts?.conversation_offline?.text ?? "Je n’ai pas pu comprendre le message. Vérifie la connexion et réessaie.";
      setStatus(offline);
      await say({ text: offline });
    } finally {
      busy = false;
    }
  });
  screen.destroy = () => {
    services.speaker.stop();
    if (recording) void services.recorder.stop();
  };
  queueMicrotask(() => say({ text: prompt }));
  return screen;
}
