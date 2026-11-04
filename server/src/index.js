// The server loads server/.env by itself (tolerates BOM, "export", quotes,
// surrounding spaces) so `node src/index.js` and `npm start` work without
// --env-file. Explicit process env always wins over the file.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadServerEnv() {
  const here = dirname(fileURLToPath(import.meta.url)); // server/src
  for (const file of [join(here, "..", ".env"), join(here, "..", "..", ".env")]) {
    let text;
    try {
      if (!existsSync(file)) continue;
      text = readFileSync(file, "utf8");
    } catch { continue; }
    for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || m[0].trimStart().startsWith("#")) continue;
      const [, name, value] = m;
      if (name in process.env) continue; // explicit env wins
      process.env[name] = value.replace(/^(["'])(.*)\1$/, "$2").trim();
    }
    return file;
  }
  return null;
}

const envFile = loadServerEnv();
import { makeApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const keyNames = ["YEKIVA_MMS_KEY", "MMS_API_KEY", "TTS_API_KEY", "API_KEY", "X_API_KEY"];
const hasMmsKey = keyNames.some((k) => String(process.env[k] ?? "").trim());
makeApp({ appToken: process.env.APP_TOKEN ?? "" }).listen(port, () => {
  console.log(`yekiva-server listening on :${port} (env: ${envFile ?? "process only"}, MMS key: ${hasMmsKey ? "present" : "MISSING -> /v1/speak will 502"})`);
});
