import { createServer } from "node:http";
import * as meta from "./providers/meta.js";
import * as voice from "./voice.js";
import { checkWav } from "./wav.js";

const MAX_BYTES = 5 * 1024 * 1024; // a word or a photo, not a film
const MAX_SPEAK_TEXT = 64 * 1024; // JSON prompt, not a film either

/** Simple in-memory limiter: at most `limit` requests per minute per IP. */
function makeLimiter(limit) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length <= limit;
  };
}

function readBody(req, max = MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > max) {
        reject(Object.assign(new Error("payload too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function makeApp({ appToken = "", provider = meta, ratePerMinute = 30, allowOrigin = "*" } = {}) {
  const allow = makeLimiter(ratePerMinute);

  return createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": allowOrigin });
      res.end(JSON.stringify(body));
    };
    const sendAudio = (wav) => {
      res.writeHead(200, {
        "content-type": "audio/wav",
        "content-length": wav.length,
        "access-control-allow-origin": allowOrigin,
        "cache-control": "no-store",
      });
      res.end(wav);
    };
    try {
      const url = new URL(req.url, "http://local");
      if (req.method === "OPTIONS") {
        // CORS preflight: the app (capacitor / localhost) does not share the server's origin.
        res.writeHead(204, {
          "access-control-allow-origin": allowOrigin,
          "access-control-allow-methods": "POST, GET, OPTIONS",
          "access-control-allow-headers": "content-type, x-app-token",
          "access-control-max-age": "86400",
        });
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/health") return send(200, { ok: true });
      // Capability probe (no synthesis): the app shows "natural voice" vs "phone voice".
      if (req.method === "GET" && url.pathname === "/v1/voice") return send(200, { ok: true, engine: "piper", voices: ["fr", "sw"] });

      if (appToken && req.headers["x-app-token"] !== appToken) return send(401, { error: "unauthorized" });
      if (!allow(req.socket.remoteAddress ?? "?")) return send(429, { error: "too many requests" });

      const lang = url.searchParams.get("lang") ?? undefined;
      const contentType = req.headers["content-type"] ?? "";

      if (req.method === "POST" && url.pathname === "/v1/speak") {
        // Natural voice at request time: { text, lang? } -> audio/wav (Piper, on this server).
        if (!contentType.includes("application/json")) return send(415, { error: "application/json expected: { text, lang? }" });
        let body;
        try {
          body = JSON.parse(String(await readBody(req, MAX_SPEAK_TEXT)));
        } catch {
          return send(400, { error: "invalid JSON" });
        }
        if (typeof body.text !== "string" || !body.text.trim()) return send(400, { error: "field 'text' is required" });
        return sendAudio(voice.speak(body.text, { lang: body.lang ?? lang }));
      }

      if (req.method === "POST" && url.pathname === "/v1/transcribe") {
        if (!/^audio\/(x-)?wav(e)?\b/.test(contentType)) return send(415, { error: "audio/wav expected (16-bit mono PCM, 16 or 24 kHz)" });
        const audio = await readBody(req);
        if (audio.length === 0) return send(400, { error: "empty body" });
        const problem = checkWav(audio);
        if (problem) return send(422, { error: problem });
        return send(200, await provider.transcribe(audio, { lang, contentType }));
      }

      if (req.method === "POST" && url.pathname === "/v1/lesson-from-photo") {
        if (!contentType.startsWith("image/")) return send(415, { error: "image/* expected" });
        const image = await readBody(req);
        if (image.length === 0) return send(400, { error: "empty body" });
        return send(200, await provider.lessonFromPhoto(image, { lang, contentType }));
      }

      return send(404, { error: "unknown route" });
    } catch (e) {
      if (e instanceof meta.NotImplementedYet) return send(501, { error: e.message });
      if (e.status) return send(e.status, { error: e.message });
      console.error("server error:", e.message); // never log request contents
      return send(500, { error: "internal error" });
    }
  });
}
