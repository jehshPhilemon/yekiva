import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { tile } from "../ui/tile.js";

export async function conversationScreen({ services, state, go }) {
  const lang = state.language;
  const labels = lang?.labels?.actions ?? {};
  // NOTE: conversation_* lives at the manifest ROOT (sibling of prompts),
  // merged in packs.js as language.conversation_* (NOT language.prompts.*).
  const prompt = lang?.conversation_hint?.text
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
    h("div", { class: "conversation-guide", role: "button", tabindex: "0", title: "réécouter" }, icon("volume", 34), h("span", {}, prompt)),
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

  // Every status is SHOWN and SPOKEN: the learner may not read (illiterate-first).
  // Guide: mic idle -> explain how to talk; recording -> confirm listening.
  const sayStatus = async (sayObj) => {
    setStatus(sayObj?.text ?? "");
    if (sayObj?.text) await say(sayObj);
  };
  const micError = () => ({
    text: lang?.conversation_mic_error?.text
      ?? "Le microphone ne marche pas. Autorise le micro puis réessaie.",
  });
  const emptyHeard = () => ({
    text: lang?.conversation_empty?.text
      ?? "Je n’ai rien entendu. Parle bien fort près du téléphone, puis appuie encore.",
  });
  mic.addEventListener("click", async () => {
    if (busy) return;
    if (!recording) {
      try {
        await services.recorder.start();
        recording = true;
        mic.classList.add("is-recording");
        const rec = lang?.conversation_recording ?? { text: "Je t’écoute." };
        setStatus(rec.text, true);
        await say(rec);
      } catch (e) {
        const err = micError();
        setStatus(err.text);
        await say(err);
        services.debug?.push?.(`microphone: ${e?.message ?? e}`);
      }
      return;
    }
    recording = false;
    busy = true;
    mic.classList.remove("is-recording");
    // 1. Sending: shown AND spoken (was silent text before).
    const sending = lang?.conversation_sending ?? { text: "J’envoie ton message…" };
    setStatus(sending.text);
    transcript.replaceChildren(h("div", { class: "conversation-bubble is-working" }, sending.text));
    await say(sending);
    try {
      const audio = await services.recorder.stop();
      if (!audio) throw new Error("aucun audio enregistré");
      const result = await services.transcriber.transcribe(audio, language);
      const text = result?.text?.trim();
      // 2. Empty/transcription failure: spoken guidance to repeat (was silent before).
      if (!text) {
        const retry = emptyHeard();
        setStatus(retry.text);
        transcript.replaceChildren(h("div", { class: "conversation-bubble is-working" }, retry.text));
        await say(retry);
        return;
      }
      // 3. What was heard: shown AND spoken (the learner may not read).
      transcript.replaceChildren(h("div", { class: "conversation-bubble is-user" }, text));
      setStatus(text);
      await say({ text });
      // 4. Thinking: shown AND spoken.
      const thinking = lang?.conversation_thinking ?? lang?.conversation_sending ?? { text: "Je réfléchis…" };
      transcript.replaceChildren(
        h("div", { class: "conversation-bubble is-user" }, text),
        h("div", { class: "conversation-bubble is-working" }, thinking.text),
      );
      setStatus(thinking.text);
      await say(thinking);
      // 5. Spark answer: shown AND spoken aloud (the core fix: the reply was text-only).
      const reply = await services.voiceApi.chat(text, language);
      const answer = reply?.text?.trim();
      if (!answer) throw new Error("réponse vide");
      transcript.replaceChildren(
        h("div", { class: "conversation-bubble is-user" }, text),
        h("div", { class: "conversation-bubble is-reply" }, answer),
      );
      const received = lang?.conversation_received ?? { text: "Voici ma réponse." };
      setStatus(`${received.text} ${answer}`.slice(0, 400));
      await say({ text: answer.slice(0, 300) });
    } catch (e) {
      const offline = lang?.conversation_offline ?? { text: "Je n’ai pas pu comprendre le message." };
      setStatus(offline.text);
      await say(offline);
    } finally {
      busy = false;
    }
  });
  screen.destroy = () => {
    services.speaker.stop();
    if (recording) void services.recorder.stop();
  };
  const guideEl = screen.querySelector(".conversation-guide");
  const replayGuide = () => say({ text: prompt });
  guideEl?.addEventListener("click", replayGuide);
  guideEl?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") replayGuide(); });
  // Spoken usage guide on arrival: HOW to talk to the app (was already spoken, kept + replayable).
  queueMicrotask(() => say({ text: prompt }));
  return screen;
}
