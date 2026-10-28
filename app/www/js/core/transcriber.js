// Client of the Yekiva server. Returns the transcribed text, or null (offline, no server, error):
// the caller then falls back to plan B "listen and tap". The server never keeps the audio.
export function createTranscriber({ serverUrl, appToken }) {
  return {
    available: () => Boolean(serverUrl) && navigator.onLine,
    async transcribe(wavBlob, lang) {
      if (!serverUrl || !navigator.onLine) return null;
      try {
        const res = await fetch(`${serverUrl}/v1/transcribe${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`, {
          method: "POST",
          headers: { "content-type": "audio/wav", ...(appToken ? { "x-app-token": appToken } : {}) },
          body: wavBlob,
        });
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.text === "string" ? data.text : null;
      } catch {
        return null;
      }
    },
  };
}
