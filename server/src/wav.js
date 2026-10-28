// Checks the WAV header Meta requires for file uploads: 16-bit PCM, mono, 16 or 24 kHz.
// (Source: Meta Model API documentation relayed by a third party, read 2026-10-27: to be re-verified.)
export function checkWav(buf) {
  if (buf.length < 44) return "file too short to be a WAV";
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return "not a WAV file";
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      const format = buf.readUInt16LE(off + 8);
      const channels = buf.readUInt16LE(off + 10);
      const rate = buf.readUInt32LE(off + 12);
      const bits = buf.readUInt16LE(off + 22);
      if (format !== 1) return "WAV non PCM";
      if (channels !== 1) return "WAV must be mono";
      if (bits !== 16) return "WAV must be 16-bit";
      if (rate !== 16000 && rate !== 24000) return `sample rate ${rate} Hz rejected (16000 or 24000 expected)`;
      return null;
    }
    off += 8 + size + (size % 2);
  }
  return "WAV header without a 'fmt ' chunk";
}

/** Builds a valid (silent) WAV: useful for tests and for probing the API. */
export function makeWav({ rate = 16000, seconds = 0.1 } = {}) {
  const samples = Math.floor(rate * seconds);
  const data = Buffer.alloc(samples * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
