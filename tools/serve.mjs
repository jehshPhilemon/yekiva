#!/usr/bin/env node
// Minimal static server to try the app in a browser, no Android SDK needed. Zero dependencies.
//   node tools/serve.mjs [port]      then open  http://localhost:8080  in a browser
// "localhost" is a secure context: the microphone (getUserMedia) works there without HTTPS.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../app/www", import.meta.url)));
const port = Number(process.argv[2] ?? 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = join(root, normalize(path));
    if (file !== root && !file.startsWith(root + sep)) throw Object.assign(new Error("forbidden"), { code: 403 });
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 403 ? 403 : 404);
    res.end("not found");
  }
}).listen(port, () => console.log(`Yekiva at http://localhost:${port}  (Ctrl+C to stop)`));
