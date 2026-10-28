// Microphone: records (MediaRecorder), then converts to mono 16-bit 16 kHz WAV, the format Meta accepts.
import { encodeWav } from "./wav.js";

async function blobToWav16k(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination); // the stereo -> mono downmix is done by the browser
  src.start();
  const rendered = await off.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0), 16000)], { type: "audio/wav" });
}

export function createRecorder() {
  let stream = null;
  let mr = null;
  let chunks = [];
  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.start();
    },
    /** @returns {Promise<Blob|null>} WAV, or null if nothing was recorded */
    stop() {
      return new Promise((resolve) => {
        if (!mr || mr.state === "inactive") return resolve(null);
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          if (chunks.length === 0) return resolve(null);
          try {
            resolve(await blobToWav16k(new Blob(chunks, { type: mr.mimeType })));
          } catch {
            resolve(null);
          }
        };
        mr.stop();
      });
    },
  };
}
